<script setup lang="ts">
import type { WikiPage } from '@/utils/content'
import { ArrowRight, Clock } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { firstParagraph } from '@/utils/content'
import { formatRuntime } from '@/utils/video'

const props = defineProps<{ entry: WikiPage }>()

const lead = computed(() =>
  props.entry.description?.trim() || firstParagraph(props.entry.body))

/** `duration_seconds` isn't in the collection schema, so it lands in `meta`. */
const runtime = computed<string | null>(() => {
  const record = props.entry as unknown as Record<string, unknown>
  const meta = record.meta as Record<string, unknown> | undefined
  return formatRuntime(Number(record.duration_seconds ?? meta?.duration_seconds))
})
</script>

<template>
  <section class="my-10">
    <div class="mb-3.5 flex items-center gap-2.5">
      <span class="size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
      <h2 class="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
        Featured
      </h2>
      <span class="h-px flex-1 bg-border" />
    </div>

    <NuxtLink
      :to="entry.path"
      class="ufo-featured group block overflow-hidden rounded-lg border border-border bg-card"
    >
      <div class="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-2">
        <Badge variant="outline">Videos</Badge>
        <span v-if="runtime" class="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.09em] text-muted-foreground">
          <Clock class="size-3" />
          {{ runtime }}
        </span>
      </div>

      <div class="px-4 py-4">
        <h3 class="font-display text-[clamp(20px,2.6vw,26px)] font-bold uppercase leading-tight tracking-[0.015em] text-foreground transition-colors group-hover:text-primary">
          {{ entry.title }}
        </h3>

        <p v-if="lead" class="mt-2.5 line-clamp-3 font-sans text-[15px] leading-6 text-muted-foreground">
          {{ lead }}
        </p>

        <span class="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-primary">
          Read the entry
          <ArrowRight class="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </NuxtLink>
  </section>
</template>

<style scoped>
/* Matches the sidebar/hover-card idiom: the green accent arrives as a border
   and a wash rather than a shadow, which the flat theme doesn't use. */
.ufo-featured {
  transition:
    border-color var(--dur-base) var(--ease-standard),
    background-color var(--dur-base) var(--ease-standard);
}
.ufo-featured:hover {
  border-color: hsl(var(--primary) / 0.6);
  background-color: hsl(var(--primary) / 0.04);
}
</style>
