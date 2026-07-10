<script setup lang="ts">
const route = useRoute()

const { data: page } = await useAsyncData(`wiki:${route.path}`, () =>
  queryCollection('wiki').path(route.path).first(),
)

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Note not found', fatal: true })
}

useHead({ title: page.value.title })
</script>

<template>
  <main v-if="page" class="mx-auto max-w-3xl px-6 py-12">
    <NuxtLink to="/" class="text-sm text-muted-foreground hover:underline">← Index</NuxtLink>

    <header class="mt-6 mb-8 border-b pb-6">
      <h1 class="text-3xl font-bold tracking-tight">{{ page.title }}</h1>
      <p v-if="page.role" class="mt-2 text-muted-foreground">{{ page.role }}</p>
      <ul v-if="page.tags?.length" class="mt-4 flex flex-wrap gap-2">
        <li
          v-for="tag in page.tags"
          :key="tag"
          class="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
        >
          {{ tag }}
        </li>
      </ul>
    </header>

    <ContentRenderer :value="page" class="wiki-prose" />
  </main>
</template>

<style scoped>
@reference "../../assets/css/main.css";

.wiki-prose :deep(h2) {
  @apply mt-10 mb-3 border-b pb-2 text-2xl font-semibold;
}
.wiki-prose :deep(h3) {
  @apply mt-8 mb-2 text-xl font-semibold;
}
.wiki-prose :deep(p) {
  @apply my-4 leading-7;
}
.wiki-prose :deep(a) {
  @apply text-blue-600 underline underline-offset-2 hover:text-blue-500 dark:text-blue-400;
}
.wiki-prose :deep(ul) {
  @apply my-4 list-disc space-y-1 pl-6;
}
.wiki-prose :deep(ol) {
  @apply my-4 list-decimal space-y-1 pl-6;
}
.wiki-prose :deep(blockquote) {
  @apply my-4 border-l-4 pl-4 italic text-muted-foreground;
}
.wiki-prose :deep(hr) {
  @apply my-8 border-t;
}
.wiki-prose :deep(code) {
  @apply rounded bg-muted px-1 py-0.5 text-sm;
}
.wiki-prose :deep(table) {
  @apply my-6 w-full border-collapse text-sm;
}
.wiki-prose :deep(th),
.wiki-prose :deep(td) {
  @apply border px-3 py-2 text-left;
}
</style>
