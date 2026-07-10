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

function build(): GraphIndex {
  const index = buildVaultIndex()
  // Sorted so the node order — and therefore the layout cache key — is stable
  // regardless of the filesystem's readdir order.
  const stems = walkVault().slice().sort()

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
const ITERS = 520
const T0 = 120 // starting max displacement per step
const TMIN = 2
const CENTER_GRAVITY = 0.01
const R_INNER = 200
const R_OUTER = 1600

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

  // Flatten edges into typed arrays for the spring pass.
  const edgeCount = edges.length
  const edgeA = new Int32Array(edgeCount)
  const edgeB = new Int32Array(edgeCount)
  for (let e = 0; e < edgeCount; e++) {
    edgeA[e] = edges[e]![0]
    edgeB[e] = edges[e]![1]
  }

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
      const force = dist2 / IDEAL
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      dispX[a]! -= fx
      dispY[a]! -= fy
      dispX[b]! += fx
      dispY[b]! += fy
    }

    // Weak pull toward the centroid, then move, clamped by the cooling temperature.
    const temp = T0 * (1 - iter / ITERS) + TMIN
    for (let i = 0; i < n; i++) {
      const dx = dispX[i]! - xs[i]! * CENTER_GRAVITY
      const dy = dispY[i]! - ys[i]! * CENTER_GRAVITY
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < 1e-9) continue
      const scale = Math.min(d, temp) / d
      xs[i]! += dx * scale
      ys[i]! += dy * scale
    }
  }

  const outX = new Array<number>(n)
  const outY = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    outX[i] = Math.round(xs[i]! * 10) / 10
    outY[i] = Math.round(ys[i]! * 10) / 10
  }
  return { xs: outX, ys: outY }
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
const CACHE_FILE = resolve(CACHE_DIR, 'graph-layout.v1.json')

function cacheKey(stems: string[], edges: GraphEdge[]): string {
  const h = createHash('sha1')
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
