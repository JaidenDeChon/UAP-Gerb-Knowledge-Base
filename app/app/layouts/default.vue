<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const route = useRoute()
const sidebarOpen = useSidebarOpen()

// The full-screen graph lives at /map (and its renderer test routes under
// /map/*); everything else scrolls its content.
const isMap = computed(() => route.path === '/map' || route.path.startsWith('/map/'))

// Close the mobile drawer whenever navigation happens.
watch(() => route.path, () => {
  sidebarOpen.value = false
})

// The page scrolls inside <main>, not the window, so scroll
// restoration/reset on navigation is handled through router.options.ts's
// scrollBehavior (the router's official extension point) rather than an
// ad-hoc page:finish hook — that lets POP (back/forward) restore where the
// reader was, while PUSH still lands at the top. This layout only hands the
// container over to that machinery and captures its scroll on the way out
// of each route, since router.options.ts has no "leaving" hook of its own.
const mainRef = ref<HTMLElement | null>(null)
const router = useRouter()
onMounted(() => {
  registerScrollContainer(mainRef.value)
})
router.beforeEach(() => {
  saveOutgoingScroll()
})
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-background">
    <AppSidebar class="ufo-sidebar" :class="{ 'is-open': sidebarOpen }" />
    <div v-if="sidebarOpen" class="ufo-scrim" @click="sidebarOpen = false" />

    <div class="relative flex min-w-0 flex-1 flex-col">
      <AppTopBar />

      <main
        ref="mainRef"
        class="relative min-h-0 flex-1"
        :class="isMap ? 'overflow-hidden' : 'overflow-y-auto'"
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
  .ufo-scrim {
    display: none;
  }
}
</style>
