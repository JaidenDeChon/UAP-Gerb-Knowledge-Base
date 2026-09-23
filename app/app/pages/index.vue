<script setup lang="ts">
import type { WikiPage } from '@/utils/content'
import { splitAtFirstH2 } from '@/utils/content'

/** The entry behind the Featured card — the route @nuxt/content gives its note. */
const FEATURED_PATH
  = '/wiki/videos/80-years-of-ufo-crash-retrieval-and-reverse-engineering-a-timeline/summary'

// The vault's Home note lives at /wiki/home; render it here so it lands on the
// app root. The map moved to /map.
//
// Loaded in the browser, not on the server, for the reason given in
// `wiki/[...slug].vue`: a server render that waits on @nuxt/content's database
// leaves a fresh visit on a blank screen for seconds on a cold function. The
// server sends the skeleton at once; `lazy` does the same for a client-side hop.
const { data } = useAsyncData('home', async () => {
  const [home, featured] = await Promise.all([
    queryCollection('wiki').path('/wiki/home').first(),
    queryCollection('wiki').path(FEATURED_PATH).first(),
  ])
  return { home, featured }
}, { lazy: true, server: false })

const page = computed(() => data.value?.home ?? null)
const featured = computed(() => data.value?.featured ?? null)

usePageTitle().value = ''
useHead({ title: 'UAP Gerb Knowledge Base' })

// The Home note holds its intro and its Maps of Content list in one body, and
// the featured card sits between them — so split it rather than render it whole.
// The leading `# H1` goes too; the page renders its own title.
const body = computed(() => {
  if (!page.value) return null
  const value = [...(page.value.body?.value ?? [])]
  if (Array.isArray(value[0]) && value[0][0] === 'h1') value.shift()
  const { intro, rest } = splitAtFirstH2({ value })
  const doc = (nodes: typeof value): WikiPage | null =>
    nodes.length ? { ...page.value!, body: { ...page.value!.body, value: nodes } } : null
  return { intro: doc(intro), rest: doc(rest) }
})
</script>

<template>
  <div class="mx-auto max-w-[760px] px-8 pb-32 pt-10">
    <h1 class="mb-6 font-display text-[clamp(32px,5vw,56px)] font-extrabold uppercase leading-none tracking-[0.02em] text-foreground">
      UAP Gerb Knowledge Base
    </h1>

    <template v-if="body">
      <ContentRenderer v-if="body.intro" :value="body.intro" class="prose-ufo wiki-prose" />

      <HomeFeatured v-if="featured" :entry="featured" />

      <HomeRecentVideos />

      <ContentRenderer v-if="body.rest" :value="body.rest" class="prose-ufo wiki-prose" />
    </template>

    <div v-else class="relative">
      <AppLoadingMark />
      <div class="ufo-skeleton" aria-hidden="true">
        <div class="space-y-2.5">
          <div class="h-5 w-full rounded-sm bg-muted/70" />
          <div class="h-5 w-4/5 rounded-sm bg-muted/70" />
        </div>
        <div class="mt-10 h-[150px] rounded-lg border border-border bg-muted/40" />
        <div class="mt-12 space-y-3">
          <div class="h-7 w-1/3 rounded-sm bg-muted" />
          <div v-for="line in 7" :key="line" class="h-4 w-3/5 rounded-sm bg-muted/70" />
        </div>
      </div>
      <span class="sr-only" role="status">Loading…</span>
    </div>
  </div>
</template>

<style scoped>
@reference "../assets/css/main.css";

/* Tracking from the --ls-h* tokens — see the note in wiki/[...slug].vue. */
.wiki-prose :deep(h2) {
  @apply mb-4 mt-12 border-b border-border pb-2 font-display text-[30px] font-semibold leading-9 tracking-[var(--ls-h2)] text-foreground;
}
.wiki-prose :deep(h3) {
  @apply mb-3 mt-10 font-display text-[24px] font-semibold leading-8 tracking-[var(--ls-h3)] text-foreground;
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
.wiki-prose :deep(hr) {
  @apply my-8 border-t border-border;
}
.wiki-prose :deep(strong) {
  @apply font-semibold text-foreground;
}
</style>
