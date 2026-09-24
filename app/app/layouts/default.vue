<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'

const route = useRoute()
const sidebarOpen = useSidebarOpen()

// The full-screen graph lives at /map (and its renderer test routes under
// /map/*); everything else scrolls its content.
const isMap = computed(() => route.path === '/map' || route.path.startsWith('/map/'))

// Close the mobile drawer whenever navigation happens.
watch(() => route.path, () => {
  sidebarOpen.value = false
})

// The document itself scrolls, not <main>: iOS only honours a tap on the
// status bar (scroll to top) for the page's own scroller. Scroll
// restoration/reset on navigation is still handled through router.options.ts's
// scrollBehavior (the router's official extension point) rather than an
// ad-hoc page:finish hook — that lets POP (back/forward) restore where the
// reader was, while PUSH still lands at the top. This layout only hands the
// scroller over to that machinery and captures its scroll on the way out
// of each route, since router.options.ts has no "leaving" hook of its own.
const router = useRouter()
onMounted(() => {
  registerScrollContainer(document.scrollingElement as HTMLElement | null)
})
router.beforeEach((to, from) => {
  // A same-path replace (the timeline syncing its filters to the query) isn't
  // leaving the page. Treating it as leaving cancelled a Back restore still in
  // flight and saved the half-restored scroll over the real one.
  if (to.path === from.path && !to.hash) return
  saveOutgoingScroll()
})
</script>

<template>
  <!-- The sidebar and top bar pin themselves with sticky while the document
       scrolls beneath them. -->
  <div class="flex min-h-dvh bg-background">
    <AppSidebar class="ufo-sidebar" :class="{ 'is-open': sidebarOpen }" />
    <div v-if="sidebarOpen" class="ufo-scrim" @click="sidebarOpen = false" />

    <div class="relative flex min-w-0 flex-1 flex-col">
      <AppTopBar />

      <!-- The map fills exactly the viewport below the h-14 top bar, so the
           document has nothing to scroll there. -->
      <main
        class="relative"
        :class="isMap ? 'h-[calc(100dvh-3.5rem)] overflow-hidden' : 'flex-1'"
      >
        <slot />
      </main>
    </div>

    <AppCommandPalette />
    <WikiVideoDock />
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
  .ufo-sidebar {
    position: sticky;
    top: 0;
    height: 100dvh;
  }
  .ufo-scrim {
    display: none;
  }
}
</style>
