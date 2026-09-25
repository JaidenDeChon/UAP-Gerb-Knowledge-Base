import type { FeatureCollection, MultiLineString, MultiPolygon } from 'geojson'
import { decodeOutline, type EncodedOutline } from '@/utils/map'

/**
 * The Natural Earth outlines bundled in `public/geo/` (see
 * `scripts/build-map-outlines.mjs`), decoded to GeoJSON: every country and
 * lake, and the borders between US states as lines. Shared by `::wiki-map`
 * and the `/world` page.
 */
export interface MapOutlines {
  world: FeatureCollection<MultiPolygon | MultiLineString>
  /** Only the borders between US states, as lines. */
  states: FeatureCollection<MultiPolygon | MultiLineString>
}

let outlinesPromise: Promise<MapOutlines> | null = null

/**
 * Fetched once per page load and shared by every map on it. A failed fetch
 * isn't cached, so the next caller tries again.
 */
export function loadMapOutlines(): Promise<MapOutlines> {
  outlinesPromise ??= Promise.all([
    $fetch<EncodedOutline>('/geo/world.json'),
    $fetch<EncodedOutline>('/geo/us-states.json'),
  ])
    .then(([world, states]) => ({ world: decodeOutline(world), states: decodeOutline(states) }))
    .catch((err) => {
      outlinesPromise = null
      throw err
    })
  return outlinesPromise
}
