import type { GraphNode } from '#shared/types/wiki'
import { describe, expect, it } from 'vitest'
import { gridStep, LabelGrid, labelMinZoom, searchNodes } from './siteMap'

function node(i: number, l: string, d = 0): GraphNode {
  return { i, l, p: `/wiki/${i}`, c: 'People', d, x: 0, y: 0 }
}

describe('searchNodes', () => {
  const nodes = [
    node(0, 'Bob Lazar', 40),
    node(1, 'Lazarus Project', 2),
    node(2, 'Area 51', 90),
    node(3, 'Lazar', 1),
    node(4, 'S-4 (Lazar site)', 5),
    node(5, 'Blazar', 50),
  ]

  it('returns nothing for a blank query', () => {
    expect(searchNodes(nodes, '   ')).toEqual([])
  })

  it('ranks exact, then prefix, then word start, then substring', () => {
    expect(searchNodes(nodes, 'lazar').map(n => n.i)).toEqual([3, 1, 0, 4, 5])
  })

  it('breaks ties by degree', () => {
    const tied = [node(0, 'Alpha one', 1), node(1, 'Alpha two', 9)]
    expect(searchNodes(tied, 'alpha').map(n => n.i)).toEqual([1, 0])
  })

  it('honours the limit', () => {
    expect(searchNodes(nodes, 'a', 2)).toHaveLength(2)
  })
})

describe('labelMinZoom', () => {
  it('lets hubs label earlier than leaves', () => {
    expect(labelMinZoom(60)).toBeLessThan(1)
    expect(labelMinZoom(0)).toBeGreaterThan(labelMinZoom(10))
  })
})

describe('LabelGrid', () => {
  it('rejects overlapping boxes and accepts disjoint ones', () => {
    const g = new LabelGrid(10)
    expect(g.tryPlace(0, 0, 30, 10)).toBe(true)
    expect(g.tryPlace(20, 5, 50, 15)).toBe(false)
    expect(g.tryPlace(31, 0, 60, 10)).toBe(true)
    expect(g.tryPlace(-40, -40, -10, -30)).toBe(true)
    g.clear()
    expect(g.tryPlace(20, 5, 50, 15)).toBe(true)
  })
})

describe('gridStep', () => {
  it('stays inside the band at any zoom', () => {
    for (const k of [0.01, 0.1, 0.19, 1, 4]) {
      const s = gridStep(k)
      expect(s).toBeGreaterThanOrEqual(28)
      expect(s).toBeLessThanOrEqual(56)
    }
  })
})
