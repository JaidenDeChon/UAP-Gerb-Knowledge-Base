<script setup lang="ts">
import type { NoteDocument } from '#shared/types/wiki'
import { ExternalLink, ScrollText } from '@lucide/vue'

/**
 * The document itself, on its Documents note: every page of the hosted PDF,
 * readable in place (`DocumentPdfFrame`: pdf.js with a selectable text
 * layer, page and zoom controls, full screen, a link to the file), under a
 * kicker with its size and a credit for where it was retrieved. pdf.js loads
 * only in the browser, when the frame mounts, and fetches the PDF in ranges
 * as pages scroll into view, so a long report doesn't download whole.
 *
 * `#page=N` in the address opens the frame on that page. The inline
 * `::wiki-document` widgets use the same frame but never read the address.
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

const pageLabel = computed(() => (file.value?.pages === 1 ? '1 page' : `${file.value?.pages ?? 0} pages`))
const sizeLabel = computed(() => {
  const bytes = file.value?.bytes ?? 0
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`
})
</script>

<template>
  <figure v-if="file" class="ufo-doc" :aria-label="`${title}, ${pageLabel}`">
    <WikiDocumentPdfFrame :file="file" :title="title" read-hash>
      <template #kicker>
        Document · {{ pageLabel }} · {{ sizeLabel }}
      </template>
      <template #actions>
        <NuxtLink v-if="document.transcription" class="ufo-doc-btn" :to="document.transcription">
          <ScrollText class="ufo-doc-icon" aria-hidden="true" />
          Transcription
        </NuxtLink>
      </template>
    </WikiDocumentPdfFrame>

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
/* The frame's button look, for the link it's handed. */
.ufo-doc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 34px;
  margin-left: 6px;
  padding: 0 10px;
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
  transition: color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
}
.ufo-doc-btn:hover {
  color: hsl(var(--foreground));
  border-color: hsl(var(--primary));
}
.ufo-doc-btn:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
@media (pointer: coarse), (max-width: 640px) {
  .ufo-doc-btn {
    height: 44px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ufo-doc-btn {
    transition: none;
  }
}
.ufo-doc-icon {
  width: 14px;
  height: 14px;
}
.ufo-doc-icon-inline {
  display: inline;
  width: 11px;
  height: 11px;
  margin-left: 2px;
  vertical-align: baseline;
}
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
</style>
