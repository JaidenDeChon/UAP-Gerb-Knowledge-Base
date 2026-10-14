<script setup lang="ts">
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'

// The rail only exists on desktop: under 900px the sidebar is the full-width
// drawer whatever the setting (see the layout's mobile shell CSS).
const { collapsed } = useSidebarCollapsed()
const mobile = useMediaQuery('(max-width: 900px)')
const rail = computed(() => collapsed.value && !mobile.value)
</script>

<template>
  <!-- Width animates between 280px and the 64px rail (layout CSS). Both views
       are mounted and cross-fade, each laid out at its own fixed width so
       nothing reflows while the edge slides. -->
  <aside
    class="flex h-full shrink-0 flex-col overflow-hidden border-r border-border/50 bg-card"
    :class="{ 'is-collapsed': collapsed }"
  >
    <!-- h-14 + border-b mirrors AppTopBar so the two header bottom borders
         align. The logo is the home link; collapsing fades the wordmark and
         leaves the ring, which sits centred in the rail. -->
    <div class="flex h-14 shrink-0 items-center border-b border-border/50 px-4">
      <NuxtLink
        to="/"
        aria-label="UAP Gerb Knowledge Base, home"
        class="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AppBrand :compact="rail" />
      </NuxtLink>
    </div>

    <div class="relative min-h-0 flex-1">
      <div
        class="ufo-sidebar-layer absolute inset-y-0 left-0 w-[280px] overflow-y-auto px-3 py-2"
        :class="{ 'is-hidden': rail }"
        :inert="rail || undefined"
      >
        <AppSidebarTree />
      </div>
      <div
        class="ufo-sidebar-layer absolute inset-y-0 left-0 w-16 overflow-y-auto overflow-x-hidden py-2"
        :class="{ 'is-hidden': !rail }"
        :inert="!rail || undefined"
      >
        <AppSidebarRail />
      </div>
    </div>

    <div class="relative h-[89px] shrink-0 border-t border-border/50">
      <div
        class="ufo-sidebar-layer absolute bottom-0 left-0 w-[280px] p-3"
        :class="{ 'is-hidden': rail }"
        :inert="rail || undefined"
      >
        <div class="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          Appearance
        </div>
        <AppThemeSwitcher variant="block" />
      </div>
      <div
        class="ufo-sidebar-layer absolute bottom-0 left-0 flex w-16 justify-center p-3"
        :class="{ 'is-hidden': !rail }"
        :inert="!rail || undefined"
      >
        <AppThemeSwitcher variant="rail" />
      </div>
    </div>
  </aside>
</template>

<style>
/* Cross-fade between the full tree and the rail. The outgoing view fades
   quickly and then drops out of hit-testing; the incoming one fades in over
   the width animation. */
.ufo-sidebar-layer {
  transition: opacity var(--dur-slow) var(--ease-out), visibility 0s;
}
.ufo-sidebar-layer.is-hidden {
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--dur-fast) var(--ease-standard), visibility 0s linear var(--dur-fast);
}
@media (prefers-reduced-motion: reduce) {
  .ufo-sidebar-layer,
  .ufo-sidebar-layer.is-hidden {
    transition: none;
  }
}
</style>
