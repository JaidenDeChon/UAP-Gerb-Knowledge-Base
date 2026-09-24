#!/usr/bin/env python3
"""Queue, ledger and detail guard for the page-humanizer agent.

The agent rewrites one wiki page at a time with the humanizer skill. This
script picks the page, checks that the rewrite kept every detail, and records
the page as done.

    python3 scripts/humanize_pages.py next             # print the next page to humanize
    python3 scripts/humanize_pages.py status           # counts: done, stale, remaining
    python3 scripts/humanize_pages.py check PAGE       # compare PAGE with its HEAD version
    python3 scripts/humanize_pages.py record PAGE      # mark PAGE as humanized

Paths are relative to the repo root, e.g.
"UAP Gerb Knowledge Base/People/AJ Hartley.md".

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
PROSE_KEYS = {"summary", "significance", "note", "help", "hint"}
PROSE_KEY_RE = re.compile(r"^(\s*-?\s*)(" + "|".join(sorted(PROSE_KEYS)) + r"):(.*)$")

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


def cmd_next() -> int:
    new, stale, _ = classify()
    queue = new + stale
    if not queue:
        print("ALL DONE")
        return 0
    print(rel(queue[0]))
    return 0


def cmd_status() -> int:
    new, stale, done = classify()
    print(f"done: {len(done)}  never humanized: {len(new)}  changed since humanized: {len(stale)}")
    return 0


def cmd_record(page: Path) -> int:
    ledger = load_ledger()
    ledger[rel(page)] = {
        "humanized_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sha256": sha(page),
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
            locked.append(line)
            continue
        if re.match(r"^:{2,}$", stripped):
            in_component = False
            locked.append(line)
            continue
        if in_component:
            pm = PROSE_KEY_RE.match(line)
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
                      "(only summary/significance/note/help/hint values may change):" + (detail or " order differs"))

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
    if cmd == "next":
        return cmd_next()
    if cmd == "status":
        return cmd_status()
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
