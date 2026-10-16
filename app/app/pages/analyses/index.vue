<script setup lang="ts">
import type { AnalysisCard } from '#shared/types/wiki'
import { Lightbulb } from '@lucide/vue'

// Every analysis, newest first — the build-time list from `wiki/analyses.ts`,
// so a new post shows up on the next deploy with nobody touching the app.
// `lazy` for the reason given in index.vue.
const { data: analyses, status } = useFetch<AnalysisCard[]>('/api/analyses', { key: 'all-analyses', lazy: true })

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
      Connections, coincidences, contradictions and patterns found across Gerb's videos.
    </p>
    <p class="mb-8 mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
      <template v-if="analyses?.length">{{ analyses.length }} {{ analyses.length === 1 ? 'analysis' : 'analyses' }} · newest first</template>
      <template v-else>&nbsp;</template>
    </p>

    <ul v-if="analyses?.length" class="grid gap-4 @3xl:grid-cols-2">
      <li v-for="analysis in analyses" :key="analysis.path" v-reveal>
        <AnalysisCard :analysis="analysis" />
      </li>
    </ul>

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
