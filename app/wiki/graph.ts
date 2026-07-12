import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
// Relative rather than the `#shared` alias: this module is imported from
// nuxt.config at build time to bake the vault into the bundle, and the
// node/config tsconfig project has no `#shared` path mapping.
import { CATEGORY_ORDER } from '../shared/types/wiki'
import type { Category, GraphEdge, GraphNode, GraphPayload } from '../shared/types/wiki'
import { buildVaultIndex, categoryOf, resolveWikiTarget, stemToPath, VAULT_DIR, walkVault, WIKILINK_RE } from './vault'

/** Directed adjacency for one note, keyed by route path throughout. */
export interface DirectedLinks {
  outgoing: string[]
  backlinks: string[]
}

/**
 * Everything derived from a single vault scan. Built once and memoized; the
 * Nitro routes pull whichever slice they need out of it.
 */
export interface GraphIndex {
  payload: GraphPayload
  linkMap: Map<string, DirectedLinks>
  /** Route path -> the note's graph node (for `NoteRef` / title / category). */
  nodeByPath: Map<string, GraphNode>
  /** Route path -> vault-relative stem (for reading the file, traversal-safe). */
  stemByPath: Map<string, string>
}

let cached: GraphIndex | undefined

/** Build (once per process) and return the shared graph index. */
export function graphIndex(): GraphIndex {
  return (cached ??= build())
}

/** The client graph payload: nodes with precomputed positions, edges, bounds. */
export function buildGraph(): GraphPayload {
  return graphIndex().payload
}

/** Directed link sidecar, keyed by route path. */
export function buildLinkMap(): Map<string, DirectedLinks> {
  return graphIndex().linkMap
}

/* --------------------------------------------------------------- building -- */

/**
 * Video transcripts stay out of the knowledge graph: they're raw caption
 * dumps, not curated notes, and as (mostly) unlinked degree-0 nodes they only
 * pad the map with noise. They remain in the sidebar tree and readable as
 * pages — this filter is scoped to the graph payload and its link sidecars.
 */
function isTranscript(stem: string): boolean {
  return stem.startsWith('Videos/') && stem.endsWith('/transcript')
}

function build(): GraphIndex {
  const index = buildVaultIndex()
  // Sorted so the node order — and therefore the layout cache key — is stable
  // regardless of the filesystem's readdir order.
  const stems = walkVault().filter(stem => !isTranscript(stem)).sort()

  const nodes: GraphNode[] = stems.map((stem, i) => ({
    i,
    l: labelFor(stem),
    p: stemToPath(stem),
    c: categoryOf(stem),
    d: 0,
    x: 0,
    y: 0,
  }))

  const indexByStem = new Map<string, number>()
  const indexByPath = new Map<string, number>()
  const stemByPath = new Map<string, string>()
  const nodeByPath = new Map<string, GraphNode>()
  stems.forEach((stem, i) => {
    const node = nodes[i]!
    indexByStem.set(stem, i)
    indexByPath.set(node.p, i)
    stemByPath.set(node.p, stem)
    nodeByPath.set(node.p, node)
  })

  // A fresh, non-shared regex so the exported global one keeps a clean lastIndex.
  const re = new RegExp(WIKILINK_RE.source, WIKILINK_RE.flags)
  const edges: GraphEdge[] = []
  const edgeSet = new Set<string>()
  const outgoing = new Map<number, number[]>()
  const backlinks = new Map<number, number[]>()

  for (const stem of stems) {
    const src = indexByStem.get(stem)!
    let body: string
    try {
      body = readFileSync(`${VAULT_DIR}/${stem}.md`, 'utf8')
    } catch {
      continue
    }

    const seen = new Set<number>()
    for (const match of body.matchAll(re)) {
      const target = match[2]
      if (!target) continue
      const path = resolveWikiTarget(target, index)
      if (!path) continue
      const dst = indexByPath.get(path)
      if (dst === undefined || dst === src) continue

      if (!seen.has(dst)) {
        seen.add(dst)
        pushInto(outgoing, src, dst)
        pushInto(backlinks, dst, src)
      }

      const key = src < dst ? `${src}-${dst}` : `${dst}-${src}`
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        edges.push(src < dst ? [src, dst] : [dst, src])
      }
    }
  }

  for (const [a, b] of edges) {
    nodes[a]!.d++
    nodes[b]!.d++
  }

  const key = cacheKey(stems, edges)
  let coords = readCache(key, nodes.length)
  if (!coords) {
    coords = layout(nodes, edges, stems)
    writeCache(key, coords)
  }
  for (let i = 0; i < nodes.length; i++) {
    nodes[i]!.x = coords.xs[i]!
    nodes[i]!.y = coords.ys[i]!
  }

  const bounds = computeBounds(nodes)

  const linkMap = new Map<string, DirectedLinks>()
  for (const node of nodes) {
    linkMap.set(node.p, {
      outgoing: (outgoing.get(node.i) ?? []).map(i => nodes[i]!.p),
      backlinks: (backlinks.get(node.i) ?? []).map(i => nodes[i]!.p),
    })
  }

  return { payload: { nodes, edges, bounds }, linkMap, nodeByPath, stemByPath }
}

function pushInto(map: Map<number, number[]>, key: number, value: number): void {
  let arr = map.get(key)
  if (!arr) {
    arr = []
    map.set(key, arr)
  }
  arr.push(value)
}

function labelFor(stem: string): string {
  if (stem === 'Home') return 'Home'
  const parts = stem.split('/')
  if (parts[0] === 'Videos' && parts.length === 3) {
    const title = parts[1]!
    if (parts[2] === 'summary') return title
    if (parts[2] === 'transcript') return `${title} — transcript`
  }
  return parts[parts.length - 1]!
}

function computeBounds(nodes: GraphNode[]): GraphPayload['bounds'] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.x > maxX) maxX = n.x
    if (n.y > maxY) maxY = n.y
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX, minY, maxX, maxY }
}

/* ----------------------------------------------------------------- layout -- */

// Fruchterman–Reingold with a uniform-grid repulsion cutoff. Deterministic:
// seed positions come from a per-stem integer hash, never Math.random, so a
// reload reproduces the same map.

const IDEAL = 55 // ideal edge length (k)
const CUTOFF = IDEAL * 3 // repulsion range == grid cell size
const ITERS = 600
const T0 = 140 // starting max displacement per step
const TMIN = 2
const CENTER_GRAVITY = 0.006
const R_INNER = 200
const R_OUTER = 1600
// Soft containment: gravity stays weak near the middle so the core spreads
// freely, but past R_SOFT a quadratic inward force reins in the leaves that
// hub-damping would otherwise fling off-canvas — without it the bounding box is
// dominated by a few far stragglers and the fitted map wastes half the frame.
const R_SOFT = 620
const BOUNDARY = 0.02
// Isolated notes (degree 0 — stubs nothing links to yet) feel no springs, so
// with uniform gravity they repel each other into a far ring that inflates the
// bbox and shrinks the fitted map. Pull low-degree nodes toward the centre
// harder so they nestle among the cloud; hubs (high degree) are barely affected.
const ISO_PULL = 7
// Both the homepage and the docked mini-map fit-to-view, so scaling the whole
// layout up changes nothing on screen — only the *relative* spacing of dense vs
// sparse regions does. A hub with 246 incident springs otherwise crushes its
// neighbourhood into the central blob; damping each spring by the larger
// endpoint degree lets sibling repulsion open those neighbourhoods out, which is
// what actually spreads the map. 0 = raw FR (one tight hairball); 1 = full
// normalisation (stars fly apart). 0.75 opens the core while keeping clusters legible.
const HUB_DAMPING = 0.9

function layout(nodes: GraphNode[], edges: GraphEdge[], stems: string[]): { xs: number[], ys: number[] } {
  const n = nodes.length
  const xs = new Float64Array(n)
  const ys = new Float64Array(n)

  // Category -> its own angular sector, so clusters read as clusters.
  const present = new Set<Category>()
  for (const node of nodes) present.add(node.c)
  const sectors = (['Root', ...CATEGORY_ORDER] as Category[]).filter(c => present.has(c))
  const sectorOf = new Map<Category, number>()
  sectors.forEach((c, k) => sectorOf.set(c, k))
  const span = (Math.PI * 2) / sectors.length

  for (let i = 0; i < n; i++) {
    const rand = mulberry32(hashString(stems[i]!))
    const k = sectorOf.get(nodes[i]!.c)!
    const angle = (k + 0.1 + 0.8 * rand()) * span
    const radius = R_INNER + Math.sqrt(rand()) * (R_OUTER - R_INNER)
    xs[i] = Math.cos(angle) * radius
    ys[i] = Math.sin(angle) * radius
  }

  // Flatten edges into typed arrays for the spring pass, plus a per-edge spring
  // weight that damps springs attached to a hub (see HUB_DAMPING).
  const edgeCount = edges.length
  const edgeA = new Int32Array(edgeCount)
  const edgeB = new Int32Array(edgeCount)
  const edgeW = new Float64Array(edgeCount)
  for (let e = 0; e < edgeCount; e++) {
    const a = edges[e]![0]
    const b = edges[e]![1]
    edgeA[e] = a
    edgeB[e] = b
    const hub = Math.max(nodes[a]!.d, nodes[b]!.d, 1)
    edgeW[e] = 1 / hub ** HUB_DAMPING
  }

  // Per-node gravity multiplier: low-degree nodes are pulled in harder.
  const gmul = new Float64Array(n)
  for (let i = 0; i < n; i++) gmul[i] = 1 + ISO_PULL / (nodes[i]!.d + 1)

  const dispX = new Float64Array(n)
  const dispY = new Float64Array(n)
  const cellX = new Int32Array(n)
  const cellY = new Int32Array(n)
  const cellId = new Int32Array(n)
  const order = new Int32Array(n)
  const cutoff2 = CUTOFF * CUTOFF
  const k2 = IDEAL * IDEAL

  for (let iter = 0; iter < ITERS; iter++) {
    dispX.fill(0)
    dispY.fill(0)

    // Bucket nodes into a uniform grid (cell size == repulsion cutoff) with a
    // counting sort into `order`, so repulsion only touches the 3x3 neighbours.
    let minCX = Infinity
    let minCY = Infinity
    let maxCX = -Infinity
    let maxCY = -Infinity
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(xs[i]! / CUTOFF)
      const cy = Math.floor(ys[i]! / CUTOFF)
      cellX[i] = cx
      cellY[i] = cy
      if (cx < minCX) minCX = cx
      if (cx > maxCX) maxCX = cx
      if (cy < minCY) minCY = cy
      if (cy > maxCY) maxCY = cy
    }
    const cols = maxCX - minCX + 1
    const cellCount = cols * (maxCY - minCY + 1)
    const starts = new Int32Array(cellCount + 1)
    for (let i = 0; i < n; i++) {
      const c = (cellY[i]! - minCY) * cols + (cellX[i]! - minCX)
      cellId[i] = c
      starts[c + 1]!++
    }
    for (let c = 1; c <= cellCount; c++) starts[c]! += starts[c - 1]!
    const cursor = starts.slice(0, cellCount)
    for (let i = 0; i < n; i++) order[cursor[cellId[i]!]!++] = i

    // Repulsion against the 3x3 neighbourhood only; each unordered pair once.
    for (let i = 0; i < n; i++) {
      const cx = cellX[i]!
      const cy = cellY[i]!
      const xi = xs[i]!
      const yi = ys[i]!
      const gxLo = cx - 1 < minCX ? minCX : cx - 1
      const gxHi = cx + 1 > maxCX ? maxCX : cx + 1
      const gyLo = cy - 1 < minCY ? minCY : cy - 1
      const gyHi = cy + 1 > maxCY ? maxCY : cy + 1
      let fxi = 0
      let fyi = 0
      for (let gy = gyLo; gy <= gyHi; gy++) {
        const rowBase = (gy - minCY) * cols - minCX
        for (let gx = gxLo; gx <= gxHi; gx++) {
          const cell = rowBase + gx
          const end = starts[cell + 1]!
          for (let p = starts[cell]!; p < end; p++) {
            const j = order[p]!
            if (j <= i) continue
            let dx = xi - xs[j]!
            let dy = yi - ys[j]!
            let dist2 = dx * dx + dy * dy
            if (dist2 > cutoff2) continue
            if (dist2 < 1e-6) {
              dx = ((i % 13) - 6) * 0.1 + 0.05
              dy = ((j % 11) - 5) * 0.1 + 0.05
              dist2 = dx * dx + dy * dy
            }
            const dist = Math.sqrt(dist2)
            const force = k2 / dist
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            fxi += fx
            fyi += fy
            dispX[j]! -= fx
            dispY[j]! -= fy
          }
        }
      }
      dispX[i]! += fxi
      dispY[i]! += fyi
    }

    // Springs along edges (Fruchterman-Reingold attraction).
    for (let e = 0; e < edgeCount; e++) {
      const a = edgeA[e]!
      const b = edgeB[e]!
      let dx = xs[a]! - xs[b]!
      let dy = ys[a]! - ys[b]!
      let dist2 = dx * dx + dy * dy
      if (dist2 < 1e-6) {
        dx = 0.1
        dy = 0.1
        dist2 = 0.02
      }
      const dist = Math.sqrt(dist2)
      const force = (dist2 / IDEAL) * edgeW[e]!
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      dispX[a]! -= fx
      dispY[a]! -= fy
      dispX[b]! += fx
      dispY[b]! += fy
    }

    // Weak linear pull toward the centre, plus a quadratic soft wall past R_SOFT,
    // then move, clamped by the cooling temperature.
    const temp = T0 * (1 - iter / ITERS) + TMIN
    for (let i = 0; i < n; i++) {
      const g = CENTER_GRAVITY * gmul[i]!
      let gx = xs[i]! * g
      let gy = ys[i]! * g
      const r = Math.sqrt(xs[i]! * xs[i]! + ys[i]! * ys[i]!)
      if (r > R_SOFT) {
        const over = (r - R_SOFT) * BOUNDARY
        gx += (xs[i]! / r) * over
        gy += (ys[i]! / r) * over
      }
      const dx = dispX[i]! - gx
      const dy = dispY[i]! - gy
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < 1e-9) continue
      const scale = Math.min(d, temp) / d
      xs[i]! += dx * scale
      ys[i]! += dy * scale
    }
  }

  // GraphMap draws nodes at a FIXED pixel radius (radiusOf, not scaled by zoom),
  // so a uniformly-scaled layout overlaps exactly the same after fit-to-view —
  // the spring/repulsion balance alone leaves the dense core a pile of touching
  // discs. Separate them explicitly: push any pair closer than their combined
  // render radii (× SEP_K, in layout units) apart. Collision only fires in packed
  // regions, so it inflates the core relative to the sparse rim, which is exactly
  // what buys each core node more screen area once the map is fitted.
  deoverlap(xs, ys, nodes)

  const outX = new Array<number>(n)
  const outY = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    outX[i] = Math.round(xs[i]! * 10) / 10
    outY[i] = Math.round(ys[i]! * 10) / 10
  }
  return { xs: outX, ys: outY }
}

// Node separation as a multiple of its on-screen render radius. GraphMap draws
// r = clamp(3 + sqrt(deg)*1.15, 3, 14) px; SEP_K scales that into the layout-unit
// keep-apart distance. Higher = airier map, fewer nodes per screenful.
const SEP_K = 6.5
const SEP_SWEEPS = 280
const SEP_STRENGTH = 0.7

/** The GraphMap render radius, in px — mirrored here so separation tracks it. */
function renderRadius(degree: number): number {
  const r = 3 + Math.sqrt(degree) * 1.15
  return r < 3 ? 3 : r > 14 ? 14 : r
}

/**
 * Iteratively push apart any two nodes closer than SEP_K × (their combined render
 * radii). A uniform grid keeps it O(n) per sweep; the cell size is the largest
 * possible keep-apart distance so a 3×3 neighbourhood always covers every clash.
 */
function deoverlap(xs: Float64Array, ys: Float64Array, nodes: GraphNode[]): void {
  const n = nodes.length
  const sep = new Float64Array(n)
  let maxSep = 1
  for (let i = 0; i < n; i++) {
    sep[i] = renderRadius(nodes[i]!.d) * SEP_K
    if (sep[i]! > maxSep) maxSep = sep[i]!
  }
  const cell = maxSep * 2
  const cellX = new Int32Array(n)
  const cellY = new Int32Array(n)
  const cellId = new Int32Array(n)
  const order = new Int32Array(n)

  for (let sweep = 0; sweep < SEP_SWEEPS; sweep++) {
    let minCX = Infinity
    let minCY = Infinity
    let maxCX = -Infinity
    let maxCY = -Infinity
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(xs[i]! / cell)
      const cy = Math.floor(ys[i]! / cell)
      cellX[i] = cx
      cellY[i] = cy
      if (cx < minCX) minCX = cx
      if (cx > maxCX) maxCX = cx
      if (cy < minCY) minCY = cy
      if (cy > maxCY) maxCY = cy
    }
    const cols = maxCX - minCX + 1
    const cellCount = cols * (maxCY - minCY + 1)
    const starts = new Int32Array(cellCount + 1)
    for (let i = 0; i < n; i++) {
      const c = (cellY[i]! - minCY) * cols + (cellX[i]! - minCX)
      cellId[i] = c
      starts[c + 1]!++
    }
    for (let c = 1; c <= cellCount; c++) starts[c]! += starts[c - 1]!
    const cursor = starts.slice(0, cellCount)
    for (let i = 0; i < n; i++) order[cursor[cellId[i]!]!++] = i

    for (let i = 0; i < n; i++) {
      const cx = cellX[i]!
      const cy = cellY[i]!
      const gxLo = cx - 1 < minCX ? minCX : cx - 1
      const gxHi = cx + 1 > maxCX ? maxCX : cx + 1
      const gyLo = cy - 1 < minCY ? minCY : cy - 1
      const gyHi = cy + 1 > maxCY ? maxCY : cy + 1
      for (let gy = gyLo; gy <= gyHi; gy++) {
        const rowBase = (gy - minCY) * cols - minCX
        for (let gx = gxLo; gx <= gxHi; gx++) {
          const end = starts[rowBase + gx + 1]!
          for (let p = starts[rowBase + gx]!; p < end; p++) {
            const j = order[p]!
            if (j <= i) continue
            let dx = xs[i]! - xs[j]!
            let dy = ys[i]! - ys[j]!
            let d = Math.sqrt(dx * dx + dy * dy)
            const minD = sep[i]! + sep[j]!
            if (d >= minD) continue
            if (d < 1e-6) {
              dx = ((i % 13) - 6) * 0.1 + 0.05
              dy = ((j % 11) - 5) * 0.1 + 0.05
              d = Math.sqrt(dx * dx + dy * dy)
            }
            const push = ((minD - d) * 0.5 * SEP_STRENGTH) / d
            const px = dx * push
            const py = dy * push
            xs[i]! += px
            ys[i]! += py
            xs[j]! -= px
            ys[j]! -= py
          }
        }
      }
    }
  }
}

/** FNV-1a — a stable integer hash of a stem, seeding the PRNG. */
function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------------ cache -- */

// Resolved against the rootDir (cwd) so it points at `<rootDir>/.data` in both
// the config-load and Nitro-runtime contexts (see VAULT_DIR in ./vault).
const CACHE_DIR = resolve(process.cwd(), '.data')
const CACHE_FILE = resolve(CACHE_DIR, 'graph-layout.v2.json')

// Folded into the cache key so any change to the force-layout tuning recomputes
// instead of silently serving a layout produced by the old parameters.
const LAYOUT_SIGNATURE = [IDEAL, CUTOFF, ITERS, T0, TMIN, CENTER_GRAVITY, R_INNER, R_OUTER, HUB_DAMPING, R_SOFT, BOUNDARY, ISO_PULL, SEP_K, SEP_SWEEPS, SEP_STRENGTH].join(',')

function cacheKey(stems: string[], edges: GraphEdge[]): string {
  const h = createHash('sha1')
  h.update(LAYOUT_SIGNATURE)
  h.update('|')
  h.update(stems.join('\n'))
  h.update('|')
  h.update(edges.map(e => `${e[0]},${e[1]}`).join(';'))
  return h.digest('hex')
}

function readCache(key: string, n: number): { xs: number[], ys: number[] } | undefined {
  try {
    const raw = JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as { key?: string, xs?: number[], ys?: number[] }
    if (raw.key === key && raw.xs?.length === n && raw.ys?.length === n) {
      return { xs: raw.xs, ys: raw.ys }
    }
  } catch {
    // Missing / stale / corrupt cache is never fatal — we just recompute.
  }
  return undefined
}

function writeCache(key: string, coords: { xs: number[], ys: number[] }): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(CACHE_FILE, JSON.stringify({ key, xs: coords.xs, ys: coords.ys }))
  } catch {
    // An unwritable .data dir must not fail the request.
  }
}
