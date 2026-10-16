<script setup lang="ts">
import type { AnalysisCard } from '#shared/types/wiki'
import { formatDay } from '@/utils/video'

const props = defineProps<{ analysis: AnalysisCard }>()

const published = computed(() => formatDay(props.analysis.date))

/** "Draws on 3 videos · 7 entries". */
const reach = computed(() => {
  const { videoCount, entityCount } = props.analysis
  const parts: string[] = []
  if (videoCount) parts.push(`${videoCount} ${videoCount === 1 ? 'video' : 'videos'}`)
  if (entityCount) parts.push(`${entityCount} ${entityCount === 1 ? 'entry' : 'entries'}`)
  return parts.length ? `Draws on ${parts.join(' · ')}` : ''
})
</script>

<template>
  <NuxtLink
    :to="analysis.path"
    class="ufo-analysis-card group flex h-full flex-col rounded-lg border border-border bg-card px-4 pb-4 pt-3.5"
  >
    <AnalysisMarks :kind="analysis.kind" :confidence="analysis.confidence" :novelty="analysis.novelty" />

    <h3 class="mt-3 font-display text-[17px] font-bold uppercase leading-[22px] tracking-[0.015em] text-foreground transition-colors group-hover:text-primary">
      {{ analysis.title }}
    </h3>
    <p v-if="analysis.dek" class="mt-2 font-sans text-[14px] leading-[22px] text-muted-foreground">
      {{ analysis.dek }}
    </p>

    <div class="mt-auto flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-3.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
      <time v-if="published" :datetime="analysis.date!">{{ published }}</time>
      <span v-if="reach">{{ reach }}</span>
    </div>
  </NuxtLink>
</template>

<style scoped>
/* Same accent-as-border-and-wash hover as the video card, with an amber rule
   down the left edge marking it as an analysis. */
.ufo-analysis-card {
  border-left: 3px solid hsl(var(--graph-cat-analyses) / 0.85);
  transition:
    border-color var(--dur-base) var(--ease-standard),
    background-color var(--dur-base) var(--ease-standard);
}
.ufo-analysis-card:hover,
.ufo-analysis-card:focus-visible {
  border-color: hsl(var(--primary) / 0.6);
  border-left-color: hsl(var(--graph-cat-analyses));
  background-color: hsl(var(--primary) / 0.04);
}
</style>
