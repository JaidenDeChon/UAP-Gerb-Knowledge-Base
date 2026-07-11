<script setup lang="ts">
import type { GraphNode } from '#shared/types/wiki'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Maximize2, X } from '@lucide/vue'
import { buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const route = useRoute()
const sidebarOpen = useSidebarOpen()
const localMapEnabled = useLocalMapEnabled()

// The full-screen graph lives at /map (and its renderer test routes under
// /map/*); everything else scrolls its content.
const isMap = computed(() => route.path === '/map' || route.path.startsWith('/map/'))

// The docked local map is an article aid — show it on wiki pages when enabled.
const showLocalMap = computed(() => localMapEnabled.value && route.path.startsWith('/wiki'))

// Close the mobile drawer whenever navigation happens.
watch(() => route.path, () => {
  sidebarOpen.value = false
})

// The page scrolls inside <main>, not the window, so Nuxt's built-in scroll
// restoration (which targets the window) can't reset it — a new entry would open
// wherever the previous one was scrolled to. Reset the container to the top once
// the incoming page has rendered. page:finish fires after the new page mounts,
// so the scroll lands on the freshly swapped content, not the outgoing page.
const mainRef = ref<HTMLElement | null>(null)
useNuxtApp().hook('page:finish', () => {
  mainRef.value?.scrollTo({ top: 0 })
})

function onSelect(node: GraphNode): void {
  navigateTo(node.p)
}

/* ---------------------------------------------- docked local map placement -- */

// The shell column is the docked map's positioning + clamping context.
const shellRef = ref<HTMLElement | null>(null)
const { style: mapStyle, settle, begin, move, end } = useDockedMap(() => shellRef.value)

let ro: ResizeObserver | null = null
onMounted(() => {
  settle()
  if (shellRef.value) {
    ro = new ResizeObserver(() => settle())
    ro.observe(shellRef.value)
  }
})
onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
})

// Re-anchor once the frame first appears (e.g. navigating map → article).
watch(showLocalMap, (on) => {
  if (on) nextTick(settle)
})

/* -------------------------------------------------- expanded map dialog ---- */

const mapDialogOpen = ref(false)

function onDialogSelect(node: GraphNode): void {
  mapDialogOpen.value = false
  navigateTo(node.p)
}
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-background">
    <AppSidebar class="ufo-sidebar" :class="{ 'is-open': sidebarOpen }" />
    <div v-if="sidebarOpen" class="ufo-scrim" @click="sidebarOpen = false" />

    <div ref="shellRef" class="relative flex min-w-0 flex-1 flex-col">
      <AppTopBar />

      <main
        ref="mainRef"
        class="relative min-h-0 flex-1"
        :class="isMap ? 'overflow-hidden' : 'overflow-y-auto'"
      >
        <slot />
      </main>

      <div
        v-if="showLocalMap"
        class="ufo-map absolute z-30 flex flex-col overflow-hidden rounded-lg border border-primary/70 shadow-lg"
        :style="mapStyle"
      >
        <div
          class="flex shrink-0 cursor-move touch-none select-none items-center justify-between gap-2 border-b border-border/50 bg-card px-3 py-2"
          @pointerdown="begin($event, 'move')"
          @pointermove="move"
          @pointerup="end"
          @pointercancel="end"
        >
          <span class="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Local map
          </span>
          <div class="flex items-center gap-0.5">
            <button
              type="button"
              class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Expand the local map"
              @click="mapDialogOpen = true"
            >
              <Maximize2 :size="13" />
            </button>
            <button
              type="button"
              class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Hide the local map"
              @click="localMapEnabled = false"
            >
              <X :size="14" />
            </button>
          </div>
        </div>

        <div class="relative min-h-0 flex-1">
          <GraphMap minimized :active-path="route.path" class="size-full" @select="onSelect" />
        </div>

        <!-- Invisible drag-to-resize corners (top-right is intentionally omitted). -->
        <div
          class="absolute left-0 top-0 z-20 size-4 cursor-nwse-resize touch-none"
          aria-hidden="true"
          @pointerdown="begin($event, 'resize', 'top-left')"
          @pointermove="move"
          @pointerup="end"
          @pointercancel="end"
        />
        <div
          class="absolute bottom-0 left-0 z-20 size-4 cursor-nesw-resize touch-none"
          aria-hidden="true"
          @pointerdown="begin($event, 'resize', 'bottom-left')"
          @pointermove="move"
          @pointerup="end"
          @pointercancel="end"
        />
        <div
          class="absolute bottom-0 right-0 z-20 size-4 cursor-nwse-resize touch-none"
          aria-hidden="true"
          @pointerdown="begin($event, 'resize', 'bottom-right')"
          @pointermove="move"
          @pointerup="end"
          @pointercancel="end"
        />
      </div>
    </div>

    <Dialog v-model:open="mapDialogOpen">
      <DialogContent class="max-w-[min(920px,calc(100vw-2rem))] gap-3">
        <DialogHeader>
          <DialogTitle class="font-mono text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Local map
          </DialogTitle>
          <DialogDescription class="sr-only">
            The neighbourhood of the current entry in the knowledge graph.
          </DialogDescription>
        </DialogHeader>

        <div class="h-[68vh] overflow-hidden rounded-lg border border-primary/70">
          <GraphMap v-if="mapDialogOpen" minimized :active-path="route.path" class="size-full" @select="onDialogSelect" />
        </div>

        <DialogFooter>
          <NuxtLink :to="'/map'" :class="buttonVariants({ size: 'sm' })" @click="mapDialogOpen = false">
            Open site map
          </NuxtLink>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AppCommandPalette />
  </div>
</template>

<style>
/* Mobile shell — unlayered so these win over Tailwind's utility layer.
   The 900px breakpoint matches the design system's kit. */
.ufo-scrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: hsl(var(--overlay) / var(--overlay-opacity));
}

.ufo-menu-btn {
  display: none;
}

@media (max-width: 900px) {
  .ufo-sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 60;
    transform: translateX(-100%);
    box-shadow: var(--shadow-lg);
    transition: transform var(--dur-base) var(--ease-out);
  }
  .ufo-sidebar.is-open {
    transform: translateX(0);
  }
  .ufo-menu-btn {
    display: inline-flex;
  }
}

@media (min-width: 901px) {
  .ufo-scrim {
    display: none;
  }
}

@media (max-width: 900px) {
  .ufo-map {
    display: none;
  }
}
</style>
