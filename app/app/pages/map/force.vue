<script setup lang="ts">
import type { GraphNode } from '#shared/types/wiki'

usePageTitle().value = 'Site map · force-graph'
useHead({ title: 'Site map · force-graph' })

function onSelect(node: GraphNode): void {
  navigateTo(node.p)
}
</script>

<template>
  <div class="absolute inset-0">
    <ClientOnly>
      <GraphMapForce class="absolute inset-0" @select="onSelect" />
      <template #fallback>
        <div class="absolute inset-0 grid place-items-center">
          <span class="font-mono text-xs tracking-[0.1em] text-muted-foreground">LOADING MAP…</span>
        </div>
      </template>
    </ClientOnly>

    <GraphMapLabHud
      title="Live physics"
      engine="force-graph · Canvas 2D + a running d3-force simulation"
      hint="The Obsidian feel: the layout settles live and nodes are draggable. Labels appear as you zoom in. Click to open."
    />
  </div>
</template>
