<script setup lang="ts">
const sections = ['People', 'Organizations', 'Concepts', 'Events', 'Locations', 'Operations']

const { data } = await useAsyncData('wiki:index', async () => {
  const [mocs, notes] = await Promise.all([
    queryCollection('wiki').where('stem', 'LIKE', 'MOCs/%').select('path', 'title').all(),
    queryCollection('wiki').select('path', 'title', 'stem').all(),
  ])

  const bySection = sections.map(section => ({
    section,
    notes: notes.filter(n => n.stem.startsWith(`${section}/`)).slice(0, 8),
    total: notes.filter(n => n.stem.startsWith(`${section}/`)).length,
  }))

  return { mocs, bySection, total: notes.length }
})

useHead({ title: 'UAP Gerb Knowledge Base' })
</script>

<template>
  <main class="mx-auto max-w-3xl px-6 py-12">
    <h1 class="text-3xl font-bold tracking-tight">UAP Gerb Knowledge Base</h1>
    <p class="mt-2 text-muted-foreground">
      {{ data?.total }} notes from the Obsidian vault, rendered with Nuxt Content.
    </p>

    <p class="mt-6">
      <NuxtLink to="/wiki/home" class="text-blue-600 underline underline-offset-2 dark:text-blue-400">
        Open the vault home note →
      </NuxtLink>
    </p>

    <section v-if="data?.mocs.length" class="mt-10">
      <h2 class="mb-3 text-lg font-semibold">Maps of Content</h2>
      <ul class="grid gap-1 sm:grid-cols-2">
        <li v-for="moc in data.mocs" :key="moc.path">
          <NuxtLink :to="moc.path" class="text-blue-600 hover:underline dark:text-blue-400">
            {{ moc.title }}
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section v-for="group in data?.bySection" :key="group.section" class="mt-10">
      <h2 class="mb-3 text-lg font-semibold">
        {{ group.section }}
        <span class="ml-1 text-sm font-normal text-muted-foreground">({{ group.total }})</span>
      </h2>
      <ul class="grid gap-1 sm:grid-cols-2">
        <li v-for="note in group.notes" :key="note.path">
          <NuxtLink :to="note.path" class="text-blue-600 hover:underline dark:text-blue-400">
            {{ note.title }}
          </NuxtLink>
        </li>
      </ul>
    </section>
  </main>
</template>
