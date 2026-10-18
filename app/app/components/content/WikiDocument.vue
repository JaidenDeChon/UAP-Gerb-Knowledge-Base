<script setup lang="ts">
import { BookOpen, ExternalLink, FileText, RotateCw, ScrollText } from '@lucide/vue'
import { NuxtLink } from '#components'
import { drawPage, openPdf } from '@/utils/pdf'
import { clampPage, normaliseBand } from '@/utils/wikiDocument'

/**
 * `::wiki-document` — one page of a primary-source document, set into an
 * article: the page itself, drawn from the hosted PDF, or just a band of it
 * (`region`) to show the passage under discussion. A header carries the way
 * to the document's own page and, when it has one, a Transcript button that
 * opens the transcription in a dialog at this page. The page itself links
 * to the full viewer on the document's page, at `#page=N`.
 *
 * Nothing heavy loads until the reader nears the figure: within 400px of the
 * viewport it loads pdf.js and fetches only the byte ranges this page needs,
 * showing a loading state in the page's reserved space meanwhile (page 1
 * shows its baked thumbnail). The transcription is queried only when the
 * dialog is first opened, and the dialog's code with it. A document that
 * isn't hosted shows as a card with the same header, linking to its source.
 */
const props = withDefaults(
  defineProps<{
    /** The Documents note's title. */
    name?: string
    /** 1-based page number. */
    page?: number
    /** `[from, to]`, fractions of the page's height (0 = top, 1 = bottom), to show only that band. */
    region?: number[]
    caption?: string
  }>(),
  { name: '', page: 1, region: () => [], caption: '' },
)

const { refs } = useWikiResolve(() => (props.name ? [props.name] : []))
const ref_ = computed(() => refs.value.get(props.name))
const doc = computed(() => ref_.value?.document)
const file = computed(() => doc.value?.file)
const transcription = computed(() => doc.value?.transcription)
const pageNo = computed(() => clampPage(props.page, file.value?.pages))
const band = computed(() => normaliseBand(props.region))
const docPath = computed(() => ref_.value?.path ?? '')
const href = computed(() => (ref_.value ? `${ref_.value.path}#page=${pageNo.value}` : ''))
const pdfHref = computed(() => (file.value ? `${file.value.url}#page=${pageNo.value}` : ''))
const title = computed(() => ref_.value?.title ?? props.name)

const sheet = ref<HTMLElement | null>(null)
/** pdf.js's canvas goes here, outside anything Vue renders. */
const canvasHost = ref<HTMLElement | null>(null)
/** The page's height over its width; page 1's thumbnail until the page itself is drawn. */
const ratio = ref(1.294)
/** `idle` until the reader nears the figure; `loading` while pdf.js loads and the page renders. */
const status = ref<'idle' | 'loading' | 'drawn' | 'error'>('idle')
let observer: IntersectionObserver | null = null

watch(file, (f) => {
  if (f) ratio.value = f.thumb.height / f.thumb.width
}, { immediate: true })

async function draw(): Promise<void> {
  if (!file.value || !sheet.value || !canvasHost.value || status.value !== 'idle') return
  status.value = 'loading'
  try {
    const pdf = await openPdf(file.value.url)
    const width = sheet.value?.clientWidth
    if (!width || !canvasHost.value) throw new Error('figure gone')
    const { canvas, height } = await drawPage(pdf, pageNo.value, width)
    ratio.value = height / width
    canvas.className = 'ufo-wdoc-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    canvasHost.value.replaceChildren(canvas)
    status.value = 'drawn'
  }
  catch {
    status.value = 'error'
  }
}

/** After a failure: the frame is a link again once it re-renders, then draw. */
async function retry(): Promise<void> {
  status.value = 'idle'
  await nextTick()
  void draw()
}

function watchSheet(): void {
  if (!sheet.value || observer || !file.value) return
  observer = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) {
      observer?.disconnect()
      void draw()
    }
  }, { rootMargin: '400px 0px' })
  observer.observe(sheet.value)
}

onMounted(watchSheet)
watch([sheet, file], watchSheet)
onBeforeUnmount(() => observer?.disconnect())

/** The visible window's height, as a share of the page's width (for `aspect-ratio`). */
const windowRatio = computed(() => (band.value ? (band.value[1] - band.value[0]) * ratio.value : ratio.value))
const sheetShift = computed(() => (band.value ? `${-band.value[0] * 100}%` : '0'))
const showStandin = computed(() => pageNo.value === 1 && status.value !== 'drawn')
/** The page links to the viewer, except when it failed: the panel in its place has links of its own. */
const frameIs = computed(() => (status.value === 'error' ? 'div' : NuxtLink))

const facts = computed(() => {
  const d = doc.value
  if (!d) return ''
  return [d.issuer, d.date].filter(Boolean).join(' · ')
})
const label = computed(() => `${title.value}, page ${pageNo.value}${file.value ? ` of ${file.value.pages}` : ''}`)
const statusText = computed(() => {
  if (status.value === 'loading') return `Loading page ${pageNo.value} of ${title.value}`
  if (status.value === 'error') return `Page ${pageNo.value} of ${title.value} couldn’t be shown.`
  return ''
})

/* The transcript dialog mounts (and its code and the note load) on first open. */
const transcriptMounted = ref(false)
const transcriptOpen = ref(false)
const transcriptBtn = ref<HTMLButtonElement | null>(null)
function openTranscript(): void {
  transcriptMounted.value = true
  transcriptOpen.value = true
}
function onTranscriptClosed(): void {
  transcriptBtn.value?.focus()
}
</script>

<template>
  <figure
    v-if="file"
    class="ufo-wdoc"
    :class="{ 'is-band': band }"
    :aria-busy="status === 'loading' ? 'true' : undefined"
  >
    <div class="ufo-wdoc-head">
      <span class="ufo-wdoc-kicker">
        <FileText class="ufo-wdoc-kicker-icon" aria-hidden="true" />
        Source document
      </span>
      <div class="ufo-wdoc-actions">
        <button
          v-if="transcription"
          ref="transcriptBtn"
          type="button"
          class="ufo-wdoc-btn"
          aria-haspopup="dialog"
          :aria-expanded="transcriptOpen"
          @click="openTranscript"
        >
          <ScrollText class="ufo-wdoc-btn-icon" aria-hidden="true" />
          Transcript<span class="sr-only"> of {{ title }}</span>
        </button>
        <NuxtLink :to="docPath" class="ufo-wdoc-btn">
          <BookOpen class="ufo-wdoc-btn-icon" aria-hidden="true" />
          Document page<span class="sr-only">: {{ title }}</span>
        </NuxtLink>
      </div>
    </div>

    <component
      :is="frameIs"
      v-bind="status === 'error' ? {} : { to: href, 'aria-label': `${label}. Open in the document viewer` }"
      class="ufo-wdoc-frame"
    >
      <div
        class="ufo-wdoc-window"
        :class="{ 'is-failed': status === 'error' }"
        :style="status === 'error' ? undefined : { aspectRatio: `1 / ${windowRatio}` }"
      >
        <div
          ref="sheet"
          class="ufo-wdoc-sheet"
          :style="{ aspectRatio: `1 / ${ratio}`, transform: `translateY(${sheetShift})` }"
        >
          <img
            v-if="showStandin"
            :src="file.thumb.src"
            :width="file.thumb.width"
            :height="file.thumb.height"
            alt=""
            loading="lazy"
            decoding="async"
            class="ufo-wdoc-standin"
          >
          <div ref="canvasHost" />
        </div>

        <!-- Reserved space while the page isn't drawn: ghost lines (or page
             1's thumbnail) and, once loading starts, a visible label. -->
        <div
          v-if="status === 'idle' || status === 'loading'"
          class="ufo-wdoc-loading"
          aria-hidden="true"
        >
          <div v-if="!showStandin" class="ufo-wdoc-ghost" :class="{ 'ufo-skeleton': status === 'loading' }">
            <span v-for="i in 14" :key="i" class="ufo-wdoc-ghost-line" />
          </div>
          <span v-if="status === 'loading'" class="ufo-wdoc-pill">
            <span class="ufo-wdoc-spinner" />
            Loading page {{ pageNo }}…
          </span>
        </div>

        <div v-else-if="status === 'error'" class="ufo-wdoc-fail">
          <p class="ufo-wdoc-fail-text">
            Page {{ pageNo }} couldn’t be shown here.
          </p>
          <div class="ufo-wdoc-fail-actions">
            <a :href="pdfHref" target="_blank" rel="noopener noreferrer" class="ufo-wdoc-btn">
              Open the PDF<ExternalLink class="ufo-wdoc-btn-icon" aria-hidden="true" />
              <span class="sr-only"> (opens in a new tab)</span>
            </a>
            <NuxtLink :to="href" class="ufo-wdoc-btn">
              Open in the viewer
            </NuxtLink>
            <button type="button" class="ufo-wdoc-btn" @click="retry">
              <RotateCw class="ufo-wdoc-btn-icon" aria-hidden="true" />
              Try again
            </button>
          </div>
        </div>
      </div>
    </component>

    <p role="status" class="sr-only">
      {{ statusText }}
    </p>

    <figcaption class="ufo-wdoc-caption">
      <span v-if="caption" class="ufo-wdoc-caption-text">{{ caption }}</span>
      <span class="ufo-wdoc-source">
        <FileText class="ufo-wdoc-icon" aria-hidden="true" />
        <NuxtLink :to="href">{{ title }}</NuxtLink>, page {{ pageNo }} of {{ file.pages }}<template v-if="facts"> · {{ facts }}</template>
      </span>
    </figcaption>

    <LazyWikiDocumentTranscriptDialog
      v-if="transcriptMounted && transcription"
      v-model:open="transcriptOpen"
      :title="title"
      :to="transcription"
      :page="pageNo"
      @closed="onTranscriptClosed"
    />
  </figure>

  <aside v-else-if="ref_" class="ufo-wdoc-card">
    <div class="ufo-wdoc-head">
      <span class="ufo-wdoc-kicker">
        <FileText class="ufo-wdoc-kicker-icon" aria-hidden="true" />
        Source document
      </span>
      <div class="ufo-wdoc-actions">
        <button
          v-if="transcription"
          ref="transcriptBtn"
          type="button"
          class="ufo-wdoc-btn"
          aria-haspopup="dialog"
          :aria-expanded="transcriptOpen"
          @click="openTranscript"
        >
          <ScrollText class="ufo-wdoc-btn-icon" aria-hidden="true" />
          Transcript<span class="sr-only"> of {{ title }}</span>
        </button>
        <NuxtLink :to="docPath" class="ufo-wdoc-btn">
          <BookOpen class="ufo-wdoc-btn-icon" aria-hidden="true" />
          Document page<span class="sr-only">: {{ title }}</span>
        </NuxtLink>
      </div>
    </div>
    <div class="ufo-wdoc-card-body">
      <NuxtLink :to="ref_.path" class="ufo-wdoc-card-title">{{ title }}</NuxtLink>
      <p v-if="facts" class="ufo-wdoc-card-facts">{{ facts }}</p>
      <p v-if="caption" class="ufo-wdoc-card-caption">{{ caption }}</p>
      <a v-if="doc?.source" :href="doc.source" target="_blank" rel="noopener noreferrer" class="ufo-wdoc-card-source">
        Read it at the source<ExternalLink class="ufo-wdoc-icon" aria-hidden="true" />
      </a>
    </div>

    <LazyWikiDocumentTranscriptDialog
      v-if="transcriptMounted && transcription"
      v-model:open="transcriptOpen"
      :title="title"
      :to="transcription"
      :page="pageNo"
      @closed="onTranscriptClosed"
    />
  </aside>
</template>

<style scoped>
.ufo-wdoc {
  margin: 1.75rem auto;
  max-width: 520px;
}
.ufo-wdoc.is-band {
  max-width: none;
}

/* Header: what this is, and the ways out of it. */
.ufo-wdoc-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  margin-bottom: 10px;
}
.ufo-wdoc-kicker {
  display: inline-flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}
.ufo-wdoc-kicker-icon {
  width: 14px;
  height: 14px;
  color: hsl(var(--graph-cat-documents));
}
.ufo-wdoc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}
.ufo-wdoc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--card));
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  color: hsl(var(--foreground));
  text-decoration: none;
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard);
}
.ufo-wdoc-btn:hover {
  border-color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.07);
}
.ufo-wdoc-btn:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.ufo-wdoc-btn-icon {
  flex: none;
  width: 16px;
  height: 16px;
  color: hsl(var(--primary));
}

.ufo-wdoc-frame {
  display: block;
  border-radius: 4px;
  text-decoration: none;
}
.ufo-wdoc-frame:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 3px;
}
.ufo-wdoc-window {
  position: relative;
  overflow: hidden;
  border-radius: 2px;
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.18), 0 0 0 1px rgb(0 0 0 / 0.06);
  transition: box-shadow var(--dur-fast) var(--ease-standard);
}
a.ufo-wdoc-frame:hover .ufo-wdoc-window {
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.22), 0 0 0 1px hsl(var(--primary) / 0.5);
}
/* Paper stays paper in every theme. The sheet is the whole page; the window
   above it shows the whole of it, or only `region`'s band. */
.ufo-wdoc-sheet {
  width: 100%;
  background: #fff;
}
.ufo-wdoc-sheet :deep(.ufo-wdoc-canvas),
.ufo-wdoc-standin {
  display: block;
  width: 100%;
  height: auto;
}
.ufo-wdoc-standin {
  filter: blur(1px);
  opacity: 0.7;
}

/* Loading: ghost lines of text on the paper, and a label once it's under way. */
.ufo-wdoc-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ufo-wdoc-ghost {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 4.5%;
  padding: 10% 11%;
  overflow: hidden;
}
.is-band .ufo-wdoc-ghost {
  gap: 14px;
  padding: 18px 6%;
}
.ufo-wdoc-ghost-line {
  display: block;
  flex: none;
  height: 8px;
  border-radius: 2px;
  background: rgb(0 0 0 / 0.07);
}
.ufo-wdoc-ghost-line:nth-child(1) {
  width: 46%;
  height: 12px;
}
.ufo-wdoc-ghost-line:nth-child(5n) {
  width: 64%;
}
.ufo-wdoc-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 999px;
  background: hsl(var(--popover));
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--popover-foreground));
}
.ufo-wdoc-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid hsl(var(--primary) / 0.25);
  border-top-color: hsl(var(--primary));
  border-radius: 50%;
  animation: ufo-wdoc-spin 0.9s linear infinite;
}
@keyframes ufo-wdoc-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .ufo-wdoc-spinner {
    animation: none;
    border-color: hsl(var(--primary) / 0.6);
  }
  .ufo-wdoc-window,
  .ufo-wdoc-btn {
    transition: none;
  }
}

/* Failed: the paper gives way to a panel with ways to read the page anyway.
   No aspect ratio here: a min-height would carry through it into a min-width
   and push the figure past a phone's edge. */
.ufo-wdoc-window.is-failed {
  background: hsl(var(--card));
  box-shadow: 0 0 0 1px hsl(var(--border));
}
.ufo-wdoc-window.is-failed .ufo-wdoc-sheet {
  display: none;
}
.ufo-wdoc-fail {
  display: flex;
  min-height: 176px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  text-align: center;
}
.ufo-wdoc-fail-text {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: hsl(var(--foreground));
}
.ufo-wdoc-fail-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.ufo-wdoc-caption {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 10px;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.45;
  color: hsl(var(--muted-foreground));
}
.ufo-wdoc-caption-text {
  color: hsl(var(--foreground));
}
.ufo-wdoc-source {
  font-size: 12.5px;
}
.ufo-wdoc-source a,
.ufo-wdoc-card-body a {
  color: hsl(var(--primary));
  text-underline-offset: 2px;
}
.ufo-wdoc-icon {
  display: inline;
  width: 12px;
  height: 12px;
  margin-right: 4px;
  vertical-align: -1px;
}

.ufo-wdoc-card {
  margin: 1.75rem 0;
  padding: 12px 16px 14px;
  border: 1px dashed hsl(var(--border));
  border-radius: 8px;
  font-family: var(--font-sans);
  font-size: 13.5px;
  line-height: 1.5;
}
.ufo-wdoc-card-title {
  font-weight: 600;
}
.ufo-wdoc-card p {
  margin: 2px 0 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
}
.ufo-wdoc-card-caption {
  color: hsl(var(--foreground)) !important;
}
.ufo-wdoc-card-source {
  display: inline-block;
  margin-top: 4px;
}
.ufo-wdoc-card-source .ufo-wdoc-icon {
  margin: 0 0 0 3px;
}
</style>
