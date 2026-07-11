<script setup lang="ts">
import type { GraphNode } from '#shared/types/wiki'

usePageTitle().value = 'Site map · Canvas 2D'
useHead({ title: 'Site map · Canvas 2D' })

function onSelect(node: GraphNode): void {
  navigateTo(node.p)
}
</script>

<template>
  <div class="absolute inset-0">
    <ClientOnly>
      <GraphMapCanvas class="absolute inset-0" @select="onSelect" />
      <template #fallback>
        <div class="absolute inset-0 grid place-items-center">
          <span class="font-mono text-xs tracking-[0.1em] text-muted-foreground">LOADING MAP…</span>
        </div>
      </template>
    </ClientOnly>

    <GraphMapLabHud
      title="Canvas 2D"
      engine="Home-brew renderer · one <canvas>, no dependencies"
      hint="Same static layout as the current map, but drawn as batched canvas paths instead of ~7k SVG elements. Hover to highlight, click to open."
    />
  </div>
</template>
