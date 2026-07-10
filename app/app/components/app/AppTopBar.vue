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
      aria-label="Open navigation"
      @click="sidebarOpen = !sidebarOpen"
    >
      <Menu class="size-5" />
    </Button>

    <!-- Not an <h1>: the article below already owns the page's heading, and two
         of them would leave a screen reader with an ambiguous document outline.
         The wordmark is static — it names the site, not the current page. -->
    <span class="min-w-0 flex-1 truncate font-display text-[15px] font-semibold tracking-[0.08em] text-foreground">
      UAP Gerb Knowledge Base
    </span>

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
