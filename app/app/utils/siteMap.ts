import type { GraphNode } from '#shared/types/wiki'

/**
 * Pure helpers for the site map (`GraphMapPixi`): search ranking, label
 * culling and the parallax grid. Kept out of the component so they can be
 * unit-tested without a WebGL context.
 */

/**
 * Up to `limit` nodes whose label matches `query`, best first: an exact match,
 * then a match at the start of the label, then at the start of any word, then
 * anywhere. Ties go to the better-connected node, then alphabetical order.
 */
export function searchNodes(nodes: GraphNode[], query: string, limit = 8): GraphNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored: { n: GraphNode, s: number }[] = []
  for (const n of nodes) {
    const l = n.l.toLowerCase()
    const at = l.indexOf(q)
    if (at < 0) continue
    let s: number
    if (l === q) s = 0
    else if (at === 0) s = 1
    else if (/[\s(\-'"/]/.test(l[at - 1]!)) s = 2
    else s = 3
    scored.push({ n, s })
  }
  scored.sort((a, b) => (a.s - b.s) || (b.n.d - a.n.d) || a.n.l.localeCompare(b.n.l))
  return scored.slice(0, limit).map(e => e.n)
}

/**
 * Zoom level (relative to the overview fit, so it holds whatever the graph's
 * size) from which a node of `degree` earns a resting label. Hubs are named
 * from the first frame; a leaf needs the camera close in. Collision culling
 * (LabelGrid) still decides the final set.
 */
export function labelMinZoom(degree: number): number {
  return 4.5 / (1 + degree / 3)
}

/**
 * Greedy screen-space occupancy for label culling: boxes are offered in
 * priority order and accepted only if they don't overlap one already placed.
 * A uniform grid keeps each test to the handful of boxes nearby.
 */
export class LabelGrid {
  private cells = new Map<number, number[]>()
  private boxes: number[] = [] // flat [x0, y0, x1, y1, ...]

  constructor(private cell = 48) {}

  clear(): void {
    this.cells.clear()
    this.boxes.length = 0
  }

  private key(cx: number, cy: number): number {
    return (cx + 4096) * 8192 + (cy + 4096)
  }

  /** Place the box if it's free; returns whether it was placed. */
  tryPlace(x0: number, y0: number, x1: number, y1: number): boolean {
    const c = this.cell
    const cx0 = Math.floor(x0 / c)
    const cy0 = Math.floor(y0 / c)
    const cx1 = Math.floor(x1 / c)
    const cy1 = Math.floor(y1 / c)
    const b = this.boxes
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const list = this.cells.get(this.key(cx, cy))
        if (!list) continue
        for (const id of list) {
          if (x0 < b[id + 2]! && x1 > b[id]! && y0 < b[id + 3]! && y1 > b[id + 1]!) return false
        }
      }
    }
    const id = b.length
    b.push(x0, y0, x1, y1)
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = this.key(cx, cy)
        const list = this.cells.get(k)
        if (list) list.push(id)
        else this.cells.set(k, [id])
      }
    }
    return true
  }
}

/**
 * Screen spacing of the background dot grid at zoom `k`: the graph-space
 * pitch, doubled or halved until it lands in a comfortable on-screen band, so
 * the grid tracks the camera without ever getting too dense or too sparse.
 */
export function gridStep(k: number, base = 160, lo = 28, hi = 56): number {
  let s = base * k
  if (!(s > 0) || !Number.isFinite(s)) return lo
  while (s < lo) s *= 2
  while (s > hi) s /= 2
  return s
}
