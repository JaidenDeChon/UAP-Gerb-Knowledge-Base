export interface DockRect { x: number, y: number, w: number, h: number }

const MIN_W = 240
const RATIO = 16 / 9
const STORAGE_KEY = 'ufo:dock'

export const DEFAULT_RECT: DockRect = { x: 24, y: 24, w: 384, h: Math.round(384 / RATIO) }

/**
 * Force a rect fully inside a viewport, preserving 16:9.
 *
 * Geometry is persisted across sessions, so a rect saved on a large display can
 * come back on a small one — without this the dock would open offscreen and be
 * unreachable. Pure, so it is unit-tested without a DOM.
 */
export function clampRect(rect: DockRect, vw: number, vh: number): DockRect {
  let w = Math.max(MIN_W, Math.min(rect.w, vw))
  let h = Math.round(w / RATIO)
  if (h > vh) {
    h = Math.max(Math.round(MIN_W / RATIO), vh)
    w = Math.round(h * RATIO)
  }
  const x = Math.max(0, Math.min(rect.x, Math.max(0, vw - w)))
  const y = Math.max(0, Math.min(rect.y, Math.max(0, vh - h)))
  return { x, y, w, h }
}

function readStored(): Partial<DockRect> & { minimised?: boolean } {
  if (import.meta.server) return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  }
  catch {
    // Private mode, blocked site data, or corrupt JSON — defaults are fine.
    return {}
  }
}

export function persistDock(rect: DockRect, minimised: boolean): void {
  if (import.meta.server) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rect, minimised }))
  }
  catch {
    // Non-fatal: the dock simply won't remember where it was.
  }
}

/**
 * The app-global video dock. Mounted once in the default layout, so playback
 * survives navigation between wiki notes.
 */
export function useVideoDock() {
  const videoId = useState<string | null>('dock:video', () => null)
  const title = useState<string>('dock:title', () => '')
  const visible = useState<boolean>('dock:visible', () => false)
  const minimised = useState<boolean>('dock:minimised', () => false)
  const rect = useState<DockRect>('dock:rect', () => ({ ...DEFAULT_RECT }))

  /** Set by cues, consumed by the player once the IFrame API is ready. Last wins. */
  const pendingSeek = useState<number | null>('dock:seek', () => null)

  /** Restore geometry from localStorage, clamped to the current viewport. */
  function hydrate(): void {
    const stored = readStored()
    const merged = { ...DEFAULT_RECT, ...stored }
    rect.value = clampRect(merged, window.innerWidth, window.innerHeight)
    if (typeof stored.minimised === 'boolean') minimised.value = stored.minimised
  }

  function open(opts: { videoId: string, title?: string, at?: number }): void {
    videoId.value = opts.videoId
    if (opts.title) title.value = opts.title
    visible.value = true
    minimised.value = false
    if (typeof opts.at === 'number') pendingSeek.value = opts.at
  }

  function close(): void {
    visible.value = false
    videoId.value = null
    pendingSeek.value = null
  }

  function toggleMinimise(): void {
    minimised.value = !minimised.value
    persistDock(rect.value, minimised.value)
  }

  /** Seek the dock. Opens it first if it is closed and we know which video. */
  function seek(seconds: number): void {
    pendingSeek.value = Math.max(0, Math.round(seconds))
    if (videoId.value) {
      visible.value = true
      minimised.value = false
    }
  }

  return {
    videoId, title, visible, minimised, rect, pendingSeek,
    hydrate, open, close, toggleMinimise, seek,
  }
}
