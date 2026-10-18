<script setup lang="ts">
import { ExternalLink, FileText } from '@lucide/vue'
import { drawPage, openPdf } from '@/utils/pdf'

/**
 * `::wiki-document` — one page of a primary-source document, set into an
 * article: the page itself, drawn from the hosted PDF, or just a band of it
 * (`region`) to show the passage under discussion. It links to the page in
 * the full viewer on the document's own note.
 *
 * The page draws when the figure scrolls near the viewport, with pdf.js
 * loaded then and the PDF fetched in ranges, so an article with excerpts
 * costs nothing until a reader reaches one. Page 1 shows its baked thumbnail
 * meanwhile. A document that isn't hosted shows as a card linking to its note
 * and its source.
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
const pageNo = computed(() => {
  const n = Math.round(Number(props.page) || 1)
  return Math.min(Math.max(1, n), file.value?.pages ?? n)
})
const band = computed<[number, number] | null>(() => {
  const [from, to] = props.region.map(Number)
  if (from === undefined || to === undefined || !Number.isFinite(from) || !Number.isFinite(to)) return null
  const a = Math.min(Math.max(0, from), 1)
  const b = Math.min(Math.max(0, to), 1)
  return b - a >= 0.05 ? [a, b] : null
})
const href = computed(() => (ref_.value ? `${ref_.value.path}#page=${pageNo.value}` : ''))
const title = computed(() => ref_.value?.title ?? props.name)

const sheet = ref<HTMLElement | null>(null)
/** pdf.js's canvas goes here, outside anything Vue renders. */
const canvasHost = ref<HTMLElement | null>(null)
/** The page's height over its width; page 1's thumbnail until the page itself is drawn. */
const ratio = ref(1.294)
const status = ref<'idle' | 'drawing' | 'drawn' | 'error'>('idle')
let observer: IntersectionObserver | null = null

watch(file, (f) => {
  if (f) ratio.value = f.thumb.height / f.thumb.width
}, { immediate: true })

async function draw(): Promise<void> {
  if (!file.value || !sheet.value || !canvasHost.value || status.value !== 'idle') return
  status.value = 'drawing'
  try {
    const pdf = await openPdf(file.value.url)
    const width = sheet.value.clientWidth
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

const facts = computed(() => {
  const d = doc.value
  if (!d) return ''
  return [d.issuer, d.date].filter(Boolean).join(' · ')
})
const label = computed(() => `${title.value}, page ${pageNo.value}${file.value ? ` of ${file.value.pages}` : ''}`)
</script>

<template>
  <figure v-if="file" class="ufo-wdoc" :class="{ 'is-band': band }">
    <NuxtLink :to="href" class="ufo-wdoc-frame" :aria-label="`${label}. Open in the document viewer`">
      <div class="ufo-wdoc-window" :style="{ aspectRatio: `1 / ${windowRatio}` }">
        <div
          ref="sheet"
          class="ufo-wdoc-sheet"
          :style="{ aspectRatio: `1 / ${ratio}`, transform: `translateY(${sheetShift})` }"
        >
          <img
            v-if="pageNo === 1 && status !== 'drawn'"
            :src="file.thumb.src"
            :width="file.thumb.width"
            :height="file.thumb.height"
            alt=""
            class="ufo-wdoc-standin"
          >
          <div ref="canvasHost" />
        </div>
      </div>
    </NuxtLink>
    <figcaption class="ufo-wdoc-caption">
      <span v-if="caption" class="ufo-wdoc-caption-text">{{ caption }}</span>
      <span class="ufo-wdoc-source">
        <FileText class="ufo-wdoc-icon" aria-hidden="true" />
        <NuxtLink :to="href">{{ title }}</NuxtLink>, page {{ pageNo }} of {{ file.pages }}<template v-if="facts"> · {{ facts }}</template>
      </span>
      <span v-if="status === 'error'" class="ufo-wdoc-error">The page couldn’t be drawn; open the document to read it.</span>
    </figcaption>
  </figure>

  <aside v-else-if="ref_" class="ufo-wdoc-card">
    <FileText class="ufo-wdoc-card-icon" aria-hidden="true" />
    <div>
      <NuxtLink :to="ref_.path" class="ufo-wdoc-card-title">{{ title }}</NuxtLink>
      <p v-if="facts" class="ufo-wdoc-card-facts">{{ facts }}</p>
      <p v-if="caption" class="ufo-wdoc-card-caption">{{ caption }}</p>
      <a v-if="doc?.source" :href="doc.source" target="_blank" rel="noopener noreferrer" class="ufo-wdoc-card-source">
        Read it at the source<ExternalLink class="ufo-wdoc-icon" aria-hidden="true" />
      </a>
    </div>
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
.ufo-wdoc-frame:hover .ufo-wdoc-window {
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
.ufo-wdoc-card a {
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
.ufo-wdoc-error {
  color: hsl(var(--destructive));
}

.ufo-wdoc-card {
  display: flex;
  gap: 12px;
  margin: 1.75rem 0;
  padding: 14px 16px;
  border: 1px dashed hsl(var(--border));
  border-radius: 8px;
  font-family: var(--font-sans);
  font-size: 13.5px;
  line-height: 1.5;
}
.ufo-wdoc-card-icon {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  color: hsl(var(--graph-cat-documents));
}
.ufo-wdoc-card-title {
  font-weight: 600;
}
.ufo-wdoc-card p {
  margin: 2px 0 0;
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
