import type { GraphNode } from '../../shared/types/wiki'
import { describe, expect, it } from 'vitest'
import { buildLabelIndex } from '../../wiki/resolve'
import { normalizeNameParam, resolveNames } from './resolveNames'

function node(i: number, label: string, category: GraphNode['c'] = 'People'): GraphNode {
  return { i, l: label, p: `/wiki/${category.toLowerCase()}/${i}`, c: category, d: 0, x: 0, y: 0 }
}

describe('normalizeNameParam', () => {
  it('wraps a single occurrence (h3 returns a bare string) in an array', () => {
    expect(normalizeNameParam('Robert Sarbacher')).toEqual(['Robert Sarbacher'])
  })

  it('passes several occurrences (h3 returns an array) through untouched', () => {
    expect(normalizeNameParam(['Robert Sarbacher', 'William Steinman'])).toEqual([
      'Robert Sarbacher',
      'William Steinman',
    ])
  })

  it('returns an empty array when the param is absent', () => {
    expect(normalizeNameParam(undefined)).toEqual([])
  })

  it('trims and drops blank entries', () => {
    expect(normalizeNameParam(['  Crane, Indiana  ', '', '   '])).toEqual(['Crane, Indiana'])
  })

  // The bug this route exists to fix: a comma-joined query string splits a
  // comma-containing vault page name into extra fragments. Repeated `name=`
  // params must round-trip such a name as ONE entry, never two.
  it('round-trips a comma-containing name as a single entry, not split', () => {
    expect(normalizeNameParam(['1953 Kingman, Arizona Crash Retrieval'])).toEqual([
      '1953 Kingman, Arizona Crash Retrieval',
    ])
    expect(normalizeNameParam(['Crane, Indiana', 'Robert Sarbacher'])).toEqual([
      'Crane, Indiana',
      'Robert Sarbacher',
    ])
  })
})

describe('resolveNames', () => {
  it('resolves each name positionally, 1:1 with the request', () => {
    const nodes = [node(0, 'Vannevar Bush'), node(1, 'Robert Sarbacher')]
    const index = buildLabelIndex(nodes)

    const result = resolveNames(['Vannevar Bush', 'Robert Sarbacher'], index)

    expect(result).toHaveLength(2)
    expect(result[0]?.title).toBe('Vannevar Bush')
    expect(result[1]?.title).toBe('Robert Sarbacher')
  })

  it('yields exactly N results for N names, including unresolvable ones', () => {
    const index = buildLabelIndex([node(0, 'Vannevar Bush')])
    const requested = ['Vannevar Bush', 'Nobody Real', 'Also Nobody']

    const result = resolveNames(requested, index)

    expect(result).toHaveLength(requested.length)
    expect(result[0]?.title).toBe('Vannevar Bush')
    expect(result[1]).toBeNull()
    expect(result[2]).toBeNull()
  })

  it('yields exactly N results for N names when a comma-containing name is present', () => {
    const nodes = [
      node(0, 'Crane, Indiana', 'Locations'),
      node(1, 'Vannevar Bush'),
      node(2, 'Robert Sarbacher'),
    ]
    const index = buildLabelIndex(nodes)
    const requested = ['Vannevar Bush', 'Crane, Indiana', 'Robert Sarbacher']

    const result = resolveNames(requested, index)

    expect(result).toHaveLength(3)
    expect(result[0]?.title).toBe('Vannevar Bush')
    expect(result[1]?.title).toBe('Crane, Indiana')
    expect(result[2]?.title).toBe('Robert Sarbacher')
  })

  it('yields exactly N results for N names when a name repeats', () => {
    const index = buildLabelIndex([node(0, 'Vannevar Bush')])
    const requested = ['Vannevar Bush', 'Vannevar Bush', 'Vannevar Bush']

    const result = resolveNames(requested, index)

    expect(result).toHaveLength(3)
    result.forEach(entry => expect(entry?.title).toBe('Vannevar Bush'))
  })

  it('yields exactly N results for a larger mixed batch (duplicates + comma names + misses)', () => {
    const nodes = [
      node(0, 'Crane, Indiana', 'Locations'),
      node(1, '1953 Kingman, Arizona Crash Retrieval', 'Events'),
      node(2, 'Vannevar Bush'),
    ]
    const index = buildLabelIndex(nodes)
    const requested = [
      'Vannevar Bush',
      'Crane, Indiana',
      'Nobody Real',
      '1953 Kingman, Arizona Crash Retrieval',
      'Vannevar Bush',
    ]

    const result = resolveNames(requested, index)

    expect(result).toHaveLength(requested.length)
    expect(result.map(r => r?.title ?? null)).toEqual([
      'Vannevar Bush',
      'Crane, Indiana',
      null,
      '1953 Kingman, Arizona Crash Retrieval',
      'Vannevar Bush',
    ])
  })

  it('returns an empty array for an empty request', () => {
    expect(resolveNames([], buildLabelIndex([]))).toEqual([])
  })

  it('adds coordinates only to refs whose note has them', () => {
    const nodes = [node(0, 'Crane, Indiana', 'Locations'), node(1, 'Vannevar Bush')]
    const result = resolveNames(['Crane, Indiana', 'Vannevar Bush'], buildLabelIndex(nodes), { 0: [38.89, -86.83] })

    expect(result[0]?.coordinates).toEqual([38.89, -86.83])
    // Backward compatible: a ref without coordinates has no such key at all.
    expect(result[1]).toEqual({ path: '/wiki/people/1', title: 'Vannevar Bush', category: 'People' })
    expect(result[1]).not.toHaveProperty('coordinates')
  })

  it('adds a portrait only to refs whose note has one', () => {
    const image = {
      src: '/people/vannevar-bush.webp',
      width: 240,
      height: 300,
      author: 'Harris & Ewing',
      license: 'Public domain',
      source: 'https://commons.wikimedia.org/wiki/File:Vannevar_Bush.jpg',
    }
    const nodes = [node(0, 'Vannevar Bush'), node(1, 'Robert Sarbacher'), node(2, 'Crane, Indiana', 'Locations')]
    const result = resolveNames(
      ['Vannevar Bush', 'Robert Sarbacher', 'Crane, Indiana'],
      buildLabelIndex(nodes),
      { 2: [38.89, -86.83] },
      { 0: image },
    )

    expect(result[0]).toEqual({ path: '/wiki/people/0', title: 'Vannevar Bush', category: 'People', image })
    expect(result[1]).toEqual({ path: '/wiki/people/1', title: 'Robert Sarbacher', category: 'People' })
    expect(result[1]).not.toHaveProperty('image')
    // Both optional fields coexist independently.
    expect(result[2]?.coordinates).toEqual([38.89, -86.83])
    expect(result[2]).not.toHaveProperty('image')
  })
})
