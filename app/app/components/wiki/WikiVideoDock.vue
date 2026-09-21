<script setup lang="ts">
import { Minus, Square, X } from '@lucide/vue'
import { useDraggable } from '@vueuse/core'
import { clampRect, persistDock } from '@/composables/useVideoDock'

/**
 * App-global video dock: a draggable, resizable YouTube player mounted once
 * in the default layout (outside <main>) so playback survives navigation
 * between wiki notes. See useVideoDock for the shared state it reacts to.
 */

const dock = useVideoDock()

const handle = ref<HTMLElement | null>(null)
// The scoped wrapper that owns the 16:9 box. `new YT.Player(el, ...)` REPLACES
// `el` with YouTube's own <iframe> — the iframe inherits el's class but NOT
// Vue's scoped data-v- attribute, so scoped CSS (including `:deep()`) can only
// ever target it through an ancestor that survives the replacement. `stage`
// is that surviving ancestor; the actual mount node passed to YT.Player is
// created fresh imperatively on every call (see mountPlayer), never reused
// via a template ref, since the previous one may already be gone.
const stage = ref<HTMLElement | null>(null)

const isMobile = ref(false)
function syncViewport(): void {
  isMobile.value = window.innerWidth <= 900
  // A rect saved on a large display must not reopen offscreen on a smaller
  // one, so re-clamp against the live viewport on every resize too.
  dock.rect.value = clampRect(dock.rect.value, window.innerWidth, window.innerHeight)
}

/* ---------------------------------------------------------------- drag -- */

const { x, y } = useDraggable(handle, {
  initialValue: { x: dock.rect.value.x, y: dock.rect.value.y },
  preventDefault: true,
  disabled: computed(() => isMobile.value),
  onEnd() {
    dock.rect.value = clampRect(
      { ...dock.rect.value, x: x.value, y: y.value },
      window.innerWidth, window.innerHeight,
    )
    x.value = dock.rect.value.x
    y.value = dock.rect.value.y
    persistDock(dock.rect.value, dock.minimised.value)
  },
})

/* -------------------------------------------------------------- resize -- */

let resizing = false
function startResize(event: PointerEvent): void {
  if (isMobile.value) return
  resizing = true
  const startX = event.clientX
  const startW = dock.rect.value.w

  // Without pointer capture, releasing outside the viewport never delivers a
  // `pointerup` to window, so `up()` never runs: `resizing` gets stuck true
  // and this listener pair leaks (stacking another pair on the next resize).
  // Capturing on the grip re-targets pointer events to it regardless of
  // where the cursor ends up, guaranteeing pointerup still bubbles to window.
  const grip = event.currentTarget as Element
  try {
    grip.setPointerCapture(event.pointerId)
  }
  catch {
    // Capture is a robustness measure, not a hard requirement — proceed uncaptured.
  }

  function move(e: PointerEvent): void {
    if (!resizing) return
    dock.rect.value = clampRect(
      { ...dock.rect.value, x: x.value, y: y.value, w: startW + (e.clientX - startX) },
      window.innerWidth, window.innerHeight,
    )
  }
  function up(): void {
    resizing = false
    try {
      grip.releasePointerCapture(event.pointerId)
    }
    catch {
      // Already released (e.g. the grip left the DOM mid-resize) — fine.
    }
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    persistDock(dock.rect.value, dock.minimised.value)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/* ------------------------------------------------- YouTube IFrame API -- */

interface Player {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getPlayerState: () => number
  destroy: () => void
}
/** `YT.PlayerState.PLAYING` — the only state the poll below runs in. */
const PLAYING = 1

let player: Player | null = null
let apiReady: Promise<void> | null = null

/* ------------------------------------------------- playback position -- */

// The IFrame API has no "timeupdate" event, so while the video plays a 1s
// poll copies `getCurrentTime()` into the shared dock state (useVideoDock's
// `currentTime`) for anything that follows the video — the timeline's "now
// discussing" marker, for one. The poll only runs while PLAYING; every
// state change (pause, seek, buffer, end) takes one immediate sample so a
// paused-and-scrubbed player still reports where it is.
let poll: ReturnType<typeof setInterval> | null = null

function sampleTime(): void {
  if (!player) return
  try {
    const t = player.getCurrentTime()
    if (Number.isFinite(t)) dock.currentTime.value = Math.floor(t)
  }
  catch {
    // The player can be mid-teardown when a late tick fires; skip the sample.
  }
}

function setPolling(on: boolean): void {
  if (on && !poll) poll = setInterval(sampleTime, 1000)
  if (!on && poll) {
    clearInterval(poll)
    poll = null
  }
}

function seekPlayer(seconds: number): void {
  player?.seekTo(seconds, true)
  // Report the new position at once rather than waiting for the next tick,
  // so a cue click moves the timeline's marker in the same frame.
  dock.currentTime.value = seconds
}

/** Load the IFrame API once, lazily — never on a cold page load. */
function loadApi(): Promise<void> {
  if (apiReady) return apiReady
  apiReady = new Promise<void>((resolve) => {
    const w = window as unknown as Record<string, unknown>
    if (w.YT && (w.YT as { Player?: unknown }).Player) { resolve(); return }
    const prev = w.onYouTubeIframeAPIReady as (() => void) | undefined
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve() }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
  return apiReady
}

async function mountPlayer(id: string): Promise<void> {
  await loadApi()
  await nextTick()
  if (!stage.value) return
  setPolling(false)
  dock.playing.value = false
  player?.destroy()
  player = null
  // Fresh mount node every time: `stage` is the scoped wrapper Vue owns and
  // re-renders safely, but YT.Player replaces whatever element it's given
  // with its own <iframe> — reusing a template ref to that element would
  // hand YT.Player an already-detached node on a second open.
  stage.value.replaceChildren()
  const mountEl = document.createElement('div')
  stage.value.appendChild(mountEl)
  const YT = (window as unknown as { YT: any }).YT
  player = new YT.Player(mountEl, {
    videoId: id,
    playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
    events: {
      onReady() {
        // Atomic consume: a seek queued before the player existed is picked
        // up exactly once here, never re-applied by the watcher below.
        const seconds = dock.takePendingSeek()
        if (seconds !== null) seekPlayer(seconds)
        else sampleTime()
      },
      onStateChange(event: { data: number }) {
        const isPlaying = event.data === PLAYING
        dock.playing.value = isPlaying
        setPolling(isPlaying)
        sampleTime()
      },
    },
  })
}

// A new id mounts a player; `dock.close()` clearing it tears the player down
// with it, so a stale iframe doesn't keep playing (and polling) behind a
// hidden dock.
watch(() => dock.videoId.value, (id) => {
  if (id) {
    mountPlayer(id)
    return
  }
  setPolling(false)
  player?.destroy()
  player = null
})

// A seek arriving after the player already exists applies here; one arriving
// before it is ready is picked up by onReady above. takePendingSeek() clears
// the value in the same step it's read, so this can't re-fire on its own
// write and re-apply a stale seek, and onReady can't also consume it.
watch(() => dock.pendingSeek.value, (seconds) => {
  if (seconds === null || !player) return
  const taken = dock.takePendingSeek()
  if (taken !== null) seekPlayer(taken)
})

onMounted(() => {
  dock.hydrate()
  syncViewport()
  x.value = dock.rect.value.x
  y.value = dock.rect.value.y
  window.addEventListener('resize', syncViewport)
  if (dock.videoId.value) mountPlayer(dock.videoId.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)
  setPolling(false)
  dock.playing.value = false
  player?.destroy()
  player = null
})

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') dock.close()
}

/** Arrow keys nudge the dock when the drag handle has focus. */
function nudge(dx: number, dy: number): void {
  if (isMobile.value) return
  dock.rect.value = clampRect(
    { ...dock.rect.value, x: x.value + dx, y: y.value + dy },
    window.innerWidth, window.innerHeight,
  )
  x.value = dock.rect.value.x
  y.value = dock.rect.value.y
  persistDock(dock.rect.value, dock.minimised.value)
}

const style = computed(() => isMobile.value
  ? {}
  : { left: `${x.value}px`, top: `${y.value}px`, width: `${dock.rect.value.w}px` })
</script>

<template>
  <Transition name="ufo-dock">
    <div
      v-if="dock.visible.value && dock.videoId.value"
      class="ufo-dock"
      :class="{ 'is-mobile': isMobile, 'is-min': dock.minimised.value }"
      :style="style"
      role="complementary"
      aria-label="Video player"
      @keydown="onKeydown"
    >
      <header
        ref="handle"
        class="ufo-dock-bar"
        :tabindex="isMobile ? -1 : 0"
        @keydown.up.prevent="nudge(0, -16)"
        @keydown.down.prevent="nudge(0, 16)"
        @keydown.left.prevent="nudge(-16, 0)"
        @keydown.right.prevent="nudge(16, 0)"
      >
        <span class="ufo-dock-title">{{ dock.title.value || 'Now playing' }}</span>
        <button type="button" class="ufo-dock-btn" aria-label="Minimise" @click="dock.toggleMinimise()">
          <component :is="dock.minimised.value ? Square : Minus" class="size-3.5" />
        </button>
        <button type="button" class="ufo-dock-btn" aria-label="Close player" @click="dock.close()">
          <X class="size-3.5" />
        </button>
      </header>

      <div v-show="!dock.minimised.value" class="ufo-dock-body">
        <div ref="stage" class="ufo-dock-stage" />
        <span
          v-if="!isMobile"
          class="ufo-dock-grip"
          aria-hidden="true"
          @pointerdown="startResize"
        />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ufo-dock {
  position: fixed;
  /* Below the command palette's overlay/content (z-50, app/components/ui/dialog/*)
     and the mobile sidebar drawer + scrim (z-60/z-50, app/layouts/default.vue) so
     neither surface gets covered by (or stays clickable through) a docked player. */
  z-index: 40;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--popover));
  box-shadow: var(--shadow-lg);
}
.ufo-dock-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 4px 4px 10px;
  border-bottom: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  cursor: grab;
  user-select: none;
}
.ufo-dock-bar:active { cursor: grabbing; }
.ufo-dock.is-mobile .ufo-dock-bar { cursor: default; }

.ufo-dock-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}
.ufo-dock-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: var(--radius-sm);
  color: hsl(var(--muted-foreground));
  transition: background-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard),
    transform var(--dur-fast) var(--ease-standard);
}
.ufo-dock-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}
.ufo-dock-btn:active {
  transform: scale(0.92);
}

@media (prefers-reduced-motion: reduce) {
  .ufo-dock-btn {
    transition: none;
  }
  .ufo-dock-btn:active {
    transform: none;
  }
}

.ufo-dock-body { position: relative; }
/* This wrapper — not its child — is what YouTube's iframe never replaces, so
   it's the only element that can reliably size it. See the `stage` ref
   comment in <script>. */
.ufo-dock-stage { position: relative; aspect-ratio: 16 / 9; width: 100%; }
.ufo-dock-stage :deep(iframe) {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}

.ufo-dock-grip {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(
    135deg, transparent 50%, hsl(var(--border)) 50%, hsl(var(--border)) 100%
  );
}

/* Below the shell's own 900px breakpoint the dock is bottom-docked and fixed.
   A draggable window on a phone fights the sidebar overlay at the same width. */
.ufo-dock.is-mobile {
  inset: auto 0 0 0;
  width: 100%;
  border-radius: 0;
  border-inline: 0;
  border-bottom: 0;
}

.ufo-dock-enter-active,
.ufo-dock-leave-active {
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
}
.ufo-dock-enter-from,
.ufo-dock-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .ufo-dock-enter-active,
  .ufo-dock-leave-active {
    transition: none;
  }
}
</style>
