<script setup lang="ts">
import { computed } from 'vue'
import { Menu, PanelLeftClose, PanelLeftOpen, Search } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const sidebarOpen = useSidebarOpen()
const commandOpen = useCommandOpen()
const { collapsed, toggle } = useSidebarCollapsed()

// The page's own title (pages set it via usePageTitle); the homepage leaves
// it empty and gets the site's name.
const pageTitle = usePageTitle()
const heading = computed(() => pageTitle.value || 'UAP Gerb Knowledge Base')
</script>

<template>
  <header
    class="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border/50 bg-background/80 px-4 backdrop-blur-[8px]"
  >
    <!-- Mobile: opens the sidebar drawer. Desktop: slims the sidebar to its
         icon rail and back. Only one of the two shows at a time (layout CSS). -->
    <Button
      class="ufo-menu-btn -ml-1.5"
      variant="ghost"
      size="icon"
      aria-label="Show or hide the site menu"
      @click="sidebarOpen = !sidebarOpen"
    >
      <Menu class="size-5" />
    </Button>
    <Button
      class="ufo-collapse-btn -ml-1.5 text-muted-foreground hover:text-foreground"
      variant="ghost"
      size="icon"
      :aria-label="collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'"
      :aria-expanded="!collapsed"
      @click="toggle"
    >
      <PanelLeftOpen v-if="collapsed" class="size-[18px]" />
      <PanelLeftClose v-else class="size-[18px]" />
    </Button>

    <!-- Not an <h1>: the article below already owns the page's heading, and two
         of them would leave a screen reader with an ambiguous document outline.
         This only echoes the title; the sidebar's logo is the home link.
         On a full page load the server renders this bar before the page has
         set its title (the layout renders ahead of the page), so the server
         HTML carries the site name and hydration swaps in the real title.
         Vue still patches the text; data-allow-mismatch only drops the warning. -->
    <div class="relative min-w-0 flex-1 overflow-hidden">
      <Transition name="ufo-title" mode="out-in">
        <span
          :key="heading"
          data-allow-mismatch="text"
          class="block truncate font-display text-[15px] font-semibold tracking-[0.04em] text-foreground"
        >
          {{ heading }}
        </span>
      </Transition>
    </div>

    <Button
      variant="outline"
      size="sm"
      class="border-border/50 text-muted-foreground"
      aria-label="Search entries"
      @click="commandOpen = true"
    >
      <Search class="size-[15px]" />
      <span>Search</span>
      <kbd class="ml-1.5 rounded bg-muted px-[5px] py-px font-mono text-[11px] font-medium leading-none normal-case tracking-normal">⌘K</kbd>
    </Button>

    <AppThemeSwitcher variant="icon" />
  </header>
</template>

<style>
/* The title slides up and out, and the next one slides up into place. */
.ufo-title-enter-active,
.ufo-title-leave-active {
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
}
.ufo-title-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.ufo-title-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
@media (prefers-reduced-motion: reduce) {
  .ufo-title-enter-active,
  .ufo-title-leave-active {
    transition: none;
  }
}
</style>
