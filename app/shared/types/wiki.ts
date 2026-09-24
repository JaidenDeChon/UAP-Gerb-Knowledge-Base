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
  /**
   * `[lat, lon]` in decimal degrees, from the note's `coordinates:`
   * frontmatter. Only present on notes that carry one (Location pages placed
   * on a `::wiki-map`); every other ref omits the key.
   */
  coordinates?: [number, number]
  /**
   * A portrait, for People notes that have one in `wiki/people-images.json`
   * (fetched offline by `scripts/fetch-people-images.mjs`, served from the
   * site's own `/people/`). Every other ref omits the key.
   */
  image?: NotePortrait
}

/**
 * A freely licensed portrait from Wikimedia Commons, stored in the repo. The
 * credit fields are what attribution needs: who made it, under what licence,
 * and the Commons file page it came from.
 */
export interface NotePortrait {
  /** Site-relative URL, e.g. `/people/david-grusch.webp`. */
  src: string
  width: number
  height: number
  /** Photographer or rights holder, as Commons records it (tidied). */
  author: string
  /** Licence short name, e.g. `CC BY-SA 4.0`, `Public domain`. */
  license: string
  /** The licence's deed, when it has one. */
  licenseUrl?: string
  /** The Commons file page (the credit's link). */
  source: string
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
  /** The note's portrait, when it has one (see `NoteRef.image`). */
  image?: NotePortrait
}

/**
 * What a page's server render needs before the note itself has loaded: its
 * title and share-card fields. Served from baked data (`/api/meta`), so an
 * article's first byte never waits on the content database.
 */
export interface NoteMeta {
  path: string
  title: string
  category: Category
  /** First paragraph, trimmed; empty for notes that have none (transcripts). */
  lead: string
  /** YouTube id, for a video summary. */
  videoId: string | null
  /** The note's portrait, for a People note that has one; otherwise absent. */
  image?: NotePortrait
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

/**
 * One video summary, as `wiki/videos.ts` bakes it. Title and lead come from the
 * matching `BakedPreview`, path from the `GraphNode` — both indexed by `i`.
 */
export interface BakedVideo {
  /** Index into `GraphPayload.nodes` / `WikiData.previews`. */
  i: number
  /** YouTube video id, from the summary's frontmatter. */
  id: string | null
  /** When the ingest pipeline processed it (ISO 8601), from `.processed_videos.json`. */
  at: string | null
  /** Runtime in seconds, when the summary records one. */
  dur: number | null
}

export interface WikiData {
  tree: TreeItem[]
  graph: GraphPayload
  links: BakedLinks
  previews: BakedPreview[]
  /** Every video summary, most recently processed first. */
  videos: BakedVideo[]
  /** `[lat, lon]` for each note with `coordinates:` frontmatter, keyed by `GraphNode.i`. */
  geo: BakedGeo
  /** Portrait for each People note in `wiki/people-images.json`, keyed by `GraphNode.i`. */
  portraits: BakedPortraits
  /** Every Location note, placed or not, for the `/world` page. See `wiki/places.ts`. */
  places: BakedPlaces
}

/** Sparse node index -> `[lat, lon]`. */
export type BakedGeo = Record<number, [number, number]>

/**
 * The Location notes as the `/world` page needs them. `placed` holds each
 * one with coordinates (its `GraphNode.i`, its `location_type` or `''`, and
 * the continent it's on); `unplaced` the indices of those without. Only
 * `placed` is served; `unplaced` is how wiki/places.test.ts checks that
 * every Location is either on the map or knowingly left off it.
 */
export interface BakedPlaces {
  placed: { i: number, t: string, k: WorldContinent }[]
  unplaced: number[]
}

/** Mirrors `Continent` in app/utils/world.ts (the types under shared/ can't import from app/). */
export type WorldContinent =
  | 'north-america'
  | 'south-america'
  | 'europe'
  | 'africa'
  | 'asia'
  | 'oceania'
  | 'antarctica'

/** A placed Location as `/api/places` serves it. */
export interface WorldPlace {
  path: string
  name: string
  lead: string
  /** `location_type` frontmatter, raw; `''` when the note has none. */
  type: string
  lat: number
  lon: number
  continent: WorldContinent
}

export interface WorldPlaces {
  places: WorldPlace[]
}

/** Sparse node index -> portrait. */
export type BakedPortraits = Record<number, NotePortrait>

/* ---------------------------------------------------------------- videos -- */

/** A video summary as `/api/videos` serves it — enough to render a card. */
export interface VideoCard {
  path: string
  title: string
  lead: string
  videoId: string | null
  processedAt: string | null
  durationSeconds: number | null
}
