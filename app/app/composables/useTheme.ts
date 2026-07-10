import { computed, type ComputedRef, type Ref } from 'vue'

export type ThemeId = 'light' | 'sepia' | 'dim' | 'dark'

export interface ThemeMeta {
  id: ThemeId
  label: string
  subtitle: string
  /** Lucide kebab name. */
  icon: string
}

export const THEMES: readonly ThemeMeta[] = [
  { id: 'light', label: 'Light', subtitle: 'default · high contrast', icon: 'sun' },
  { id: 'sepia', label: 'Sepia', subtitle: 'less-light · warm paper', icon: 'book-open' },
  { id: 'dim', label: 'Dim', subtitle: 'less-dark · softened', icon: 'cloud-moon' },
  { id: 'dark', label: 'Dark', subtitle: 'high contrast', icon: 'moon' },
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
