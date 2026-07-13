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

/** Interactive zoom range shared by the map camera and fit-to-view. */
export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 4

/**
 * Node budget for the docked local map, the active note included — so it shows
 * at most `LOCAL_MAX_NODES - 1` of the note's neighbours. The index notes blow
 * straight through this (People MOC has 246 neighbours), so WikiLocalMap reads
 * the same constant to say how many it had to leave out. Keep them in step.
 */
export const LOCAL_MAX_NODES = 18

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
  const maxNodes = opts.maxNodes ?? LOCAL_MAX_NODES
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

/* ------------------------------------------------------------------- fan -- */

/**
 * The selected-node fan, shared by the site map's pinned state and the local
 * map (which is permanently "pinned" on its own note). Both call this so the
 * two can't drift apart.
 *
 * Everything here is in PLATE SPACE: the units the name plates are measured in.
 * The site map solves at the live camera scale (plates there never scale, so
 * the fan must be re-solved when the zoom moves); the local map solves once at
 * scale 1 and then scales the whole arrangement — plates included — to fit its
 * frame. Either way the geometry below is identical.
 */
const FAN_ARC_MIN = 92 // px of ring arc reserved per neighbour label, minimum
const FAN_GAP = 78 // px between successive rings
const FAN_PAD = 10 // clearance between footprints
const PLATE_H = 22
const PANEL_H = 28
const LABEL_MAX = 60 // plates clamp their measured width at this many glyphs

// Plate width, modelled as glyphs × width + fixed chrome (padding + border). The
// slope alone is not enough: measured against the rendered DOM, a per-char-only
// estimate is fine on average (~5.7px at 11px Inter) but UNDERSHOOTS short labels,
// where the fixed chrome dominates — "Home" renders 48.8px against a 42.8px
// estimate. Those undershoots were exactly where plates ended up overlapping. The
// constants below are fitted to the real boxes and rounded up, so the model errs
// wide at every length.
const PLATE_CHAR_W = 6
const PLATE_PAD_W = 26
const PANEL_CHAR_W = 6.8 // the focus's title panel is a 12px font — wider glyphs
const PANEL_PAD_W = 26

export interface FanNode { x: number, y: number, r: number, label: string }
export interface FanPlacement { x: number, y: number, ang: number }
export interface FanResult {
  /** One per member, in the order given. */
  members: FanPlacement[]
  /** Union of every disc AND plate box — what a fit-to-view must frame. */
  bounds: Bounds
}

/** Plate box width for a label (the focus's title panel is the wider variant). */
function plateW(label: string, isFocus: boolean): number {
  const glyphs = Math.min(label.length, LABEL_MAX)
  return isFocus
    ? glyphs * PANEL_CHAR_W + PANEL_PAD_W
    : glyphs * PLATE_CHAR_W + PLATE_PAD_W
}

/**
 * Fan `members` out around `focus`. Slots are built ring by ring (capacity grows
 * with circumference, quotas spread proportionally so the outer ring isn't left
 * nearly empty), then sorted by angle and matched to the members sorted by their
 * TRUE bearing — cyclic order is preserved, so the fan neither crosses nor
 * travels far from where the neighbours already sit.
 *
 * Members are then separated as full FOOTPRINTS, not discs: a member's visual
 * area is its disc PLUS its name plate (anchored radially outward), and plates
 * are far wider than discs — slotting on label arc alone left them stacked over
 * each other and over nodes. Each sweep re-derives every member's bearing from
 * its current position, builds the union box of disc + plate, and pushes
 * overlapping pairs apart along the axis of least penetration. The focus never
 * moves; everything yields around it.
 */
export function fanLayout(focus: FanNode, members: FanNode[]): FanResult {
  const n = members.length
  const fpw = plateW(focus.label, true)
  if (!n) {
    return {
      members: [],
      bounds: {
        minX: Math.min(focus.x - focus.r, focus.x - fpw / 2),
        minY: focus.y - focus.r,
        maxX: Math.max(focus.x + focus.r, focus.x + fpw / 2),
        maxY: focus.y + focus.r + 7 + PANEL_H,
      },
    }
  }

  // Members in true-bearing order; slots in angular order. Matching them index
  // for index is what preserves the cyclic order.
  const order = members
    .map((m, j) => ({ j, a: Math.atan2(m.y - focus.y, m.x - focus.x) }))
    .sort((u, v) => u.a - v.a)

  // Slot arc adapts to this neighbourhood's label widths. Adjacent slots in a
  // ring are also staggered half a gap radially, so only every *second* slot
  // shares a radius — half the mean width plus padding is enough arc.
  let chars = 0
  for (const m of members) chars += Math.min(m.label.length, 40)
  const arc = Math.max(FAN_ARC_MIN, Math.min(170, ((chars / n) * 5.6) / 2 + 34))

  const r0 = Math.max(84, Math.min(130, (n * arc) / (2 * Math.PI)))
  const ringR: number[] = []
  let cap = 0
  for (let m = 0; cap < n; m++) {
    const r = r0 + m * FAN_GAP
    ringR.push(r)
    cap += Math.max(1, Math.floor((2 * Math.PI * r) / arc))
  }
  const totalR = ringR.reduce((s, r) => s + r, 0)
  const slots: { a: number, r: number }[] = []
  let assigned = 0
  ringR.forEach((r, m) => {
    const q = m === ringR.length - 1
      ? n - assigned
      : Math.min(n - assigned, Math.round((n * r) / totalR))
    assigned += q
    // Rings are offset half a slot from each other, and alternate slots within a
    // ring bump out half a gap, so no two nearby labels share both a bearing and
    // a radius.
    for (let s = 0; s < q; s++) {
      slots.push({ a: -Math.PI + ((s + (m % 2) * 0.5) / q) * 2 * Math.PI, r: r + (s % 2) * (FAN_GAP * 0.45) })
    }
  })
  slots.sort((u, v) => u.a - v.a)

  // Rotate the whole arrangement by the circular mean of (bearing − slot) so the
  // fan opens from where the neighbours already sit.
  let rx = 0
  let ry = 0
  for (let j = 0; j < n; j++) {
    const d = order[j]!.a - slots[j]!.a
    rx += Math.cos(d)
    ry += Math.sin(d)
  }
  const delta = Math.atan2(ry, rx)

  // Index 0 is the focus; member m is at index m + 1.
  const posX = new Float64Array(n + 1)
  const posY = new Float64Array(n + 1)
  const rad = new Float64Array(n + 1)
  const pw = new Float64Array(n + 1)
  const ph = new Float64Array(n + 1)
  posX[0] = focus.x
  posY[0] = focus.y
  rad[0] = focus.r + 3
  pw[0] = fpw
  ph[0] = PANEL_H
  for (let j = 0; j < n; j++) {
    const slot = slots[j]!
    const a = slot.a + delta
    const idx = order[j]!.j
    const m = members[idx]!
    posX[idx + 1] = focus.x + Math.cos(a) * slot.r
    posY[idx + 1] = focus.y + Math.sin(a) * slot.r
    rad[idx + 1] = m.r
    pw[idx + 1] = plateW(m.label, false)
    ph[idx + 1] = PLATE_H
  }

  // Union box of member m's disc and its plate at m's current bearing —
  // mirroring how the plates are anchored when drawn.
  const box = (m: number, out: Float64Array): void => {
    const r = rad[m]!
    let cx: number
    let cy: number
    if (m === 0) {
      cx = posX[0]!
      cy = posY[0]! + r + 7 + ph[0]! / 2 // panel sits centred below the disc
    }
    else {
      const dx = posX[m]! - posX[0]!
      const dy = posY[m]! - posY[0]!
      const d = Math.hypot(dx, dy) || 1
      const ca = dx / d
      const sa = dy / d
      cx = posX[m]! + ca * (r + 5) + (ca * pw[m]!) / 2
      cy = posY[m]! + sa * (r + 5) + (sa * ph[m]!) / 2
    }
    out[0] = Math.min(posX[m]! - r, cx - pw[m]! / 2)
    out[1] = Math.min(posY[m]! - r, cy - ph[m]! / 2)
    out[2] = Math.max(posX[m]! + r, cx + pw[m]! / 2)
    out[3] = Math.max(posY[m]! + r, cy + ph[m]! / 2)
  }

  const ba = new Float64Array(4)
  const bb = new Float64Array(4)
  for (let sweep = 0; sweep < 60; sweep++) {
    let clashed = false
    for (let a = 0; a <= n; a++) {
      box(a, ba)
      for (let b = a + 1; b <= n; b++) {
        box(b, bb)
        const ox = Math.min(ba[2]!, bb[2]!) - Math.max(ba[0]!, bb[0]!) + FAN_PAD
        const oy = Math.min(ba[3]!, bb[3]!) - Math.max(ba[1]!, bb[1]!) + FAN_PAD
        if (ox <= 0 || oy <= 0) continue
        clashed = true
        if (ox < oy) {
          const sign = bb[0]! + bb[2]! >= ba[0]! + ba[2]! ? 1 : -1
          if (a === 0) posX[b]! += ox * sign
          else {
            posX[a]! -= (ox / 2) * sign
            posX[b]! += (ox / 2) * sign
          }
        }
        else {
          const sign = bb[1]! + bb[3]! >= ba[1]! + ba[3]! ? 1 : -1
          if (a === 0) posY[b]! += oy * sign
          else {
            posY[a]! -= (oy / 2) * sign
            posY[b]! += (oy / 2) * sign
          }
        }
        box(a, ba)
      }
    }
    if (!clashed) break
  }

  const out: FanPlacement[] = []
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  const bx = new Float64Array(4)
  for (let m = 0; m <= n; m++) {
    box(m, bx)
    if (bx[0]! < bounds.minX) bounds.minX = bx[0]!
    if (bx[1]! < bounds.minY) bounds.minY = bx[1]!
    if (bx[2]! > bounds.maxX) bounds.maxX = bx[2]!
    if (bx[3]! > bounds.maxY) bounds.maxY = bx[3]!
    if (m === 0) continue
    out.push({
      x: posX[m]!,
      y: posY[m]!,
      ang: Math.atan2(posY[m]! - posY[0]!, posX[m]! - posX[0]!),
    })
  }
  return { members: out, bounds }
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
  const k = clamp(Math.min(availW / bw, availH / bh), MIN_ZOOM, MAX_ZOOM)
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  return { x: w / 2 - cx * k, y: h / 2 - cy * k, k }
}
