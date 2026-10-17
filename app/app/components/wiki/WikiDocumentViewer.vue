<script setup lang="ts">
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { NoteDocument } from '#shared/types/wiki'
import { ChevronLeft, ChevronRight, Download, ExternalLink, Minus, Plus, ScrollText } from '@lucide/vue'
import { closePdf, loadPdfjs, openPdf } from '@/utils/pdf'

/**
 * The document itself, on its Documents note: every page of the hosted PDF in
 * a scrolling frame, drawn by pdf.js with a selectable text layer, plus page
 * and zoom controls and links to the file and its source. pdf.js loads only
 * here, in the browser, when the frame mounts, and fetches the PDF in ranges
 * as pages scroll into view, so a long report doesn't download whole.
 *
 * `#page=N` in the address opens the frame on that page.
 *
 * Without a hosted file it says why (the rights, or no public copy) and links
 * to the source instead.
 */
const props = defineProps<{ document: NoteDocument, title: string }>()

const file = computed(() => props.document.file)
const sourceHost = computed(() => {
  if (!props.document.source) return ''
  try {
    return new URL(props.document.source).hostname.replace(/^www\./, '')
  }
  catch {
    return ''
  }
})

/** Why there's no file to show, in a sentence. */
const missingReason = computed(() => {
  const { rights, source } = props.document
  if (!source) return 'No public copy of this document is known.'
  if (rights === 'copyrighted') return 'This document is under copyright, so it isn’t hosted here.'
  if (rights === 'unclear') return 'Its copyright status is unclear, so it isn’t hosted here.'
  return 'A copy hasn’t been archived here yet.'
})

interface PageBox {
  n: number
  /** Unscaled size in PDF points; page 1's until the page itself loads. */
  w: number
  h: number
}

const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const pages = ref<PageBox[]>([])
const current = ref(1)
/** 1 fits the page to the frame's width. */
const zoom = ref(1)
const frameWidth = ref(0)

const scroller = ref<HTMLElement | null>(null)
const pageEls = new Map<number, HTMLElement>()

let pdf: PDFDocumentProxy | null = null
let TextLayerCtor: typeof import('pdfjs-dist/legacy/build/pdf.mjs').TextLayer | null = null
const rendered = new Map<number, number>() // page -> scale it was drawn at
const inView = new Set<number>()
let observer: IntersectionObserver | null = null
let resizeObserver: ResizeObserver | null = null
let disposed = false

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

function scaleFor(box: PageBox): number {
  const usable = Math.max(0, frameWidth.value - 32)
  return box.w ? (usable / box.w) * zoom.value : 1
}

function setPageEl(n: number, el: Element | null): void {
  if (el instanceof HTMLElement) {
    pageEls.set(n, el)
    observer?.observe(el)
  }
  else {
    pageEls.delete(n)
  }
}

async function renderPage(n: number): Promise<void> {
  if (!pdf || disposed) return
  const box = pages.value[n - 1]
  const el = pageEls.get(n)
  if (!box || !el) return
  const scale = scaleFor(box)
  if (rendered.get(n) === scale) return
  rendered.set(n, scale)

  const page: PDFPageProxy = await pdf.getPage(n)
  if (disposed) return
  const base = page.getViewport({ scale: 1 })
  if (base.width !== box.w || base.height !== box.h) {
    box.w = base.width
    box.h = base.height
    rendered.delete(n)
    return renderPage(n)
  }

  const viewport = page.getViewport({ scale })
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width * dpr)
  canvas.height = Math.floor(viewport.height * dpr)
  canvas.className = 'ufo-doc-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  await page.render({
    canvas,
    viewport: page.getViewport({ scale: scale * dpr }),
  }).promise.catch(() => undefined)
  if (disposed || rendered.get(n) !== scale) return

  const text = document.createElement('div')
  text.className = 'textLayer'
  el.replaceChildren(canvas, text)
  el.style.setProperty('--scale-factor', String(scale))
  if (TextLayerCtor) {
    await new TextLayerCtor({
      textContentSource: page.streamTextContent(),
      container: text,
      viewport,
    }).render().catch(() => undefined)
  }
}

/** Redraw what's on screen after a zoom or resize; the rest redraws as it scrolls in. */
function redrawVisible(): void {
  for (const n of inView) void renderPage(n)
}

async function load(): Promise<void> {
  if (!file.value || status.value !== 'idle') return
  status.value = 'loading'
  try {
    TextLayerCtor = (await loadPdfjs()).TextLayer
    pdf = await openPdf(file.value.url)
    if (disposed) return
    const first = (await pdf.getPage(1)).getViewport({ scale: 1 })
    pages.value = Array.from({ length: pdf.numPages }, (_, i) => ({ n: i + 1, w: first.width, h: first.height }))
    status.value = 'ready'
    await nextTick()
    const wanted = /^#page=(\d+)$/.exec(location.hash)?.[1]
    if (wanted) goTo(Number(wanted), 'instant')
  }
  catch {
    if (!disposed) status.value = 'error'
  }
}

function goTo(n: number, behavior: ScrollBehavior = 'smooth'): void {
  const target = Math.min(Math.max(1, n), pages.value.length || 1)
  const el = pageEls.get(target)
  if (el && scroller.value) scroller.value.scrollTo({ top: el.offsetTop - 16, behavior })
  current.value = target
}

function onScroll(): void {
  const top = (scroller.value?.scrollTop ?? 0) + (scroller.value?.clientHeight ?? 0) / 3
  let best = 1
  for (const [n, el] of pageEls) {
    if (el.offsetTop <= top && n > best) best = n
  }
  current.value = best
}

function zoomBy(step: 1 | -1): void {
  const i = ZOOM_STEPS.indexOf(zoom.value)
  zoom.value = ZOOM_STEPS[Math.min(Math.max(0, i + step), ZOOM_STEPS.length - 1)]!
}

watch(zoom, () => nextTick(redrawVisible))

let resizeTimer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  if (!file.value || !scroller.value) return
  frameWidth.value = scroller.value.clientWidth
  resizeObserver = new ResizeObserver(() => {
    const width = scroller.value?.clientWidth ?? 0
    if (width === frameWidth.value) return
    frameWidth.value = width
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(redrawVisible, 150)
  })
  resizeObserver.observe(scroller.value)
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const n = Number((entry.target as HTMLElement).dataset.page)
      if (entry.isIntersecting) {
        inView.add(n)
        void renderPage(n)
      }
      else {
        inView.delete(n)
      }
    }
  }, { root: scroller.value, rootMargin: '600px 0px' })
  for (const el of pageEls.values()) observer.observe(el)
  void load()
})

onBeforeUnmount(() => {
  disposed = true
  clearTimeout(resizeTimer)
  observer?.disconnect()
  resizeObserver?.disconnect()
  if (pdf && file.value) {
    closePdf(file.value.url)
    void pdf.destroy()
  }
})

const pageLabel = computed(() => (file.value?.pages === 1 ? '1 page' : `${file.value?.pages ?? 0} pages`))
const sizeLabel = computed(() => {
  const bytes = file.value?.bytes ?? 0
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`
})
</script>

<template>
  <figure v-if="file" class="ufo-doc" :aria-label="`${title}, ${pageLabel}`">
    <div class="ufo-doc-bar">
      <p class="ufo-doc-kicker">
        Document · {{ pageLabel }} · {{ sizeLabel }}
      </p>
      <div class="ufo-doc-controls">
        <template v-if="status === 'ready' && pages.length > 1">
          <button type="button" class="ufo-doc-btn" aria-label="Previous page" :disabled="current <= 1" @click="goTo(current - 1)">
            <ChevronLeft class="ufo-doc-icon" aria-hidden="true" />
          </button>
          <span class="ufo-doc-count" aria-live="polite">{{ current }} / {{ pages.length }}</span>
          <button type="button" class="ufo-doc-btn" aria-label="Next page" :disabled="current >= pages.length" @click="goTo(current + 1)">
            <ChevronRight class="ufo-doc-icon" aria-hidden="true" />
          </button>
        </template>
        <template v-if="status === 'ready'">
          <button type="button" class="ufo-doc-btn" aria-label="Zoom out" :disabled="zoom <= ZOOM_STEPS[0]!" @click="zoomBy(-1)">
            <Minus class="ufo-doc-icon" aria-hidden="true" />
          </button>
          <span class="ufo-doc-count">{{ Math.round(zoom * 100) }}%</span>
          <button type="button" class="ufo-doc-btn" aria-label="Zoom in" :disabled="zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]!" @click="zoomBy(1)">
            <Plus class="ufo-doc-icon" aria-hidden="true" />
          </button>
        </template>
        <NuxtLink v-if="document.transcription" class="ufo-doc-btn ufo-doc-btn-text" :to="document.transcription">
          <ScrollText class="ufo-doc-icon" aria-hidden="true" />
          Transcription
        </NuxtLink>
        <a class="ufo-doc-btn ufo-doc-btn-text" :href="file.url" target="_blank" rel="noopener noreferrer">
          <Download class="ufo-doc-icon" aria-hidden="true" />
          PDF
        </a>
      </div>
    </div>

    <div ref="scroller" class="ufo-doc-scroller" tabindex="0" :aria-busy="status === 'loading'" @scroll.passive="onScroll">
      <template v-if="status === 'ready'">
        <div
          v-for="box in pages"
          :key="box.n"
          :ref="el => setPageEl(box.n, el as Element | null)"
          :data-page="box.n"
          class="ufo-doc-page"
          :style="{ width: `${box.w * scaleFor(box)}px`, height: `${box.h * scaleFor(box)}px` }"
          role="img"
          :aria-label="`Page ${box.n}`"
        />
      </template>

      <!-- Page 1 stands in, from the baked thumbnail, while pdf.js loads. -->
      <img
        v-else-if="status !== 'error'"
        :src="file.thumb.src"
        :width="file.thumb.width"
        :height="file.thumb.height"
        alt=""
        class="ufo-doc-page ufo-doc-standin"
      >

      <div v-else class="ufo-doc-error">
        <p>The document couldn’t be displayed here.</p>
        <a :href="file.url" target="_blank" rel="noopener noreferrer">Open the PDF</a>
      </div>
    </div>

    <figcaption v-if="document.source" class="ufo-doc-caption">
      Retrieved {{ file.retrieved }} from <a :href="document.source" target="_blank" rel="noopener noreferrer">{{ sourceHost }}<ExternalLink class="ufo-doc-icon-inline" aria-hidden="true" /></a><template v-if="file.fetchedFrom !== document.source">
        (via <a :href="file.fetchedFrom" target="_blank" rel="noopener noreferrer">an archived copy</a>)</template><template v-if="file.fromImages">, where it is served as page images. They are bound here into one PDF, each page re-encoded at a smaller size</template>.
      <template v-if="file.ocr">
        The selectable text was added by OCR and may misread the scan<template v-if="document.transcription">; the <NuxtLink :to="document.transcription">transcription</NuxtLink> is checked against the page images</template>.
      </template>
    </figcaption>
  </figure>

  <aside v-else class="ufo-doc-missing">
    <p class="ufo-doc-kicker">
      Document
    </p>
    <p>{{ missingReason }}</p>
    <a v-if="document.source" :href="document.source" target="_blank" rel="noopener noreferrer">
      Read it at {{ sourceHost }}<ExternalLink class="ufo-doc-icon-inline" aria-hidden="true" />
    </a>
  </aside>
</template>

<style scoped>
.ufo-doc {
  margin: 0 0 2rem;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  overflow: hidden;
  background: hsl(var(--card));
}
.ufo-doc-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  padding: 8px 12px;
  border-bottom: 1px solid hsl(var(--border));
}
.ufo-doc-kicker {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  line-height: 1.4;
  color: hsl(var(--muted-foreground));
}
.ufo-doc-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
/* The record and timeline components' small-control look. */
.ufo-doc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  background: hsl(var(--card));
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  text-decoration: none;
  transition: color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
}
.ufo-doc-btn:hover:not(:disabled) {
  color: hsl(var(--foreground));
  border-color: hsl(var(--primary));
}
.ufo-doc-btn:disabled {
  opacity: 0.45;
}
.ufo-doc-btn:focus-visible,
.ufo-doc-scroller:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.ufo-doc-btn-text {
  margin-left: 6px;
  padding: 0 9px;
}
.ufo-doc-icon {
  width: 13px;
  height: 13px;
}
.ufo-doc-icon-inline {
  display: inline;
  width: 11px;
  height: 11px;
  margin-left: 2px;
  vertical-align: baseline;
}
.ufo-doc-count {
  min-width: 52px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  color: hsl(var(--foreground));
}

.ufo-doc-scroller {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  height: min(78vh, 980px);
  padding: 16px;
  overflow: auto;
  background: hsl(var(--muted));
}
/* Paper stays paper in every theme: a scan is a picture of a white page. */
.ufo-doc-page {
  position: relative;
  flex: none;
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.18), 0 0 0 1px rgb(0 0 0 / 0.06);
  --user-unit: 1;
  --total-scale-factor: calc(var(--scale-factor, 1) * var(--user-unit));
  --scale-round-x: 1px;
  --scale-round-y: 1px;
}
.ufo-doc-standin {
  width: min(100%, 640px);
  height: auto;
  filter: blur(1px);
  opacity: 0.7;
}
.ufo-doc-page :deep(.ufo-doc-canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
.ufo-doc-error {
  margin: auto;
  font-family: var(--font-sans);
  font-size: 14px;
  text-align: center;
  color: hsl(var(--muted-foreground));
}
.ufo-doc-error a,
.ufo-doc-caption a,
.ufo-doc-missing a {
  color: hsl(var(--primary));
  text-underline-offset: 2px;
}
.ufo-doc-caption {
  padding: 8px 12px;
  border-top: 1px solid hsl(var(--border));
  font-family: var(--font-sans);
  font-size: 12.5px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
}
.ufo-doc-missing {
  margin: 0 0 2rem;
  padding: 14px 16px;
  border: 1px dashed hsl(var(--border));
  border-radius: 8px;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: hsl(var(--foreground));
}
.ufo-doc-missing p {
  margin: 0 0 6px;
}

/* pdf.js's selectable text layer, trimmed from pdfjs-dist/web/pdf_viewer.css. */
.ufo-doc-page :deep(.textLayer) {
  position: absolute;
  inset: 0;
  overflow: clip;
  opacity: 1;
  line-height: 1;
  text-align: initial;
  letter-spacing: normal;
  word-spacing: normal;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  caret-color: CanvasText;
  z-index: 0;
  --min-font-size: 1;
  --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
  --min-font-size-inv: calc(1 / var(--min-font-size));
}
.ufo-doc-page :deep(.textLayer :is(span, br)) {
  position: absolute;
  color: transparent;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  user-select: text;
}
.ufo-doc-page :deep(.textLayer > :not(.markedContent)),
.ufo-doc-page :deep(.textLayer .markedContent span:not(.markedContent)) {
  z-index: 1;
  --font-height: 0;
  font-size: calc(var(--text-scale-factor) * var(--font-height));
  --scale-x: 1;
  --rotate: 0deg;
  transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}
.ufo-doc-page :deep(.textLayer .markedContent) {
  display: contents;
}
.ufo-doc-page :deep(.textLayer ::selection) {
  background: rgb(0 90 255 / 0.25);
}
.ufo-doc-page :deep(.textLayer .endOfContent) {
  display: block;
  position: absolute;
  inset: 100% 0 0;
  z-index: 0;
  cursor: default;
  user-select: none;
}
</style>
