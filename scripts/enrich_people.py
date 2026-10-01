#!/usr/bin/env python3
"""Queue for the person-enricher agent.

    python3 scripts/enrich_people.py next     # print the next People page to enrich
    python3 scripts/enrich_people.py status   # counts: enriched, remaining
    python3 scripts/enrich_people.py rank N   # the N most-connected People pages

The queue is every page in `People/` not yet in `.rich_people.json`, most
connected first: the most video summaries linking to the person, then the
most links from any page. Transcripts and templates don't count.
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
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
