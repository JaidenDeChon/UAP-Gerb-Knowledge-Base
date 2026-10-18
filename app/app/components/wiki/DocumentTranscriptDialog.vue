<script setup lang="ts">
import type { WikiPage } from '@/utils/content'
import { ArrowUpRight, X } from '@lucide/vue'
import { DialogClose, DialogDescription } from 'reka-ui'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { findPageHeading } from '@/utils/wikiDocument'

/**
 * A document's transcription in a dialog (registered as
 * `WikiDocumentTranscriptDialog`), opened from a `::wiki-document` widget so
 * a reader can read the text without leaving the article. The widget mounts
 * it lazily, the first time the reader asks for it, and only then is the
 * transcription note queried. It opens scrolled to the `## Page N` section
 * of the page the widget shows.
 *
 * reka-ui's Dialog traps focus, closes on Escape or a click outside, and
 * locks the page's scroll. Focus goes to the scrolling text, so the arrow
 * keys read straight away; on close the widget puts focus back on its
 * Transcript button (`closed`), which Safari never focused on click.
 */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  /** The document's title. */
  title: string
  /** Route of the transcription note. */
  to: string
  /** The page to open on. */
  page: number
}>()

const emit = defineEmits<{ closed: [] }>()

const note = ref<WikiPage | null>(null)
const state = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const viewport = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)

async function load(): Promise<void> {
  if (state.value === 'loading' || state.value === 'ready') return
  state.value = 'loading'
  try {
    const found = await queryCollection('wiki').path(props.to).first()
    if (!found) throw new Error('no transcription')
    note.value = found
    state.value = 'ready'
  }
  catch {
    state.value = 'error'
  }
}

/*
 * Scroll to the page's section once it has rendered. ContentRenderer draws
 * its components asynchronously, so the heading can arrive (and move) after
 * the note does: keep it aligned for a moment, and stop the instant the
 * reader scrolls, presses a key or touches the text.
 */
let stopAligning: (() => void) | null = null

function alignToPage(): void {
  stopAligning?.()
  const vp = viewport.value
  const root = body.value
  if (!vp || !root) return
  let done = false
  let current: HTMLElement | null = null
  const align = (): void => {
    const h = findPageHeading(root, props.page)
    if (!h) return
    if (current !== h) {
      current?.removeAttribute('data-current-page')
      h.setAttribute('data-current-page', '')
      current = h
    }
    vp.scrollTop += h.getBoundingClientRect().top - vp.getBoundingClientRect().top - 16
  }
  const mo = new MutationObserver(align)
  const ro = new ResizeObserver(align)
  mo.observe(root, { childList: true, subtree: true })
  ro.observe(root)
  const cancel = (): void => stop()
  const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
  for (const e of events) vp.addEventListener(e, cancel, { passive: true, once: true })
  const timer = window.setTimeout(() => stop(), 2500)
  function stop(): void {
    if (done) return
    done = true
    mo.disconnect()
    ro.disconnect()
    window.clearTimeout(timer)
    for (const e of events) vp.removeEventListener(e, cancel)
    stopAligning = null
  }
  stopAligning = stop
  align()
}

watch(open, (value) => {
  if (value) void load()
  else stopAligning?.()
}, { immediate: true })

watch([state, open, () => props.page], async ([s, o]) => {
  if (s !== 'ready' || !o) return
  await nextTick()
  alignToPage()
}, { flush: 'post' })

onBeforeUnmount(() => stopAligning?.())

function onOpenAutoFocus(e: Event): void {
  e.preventDefault()
  viewport.value?.focus({ preventScroll: true })
}
function onCloseAutoFocus(e: Event): void {
  e.preventDefault()
  emit('closed')
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent
      :show-close-button="false"
      class="ufo-tdlg flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[820px] flex-col gap-0 p-0 sm:max-w-[820px]"
      @open-auto-focus="onOpenAutoFocus"
      @close-auto-focus="onCloseAutoFocus"
    >
      <header class="ufo-tdlg-head">
        <div class="min-w-0 flex-1">
          <p class="ufo-tdlg-eyebrow">
            Transcription
          </p>
          <DialogTitle class="ufo-tdlg-title">
            {{ props.title }}
          </DialogTitle>
          <DialogDescription class="ufo-tdlg-desc">
            Opens at page {{ props.page }}. The text is checked against the scans.
          </DialogDescription>
        </div>
        <div class="ufo-tdlg-tools">
          <NuxtLink :to="props.to" class="ufo-tdlg-btn">
            <span>Full page</span>
            <ArrowUpRight class="size-4" aria-hidden="true" />
          </NuxtLink>
          <DialogClose class="ufo-tdlg-btn ufo-tdlg-btn--icon" aria-label="Close">
            <X class="size-5" aria-hidden="true" />
          </DialogClose>
        </div>
      </header>

      <div
        ref="viewport"
        tabindex="0"
        role="region"
        :aria-label="`Transcription of ${props.title}`"
        :aria-busy="state === 'loading' || state === 'idle' ? 'true' : undefined"
        class="ufo-tdlg-viewport"
      >
        <div v-if="state === 'ready' && note" ref="body" class="ufo-tdlg-body">
          <ContentRenderer :value="note" class="prose-ufo ufo-tdlg-prose" />
        </div>
        <div v-else-if="state === 'error'" class="ufo-tdlg-error" role="alert">
          <p>The transcription couldn’t be loaded.</p>
          <p>
            <NuxtLink :to="props.to">
              Read it on its own page
            </NuxtLink>
            <span aria-hidden="true"> · </span>
            <button type="button" class="ufo-tdlg-retry" @click="state = 'idle'; load()">
              Try again
            </button>
          </p>
        </div>
        <div v-else class="ufo-tdlg-loading">
          <span role="status" class="sr-only">Loading the transcription of {{ props.title }}</span>
          <div class="ufo-skeleton" aria-hidden="true">
            <span class="ufo-tdlg-bar is-heading" />
            <span class="ufo-tdlg-bar" />
            <span class="ufo-tdlg-bar" />
            <span class="ufo-tdlg-bar is-short" />
            <span class="ufo-tdlg-bar is-heading" />
            <span class="ufo-tdlg-bar" />
            <span class="ufo-tdlg-bar" />
            <span class="ufo-tdlg-bar is-short" />
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.ufo-tdlg-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 12px 12px 20px;
  border-bottom: 1px solid hsl(var(--border));
}
.ufo-tdlg-eyebrow {
  margin: 0 0 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: hsl(var(--primary));
}
.ufo-tdlg-title {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  line-height: 22px;
  color: hsl(var(--foreground));
  overflow-wrap: anywhere;
}
.ufo-tdlg-desc {
  margin-top: 4px;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 18px;
  color: hsl(var(--muted-foreground));
}
.ufo-tdlg-tools {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
}
.ufo-tdlg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 44px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--card));
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
  text-decoration: none;
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-standard);
}
.ufo-tdlg-btn:hover {
  border-color: hsl(var(--primary));
}
.ufo-tdlg-btn:focus-visible,
.ufo-tdlg-retry:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.ufo-tdlg-btn--icon {
  padding: 0;
}
@media (max-width: 479px) {
  .ufo-tdlg-head {
    flex-wrap: wrap;
    padding-left: 16px;
  }
  .ufo-tdlg-tools {
    order: -1;
    width: 100%;
    justify-content: flex-end;
  }
}

.ufo-tdlg-viewport {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding: 4px 24px 32px;
}
.ufo-tdlg-viewport:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px hsl(var(--ring));
}
@media (max-width: 479px) {
  .ufo-tdlg-viewport {
    padding: 4px 16px 24px;
  }
}

.ufo-tdlg-loading {
  padding-top: 24px;
}
.ufo-tdlg-loading .ufo-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ufo-tdlg-bar {
  display: block;
  height: 12px;
  border-radius: 3px;
  background: hsl(var(--muted));
}
.ufo-tdlg-bar.is-heading {
  width: 28%;
  height: 20px;
  margin-top: 16px;
}
.ufo-tdlg-bar.is-short {
  width: 62%;
}
.ufo-tdlg-error {
  padding-top: 24px;
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.5;
  color: hsl(var(--foreground));
}
.ufo-tdlg-error p {
  margin: 0 0 8px;
}
.ufo-tdlg-error a,
.ufo-tdlg-retry {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: hsl(var(--primary));
  text-decoration: underline;
  text-underline-offset: 2px;
}
.ufo-tdlg-retry {
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
}

/* The article's prose rules live, scoped, on the wiki page; the dialog is
   teleported out of it, so it carries a reading-sized copy of them. */
.ufo-tdlg-prose {
  max-width: 68ch;
  margin: 0 auto;
  overflow-wrap: break-word;
}
.ufo-tdlg-prose :deep(h2) {
  margin: 2.25rem 0 0.75rem;
  padding-bottom: 6px;
  border-bottom: 1px solid hsl(var(--border));
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
  color: hsl(var(--foreground));
  scroll-margin-top: 16px;
}
.ufo-tdlg-prose :deep(h2[data-current-page]) {
  border-bottom-color: hsl(var(--primary));
  box-shadow: inset 3px 0 0 hsl(var(--primary));
  padding-left: 10px;
}
.ufo-tdlg-prose :deep(h3:not([class])) {
  margin: 1.75rem 0 0.5rem;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;
  color: hsl(var(--foreground));
}
.ufo-tdlg-prose :deep(h4:not([class])) {
  margin: 1.5rem 0 0.5rem;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.ufo-tdlg-prose :deep(p:not([class])) {
  margin: 0.9rem 0;
  font-size: 16px;
  line-height: 1.7;
  color: hsl(var(--foreground));
}
.ufo-tdlg-prose :deep(ul:not([class])) {
  margin: 0.9rem 0;
  padding-left: 1.5rem;
  list-style: disc;
}
.ufo-tdlg-prose :deep(ol:not([class])) {
  margin: 0.9rem 0;
  padding-left: 1.5rem;
  list-style: decimal;
}
.ufo-tdlg-prose :deep(li:not([class])) {
  margin: 0.3rem 0;
  font-size: 16px;
  line-height: 1.7;
  color: hsl(var(--foreground));
}
.ufo-tdlg-prose :deep(blockquote) {
  margin: 1.25rem 0;
  padding-left: 1rem;
  border-left: 4px solid hsl(var(--border));
  font-style: italic;
  color: hsl(var(--muted-foreground));
}
.ufo-tdlg-prose :deep(hr) {
  margin: 2rem 0;
  border: 0;
  border-top: 1px solid hsl(var(--border));
}
.ufo-tdlg-prose :deep(code) {
  padding: 1px 4px;
  border-radius: 3px;
  background: hsl(var(--muted));
  font-family: var(--font-mono);
  font-size: 0.875em;
}
.ufo-tdlg-prose :deep(strong) {
  font-weight: 600;
  color: hsl(var(--foreground));
}
/* Wide tables scroll inside themselves, never the dialog. */
.ufo-tdlg-prose :deep(table) {
  display: block;
  max-width: 100%;
  margin: 1.5rem 0;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: 14px;
}
.ufo-tdlg-prose :deep(th),
.ufo-tdlg-prose :deep(td) {
  padding: 8px 12px;
  border: 1px solid hsl(var(--border));
  text-align: left;
  vertical-align: top;
}
.ufo-tdlg-prose :deep(th) {
  background: hsl(var(--muted) / 0.4);
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}
</style>
