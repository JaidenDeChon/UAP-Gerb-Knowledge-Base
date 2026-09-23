<script setup lang="ts">
/**
 * The UFO loader, shown while a page skeleton is up.
 *
 * It's pinned to the middle of the visible content area (below the 56px top
 * bar, beside the 280px sidebar from 901px up) rather than placed inside the
 * skeleton, so it's vertically centred on every page, wherever that page's
 * skeleton starts. It floats over the skeleton instead of taking space in
 * the flow: the skeleton's blocks mirror the real page's layout so the swap
 * doesn't shift anything. The loader draws its own backdrop.
 *
 * It fades in after a short delay, so a warm client-side hop that resolves in
 * a few frames never flashes it.
 */
</script>

<template>
  <div class="ufo-loading-mark pointer-events-none" aria-hidden="true">
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

@keyframes ufo-mark-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .ufo-loading-mark-inner {
    animation: none;
  }
}
</style>
