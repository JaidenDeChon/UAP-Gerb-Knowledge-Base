import type { Category, GraphNode } from '#shared/types/wiki'
import { clamp } from '~/utils/graph'

/**
 * Shared helpers for the map-lab renderers (`/map/*`). Canvas and WebGL
 * renderers can't read CSS custom properties the way the SVG map's classes do,
 * so the theme palette is resolved to concrete colors here.
 */

/** Node radius in screen px from degree — the same formula the SVG map uses. */
export function nodeRadius(degree: number): number {
  return clamp(3 + Math.sqrt(degree) * 1.15, 3, 14)
}

export interface GraphPalette {
  background: string
  node: string
  edge: string
  primary: string
  foreground: string
}

const FALLBACK: GraphPalette = {
  background: '#ffffff',
  node: '#16a34a',
  edge: '#64748b',
  primary: '#16a34a',
  foreground: '#0a0a0a',
}

/**
 * Resolve the active theme's `--x: H S% L%` custom properties to `#rrggbb`.
 * A 2D context normalises any CSS color assigned to `fillStyle` back to hex,
 * which spares us a hand-rolled HSL→RGB conversion. Client-only.
 */
function makeCssResolver(): ((name: string, fallback: string) => string) | null {
  const style = getComputedStyle(document.documentElement)
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return null

  return (name: string, fallback: string): string => {
    const triplet = style.getPropertyValue(name).trim()
    if (!triplet) return fallback
    ctx.fillStyle = fallback
    ctx.fillStyle = `hsl(${triplet})`
    return typeof ctx.fillStyle === 'string' ? ctx.fillStyle : fallback
  }
}

export function readGraphPalette(): GraphPalette {
  const resolve = makeCssResolver()
  if (!resolve) return FALLBACK

  return {
    background: resolve('--background', FALLBACK.background),
    node: resolve('--graph-node', FALLBACK.node),
    edge: resolve('--graph-edge', FALLBACK.edge),
    primary: resolve('--primary', FALLBACK.primary),
    foreground: resolve('--foreground', FALLBACK.foreground),
  }
}

/* ------------------------------------------------------- category colors -- */

/**
 * Theme variable per category (see main.css). `Root` is the lone Home note —
 * it rides with MOCs rather than spending a 9th hue on one node.
 */
export const CATEGORY_COLOR_VAR: Record<Category, string> = {
  Root: '--graph-cat-mocs',
  MOCs: '--graph-cat-mocs',
  People: '--graph-cat-people',
  Organizations: '--graph-cat-orgs',
  Operations: '--graph-cat-ops',
  Events: '--graph-cat-events',
  Locations: '--graph-cat-locations',
  Concepts: '--graph-cat-concepts',
  Videos: '--graph-cat-videos',
}

/** Light-theme values, doubling as SSR/no-canvas fallbacks. */
const CATEGORY_FALLBACK: Record<Category, string> = {
  Root: '#008300',
  MOCs: '#008300',
  People: '#2a78d6',
  Organizations: '#eda100',
  Operations: '#e34948',
  Events: '#4a3aa7',
  Locations: '#1baf7a',
  Concepts: '#e87ba4',
  Videos: '#eb6834',
}

/**
 * Legend display order. Not CATEGORY_ORDER: this sequence is the one validated
 * for color-vision-deficiency separation of *adjacent* swatches (the palette's
 * slot order), so neighbouring legend rows never carry confusable hues.
 */
export const CATEGORY_LEGEND_ORDER: Category[] = [
  'People',
  'Locations',
  'Organizations',
  'MOCs',
  'Events',
  'Operations',
  'Concepts',
  'Videos',
]

/** Resolve every category's node color from the active theme. Client-only. */
export function readCategoryColors(): Record<Category, string> {
  const resolve = makeCssResolver()
  if (!resolve) return { ...CATEGORY_FALLBACK }

  const out = {} as Record<Category, string>
  for (const c of Object.keys(CATEGORY_COLOR_VAR) as Category[]) {
    out[c] = resolve(CATEGORY_COLOR_VAR[c], CATEGORY_FALLBACK[c])
  }
  return out
}

/** `#rrggbb` → `#rrggbbaa`. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(clamp(alpha, 0, 1) * 255)
  return hex + a.toString(16).padStart(2, '0')
}

/**
 * Index of the node nearest to screen point `(sx, sy)` and within its radius
 * (+`slop` px), or null. Screen position = `pan + graph * k`; radii are screen
 * px, matching how every home-brew renderer draws nodes.
 */
export function pickNode(
  nodes: GraphNode[],
  pan: { x: number, y: number },
  k: number,
  sx: number,
  sy: number,
  slop = 4,
): number | null {
  let best: number | null = null
  let bestDist = Infinity
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    const dx = pan.x + n.x * k - sx
    const dy = pan.y + n.y * k - sy
    const r = nodeRadius(n.d) + slop
    const d2 = dx * dx + dy * dy
    if (d2 <= r * r && d2 < bestDist) {
      bestDist = d2
      best = i
    }
  }
  return best
}
