<script setup lang="ts">
import { Menu, Search } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const sidebarOpen = useSidebarOpen()
const commandOpen = useCommandOpen()
</script>

<template>
  <header
    class="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border/50 bg-background/80 px-4 backdrop-blur-[8px]"
  >
    <Button
      class="ufo-menu-btn"
      variant="ghost"
      size="icon"
      aria-label="Show or hide the site menu"
      @click="sidebarOpen = !sidebarOpen"
    >
      <Menu class="size-5" />
    </Button>

    <!-- Not an <h1>: the article below already owns the page's heading, and two
         of them would leave a screen reader with an ambiguous document outline.
         The wordmark names the site, not the current page, and links home. Only
         the text is the link; the wrapper takes the spare width. -->
    <div class="min-w-0 flex-1">
      <NuxtLink
        to="/"
        class="block w-fit max-w-full truncate rounded-sm font-display text-[15px] font-semibold tracking-[0.08em] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        UAP Gerb Knowledge Base
      </NuxtLink>
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
