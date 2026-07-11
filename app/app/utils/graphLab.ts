import type { GraphNode } from '#shared/types/wiki'
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
export function readGraphPalette(): GraphPalette {
  const style = getComputedStyle(document.documentElement)
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return FALLBACK

  const resolve = (name: string, fallback: string): string => {
    const triplet = style.getPropertyValue(name).trim()
    if (!triplet) return fallback
    ctx.fillStyle = fallback
    ctx.fillStyle = `hsl(${triplet})`
    return typeof ctx.fillStyle === 'string' ? ctx.fillStyle : fallback
  }

  return {
    background: resolve('--background', FALLBACK.background),
    node: resolve('--graph-node', FALLBACK.node),
    edge: resolve('--graph-edge', FALLBACK.edge),
    primary: resolve('--primary', FALLBACK.primary),
    foreground: resolve('--foreground', FALLBACK.foreground),
  }
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
