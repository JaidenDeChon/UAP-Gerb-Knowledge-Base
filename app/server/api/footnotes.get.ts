import type { FootnotesLog } from '#shared/types/wiki'
import { footnotes, graph, previews } from '#wiki-data'

/**
 * The running log of footnotes and corrections, for the link on `/analyses`:
 * its path, title and entry count. Null while the vault has no log.
 */
export default defineEventHandler((): FootnotesLog | null => {
  if (!footnotes) return null
  return {
    path: graph.nodes[footnotes.i]!.p,
    title: previews[footnotes.i]?.title ?? graph.nodes[footnotes.i]!.l,
    entries: footnotes.entries,
  }
})
