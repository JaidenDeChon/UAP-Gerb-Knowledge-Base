import type { WorldPlaces } from '#shared/types/wiki'
import { geo, graph, places, previews } from '#wiki-data'

/**
 * Every placed Location for the `/world` page, with its coordinates, kind,
 * continent and lead (for the preview card). Sorted by name at build time.
 */
export default defineEventHandler((): WorldPlaces => ({
  places: places.placed.map(({ i, t, k }) => {
    const [lat, lon] = geo[i]!
    return {
      path: graph.nodes[i]!.p,
      name: previews[i]?.title ?? graph.nodes[i]!.l,
      lead: previews[i]?.lead ?? '',
      type: t,
      lat,
      lon,
      continent: k,
    }
  }),
}))
