<script setup lang="ts">
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import type { DocumentFile } from '#shared/types/wiki'
import { ChevronLeft, ChevronRight, Download, ExternalLink, Maximize2, Minimize2, Minus, Plus, RotateCw } from '@lucide/vue'
import { acquirePdf, canvasScale, loadPdfjs, type PdfHandle } from '@/utils/pdf'
import { openingScrollTop, pageAt, stepZoom, ZOOM_STEPS } from '@/utils/wikiDocument'

/**
 * A hosted PDF, readable in place (registered as `WikiDocumentPdfFrame`):
 * every page in a scrolling frame, drawn by pdf.js with a selectable text
 * layer, with page and zoom controls, a full-screen button and a link to the
 * file. Both the viewer on a document's own page (`WikiDocumentViewer`) and
 * the `::wiki-document` widget in articles are this frame with their own
 * header and caption around it.
 *
 * Only pages near what's visible are drawn: a page draws as it comes within
 * 600px of the frame's view and is freed (canvas, text layer and pdf.js's
 * page data) once it's 2000px away, so a 412-page report holds a handful of
 * canvases at a time. pdf.js fetches the file in byte ranges as pages draw.
 *
 * - `lazy`: nothing loads (pdf.js, the PDF) until the frame comes within
 *   600px of the viewport, and every drawn page is freed again when the frame
 *   is 1500px away from it.
 * - `gated`: the frame doesn't take wheel or touch scrolling until the reader
 *   clicks, taps or tabs into it, so an article scrolls past it freely; a
 *   click or tap elsewhere hands scrolling back to the page.
 * - `startPage` and `band`: where it opens, and a band of that page
 *   (fractions of its height) scrolled into view and outlined.
 * - `readHash`: open at `#page=N` from the address. Only the document page's
 *   viewer reads it; nothing here ever writes the address.
 */
const props = withDefaults(defineProps<{
  file: DocumentFile
  title: string
  startPage?: number
  band?: readonly [number, number] | null
  readHash?: boolean
  lazy?: boolean
  gated?: boolean
  /** `page`: the tall frame of a document's page; `article`: shorter, for a figure in prose. */
  size?: 'page' | 'article'
  /** The document page's viewer at this page, offered when the frame fails. */
  viewerHref?: string
}>(), { startPage: 1, band: null, readHash: false, lazy: false, gated: false, size: 'page', viewerHref: '' })

/** The page the reader is on (the one a third of the way down the frame). */
const current = defineModel<number>('current', { default: 1 })

interface PageBox {
  n: number
  /** Unscaled size in PDF points; the opening page's until the page itself loads. */
  w: number
  h: number
}

const uid = useId()
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const pages = ref<PageBox[]>([])
const zoom = ref(1)
const frameWidth = ref(0)
/** The frame is within reach of the viewport (always, unless `lazy`). */
const near = ref(!props.lazy)
/** The frame takes wheel and touch scrolling (always, unless `gated`). */
const engaged = ref(!props.gated)
const fullscreen = ref(false)
const canFullscreen = ref(false)

const root = ref<HTMLElement | null>(null)
const scroller = ref<HTMLElement | null>(null)
const pageEls = new Map<number, HTMLElement>()

let handle: PdfHandle | null = null
let pdf: PDFDocumentProxy | null = null
let TextLayerCtor: typeof import('pdfjs-dist/legacy/build/pdf.mjs').TextLayer | null = null
/** A page's draw, current or under way, and the scale it's for. */
interface Paint { scale: number, task?: RenderTask }
const painting = new Map<number, Paint>()
/** The canvas each drawn page shows. */
const shown = new Map<number, HTMLCanvasElement>()
/** Pages within the draw margin of the frame's view. */
const nearby = new Set<number>()
let drawObserver: IntersectionObserver | null = null
let keepObserver: IntersectionObserver | null = null
let nearObserver: IntersectionObserver | null = null
let farObserver: IntersectionObserver | null = null
let resizeObserver: ResizeObserver | null = null
let disposed = false

const openPage = computed(() => Math.min(Math.max(1, props.startPage), props.file.pages || props.startPage))

function scaleFor(box: PageBox): number {
  const usable = Math.min(Math.max(0, frameWidth.value - 32), 1100)
  return box.w ? (usable / box.w) * zoom.value : 1
}

function setPageEl(n: number, el: Element | null): void {
  const old = pageEls.get(n)
  if (old && old !== el) {
    drawObserver?.unobserve(old)
    keepObserver?.unobserve(old)
  }
  if (el instanceof HTMLElement) {
    if (old === el) return
    pageEls.set(n, el)
    drawObserver?.observe(el)
    keepObserver?.observe(el)
  }
  else {
    pageEls.delete(n)
  }
}

function paintHost(n: number): HTMLElement | null {
  return pageEls.get(n)?.querySelector<HTMLElement>('.ufo-pdf-paint') ?? null
}

function dropCanvas(c: HTMLCanvasElement | undefined): void {
  if (!c) return
  // Safari holds a canvas's memory until it's shrunk, not when it's detached.
  c.width = 0
  c.height = 0
}

/** Forget page `n`'s drawing: stop a draw under way, free its canvas, text layer and pdf.js data. */
function freePage(n: number): void {
  const p = painting.get(n)
  if (!p) return
  painting.delete(n)
  p.task?.cancel()
  dropCanvas(shown.get(n))
  shown.delete(n)
  paintHost(n)?.replaceChildren()
  pdf?.getPage(n).then(page => page.cleanup()).catch(() => undefined)
}

function freeAll(): void {
  for (const n of [...painting.keys()]) freePage(n)
}

/** A page turned out a different size from the one assumed: keep what the reader sees still. */
function resizeBox(box: PageBox, w: number, h: number): void {
  const el = pageEls.get(box.n)
  const sc = scroller.value
  const before = box.h * scaleFor(box)
  // Only a page wholly above the view moves what the reader sees.
  const above = !!el && !!sc && el.offsetTop + before <= sc.scrollTop
  box.w = w
  box.h = h
  const delta = box.h * scaleFor(box) - before
  if (above && sc && delta) void nextTick(() => { sc.scrollTop += delta })
}

async function renderPage(n: number): Promise<void> {
  if (!pdf || disposed || !near.value || !nearby.has(n)) return
  const box = pages.value[n - 1]
  if (!box || !pageEls.get(n)) return
  const scale = scaleFor(box)
  if (painting.get(n)?.scale === scale) return
  painting.get(n)?.task?.cancel()
  const paint: Paint = { scale }
  painting.set(n, paint)

  let page: PDFPageProxy
  try {
    page = await pdf.getPage(n)
  }
  catch {
    if (painting.get(n) === paint) painting.delete(n)
    return
  }
  if (disposed || painting.get(n) !== paint) return
  const base = page.getViewport({ scale: 1 })
  if (Math.abs(base.width - box.w) > 0.5 || Math.abs(base.height - box.h) > 0.5) {
    resizeBox(box, base.width, base.height)
    painting.delete(n)
    await nextTick()
    return renderPage(n)
  }

  const viewport = page.getViewport({ scale })
  const out = canvasScale(viewport.width, viewport.height, window.devicePixelRatio || 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width * out)
  canvas.height = Math.floor(viewport.height * out)
  canvas.className = 'ufo-pdf-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  paint.task = page.render({ canvas, viewport: page.getViewport({ scale: scale * out }) })
  try {
    await paint.task.promise
  }
  catch {
    // Cancelled (scrolled away, zoomed, freed) or failed: leave the paper blank.
    dropCanvas(canvas)
    if (painting.get(n) === paint) painting.delete(n)
    return
  }
  paint.task = undefined
  const host = paintHost(n)
  if (disposed || painting.get(n) !== paint || !host) {
    dropCanvas(canvas)
    return
  }

  const text = document.createElement('div')
  text.className = 'textLayer'
  host.replaceChildren(canvas, text)
  dropCanvas(shown.get(n))
  shown.set(n, canvas)
  pageEls.get(n)?.style.setProperty('--scale-factor', String(scale))
  if (TextLayerCtor) {
    await new TextLayerCtor({
      textContentSource: page.streamTextContent(),
      container: text,
      viewport,
    }).render().catch(() => undefined)
  }
}

/** Redraw what's near the view after a zoom or resize; the rest draws as it scrolls in. */
function redrawNearby(): void {
  for (const n of nearby) void renderPage(n)
}

async function load(): Promise<void> {
  if (status.value !== 'idle' || disposed) return
  status.value = 'loading'
  try {
    TextLayerCtor = (await loadPdfjs()).TextLayer
    handle = acquirePdf(props.file.url, props.file.bytes)
    pdf = await handle.pdf
    if (disposed) return
    const hashed = props.readHash ? Number(/^#page=(\d+)$/.exec(location.hash)?.[1] ?? 0) : 0
    const target = Math.min(Math.max(1, hashed || openPage.value), pdf.numPages)
    // Every page is assumed the opening page's size until it draws, so the
    // opening page sits exactly where it will stay.
    const size = (await pdf.getPage(target)).getViewport({ scale: 1 })
    if (disposed) return
    pages.value = Array.from({ length: pdf.numPages }, (_, i) => ({ n: i + 1, w: size.width, h: size.height }))
    status.value = 'ready'
    await nextTick()
    openAt(target, target === openPage.value ? props.band : null)
  }
  catch {
    handle?.release()
    handle = null
    pdf = null
    if (!disposed) status.value = 'error'
  }
}

function retry(): void {
  status.value = 'idle'
  void load()
}

function openAt(n: number, band: readonly [number, number] | null): void {
  const el = pageEls.get(n)
  const box = pages.value[n - 1]
  const sc = scroller.value
  if (!el || !box || !sc) return
  sc.scrollTop = openingScrollTop({
    pageTop: el.offsetTop,
    pageHeight: box.h * scaleFor(box),
    frameHeight: sc.clientHeight,
    band,
  })
  current.value = n
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function goTo(n: number): void {
  const target = Math.min(Math.max(1, Math.round(n) || 1), pages.value.length || 1)
  const el = pageEls.get(target)
  // Glide to the next or previous page; jump anywhere further, since pages
  // drawn on the way (and their size corrections) would cut a long glide short.
  const glide = Math.abs(target - current.value) <= 1 && !reducedMotion()
  if (el && scroller.value) scroller.value.scrollTo({ top: el.offsetTop - 16, behavior: glide ? 'smooth' : 'auto' })
  current.value = target
}

function onPageInput(e: Event): void {
  const input = e.target as HTMLInputElement
  const n = Number(input.value)
  if (Number.isFinite(n) && n >= 1) goTo(n)
  input.value = String(current.value)
}

let scrollFrame = 0
function onScroll(): void {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const sc = scroller.value
    if (!sc || !pages.value.length) return
    // At the very end the last page can't reach the third-way line.
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) {
      current.value = pages.value.length
      return
    }
    const y = sc.scrollTop + sc.clientHeight / 3
    current.value = pageAt(pages.value.length, n => pageEls.get(n)?.offsetTop ?? 0, y)
  })
}

/** Change the layout without moving the reader: same page, same point down it. */
async function keepPlace(change: () => void): Promise<void> {
  const sc = scroller.value
  const el = pageEls.get(current.value)
  const f = sc && el && el.offsetHeight ? (sc.scrollTop - el.offsetTop) / el.offsetHeight : null
  change()
  await nextTick()
  if (sc && el && f !== null) sc.scrollTop = el.offsetTop + f * el.offsetHeight
  redrawNearby()
}

function zoomBy(step: 1 | -1): void {
  const next = stepZoom(zoom.value, step)
  if (next !== zoom.value) void keepPlace(() => { zoom.value = next })
}

/* Scrolling hand-over (`gated`). */
function engage(): void {
  engaged.value = true
}
function onDocPointerDown(e: PointerEvent): void {
  if (!props.gated || !engaged.value || fullscreen.value) return
  if (root.value && !root.value.contains(e.target as Node)) engaged.value = false
}
function onFocusOut(e: FocusEvent): void {
  if (!props.gated || fullscreen.value) return
  const to = e.relatedTarget as Node | null
  if (to && root.value && !root.value.contains(to)) engaged.value = false
}

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await root.value?.requestFullscreen()
  }
  catch {
    // Refused (an iframe without permission, say): nothing to undo.
  }
}
function onFullscreenChange(): void {
  const on = !!root.value && document.fullscreenElement === root.value
  if (on === fullscreen.value) return
  void keepPlace(() => { fullscreen.value = on })
  if (on) engaged.value = true
  else if (props.gated) engaged.value = false
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  const sc = scroller.value
  if (!sc || !root.value) return
  frameWidth.value = sc.clientWidth
  canFullscreen.value = !!document.fullscreenEnabled && typeof root.value.requestFullscreen === 'function'
  resizeObserver = new ResizeObserver(() => {
    const width = scroller.value?.clientWidth ?? 0
    // Settle on the latest width: a size that comes back within the delay
    // cancels the change it interrupted. 0 is the frame hidden; keep the last.
    clearTimeout(resizeTimer)
    if (!width || width === frameWidth.value) return
    resizeTimer = setTimeout(() => void keepPlace(() => { frameWidth.value = width }), 150)
  })
  resizeObserver.observe(sc)

  drawObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const n = Number((entry.target as HTMLElement).dataset.page)
      if (entry.isIntersecting) {
        nearby.add(n)
        void renderPage(n)
      }
      else {
        nearby.delete(n)
      }
    }
  }, { root: sc, rootMargin: '600px 0px' })
  keepObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) freePage(Number((entry.target as HTMLElement).dataset.page))
    }
  }, { root: sc, rootMargin: '2000px 0px' })
  for (const el of pageEls.values()) {
    drawObserver.observe(el)
    keepObserver.observe(el)
  }

  document.addEventListener('pointerdown', onDocPointerDown, { capture: true, passive: true })
  document.addEventListener('fullscreenchange', onFullscreenChange)

  if (!props.lazy) {
    void load()
    return
  }
  nearObserver = new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting)) return
    if (!near.value) {
      near.value = true
      redrawNearby()
    }
    if (status.value === 'idle') void load()
  }, { rootMargin: '600px 0px' })
  farObserver = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1]
    if (entry && !entry.isIntersecting && near.value) {
      near.value = false
      freeAll()
    }
  }, { rootMargin: '1500px 0px' })
  nearObserver.observe(root.value)
  farObserver.observe(root.value)
})

onBeforeUnmount(() => {
  disposed = true
  clearTimeout(resizeTimer)
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  for (const o of [drawObserver, keepObserver, nearObserver, farObserver, resizeObserver]) o?.disconnect()
  document.removeEventListener('pointerdown', onDocPointerDown, { capture: true })
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  for (const p of painting.values()) p.task?.cancel()
  for (const c of shown.values()) dropCanvas(c)
  painting.clear()
  shown.clear()
  handle?.release()
})

const ready = computed(() => status.value === 'ready')
const pageCount = computed(() => pages.value.length || props.file.pages)
const pdfHref = computed(() => `${props.file.url}#page=${current.value}`)
const ratio = computed(() => props.file.thumb.height / props.file.thumb.width)
const showThumb = computed(() => openPage.value === 1 && !props.band)
const hint = computed(() => props.gated && !engaged.value && status.value === 'ready')
const statusText = computed(() => {
  if (status.value === 'loading') return `Loading page ${openPage.value} of ${props.title}`
  if (status.value === 'error') return `${props.title} couldn’t be shown here.`
  return ''
})
const bandStyle = computed(() => (props.band
  ? { top: `${props.band[0] * 100}%`, height: `${(props.band[1] - props.band[0]) * 100}%` }
  : undefined))
</script>

<template>
  <div
    ref="root"
    class="ufo-pdf"
    :class="[`is-${size}`, { 'is-fullscreen': fullscreen }]"
    @pointerdown="engage"
    @focusout="onFocusOut"
  >
    <div class="ufo-pdf-bar">
      <div class="ufo-pdf-kicker">
        <span v-if="fullscreen" class="ufo-pdf-fs-title">{{ title }}</span>
        <slot v-else name="kicker" />
      </div>
      <div class="ufo-pdf-controls">
        <!-- Drawn from the start, disabled until the document is ready, so
             the bar doesn't reflow (and the page shift) when it loads. -->
        <template v-if="pageCount > 1">
          <button type="button" class="ufo-pdf-btn" aria-label="Previous page" :disabled="!ready || current <= 1" @click="goTo(current - 1)">
            <ChevronLeft class="ufo-pdf-icon" aria-hidden="true" />
          </button>
          <span class="ufo-pdf-count">
            <label :for="`${uid}-page`" class="sr-only">Page</label>
            <input
              :id="`${uid}-page`"
              class="ufo-pdf-page-input"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              :value="current"
              :disabled="!ready"
              :size="String(pageCount).length"
              @change="onPageInput"
              @keydown.enter.prevent="onPageInput"
            >
            <span aria-hidden="true">/</span>
            <span class="sr-only">of</span>
            {{ pageCount }}
          </span>
          <button type="button" class="ufo-pdf-btn" aria-label="Next page" :disabled="!ready || current >= pageCount" @click="goTo(current + 1)">
            <ChevronRight class="ufo-pdf-icon" aria-hidden="true" />
          </button>
        </template>
        <span class="ufo-pdf-sep" aria-hidden="true" />
        <button type="button" class="ufo-pdf-btn" aria-label="Zoom out" :disabled="!ready || zoom <= ZOOM_STEPS[0]" @click="zoomBy(-1)">
          <Minus class="ufo-pdf-icon" aria-hidden="true" />
        </button>
        <span class="ufo-pdf-zoom" aria-live="polite">{{ Math.round(zoom * 100) }}%</span>
        <button type="button" class="ufo-pdf-btn" aria-label="Zoom in" :disabled="!ready || zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]!" @click="zoomBy(1)">
          <Plus class="ufo-pdf-icon" aria-hidden="true" />
        </button>
        <button
          v-if="canFullscreen"
          type="button"
          class="ufo-pdf-btn"
          :aria-label="fullscreen ? 'Exit full screen' : 'Full screen'"
          :aria-pressed="fullscreen"
          :disabled="!ready"
          @click="toggleFullscreen"
        >
          <Minimize2 v-if="fullscreen" class="ufo-pdf-icon" aria-hidden="true" />
          <Maximize2 v-else class="ufo-pdf-icon" aria-hidden="true" />
        </button>
        <slot name="actions" />
        <a class="ufo-pdf-btn ufo-pdf-btn-text" :href="pdfHref" target="_blank" rel="noopener noreferrer">
          <Download class="ufo-pdf-icon" aria-hidden="true" />
          PDF<span class="sr-only">: {{ title }} (opens in a new tab)</span>
        </a>
      </div>
    </div>

    <div class="ufo-pdf-stage">
      <div
        ref="scroller"
        class="ufo-pdf-scroller"
        :class="{ 'is-gated': !engaged }"
        tabindex="0"
        role="region"
        :aria-label="`${title}, the document`"
        :aria-busy="status === 'loading' ? 'true' : undefined"
        @scroll.passive="onScroll"
        @focusin="engage"
      >
        <template v-if="status === 'ready'">
          <div
            v-for="box in pages"
            :key="box.n"
            :ref="el => setPageEl(box.n, el as Element | null)"
            :data-page="box.n"
            class="ufo-pdf-page"
            :style="{ width: `${box.w * scaleFor(box)}px`, height: `${box.h * scaleFor(box)}px` }"
            role="group"
            :aria-label="band && box.n === openPage ? `Page ${box.n}, with the passage under discussion outlined` : `Page ${box.n}`"
          >
            <div class="ufo-pdf-paint" />
            <div v-if="band && box.n === openPage" class="ufo-pdf-mark" :style="bandStyle" aria-hidden="true" />
          </div>
        </template>

        <!-- The opening page's space, held while pdf.js loads: page 1's baked
             thumbnail, or faint lines of text. -->
        <div
          v-else-if="status !== 'error'"
          class="ufo-pdf-page ufo-pdf-standin"
          :style="{ aspectRatio: `1 / ${ratio}` }"
          aria-hidden="true"
        >
          <img
            v-if="showThumb"
            :src="file.thumb.src"
            :width="file.thumb.width"
            :height="file.thumb.height"
            alt=""
            loading="lazy"
            decoding="async"
            class="ufo-pdf-thumb"
          >
          <div v-else class="ufo-pdf-ghost" :class="{ 'ufo-skeleton': status === 'loading' }">
            <span v-for="i in 18" :key="i" class="ufo-pdf-ghost-line" />
          </div>
        </div>
      </div>

      <div v-if="status === 'loading'" class="ufo-pdf-overlay" aria-hidden="true">
        <span class="ufo-pdf-pill">
          <span class="ufo-pdf-spinner" />
          Loading page {{ openPage }}…
        </span>
      </div>

      <div v-else-if="status === 'error'" class="ufo-pdf-overlay ufo-pdf-fail">
        <p class="ufo-pdf-fail-text">
          The document couldn’t be displayed here.
        </p>
        <div class="ufo-pdf-fail-actions">
          <a :href="`${file.url}#page=${openPage}`" target="_blank" rel="noopener noreferrer" class="ufo-pdf-btn ufo-pdf-btn-text">
            Open the PDF<ExternalLink class="ufo-pdf-icon" aria-hidden="true" />
            <span class="sr-only"> (opens in a new tab)</span>
          </a>
          <NuxtLink v-if="viewerHref" :to="viewerHref" class="ufo-pdf-btn ufo-pdf-btn-text">
            Open in the viewer
          </NuxtLink>
          <button type="button" class="ufo-pdf-btn ufo-pdf-btn-text" @click="retry">
            <RotateCw class="ufo-pdf-icon" aria-hidden="true" />
            Try again
          </button>
        </div>
      </div>

      <p v-if="hint" class="ufo-pdf-hint" aria-hidden="true">
        <span class="ufo-pdf-hint-fine">Click the document to scroll it</span>
        <span class="ufo-pdf-hint-coarse">Tap the document to scroll it</span>
      </p>
    </div>

    <p role="status" class="sr-only">
      {{ statusText }}
    </p>
  </div>
</template>

<style scoped>
.ufo-pdf {
  background: hsl(var(--card));
}
.ufo-pdf.is-fullscreen {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}
.ufo-pdf-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  padding: 8px 12px;
  border-bottom: 1px solid hsl(var(--border));
}
.ufo-pdf-kicker {
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  line-height: 1.4;
  color: hsl(var(--muted-foreground));
}
.ufo-pdf-fs-title {
  font-family: var(--font-sans);
  font-size: 14px;
  letter-spacing: 0;
  text-transform: none;
  color: hsl(var(--foreground));
}
.ufo-pdf-kicker:empty {
  display: none;
}
.ufo-pdf-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.ufo-pdf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 34px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--card));
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  text-decoration: none;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
}
.ufo-pdf-btn:hover:not(:disabled) {
  color: hsl(var(--foreground));
  border-color: hsl(var(--primary));
}
.ufo-pdf-page-input:disabled {
  opacity: 0.6;
}
.ufo-pdf-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.ufo-pdf-btn:focus-visible,
.ufo-pdf-page-input:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.ufo-pdf-btn-text {
  padding: 0 10px;
}
.ufo-pdf-icon {
  flex: none;
  width: 14px;
  height: 14px;
}
.ufo-pdf-sep {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: hsl(var(--border));
}
.ufo-pdf-count,
.ufo-pdf-zoom {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 44px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--foreground));
}
.ufo-pdf-page-input {
  height: 34px;
  min-width: 3ch;
  padding: 0 4px;
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  background: hsl(var(--background));
  font: inherit;
  text-align: center;
  color: hsl(var(--foreground));
}
/* Touch and phones: every control a full 44px target. */
@media (pointer: coarse), (max-width: 640px) {
  .ufo-pdf-btn,
  .ufo-pdf-page-input {
    min-width: 44px;
    height: 44px;
  }
  .ufo-pdf-page-input {
    min-width: 5ch;
    font-size: 16px; /* iOS zooms into smaller inputs */
  }
  .ufo-pdf-sep {
    display: none;
  }
}

.ufo-pdf-stage {
  position: relative;
}
.is-fullscreen .ufo-pdf-stage {
  flex: 1 1 auto;
  min-height: 0;
}
.ufo-pdf-scroller {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  height: min(78vh, 980px);
  padding: 16px;
  overflow: auto;
  /* The scrollbar keeps its room when the frame hands scrolling back, so
     the pages don't change width. */
  scrollbar-gutter: stable;
  background: hsl(var(--muted));
}
.is-article .ufo-pdf-scroller {
  height: clamp(320px, 66vh, 720px);
}
.is-fullscreen .ufo-pdf-scroller {
  height: 100%;
}
.ufo-pdf-scroller.is-gated {
  overflow: hidden;
}
.ufo-pdf-scroller:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: -2px;
}
/* Paper stays paper in every theme: a scan is a picture of a white page. */
.ufo-pdf-page {
  position: relative;
  flex: none;
  margin-inline: auto;
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.18), 0 0 0 1px rgb(0 0 0 / 0.06);
  --user-unit: 1;
  --total-scale-factor: calc(var(--scale-factor, 1) * var(--user-unit));
  --scale-round-x: 1px;
  --scale-round-y: 1px;
}
.ufo-pdf-paint {
  position: absolute;
  inset: 0;
}
.ufo-pdf-paint :deep(.ufo-pdf-canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
/* The passage `band` points at: outlined, faintly tinted, never in the way of
   reading or selecting it. */
.ufo-pdf-mark {
  position: absolute;
  left: -6px;
  right: -6px;
  z-index: 2;
  border-radius: 3px;
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.75);
  background: hsl(var(--primary) / 0.06);
  pointer-events: none;
}
.ufo-pdf-standin {
  width: min(100%, 1100px);
  overflow: hidden;
}
.is-article .ufo-pdf-standin {
  width: 100%;
}
.ufo-pdf-thumb {
  display: block;
  width: 100%;
  height: auto;
  filter: blur(1px);
  opacity: 0.7;
}
.ufo-pdf-ghost {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 10% 11%;
}
.ufo-pdf-ghost-line {
  display: block;
  flex: none;
  height: 8px;
  border-radius: 2px;
  background: rgb(0 0 0 / 0.07);
}
.ufo-pdf-ghost-line:nth-child(1) {
  width: 46%;
  height: 12px;
}
.ufo-pdf-ghost-line:nth-child(5n) {
  width: 64%;
}

.ufo-pdf-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.ufo-pdf-pill {
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
.ufo-pdf-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid hsl(var(--primary) / 0.25);
  border-top-color: hsl(var(--primary));
  border-radius: 50%;
  animation: ufo-pdf-spin 0.9s linear infinite;
}
@keyframes ufo-pdf-spin {
  to { transform: rotate(360deg); }
}
.ufo-pdf-fail {
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: hsl(var(--muted));
  text-align: center;
  pointer-events: auto;
}
.ufo-pdf-fail-text {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  color: hsl(var(--foreground));
}
.ufo-pdf-fail-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.ufo-pdf-fail .ufo-pdf-btn {
  height: 44px;
  font-family: var(--font-sans);
  font-size: 13px;
  letter-spacing: 0;
  text-transform: none;
  color: hsl(var(--foreground));
}

/* Until the reader engages the frame, a quiet note on how to. */
.ufo-pdf-hint {
  position: absolute;
  left: 50%;
  bottom: 12px;
  margin: 0;
  padding: 5px 12px;
  border-radius: 999px;
  background: hsl(var(--popover) / 0.92);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.15), 0 0 0 1px hsl(var(--border));
  font-family: var(--font-sans);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  color: hsl(var(--popover-foreground));
  transform: translateX(-50%);
  pointer-events: none;
}
.ufo-pdf-hint-coarse {
  display: none;
}
@media (pointer: coarse), (hover: none) {
  .ufo-pdf-hint-fine {
    display: none;
  }
  .ufo-pdf-hint-coarse {
    display: inline;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ufo-pdf-spinner {
    animation: none;
    border-color: hsl(var(--primary) / 0.6);
  }
  .ufo-pdf-btn {
    transition: none;
  }
}

/* pdf.js's selectable text layer, trimmed from pdfjs-dist/web/pdf_viewer.css. */
.ufo-pdf-page :deep(.textLayer) {
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
.ufo-pdf-page :deep(.textLayer :is(span, br)) {
  position: absolute;
  color: transparent;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  user-select: text;
}
.ufo-pdf-page :deep(.textLayer > :not(.markedContent)),
.ufo-pdf-page :deep(.textLayer .markedContent span:not(.markedContent)) {
  z-index: 1;
  --font-height: 0;
  font-size: calc(var(--text-scale-factor) * var(--font-height));
  --scale-x: 1;
  --rotate: 0deg;
  transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}
.ufo-pdf-page :deep(.textLayer .markedContent) {
  display: contents;
}
.ufo-pdf-page :deep(.textLayer ::selection) {
  background: rgb(0 90 255 / 0.25);
}
.ufo-pdf-page :deep(.textLayer .endOfContent) {
  display: block;
  position: absolute;
  inset: 100% 0 0;
  z-index: 0;
  cursor: default;
  user-select: none;
}
</style>
