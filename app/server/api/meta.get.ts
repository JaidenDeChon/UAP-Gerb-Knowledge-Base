import type { NoteMeta, TreeItem } from '#shared/types/wiki'
import { graph, previews, tree, videos } from '#wiki-data'

let videoIdByNode: Map<number, string> | undefined
let transcriptTitles: Map<string, string> | undefined

/** Transcripts stay out of the graph (see wiki/graph.ts), so find them in the tree. */
function transcripts(): Map<string, string> {
  if (transcriptTitles) return transcriptTitles
  transcriptTitles = new Map()
  const walk = (items: TreeItem[], folder: string): void => {
    for (const item of items) {
      if (item.type === 'folder') walk(item.children, item.name)
      else if (item.path.endsWith('/transcript')) transcriptTitles!.set(item.path, `Transcript - ${folder}`)
    }
  }
  walk(tree, '')
  return transcriptTitles
}

/**
 * A note's title and share-card fields, from the vault scan baked into the
 * bundle. The article route renders its shell from this on the server, so a
 * fresh visit gets its first byte without waiting on @nuxt/content's database
 * (seconds on a cold function), and the body loads in the browser.
 */
export default defineEventHandler((event): NoteMeta => {
  const { path } = getQuery(event)
  if (typeof path !== 'string' || !path.startsWith('/wiki/')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
  }

  const index = nodeIndexByPath().get(path)
  if (index !== undefined) {
    videoIdByNode ??= new Map(videos.filter(v => v.id).map(v => [v.i, v.id!]))
    const node = graph.nodes[index]!
    return {
      path: node.p,
      title: previews[index]?.title ?? node.l,
      category: node.c,
      lead: previews[index]?.lead ?? '',
      videoId: videoIdByNode.get(index) ?? null,
    }
  }

  const transcript = transcripts().get(path)
  if (transcript) {
    return { path, title: transcript, category: 'Videos', lead: '', videoId: null }
  }

  throw createError({ statusCode: 404, statusMessage: 'Note not found' })
})
