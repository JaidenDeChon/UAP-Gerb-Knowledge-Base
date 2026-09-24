import { computed, ref, type ComputedRef, type Ref } from 'vue'

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
  { id: 'light', label: 'White Light', icon: 'sun' },
  { id: 'sepia', label: 'Majestic', icon: 'cloud-sun' },
  { id: 'dim', label: 'Night Ops', icon: 'cloud-moon' },
  { id: 'dark', label: 'Black Program', icon: 'moon' },
]

const DARK_THEMES: ReadonlySet<ThemeId> = new Set<ThemeId>(['dark', 'dim'])

const DARK_QUERY = '(prefers-color-scheme: dark)'

function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value)
}

/**
 * The reader's explicit pick. Deliberately has no default: an absent cookie
 * means "follow the OS", and a default would be written back on first visit,
 * pinning every new reader to it before they ever chose.
 */
function useThemeCookie(): Ref<ThemeId | null | undefined> {
  return useCookie<ThemeId | null | undefined>('uapgdb-theme', {
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    watch: true,
  })
}

// The OS appearance, tracked live so a reader who hasn't picked a theme
// follows their system's light/dark switch. Module-level because there is
// one OS per tab; on the server it's a constant 'light' (SSR can't see the
// preference), which the pre-paint script in useThemeHead corrects.
const systemTheme = ref<ThemeId>('light')
if (import.meta.client) {
  const mq = window.matchMedia(DARK_QUERY)
  systemTheme.value = mq.matches ? 'dark' : 'light'
  mq.addEventListener('change', (e) => {
    systemTheme.value = e.matches ? 'dark' : 'light'
  })
}

// Components rendered on the server saw systemTheme as 'light'. Until
// hydration finishes they must keep seeing that, or a dark-OS reader's theme
// switcher would hydrate against mismatched markup. <html>'s attributes
// aren't hydrated by Vue, so useThemeHead reads the real value throughout.
const hydrated = ref(false)

function resolve(cookie: ThemeId | null | undefined, system: ThemeId): ThemeId {
  return isThemeId(cookie) ? cookie : system
}

export function useTheme(): {
  theme: ComputedRef<ThemeId>
  setTheme: (t: ThemeId) => void
  current: ComputedRef<ThemeMeta>
  isDark: ComputedRef<boolean>
  themes: readonly ThemeMeta[]
} {
  const cookie = useThemeCookie()

  const theme = computed<ThemeId>(() =>
    resolve(cookie.value, hydrated.value ? systemTheme.value : 'light'),
  )

  const setTheme = (t: ThemeId): void => {
    cookie.value = t
  }

  const current = computed<ThemeMeta>(
    () => THEMES.find((t) => t.id === theme.value) ?? THEMES[0]!,
  )

  const isDark = computed<boolean>(() => DARK_THEMES.has(theme.value))

  return { theme, setTheme, current, isDark, themes: THEMES }
}

/** Call once, from app.vue: reflects the theme onto <html> for SSR + no flash. */
export function useThemeHead(): void {
  const cookie = useThemeCookie()
  const theme = computed<ThemeId>(() => resolve(cookie.value, systemTheme.value))
  const colorScheme = computed<'light' | 'dark'>(() =>
    DARK_THEMES.has(theme.value) ? 'dark' : 'light',
  )

  if (import.meta.client) {
    useNuxtApp().hooks.hookOnce('app:suspense:resolve', () => {
      hydrated.value = true
    })
  }

  useHead({
    htmlAttrs: {
      'data-theme': theme,
      style: computed(() => `color-scheme: ${colorScheme.value}`),
    },
    // With no saved pick the server has to guess light. This runs before
    // first paint and switches a dark-OS reader over, so they never see a
    // white flash while the app boots.
    script: computed(() =>
      isThemeId(cookie.value)
        ? []
        : [{
            key: 'theme-system',
            innerHTML: `if(matchMedia('${DARK_QUERY}').matches){var d=document.documentElement;d.setAttribute('data-theme','dark');d.style.colorScheme='dark'}`,
          }],
    ),
  })
}
