<script setup lang="ts">
/**
 * The UFO loader, shown while a page is loading.
 *
 * It's pinned to the middle of the visible content area (below the 56px top
 * bar, beside the 280px sidebar from 901px up), so it's centred on every
 * page, wherever that page's own content would start.
 *
 * It fades in after a short delay, so a warm client-side hop that resolves in
 * a few frames never flashes it.
 *
 * When loading finishes, the loading state (and this with it) is removed all
 * at once, so a Vue leave transition never gets to run. Instead, just before
 * unmounting, the mark hands off to a clone on <body>. It's position: fixed,
 * so the clone sits exactly where the original was, with every running
 * animation synced to the original's current time. The clone then blurs out
 * until it has dissipated, and removes itself.
 */

const root = ref<HTMLElement | null>(null)

/** How long the blur-out runs. Matches `ufo-mark-out` below. */
const LEAVE_MS = 460

function handOff(): void {
  const el = root.value
  if (!el || typeof document === 'undefined') return
  const clone = el.cloneNode(true) as HTMLElement
  clone.classList.add('is-leaving')
  document.body.appendChild(clone)

  // The clone's CSS animations restart from their own start, so the craft
  // would jump. Pair up the elements (same order in both trees) and match
  // each animation's clock to the original's.
  const originals = [el, ...el.querySelectorAll<Element>('*')]
  const copies = [clone, ...clone.querySelectorAll<Element>('*')]
  originals.forEach((node, i) => {
    const copy = copies[i]
    if (!copy) return
    const running = node.getAnimations()
    for (const animation of copy.getAnimations()) {
      const name = (animation as CSSAnimation).animationName
      const match = running.find(a => (a as CSSAnimation).animationName === name)
      if (match?.currentTime != null) animation.currentTime = match.currentTime
    }
  })

  const done = () => clone.remove()
  clone.addEventListener('animationend', (event) => {
    if (event.target === clone) done()
  })
  // Belt and braces: remove it even if the event never arrives.
  setTimeout(done, LEAVE_MS + 200)
}

onBeforeUnmount(handOff)
</script>

<template>
  <div ref="root" class="ufo-loading-mark pointer-events-none" aria-hidden="true">
    <div class="ufo-loading-mark-inner">
      <AppUfoLoader />
    </div>
  </div>
</template>

<style scoped>
.ufo-loading-mark {
  --ufo-rail: 0px;
  position: fixed;
  z-index: 10;
  top: calc(56px + (100dvh - 56px) / 2);
  left: calc(var(--ufo-rail) + (100vw - var(--ufo-rail)) / 2);
  width: min(440px, calc((100vw - var(--ufo-rail)) * 0.88));
  transform: translate(-50%, -50%);
}
@media (min-width: 901px) {
  .ufo-loading-mark {
    --ufo-rail: 280px;
  }
}

.ufo-loading-mark-inner {
  animation: ufo-mark-in 0.5s var(--ease-standard) 0.25s both;
}

/* The hand-off clone (see handOff): a rapid blur until it has dissipated.
   The clone lives on <body>, outside this component, but it carries the
   component's scoped attribute, so these scoped rules still reach it. */
.ufo-loading-mark.is-leaving {
  animation: ufo-mark-out 460ms cubic-bezier(0.4, 0, 1, 1) forwards;
}

@keyframes ufo-mark-out {
  from { filter: blur(0); opacity: 1; transform: translate(-50%, -50%) scale(1); }
  60% { opacity: 0.6; }
  to { filter: blur(22px); opacity: 0; transform: translate(-50%, -50%) scale(1.08); }
}

@keyframes ufo-mark-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .ufo-loading-mark-inner {
    animation: none;
  }
  /* No blur or growth: a plain, quick fade. */
  .ufo-loading-mark.is-leaving {
    animation: ufo-mark-fade 200ms linear forwards;
  }
}
@keyframes ufo-mark-fade {
  to { opacity: 0; }
}
</style>
