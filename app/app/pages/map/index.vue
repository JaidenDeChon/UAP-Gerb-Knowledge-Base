<script setup lang="ts">
import type { GraphNode } from '#shared/types/wiki'

usePageTitle().value = 'Site map'
useHead({ title: 'Site map' })

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
  </div>
</template>
