<script setup lang="ts">
/**
 * Stand-in for a wiki article while its note is still loading.
 *
 * @nuxt/content answers client-side queries from a sqlite-wasm database it
 * downloads on first use, so the first in-app hop to an entry costs seconds.
 * The route no longer waits for that (see `wiki/[...slug].vue`) — it paints
 * this instead. Block sizes mirror the real header so the swap doesn't shift
 * the page under the reader.
 */
</script>

<template>
  <div class="mx-auto max-w-[760px] px-8">
    <div class="ufo-skeleton pb-32 pt-10" aria-hidden="true">
      <!-- breadcrumb -->
      <div class="mb-5 h-3.5 w-48 rounded-sm bg-muted" />

      <!-- category + tag badges -->
      <div class="mb-3.5 flex flex-wrap gap-2">
        <div class="h-[22px] w-20 rounded-md bg-muted" />
        <div class="h-[22px] w-28 rounded-md bg-muted" />
        <div class="h-[22px] w-16 rounded-md bg-muted" />
      </div>

      <!-- title -->
      <div class="mb-4 space-y-2.5">
        <div class="h-10 w-full rounded-sm bg-muted" />
        <div class="h-10 w-2/3 rounded-sm bg-muted" />
      </div>

      <!-- lead -->
      <div class="mb-7 space-y-2.5">
        <div class="h-5 w-full rounded-sm bg-muted/70" />
        <div class="h-5 w-11/12 rounded-sm bg-muted/70" />
        <div class="h-5 w-3/5 rounded-sm bg-muted/70" />
      </div>

      <!-- fact table -->
      <div class="my-6 overflow-hidden rounded-lg border border-border">
        <div v-for="row in 4" :key="row" class="flex gap-4 border-b border-border px-3.5 py-3 last:border-b-0">
          <div class="h-3.5 w-24 shrink-0 rounded-sm bg-muted" />
          <div class="h-3.5 flex-1 rounded-sm bg-muted/70" />
        </div>
      </div>

      <!-- body -->
      <div v-for="block in 3" :key="block" class="mt-10 space-y-3">
        <div class="h-6 w-1/3 rounded-sm bg-muted" />
        <div class="h-4 w-full rounded-sm bg-muted/70" />
        <div class="h-4 w-full rounded-sm bg-muted/70" />
        <div class="h-4 w-4/5 rounded-sm bg-muted/70" />
      </div>
    </div>

    <span class="sr-only" role="status">Loading entry…</span>
  </div>
</template>
