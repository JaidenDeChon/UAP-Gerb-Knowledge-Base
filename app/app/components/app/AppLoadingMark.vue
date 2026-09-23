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
  background: radial-gradient(closest-side, hsl(var(--background)) 62%, hsl(var(--background) / 0));
  animation: ufo-mark-in 0.5s var(--ease-standard) 0.25s both;
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
