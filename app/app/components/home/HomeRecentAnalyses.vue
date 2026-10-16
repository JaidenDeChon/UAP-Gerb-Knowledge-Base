<script setup lang="ts">
import type { AnalysisCard } from '#shared/types/wiki'
import { ArrowRight } from '@lucide/vue'
import { Button } from '@/components/ui/button'

/** One row of the two-up grid. */
const LIMIT = 2

// Baked at build time (see `wiki/analyses.ts`), like "Recently processed".
// With no analyses in the vault the strip renders nothing at all.
const { data: analyses, status } = useFetch<AnalysisCard[]>('/api/analyses', {
  key: 'recent-analyses',
  query: { limit: LIMIT },
  lazy: true,
})

// Part of the home page: it doesn't show until the strip has its analyses.
usePageReady(() => status.value === 'success' || status.value === 'error')
</script>

<template>
  <section v-if="analyses?.length" class="@container my-10" aria-labelledby="recent-analyses-heading">
    <div class="mb-3.5 flex items-center gap-2.5">
      <span class="size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
      <h2 id="recent-analyses-heading" class="whitespace-nowrap font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
        Latest analyses
      </h2>
      <span class="h-px flex-1 bg-border" />

      <Button as-child variant="outline" size="sm" class="h-8 px-3 text-[11px]">
        <NuxtLink to="/analyses">
          All analyses
          <ArrowRight class="size-3.5" />
        </NuxtLink>
      </Button>
    </div>

    <ul class="grid gap-4 @xl:grid-cols-2">
      <li v-for="analysis in analyses" :key="analysis.path">
        <AnalysisCard :analysis="analysis" />
      </li>
    </ul>
  </section>
</template>
