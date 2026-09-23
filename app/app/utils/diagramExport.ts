/**
 * Pure helpers behind `useDiagramExport` (the PNG export for diagram
 * components such as `::wiki-org-chart`). Nothing here touches the DOM, so it
 * is unit-tested in `diagramExport.test.ts`.
 */

/** Longest file name (without extension) we hand the browser. */
export const MAX_FILENAME_LENGTH = 120

/** Lower-case, ASCII-only, hyphen-separated slug of one piece of a file name. */
export function slugPart(text: string | undefined | null): string {
  return (text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * A download file name built from its parts (article title, chart label, …),
 * e.g. `["The Hidden Wing", "US Air Force", "org chart"]` →
 * `the-hidden-wing--us-air-force--org-chart.png`. Parts are slugged, empty
 * ones dropped, and a repeated part (a chart whose root is the article's own
 * subject) is kept once. The result is trimmed to `MAX_FILENAME_LENGTH` at a
 * hyphen, and falls back to `diagram` when nothing usable is left.
 */
export function exportFileName(parts: ReadonlyArray<string | undefined | null>, ext = 'png'): string {
  const slugs: string[] = []
  for (const part of parts) {
    const slug = slugPart(part)
    if (slug && !slugs.includes(slug)) slugs.push(slug)
  }
  let base = slugs.join('--')
  if (base.length > MAX_FILENAME_LENGTH) {
    base = base.slice(0, MAX_FILENAME_LENGTH)
    const cut = base.lastIndexOf('-')
    if (cut > MAX_FILENAME_LENGTH / 2) base = base.slice(0, cut)
    base = base.replace(/-+$/, '')
  }
  return `${base || 'diagram'}.${ext}`
}

/**
 * Greedy word wrap for canvas text: splits `text` into lines no wider than
 * `maxWidth` according to `measure` (normally `ctx.measureText(s).width`). A
 * single word wider than the line is left on a line of its own rather than
 * broken mid-word.
 */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && measure(next) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * True when a computed CSS colour paints nothing: `transparent`, or an
 * `rgba()`/`rgb( / a)`/`hsla()` whose alpha is 0. Used to walk up from a
 * diagram to the first ancestor that actually paints its backdrop.
 */
export function isTransparentColor(color: string | undefined | null): boolean {
  if (!color) return true
  const c = color.trim().toLowerCase()
  if (!c || c === 'transparent') return true
  // rgba(0, 0, 0, 0) / hsla(…, 0) — alpha is the fourth comma-separated value.
  const commas = c.match(/^(?:rgba|hsla)\(([^)]*)\)$/)
  if (commas) {
    const alpha = commas[1]!.split(',')[3]
    return alpha !== undefined && Number.parseFloat(alpha) === 0
  }
  // Modern space syntax: rgb(0 0 0 / 0), color(srgb 0 0 0 / 0), oklch(… / 0).
  const slash = c.match(/\/\s*([\d.]+)(%?)\s*\)$/)
  return slash ? Number.parseFloat(slash[1]!) === 0 : false
}

/**
 * Scale that fits a `width`×`height` box inside `availWidth`×`availHeight`
 * without ever enlarging it past 1, and never shrinking it below `min` (past
 * that the viewer scrolls/pans instead — a 20% chart is unreadable).
 */
export function fitScale(
  width: number,
  height: number,
  availWidth: number,
  availHeight: number,
  min = 0.4,
): number {
  if (width <= 0 || height <= 0 || availWidth <= 0 || availHeight <= 0) return 1
  const fit = Math.min(1, availWidth / width, availHeight / height)
  return Math.max(min, fit)
}
