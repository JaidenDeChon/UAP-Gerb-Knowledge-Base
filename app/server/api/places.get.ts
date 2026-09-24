import type { WorldPlaces } from '#shared/types/wiki'
import { geo, graph, places, previews } from '#wiki-data'

/**
 * Every Location for the `/world` page: the placed ones with their
 * coordinates, kind, continent and lead (for the preview card), and the
 * names of those without coordinates. Sorted by name at build time.
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
  unplaced: places.unplaced.map(i => ({
    path: graph.nodes[i]!.p,
    name: previews[i]?.title ?? graph.nodes[i]!.l,
  })),
}))
