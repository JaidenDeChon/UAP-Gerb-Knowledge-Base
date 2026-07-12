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
