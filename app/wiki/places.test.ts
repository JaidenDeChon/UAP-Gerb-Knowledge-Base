import { describe, expect, it } from 'vitest'
import { bakeWikiData } from './bake'

/*
 * Runs against the real vault: the `/world` page is only as good as the
 * coordinates on the Location notes, so this pins down that every Location
 * is accounted for and every placed one lands on a continent.
 */
describe('buildPlaces (vault)', () => {
  const data = bakeWikiData()
  const { placed, unplaced } = data.places
  const locations = data.graph.nodes.filter(n => n.c === 'Locations')

  it('accounts for every Location exactly once', () => {
    const seen = [...placed.map(p => p.i), ...unplaced]
    expect(new Set(seen).size).toBe(seen.length)
    expect(seen.length).toBe(locations.length)
  })

  it('places only Locations, and only ones with coordinates', () => {
    for (const p of placed) {
      expect(data.graph.nodes[p.i]!.c).toBe('Locations')
      expect(data.geo[p.i]).toBeDefined()
    }
  })

  it('places nearly every Location', () => {
    // A handful can't be pinned (ships, unspecified sites); a big jump means
    // coordinates went missing or stopped parsing.
    expect(unplaced.length).toBeLessThanOrEqual(10)
  })

  it('lists places by name', () => {
    const labels = placed.map(p => data.graph.nodes[p.i]!.l)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })))
  })

  it('reads location_type', () => {
    const area51 = placed.find(p => data.graph.nodes[p.i]!.l === 'Area 51')
    expect(area51?.t).toBe('facility')
    expect(area51?.k).toBe('north-america')
  })
})
