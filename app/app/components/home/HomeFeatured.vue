<script setup lang="ts">
import type { WikiPage } from '@/utils/content'
import { ArrowRight, Clock } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { firstParagraph } from '@/utils/content'
import { formatRuntime, youtubeThumbnail } from '@/utils/video'

const props = defineProps<{ entry: WikiPage }>()

const lead = computed(() =>
  props.entry.description?.trim() || firstParagraph(props.entry.body))

/** `duration_seconds` isn't in the collection schema, so it lands in `meta`. */
const runtime = computed<string | null>(() => {
  const record = props.entry as unknown as Record<string, unknown>
  const meta = record.meta as Record<string, unknown> | undefined
  return formatRuntime(Number(record.duration_seconds ?? meta?.duration_seconds))
})

// The widest thumbnail first; older uploads have no `maxres`, so fall back to
// `hq` (letterboxed, but the band's centre crop cuts the bars off), and drop
// the image entirely if even that fails.
const thumbSize = ref<'maxres' | 'hq' | null>('maxres')
const thumb = computed(() => {
  const id = String(props.entry.video_id ?? '').trim()
  return id && thumbSize.value ? youtubeThumbnail(id, thumbSize.value) : null
})
function onThumbError(): void {
  thumbSize.value = thumbSize.value === 'maxres' ? 'hq' : null
}
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
      <!-- A short band cropped from the middle of the thumbnail, fading into
           the card; the badges sit in the faded foot. Without a thumbnail the
           badges keep their plain strip. -->
      <div v-if="thumb" class="relative h-[clamp(120px,24vw,176px)] overflow-hidden">
        <img
          :src="thumb"
          alt=""
          decoding="async"
          class="ufo-featured-thumb size-full object-cover object-center"
          @error="onThumbError"
        >
        <div class="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 px-4 pb-1">
          <Badge variant="outline" class="bg-card/70 backdrop-blur-[2px]">Videos</Badge>
          <span v-if="runtime" class="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.09em] text-muted-foreground">
            <Clock class="size-3" />
            {{ runtime }}
          </span>
        </div>
      </div>
      <div v-else class="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-2">
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
/* A mask rather than a gradient overlay: the image fades to transparent, so
   it melts into whatever is behind it (the card in every theme, and the card's
   green hover wash), with no colour to keep in step.

   The fade is eased, not linear. A two-stop linear ramp starts and stops
   abruptly, and the eye reads both ends as edges; these stops trace an
   ease-in-out curve (the "scrim" gradient) over the lower 85% of the band,
   so opacity changes slowly at both ends and the image dissolves rather
   than stopping at a line. */
.ufo-featured-thumb {
  --ufo-thumb-fade: linear-gradient(
    to bottom,
    rgb(0 0 0) 0%,
    rgb(0 0 0 / 1) 15.0%,
    rgb(0 0 0 / 0.987) 21.9%,
    rgb(0 0 0 / 0.951) 28.2%,
    rgb(0 0 0 / 0.896) 34.1%,
    rgb(0 0 0 / 0.825) 39.6%,
    rgb(0 0 0 / 0.741) 45.0%,
    rgb(0 0 0 / 0.648) 50.0%,
    rgb(0 0 0 / 0.55) 55.0%,
    rgb(0 0 0 / 0.45) 60.0%,
    rgb(0 0 0 / 0.352) 65.0%,
    rgb(0 0 0 / 0.259) 70.0%,
    rgb(0 0 0 / 0.175) 75.3%,
    rgb(0 0 0 / 0.104) 80.9%,
    rgb(0 0 0 / 0.049) 86.8%,
    rgb(0 0 0 / 0.013) 93.1%,
    rgb(0 0 0 / 0) 100.0%
  );
  -webkit-mask-image: var(--ufo-thumb-fade);
  mask-image: var(--ufo-thumb-fade);
  transition: transform 600ms var(--ease-standard);
}
.ufo-featured:hover .ufo-featured-thumb {
  transform: scale(1.03);
}
@media (prefers-reduced-motion: reduce) {
  .ufo-featured-thumb { transition: none; }
  .ufo-featured:hover .ufo-featured-thumb { transform: none; }
}
.ufo-featured:hover {
  border-color: hsl(var(--primary) / 0.6);
  background-color: hsl(var(--primary) / 0.04);
}
</style>
