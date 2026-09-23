import type { VideoCard } from '#shared/types/wiki'
import { graph, previews, videos } from '#wiki-data'

/**
 * Video summaries, most recently processed first. `?limit=N` trims the list
 * (the home page's "Recently processed" strip); without it, every video.
 */
export default defineEventHandler((event): VideoCard[] => {
  const limit = Number(getQuery(event).limit)
  const list = Number.isInteger(limit) && limit > 0 ? videos.slice(0, limit) : videos

  return list.map(video => ({
    path: graph.nodes[video.i]!.p,
    title: previews[video.i]?.title ?? graph.nodes[video.i]!.l,
    lead: previews[video.i]?.lead ?? '',
    videoId: video.id,
    processedAt: video.at,
    durationSeconds: video.dur,
  }))
})
