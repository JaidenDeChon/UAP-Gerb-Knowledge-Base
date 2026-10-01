import type {
  BakedLinks,
  BakedPortraits,
  BakedPreview,
  BakedVideo,
  Category,
  GraphNode,
  PersonConnection,
  PersonProfile,
  PersonVideo,
} from '../../shared/types/wiki'

/** Categories that never count as a person's connection: videos are listed on their own. */
const NOT_CONNECTIONS = new Set<Category>(['Videos', 'Root'])

export interface PersonSources {
  nodes: GraphNode[]
  links: BakedLinks
  previews: BakedPreview[]
  videos: BakedVideo[]
  portraits: BakedPortraits
}

/**
 * What a People page shows without any authoring, derived from the link
 * graph alone:
 *
 * - `videos`: every video summary that links to the person, oldest published
 *   first (unpublished last, by title).
 * - `connections`: every other entry linked with the person in either
 *   direction, scored by how many of the person's videos link to both. Ties
 *   go to an entry linked both ways, then one-way, then alphabetical.
 *
 * Pure: the route passes the baked `#wiki-data`, the tests pass a toy graph.
 */
export function buildPersonProfile(index: number, sources: PersonSources): PersonProfile {
  const { nodes, links, previews, videos, portraits } = sources
  const videoByNode = new Map(videos.map(v => [v.i, v]))

  const backlinks = links.backlinks[index] ?? []
  const outgoing = links.outgoing[index] ?? []

  const videoNodes = [...new Set([...backlinks, ...outgoing])]
    .filter(i => videoByNode.has(i) && i !== index)

  const personVideos: PersonVideo[] = videoNodes
    .map((i) => {
      const node = nodes[i]!
      const video = videoByNode.get(i)!
      return {
        path: node.p,
        title: previews[i]?.title ?? node.l,
        videoId: video.id,
        published: video.pub,
      }
    })
    .sort((a, b) => {
      if (a.published && b.published) return a.published.localeCompare(b.published) || a.title.localeCompare(b.title)
      if (a.published) return -1
      if (b.published) return 1
      return a.title.localeCompare(b.title)
    })

  const outSet = new Set(outgoing)
  const backSet = new Set(backlinks)
  const videoLinks = videoNodes.map(i => new Set(links.outgoing[i] ?? []))

  const connections: PersonConnection[] = []
  for (const i of new Set([...outgoing, ...backlinks])) {
    const node = nodes[i]
    if (!node || i === index || NOT_CONNECTIONS.has(node.c)) continue
    const shared = videoLinks.reduce((n, set) => n + (set.has(i) ? 1 : 0), 0)
    connections.push({
      path: node.p,
      title: previews[i]?.title ?? node.l,
      category: node.c,
      ...(portraits[i] ? { image: portraits[i] } : {}),
      shared,
      linksTo: outSet.has(i),
      linkedFrom: backSet.has(i),
    })
  }

  const ways = (c: PersonConnection): number => Number(c.linksTo) + Number(c.linkedFrom)
  connections.sort((a, b) => b.shared - a.shared || ways(b) - ways(a) || a.title.localeCompare(b.title))

  const dates = videos.map(v => v.pub).filter((d): d is string => Boolean(d)).sort()
  const channelSpan: [string, string] | null = dates.length ? [dates[0]!, dates[dates.length - 1]!] : null

  return { videos: personVideos, connections, channelVideos: videos.length, channelSpan }
}
