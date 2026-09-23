<script setup lang="ts">
import type { VideoCard } from '#shared/types/wiki'
import { Clapperboard, Clock } from '@lucide/vue'
import { formatDay, formatRuntime, youtubeThumbnail } from '@/utils/video'

const props = defineProps<{ video: VideoCard }>()

const runtime = computed(() => formatRuntime(props.video.durationSeconds))
const processed = computed(() => formatDay(props.video.processedAt))

// A thumbnail YouTube no longer serves falls back to the placeholder.
const thumbFailed = ref(false)
const thumb = computed(() =>
  props.video.videoId && !thumbFailed.value ? youtubeThumbnail(props.video.videoId) : null)
</script>

<template>
  <NuxtLink
    :to="video.path"
    class="ufo-video-card group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card"
  >
    <div class="relative aspect-video overflow-hidden border-b border-border bg-muted/40">
      <img
        v-if="thumb"
        :src="thumb"
        alt=""
        loading="lazy"
        decoding="async"
        width="320"
        height="180"
        class="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        @error="thumbFailed = true"
      >
      <div v-else class="grid size-full place-items-center text-muted-foreground">
        <Clapperboard class="size-7" />
      </div>
      <span
        v-if="runtime"
        class="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-sm bg-background/85 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground"
      >
        <Clock class="size-3" />
        {{ runtime }}
      </span>
    </div>

    <div class="flex flex-1 flex-col px-3.5 pb-3.5 pt-3">
      <h3 class="line-clamp-3 font-display text-[15px] font-bold uppercase leading-5 tracking-[0.015em] text-foreground transition-colors group-hover:text-primary">
        {{ video.title }}
      </h3>
      <p v-if="video.lead" class="mt-2 line-clamp-2 font-sans text-[13px] leading-5 text-muted-foreground">
        {{ video.lead }}
      </p>
      <time
        v-if="processed"
        :datetime="video.processedAt!"
        class="mt-auto pt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
      >
        Processed {{ processed }}
      </time>
    </div>
  </NuxtLink>
</template>

<style scoped>
/* Same accent-as-border-and-wash hover as the Featured card. */
.ufo-video-card {
  transition:
    border-color var(--dur-base) var(--ease-standard),
    background-color var(--dur-base) var(--ease-standard);
}
.ufo-video-card:hover,
.ufo-video-card:focus-visible {
  border-color: hsl(var(--primary) / 0.6);
  background-color: hsl(var(--primary) / 0.04);
}
@media (prefers-reduced-motion: reduce) {
  .ufo-video-card img { transition: none; transform: none; }
}
</style>
