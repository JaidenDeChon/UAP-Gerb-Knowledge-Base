import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// Relative rather than the `#shared` alias — see the note in ./graph.ts. The
// two app utils are pure (no Nuxt runtime), so the bake can share them.
import type { BakedPlaces, GraphNode } from '../shared/types/wiki'
import { decodeOutline, type EncodedOutline, type LatLon } from '../app/utils/map'
import { continentOf, indexCountries } from '../app/utils/world'

/**
 * The outlines `::wiki-map` draws, read here to find each place's country.
 * Resolved against the rootDir first, like `VAULT_DIR`, for the same reason.
 */
function readWorldOutline(): EncodedOutline {
  const candidates = [
    resolve(process.cwd(), 'public/geo/world.json'),
    fileURLToPath(new URL('../public/geo/world.json', import.meta.url)),
  ]
  const file = candidates.find(existsSync) ?? candidates[0]!
  return JSON.parse(readFileSync(file, 'utf8')) as EncodedOutline
}

let countries: ReturnType<typeof indexCountries> | null = null

/**
 * Every Location note for the `/world` page: those with coordinates, with
 * their `location_type` and continent, and those without. Ordered by label,
 * so the page's list needs no sorting of its own.
 */
export function buildPlaces(
  nodes: GraphNode[],
  geo: Record<number, LatLon>,
  locationType: (node: GraphNode) => string | undefined,
): BakedPlaces {
  countries ??= indexCountries(decodeOutline(readWorldOutline()).features)
  const out: BakedPlaces = { placed: [], unplaced: [] }
  const locations = nodes
    .filter(n => n.c === 'Locations')
    .sort((a, b) => a.l.localeCompare(b.l, 'en', { sensitivity: 'base' }))
  for (const node of locations) {
    const at = geo[node.i]
    const k = at ? continentOf(at, countries) : null
    if (at && k) out.placed.push({ i: node.i, t: locationType(node) ?? '', k })
    else out.unplaced.push(node.i)
  }
  return out
}
