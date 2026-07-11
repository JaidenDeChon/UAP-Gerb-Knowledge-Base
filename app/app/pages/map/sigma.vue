<script setup lang="ts">
import type { GraphNode } from '#shared/types/wiki'

usePageTitle().value = 'Site map · Sigma.js'
useHead({ title: 'Site map · Sigma.js' })

function onSelect(node: GraphNode): void {
  navigateTo(node.p)
}
</script>

<template>
  <div class="absolute inset-0">
    <ClientOnly>
      <GraphMapSigma class="absolute inset-0" @select="onSelect" />
      <template #fallback>
        <div class="absolute inset-0 grid place-items-center">
          <span class="font-mono text-xs tracking-[0.1em] text-muted-foreground">LOADING MAP…</span>
        </div>
      </template>
    </ClientOnly>

    <GraphMapLabHud
      title="Sigma.js"
      engine="sigma v3 + graphology · WebGL renderer built for large graphs"
      hint="Camera, hover, pinch zoom and density-aware labels all come with the library. Hover to highlight, click to open."
    />
  </div>
</template>
