// Relative rather than the `#shared` alias — see the note in ./graph.ts.
import { CATEGORY_ORDER } from '../shared/types/wiki'
import type { Category, TreeFolder, TreeItem, TreeNote } from '../shared/types/wiki'
import { categoryOf, stemToPath, walkVault } from './vault'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const byName = (a: { name: string }, b: { name: string }) => collator.compare(a.name, b.name)

/**
 * The full vault as a folder tree for the sidebar: a leading `Home` note, then
 * one folder per populated category in `CATEGORY_ORDER`. Videos nest one level
 * deeper (a folder per video title, each holding `Summary`/`Transcript`).
 */
export function buildTree(): TreeItem[] {
  const stems = walkVault()

  const byCategory = new Map<Category, string[]>()
  let home: string | undefined
  for (const stem of stems) {
    const category = categoryOf(stem)
    if (category === 'Root') {
      home = stem
      continue
    }
    let bucket = byCategory.get(category)
    if (!bucket) {
      bucket = []
      byCategory.set(category, bucket)
    }
    bucket.push(stem)
  }

  const roots: TreeItem[] = []
  if (home) roots.push({ type: 'note', name: 'Home', path: stemToPath(home) })

  for (const category of CATEGORY_ORDER) {
    const bucket = byCategory.get(category)
    if (!bucket || bucket.length === 0) continue
    roots.push(category === 'Videos' ? buildVideosFolder(bucket) : buildFlatFolder(category, bucket))
  }

  return roots
}

function buildFlatFolder(category: Category, stems: string[]): TreeFolder {
  const children: TreeNote[] = stems
    .map(stem => ({ type: 'note' as const, name: stem.split('/').pop()!, path: stemToPath(stem) }))
    .sort(byName)
  return { type: 'folder', name: category, id: category, count: children.length, children }
}

function buildVideosFolder(stems: string[]): TreeFolder {
  const byTitle = new Map<string, string[]>()
  for (const stem of stems) {
    const title = stem.split('/')[1]!
    let group = byTitle.get(title)
    if (!group) {
      group = []
      byTitle.set(title, group)
    }
    group.push(stem)
  }

  const folders: TreeFolder[] = []
  let total = 0
  for (const [title, group] of byTitle) {
    const children: TreeNote[] = []
    const summary = group.find(s => s.endsWith('/summary'))
    const transcript = group.find(s => s.endsWith('/transcript'))
    if (summary) children.push({ type: 'note', name: 'Summary', path: stemToPath(summary) })
    if (transcript) children.push({ type: 'note', name: 'Transcript', path: stemToPath(transcript) })
    total += children.length
    folders.push({ type: 'folder', name: title, id: `Videos/${title}`, count: children.length, children })
  }
  folders.sort(byName)

  return { type: 'folder', name: 'Videos', id: 'Videos', count: total, children: folders }
}
