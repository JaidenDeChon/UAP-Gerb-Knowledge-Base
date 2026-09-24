/**
 * Geographic coordinates on vault notes.
 *
 * A Location page may carry `coordinates: [lat, lon]` in its frontmatter
 * (decimal degrees, WGS 84, latitude first — the order Obsidian's map plugins
 * and most gazetteers print). The bake reads it for every note that has one,
 * and `/api/resolve` returns it on the note's ref, which is how `::wiki-map`
 * places a pin without the author repeating the numbers in YAML.
 *
 * Pure — no Nuxt runtime — so it is unit-tested directly.
 */

/** `[latitude, longitude]` in decimal degrees. */
export type LatLon = [number, number]

function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const t = value.trim().replace(/^["']|["']$/g, '')
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return null
  return Number(t)
}

/**
 * Reads a `[lat, lon]` pair from whatever the frontmatter held: an array (of
 * numbers or numeric strings) or the raw inline string `[40.2, -79.4]` /
 * `40.2, -79.4`. Anything else, or a latitude outside ±90 / longitude outside
 * ±180, is `null`: a bad value must never place a pin somewhere plausible.
 */
export function parseCoordinates(raw: unknown): LatLon | null {
  let parts: unknown[]
  if (Array.isArray(raw)) {
    parts = raw
  }
  else if (typeof raw === 'string') {
    const t = raw.trim().replace(/^\[/, '').replace(/\]$/, '')
    parts = t.split(',')
  }
  else {
    return null
  }
  if (parts.length !== 2) return null
  const lat = num(parts[0])
  const lon = num(parts[1])
  if (lat === null || lon === null) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return [lat, lon]
}
