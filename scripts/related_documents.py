#!/usr/bin/env python3
"""Give every page's Related section links to the documents it relates to.

A document relates to a page when the page links to it anywhere (by its name
or one of its aliases), or when the document's own page links to the page.
Transcriptions are left out.

Only sections headed `## Related Pages` or `## Related` are touched; the
annotated `## Related Programs`, `## Related Cases` and the like are not.
Two layouts of Related section exist in the vault:

- categorised, as the video template has it (`- **People**: [[A]], [[B]]`).
  Documents go on a `- **Documents**:` line, placed after Concepts as in the
  template. A document filed under another category (pages written before
  the Documents folder existed list e.g. the Atomic Energy Act under
  Concepts) is moved onto that line;
- a plain bulleted list of links. Missing documents are appended to it.

Nothing else on the page changes. Run with `--check` to list what would
change without writing.

    python3 scripts/related_documents.py [--check]
"""
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'UAP Gerb Knowledge Base')
DOCS = os.path.join(ROOT, 'Documents')
SKIP_DIRS = {'_templates', 'Transcriptions'}

LINK_RE = re.compile(r'\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]')
SECTION_RE = re.compile(r'(?m)^## Related(?: Pages)?[ \t]*\n')
CATEGORY_RE = re.compile(r'^- \*\*([^*]+)\*\*:\s*(.*)$')
CATEGORY_ORDER = ['People', 'Organizations', 'Locations', 'Concepts', 'Documents', 'Operations', 'Events']


def frontmatter(text):
    m = re.match(r'---\n(.*?)\n---\n', text, re.S)
    return m.group(1) if m else ''


def aliases(text):
    fm = frontmatter(text)
    m = re.search(r'(?m)^aliases:\s*\n((?:\s+-\s.*\n?)+)', fm + '\n')
    if not m:
        return []
    return [a.strip().strip('"\'') for a in re.findall(r'(?m)^\s+-\s(.*)$', m.group(1))]


def pages():
    for root, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.endswith('.md'):
                yield os.path.join(root, f)


def title_of(path):
    """The name a wikilink uses for this page (a video's summary.md goes by its folder)."""
    base = os.path.basename(path)[:-3]
    return os.path.basename(os.path.dirname(path)) if base == 'summary' else base


def section_bounds(text):
    m = SECTION_RE.search(text)
    if not m:
        return None
    nxt = re.search(r'(?m)^#{1,2} ', text[m.end():])
    end = m.end() + nxt.start() if nxt else len(text)
    return m.end(), end


def main():
    check = '--check' in sys.argv
    texts = {p: open(p, encoding='utf-8').read() for p in pages()}

    # Every name (and alias) a page answers to, lower-cased, mapped to its title.
    names = {}
    for p, t in texts.items():
        title = title_of(p)
        path = os.path.relpath(p, ROOT)[:-3]
        for n in [title, path, *aliases(t)]:
            names.setdefault(n.lower(), title)

    documents = {}
    for p, t in texts.items():
        if os.path.dirname(p) == DOCS:
            documents[title_of(p)] = t
    doc_names = {n: names[n] for n in names if names[n] in documents}

    # Pages each document links to, by title.
    doc_targets = {d: {names.get(l.strip().lower()) for l in LINK_RE.findall(t)} for d, t in documents.items()}

    changed = 0
    for p, t in texts.items():
        bounds = section_bounds(t)
        if not bounds:
            continue
        title = title_of(p)
        start, end = bounds
        body = t[start:end]
        linked = {doc_names[l.strip().lower()] for l in LINK_RE.findall(t) if l.strip().lower() in doc_names}
        backlinked = {d for d, targets in doc_targets.items() if title in targets}
        related = (linked | backlinked) - {title}
        if not related:
            continue

        lines = body.rstrip('\n').split('\n')
        categorised = any(CATEGORY_RE.match(l) for l in lines)
        if categorised:
            new_lines, docs_line_items, cats = [], [], {}
            for l in lines:
                m = CATEGORY_RE.match(l)
                if not m:
                    new_lines.append(l)
                    continue
                cat, items = m.group(1).strip(), m.group(2)
                # Split on top-level commas (none fall inside a wikilink's
                # brackets), so plain-text items survive untouched.
                parts = [x.strip() for x in re.split(r',\s*(?![^\[]*\]\])', items) if x.strip()]
                keep = []
                for part in parts:
                    link = LINK_RE.fullmatch(part)
                    target = names.get(link.group(1).strip().lower()) if link else None
                    if target in documents:
                        if target not in docs_line_items:
                            docs_line_items.append(target)
                    else:
                        keep.append(part)
                if cat == 'Documents':
                    cats['Documents'] = None
                    new_lines.append(('__DOCS__', None))
                elif keep:
                    cats[cat] = None
                    new_lines.append(l if len(keep) == len(parts) else f'- **{cat}**: ' + ', '.join(keep))
            for d in sorted(related, key=str.lower):
                if d not in docs_line_items:
                    docs_line_items.append(d)
            docs_line = '- **Documents**: ' + ', '.join(f'[[{d}]]' for d in docs_line_items)
            if 'Documents' in cats:
                new_lines = [docs_line if l == ('__DOCS__', None) else l for l in new_lines]
            else:
                # After the last category that comes before Documents in the template.
                before = CATEGORY_ORDER[:CATEGORY_ORDER.index('Documents')]
                idx = None
                for i, l in enumerate(new_lines):
                    m = CATEGORY_RE.match(l) if isinstance(l, str) else None
                    if m and m.group(1).strip() in before:
                        idx = i
                if idx is None:
                    idx = next((i - 1 for i, l in enumerate(new_lines) if isinstance(l, str) and CATEGORY_RE.match(l)), len(new_lines) - 1)
                new_lines.insert(idx + 1, docs_line)
            new_body = '\n'.join(new_lines)
        else:
            present = {names.get(l.strip().lower()) for l in LINK_RE.findall(body)}
            missing = [d for d in sorted(related, key=str.lower) if d not in present]
            if not missing:
                continue
            # Append after the section's last bullet.
            last = max((i for i, l in enumerate(lines) if l.startswith('- ')), default=len(lines) - 1)
            lines[last + 1:last + 1] = [f'- [[{d}]]' for d in missing]
            new_body = '\n'.join(lines)

        trailing = body[len(body.rstrip('\n')):]
        new_body += trailing
        if new_body == body:
            continue
        changed += 1
        rel = os.path.relpath(p, ROOT)
        print(f'{rel}: {", ".join(sorted(related, key=str.lower))}')
        if not check:
            with open(p, 'w', encoding='utf-8') as fh:
                fh.write(t[:start] + new_body + t[end:])
    print(f'{changed} page(s) {"would change" if check else "changed"}')


if __name__ == '__main__':
    main()
