<script setup lang="ts">
/**
 * The UFO loader, placed over a page skeleton. The parent must be `relative`.
 *
 * It floats over the skeleton's header area on a soft background halo rather
 * than taking space in the flow: the skeleton's blocks mirror the real
 * page's layout so the swap doesn't shift anything, and a loader in the flow
 * would break that. It fades in after a short delay, so a warm client-side
 * hop that resolves in a few frames never flashes it.
 */
</script>

<template>
  <div class="ufo-loading-mark pointer-events-none absolute inset-x-0 top-16 z-10 mx-auto w-[min(440px,88%)]">
    <AppUfoLoader />
  </div>
</template>

<style scoped>
.ufo-loading-mark {
  padding: 18px 12px 10px;
  animation: ufo-mark-in 0.5s var(--ease-standard) 0.25s both;
}
/* The dark backdrop that lifts the craft off the skeleton: a halo reaching
   well past the mark's own box, so the skeleton bars fade out around it.
   It's an elliptical core with a huge soft box-shadow rather than a larger
   box: a shadow only paints, so it never widens the page's scroll area (a
   box 96px wider than the mark scrolled sideways on phones). The mark's
   z-index makes it a stacking context, so this sits behind the craft but
   still above the page. */
.ufo-loading-mark::before {
  content: '';
  position: absolute;
  inset: 8% 6%;
  z-index: -1;
  border-radius: 50%;
  background: hsl(var(--background));
  box-shadow: 0 0 72px 64px hsl(var(--background));
}

@keyframes ufo-mark-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .ufo-loading-mark {
    animation: none;
  }
}
</style>
