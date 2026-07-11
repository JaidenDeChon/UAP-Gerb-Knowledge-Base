<script setup lang="ts">
import { Gauge } from '@lucide/vue'

/**
 * Stats overlay for the /map/* renderer test routes: which engine is drawing,
 * how much it's drawing, and a live FPS readout so devices can be compared.
 */
const props = defineProps<{
  title: string
  engine: string
  /** One-line interaction hint, e.g. what hover/labels do in this variant. */
  hint?: string
}>()

const { data: graph } = useGraph()
const fps = useFps()

const stats = computed(() => {
  const g = graph.value
  if (!g) return 'LOADING…'
  return `${g.nodes.length} NODES · ${g.edges.length} LINKS`
})

const fpsTone = computed(() =>
  fps.value >= 50 ? 'text-primary' : fps.value >= 25 ? 'text-foreground' : 'text-destructive',
)
</script>

<template>
  <div
    class="pointer-events-none absolute left-5 top-5 z-20 max-w-[calc(100vw-40px)] select-none rounded-lg border border-border/50 bg-background/70 px-4 py-3.5 backdrop-blur-sm"
  >
    <div class="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      Map lab
    </div>
    <div class="mt-0.5 font-display text-lg font-bold text-foreground">
      {{ props.title }}
    </div>
    <p class="font-sans text-[13px] text-muted-foreground">
      {{ props.engine }}
    </p>

    <div class="mt-3 flex items-center gap-3 font-mono text-[11px] tracking-[0.06em]">
      <span class="text-muted-foreground">{{ stats }}</span>
      <span class="inline-flex items-center gap-1 tabular-nums" :class="fpsTone">
        <Gauge :size="12" />
        {{ fps }} FPS
      </span>
    </div>

    <p v-if="props.hint" class="mt-2 max-w-[300px] font-sans text-xs text-muted-foreground">
      {{ props.hint }}
    </p>
  </div>
</template>
