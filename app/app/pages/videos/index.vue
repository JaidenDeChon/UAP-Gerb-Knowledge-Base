<script setup lang="ts">
import type { VideoCard } from '#shared/types/wiki'

// Every video summary, most recently processed first — the same build-time
// list the home page's "Recently processed" strip is cut from, so it never
// needs updating by hand. `lazy` for the reason given in index.vue.
const { data: videos } = useFetch<VideoCard[]>('/api/videos', { key: 'all-videos', lazy: true })

usePageTitle().value = 'Videos'
useHead({ title: 'Videos' })
</script>

<template>
  <div class="@container mx-auto max-w-[1100px] px-8 pb-32 pt-10">
    <h1 class="font-display text-[clamp(32px,5vw,56px)] font-extrabold uppercase leading-none tracking-[0.02em] text-foreground">
      Videos
    </h1>
    <p class="mb-8 mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
      <template v-if="videos">{{ videos.length }} processed · most recent first</template>
      <template v-else>&nbsp;</template>
    </p>

    <ul v-if="videos" class="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
      <li v-for="video in videos" :key="video.path" v-reveal>
        <VideoCard :video="video" />
      </li>
    </ul>

    <ul v-else class="ufo-skeleton grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3" aria-hidden="true">
      <li v-for="n in 6" :key="n" class="h-[300px] rounded-lg border border-border bg-muted/40" />
    </ul>
  </div>
</template>
