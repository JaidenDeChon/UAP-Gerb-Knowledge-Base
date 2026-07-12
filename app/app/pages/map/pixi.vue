<script setup lang="ts">
import type { GraphNode } from '#shared/types/wiki'

usePageTitle().value = 'Site map · Pixi.js'
useHead({ title: 'Site map · Pixi.js' })

function onSelect(node: GraphNode): void {
  navigateTo(node.p)
}
</script>

<template>
  <div class="absolute inset-0">
    <ClientOnly>
      <GraphMapPixi class="absolute inset-0" @select="onSelect" />
      <template #fallback>
        <div class="absolute inset-0 grid place-items-center">
          <span class="font-mono text-xs tracking-[0.1em] text-muted-foreground">LOADING MAP…</span>
        </div>
      </template>
    </ClientOnly>

    <GraphMapLabHud
      title="Pixi.js WebGL"
      engine="Home-brew renderer on Pixi.js v8 + d3-force — Obsidian's combination (WebGL + live physics)"
      hint="Use the panel to toggle physics vs the baked layout and tune the simulation. With physics on, drag nodes to stir it. Hover to highlight, click to open."
    />
  </div>
</template>
