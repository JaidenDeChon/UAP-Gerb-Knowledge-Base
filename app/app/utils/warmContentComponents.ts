import type { Component } from 'vue'

/**
 * Everything an article's Markdown renders through is loaded lazily, each in
 * its own chunk, and fetched only when the article renders:
 * - our content components (`::wiki-stat-strip` and the rest);
 * - @nuxtjs/mdc's prose components (ProseP, ProseH2, ProseUl…), registered as
 *   global async components.
 * The renderer waits for every component a block uses before showing it, so
 * on a slow connection whole stretches of the article (the stat strip first
 * among them) popped in after the loader had already handed off. Fetching
 * them alongside the note means the article renders complete. Vite puts a
 * module in exactly one chunk, so these are the same chunks the renderer asks
 * for; nothing is downloaded twice.
 */
const contentLoaders = import.meta.glob('../components/content/*.vue')

let warm: Promise<void> | null = null

export function warmContentComponents(): Promise<void> {
  if (warm) return warm
  const registry = (tryUseNuxtApp()?.vueApp._context.components ?? {}) as Record<string, Component>
  const globalLoaders = Object.values(registry)
    .map(c => (c as { __asyncLoader?: () => Promise<unknown> }).__asyncLoader)
    .filter((load): load is () => Promise<unknown> => typeof load === 'function')
  warm = Promise.all([...Object.values(contentLoaders), ...globalLoaders].map(load => load()))
    .then(() => undefined)
    // A failed prefetch only means the renderer fetches it itself, as before.
    .catch(() => undefined)
  return warm
}
