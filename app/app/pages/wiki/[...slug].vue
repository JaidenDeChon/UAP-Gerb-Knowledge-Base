<script setup lang="ts">
import type { Category } from '#shared/types/wiki'
import type { WikiPage } from '@/utils/content'
import { ChevronRight } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

definePageMeta({ key: route => route.path })

const route = useRoute()

const { data: page } = await useAsyncData(`wiki:${route.path}`, () =>
  queryCollection('wiki').path(route.path).first())

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Note not found', fatal: true })
}

usePageTitle().value = page.value.title
useHead({ title: page.value.title })

const category = computed<Category>(() =>
  page.value ? categoryFromStem(page.value.stem) : 'Root')
const isTranscript = computed(() => page.value?.stem.endsWith('/transcript') ?? false)
const videoTitle = computed(() => (page.value ? videoTitleFromStem(page.value.stem) : null))

// A note's folder already renders as the green category badge, so its frontmatter
// self-tag — `person` on a People note, `video` on a Videos note, and so on — is
// pure duplication in this view. Hide it. The vault keeps the tag for Obsidian,
// which has no folder-derived badge and groups notes by exactly these tags.
const CATEGORY_SELF_TAG: Partial<Record<Category, string>> = {
  People: 'person',
  Organizations: 'organization',
  Locations: 'location',
  Concepts: 'concept',
  Events: 'event',
  Videos: 'video',
  Operations: 'operation',
  MOCs: 'moc',
}

const tags = computed<string[]>(() => {
  const selfTag = CATEGORY_SELF_TAG[category.value]
  return (page.value?.tags ?? []).filter(tag => tag.toLowerCase() !== selfTag)
})
const shownTags = computed(() => tags.value.slice(0, 6))
const extraTags = computed(() => Math.max(0, tags.value.length - 6))

const article = computed<{ lead: string, doc: WikiPage | null }>(() => {
  if (!page.value) return { lead: '', doc: null }
  const { lead, value } = splitLead(page.value.body, page.value.description)
  return { lead, doc: { ...page.value, body: { ...page.value.body, value } } }
})
</script>

<template>
  <article v-if="page" class="mx-auto max-w-[760px] px-8 pb-32 pt-10">
    <nav class="mb-5 flex items-center gap-2 font-sans text-[13px] text-muted-foreground">
      <NuxtLink to="/map" class="transition-colors hover:text-foreground">
        Site map
      </NuxtLink>
      <ChevronRight class="size-3.5 shrink-0 opacity-60" />
      <span>{{ category }}</span>
      <template v-if="isTranscript && videoTitle">
        <ChevronRight class="size-3.5 shrink-0 opacity-60" />
        <span class="truncate">{{ videoTitle }}</span>
      </template>
    </nav>

    <div class="mb-3.5 flex flex-wrap gap-2">
      <Badge>{{ category }}</Badge>
      <Badge v-for="tag in shownTags" :key="tag" variant="outline">
        {{ tag }}
      </Badge>
      <Badge v-if="extraTags > 0" variant="outline">
        +{{ extraTags }}
      </Badge>
    </div>

    <!-- Uppercase display type carries no ascender/descender variety to open the
         line up, so it wants positive tracking, not the tight setting a mixed-case
         title would take. -->
    <h1 class="mb-4 font-display text-[clamp(32px,5vw,56px)] font-extrabold uppercase leading-none tracking-[0.02em] text-foreground">
      {{ page.title }}
    </h1>

    <p v-if="article.lead" class="mb-7 font-sans text-[20px] leading-[30px] text-muted-foreground">
      {{ article.lead }}
    </p>

    <WikiFactTable :page="page" />

    <WikiLocalMap :path="route.path" />

    <ContentRenderer v-if="article.doc" :value="article.doc" class="prose-ufo wiki-prose" />

    <Separator class="my-8" />

    <WikiLinkedEntries :path="route.path" />
  </article>
</template>

<style scoped>
@reference "../../assets/css/main.css";

/* Tracking comes from the --ls-h* tokens rather than a copy of their values: it
   was duplicated here AND in main.css, so retuning the tokens moved the prose
   headings and left the article's own headings behind. */
.wiki-prose :deep(h2) {
  @apply mb-4 mt-12 border-b border-border pb-2 font-display text-[30px] font-semibold leading-9 tracking-[var(--ls-h2)] text-foreground;
}
.wiki-prose :deep(h3) {
  @apply mb-3 mt-10 font-display text-[24px] font-semibold leading-8 tracking-[var(--ls-h3)] text-foreground;
}
.wiki-prose :deep(h4) {
  @apply mb-2 mt-8 font-display text-[20px] font-semibold leading-7 tracking-[var(--ls-h4)] text-foreground;
}
.wiki-prose :deep(p) {
  @apply my-5 text-[16px] leading-7 text-foreground;
}
.wiki-prose :deep(ul) {
  @apply my-5 list-disc space-y-1.5 pl-6;
}
.wiki-prose :deep(ol) {
  @apply my-5 list-decimal space-y-1.5 pl-6;
}
.wiki-prose :deep(li) {
  @apply text-[16px] leading-7 text-foreground;
}
.wiki-prose :deep(blockquote) {
  @apply my-6 border-l-4 border-border pl-4 italic text-muted-foreground;
}
.wiki-prose :deep(hr) {
  @apply my-8 border-t border-border;
}
.wiki-prose :deep(code) {
  @apply rounded-sm bg-muted px-1 py-0.5 font-mono text-sm;
}
.wiki-prose :deep(strong) {
  @apply font-semibold text-foreground;
}
.wiki-prose :deep(table) {
  @apply my-6 w-full border-collapse text-sm;
}
.wiki-prose :deep(th),
.wiki-prose :deep(td) {
  @apply border border-border px-3 py-2 text-left align-top;
}
.wiki-prose :deep(th) {
  @apply bg-muted/40 font-medium text-muted-foreground;
}
</style>
