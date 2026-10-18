<script setup lang="ts">
import type { NotePreview } from '#shared/types/wiki'
import { ArrowUpRight } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { CardTitle } from '@/components/ui/card'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { portraitAlt, portraitCredit } from '@/utils/portrait'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{ href?: string, target?: string }>(),
  { href: '', target: undefined },
)

const isInternal = computed(() => props.href.startsWith('/'))
/**
 * An in-page anchor: a GFM footnote's marker or back-link. Those carry the ids
 * and aria attributes the pair navigate by, so they keep every attribute and
 * get neither a preview nor the external-link treatment.
 */
const isHash = computed(() => props.href.startsWith('#'))

const preview = ref<NotePreview | null>(null)
const loading = ref(false)
let started = false

/** "FBI · 1950-03-22 · 1 page", for a Documents note. */
const documentFacts = computed(() => {
  const doc = preview.value?.document
  if (!doc) return ''
  const pages = doc.file ? `${doc.file.pages} ${doc.file.pages === 1 ? 'page' : 'pages'}` : ''
  return [doc.date, pages].filter(Boolean).join(' · ')
})

async function load(open: boolean): Promise<void> {
  if (!open || started || !isInternal.value) return
  started = true
  loading.value = true
  try {
    preview.value = await fetchNotePreview(props.href)
  }
  catch {
    // Swallow — the link still works, we just skip the preview.
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <HoverCard v-if="isInternal" :open-delay="200" :close-delay="120" @update:open="load">
    <HoverCardTrigger as-child>
      <NuxtLink
        :to="href"
        data-wiki-link
        class="text-primary underline-offset-2 decoration-primary/40 hover:underline"
      >
        <slot />
      </NuxtLink>
    </HoverCardTrigger>

    <HoverCardContent v-if="loading || preview" class="overflow-hidden">
      <!-- A person's portrait sits in the corner, fading into the card with
           the shared `ufo-fade` mask; the preview arrives with it in one
           payload, and its box is fixed, so nothing moves as it loads. -->
      <img
        v-if="preview?.image"
        :src="preview.image.src"
        :width="preview.image.width"
        :height="preview.image.height"
        :alt="portraitAlt(preview.title)"
        :title="portraitCredit(preview.image)"
        decoding="async"
        class="ufo-preview-portrait ufo-fade ufo-fade-xy"
      >
      <!-- A document's first page sits in the same corner, as a small sheet. -->
      <img
        v-else-if="preview?.document?.file"
        :src="preview.document.file.thumb.src"
        :width="preview.document.file.thumb.width"
        :height="preview.document.file.thumb.height"
        alt=""
        decoding="async"
        class="ufo-preview-sheet"
      >
      <div v-if="preview" class="flex flex-col gap-2">
        <CardTitle class="text-[16px] leading-5 tracking-normal">
          {{ preview.title }}
        </CardTitle>
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant="outline">{{ preview.category }}</Badge>
          <span v-if="documentFacts" class="font-mono text-[11px] leading-4 text-muted-foreground">
            {{ documentFacts }}
          </span>
        </div>
        <p v-if="preview.lead" class="line-clamp-4 text-[13px] leading-5 text-muted-foreground">
          {{ preview.lead }}
        </p>
      </div>

      <div v-else class="flex flex-col gap-2">
        <div class="h-4 w-2/3 animate-pulse rounded-sm bg-muted" />
        <div class="h-4 w-16 animate-pulse rounded-sm bg-muted" />
        <div class="h-3 w-full animate-pulse rounded-sm bg-muted" />
        <div class="h-3 w-4/5 animate-pulse rounded-sm bg-muted" />
      </div>
    </HoverCardContent>
  </HoverCard>

  <a v-else-if="isHash" v-bind="$attrs" :href="href"><slot /></a>

  <a
    v-else
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex items-baseline gap-0.5 text-primary underline-offset-2 decoration-primary/40 hover:underline"
  >
    <slot />
    <ArrowUpRight class="size-3 self-center" />
  </a>
</template>

<style scoped>
/* Flush with the card's top-right corner (the negative margins undo the
   card's 16px padding; its overflow clips the corner), a fixed box
   cover-cropped toward the face. */
.ufo-preview-portrait {
  float: right;
  width: 72px;
  height: 92px;
  margin: -16px -16px 6px 12px;
  object-fit: cover;
  object-position: 50% 22%;
  --ufo-fade-x-start: 40%;
  --ufo-fade-y-start: 50%;
}
/* A document's first page: a small sheet in the same corner, uncropped. */
.ufo-preview-sheet {
  float: right;
  width: 64px;
  height: auto;
  margin: 0 0 6px 12px;
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.2), 0 0 0 1px rgb(0 0 0 / 0.08);
}
</style>
