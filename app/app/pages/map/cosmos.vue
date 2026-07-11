<script setup lang="ts">
import type { GraphNode } from '#shared/types/wiki'

usePageTitle().value = 'Site map · cosmos.gl'
useHead({ title: 'Site map · cosmos.gl' })

function onSelect(node: GraphNode): void {
  navigateTo(node.p)
}
</script>

<template>
  <div class="absolute inset-0">
    <ClientOnly>
      <GraphMapCosmos class="absolute inset-0" @select="onSelect" />
      <template #fallback>
        <div class="absolute inset-0 grid place-items-center">
          <span class="font-mono text-xs tracking-[0.1em] text-muted-foreground">LOADING MAP…</span>
        </div>
      </template>
    </ClientOnly>

    <GraphMapLabHud
      title="cosmos.gl GPU"
      engine="@cosmos.gl/graph · simulation and rendering both run in GPU shaders"
      hint="Built for graphs 100× this size — WebGL2 required. No built-in labels; hover shows the node name, click opens it."
    />
  </div>
</template>
