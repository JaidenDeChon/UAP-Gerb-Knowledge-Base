/** A runtime as `2h 44m` / `38m`, or null when unknown. */
export function formatRuntime(seconds: number | null | undefined): string | null {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return null
  // Round to minutes first — rounding the remainder instead yields "1h 60m".
  const total = Math.round(value / 60)
  const hours = Math.floor(total / 60)
  return hours ? `${hours}h ${total % 60}m` : `${total}m`
}

// Pinned to UTC so the server render and the client hydrate to the same day.
const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** An ISO timestamp as `Jul 10, 2026`, or null. */
export function formatDay(iso: string | null | undefined): string | null {
  const time = iso ? Date.parse(iso) : Number.NaN
  return Number.isFinite(time) ? DATE.format(time) : null
}

/** YouTube's 320×180 thumbnail (always 16:9, unlike the letterboxed `hqdefault`). */
export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`
}
