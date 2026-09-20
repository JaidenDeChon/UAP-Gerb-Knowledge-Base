import type { GraphNode } from '../shared/types/wiki'
import { describe, expect, it } from 'vitest'
import { buildLabelIndex, resolveName } from './resolve'

function node(i: number, l: string, p: string, c: GraphNode['c']): GraphNode {
  return { i, l, p, c, d: 0, x: 0, y: 0 }
}

const NODES: GraphNode[] = [
  node(0, 'Jesse Marcel', '/wiki/people/jesse-marcel', 'People'),
  node(1, 'Crane, Indiana', '/wiki/locations/crane-indiana', 'Locations'),
  node(2, 'Crane, Indiana', '/wiki/organizations/crane-indiana', 'Organizations'),
  node(3, 'Edgar Fouché', '/wiki/people/edgar-fouche', 'People'),
]

describe('resolveName', () => {
  const index = buildLabelIndex(NODES)

  it('resolves an exact name', () => {
    expect(resolveName('Jesse Marcel', index)?.p).toBe('/wiki/people/jesse-marcel')
  })

  it('is case-insensitive', () => {
    expect(resolveName('jesse marcel', index)?.p).toBe('/wiki/people/jesse-marcel')
  })

  it('trims surrounding whitespace', () => {
    expect(resolveName('  Jesse Marcel  ', index)?.p).toBe('/wiki/people/jesse-marcel')
  })

  it('prefers the higher-priority folder when a name is ambiguous', () => {
    // FOLDER_PRIORITY ranks Organizations above Locations.
    expect(resolveName('Crane, Indiana', index)?.c).toBe('Organizations')
  })

  it('falls back to diacritic-folded matching', () => {
    expect(resolveName('Edgar Fouche', index)?.p).toBe('/wiki/people/edgar-fouche')
  })

  it('returns null for an unknown name', () => {
    expect(resolveName('Nobody At All', index)).toBeNull()
  })

  it('returns null for an empty name', () => {
    expect(resolveName('   ', index)).toBeNull()
  })
})
