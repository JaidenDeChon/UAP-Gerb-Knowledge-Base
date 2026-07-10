import type { MaybeRefOrGetter } from 'vue'
import type { GraphPayload, NoteLinks, NotePreview, TreeItem } from '#shared/types/wiki'

/**
 * The whole knowledge graph, fetched client-only (~165 KB). Keyed so the
 * homepage and the docked mini-map share a single request.
 */
export function useGraph() {
  return useAsyncData<GraphPayload>('wiki:graph', () => $fetch<GraphPayload>('/api/graph'), {
    server: false,
  })
}

/** The sidebar folder tree, SSR-rendered and deduped across components. */
export function useTree() {
  return useAsyncData<TreeItem[]>('wiki:tree', () => $fetch<TreeItem[]>('/api/tree'))
}

/** Outgoing links + backlinks for one note; re-fetches when `path` changes. */
export function useNoteLinks(path: MaybeRefOrGetter<string>) {
  return useAsyncData<NoteLinks>(
    `wiki:links:${toValue(path)}`,
    () => $fetch<NoteLinks>('/api/links', { query: { path: toValue(path) } }),
    { watch: [() => toValue(path)] },
  )
}

// Promise-level cache so repeated hovers over the same link fetch it once.
const previewCache = new Map<string, Promise<NotePreview>>()

/** Fetch a note's hover-card preview, memoized per path for the session. */
export function fetchNotePreview(path: string): Promise<NotePreview> {
  const existing = previewCache.get(path)
  if (existing) return existing

  const request = $fetch<NotePreview>('/api/preview', { query: { path } }).catch((error) => {
    previewCache.delete(path)
    throw error
  })
  previewCache.set(path, request)
  return request
}
