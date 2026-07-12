import { computed, type ComputedRef, type Ref } from 'vue'

export type ThemeId = 'light' | 'sepia' | 'dim' | 'dark'

export interface ThemeMeta {
  id: ThemeId
  label: string
  /** Lucide kebab name. */
  icon: string
}

// Labels riff on UAP lore — Hynek's sighting classes for the two lit themes,
// deep-state jargon for the dark pair. Ids stay stable: they're persisted in
// the theme cookie and matched by the [data-theme] CSS selectors.
export const THEMES: readonly ThemeMeta[] = [
  { id: 'light', label: 'Daylight Disc', icon: 'sun' },
  { id: 'sepia', label: 'Majestic', icon: 'book-open' },
  { id: 'dim', label: 'Nocturnal Lights', icon: 'cloud-moon' },
  { id: 'dark', label: 'Black Program', icon: 'moon' },
]

const DARK_THEMES: ReadonlySet<ThemeId> = new Set<ThemeId>(['dark', 'dim'])

function useThemeCookie(): Ref<ThemeId> {
  return useCookie<ThemeId>('uapgdb-theme', {
    default: () => 'light',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    watch: true,
  })
}

export function useTheme(): {
  theme: Ref<ThemeId>
  setTheme: (t: ThemeId) => void
  current: ComputedRef<ThemeMeta>
  isDark: ComputedRef<boolean>
  themes: readonly ThemeMeta[]
} {
  const theme = useThemeCookie()

  const setTheme = (t: ThemeId): void => {
    theme.value = t
  }

  const current = computed<ThemeMeta>(
    () => THEMES.find((t) => t.id === theme.value) ?? THEMES[0]!,
  )

  const isDark = computed<boolean>(() => DARK_THEMES.has(theme.value))

  return { theme, setTheme, current, isDark, themes: THEMES }
}

/** Call once, from app.vue: reflects the theme onto <html> for SSR + no flash. */
export function useThemeHead(): void {
  const theme = useThemeCookie()
  const colorScheme = computed<'light' | 'dark'>(() =>
    DARK_THEMES.has(theme.value) ? 'dark' : 'light',
  )

  useHead({
    htmlAttrs: {
      'data-theme': computed(() => theme.value),
      style: computed(() => `color-scheme: ${colorScheme.value}`),
    },
  })
}
