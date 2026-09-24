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
// `hq` (letterboxed, but the cover crop cuts the bars off), and drop the
// image entirely if even that fails.
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
      class="ufo-featured group relative block overflow-hidden rounded-lg border border-border"
      :class="{ 'has-thumb': thumb }"
    >
      <!-- The video hero's composition in miniature (WikiVideoHero.vue): the
           thumbnail sits to the right and eases out toward the text through
           the shared `ufo-fade` mask, and the text sits on a card-colour
           panel that fades out just past its column. In a narrow card the
           thumbnail is a band above the text instead, fading down. -->
      <img
        v-if="thumb"
        :src="thumb"
        alt=""
        decoding="async"
        class="ufo-featured-thumb ufo-fade"
        @error="onThumbError"
      >

      <div class="ufo-featured-content px-4 py-4">
        <div class="flex flex-wrap items-center gap-2">
          <Badge variant="outline" class="bg-card/70">Videos</Badge>
          <span v-if="runtime" class="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.09em] text-muted-foreground">
            <Clock class="size-3" />
            {{ runtime }}
          </span>
        </div>

        <h3 class="mt-3 font-display text-[clamp(20px,2.6vw,26px)] font-bold uppercase leading-tight tracking-[0.015em] text-foreground transition-colors group-hover:text-primary">
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
   and a wash rather than a shadow, which the flat theme doesn't use. The wash
   is one custom property, so the text panel below repaints in exactly the
   card's colour. */
.ufo-featured {
  --ufo-featured-surface: hsl(var(--card));
  container: featured / inline-size;
  background-color: var(--ufo-featured-surface);
  transition: border-color var(--dur-base) var(--ease-standard);
}
.ufo-featured:hover {
  --ufo-featured-surface: color-mix(in srgb, hsl(var(--primary)) 4%, hsl(var(--card)));
  border-color: hsl(var(--primary) / 0.6);
}

/* -- narrow card: a band above the text, fading down into the card -- */
.ufo-featured-thumb {
  display: block;
  width: 100%;
  height: clamp(132px, 42cqi, 184px);
  object-fit: cover;
  object-position: center;
  --ufo-fade-y-start: 34%;
  -webkit-mask-image: var(--ufo-fade-y);
  mask-image: var(--ufo-fade-y);
  transform-origin: 50% 0;
  transition: transform 600ms var(--ease-standard);
}
/* Pull the text up onto the band's faded foot, where the image is already
   below ~5% (the last 16% of the curve), so nothing is set on the picture. */
.ufo-featured.has-thumb .ufo-featured-content {
  margin-top: -20px;
}
.ufo-featured-content {
  position: relative;
}

/* -- wide card: the hero's layout, thumbnail right, fading left -- */
@container featured (min-width: 34rem) {
  .ufo-featured.has-thumb {
    min-height: 224px;
  }
  .ufo-featured-thumb {
    position: absolute;
    top: 0;
    right: 0;
    width: 72%;
    height: 100%;
    --ufo-fade-x-start: 40%;
    -webkit-mask-image: var(--ufo-fade-x);
    mask-image: var(--ufo-fade-x);
    transform-origin: 100% 50%;
  }
  .ufo-featured.has-thumb .ufo-featured-content {
    isolation: isolate;
    margin-top: 0;
    max-width: 54%;
    padding-block: 22px;
  }
  /* The card-colour panel under the text, as the hero's
     `.ufo-hero-content::before`: solid to 90px short of the column's right
     edge, 0.72 at the edge, open 170px past it. Its ramp overlaps the
     thumbnail's own, so the two eased fades multiply into one long, soft
     transition, as they do in the hero. The card's overflow clips the
     panel's left overhang. */
  .ufo-featured.has-thumb .ufo-featured-content::before {
    content: '';
    position: absolute;
    z-index: -1;
    top: 0;
    bottom: 0;
    left: -100vw;
    right: -170px;
    pointer-events: none;
    background: linear-gradient(
      to right,
      var(--ufo-featured-surface) 0,
      var(--ufo-featured-surface) calc(100% - 260px),
      color-mix(in srgb, var(--ufo-featured-surface) 72%, transparent) calc(100% - 170px),
      color-mix(in srgb, var(--ufo-featured-surface) 0%, transparent) 100%
    );
  }
}

.ufo-featured:hover .ufo-featured-thumb {
  transform: scale(1.03);
}
@media (prefers-reduced-motion: reduce) {
  .ufo-featured-thumb { transition: none; }
  .ufo-featured:hover .ufo-featured-thumb { transform: none; }
}
</style>
