/**
 * Mosaic (masonry) placement for cards of uneven height, as the roster uses
 * once some of its cards carry a portrait and others don't. Pure numbers in,
 * positions out: the component measures its cards and applies the result.
 *
 * The aim is the shortest mosaic, so the section after it isn't pushed down
 * by one lopsided column. Plain shortest-column-first placement in source
 * order (the usual masonry rule) can strand a tall card at the foot of one
 * column. So:
 *
 * - Two columns, which is what an article's width holds, are split exactly:
 *   a small dynamic program over the difference between the columns finds
 *   the shortest possible mosaic and, among the splits that reach it, the
 *   one that departs least often from shortest-column-first, so the cards
 *   still read roughly left to right, row by row.
 * - Three or more start from shortest-column-first and are levelled by
 *   moving or swapping single cards out of the tallest column while that
 *   makes it shorter.
 *
 * Every column stays in source order, top to bottom.
 */

export interface MosaicItem {
  column: number
  /** Offset from the top of the mosaic, in the same unit as the heights. */
  top: number
}

export interface MosaicLayout {
  items: MosaicItem[]
  /** The tallest column: the height the mosaic occupies. */
  height: number
}

/**
 * How many columns of at least `minColumn` fit in `width` with `gap` between
 * them, between 1 and `max`.
 */
export function mosaicColumns(width: number, minColumn: number, gap: number, max = 3): number {
  const fit = Math.floor((width + gap) / (minColumn + gap))
  return Math.max(1, Math.min(max, fit))
}

/** A column's height: its cards plus the gaps between them (none at the ends). */
function columnHeight(members: number[], heights: number[], gap: number): number {
  if (!members.length) return 0
  let sum = gap * (members.length - 1)
  for (const i of members) sum += heights[i]!
  return sum
}

/** Tallest column first, then the spread (sum of squares) as a tiebreak. */
function score(columns: number[][], heights: number[], gap: number): [number, number] {
  let max = 0
  let squares = 0
  for (const members of columns) {
    const h = columnHeight(members, heights, gap)
    max = Math.max(max, h)
    squares += h * h
  }
  return [max, squares]
}

function better(a: [number, number], b: [number, number]): boolean {
  // Half a pixel of slack so measurement noise can't make it churn.
  if (a[0] < b[0] - 0.5) return true
  return Math.abs(a[0] - b[0]) <= 0.5 && a[1] < b[1] - 0.5
}

/** A copy of `columns` with `from`/`to` rebuilt, each kept in source order. */
function withColumns(columns: number[][], changes: Map<number, number[]>): number[][] {
  return columns.map((members, c) => {
    const next = changes.get(c)
    return next ? [...next].sort((a, b) => a - b) : members
  })
}

/**
 * The exact two-column split. State after each card: the left column's lead
 * over the right (cards plus a trailing gap each, in whole pixels), holding
 * the fewest departures from shortest-column-first that reach it.
 */
function splitInTwo(heights: number[], gap: number): number[][] {
  const weights = heights.map(h => Math.round(h) + gap)
  interface Step { departures: number, prev: number, column: 0 | 1 }
  const steps: Array<Map<number, Step>> = []
  let frontier = new Map<number, number>([[0, 0]])

  for (const w of weights) {
    const next = new Map<number, Step>()
    for (const [lead, departures] of frontier) {
      // Shortest-column-first would pick the left column on a tie.
      const greedy: 0 | 1 = lead <= 0 ? 0 : 1
      for (const column of [0, 1] as const) {
        const to = column === 0 ? lead + w : lead - w
        const cost = departures + (column === greedy ? 0 : 1)
        const seen = next.get(to)
        if (!seen || cost < seen.departures) next.set(to, { departures: cost, prev: lead, column })
      }
    }
    steps.push(next)
    frontier = new Map([...next].map(([lead, step]) => [lead, step.departures]))
  }

  // The smallest |lead| is the shortest mosaic; fewest departures on a tie.
  let end = 0
  let endCost = Infinity
  for (const [lead, departures] of frontier) {
    const d = Math.abs(lead) - Math.abs(end)
    if (endCost === Infinity || d < 0 || (d === 0 && departures < endCost)) {
      end = lead
      endCost = departures
    }
  }

  const columns: number[][] = [[], []]
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]!.get(end)!
    columns[step.column]!.unshift(i)
    end = step.prev
  }
  return columns
}

export function layoutMosaic(heights: number[], columnCount: number, gap: number): MosaicLayout {
  const count = Math.max(1, Math.trunc(columnCount))
  let columns: number[][] = Array.from({ length: count }, () => [])

  if (count === 2) return place(splitInTwo(heights, gap), heights, gap)

  // 1. Shortest column first, in source order (leftmost on a tie).
  const sums = Array.from<number>({ length: count }).fill(0)
  heights.forEach((h, i) => {
    let c = 0
    for (let k = 1; k < count; k++) if (sums[k]! < sums[c]! - 0.5) c = k
    sums[c]! += (columns[c]!.length ? gap : 0) + h
    columns[c]!.push(i)
  })

  // 2. Level: take the single move or swap out of the tallest column that
  // improves the score most, until none does. Each step strictly lowers the
  // score, so this ends; the cap is only a guard.
  if (count > 1) {
    for (let step = 0; step < heights.length * count * 4; step++) {
      const current = score(columns, heights, gap)
      const tallest = columns.reduce((best, members, c) =>
        columnHeight(members, heights, gap) > columnHeight(columns[best]!, heights, gap) ? c : best, 0)
      const from = columns[tallest]!
      let bestColumns: number[][] | null = null
      let bestScore = current

      for (let to = 0; to < count; to++) {
        if (to === tallest) continue
        const target = columns[to]!
        for (const a of from) {
          const rest = from.filter(i => i !== a)
          const candidates: Array<Map<number, number[]>> = [
            new Map([[tallest, rest], [to, [...target, a]]]),
            ...target.map(b => new Map([
              [tallest, [...rest, b]],
              [to, [...target.filter(i => i !== b), a]],
            ])),
          ]
          for (const change of candidates) {
            const next = withColumns(columns, change)
            const s = score(next, heights, gap)
            if (better(s, bestScore)) {
              bestScore = s
              bestColumns = next
            }
          }
        }
      }

      if (!bestColumns) break
      columns = bestColumns
    }
  }

  return place(columns, heights, gap)
}

function place(columns: number[][], heights: number[], gap: number): MosaicLayout {
  const items: MosaicItem[] = heights.map(() => ({ column: 0, top: 0 }))
  let height = 0
  columns.forEach((members, c) => {
    let top = 0
    for (const i of members) {
      items[i] = { column: c, top }
      top += heights[i]! + gap
    }
    height = Math.max(height, columnHeight(members, heights, gap))
  })
  return { items, height }
}
