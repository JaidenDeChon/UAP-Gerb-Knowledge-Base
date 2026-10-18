<script setup lang="ts">
import type { AnalysisMeta } from '@/utils/analysis'
import { formatDay } from '@/utils/video'

/**
 * The strip under an analysis page's title: its kind, confidence and novelty
 * as the same chips the `/analyses` cards carry, its date, and one line
 * saying what an analysis is. Read from the note's own frontmatter (see
 * `readAnalysisMeta`), so every post gets it with no authoring.
 */
const props = defineProps<{ meta: AnalysisMeta }>()

const published = computed(() => formatDay(props.meta.date))
</script>

<template>
  <section class="ufo-analysis-strip mb-7" aria-label="About this analysis">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <AnalysisMarks :kind="meta.kind" :confidence="meta.confidence" :novelty="meta.novelty" />
      <time
        v-if="published"
        :datetime="meta.date!"
        class="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground"
      >
        {{ published }}
      </time>
    </div>
    <p class="mt-2.5 font-sans text-[13px] leading-5 text-muted-foreground">
      Found and written by an AI research agent working from the knowledge base, and checked against the
      video transcripts.
    </p>
  </section>
</template>

<style scoped>
.ufo-analysis-strip {
  padding-left: 12px;
  border-left: 3px solid hsl(var(--graph-cat-analyses) / 0.85);
}
</style>
