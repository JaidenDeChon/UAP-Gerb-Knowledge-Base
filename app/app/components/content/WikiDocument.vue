<script setup lang="ts">
import { BookOpen, ExternalLink, FileText, ScrollText } from '@lucide/vue'
import { clampPage, normaliseBand } from '@/utils/wikiDocument'

/**
 * `::wiki-document` — a primary-source document, set into an article and
 * readable there: the same frame as the viewer on the document's own page
 * (`components/wiki/DocumentPdfFrame.vue`), with every page, selectable
 * text, page and zoom controls, full screen and the PDF link. It opens at
 * `page`, and with `region` it opens with that band of the page in view and
 * outlined. A header carries the way to the document's own page and, when it
 * has one, a Transcript button that opens the transcription in a dialog at
 * the page the reader has reached.
 *
 * Nothing heavy loads until the reader nears the figure: within 600px of the
 * viewport it loads pdf.js and fetches only the byte ranges the pages near
 * the view need; the frame's height is fixed, so nothing shifts. The frame
 * takes wheel and touch scrolling only once the reader clicks, taps or tabs
 * into it, and it never reads or writes the address (`#page=N` belongs to the
 * document page's viewer). The transcription is queried only when the dialog
 * is first opened, and the dialog's code with it. A document that isn't
 * hosted shows as a card with the same header, linking to its source.
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
const title = computed(() => ref_.value?.title ?? props.name)

/** The page the reader has scrolled the frame to. */
const current = ref(pageNo.value)
watch(pageNo, (n) => { current.value = n })

const facts = computed(() => {
  const d = doc.value
  if (!d) return ''
  return [d.issuer, d.date].filter(Boolean).join(' · ')
})

/* The transcript dialog mounts (and its code and the note load) on first
   open, at the page the frame is on then. */
const transcriptMounted = ref(false)
const transcriptOpen = ref(false)
const transcriptPage = ref(pageNo.value)
const transcriptBtn = ref<HTMLButtonElement | null>(null)
function openTranscript(): void {
  transcriptPage.value = file.value ? current.value : pageNo.value
  transcriptMounted.value = true
  transcriptOpen.value = true
}
function onTranscriptClosed(): void {
  transcriptBtn.value?.focus()
}
</script>

<template>
  <figure v-if="file" class="ufo-wdoc">
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

    <div class="ufo-wdoc-frame">
      <WikiDocumentPdfFrame
        v-model:current="current"
        :file="file"
        :title="title"
        :start-page="pageNo"
        :band="band"
        :viewer-href="href"
        size="article"
        lazy
        gated
      />
    </div>

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
      :page="transcriptPage"
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
      :page="transcriptPage"
      @closed="onTranscriptClosed"
    />
  </aside>
</template>

<style scoped>
.ufo-wdoc {
  margin: 1.75rem 0;
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

/* The frame: the document page's viewer, in a card. */
.ufo-wdoc-frame {
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}
@media (prefers-reduced-motion: reduce) {
  .ufo-wdoc-btn {
    transition: none;
  }
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
