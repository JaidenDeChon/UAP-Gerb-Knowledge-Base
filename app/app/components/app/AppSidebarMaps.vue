<script setup lang="ts">
import { FlaskConical, Waypoints } from '@lucide/vue'

/**
 * Sidebar links to the site map and its renderer test routes (`/map/*`).
 * The variants exist to compare performance across devices; once a winner is
 * chosen this list collapses back to a single "Site map" entry.
 */
const route = useRoute()

const VARIANTS = [
  { path: '/map', label: 'Site map', tech: 'SVG' },
  { path: '/map/canvas', label: 'Canvas 2D lab', tech: '2D' },
  { path: '/map/pixi', label: 'Pixi.js lab', tech: 'GL' },
  { path: '/map/sigma', label: 'Sigma.js lab', tech: 'GL' },
  { path: '/map/force', label: 'Live physics lab', tech: 'SIM' },
  { path: '/map/cosmos', label: 'cosmos.gl lab', tech: 'GPU' },
] as const

function isActive(path: string): boolean {
  return route.path === path
}
</script>

<template>
  <div class="mb-1">
    <div
      class="flex w-full items-center gap-1.5 px-3 pb-1 pt-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
    >
      <span class="text-primary opacity-70">//</span>
      <FlaskConical class="size-3.5 shrink-0" />
      <span class="flex-1 truncate text-left">Map lab</span>
    </div>

    <div class="flex flex-col gap-0.5">
      <NuxtLink
        v-for="v in VARIANTS"
        :key="v.path"
        :to="v.path"
        class="group relative flex w-full items-center gap-2.5 rounded-sm py-[7px] pl-3 pr-3 font-sans text-sm transition-colors duration-fast ease-standard"
        :class="isActive(v.path) ? 'bg-accent font-semibold text-accent-foreground' : 'text-foreground hover:bg-accent'"
      >
        <span
          class="absolute bottom-1 left-0 top-1 w-0.5 bg-primary transition-opacity duration-fast ease-standard"
          :class="isActive(v.path) ? 'opacity-100' : 'opacity-0'"
        />
        <Waypoints class="size-4 shrink-0" :class="isActive(v.path) ? 'text-primary' : 'text-muted-foreground'" />
        <span class="flex-1 truncate">{{ v.label }}</span>
        <span class="font-mono text-[10px] font-semibold tracking-[0.06em] text-muted-foreground">{{ v.tech }}</span>
      </NuxtLink>
    </div>
  </div>
</template>
