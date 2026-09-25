<script setup lang="ts">
import type { VideoCard } from '#shared/types/wiki'
import { ArrowRight, ChevronLeft, ChevronRight } from '@lucide/vue'
import { useScroll } from '@vueuse/core'
import { Button } from '@/components/ui/button'

/** Two full rows of the three-up grid; the carousel shows the same six. */
const LIMIT = 6

// Served from the vault scan baked in at build time (see `wiki/videos.ts`), so
// a newly processed video lands here on the next deploy without an edit.
// `lazy` for the same reason the page's own content query is — see index.vue.
const { data: videos, pending, status } = useFetch<VideoCard[]>('/api/videos', {
  key: 'recent-videos',
  query: { limit: LIMIT },
  lazy: true,
})

// Part of the home page: it doesn't show until the strip has its videos.
usePageReady(() => status.value === 'success' || status.value === 'error')

// Below the container breakpoint the list is a horizontal scroll-snap
// carousel; these arrows page it (swiping works regardless).
const track = ref<HTMLElement | null>(null)
const { arrivedState } = useScroll(track)

function page(direction: 1 | -1): void {
  const el = track.value
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' })
}
</script>

<template>
  <section class="@container my-10" aria-labelledby="recent-videos-heading">
    <div class="mb-3.5 flex items-center gap-2.5">
      <span class="size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
      <h2 id="recent-videos-heading" class="whitespace-nowrap font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
        Recently processed
      </h2>
      <span class="h-px flex-1 bg-border" />

      <Button as-child variant="outline" size="sm" class="h-8 px-3 text-[11px]">
        <NuxtLink to="/videos">
          All videos
          <ArrowRight class="size-3.5" />
        </NuxtLink>
      </Button>
    </div>

    <ul
      v-if="videos?.length"
      ref="track"
      class="recent-track"
      aria-label="Recently processed videos"
    >
      <li v-for="video in videos" :key="video.path" class="recent-item">
        <VideoCard :video="video" />
      </li>
    </ul>

    <ul v-else-if="pending" class="recent-track ufo-skeleton" aria-hidden="true">
      <li v-for="n in 3" :key="n" class="recent-item">
        <div class="h-[270px] rounded-lg border border-border bg-muted/40" />
      </li>
    </ul>

    <div v-if="videos?.length" class="mt-2 flex justify-end gap-1 @xl:hidden">
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        aria-label="Previous videos"
        :disabled="arrivedState.left"
        @click="page(-1)"
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        aria-label="Next videos"
        :disabled="arrivedState.right"
        @click="page(1)"
      >
        <ChevronRight />
      </Button>
    </div>
  </section>
</template>

<style scoped>
@reference "../../assets/css/main.css";

/* Mobile: a swipeable carousel that bleeds to the page gutters (the home page
   pads by px-8) with the next card peeking in. From the @xl container width
   up it settles into a plain grid — two-up, then three-up. */
.recent-track {
  @apply -mx-8 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-8 px-8 pb-1;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}
.recent-track::-webkit-scrollbar {
  display: none;
}
.recent-item {
  @apply w-[78%] max-w-[300px] shrink-0 snap-start;
}

@container (min-width: 36rem) {
  .recent-track {
    @apply mx-0 grid grid-cols-2 gap-4 overflow-visible px-0 pb-0;
  }
  .recent-item {
    @apply w-auto max-w-none;
  }
}
@container (min-width: 42rem) {
  .recent-track {
    @apply grid-cols-3;
  }
}
</style>
