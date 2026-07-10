import type { GraphEdge, GraphNode, GraphPayload } from '#shared/types/wiki'

/** Axis-aligned bounding box in graph space — the shape of `GraphPayload.bounds`. */
export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Clamp `v` into `[lo, hi]`. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Undirected adjacency list indexed by node. `edges` reference nodes by index;
 * out-of-range endpoints are skipped so a subgraph's edges are safe to pass.
 */
export function buildAdjacency(edges: GraphEdge[], nodeCount: number): number[][] {
  const adj: number[][] = Array.from({ length: nodeCount }, () => [])
  for (const [a, b] of edges) {
    if (a < 0 || b < 0 || a >= nodeCount || b >= nodeCount || a === b) continue
    adj[a]!.push(b)
    adj[b]!.push(a)
  }
  return adj
}

/**
 * The local neighbourhood of `activeIndex`, reindexed so the returned `edges`
 * reference the returned `nodes`. The active node is always index 0.
 *
 * Base selection is the active node plus its 1-hop ring (most-connected first).
 * If that leaves budget, the ring grows one more hop — but never *through* a hub.
 * The MOC notes have degrees up to 246, so expanding through one drags in a
 * hundred unrelated names and turns the docked mini-map into noise: the second
 * hop is only useful when it shows what a note's actual neighbours connect to.
 */
export function localSubgraph(
  payload: GraphPayload,
  activeIndex: number,
  opts: { maxNodes?: number, hubDegree?: number } = {},
): { nodes: GraphNode[], edges: GraphEdge[] } {
  const maxNodes = opts.maxNodes ?? 18
  const hubDegree = opts.hubDegree ?? 24
  const all = payload.nodes
  if (activeIndex < 0 || activeIndex >= all.length) return { nodes: [], edges: [] }

  const adj = buildAdjacency(payload.edges, all.length)
  const selected = new Set<number>([activeIndex])

  // 1-hop ring, most-connected first, filling the budget.
  const ring = (adj[activeIndex] ?? [])
    .slice()
    .sort((a, b) => (all[b]!.d - all[a]!.d) || (a - b))
  for (const n of ring) {
    if (selected.size >= maxNodes) break
    selected.add(n)
  }

  // 2-hop, only while budget remains, and never expanding out of a hub.
  if (selected.size < maxNodes) {
    outer: for (const n of ring) {
      if (!selected.has(n) || all[n]!.d >= hubDegree) continue
      for (const m of adj[n] ?? []) {
        if (selected.has(m)) continue
        selected.add(m)
        if (selected.size >= maxNodes) break outer
      }
    }
  }

  const order = [...selected]
  const remap = new Map<number, number>()
  order.forEach((orig, idx) => remap.set(orig, idx))

  const nodes: GraphNode[] = order.map((orig, idx) => ({ ...all[orig]!, i: idx }))

  const edges: GraphEdge[] = []
  const seen = new Set<number>()
  for (const [a, b] of payload.edges) {
    const ra = remap.get(a)
    const rb = remap.get(b)
    if (ra === undefined || rb === undefined || ra === rb) continue
    const lo = ra < rb ? ra : rb
    const hi = ra < rb ? rb : ra
    const key = lo * order.length + hi
    if (seen.has(key)) continue
    seen.add(key)
    edges.push([lo, hi])
  }

  return { nodes, edges }
}

/**
 * Fruchterman–Reingold relaxation, in place and deterministic (no `Math.random`).
 * Integrates from the nodes' current positions, so seed them before calling.
 * O(n²) repulsion — intended for the small docked subgraph (≤60 nodes).
 */
export function relax(nodes: { x: number, y: number }[], edges: GraphEdge[], iterations: number): void {
  const n = nodes.length
  if (n < 2 || iterations <= 0) return

  const k = 64
  const k2 = k * k
  const dispX = new Float64Array(n)
  const dispY = new Float64Array(n)
  let temp = k * 0.9
  const cool = temp / (iterations + 1)

  for (let it = 0; it < iterations; it++) {
    dispX.fill(0)
    dispY.fill(0)

    for (let i = 0; i < n; i++) {
      const ni = nodes[i]!
      for (let j = i + 1; j < n; j++) {
        const nj = nodes[j]!
        let dx = ni.x - nj.x
        let dy = ni.y - nj.y
        let dist2 = dx * dx + dy * dy
        if (dist2 < 1e-6) {
          dx = (((i * 13 + 7) % 17) - 8) * 0.01 + 0.01
          dy = (((j * 11 + 3) % 19) - 9) * 0.01 + 0.01
          dist2 = dx * dx + dy * dy
        }
        const dist = Math.sqrt(dist2)
        const f = k2 / dist
        const fx = (dx / dist) * f
        const fy = (dy / dist) * f
        dispX[i]! += fx
        dispY[i]! += fy
        dispX[j]! -= fx
        dispY[j]! -= fy
      }
    }

    for (const [a, b] of edges) {
      if (a < 0 || b < 0 || a >= n || b >= n || a === b) continue
      const na = nodes[a]!
      const nb = nodes[b]!
      let dx = na.x - nb.x
      let dy = na.y - nb.y
      let dist2 = dx * dx + dy * dy
      if (dist2 < 1e-6) {
        dx = 0.1
        dy = 0.1
        dist2 = 0.02
      }
      const dist = Math.sqrt(dist2)
      const f = dist2 / k
      const fx = (dx / dist) * f
      const fy = (dy / dist) * f
      dispX[a]! -= fx
      dispY[a]! -= fy
      dispX[b]! += fx
      dispY[b]! += fy
    }

    for (let i = 0; i < n; i++) {
      const dx = dispX[i]!
      const dy = dispY[i]!
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < 1e-9) continue
      const s = Math.min(d, temp) / d
      nodes[i]!.x += dx * s
      nodes[i]!.y += dy * s
    }

    temp -= cool
    if (temp < 1) temp = 1
  }
}

/**
 * A pan/zoom transform `{ x, y, k }` that fits `bounds` into a `w × h` viewport
 * with `padding` px of margin, where screen = `(x + graphX * k, y + graphY * k)`.
 * `k` is clamped to the interactive zoom range.
 */
export function fitView(bounds: Bounds, w: number, h: number, padding: number): { x: number, y: number, k: number } {
  const bw = Math.max(bounds.maxX - bounds.minX, 1e-6)
  const bh = Math.max(bounds.maxY - bounds.minY, 1e-6)
  const availW = Math.max(w - padding * 2, 1)
  const availH = Math.max(h - padding * 2, 1)
  const k = clamp(Math.min(availW / bw, availH / bh), 0.15, 4)
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  return { x: w / 2 - cx * k, y: h / 2 - cy * k, k }
}
