<script setup lang="ts">
import type { AnalysisCard, AnalysisConfidence, AnalysisKind, AnalysisNovelty } from '#shared/types/wiki'
import { ANALYSIS_CONFIDENCES, ANALYSIS_KINDS, ANALYSIS_NOVELTIES } from '#shared/types/wiki'
import { Lightbulb } from '@lucide/vue'
import { CONFIDENCE_LABEL, KIND_LABEL, NOVELTY_LABEL } from '@/utils/analysis'
import { ANALYSIS_SORTS, type AnalysisSort, filterAndSortAnalyses, SORT_LABEL } from '@/utils/analysisList'

// Every analysis, newest first — the build-time list from `wiki/analyses.ts`,
// so a new post shows up on the next deploy with nobody touching the app.
// `lazy` for the reason given in index.vue.
const { data: analyses, status } = useFetch<AnalysisCard[]>('/api/analyses', { key: 'all-analyses', lazy: true })

// The control bar. `''` means a filter is off; the menus only offer kinds,
// confidences and novelties that some analysis actually has.
const kind = ref('')
const confidence = ref('')
const novelty = ref('')
const sort = ref<AnalysisSort>('newest')

function present<T extends string>(all: readonly T[], labels: Record<T, string>, pick: (a: AnalysisCard) => T | null, everything: string) {
  return computed(() => {
    const used = new Set((analyses.value ?? []).map(pick))
    return [{ value: '', label: everything }, ...all.filter(v => used.has(v)).map(v => ({ value: v as string, label: labels[v] }))]
  })
}
const kindOptions = present(ANALYSIS_KINDS, KIND_LABEL, a => a.kind, 'All kinds')
const confidenceOptions = present(ANALYSIS_CONFIDENCES, CONFIDENCE_LABEL, a => a.confidence, 'Any evidence')
const noveltyOptions = present(ANALYSIS_NOVELTIES, NOVELTY_LABEL, a => a.novelty, 'Any novelty')
const sortOptions = ANALYSIS_SORTS.map(v => ({ value: v as string, label: SORT_LABEL[v] }))
const sortModel = computed({ get: () => sort.value as string, set: (v: string) => { sort.value = v as AnalysisSort } })

const filtering = computed(() => Boolean(kind.value || confidence.value || novelty.value))
const shown = computed(() => filterAndSortAnalyses(analyses.value ?? [], {
  kind: (kind.value || null) as AnalysisKind | null,
  confidence: (confidence.value || null) as AnalysisConfidence | null,
  novelty: (novelty.value || null) as AnalysisNovelty | null,
}, sort.value))

function clearFilters() {
  kind.value = ''
  confidence.value = ''
  novelty.value = ''
}

usePageReady(() => status.value === 'success' || status.value === 'error')

usePageTitle().value = 'Analyses'
useHead({ title: 'Analyses' })
</script>

<template>
  <div class="@container mx-auto max-w-[1100px] px-8 pb-32 pt-10">
    <h1 class="font-display text-[clamp(32px,5vw,56px)] font-extrabold uppercase leading-none tracking-[0.02em] text-foreground">
      Analyses
    </h1>
    <p class="mt-4 max-w-[640px] font-sans text-[16px] leading-[26px] text-muted-foreground">
      Smoking guns, confirmed facts, hidden links, contradictions and patterns found across Gerb's videos and the documents behind them.
    </p>

    <div v-if="analyses?.length" class="mb-6 mt-8 flex flex-col gap-3 border-y border-border py-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <AnalysisSelect v-model="kind" label="Kind" filter :options="kindOptions" />
        <AnalysisSelect v-model="confidence" label="Evidence" filter :options="confidenceOptions" />
        <AnalysisSelect v-model="novelty" label="Novelty" filter :options="noveltyOptions" />
        <button
          v-if="filtering"
          type="button"
          class="self-start px-1 font-sans text-[13px] text-primary underline-offset-2 hover:underline sm:self-auto"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </div>
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span class="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground" aria-live="polite">
          <template v-if="filtering">{{ shown.length }} of {{ analyses.length }}</template>
          <template v-else>{{ analyses.length }} {{ analyses.length === 1 ? 'analysis' : 'analyses' }}</template>
        </span>
        <AnalysisSelect v-model="sortModel" label="Sort" :options="sortOptions" />
      </div>
    </div>
    <p v-else class="mb-8 mt-3">&nbsp;</p>

    <ul v-if="shown.length" class="grid gap-4 @3xl:grid-cols-2">
      <li v-for="analysis in shown" :key="analysis.path" v-reveal>
        <AnalysisCard :analysis="analysis" />
      </li>
    </ul>

    <div
      v-else-if="analyses?.length"
      class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-14 text-center"
    >
      <p class="font-sans text-[14px] leading-[22px] text-muted-foreground">
        No analyses match these filters.
        <button type="button" class="text-primary underline-offset-2 hover:underline" @click="clearFilters">
          Clear filters
        </button>
      </p>
    </div>

    <div
      v-else-if="analyses"
      class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-14 text-center"
    >
      <Lightbulb class="size-6 text-muted-foreground" />
      <p class="font-display text-[17px] font-bold uppercase tracking-[0.015em] text-foreground">
        No analyses yet
      </p>
      <p class="max-w-[420px] font-sans text-[14px] leading-[22px] text-muted-foreground">
        The first ones will appear here once they are written. Until then, the
        <NuxtLink to="/videos" class="text-primary underline-offset-2 hover:underline">videos</NuxtLink>
        and the <NuxtLink to="/map" class="text-primary underline-offset-2 hover:underline">site map</NuxtLink>
        cover everything the knowledge base holds.
      </p>
    </div>
  </div>
</template>
