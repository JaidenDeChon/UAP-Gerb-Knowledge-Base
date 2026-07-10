/**
 * Shared vocabulary for the vault: the sidebar tree, the knowledge graph, and
 * the link sidecar. Imported by both the Nitro routes that build these
 * structures and the Vue components that render them.
 */

/** Top-level vault folder a note belongs to. `Root` is the vault's own Home note. */
export type Category =
  | 'Root'
  | 'MOCs'
  | 'People'
  | 'Organizations'
  | 'Operations'
  | 'Events'
  | 'Locations'
  | 'Concepts'
  | 'Videos'

/** Order the sidebar and any category listing render in. */
export const CATEGORY_ORDER: Category[] = [
  'MOCs',
  'People',
  'Organizations',
  'Operations',
  'Events',
  'Locations',
  'Concepts',
  'Videos',
]

/** Lucide glyph name per category, used by the sidebar and command palette. */
export const CATEGORY_ICON: Record<Category, string> = {
  Root: 'house',
  MOCs: 'compass',
  People: 'users',
  Organizations: 'building-2',
  Operations: 'crosshair',
  Events: 'calendar-clock',
  Locations: 'map-pin',
  Concepts: 'atom',
  Videos: 'clapperboard',
}

/* ------------------------------------------------------------------ tree -- */

export interface TreeNote {
  type: 'note'
  /** Display label — the note's basename, or `Summary` / `Transcript` inside a video folder. */
  name: string
  /** Route path, e.g. `/wiki/people/aj-hartley`. Matches @nuxt/content's own routes. */
  path: string
}

export interface TreeFolder {
  type: 'folder'
  /** Display label — the folder's basename. */
  name: string
  /** Stable identity for expand/collapse state, e.g. `Videos/Some Title`. */
  id: string
  /** Total notes in this folder and everything under it. */
  count: number
  children: TreeItem[]
}

export type TreeItem = TreeFolder | TreeNote

/* ----------------------------------------------------------------- graph -- */

/**
 * One vault note as a graph node. Keys are terse because the whole graph ships
 * to the client as one payload (~1.1k nodes, ~6.3k edges).
 */
export interface GraphNode {
  /** Index into `GraphPayload.nodes`; edges reference nodes by this. */
  i: number
  /** Label drawn under the node. */
  l: string
  /** Route path. */
  p: string
  /** Top-level folder. */
  c: Category
  /** Number of incident edges. Drives node radius. */
  d: number
  /** Precomputed layout position, in graph space. */
  x: number
  y: number
}

/** Undirected, deduplicated, self-loop-free. Endpoints are `GraphNode.i`. */
export type GraphEdge = [number, number]

export interface GraphPayload {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Bounding box of the precomputed layout, so viewers can fit-to-screen. */
  bounds: { minX: number, minY: number, maxX: number, maxY: number }
}

/* ----------------------------------------------------------------- links -- */

/** A note referenced from somewhere else — enough to render a chip or preview. */
export interface NoteRef {
  path: string
  title: string
  category: Category
}

export interface NoteLinks {
  /** Notes this note links out to, deduplicated, in first-appearance order. */
  outgoing: NoteRef[]
  /** Notes that link to this note. */
  backlinks: NoteRef[]
}

/** What a hover-card shows before you commit to following a link. */
export interface NotePreview extends NoteRef {
  /** First paragraph, wikilinks flattened to their labels, trimmed to ~240 chars. */
  lead: string
  tags: string[]
}

/* ------------------------------------------------------------ baked data -- */

/**
 * The vault, scanned at build time and inlined into the server bundle (see
 * `wiki/bake.ts` and `nitro.virtual` in nuxt.config). Links and previews are
 * arrays indexed by `GraphNode.i` — keying them by route path would duplicate
 * every path several times over, for ~600 KB of dead weight in the function.
 */
export interface BakedLinks {
  outgoing: number[][]
  backlinks: number[][]
}

/** Per-note preview. `path` and `category` come from the matching `GraphNode`. */
export interface BakedPreview {
  title: string
  lead: string
  tags: string[]
}

export interface WikiData {
  tree: TreeItem[]
  graph: GraphPayload
  links: BakedLinks
  previews: BakedPreview[]
}
