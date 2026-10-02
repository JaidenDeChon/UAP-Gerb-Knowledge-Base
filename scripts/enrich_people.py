#!/usr/bin/env python3
"""Queue for the person-enricher agent.

    python3 scripts/enrich_people.py next     # print the next People page to enrich
    python3 scripts/enrich_people.py status   # counts: enriched, remaining
    python3 scripts/enrich_people.py rank N   # the N most-connected People pages
    python3 scripts/enrich_people.py top P    # the top P percent by combined score, as page paths

The queue is every page in `People/` not yet in `.rich_people.json`, most
connected first: the most video summaries linking to the person, then the
most links from any page. Transcripts and templates don't count.

`top` ranks by a combined score instead: the average of each person's
percentile on three measures, weighted equally:
- content: words in the page body;
- connections: pages that link to the person;
- mentions: video transcripts that say the person's full name.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VAULT = ROOT / "UAP Gerb Knowledge Base"
LEDGER = VAULT / ".rich_people.json"

LINK_RE = re.compile(r"\[\[([^\]|#]+)")


def people() -> list[str]:
    return sorted(p.stem for p in (VAULT / "People").glob("*.md"))


def connections() -> tuple[Counter, Counter]:
    """(videos linking to each person, all pages linking to each person)."""
    names = set(people())
    videos: Counter = Counter()
    pages: Counter = Counter()
    for page in VAULT.rglob("*.md"):
        if page.name == "transcript.md" or "_templates" in page.parts:
            continue
        linked = {m.strip() for m in LINK_RE.findall(page.read_text(encoding="utf-8"))} & names
        linked.discard(page.stem)
        for name in linked:
            pages[name] += 1
            if page.name == "summary.md" and "Videos" in page.parts:
                videos[name] += 1
    return videos, pages


def ranked() -> list[tuple[str, int, int]]:
    videos, pages = connections()
    rows = [(name, videos[name], pages[name]) for name in people()]
    return sorted(rows, key=lambda r: (-r[1], -r[2], r[0]))


def body_words(name: str) -> int:
    text = (VAULT / "People" / f"{name}.md").read_text(encoding="utf-8")
    body = text.split("---", 2)[2] if text.startswith("---") else text
    return len(body.split())


def transcript_mentions() -> Counter:
    """Transcripts that say each person's full name (case-insensitive)."""
    texts = [t.read_text(encoding="utf-8").lower() for t in VAULT.rglob("transcript.md")]
    out: Counter = Counter()
    for name in people():
        # Strip a disambiguating "(...)" suffix; a one-word name is too ambiguous to count.
        clean = re.sub(r"\s*\(.*\)$", "", name).lower()
        if " " not in clean:
            continue
        pattern = re.compile(r"\b" + re.escape(clean) + r"\b")
        out[name] = sum(1 for t in texts if pattern.search(t))
    return out


def scored() -> list[tuple[str, float, int, int, int]]:
    """(name, score, words, links, transcript mentions), best first."""
    names = people()
    _, pages = connections()
    mentions = transcript_mentions()
    words = {n: body_words(n) for n in names}

    def pct(values: dict) -> dict:
        ordered = sorted(values.values())
        n = len(ordered)
        # Share of people strictly below, plus half the ties: 0..1.
        return {k: (sum(1 for x in ordered if x < v) + 0.5 * (ordered.count(v) - 1)) / max(n - 1, 1) for k, v in values.items()}

    pw, pl, pm = pct(words), pct({n: pages[n] for n in names}), pct({n: mentions[n] for n in names})
    rows = [(n, (pw[n] + pl[n] + pm[n]) / 3, words[n], pages[n], mentions[n]) for n in names]
    return sorted(rows, key=lambda r: (-r[1], r[0]))


def ledger() -> dict:
    return json.loads(LEDGER.read_text(encoding="utf-8")) if LEDGER.exists() else {}


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else "next"
    done = ledger()
    if cmd == "next":
        for name, _, _ in ranked():
            if name not in done:
                print(f"UAP Gerb Knowledge Base/People/{name}.md")
                return 0
        print("ALL DONE")
        return 0
    if cmd == "status":
        total = len(people())
        enriched = sum(1 for name in people() if name in done)
        print(f"enriched: {enriched}  remaining: {total - enriched}")
        return 0
    if cmd == "rank":
        n = int(argv[2]) if len(argv) > 2 else 20
        for name, v, p in ranked()[:n]:
            mark = "x" if name in done else " "
            print(f"[{mark}] {v:3d} videos  {p:3d} links  {name}")
        return 0
    if cmd == "top":
        share = float(argv[2]) if len(argv) > 2 else 30
        rows = scored()
        count = round(len(rows) * share / 100)
        verbose = "-v" in argv
        for name, score, w, l, m in rows[:count]:
            if verbose:
                mark = "x" if name in done else " "
                print(f"[{mark}] {score:.3f}  {w:5d} words  {l:3d} links  {m:2d} transcripts  {name}")
            else:
                print(f"UAP Gerb Knowledge Base/People/{name}.md")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
