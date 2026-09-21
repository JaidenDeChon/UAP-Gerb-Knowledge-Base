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
 * Layers, back to front: the page background; the video's own YouTube
 * thumbnail as a treated plate on the right (`--hero-img-*` per theme in
 * main.css); two scrims in `--background` that guarantee the text column sits
 * on the page colour, not the photo; a radar-ring + graph-field ornament in
 * `--primary`; the content. The plate is an enhancement — the hero is
 * designed to look finished with no image at all (offline, missing
 * thumbnail, image blocked), which the `is-broken` state exercises.
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
const channel = computed(() => String(raw('channel') ?? '').trim())
const watchUrl = computed(() => {
  const url = String(raw('url') ?? '').trim()
  return /^https?:\/\//i.test(url) ? url : (videoId.value ? `https://www.youtube.com/watch?v=${videoId.value}` : '')
})
/** `0` in the frontmatter means "unknown", not a zero-length video. */
const runtime = computed(() => {
  const n = Number(raw('duration_seconds'))
  return Number.isFinite(n) && n > 0 ? formatClock(n) : ''
})

/* ---------------------------------------------------------- thumbnail -- */

const MAXRES = (id: string) => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
const HQ = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

const src = ref(videoId.value ? MAXRES(videoId.value) : '')
const loaded = ref(false)
const broken = ref(false)

watch(videoId, (id) => {
  src.value = id ? MAXRES(id) : ''
  loaded.value = false
  broken.value = false
})

function onLoad(event: Event): void {
  const img = event.target as HTMLImageElement
  // YouTube answers a missing maxresdefault with HTTP 200 and a 120×90 grey
  // placeholder, never a 404 — so "loaded but tiny" is the miss signal.
  if (img.naturalWidth < 640 && src.value === MAXRES(videoId.value)) {
    src.value = HQ(videoId.value)
    return
  }
  loaded.value = true
}
function onError(): void {
  if (src.value === MAXRES(videoId.value)) {
    src.value = HQ(videoId.value)
    return
  }
  broken.value = true
}

/* --------------------------------------------------------------- field -- */

// A small, fixed graph field for the ring ornament — the share card's motif
// at a fraction of its density. Hard-coded, so server and client render the
// same markup (no PRNG, no hydration mismatch). Coordinates in a 640×400 box
// centred on the rings at (400, 200).
const NODES: Array<[number, number, number]> = [
  [400, 200, 5], [332, 148, 3], [468, 142, 3.5], [520, 214, 3], [452, 262, 3.5],
  [346, 268, 3], [286, 206, 3.5], [402, 96, 2.5], [560, 118, 2.5], [590, 262, 2.5],
  [500, 318, 2.5], [372, 326, 2.5], [244, 296, 2.5], [232, 126, 2.5], [316, 60, 2],
  [610, 180, 2], [140, 210, 2], [96, 300, 2], [480, 380, 2], [640, 330, 2],
]
const EDGES: Array<[number, number]> = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 7], [2, 7], [2, 8], [3, 8],
  [3, 9], [4, 10], [5, 11], [6, 12], [6, 13], [1, 13], [7, 14], [8, 15], [12, 16],
  [16, 17], [10, 18], [9, 19], [11, 12], [4, 3],
]
const edgePath = EDGES.map(([a, b]) => `M${NODES[a]![0]} ${NODES[a]![1]}L${NODES[b]![0]} ${NODES[b]![1]}`).join('')
// Every node as one path (two arcs per circle) rather than a `<circle
// v-for>`: on hydration Vue tries to set `cx`/`cy`/`r` as DOM properties on
// the server-rendered circles (read-only SVGAnimatedLength) and warns once
// per attribute. A single static `d` string has nothing to patch.
const circle = ([x, y, r]: [number, number, number]) =>
  `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`
const hubPath = circle(NODES[0]!)
const nodePath = NODES.slice(1).map(circle).join('')

/** Long titles (the vault has 70-character ones) step the display size down a notch. */
const longTitle = computed(() => props.title.length > 48)

function play(): void {
  if (!videoId.value) return
  dock.open({ videoId: videoId.value, title: props.title })
}
</script>

<template>
  <section class="ufo-hero" :class="{ 'is-loaded': loaded, 'is-broken': broken || !videoId }" aria-labelledby="page-title">
    <!-- Plate: the video's own thumbnail, printed into the page surface. -->
    <div class="ufo-hero-plate" aria-hidden="true">
      <img
        v-if="src && !broken"
        :src="src"
        alt=""
        decoding="async"
        fetchpriority="high"
        referrerpolicy="no-referrer"
        width="1280"
        height="720"
        class="ufo-hero-img"
        @load="onLoad"
        @error="onError"
      >
      <div class="ufo-hero-scrim ufo-hero-scrim--x" />
      <div class="ufo-hero-scrim ufo-hero-scrim--y" />
    </div>

    <!-- Ornament: radar rings + a sparse graph field, the app's own motif. -->
    <svg class="ufo-hero-field" viewBox="0 0 640 400" aria-hidden="true" focusable="false">
      <g class="ufo-hero-rings">
        <circle cx="400" cy="200" r="60" />
        <circle cx="400" cy="200" r="130" />
        <circle cx="400" cy="200" r="210" />
        <circle cx="400" cy="200" r="300" />
      </g>
      <g class="ufo-hero-sweep">
        <path d="M400 200 L400 -110 A310 310 0 0 1 560 -68 Z" />
      </g>
      <path class="ufo-hero-edges" :d="edgePath" />
      <path class="ufo-hero-nodes" :d="nodePath" />
      <path class="ufo-hero-hub" :d="hubPath" />
    </svg>

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

        <dl class="ufo-hero-hud mt-6" aria-label="Video details">
          <div v-if="channel" class="ufo-hero-hud-item">
            <dt>Channel</dt>
            <dd>{{ channel }}</dd>
          </div>
          <div v-if="runtime" class="ufo-hero-hud-item">
            <dt>Runtime</dt>
            <dd class="tabular-nums">{{ runtime }}</dd>
          </div>
          <div v-if="videoId" class="ufo-hero-hud-item">
            <dt>Video ID</dt>
            <dd>{{ videoId }}</dd>
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

/* -- plate -- */
.ufo-hero-plate {
  position: absolute;
  inset: 0 0 0 42%;
  z-index: 0;
  pointer-events: none;
}
.ufo-hero-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 60% 40%;
  opacity: 0;
  filter: var(--hero-img-filter);
  mix-blend-mode: var(--hero-img-blend);
  transform: scale(1.04);
  transition: opacity 900ms var(--ease-out), transform 1600ms var(--ease-out);
}
.ufo-hero.is-loaded .ufo-hero-img {
  opacity: var(--hero-img-opacity);
  transform: none;
}
/* Two scrims in the page colour: the column's side goes solid so the title
   and lead always read against --background, and the bottom fades the plate
   out into the page so the hero has no hard lower edge. */
.ufo-hero-scrim {
  position: absolute;
  inset: 0;
}
.ufo-hero-scrim--x {
  background: linear-gradient(to right, hsl(var(--background)) 0%, hsl(var(--background)) 22%, hsl(var(--background) / 0.55) 46%, hsl(var(--background) / 0) 72%);
}
.ufo-hero-scrim--y {
  background: linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background) / 0.6) 22%, hsl(var(--background) / 0) 58%);
}

/* -- ornament -- */
.ufo-hero-field {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 74%;
  width: min(640px, 70vw);
  height: auto;
  transform: translate(-50%, -50%);
  opacity: var(--hero-field-opacity);
  pointer-events: none;
  overflow: visible;
}
.ufo-hero-rings circle {
  fill: none;
  stroke: hsl(var(--primary) / 0.22);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.ufo-hero-rings circle:first-child {
  stroke: hsl(var(--primary) / 0.45);
}
.ufo-hero-sweep {
  transform-origin: 400px 200px;
  animation: ufo-radar-sweep 18s linear infinite;
}
.ufo-hero-sweep path {
  fill: hsl(var(--primary) / 0.07);
}
.ufo-hero-edges {
  fill: none;
  stroke: hsl(var(--graph-edge) / 0.45);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.ufo-hero-nodes {
  fill: hsl(var(--primary));
  opacity: 0.8;
}
.ufo-hero-hub {
  fill: hsl(var(--primary));
  filter: drop-shadow(0 0 6px hsl(var(--primary)));
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
  padding-block: 40px 44px;
  max-width: 62ch;
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

/* -- no image: the ornament carries the plate on its own -- */
.ufo-hero.is-broken .ufo-hero-field {
  opacity: calc(var(--hero-field-opacity) * 1.2);
}

/* -- mobile: the plate becomes a band above the text, never behind it -- */
@media (max-width: 900px) {
  .ufo-hero-plate {
    inset: 0 0 auto 0;
    height: 260px;
  }
  .ufo-hero-scrim--x {
    background: none;
  }
  .ufo-hero-scrim--y {
    background: linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background)) 32%, hsl(var(--background) / 0) 100%);
  }
  .ufo-hero-field {
    top: 130px;
    left: 50%;
    width: 120vw;
  }
  .ufo-hero-content {
    padding-block: 168px 32px;
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

@media (prefers-reduced-motion: reduce) {
  .ufo-hero-img {
    transition: none;
    transform: none;
  }
  .ufo-hero-sweep {
    animation: none;
  }
}
</style>
