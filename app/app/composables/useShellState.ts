/**
 * Shell state shared between the layout, the top bar, and the pages that fill them.
 * Pages own the title; the chrome only reads it.
 */

/** Set by each page; read by the top bar. Empty on the graph homepage. */
export function usePageTitle() {
  return useState<string>('shell:title', () => '')
}

/** Mobile only — the sidebar is an overlay under 900px. */
export function useSidebarOpen() {
  return useState<boolean>('shell:sidebar', () => false)
}

/** The ⌘K command palette. */
export function useCommandOpen() {
  return useState<boolean>('shell:command', () => false)
}

/**
 * User preference: show the docked local map on article pages. Persisted so the
 * choice survives reloads. Toggled from the sidebar's Appearance section and by
 * the local map's own close button.
 */
export function useLocalMapEnabled() {
  return useCookie<boolean>('uapgdb-local-map', {
    default: () => true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    watch: true,
  })
}
