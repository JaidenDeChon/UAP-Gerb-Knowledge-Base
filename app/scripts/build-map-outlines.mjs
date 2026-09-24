// Builds the static outline data behind `::wiki-map` (WikiMap.vue):
//
//   public/geo/world.json      country outlines and lakes
//   public/geo/us-states.json  the borders between US states (lines)
//
// Both use a compact delta-encoded format (see `encodeRing`), decoded to
// GeoJSON in the browser by `decodeOutline` (app/utils/map.ts).
//
// Usage: node scripts/build-map-outlines.mjs
//
// Source data is Natural Earth (public domain), as packaged in TopoJSON by
// Mike Bostock's `world-atlas` and `us-atlas` (ISC), both devDependencies, so
// nothing here is needed at runtime and nothing is fetched from a third party
// when a page renders: the map loads these two files from the site itself.
//
// Resolution is mixed on purpose, to keep the files small while borders line
// up where the videos' maps actually zoom in:
//   - the Americas (every country whose main landmass lies between 170°W
//     and 25°W) come from Natural Earth 1:50m;
//   - everywhere else comes from 1:110m, which is plenty for a world view;
//   - the United States is in world.json at 1:50m, like its neighbours, so
//     their shared borders are one line; us-states.json holds only the lines
//     between states (1:10m), drawn over it.
// Coordinates are snapped to a grid (0.01° for countries, 0.005° for
// states) and consecutive duplicates dropped.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { geoArea } from 'd3-geo'
import { feature, mesh } from 'topojson-client'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const OUT = resolve(__dirname, '../public/geo')

const read = spec => JSON.parse(readFileSync(require.resolve(spec), 'utf8'))

const US_ID = '840'
const inAmericas = (g) => {
  const x = mainLongitude(g)
  return x > -170 && x < -25
}

/**
 * Encodes one ring as a flat list of integers: the first position in grid
 * units (degrees × `scale`), then each later one as a delta from the one
 * before. Consecutive duplicates are dropped; a ring left with fewer than
 * four positions (a closed triangle) is dropped. `decodeOutline` in
 * app/utils/map.ts reverses this.
 */
function encodeRing(ring, scale) {
  const out = []
  let px = null
  let py = null
  for (const [lon, lat] of ring) {
    const x = Math.round(lon * scale)
    const y = Math.round(lat * scale)
    if (x === px && y === py) continue
    if (px === null) out.push(x, y)
    else out.push(x - px, y - py)
    px = x
    py = y
  }
  return out.length >= 8 ? out : null
}

function decodeRing(flat, scale) {
  const ring = []
  let x = 0
  let y = 0
  for (let i = 0; i < flat.length; i += 2) {
    x += flat[i]
    y += flat[i + 1]
    ring.push([x / scale, y / scale])
  }
  return ring
}

let dropped = 0

/**
 * d3-geo reads winding on the sphere: a ring wound the wrong way means
 * "everything but this", and floods the whole map. Snapping a tiny islet to
 * the grid can flip or collapse it, so any polygon whose snapped area comes
 * out larger than a hemisphere is dropped.
 */
function encodeGeometry(geometry, scale) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []
  return polys
    .map((poly) => {
      const rings = poly.map(r => encodeRing(r, scale))
      if (!rings[0]) return null
      const kept = rings.filter(Boolean)
      const area = geoArea({ type: 'Polygon', coordinates: kept.map(r => decodeRing(r, scale)) })
      if (area > 2 * Math.PI) {
        dropped++
        return null
      }
      return kept
    })
    .filter(Boolean)
}

/** Mean longitude of a country's largest polygon, so a country that merely
 * crosses the antimeridian (Russia, Fiji) doesn't count as American. */
function mainLongitude(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const main = polys.reduce((a, b) => (b[0].length > a[0].length ? b : a))
  return main[0].reduce((sum, [x]) => sum + x, 0) / main[0].length
}

function encode(features, scale) {
  return {
    v: 1,
    scale,
    features: features
      .map(f => ({ id: String(f.id ?? ''), n: f.properties?.name ?? '', p: encodeGeometry(f.geometry, scale) }))
      .filter(f => f.p.length),
  }
}

// Natural Earth's country polygons cover inland water, so the lakes are
// drawn over them from Natural Earth's own 1:50m lakes layer, pinned to a
// release tag and cached next to this script (downloaded once, at build
// time only: the site never requests anything from GitHub).
const LAKES_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_lakes.geojson'
const LAKES_CACHE = resolve(__dirname, '.cache/ne_50m_lakes.geojson')
if (!existsSync(LAKES_CACHE)) {
  const res = await fetch(LAKES_URL)
  if (!res.ok) throw new Error(`lakes download failed: ${res.status}`)
  mkdirSync(dirname(LAKES_CACHE), { recursive: true })
  writeFileSync(LAKES_CACHE, await res.text())
}
/** Lakes up to this Natural Earth scale rank (0 = largest) are kept. */
const LAKE_MAX_RANK = 5
const lakes = JSON.parse(readFileSync(LAKES_CACHE, 'utf8')).features
  .filter(f => f.geometry && (f.properties?.scalerank ?? 9) <= LAKE_MAX_RANK)
  .map(f => ({ ...f, id: `lake`, properties: { name: f.properties?.name ?? '' } }))

const w50 = read('world-atlas/countries-50m.json')
const w110 = read('world-atlas/countries-110m.json')
const us = read('us-atlas/states-10m.json')

const fine = feature(w50, w50.objects.countries).features
  .filter(f => f.geometry && (String(f.id) === US_ID || inAmericas(f.geometry)))
const fineNames = new Set(fine.map(f => f.properties.name))
const coarse = feature(w110, w110.objects.countries).features
  .filter(f => f.geometry && !fineNames.has(f.properties.name))

/** Encodes a MultiLineString's lines the same way as rings (no closing check). */
function encodeLines(geometry, scale) {
  return geometry.coordinates
    .map((line) => {
      const out = []
      let px = null
      let py = null
      for (const [lon, lat] of line) {
        const x = Math.round(lon * scale)
        const y = Math.round(lat * scale)
        if (x === px && y === py) continue
        if (px === null) out.push(x, y)
        else out.push(x - px, y - py)
        px = x
        py = y
      }
      return out.length >= 4 ? out : null
    })
    .filter(Boolean)
}

const world = encode([...fine, ...coarse], 100)
// Lakes are features with id "lake", decoded like countries and painted in
// the water colour on top of them.
world.features.push(...encode(lakes, 100).features)
// Only the borders BETWEEN states, as lines: the land, the coast and the
// national border all come from the 1:50m United States in world.json, so
// they meet Mexico and Canada exactly.
const stateLines = mesh(us, us.objects.states, (a, b) => a !== b)
const states = { v: 1, scale: 200, features: [{ id: 'us-states', n: 'US state borders', p: [], l: encodeLines(stateLines, 200) }] }

mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(OUT, 'world.json'), JSON.stringify(world))
writeFileSync(resolve(OUT, 'us-states.json'), JSON.stringify(states))
console.log(`world.json: ${fine.length + coarse.length} countries (${fine.length} at 1:50m), ${lakes.length} lakes`)
console.log(`us-states.json: ${states.features[0].l.length} state border lines`)
console.log(`${dropped} degenerate polygon(s) dropped`)
