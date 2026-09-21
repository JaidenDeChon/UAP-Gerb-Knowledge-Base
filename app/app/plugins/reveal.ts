import type { DirectiveBinding, ObjectDirective } from 'vue'

/**
 * `v-reveal` — fade/rise an element in the first time it scrolls into view.
 *
 * Usage: `<li v-reveal>` or `<div v-reveal="{ delay: 80 }">`. The directive
 * adds `ufo-reveal` (the resting, hidden state — see main.css) on mount and
 * `is-in` once the element intersects the viewport; the CSS transition does
 * the rest. Nothing is hidden until the client mounts, so server-rendered
 * HTML is always fully visible (no-JS readers and crawlers see everything),
 * and `prefers-reduced-motion: reduce` skips the whole mechanism — the
 * element simply stays visible.
 *
 * Elements already in view when they mount (above the fold on first paint)
 * are shown at once, without a transition, so a page never "blinks in".
 * Reads and writes are batched across one frame so mounting 40+ list items
 * costs one layout, not forty.
 */

interface RevealOptions { delay?: number }
/** `v-reveal="false"` opts an element out — e.g. a list re-rendered after a filter change. */
type RevealValue = RevealOptions | false | undefined

const HIDDEN = 'ufo-reveal'
const SHOWN = 'is-in'

let observer: IntersectionObserver | null = null
let pending: Array<{ el: HTMLElement, delay: number }> = []
let frame = 0

function reducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function getObserver(): IntersectionObserver {
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const el = entry.target as HTMLElement
      el.classList.add(SHOWN)
      observer!.unobserve(el)
    }
  }, {
    // Trigger a little before the element clears the bottom edge so the
    // rise finishes as it enters the reading area rather than after.
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.05,
  })
  return observer
}

function flush(): void {
  frame = 0
  const batch = pending
  pending = []
  const viewportBottom = window.innerHeight
  // All reads first…
  const visible = batch.map(({ el }) => el.getBoundingClientRect().top < viewportBottom)
  // …then all writes.
  batch.forEach(({ el, delay }, i) => {
    if (visible[i]) return
    el.classList.add(HIDDEN)
    if (delay) el.style.setProperty('--reveal-delay', `${delay}ms`)
    getObserver().observe(el)
  })
}

function options(binding: DirectiveBinding<RevealValue>): RevealOptions {
  return binding.value && typeof binding.value === 'object' ? binding.value : {}
}

const reveal: ObjectDirective<HTMLElement, RevealValue> = {
  mounted(el, binding) {
    if (binding.value === false) return
    if (reducedMotion() || typeof IntersectionObserver === 'undefined') return
    pending.push({ el, delay: options(binding).delay ?? 0 })
    if (!frame) frame = requestAnimationFrame(flush)
  },
  unmounted(el) {
    observer?.unobserve(el)
    pending = pending.filter(p => p.el !== el)
  },
  // Render nothing extra on the server: the hidden class is only ever added
  // client-side, after mount.
  getSSRProps() {
    return {}
  },
}

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('reveal', reveal)
})
