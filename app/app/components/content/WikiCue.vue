<script setup lang="ts">
import { Play } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    t?: number | string
    video?: string
    approx?: boolean | string
    /** The video's own title, e.g. for the dock header. Not the timeline entry's title. */
    videoTitle?: string
    /** The timeline entry this cue belongs to, folded into the accessible name when known. */
    entryTitle?: string
  }>(),
  { t: 0, video: '', approx: false, videoTitle: '', entryTitle: '' },
)

const dock = useVideoDock()

const seconds = computed(() => {
  const n = Number(props.t)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0
})

const label = computed(() => {
  const s = seconds.value
  const h = Math.floor(s / 3600)
  const m = Math.floor(s / 60) % 60
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
})

const isApprox = computed(() => props.approx === true || props.approx === 'true')

/**
 * The button's text content ("16:27") would otherwise win as the accessible
 * name over `title` — screen readers announce a bare timestamp with no verb
 * and no context. Build a real name from the same label plus, when known,
 * the timeline entry it belongs to.
 */
const ariaLabel = computed(() => {
  const base = `Play the video from ${label.value}`
  return props.entryTitle ? `${base} (${props.entryTitle})` : base
})

/**
 * If the dock has no video loaded, or a different one, open() at this
 * timestamp — that both loads the video and seeks in one step. Otherwise
 * the right video is already current, so just seek (seek() also
 * un-minimises/reopens a closed-but-loaded dock).
 *
 * A title is always passed to open(): the dock is app-global and its title
 * would otherwise stay whatever the previously-open video's title was.
 * Falling back to the video ID keeps that honest even if this page never
 * supplied a proper title, rather than silently carrying over a stale one.
 */
function go(): void {
  if (!props.video) {
    // No video resolvable — nothing to open or seek. WikiTimeline already
    // avoids rendering this button in that case; this guard covers direct
    // `::wiki-cue` use without a `video` attribute, so a click is a no-op
    // with a hint rather than a silent dead click.
    if (import.meta.dev) console.warn('[WikiCue] no `video` resolved — click ignored')
    return
  }
  if (dock.videoId.value !== props.video) {
    dock.open({ videoId: props.video, at: seconds.value, title: props.videoTitle || props.video })
    return
  }
  dock.seek(seconds.value)
}
</script>

<template>
  <button
    type="button"
    class="ufo-cue"
    :class="{ 'is-approx': isApprox }"
    :title="isApprox ? 'Play the video from about this moment (the time is an estimate)' : 'Play the video from this moment'"
    :aria-label="ariaLabel"
    @click="go"
  >
    <Play class="size-2.5" />
    <span>{{ isApprox ? '~' : '' }}{{ label }}</span>
  </button>
</template>

<style scoped>
.ufo-cue {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px 2px 6px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  background: hsl(var(--primary) / 0.08);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  color: hsl(var(--foreground));
  vertical-align: baseline;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard),
    background-color var(--dur-fast) var(--ease-standard),
    transform var(--dur-fast) var(--ease-standard);
}
.ufo-cue :deep(svg) {
  color: hsl(var(--primary));
  transition: color var(--dur-fast) var(--ease-standard);
}
.ufo-cue:hover {
  border-color: hsl(var(--primary));
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.16);
  transform: translateY(-1px);
}
.ufo-cue:active {
  transform: translateY(0);
  background: hsl(var(--primary) / 0.24);
}
.ufo-cue:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
/* Approximate cues read as a hint, not a promise. */
.ufo-cue.is-approx { border-style: dashed; }

@media (prefers-reduced-motion: reduce) {
  .ufo-cue { transition: color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard); }
  .ufo-cue:hover,
  .ufo-cue:active { transform: none; }
}
</style>
