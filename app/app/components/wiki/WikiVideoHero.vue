<script setup lang="ts">
import type { WikiPage } from '@/utils/content'
import { ChevronRight, ExternalLink, FileText, Play } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatClock } from '@/utils/timeline'

/**
 * Title card for a video summary page. Rendered by `pages/wiki/[...slug].vue`
 * in place of the article's own breadcrumb/badges/H1/lead/fact table whenever
 * the note carries a `video_id`, so all 53 video pages get it with no
 * authoring. It spans `<main>`'s full width; its text column lines up with
 * the article measure below it (`wrapperClass`).
 *
 * Layers, back to front: the page background; a live field of connected
 * nodes (`WikiNodeField`, the knowledge-graph motif animated, in the theme's
 * own tokens); a scrim that fades the field out along the bottom edge; HUD
 * frame corners; the content, on a page-colour panel that hangs off the text
 * column itself so the title and lead never sit on the pattern whichever
 * layout the page is in. No thumbnail: the channel's thumbnails carry their
 * own large text, which fought the title the moment a reader tried to read
 * either.
 */
const props = withDefaults(
  defineProps<{
    page: WikiPage
    title: string
    lead: string
    category: string
    tags: string[]
    extraTags: number
    /** Route of the sibling transcript note, when one exists. */
    transcriptTo: string | null
    /** Extra classes for the inner column, so it tracks the article measure. */
    columnClass?: string
  }>(),
  { columnClass: '' },
)

const dock = useVideoDock()

/** Read a frontmatter key, whether hoisted to a column or left in `meta`. */
function raw(key: string): unknown {
  const top = (props.page as unknown as Record<string, unknown>)[key]
  if (top !== undefined && top !== null && top !== '') return top
  const meta = props.page.meta as Record<string, unknown> | undefined
  return meta ? meta[key] : undefined
}

const videoId = computed(() => String(raw('video_id') ?? '').trim())
const watchUrl = computed(() => {
  const url = String(raw('url') ?? '').trim()
  return /^https?:\/\//i.test(url) ? url : (videoId.value ? `https://www.youtube.com/watch?v=${videoId.value}` : '')
})
/** `0` in the frontmatter means "unknown", not a zero-length video. */
const runtime = computed(() => {
  const n = Number(raw('duration_seconds'))
  return Number.isFinite(n) && n > 0 ? formatClock(n) : ''
})

/** Long titles (the vault has 70-character ones) step the display size down a notch. */
const longTitle = computed(() => props.title.length > 48)

// The node field waits for the page's unblur transition (if one is running)
// to finish before it's even created, then fades in. It's a canvas with its
// own animation loop; starting it mid-transition would pop it in and take
// frames from the transition.
const revealing = useContentReveal()
const showField = ref(false)
onMounted(() => {
  if (!revealing.value) {
    showField.value = true
    return
  }
  const stop = watch(revealing, (busy) => {
    if (busy) return
    showField.value = true
    stop()
  })
})

function play(): void {
  if (!videoId.value) return
  dock.open({ videoId: videoId.value, title: props.title })
}
</script>

<template>
  <section class="ufo-hero" aria-labelledby="page-title">
    <!-- The field: the app's graph motif, alive. Scrims in the page colour
         keep the text column readable and fade the field into the page. -->
    <div class="ufo-hero-stage" aria-hidden="true">
      <WikiNodeField v-if="showField" class="ufo-hero-field" />
      <div class="ufo-hero-scrim ufo-hero-scrim--y" />
    </div>

    <!-- HUD frame corners. -->
    <svg class="ufo-hero-corners" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 8V0h8M92 0h8v8M100 92v8h-8M8 100H0v-8" vector-effect="non-scaling-stroke" />
    </svg>

    <div class="ufo-hero-column" :class="columnClass">
      <div class="ufo-hero-content">
        <nav class="flex items-center gap-2 font-sans text-[13px] text-muted-foreground" aria-label="Breadcrumb">
          <NuxtLink to="/map" class="transition-colors hover:text-foreground">
            Site map
          </NuxtLink>
          <ChevronRight class="size-3.5 shrink-0 opacity-60" />
          <span>{{ category }}</span>
        </nav>

        <div class="mt-3.5 flex flex-wrap gap-2">
          <Badge class="ufo-category-badge">{{ category }}</Badge>
          <Badge v-for="tag in tags" :key="tag" variant="outline">
            {{ tag }}
          </Badge>
          <Badge v-if="extraTags > 0" variant="outline">
            +{{ extraTags }}
          </Badge>
        </div>

        <h1
          id="page-title"
          class="ufo-hero-title mt-4 font-display font-extrabold uppercase leading-none tracking-[0.02em] text-foreground"
          :class="{ 'is-long': longTitle }"
        >
          {{ title }}
        </h1>

        <p v-if="lead" class="ufo-hero-lead mt-5 font-sans text-[18px] leading-[28px] text-muted-foreground md:text-[20px] md:leading-[30px]">
          {{ lead }}
        </p>

        <dl v-if="runtime" class="ufo-hero-hud mt-6" aria-label="Video details">
          <div class="ufo-hero-hud-item">
            <dt>Runtime</dt>
            <dd class="tabular-nums">{{ runtime }}</dd>
          </div>
        </dl>

        <div class="mt-5 flex flex-wrap items-center gap-2.5">
          <Button v-if="videoId" size="sm" @click="play">
            <Play class="size-3.5" />
            Play in mini-player
          </Button>
          <Button v-if="transcriptTo" as-child variant="outline" size="sm">
            <NuxtLink :to="transcriptTo">
              <FileText class="size-3.5" />
              Transcript
            </NuxtLink>
          </Button>
          <Button v-if="watchUrl" as-child variant="ghost" size="sm">
            <a :href="watchUrl" target="_blank" rel="noopener noreferrer">
              YouTube
              <ExternalLink class="size-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
@reference "../../assets/css/main.css";

.ufo-hero {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  border-bottom: 1px solid hsl(var(--border) / 0.7);
  background: hsl(var(--background));
}

/* -- the stage: the node field plus the bottom scrim -- */
.ufo-hero-stage {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.ufo-hero-scrim {
  position: absolute;
  inset: 0;
}
/* Fade into the page along the bottom edge so the hero has no hard floor. */
.ufo-hero-scrim--y {
  background: linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background) / 0.5) 16%, hsl(var(--background) / 0) 42%);
}

.ufo-hero-corners {
  position: absolute;
  z-index: 1;
  inset: 12px;
  width: calc(100% - 24px);
  height: calc(100% - 24px);
  pointer-events: none;
}
.ufo-hero-corners path {
  fill: none;
  stroke: hsl(var(--primary) / 0.7);
  stroke-width: 1.5;
}

/* -- content -- */
.ufo-hero-column {
  position: relative;
  z-index: 2;
}
.ufo-hero-content {
  position: relative;
  padding-block: 40px 44px;
  max-width: 62ch;
}
/* The page-colour panel that keeps the text on the page. It hangs off the
   text column itself rather than the hero, so the fade sits just past the
   column's real right edge in every layout: the rail layout sets the column
   at the left (text ends ~57% across a 1160px hero), the centred 760px
   measure below `xl` runs to ~80%. The last 100px of the longest lines sit
   on ≥0.72 background; the field is fully open 220px past the column. */
.ufo-hero-content::before {
  content: '';
  position: absolute;
  z-index: -1;
  top: 0;
  bottom: 0;
  left: -100vw;
  right: -220px;
  pointer-events: none;
  background: linear-gradient(to right, hsl(var(--background)) 0, hsl(var(--background)) calc(100% - 320px), hsl(var(--background) / 0.72) calc(100% - 220px), hsl(var(--background) / 0) 100%);
}
.ufo-hero-title {
  max-width: 16ch;
  font-size: clamp(32px, 5vw, 56px);
  text-wrap: balance;
}
.ufo-hero-title.is-long {
  max-width: 22ch;
  font-size: clamp(26px, 3.6vw, 42px);
}
.ufo-hero-lead {
  max-width: 54ch;
  text-wrap: pretty;
}

.ufo-hero-hud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 22px;
  margin: 0;
}
.ufo-hero-hud-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.ufo-hero-hud dt {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}
.ufo-hero-hud dd {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: hsl(var(--foreground));
}

/* -- mobile: the field is a band above the text, never behind it -- */
@media (max-width: 900px) {
  .ufo-hero-content::before {
    display: none;
  }
  /* Full page colour by 184px; the breadcrumb, the smallest text in the
     hero, starts at 188px so nothing is set on the fade. */
  .ufo-hero-scrim--y {
    background: linear-gradient(to bottom, hsl(var(--background) / 0) 0px, hsl(var(--background) / 0) 128px, hsl(var(--background)) 184px, hsl(var(--background)) 100%);
  }
  .ufo-hero-content {
    padding-block: 188px 32px;
    max-width: none;
  }
  .ufo-hero-title {
    max-width: none;
  }
}

/* -- light-theme category badge: same measured override as the page's -- */
:where([data-theme="light"]) .ufo-category-badge {
  color: hsl(var(--foreground));
}


/* The node field fades in once it's created (see showField). */
.ufo-hero-field {
  animation: ufo-hero-field-in 900ms var(--ease-standard) both;
}
@keyframes ufo-hero-field-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .ufo-hero-field {
    animation: none;
  }
}
</style>
