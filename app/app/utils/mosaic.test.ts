import { describe, expect, it } from 'vitest'
import { layoutMosaic, mosaicColumns } from './mosaic'

/** The column each item landed in, in source order. */
const columnsOf = (layout: ReturnType<typeof layoutMosaic>) => layout.items.map(p => p.column)

describe('mosaicColumns', () => {
  it('fits as many minimum-width columns as the width allows, up to the cap', () => {
    expect(mosaicColumns(300, 264, 10)).toBe(1)
    expect(mosaicColumns(537, 264, 10)).toBe(1)
    expect(mosaicColumns(538, 264, 10)).toBe(2)
    expect(mosaicColumns(696, 264, 10)).toBe(2)
    expect(mosaicColumns(812, 264, 10)).toBe(3)
    expect(mosaicColumns(5000, 264, 10)).toBe(3)
    expect(mosaicColumns(5000, 264, 10, 4)).toBe(4)
  })

  it('never returns fewer than one column', () => {
    expect(mosaicColumns(0, 264, 10)).toBe(1)
  })
})

describe('layoutMosaic', () => {
  it('stacks everything in one column', () => {
    const layout = layoutMosaic([100, 50, 80], 1, 10)
    expect(layout.items).toEqual([
      { column: 0, top: 0 },
      { column: 0, top: 110 },
      { column: 0, top: 170 },
    ])
    expect(layout.height).toBe(250)
  })

  it('handles an empty list', () => {
    expect(layoutMosaic([], 2, 10)).toEqual({ items: [], height: 0 })
  })

  it('places equal cards left to right, row by row', () => {
    const layout = layoutMosaic([100, 100, 100, 100], 2, 10)
    expect(columnsOf(layout)).toEqual([0, 1, 0, 1])
    expect(layout.items[2]!.top).toBe(110)
    expect(layout.height).toBe(210)
  })

  it('keeps each column in source order', () => {
    const layout = layoutMosaic([220, 90, 90, 180, 90, 90, 220], 2, 10)
    for (const column of [0, 1]) {
      const tops = layout.items
        .map((p, i) => ({ ...p, i }))
        .filter(p => p.column === column)
      const sorted = [...tops].sort((a, b) => a.i - b.i)
      expect(tops.map(p => p.top)).toEqual(sorted.map(p => p.top))
      for (let k = 1; k < tops.length; k++)
        expect(tops[k]!.top).toBeGreaterThan(tops[k - 1]!.top)
    }
  })

  it('fixes a tall last card that plain shortest-column placement strands', () => {
    // Shortest-column placement in order ends 520 | 210 (the 300 lands under
    // two 100s). The best split is 100,300 | 100,100,100: 410 | 320.
    const heights = [100, 100, 100, 100, 300]
    const layout = layoutMosaic(heights, 2, 10)
    expect(layout.height).toBe(410)
  })

  it('matches the best two-column split on lopsided rosters', () => {
    const cases = [
      [180, 90, 90, 90, 90, 90, 180, 90],
      [260, 110, 110, 260, 110, 110],
      [120, 130, 250, 90, 90, 140, 260, 100, 110],
      [236, 118, 142, 118, 236, 166, 142, 118, 236, 118],
    ]
    for (const heights of cases) {
      const gap = 10
      expect(layoutMosaic(heights, 2, gap).height).toBe(bestTwoColumnHeight(heights, gap))
    }
  })

  it('never ends taller than shortest-column placement in order', () => {
    const heights = [140, 300, 90, 120, 260, 90, 90, 150, 200]
    for (const columns of [2, 3]) {
      const layout = layoutMosaic(heights, columns, 10)
      expect(layout.height).toBeLessThanOrEqual(greedyHeight(heights, columns, 10))
    }
  })

  it('reports the tallest column as the height, gaps between cards only', () => {
    const layout = layoutMosaic([100, 40, 40], 2, 12)
    // 100 | 40 + 12 + 40 = 92
    expect(layout.height).toBe(100)
    expect(columnsOf(layout)).toEqual([0, 1, 1])
    expect(layout.items[2]!.top).toBe(52)
  })
})

function greedyHeight(heights: number[], columns: number, gap: number): number {
  const sums = Array.from({ length: columns }, () => -gap)
  for (const h of heights) {
    const c = sums.indexOf(Math.min(...sums))
    sums[c]! += h + gap
  }
  return Math.max(...sums)
}

function bestTwoColumnHeight(heights: number[], gap: number): number {
  let best = Infinity
  const n = heights.length
  for (let mask = 0; mask < 1 << n; mask++) {
    const sums = [-gap, -gap]
    heights.forEach((h, i) => { sums[(mask >> i) & 1]! += h + gap })
    best = Math.min(best, Math.max(sums[0]!, sums[1]!, 0))
  }
  return best
}
