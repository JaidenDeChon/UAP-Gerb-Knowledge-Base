#!/usr/bin/env python3
"""Queue, ledger and detail guard for the page-humanizer agent.

The agent rewrites one wiki page at a time with the humanizer skill. This
script picks the page, checks that the rewrite kept every detail, and records
the page as done.

    python3 scripts/humanize_pages.py next             # print the next page to humanize
    python3 scripts/humanize_pages.py status           # counts: done, stale, remaining
    python3 scripts/humanize_pages.py next --articles  # next item in the article-page sweep
    python3 scripts/humanize_pages.py status --articles
    python3 scripts/humanize_pages.py check PAGE       # compare PAGE with its HEAD version
    python3 scripts/humanize_pages.py record PAGE      # mark PAGE as humanized

Paths are relative to the repo root, e.g.
"UAP Gerb Knowledge Base/People/AJ Hartley.md".

The article sweep (`--articles`) covers what a reader sees on a rich video
article: first the app source files that hold the page's UI text (buttons,
tooltips, labels, empty states), then every article listed in
.rich_videos.json. An item counts as done in this sweep only when it was
recorded with the cold-reader rule (see page-humanizer.md), so articles that
were humanized before that rule existed come back once.

For an app source file (.vue or .ts), `check` masks every string literal and
every piece of template text, then requires the rest of the file (the code)
to be unchanged. <style> blocks must be unchanged too.

`check` exits 1 when the rewrite broke a hard rule (frontmatter, headings,
component structure, wikilinks, links, numbers, quotes). It also prints
warnings (capitalised words or italic spans that vanished) for the agent to
review by hand; warnings alone exit 0.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VAULT = ROOT / "UAP Gerb Knowledge Base"
LEDGER = VAULT / ".humanized_pages.json"

# Order of the sweep. Anything not listed comes last, alphabetically.
FOLDER_ORDER = ["Home.md", "MOCs", "Videos", "Events", "Operations",
                "People", "Organizations", "Concepts", "Locations"]
# Verbatim captions, templates and non-page files are never rewritten.
SKIP_NAMES = {"transcript.md"}
SKIP_DIRS = {"_templates", ".obsidian"}

# Inside a ::wiki-* component's YAML body only these keys hold prose.
PROSE_KEYS = {"summary", "significance", "note", "help", "hint", "caption", "text", "via", "estimate"}
# Extra prose keys that only hold prose inside one component: a stat strip's
# `label` is the caption under the number, a chain's or claim block's `label`
# is its heading (or a branch's name), and a claim's `term` is its card tag.
# A map's `label` stays locked: routes match pins by it.
COMPONENT_PROSE_KEYS = {"wiki-stat-strip": {"label"}, "wiki-chain": {"label"},
                        "wiki-claim": {"label", "term"}}
PROSE_KEY_RE = re.compile(r"^(\s*-?\s*)([\w-]+):(.*)$")

# App source files that put text on a rich article page, in sweep order: the
# article's own chrome first, then the components the articles use, then the
# helpers that hold those components' wording.
APP = ROOT / "app" / "app"
ARTICLE_UI = [
    "pages/wiki/[...slug].vue",
    "layouts/default.vue",
    "components/wiki/WikiVideoHero.vue",
    "components/wiki/WikiVideoDock.vue",
    "components/content/WikiWatch.vue",
    "components/content/WikiCue.vue",
    "components/wiki/WikiTocRail.vue",
    "components/wiki/WikiLinkedEntries.vue",
    "components/wiki/WikiFactTable.vue",
    "components/wiki/WikiPersonPortrait.vue",
    "components/wiki/WikiLocalMap.vue",
    "components/content/WikiInfo.vue",
    "components/content/WikiTimeline.vue",
    "components/wiki/TimelineChronometer.vue",
    "utils/timeline.ts",
    "components/content/WikiChain.vue",
    "components/wiki/ChainSequence.vue",
    "utils/chain.ts",
    "components/content/WikiClaim.vue",
    "utils/claim.ts",
    "components/content/WikiCompare.vue",
    "components/wiki/CompareCell.vue",
    "utils/compare.ts",
    "components/content/WikiMap.vue",
    "utils/map.ts",
    "components/content/WikiOrgChart.vue",
    "components/wiki/OrgChartNode.vue",
    "components/content/WikiRoster.vue",
    "components/wiki/DiagramFrame.vue",
    "components/wiki/DiagramToolbar.vue",
    "components/wiki/DiagramDialog.vue",
    "components/app/AppTopBar.vue",
    "components/app/AppSidebar.vue",
    "components/app/AppSidebarTree.vue",
    "components/app/AppCommandPalette.vue",
    "components/app/AppThemeSwitcher.vue",
]
RICH_LEDGER = VAULT / ".rich_videos.json"

WIKILINK_RE = re.compile(r"\[\[[^\]]+\]\]")
URL_RE = re.compile(r"\]\([^)]+\)|https?://\S+")
NUMBER_RE = re.compile(r"(?<![\w.])\d[\d,]*(?:\.\d+)?")
QUOTE_RE = re.compile(r"\"([^\"\n]{3,})\"|“([^”\n]{3,})”")
ITALIC_RE = re.compile(r"(?<![*\w])\*([^*\n]+)\*(?![*\w])|(?<!\w)_([^_\n]+)_(?!\w)")
# Capitalised words mid-sentence: likely names, titles and places. Words that
# open a sentence are skipped because rewording moves them freely.
CAP_RE = re.compile(r"(?<=[\w,;:)\]] )[A-Z][A-Za-z0-9'’.-]*[A-Za-z0-9]\b")


# ---------------------------------------------------------------- queue ---

def all_pages() -> list[Path]:
    def rank(p: Path) -> tuple[int, str]:
        rel = p.relative_to(VAULT)
        head = rel.parts[0]
        idx = FOLDER_ORDER.index(head) if head in FOLDER_ORDER else len(FOLDER_ORDER)
        return idx, str(rel).lower()

    pages = [
        p for p in VAULT.rglob("*.md")
        if p.name not in SKIP_NAMES
        and not any(part in SKIP_DIRS or part.startswith(".") for part in p.relative_to(VAULT).parts)
    ]
    return sorted(pages, key=rank)


def load_ledger() -> dict:
    if LEDGER.exists():
        return json.loads(LEDGER.read_text(encoding="utf-8"))
    return {}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def classify() -> tuple[list[Path], list[Path], list[Path]]:
    """Split pages into (never done, changed since done, done and unchanged)."""
    ledger = load_ledger()
    new, stale, done = [], [], []
    for page in all_pages():
        entry = ledger.get(rel(page))
        if entry is None:
            new.append(page)
        elif entry.get("sha256") != sha(page):
            stale.append(page)
        else:
            done.append(page)
    return new, stale, done


def article_items() -> list[Path]:
    """The article sweep: UI source files, then rich articles newest first."""
    items = [APP / f for f in ARTICLE_UI if (APP / f).is_file()]
    rich = json.loads(RICH_LEDGER.read_text(encoding="utf-8")) if RICH_LEDGER.exists() else {}
    by_id: dict[str, Path] = {}
    for summary in (VAULT / "Videos").rglob("summary.md"):
        m = re.search(r"^video_id:\s*\"?([\w-]+)\"?\s*$", summary.read_text(encoding="utf-8"), re.M)
        if m:
            by_id[m.group(1)] = summary
    order = sorted(rich, key=lambda vid: rich[vid].get("published", ""), reverse=True)
    items += [by_id[vid] for vid in order if vid in by_id]
    return items


def classify_articles() -> tuple[list[Path], list[Path], list[Path]]:
    """Like classify(), for the article sweep: done means recorded with the
    cold-reader rule and unchanged since."""
    ledger = load_ledger()
    new, stale, done = [], [], []
    for item in article_items():
        entry = ledger.get(rel(item))
        if entry is None or not entry.get("cold_reader"):
            new.append(item)
        elif entry.get("sha256") != sha(item):
            stale.append(item)
        else:
            done.append(item)
    return new, stale, done


def cmd_next(articles: bool = False) -> int:
    new, stale, _ = classify_articles() if articles else classify()
    queue = new + stale
    if not queue:
        print("ALL DONE")
        return 0
    print(rel(queue[0]))
    return 0


def cmd_status(articles: bool = False) -> int:
    new, stale, done = classify_articles() if articles else classify()
    print(f"done: {len(done)}  never humanized: {len(new)}  changed since humanized: {len(stale)}")
    return 0


def cmd_record(page: Path) -> int:
    ledger = load_ledger()
    ledger[rel(page)] = {
        "humanized_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sha256": sha(page),
        "cold_reader": True,
    }
    LEDGER.write_text(json.dumps(dict(sorted(ledger.items())), indent=2, ensure_ascii=False) + "\n",
                      encoding="utf-8")
    print(f"recorded {rel(page)}")
    return 0


# ---------------------------------------------------------------- check ---

def split(text: str) -> tuple[str, list[str], str]:
    """Return (frontmatter, locked lines, editable prose).

    Locked lines must survive byte for byte and in order: headings, fences and
    code, component directives, tables' separator rows, and every YAML line in
    a component except the value of a prose key (whose key stays locked).
    """
    frontmatter = ""
    m = re.match(r"\A---\n.*?\n---\n", text, re.DOTALL)
    if m:
        frontmatter, text = m.group(0), text[m.end():]

    locked: list[str] = []
    prose: list[str] = []
    in_code = False
    in_component = False
    component = ""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code = not in_code
            locked.append(line)
            continue
        if in_code:
            locked.append(line)
            continue
        if re.match(r"^:{2,}[\w-]", stripped):
            in_component = True
            component = re.match(r"^:{2,}([\w-]+)", stripped).group(1)
            locked.append(line)
            continue
        if re.match(r"^:{2,}$", stripped):
            in_component = False
            locked.append(line)
            continue
        if in_component:
            pm = PROSE_KEY_RE.match(line)
            if pm and pm.group(2) not in PROSE_KEYS | COMPONENT_PROSE_KEYS.get(component, set()):
                pm = None
            if pm:
                locked.append(f"{pm.group(1)}{pm.group(2)}:")
                # The value's own quotes are YAML syntax, not a quotation.
                prose.append(pm.group(3).strip().removeprefix('"').removesuffix('"'))
            elif line.startswith((" ", "-")) or re.match(r"^[\w-]+:", line) or stripped in ("", "---"):
                locked.append(line)
            else:
                # Markdown slot content inside a component is prose.
                prose.append(line)
            continue
        if stripped.startswith("#") or re.match(r"^\|?\s*:?-{3,}", stripped):
            locked.append(line)
            continue
        prose.append(line)
    return frontmatter, locked, "\n".join(prose)


def facts(prose: str) -> dict[str, Counter]:
    italics = Counter(a or b for a, b in ITALIC_RE.findall(prose))
    quotes = Counter(a or b for a, b in QUOTE_RE.findall(prose))
    bare = WIKILINK_RE.sub(" ", URL_RE.sub(" ", prose))
    return {
        "wikilinks": Counter(WIKILINK_RE.findall(prose)),
        "links": Counter(URL_RE.findall(prose)),
        "numbers": Counter(n.replace(",", "") for n in NUMBER_RE.findall(bare)),
        "quotes": quotes,
        "italics": italics,
        "capitalised": Counter(CAP_RE.findall(bare)),
    }


def show(counter: Counter) -> str:
    return ", ".join(f"{k!r}" + (f" x{v}" if v > 1 else "") for k, v in sorted(counter.items()))


# Comments come first so an apostrophe in a comment never opens a string.
STRING_RE = re.compile(r"//[^\n]*|/\*.*?\*/|'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`", re.S)
# Static attributes whose values a reader sees or hears.
TEXT_ATTR_RE = re.compile(r"(?<![:@\w-])((?:aria-label|aria-description|title|placeholder|alt|label|description)=)\"[^\"]*\"")
TEXT_NODE_RE = re.compile(r">([^<>\"=]*)<")
MUSTACHE_RE = re.compile(r"\{\{.*?\}\}", re.S)
BOUND_ATTR_RE = re.compile(r"((?:[:@#]|v-)[\w:.-]*=)\"([^\"]*)\"")


# Single-word strings that are code, not copy: keyboard keys and the like.
CODE_WORDS = {"Enter", "Escape", "Tab", "Home", "End", "Space", "Backspace", "Delete",
              "PageUp", "PageDown", "Shift", "Control", "Alt", "Meta", "Root"}


def mask_strings(text: str) -> str:
    """Mask the string literals that read as copy: they hold a space or an
    ellipsis, or are one capitalised word. Ids, class names, keys and paths
    stay visible to the check."""
    def one(m: re.Match) -> str:
        if m.group(0).startswith("/"):
            return m.group(0)
        body = m.group(0)[1:-1]
        text = re.sub(r"\$\{[^}]*\}", "", body) if m.group(0)[0] == "`" else body
        prose = (re.search(r"[A-Za-z]", text) and (" " in text.strip() or "…" in text)
                 or (re.fullmatch(r"[A-Z][a-z]+", text) and text not in CODE_WORDS))
        if not prose:
            return m.group(0)
        if m.group(0)[0] == "`":
            # Keep the ${...} expressions visible: they are code.
            return "`" + "§".join(re.findall(r"\$\{[^}]*\}", body)) + "§S§`"
        return "§S§"
    return STRING_RE.sub(one, text)


def mask_text_node(node: str) -> str:
    """Mask the words in a template text node. Its {{ }} expressions are code,
    so they must survive in the same order; the words around them may move."""
    words = re.sub(r"\{\{.*?\}\}", "", node, flags=re.S)
    if not re.search(r"[A-Za-z]", words) and not ("{{" in node and words.strip()):
        return node
    return "§T§" + "".join(re.findall(r"\{\{.*?\}\}", node, flags=re.S))


def mask_code(text: str, vue: bool) -> str:
    """Blank out everything a UI copy edit may change, so what is left is code."""
    if not vue:
        return mask_strings(text)
    out = []
    # Split into top-level blocks; <template> is masked as markup, <script> as code.
    for block in re.split(r"(?=^<(?:template|script|style)\b)", text, flags=re.M):
        if block.startswith("<script"):
            out.append(mask_strings(block))
        elif block.startswith("<template"):
            b = MUSTACHE_RE.sub(lambda m: mask_strings(m.group(0)), block)
            b = BOUND_ATTR_RE.sub(lambda m: m.group(1) + '"' + mask_strings(m.group(2)) + '"', b)
            b = TEXT_ATTR_RE.sub(r'\1"§A§"', b)
            b = TEXT_NODE_RE.sub(lambda m: ">" + mask_text_node(m.group(1)) + "<", b)
            out.append(b)
        else:
            out.append(block)
    return "".join(out)


def cmd_check_code(page: Path, old: str, new: str) -> int:
    vue = page.suffix == ".vue"
    errors: list[str] = []
    if vue:
        styles = lambda t: re.findall(r"^<style\b.*?^</style>", t, re.S | re.M)
        if styles(old) != styles(new):
            errors.append("<style> changed; only user-facing text may change")
    old_code, new_code = mask_code(old, vue).splitlines(), mask_code(new, vue).splitlines()
    if old_code != new_code:
        import difflib
        diff = [l for l in difflib.unified_diff(old_code, new_code, lineterm="", n=0)
                if l.startswith(("+", "-")) and not l.startswith(("+++", "---"))]
        errors.append("code changed outside string literals and template text "
                      "(only user-facing text may change):" + "".join(f"\n    {l}" for l in diff[:20]))
    for e in errors:
        print(f"ERROR {e}")
    if errors:
        return 1
    print("ok (now run the app's tests and typecheck: cd app && npx vitest run && npx vue-tsc --noEmit)")
    return 0


def cmd_check(page: Path) -> int:
    try:
        old = subprocess.run(["git", "show", f"HEAD:{rel(page)}"], cwd=ROOT, check=True,
                             capture_output=True, text=True).stdout
    except subprocess.CalledProcessError:
        print(f"{rel(page)} is not in HEAD; commit it before humanizing.")
        return 1
    new = page.read_text(encoding="utf-8")
    if old == new:
        print("unchanged")
        return 0
    if page.suffix in (".vue", ".ts"):
        return cmd_check_code(page, old, new)

    old_fm, old_locked, old_prose = split(old)
    new_fm, new_locked, new_prose = split(new)
    errors: list[str] = []
    warnings: list[str] = []

    if old_fm != new_fm:
        errors.append("frontmatter changed; it must stay byte for byte")
    if old_locked != new_locked:
        lost = [l for l in old_locked if l not in new_locked]
        added = [l for l in new_locked if l not in old_locked]
        detail = "".join(f"\n    - {l}" for l in lost[:10]) + "".join(f"\n    + {l}" for l in added[:10])
        errors.append("headings, code, component directives or component YAML changed "
                      "(only the values of " + "/".join(sorted(PROSE_KEYS)) + ", plus labels in stat strips, chains and claim blocks and a claim's term, may change):" + (detail or " order differs"))

    before, after = facts(old_prose), facts(new_prose)
    for kind in ("wikilinks", "links", "numbers", "quotes"):
        lost, gained = before[kind] - after[kind], after[kind] - before[kind]
        if lost:
            errors.append(f"{kind} lost: {show(lost)}")
        if gained:
            errors.append(f"{kind} added: {show(gained)}")
    for kind in ("italics", "capitalised"):
        lost = before[kind] - after[kind]
        # A word may survive in a new position (a sentence start, a new
        # case), so warn only when it is gone entirely. Review, not failure.
        lost = Counter({k: v for k, v in lost.items() if k.lower() not in new_prose.lower()})
        if lost:
            warnings.append(f"{kind} no longer present: {show(lost)}")

    for w in warnings:
        print(f"WARNING {w}")
    for e in errors:
        print(f"ERROR {e}")
    if errors:
        return 1
    print("ok" + (" (review the warnings above)" if warnings else ""))
    return 0


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] not in {"next", "status", "check", "record"}:
        print(__doc__)
        return 2
    cmd = argv[1]
    if cmd in ("next", "status"):
        articles = "--articles" in argv[2:]
        return cmd_next(articles) if cmd == "next" else cmd_status(articles)
    if len(argv) != 3:
        print(f"usage: {argv[0]} {cmd} PAGE")
        return 2
    page = (ROOT / argv[2]).resolve()
    if not page.is_file():
        print(f"no such page: {argv[2]}")
        return 2
    return cmd_check(page) if cmd == "check" else cmd_record(page)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
