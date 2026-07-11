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
      engine="Home-brew renderer on Pixi.js v8 — the engine Obsidian's graph view uses"
      hint="Static layout, GPU-rendered: nodes are one instanced sprite batch, edges one retained mesh. Hover to highlight, click to open."
    />
  </div>
</template>
