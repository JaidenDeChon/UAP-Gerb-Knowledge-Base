<script setup lang="ts">
import type { Category, GraphNode } from '#shared/types/wiki'
import { CATEGORY_ORDER } from '#shared/types/wiki'

usePageTitle().value = 'Site map'
useHead({ title: 'Site map' })

const { data: graph } = useGraph()

const tally = computed<{ category: Category, count: number }[]>(() => {
  const counts = new Map<Category, number>()
  for (const node of graph.value?.nodes ?? []) {
    counts.set(node.c, (counts.get(node.c) ?? 0) + 1)
  }
  return CATEGORY_ORDER
    .filter(category => counts.has(category))
    .map(category => ({ category, count: counts.get(category) ?? 0 }))
})

function onSelect(node: GraphNode): void {
  navigateTo(node.p)
}
</script>

<template>
  <div class="absolute inset-0">
    <GraphMap class="absolute inset-0" :active-path="null" :minimized="false" @select="onSelect" />

    <div
      class="pointer-events-none absolute left-5 top-5 z-20 max-w-[calc(100vw-40px)] select-none rounded-lg border border-border/50 bg-background/70 px-4 py-3.5 backdrop-blur-sm"
    >
      <div class="flex items-center gap-2.5">
        <span class="grid size-[30px] shrink-0 place-items-center rounded-full border-2 border-primary">
          <span class="size-2.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
        </span>
        <span class="font-display text-lg font-bold uppercase tracking-[0.1em] text-foreground">
          UAPG<span class="text-primary">DB</span>
        </span>
      </div>

      <p class="mt-1.5 font-sans text-sm text-muted-foreground">
        UAP Gerb Knowledge Base
      </p>

      <dl
        v-if="tally.length"
        class="mt-4 grid w-[196px] grid-cols-[1fr_auto] gap-x-4 gap-y-1 font-mono text-[11px] leading-4"
      >
        <template v-for="entry in tally" :key="entry.category">
          <dt class="uppercase tracking-[0.08em] text-muted-foreground">
            {{ entry.category }}
          </dt>
          <dd class="text-right font-semibold tabular-nums text-foreground">
            {{ entry.count }}
          </dd>
        </template>
      </dl>
    </div>
  </div>
</template>
