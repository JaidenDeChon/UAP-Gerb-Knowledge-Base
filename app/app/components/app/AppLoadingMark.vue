<script setup lang="ts">
/**
 * The UFO loader: the app's one loading mark, rendered once by the layout
 * and never by a page. It is always in the document; `data-page-loading`
 * on `<html>` shows it and hides the page (plugins/page-load.ts decides
 * when; main.css has every rule). Pages hold it with `usePageReady`.
 *
 * It's centred in the visible content area (below the 56px top bar, beside
 * the 280px sidebar from 901px up), fades in after a short delay so a quick
 * load never flashes it, and leaves by blurring out while the page unblurs
 * in behind it.
 */
</script>

<template>
  <div class="ufo-loading-mark" aria-hidden="true">
    <div class="ufo-loading-mark-inner">
      <AppUfoLoader />
    </div>
  </div>
</template>
