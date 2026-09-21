import type { MaybeRefOrGetter } from 'vue'

/**
 * The dock's playback state, scoped to one video: everything a page needs to
 * follow *its* video without knowing the dock's shape. `time` and `playing`
 * are only ever truthy while the dock has this exact video loaded, so a
 * timeline on page A never lights up because page B's video is playing in
 * the dock the reader carried over.
 */
export function useVideoClock(videoId: MaybeRefOrGetter<string>) {
  const dock = useVideoDock()
  const isThisVideo = computed(() => {
    const id = toValue(videoId)
    return !!id && dock.videoId.value === id
  })
  const playing = computed(() => isThisVideo.value && dock.playing.value)
  /** Seconds into this video, or null when it isn't the dock's current video. */
  const time = computed<number | null>(() => (isThisVideo.value ? dock.currentTime.value : null))
  return { isThisVideo, playing, time }
}
