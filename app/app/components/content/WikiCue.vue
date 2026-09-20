<script setup lang="ts">
import { Play } from '@lucide/vue'

const props = withDefaults(
  defineProps<{ t?: number | string, video?: string, approx?: boolean | string }>(),
  { t: 0, video: '', approx: false },
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
 * If the dock has no video loaded, or a different one, open() at this
 * timestamp — that both loads the video and seeks in one step. Otherwise
 * the right video is already current, so just seek (seek() also
 * un-minimises/reopens a closed-but-loaded dock).
 */
function go(): void {
  if (props.video && dock.videoId.value !== props.video) {
    dock.open({ videoId: props.video, at: seconds.value })
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
    :title="isApprox ? 'Approximate timestamp' : 'Jump to this moment'"
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
  gap: 3px;
  padding: 1px 5px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 16px;
  color: hsl(var(--muted-foreground));
  vertical-align: baseline;
  transition: color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard);
}
.ufo-cue:hover {
  border-color: hsl(var(--primary));
  color: hsl(var(--primary));
}
/* Approximate cues read as a hint, not a promise. */
.ufo-cue.is-approx { border-style: dashed; }
</style>
