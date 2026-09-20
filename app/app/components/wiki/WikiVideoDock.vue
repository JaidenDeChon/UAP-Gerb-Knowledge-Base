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
const mount = ref<HTMLElement | null>(null)

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

  function move(e: PointerEvent): void {
    if (!resizing) return
    dock.rect.value = clampRect(
      { ...dock.rect.value, x: x.value, y: y.value, w: startW + (e.clientX - startX) },
      window.innerWidth, window.innerHeight,
    )
  }
  function up(): void {
    resizing = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    persistDock(dock.rect.value, dock.minimised.value)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/* ------------------------------------------------- YouTube IFrame API -- */

let player: { seekTo: (seconds: number, allowSeekAhead: boolean) => void, destroy: () => void } | null = null
let apiReady: Promise<void> | null = null

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
  if (!mount.value) return
  player?.destroy()
  const YT = (window as unknown as { YT: any }).YT
  player = new YT.Player(mount.value, {
    videoId: id,
    playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
    events: {
      onReady() {
        // Atomic consume: a seek queued before the player existed is picked
        // up exactly once here, never re-applied by the watcher below.
        const seconds = dock.takePendingSeek()
        if (seconds !== null) player?.seekTo(seconds, true)
      },
    },
  })
}

watch(() => dock.videoId.value, (id) => { if (id) mountPlayer(id) })

// A seek arriving after the player already exists applies here; one arriving
// before it is ready is picked up by onReady above. takePendingSeek() clears
// the value in the same step it's read, so this can't re-fire on its own
// write and re-apply a stale seek, and onReady can't also consume it.
watch(() => dock.pendingSeek.value, (seconds) => {
  if (seconds === null || !player) return
  const taken = dock.takePendingSeek()
  if (taken !== null) player.seekTo(taken, true)
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
        <div ref="mount" class="ufo-dock-mount" />
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
  z-index: 70;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--popover));
  box-shadow: var(--shadow-lg);
}
.ufo-dock-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px 5px 10px;
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
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}
.ufo-dock-btn {
  display: inline-flex;
  padding: 3px;
  border-radius: var(--radius-sm);
  color: hsl(var(--muted-foreground));
}
.ufo-dock-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.ufo-dock-body { position: relative; }
.ufo-dock-mount { aspect-ratio: 16 / 9; width: 100%; }
.ufo-dock-mount :deep(iframe) { display: block; width: 100%; height: 100%; border: 0; }

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
