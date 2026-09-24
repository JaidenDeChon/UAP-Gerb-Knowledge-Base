import type { Ref } from 'vue'
import { type Hsl, parseHslToken } from '@/utils/world'

/**
 * The theme's colour tokens (`--primary`, `--card`…) as parsed HSL, for
 * drawing surfaces that can't use CSS variables: a WebGL globe, a canvas.
 * Re-read whenever the theme changes. Empty on the server and until mounted.
 */
export function useThemeTokens<K extends string>(names: readonly K[]): {
  tokens: Readonly<Ref<Partial<Record<K, Hsl>>>>
  isDark: Readonly<Ref<boolean>>
} {
  const { theme, isDark } = useTheme()
  const tokens = shallowRef<Partial<Record<K, Hsl>>>({})

  function read(): void {
    const style = getComputedStyle(document.documentElement)
    const out: Partial<Record<K, Hsl>> = {}
    for (const name of names) {
      const hsl = parseHslToken(style.getPropertyValue(`--${name}`))
      if (hsl) out[name] = hsl
    }
    tokens.value = out
  }

  onMounted(() => {
    read()
    // `data-theme` on <html> is set by useHead after the cookie changes, so
    // wait for that render before reading the new values.
    watch(theme, () => nextTick(() => requestAnimationFrame(read)))
  })

  return { tokens, isDark }
}
