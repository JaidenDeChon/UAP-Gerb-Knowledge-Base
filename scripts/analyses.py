#!/usr/bin/env python3
"""Slices and leads queue for the analysis-scout and analysis-writer agents.

    python3 scripts/analyses.py status            # leads by status, slices swept, analyses published
    python3 scripts/analyses.py next-slices K     # hand out K unswept slices, one packet file each
    python3 scripts/analyses.py ingest            # add every scout's leads file to the queue
    python3 scripts/analyses.py next              # the highest-scoring open lead, as JSON
    python3 scripts/analyses.py show ID           # one lead, with any duplicates folded into it
    python3 scripts/analyses.py list [STATUS]     # leads, best first (default: open)
    python3 scripts/analyses.py resolve ID written "Analyses/<Headline>.md"
    python3 scripts/analyses.py resolve ID discarded "<reason>"
    python3 scripts/analyses.py signals LENS [N]  # preview a lens's raw signals without handing out a slice

A *slice* is one scout's share of the vault, seen through one of four lenses:

- links: entity pairs that share many neighbours in the link graph but never
  link each other, never appear in the same video summary, and are never
  named within a few paragraphs of each other in any transcript. These are the
  near misses where a connection may exist that no video made.
- accounts: people, events and operations covered by three or more videos,
  whose accounts can be compared for contradictions.
- timeline: dated sentences for one decade, led by month-precise dates that
  pages from unrelated videos share.
- patterns: batches of Events and Operations pages to read for a mechanism
  that repeats across unrelated cases.

Swept items are recorded, so new videos produce new slices and nothing is
swept twice. The queue lives in `UAP Gerb Knowledge Base/.analyses.json`;
packets and scouts' leads files pass through the gitignored `.analysis_inbox/`.
"""

from __future__ import annotations

import bisect
import json
import math
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VAULT = ROOT / "UAP Gerb Knowledge Base"
LEDGER = VAULT / ".analyses.json"
INBOX = ROOT / ".analysis_inbox"

ENTITY_DIRS = ["People", "Organizations", "Operations", "Events", "Locations", "Concepts"]
# Concepts make good shared neighbours but dull pairs ("Reverse Engineering" touches everything).
PAIR_DIRS = {"People", "Organizations", "Operations", "Events", "Locations"}
ACCOUNT_DIRS = {"People", "Events", "Operations"}
PATTERN_DIRS = ["Events", "Operations"]
KINDS = {"hidden-link", "timeline", "contradiction", "pattern"}
LENSES = ["links", "accounts", "timeline", "patterns"]

LINKS_PER_SLICE = 20
# Leads of the same kind whose entity sets overlap at least this much (Jaccard) fold together.
# Roswell, the IPU and a few people recur everywhere, so this has to be high.
DUPLICATE_OVERLAP = 0.75
# An accounts slice takes subjects until their videos add up to this many passages to compare.
ACCOUNTS_PASSAGES_PER_SLICE = 40
PATTERNS_PER_SLICE = 18
DECADES = [f"{d}s" for d in range(1940, 2030, 10)]
# Two names closer than this in a transcript count as Gerb having put them together.
NEAR_CHARS = 2000

LINK_RE = re.compile(r"\[\[([^\]|#]+)")
YEAR_RE = re.compile(r"\b(19[0-9]{2}|20[0-2][0-9])\b")
MONTHS = "January February March April May June July August September October November December".split()
MONTH_RE = re.compile(r"\b(" + "|".join(MONTHS) + r")\s+(?:\d{1,2},?\s+)?((?:19|20)\d\d)\b")
ISO_MONTH_RE = re.compile(r"\b((?:19|20)\d\d)-(0[1-9]|1[0-2])\b")
SENTENCE_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'(\[])")


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


# ------------------------------------------------------------------ vault --


def body(path: Path) -> str:
    """Page text without frontmatter or `::wiki-*` component blocks."""
    text = path.read_text(encoding="utf-8")
    if text.startswith("---"):
        parts = text.split("---", 2)
        text = parts[2] if len(parts) == 3 else text
    out, depth = [], 0
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("::wiki-"):
            depth += 1
            continue
        if depth and stripped == "::":
            depth -= 1
            continue
        if not depth:
            out.append(line)
    return "\n".join(out)


def clean_name(name: str) -> str:
    """`Bob Lazar (physicist)` -> `bob lazar`: the form a transcript would say."""
    return re.sub(r"\s*\(.*\)$", "", name).strip().lower()


class Vault:
    def __init__(self) -> None:
        self.entities: dict[str, Path] = {}
        for folder in ENTITY_DIRS:
            for page in sorted((VAULT / folder).glob("*.md")):
                self.entities[page.stem] = page
        self.folder = {name: path.parent.name for name, path in self.entities.items()}
        self.summaries = {p.parent.name: p for p in sorted((VAULT / "Videos").glob("*/summary.md"))}
        self.transcripts = {p.parent.name: p for p in sorted((VAULT / "Videos").glob("*/transcript.md"))}
        self.analyses = sorted((VAULT / "Analyses").glob("*.md")) if (VAULT / "Analyses").exists() else []

        self.out: dict[str, set[str]] = {}
        for name, path in self.entities.items():
            self.out[name] = self.links_in(path) - {name}
        self.videos_of: dict[str, set[str]] = defaultdict(set)
        for video, path in self.summaries.items():
            for name in self.links_in(path):
                self.videos_of[name].add(video)
        self.adj: dict[str, set[str]] = defaultdict(set)
        for a, targets in self.out.items():
            for b in targets:
                self.adj[a].add(b)
                self.adj[b].add(a)

    def links_in(self, path: Path) -> set[str]:
        found = {m.strip() for m in LINK_RE.findall(path.read_text(encoding="utf-8"))}
        return found & self.entities.keys()

    def rel(self, path: Path) -> str:
        return str(path.relative_to(VAULT))


# ------------------------------------------------------------------ lenses --


def transcript_positions(vault: Vault, names: set[str]) -> dict[str, dict[str, list[int]]]:
    """name -> video -> sorted offsets where the transcript says the name."""
    texts = {v: p.read_text(encoding="utf-8").lower() for v, p in vault.transcripts.items()}
    out: dict[str, dict[str, list[int]]] = {}
    for name in names:
        spoken = clean_name(name)
        if len(spoken) < 4:
            continue
        pattern = re.compile(r"\b" + re.escape(spoken) + r"\b")
        hits = {}
        for video, text in texts.items():
            offsets = [m.start() for m in pattern.finditer(text)]
            if offsets:
                hits[video] = offsets
        out[name] = hits
    return out


def said_together(pos: dict[str, dict[str, list[int]]], a: str, b: str) -> bool:
    for video, offs_a in pos.get(a, {}).items():
        offs_b = pos.get(b, {}).get(video)
        if not offs_b:
            continue
        for x in offs_a:
            i = bisect.bisect_left(offs_b, x)
            for j in (i - 1, i):
                if 0 <= j < len(offs_b) and abs(offs_b[j] - x) <= NEAR_CHARS:
                    return True
    return False


def near_misses(vault: Vault) -> list[dict]:
    """Unlinked entity pairs ranked by Adamic-Adar over shared neighbours."""
    candidates: Counter = Counter()
    for z, neighbours in vault.adj.items():
        if len(neighbours) < 2:
            continue
        weight = 1 / math.log(len(neighbours) + 1)
        pairable = sorted(n for n in neighbours if vault.folder.get(n) in PAIR_DIRS)
        if len(pairable) > 150:  # a hub this size says nothing about any one pair
            continue
        for a, b in combinations(pairable, 2):
            candidates[(a, b)] += weight
    ranked = [
        (pair, score) for pair, score in candidates.most_common()
        if pair[1] not in vault.adj[pair[0]] and not (vault.videos_of[pair[0]] & vault.videos_of[pair[1]])
    ][:600]
    pos = transcript_positions(vault, {n for pair, _ in ranked for n in pair})
    out = []
    for (a, b), score in ranked:
        if said_together(pos, a, b):
            continue
        shared = sorted(vault.adj[a] & vault.adj[b])
        out.append({
            "key": f"{a}|{b}",
            "a": a, "b": b,
            "score": round(score, 3),
            "shared": shared,
            "videos_a": sorted(vault.videos_of[a]),
            "videos_b": sorted(vault.videos_of[b]),
        })
    return out


def multi_video(vault: Vault) -> list[dict]:
    rows = [
        {"key": name, "name": name, "page": vault.rel(vault.entities[name]), "videos": sorted(vault.videos_of[name])}
        for name in vault.entities
        if vault.folder[name] in ACCOUNT_DIRS and len(vault.videos_of[name]) >= 3
    ]
    return sorted(rows, key=lambda r: (-len(r["videos"]), r["name"]))


def video_set(vault: Vault, path: Path) -> frozenset[str]:
    if path.name == "summary.md":
        return frozenset({path.parent.name})
    return frozenset(vault.videos_of.get(path.stem, set()))


def dated_sentences(vault: Vault, decade: str) -> tuple[list[dict], list[dict]]:
    """(sentences naming a year in the decade, month-level clusters across unrelated videos)."""
    start = int(decade[:4])
    pages = list(vault.entities.values()) + list(vault.summaries.values())
    seen: set[str] = set()
    sentences: list[dict] = []
    months: dict[str, list[dict]] = defaultdict(list)
    for path in pages:
        source = vault.rel(path)
        for paragraph in body(path).split("\n"):
            for sentence in SENTENCE_RE.split(paragraph.strip()):
                sentence = sentence.strip().lstrip("-*> ").strip()
                years = {int(y) for y in YEAR_RE.findall(sentence)}
                in_decade = sorted(y for y in years if start <= y < start + 10)
                if not in_decade or len(sentence) > 600:
                    continue
                key = sentence.lower()
                if key in seen:
                    continue
                seen.add(key)
                row = {"year": in_decade[0], "source": source, "text": sentence}
                sentences.append(row)
                stamps = {f"{y}-{MONTHS.index(m) + 1:02d}" for m, y in MONTH_RE.findall(sentence)}
                stamps |= {f"{y}-{m}" for y, m in ISO_MONTH_RE.findall(sentence)}
                for stamp in stamps:
                    if start <= int(stamp[:4]) < start + 10:
                        months[stamp].append({**row, "videos": video_set(vault, path)})
    clusters = []
    for stamp, rows in sorted(months.items()):
        sets = {r["videos"] for r in rows}
        # A coincidence needs pages that come from videos sharing nothing.
        if any(not (x & y) for x, y in combinations(sets, 2)):
            clusters.append({"month": stamp, "rows": [{k: v for k, v in r.items() if k != "videos"} for r in rows]})
    return sorted(sentences, key=lambda r: (r["year"], r["source"])), clusters


def pattern_pages(vault: Vault) -> list[dict]:
    return [
        {"key": name, "page": vault.rel(path), "videos": len(vault.videos_of[name])}
        for name, path in vault.entities.items()
        if vault.folder[name] in PATTERN_DIRS
    ]


# ------------------------------------------------------------------ ledger --


def load() -> dict:
    if LEDGER.exists():
        return json.loads(LEDGER.read_text(encoding="utf-8"))
    return {"slices": {}, "leads": []}


def save(ledger: dict) -> None:
    LEDGER.write_text(json.dumps(ledger, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def swept(ledger: dict, lens: str) -> set[str]:
    """Items already swept, or handed out and not yet ingested, for a lens."""
    return {i for s in ledger["slices"].values() if s["lens"] == lens for i in s["items"]}


def score(lead: dict) -> int:
    return lead.get("surprise", 0) * lead.get("support", 0)


# ----------------------------------------------------------------- packets --


def packet_links(vault: Vault, rows: list[dict]) -> str:
    lines = [
        "Each pair below shares neighbours in the link graph, but neither page links the other,",
        "no video summary links both, and no transcript names them within a few paragraphs of",
        "each other. Find out whether a real connection exists that no video made.",
        "",
    ]
    for r in rows:
        lines.append(f"## {r['a']}  <->  {r['b']}   (score {r['score']})")
        lines.append(f"- {vault.rel(vault.entities[r['a']])}  | videos: {'; '.join(r['videos_a']) or 'none'}")
        lines.append(f"- {vault.rel(vault.entities[r['b']])}  | videos: {'; '.join(r['videos_b']) or 'none'}")
        lines.append(f"- shared neighbours: {', '.join(r['shared'])}")
        lines.append("")
    return "\n".join(lines)


def packet_accounts(vault: Vault, rows: list[dict]) -> str:
    lines = [
        "Each entry below is covered by three or more videos. Compare what each video, and the",
        "entity page, says about it: names, dates, places, sequence, numbers, who said what.",
        "Disagreements are leads; so are details one video gives that change the meaning of another.",
        "",
    ]
    for r in rows:
        lines.append(f"## {r['name']}  ({len(r['videos'])} videos)")
        lines.append(f"- page: {r['page']}")
        for video in r["videos"]:
            lines.append(f"- Videos/{video}/summary.md  +  transcript.md")
        lines.append("")
    return "\n".join(lines)


def packet_timeline(decade: str, sentences: list[dict], clusters: list[dict]) -> str:
    lines = [
        f"Dated sentences from entity pages and video summaries for the {decade}.",
        "First, month-precise dates shared by pages drawn from videos that have nothing in common.",
        "Then every dated sentence, by year. Look for events from different videos that line up",
        "in time and place in a way no video points out.",
        "",
        "# Month clusters across unrelated videos",
        "",
    ]
    for c in clusters:
        lines.append(f"## {c['month']}")
        lines.extend(f"- [{r['source']}] {r['text']}" for r in c["rows"])
        lines.append("")
    if not clusters:
        lines.append("(none)\n")
    lines.append("# All dated sentences")
    year = None
    for r in sentences:
        if r["year"] != year:
            year = r["year"]
            lines.append(f"\n## {year}")
        lines.append(f"- [{r['source']}] {r['text']}")
    return "\n".join(lines)


def packet_patterns(rows: list[dict]) -> str:
    lines = [
        "Read every page below in full. Look for a mechanism that repeats across cases that",
        "different videos cover: the same kind of retrieval, cover story, threat, handoff between",
        "agencies, document trail, witness treatment, or anything else that recurs. A pattern",
        "needs three or more cases, and at least two must come from different videos.",
        "",
    ]
    lines.extend(f"- {r['page']}  ({r['videos']} videos)" for r in rows)
    return "\n".join(lines)


# ---------------------------------------------------------------- commands --


def take_passages(rows: list[dict]) -> list[dict]:
    """The first subjects whose videos add up to about one slice's worth of passages (at least one)."""
    taken, total = [], 0
    for r in rows:
        if taken and total + len(r["videos"]) > ACCOUNTS_PASSAGES_PER_SLICE:
            break
        taken.append(r)
        total += len(r["videos"])
    return taken


def cmd_next_slices(k: int) -> None:
    vault, ledger = Vault(), load()
    INBOX.mkdir(exist_ok=True)
    made = []
    pools = {
        "links": lambda: [r for r in near_misses(vault) if r["key"] not in swept(ledger, "links")][:LINKS_PER_SLICE],
        "accounts": lambda: take_passages([r for r in multi_video(vault) if r["key"] not in swept(ledger, "accounts")]),
        "timeline": lambda: [d for d in DECADES if d not in swept(ledger, "timeline")][:1],
        "patterns": lambda: [r for r in pattern_pages(vault) if r["key"] not in swept(ledger, "patterns")][:PATTERNS_PER_SLICE],
    }
    exhausted: set[str] = set()
    turn = len(ledger["slices"])
    while len(made) < k and len(exhausted) < len(LENSES):
        lens = LENSES[turn % len(LENSES)]
        turn += 1
        if lens in exhausted:
            continue
        rows = pools[lens]()
        if not rows:
            exhausted.add(lens)
            continue
        slice_id = f"S{len(ledger['slices']) + 1:03d}-{lens}"
        if lens == "links":
            items, text = [r["key"] for r in rows], packet_links(vault, rows)
        elif lens == "accounts":
            items, text = [r["key"] for r in rows], packet_accounts(vault, rows)
        elif lens == "timeline":
            items = rows
            text = packet_timeline(rows[0], *dated_sentences(vault, rows[0]))
        else:
            items, text = [r["key"] for r in rows], packet_patterns(rows)
        packet = INBOX / f"{slice_id}.packet.md"
        packet.write_text(f"# Slice {slice_id}\n\n{text}\n", encoding="utf-8")
        ledger["slices"][slice_id] = {"lens": lens, "items": items, "handed_out": now(), "ingested": None, "leads": 0}
        made.append({"slice": slice_id, "lens": lens, "packet": str(packet.relative_to(ROOT)),
                     "leads_file": f".analysis_inbox/{slice_id}.leads.json", "size_chars": len(text)})
    save(ledger)
    print(json.dumps(made, indent=2))
    if not made:
        print("ALL SWEPT", file=sys.stderr)


def quote_found(source: Path, quote: str) -> bool:
    squash = lambda s: re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    return bool(quote.strip()) and squash(quote) in squash(source.read_text(encoding="utf-8"))


def cmd_ingest() -> None:
    vault, ledger = Vault(), load()
    files = sorted(INBOX.glob("*.leads.json")) if INBOX.exists() else []
    added = 0
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        slice_id = data.get("slice") or f.name.removesuffix(".leads.json")
        for lead in data.get("leads", []):
            problems = []
            if lead.get("kind") not in KINDS:
                problems.append(f"unknown kind {lead.get('kind')!r}")
            missing = [e for e in lead.get("entities", []) if e not in vault.entities]
            if missing:
                problems.append(f"entities with no page: {missing}")
            for ev in lead.get("evidence", []):
                src = VAULT / ev.get("source", "")
                ev["verified"] = src.is_file() and quote_found(src, ev.get("quote", ""))
            if not any(ev["verified"] for ev in lead.get("evidence", [])):
                problems.append("no evidence quote found verbatim in its source")
            lead_id = f"L{len(ledger['leads']) + 1:04d}"
            ents = set(lead.get("entities", []))
            dup = next(
                (o["id"] for o in ledger["leads"]
                 if o["kind"] == lead.get("kind") and o["status"] in {"open", "written"}
                 and ents and len(ents & set(o["entities"])) / len(ents | set(o["entities"])) >= DUPLICATE_OVERLAP),
                None,
            )
            ledger["leads"].append({
                "id": lead_id, "slice": slice_id, "found_at": now(),
                "status": "duplicate" if dup else "open", "duplicate_of": dup,
                "problems": problems, **lead,
            })
            added += 1
        if slice_id in ledger["slices"]:
            ledger["slices"][slice_id].update(ingested=now(), leads=len(data.get("leads", [])))
        f.unlink()
        packet = INBOX / f"{slice_id}.packet.md"
        if packet.exists():
            packet.unlink()
    save(ledger)
    pending = [s for s, v in ledger["slices"].items() if not v["ingested"]]
    print(f"ingested {len(files)} file(s), {added} lead(s)")
    if pending:
        print(f"slices handed out but not ingested: {', '.join(pending)}")


def with_duplicates(ledger: dict, lead: dict) -> dict:
    dups = [l for l in ledger["leads"] if l.get("duplicate_of") == lead["id"]]
    return {**lead, "duplicates": dups} if dups else lead


def cmd_next() -> None:
    ledger = load()
    open_leads = sorted((l for l in ledger["leads"] if l["status"] == "open"),
                        key=lambda l: (bool(l["problems"]), -score(l), l["id"]))
    if not open_leads:
        print("NO LEADS")
        return
    print(json.dumps(with_duplicates(ledger, open_leads[0]), indent=2, ensure_ascii=False))


def cmd_show(lead_id: str) -> None:
    ledger = load()
    lead = next((l for l in ledger["leads"] if l["id"] == lead_id), None)
    if not lead:
        sys.exit(f"no lead {lead_id}")
    print(json.dumps(with_duplicates(ledger, lead), indent=2, ensure_ascii=False))


def cmd_list(status: str) -> None:
    rows = sorted((l for l in load()["leads"] if l["status"] == status), key=lambda l: (-score(l), l["id"]))
    for l in rows:
        flag = "  [!]" if l["problems"] else ""
        print(f"{l['id']}  {score(l):>2}  {l['kind']:<13} {l['headline']}{flag}")
    print(f"{len(rows)} {status}")


def cmd_resolve(lead_id: str, outcome: str, detail: str) -> None:
    if outcome not in {"written", "discarded"}:
        sys.exit("outcome must be 'written' or 'discarded'")
    ledger = load()
    lead = next((l for l in ledger["leads"] if l["id"] == lead_id), None)
    if not lead:
        sys.exit(f"no lead {lead_id}")
    if outcome == "written" and not (VAULT / detail).is_file():
        sys.exit(f"no such analysis: {detail}")
    lead.update(status=outcome, resolved_at=now(), **({"analysis": detail} if outcome == "written" else {"reason": detail}))
    for dup in ledger["leads"]:
        if dup.get("duplicate_of") == lead_id:
            dup.update(status=outcome, resolved_at=now())
    save(ledger)
    print(f"{lead_id} {outcome}")


def cmd_status() -> None:
    vault, ledger = Vault(), load()
    statuses = Counter(l["status"] for l in ledger["leads"])
    lenses = Counter(s["lens"] for s in ledger["slices"].values() if s["ingested"])
    pending = [s for s, v in ledger["slices"].items() if not v["ingested"]]
    print(f"analyses published: {len(vault.analyses)}")
    print("leads: " + (", ".join(f"{n} {s}" for s, n in sorted(statuses.items())) or "none"))
    print("slices swept: " + (", ".join(f"{n} {l}" for l, n in sorted(lenses.items())) or "none"))
    if pending:
        print(f"slices handed out, not ingested: {', '.join(pending)}")


def cmd_signals(lens: str, n: int) -> None:
    vault = Vault()
    if lens == "links":
        for r in near_misses(vault)[:n]:
            print(f"{r['score']:>6}  {r['a']}  <->  {r['b']}   via {', '.join(r['shared'][:6])}")
    elif lens == "accounts":
        for r in multi_video(vault)[:n]:
            print(f"{len(r['videos']):>3}  {r['name']}")
    elif lens == "timeline":
        for decade in DECADES:
            sentences, clusters = dated_sentences(vault, decade)
            print(f"{decade}: {len(sentences)} dated sentences, {len(clusters)} month clusters")
    elif lens == "patterns":
        print(f"{len(pattern_pages(vault))} Events and Operations pages")
    else:
        sys.exit(f"lens must be one of {LENSES}")


def main(argv: list[str]) -> None:
    if not argv:
        sys.exit(__doc__)
    cmd, args = argv[0], argv[1:]
    if cmd == "status":
        cmd_status()
    elif cmd == "next-slices":
        cmd_next_slices(int(args[0]) if args else 3)
    elif cmd == "ingest":
        cmd_ingest()
    elif cmd == "next":
        cmd_next()
    elif cmd == "show" and args:
        cmd_show(args[0])
    elif cmd == "list":
        cmd_list(args[0] if args else "open")
    elif cmd == "resolve" and len(args) == 3:
        cmd_resolve(*args)
    elif cmd == "signals" and args:
        cmd_signals(args[0], int(args[1]) if len(args) > 1 else 25)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
