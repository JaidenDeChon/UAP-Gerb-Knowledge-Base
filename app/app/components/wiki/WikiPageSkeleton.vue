<script setup lang="ts">
/**
 * Stand-in for a wiki article while its note is still loading: the UFO
 * loader, with a status line for screen readers.
 *
 * The note body loads in the browser (see `wiki/[...slug].vue`), and on a
 * fresh visit that means @nuxt/content downloading its sqlite-wasm database,
 * which takes seconds. The route doesn't wait for that; it paints this
 * instead. There's no placeholder layout: the loader is centred in the
 * viewport and blurs away when the article arrives.
 */
</script>

<template>
  <div class="min-h-[60vh]">
    <AppLoadingMark />
    <span class="sr-only" role="status">Loading entry…</span>
  </div>
</template>
