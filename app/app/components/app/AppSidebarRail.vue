<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { FileText } from '@lucide/vue'
import type { TreeFolder, TreeItem, TreeNote } from '#shared/types/wiki'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ancestorsOf, folderLabel, navIcon, sectionIcon } from '~/utils/sidebarNav'

/**
 * The collapsed sidebar: the tree's top level as a column of icons. Each icon
 * names itself in a tooltip to its right. A section's icon opens a popover
 * with its contents — the same tree component the full sidebar uses, so
 * nested folders (each video's pages) still expand in place.
 */

const route = useRoute()
const tree = useTree().data
const entries = computed<TreeItem[]>(() => tree.value ?? [])

const navRows = computed(() => entries.value.filter((i): i is TreeNote => i.type === 'note'))
const sections = computed(() => entries.value.filter((i): i is TreeFolder => i.type === 'folder'))

/** Folder ids above the current page: its section's icon reads as active. */
const trail = computed(() => new Set(ancestorsOf(entries.value, route.path) ?? []))

/** The one section whose popover is open, if any. */
const openId = shallowRef<string | null>(null)

// Following a link inside a popover lands on the new page with it closed.
watch(() => route.path, () => {
  openId.value = null
})

const ROW = 'relative mx-auto flex size-10 items-center justify-center rounded-md outline-none transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-ring'
const IDLE = 'text-muted-foreground hover:bg-accent hover:text-foreground'
const ACTIVE = 'bg-accent text-foreground'
</script>

<template>
  <TooltipProvider :delay-duration="150" :skip-delay-duration="300">
    <nav aria-label="Site" class="flex flex-col gap-1">
      <Tooltip v-for="item in navRows" :key="item.path">
        <TooltipTrigger as-child>
          <NuxtLink
            :to="item.path"
            :aria-label="item.name"
            :class="[ROW, route.path === item.path ? ACTIVE : IDLE]"
          >
            <span
              class="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-primary transition-opacity duration-fast ease-standard"
              :class="route.path === item.path ? 'opacity-100' : 'opacity-0'"
            />
            <component :is="navIcon(item.path) ?? FileText" class="size-[18px]" />
          </NuxtLink>
        </TooltipTrigger>
        <TooltipContent side="right" :side-offset="10">
          {{ item.name }}
        </TooltipContent>
      </Tooltip>

      <div v-if="navRows.length && sections.length" class="mx-auto my-1 h-px w-8 bg-border/70" />

      <!-- The tooltip wraps the popover, never the reverse: both are built on
           reka's Popper, and a popover trigger inside a tooltip registers as
           the TOOLTIP's anchor, leaving the popover unanchored (floating-ui
           then parks it off screen). The tooltip steps aside while its
           popover is open; the popover's own header names the section. -->
      <Tooltip
        v-for="item in sections"
        :key="item.id"
        :disabled="openId === item.id"
      >
        <TooltipTrigger as-child>
          <div class="mx-auto size-10">
            <Popover
              :open="openId === item.id"
              @update:open="(v: boolean) => (openId = v ? item.id : null)"
            >
              <PopoverTrigger as-child>
                <button
                  type="button"
                  :aria-label="`${folderLabel(item)} (${item.count})`"
                  :class="[ROW, trail.has(item.id) || openId === item.id ? ACTIVE : IDLE]"
                >
                  <span
                    class="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-primary transition-opacity duration-fast ease-standard"
                    :class="trail.has(item.id) ? 'opacity-100' : 'opacity-0'"
                  />
                  <component :is="sectionIcon(item)" class="size-[18px]" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" :side-offset="10" :collision-padding="12" class="w-80 p-0">
                <div class="flex items-center gap-1.5 border-b border-border/50 px-3 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  <span class="text-primary opacity-70">//</span>
                  <component :is="sectionIcon(item)" class="size-3.5 shrink-0" />
                  <span class="flex-1 truncate">{{ folderLabel(item) }}</span>
                  <span class="text-[10px] tracking-[0.06em]">{{ item.count }}</span>
                </div>
                <div class="max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain p-1.5">
                  <AppSidebarTree :items="item.children" :depth="1" :indent-offset="16" />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" :side-offset="10">
          {{ folderLabel(item) }}
          <span class="ml-1 tabular-nums text-muted-foreground">{{ item.count }}</span>
        </TooltipContent>
      </Tooltip>
    </nav>
  </TooltipProvider>
</template>
