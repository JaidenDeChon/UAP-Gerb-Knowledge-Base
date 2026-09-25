<script setup lang="ts">
import type { GraphNode } from '#shared/types/wiki'

usePageTitle().value = 'Site map'
useHead({ title: 'Site map' })

// The graph is drawn only in the browser; the page holds the loader until
// it has, including in the server's HTML.
const graphReady = ref(false)
usePageReady(graphReady)

function onSelect(node: GraphNode): void {
  navigateTo(node.p)
}
</script>

<template>
  <div class="absolute inset-0">
    <ClientOnly>
      <GraphMapPixi class="absolute inset-0" @select="onSelect" @ready="graphReady = true" />
    </ClientOnly>
  </div>
</template>
