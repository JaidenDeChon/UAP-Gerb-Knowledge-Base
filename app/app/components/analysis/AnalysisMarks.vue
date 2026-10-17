<script setup lang="ts">
import type { AnalysisConfidence, AnalysisKind, AnalysisNovelty } from '#shared/types/wiki'
import { Badge } from '@/components/ui/badge'
import { CONFIDENCE_LABEL, CONFIDENCE_STEPS, KIND_ICON, KIND_LABEL, NOVELTY_HINT, NOVELTY_LABEL } from '@/utils/analysis'

/**
 * An analysis's kind, confidence and novelty as a row of outline chips, shared
 * by the `/analyses` cards and the strip at the head of an analysis page. The
 * amber category colour only marks (the kind glyph, the meter); chip text stays
 * `--foreground`, since amber as text falls short of 4.5:1 on the light card.
 */
defineProps<{
  kind: AnalysisKind | null
  confidence: AnalysisConfidence | null
  novelty: AnalysisNovelty | null
}>()
</script>

<template>
  <div class="flex flex-wrap gap-1.5">
    <Badge v-if="kind" variant="outline">
      <component :is="KIND_ICON[kind]" class="ufo-analysis-mark" />
      {{ KIND_LABEL[kind] }}
    </Badge>
    <Badge v-if="confidence" variant="outline" :title="`Confidence: ${confidence}`">
      <span class="ufo-analysis-meter" aria-hidden="true">
        <span v-for="n in 3" :key="n" :class="{ 'is-on': n <= CONFIDENCE_STEPS[confidence] }" />
      </span>
      <span class="sr-only">Confidence:</span>
      {{ CONFIDENCE_LABEL[confidence] }}
    </Badge>
    <Badge v-if="novelty" variant="outline" :title="NOVELTY_HINT[novelty]" class="text-muted-foreground">
      {{ NOVELTY_LABEL[novelty] }}
    </Badge>
  </div>
</template>

<style scoped>
.ufo-analysis-mark {
  color: hsl(var(--graph-cat-analyses));
}
/* Three rising bars, filled up to the confidence: one for speculative, three for strong. */
.ufo-analysis-meter {
  display: inline-flex;
  align-items: flex-end;
  gap: 1.5px;
  height: 10px;
}
.ufo-analysis-meter > span {
  width: 3px;
  border-radius: 1px;
  background: hsl(var(--muted-foreground) / 0.3);
}
.ufo-analysis-meter > span:nth-child(1) { height: 4px; }
.ufo-analysis-meter > span:nth-child(2) { height: 7px; }
.ufo-analysis-meter > span:nth-child(3) { height: 10px; }
.ufo-analysis-meter > span.is-on {
  background: hsl(var(--graph-cat-analyses));
}
</style>
