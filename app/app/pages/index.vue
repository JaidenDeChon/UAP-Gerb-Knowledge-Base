<script setup lang="ts">
import type { WikiPage } from '@/utils/content'

// The vault's Home note lives at /wiki/home; render it here so it lands on the
// app root. The map moved to /map.
const { data: page } = await useAsyncData('wiki:home', () =>
  queryCollection('wiki').path('/wiki/home').first())

usePageTitle().value = ''
useHead({ title: 'UAP Gerb Knowledge Base' })

// Drop the leading `# H1` (the page renders its own title) and keep the rest of
// the body — the intro paragraphs and the Maps of Content list.
const doc = computed<WikiPage | null>(() => {
  if (!page.value) return null
  const value = [...(page.value.body?.value ?? [])]
  if (Array.isArray(value[0]) && value[0][0] === 'h1') value.shift()
  return { ...page.value, body: { ...page.value.body, value } }
})
</script>

<template>
  <div class="mx-auto max-w-[760px] px-8 pb-32 pt-10">
    <h1 class="mb-6 font-display text-[clamp(32px,5vw,56px)] font-extrabold uppercase leading-none tracking-[0.02em] text-foreground">
      UAP Gerb Knowledge Base
    </h1>

    <ContentRenderer v-if="doc" :value="doc" class="prose-ufo wiki-prose" />
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
