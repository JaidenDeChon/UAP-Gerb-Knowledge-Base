<script setup lang="ts">
import type { PersonVideo } from '#shared/types/wiki'
import { Clapperboard } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { fractionalYear } from '@/utils/timeline'
import { formatDay, youtubeThumbnail } from '@/utils/video'

/**
 * Every video whose summary links to this person, newest first, above a
 * strip of the channel's whole run with a mark where each one came out. Built
 * from the link graph (`/api/person`), so it needs no authoring.
 */
const props = defineProps<{ path: string, name: string }>()

const { data: profile } = usePersonProfile(() => props.path)

const LIMIT = 8
const showAll = ref(false)
watch(() => props.path, () => { showAll.value = false })

const videos = computed<PersonVideo[]>(() => [...(profile.value?.videos ?? [])].reverse())
const shown = computed(() => (showAll.value ? videos.value : videos.value.slice(0, LIMIT)))

const span = computed(() => profile.value?.channelSpan ?? null)

/** Where each video sits along the channel's run, in percent. */
const marks = computed(() => {
  const s = span.value
  if (!s) return []
  const from = fractionalYear(s[0])!
  const to = fractionalYear(s[1])!
  const width = Math.max(to - from, 1 / 12)
  return videos.value
    .map(v => (v.published ? { path: v.path, title: v.title, pct: ((fractionalYear(v.published)! - from) / width) * 100 } : null))
    .filter((m): m is { path: string, title: string, pct: number } => m !== null)
})

const failed = ref(new Set<string>())
</script>

<template>
  <section v-if="videos.length" class="ufo-pv" aria-labelledby="ufo-pv-title">
    <h2 id="ufo-pv-title" class="mb-2 font-display text-[20px] font-semibold uppercase tracking-[0.04em] text-foreground">
      Videos about {{ name }}
    </h2>
    <p class="mb-4 font-sans text-[14px] leading-6 text-muted-foreground">
      {{ name }} comes up in {{ videos.length }} of Gerb's {{ profile?.channelVideos }} videos.
      <template v-if="marks.length > 1">
        Each mark on the line below is one of them, placed by the date it came out.
      </template>
    </p>

    <div v-if="span && marks.length" class="ufo-pv-strip" aria-hidden="true">
      <div class="ufo-pv-line">
        <span
          v-for="mark in marks"
          :key="mark.path"
          class="ufo-pv-mark"
          :style="{ left: `${mark.pct}%` }"
          :title="mark.title"
        />
      </div>
      <div class="ufo-pv-ends">
        <span>{{ formatDay(span[0]) }}</span>
        <span>{{ formatDay(span[1]) }}</span>
      </div>
    </div>

    <ol class="ufo-pv-list">
      <li v-for="video in shown" :key="video.path" class="ufo-pv-item">
        <NuxtLink :to="video.path" class="ufo-pv-link">
          <span class="ufo-pv-thumb">
            <img
              v-if="video.videoId && !failed.has(video.path)"
              :src="youtubeThumbnail(video.videoId)"
              alt=""
              loading="lazy"
              decoding="async"
              width="96"
              height="54"
              @error="failed = new Set([...failed, video.path])"
            >
            <Clapperboard v-else class="size-4 text-muted-foreground" />
          </span>
          <span class="min-w-0">
            <span class="ufo-pv-title">{{ video.title }}</span>
            <span v-if="video.published" class="ufo-pv-date">{{ formatDay(video.published) }}</span>
          </span>
        </NuxtLink>
      </li>
    </ol>

    <Button
      v-if="videos.length > LIMIT"
      variant="ghost"
      size="sm"
      class="mt-3"
      @click="showAll = !showAll"
    >
      {{ showAll ? 'Show fewer' : `Show all ${videos.length} videos` }}
    </Button>
  </section>
</template>

<style scoped>
.ufo-pv-strip {
  margin-bottom: 18px;
  padding: 0 6px;
}
.ufo-pv-line {
  position: relative;
  height: 18px;
}
.ufo-pv-line::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  transform: translateY(-50%);
  background: hsl(var(--border));
}
.ufo-pv-mark {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  transform: translate(-50%, -50%);
  background: hsl(var(--graph-cat-videos) / 0.85);
  border: 1px solid hsl(var(--foreground) / 0.45);
}
.ufo-pv-ends {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.ufo-pv {
  container-type: inline-size;
}
.ufo-pv-list {
  display: grid;
  gap: 8px;
}
@container (min-width: 36rem) {
  .ufo-pv-list {
    grid-template-columns: 1fr 1fr;
  }
}
.ufo-pv-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
  transition: background-color var(--dur-fast) var(--ease-standard);
}
.ufo-pv-link:hover {
  background: hsl(var(--muted) / 0.6);
}
.ufo-pv-link:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.ufo-pv-thumb {
  display: grid;
  flex: none;
  place-items: center;
  width: 96px;
  height: 54px;
  overflow: hidden;
  border-radius: 4px;
  background: hsl(var(--muted) / 0.4);
}
.ufo-pv-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ufo-pv-title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  color: hsl(var(--foreground));
}
.ufo-pv-date {
  display: block;
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}
</style>
