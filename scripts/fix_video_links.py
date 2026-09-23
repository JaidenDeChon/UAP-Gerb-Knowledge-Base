#!/usr/bin/env python3
"""Rewrite legacy `[[Video - <title>]]` wikilinks to the video's summary note.

Video pages live at `Videos/<title>/summary.md`, so `[[Video - <title>]]`
resolves neither in Obsidian nor in the web app's `/api/resolve`. This rewrites
each one to the vault-relative form the rest of the vault already uses:

    [[Video - X]]          -> [[Videos/X/summary|X]]
    [[Video - X|alias]]    -> [[Videos/X/summary|alias]]
    [[Video - X#anchor]]   -> [[Videos/X/summary#anchor|X]]

The title is matched to a `Videos/` folder exactly, then case-insensitively,
then after folding punctuation, dashes and diacritics. Titles that match no
folder (or match several) are left untouched and reported. transcript.md
files are never edited.

Usage: python3 scripts/fix_video_links.py [--dry-run]
"""
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

VAULT = Path(__file__).resolve().parent.parent / "UAP Gerb Knowledge Base"
LINK_RE = re.compile(r"\[\[Video\s*-\s*([^\]\n|#]+)(#[^\]\n|]+)?(?:\|([^\]\n]+))?\]\]")


def fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "", s)


def build_index():
    folders = [p.parent.name for p in VAULT.glob("Videos/*/summary.md")]
    exact = {f: f for f in folders}
    lower, folded = defaultdict(set), defaultdict(set)
    for f in folders:
        lower[f.lower()].add(f)
        folded[fold(f)].add(f)
    return exact, lower, folded


def match(title, exact, lower, folded):
    if title in exact:
        return exact[title]
    for table, key in ((lower, title.lower()), (folded, fold(title))):
        hits = table.get(key)
        if hits:
            return next(iter(hits)) if len(hits) == 1 else None
    return None


def main():
    dry = "--dry-run" in sys.argv
    exact, lower, folded = build_index()
    unmatched = defaultdict(list)
    fuzzy = {}
    links = files = 0

    for path in sorted(VAULT.rglob("*.md")):
        if path.name == "transcript.md":
            continue
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(VAULT)

        def repl(m):
            nonlocal links
            title = m.group(1).strip()
            anchor = m.group(2) or ""
            alias = (m.group(3) or "").strip() or title
            folder = match(title, exact, lower, folded)
            if folder is None:
                unmatched[title].append(str(rel))
                return m.group(0)
            if folder != title:
                fuzzy[title] = folder
            links += 1
            return f"[[Videos/{folder}/summary{anchor}|{alias}]]"

        new = LINK_RE.sub(repl, text)
        if new != text:
            files += 1
            if not dry:
                path.write_text(new, encoding="utf-8")

    print(f"{'Would rewrite' if dry else 'Rewrote'} {links} links in {files} files.")
    if fuzzy:
        print(f"\n{len(fuzzy)} titles matched a folder only after normalising:")
        for t, f in sorted(fuzzy.items()):
            print(f"  {t!r} -> {f!r}")
    if unmatched:
        n = sum(len(v) for v in unmatched.values())
        print(f"\n{len(unmatched)} titles ({n} links) match no Videos/ folder and were left as-is:")
        for t, where in sorted(unmatched.items()):
            print(f"  {t!r} ({len(where)}x), e.g. {where[0]}")


if __name__ == "__main__":
    main()
