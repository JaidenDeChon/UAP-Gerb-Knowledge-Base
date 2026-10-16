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
 * Desktop only: the sidebar slimmed to an icon rail. Kept in a cookie so the
 * server renders the same width the reader left it at (no flash on load), and
 * mirrored in shared state so every reader sees a toggle at once.
 */
export function useSidebarCollapsed() {
  const cookie = useCookie<boolean>('uapgdb-sidebar-collapsed', {
    default: () => false,
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  const collapsed = useState<boolean>('shell:sidebar-collapsed', () => cookie.value === true)
  function toggle(): void {
    collapsed.value = !collapsed.value
    cookie.value = collapsed.value
  }
  return { collapsed, toggle }
}
