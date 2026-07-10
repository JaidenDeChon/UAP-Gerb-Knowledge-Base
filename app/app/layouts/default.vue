<script setup lang="ts">
import type { GraphNode } from '#shared/types/wiki'
import { computed, watch } from 'vue'

const route = useRoute()
const sidebarOpen = useSidebarOpen()

const isHome = computed(() => route.path === '/')

// Close the mobile drawer whenever navigation happens.
watch(() => route.path, () => {
  sidebarOpen.value = false
})

function onSelect(node: GraphNode): void {
  navigateTo(node.p)
}
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-background">
    <AppSidebar class="ufo-sidebar" :class="{ 'is-open': sidebarOpen }" />
    <div v-if="sidebarOpen" class="ufo-scrim" @click="sidebarOpen = false" />

    <div class="relative flex min-w-0 flex-1 flex-col">
      <AppTopBar />

      <main
        class="relative min-h-0 flex-1"
        :class="isHome ? 'overflow-hidden' : 'overflow-y-auto'"
      >
        <slot />
      </main>

      <div v-if="!isHome" class="ufo-map absolute bottom-5 right-5 z-30 w-[300px]">
        <div class="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Map
        </div>
        <div class="h-[220px] w-[300px]">
          <GraphMap minimized :active-path="route.path" class="size-full" @select="onSelect" />
        </div>
      </div>
    </div>

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
