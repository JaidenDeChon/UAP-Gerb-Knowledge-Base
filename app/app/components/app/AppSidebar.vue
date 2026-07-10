<script setup lang="ts">
import { computed } from 'vue'
import { Radar } from '@lucide/vue'
import { Separator } from '@/components/ui/separator'

const route = useRoute()
const isHome = computed(() => route.path === '/')
</script>

<template>
  <aside class="flex h-full w-[280px] shrink-0 flex-col border-r bg-card">
    <div class="px-4 pb-3 pt-4">
      <AppBrand />
    </div>

    <div class="px-3 pb-2">
      <NuxtLink
        to="/"
        class="relative flex w-full items-center gap-2.5 rounded-sm py-[7px] pl-3 pr-3 font-sans text-sm transition-colors duration-fast ease-standard"
        :class="isHome ? 'bg-accent font-semibold text-accent-foreground' : 'text-foreground hover:bg-accent'"
      >
        <span
          class="absolute bottom-1 left-0 top-1 w-0.5 bg-primary transition-opacity duration-fast ease-standard"
          :class="isHome ? 'opacity-100' : 'opacity-0'"
        />
        <Radar class="size-4 shrink-0" :class="isHome ? 'text-primary' : 'text-muted-foreground'" />
        <span class="flex-1 truncate">Map — all entries</span>
      </NuxtLink>
    </div>

    <Separator />

    <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      <AppSidebarTree />
    </div>

    <div class="border-t p-3">
      <div class="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
        Appearance
      </div>
      <AppThemeSwitcher variant="block" />
    </div>
  </aside>
</template>
