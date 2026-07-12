<script setup lang="ts">
import type { Component } from 'vue'
import { computed, watch } from 'vue'
import {
  Atom,
  Building2,
  CalendarClock,
  ChevronRight,
  Clapperboard,
  Compass,
  Crosshair,
  FileText,
  Folder,
  House,
  MapPin,
  Radar,
  Users,
} from '@lucide/vue'
import {
  CATEGORY_ICON,
  type Category,
  type TreeFolder,
  type TreeItem,
} from '#shared/types/wiki'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

defineOptions({ name: 'AppSidebarTree' })

const props = withDefaults(defineProps<{ items?: TreeItem[], depth?: number }>(), {
  depth: 0,
})

const isRoot = props.items === undefined
const route = useRoute()

// Only the root instance fetches; every nested instance receives `items` as a prop.
const tree = isRoot ? useTree().data : null
const entries = computed<TreeItem[]>(() => props.items ?? tree?.value ?? [])
const indentPx = computed(() => 12 + props.depth * 16)

// Expansion + "has ever been opened" persist globally so state survives remounts.
const expanded = useState<Record<string, boolean>>('shell:tree', () => ({}))
const opened = useState<Record<string, boolean>>('shell:tree:opened', () => ({}))

const ICONS: Record<string, Component> = {
  'compass': Compass,
  'users': Users,
  'building-2': Building2,
  'crosshair': Crosshair,
  'calendar-clock': CalendarClock,
  'map-pin': MapPin,
  'atom': Atom,
  'clapperboard': Clapperboard,
}

function sectionIcon(item: TreeFolder): Component {
  return ICONS[CATEGORY_ICON[item.name as Category]] ?? Folder
}

function folderIcon(item: TreeFolder): Component {
  return item.id.startsWith('Videos/') ? Clapperboard : Folder
}

// The `MOCs` folder reads as an acronym; spell it out in the sidebar.
const FOLDER_LABEL: Record<string, string> = {
  MOCs: 'Maps of Content',
}

function folderLabel(item: TreeFolder): string {
  return FOLDER_LABEL[item.id] ?? item.name
}

// Ancestors of the active route, derived at render time so SSR and the client's
// first render agree (a watcher would run before async tree data resolves on the
// server, expanding nothing there, then expand on the client — a hydration
// mismatch). User toggles in `expanded` still win via `isExpanded`.
const autoOpen = computed<Set<string>>(
  () => new Set(ancestorsOf(entries.value, route.path) ?? []),
)

function isExpanded(id: string): boolean {
  return expanded.value[id] ?? autoOpen.value.has(id)
}

function isOpened(id: string): boolean {
  return opened.value[id] || autoOpen.value.has(id)
}

function isActive(path: string): boolean {
  return route.path === path
}

// The tree's leading `Home` (`/`) and `Site map` (`/map`) rows are app-wide nav,
// not vault content — styled like the mono `//` category headers below them
// rather than the plain note-row treatment used for actual wiki pages.
const NAV_ICON: Record<string, Component> = {
  '/': House,
  '/map': Radar,
}

function navIcon(path: string): Component | undefined {
  return NAV_ICON[path]
}

function setOpen(id: string, value: boolean): void {
  expanded.value[id] = value
  if (value)
    opened.value[id] = true
}

function ancestorsOf(list: TreeItem[], target: string, trail: string[] = []): string[] | null {
  for (const item of list) {
    if (item.type === 'note') {
      if (item.path === target)
        return trail
    }
    else {
      const found = ancestorsOf(item.children, target, [...trail, item.id])
      if (found)
        return found
    }
  }
  return null
}

if (isRoot) {
  watch(
    [() => route.path, entries],
    () => {
      const trail = ancestorsOf(entries.value, route.path)
      if (!trail)
        return
      for (const id of trail) {
        expanded.value[id] = true
        opened.value[id] = true
      }
    },
    { immediate: true },
  )
}
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <template v-for="item in entries" :key="item.type === 'folder' ? item.id : item.path">
      <!-- App-wide nav row (Home / Site map): mono `//` treatment, like the
           category headers below, instead of the plain note-row style. -->
      <NuxtLink
        v-if="item.type === 'note' && depth === 0 && navIcon(item.path)"
        :to="item.path"
        class="flex w-full items-center gap-1.5 px-3 pb-1 pt-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors hover:text-foreground"
        :class="isActive(item.path) ? 'text-foreground' : 'text-muted-foreground'"
      >
        <span class="text-primary opacity-70">//</span>
        <component :is="navIcon(item.path)" class="size-3.5 shrink-0" />
        <span class="flex-1 truncate text-left">{{ item.name }}</span>
      </NuxtLink>

      <!-- Note row -->
      <NuxtLink
        v-else-if="item.type === 'note'"
        :to="item.path"
        class="group relative flex w-full items-center gap-2.5 rounded-sm py-[7px] pr-3 font-sans text-sm transition-colors duration-fast ease-standard"
        :class="isActive(item.path) ? 'bg-accent font-semibold text-accent-foreground' : 'text-foreground hover:bg-accent'"
        :style="{ paddingLeft: `${indentPx}px` }"
      >
        <span
          class="absolute bottom-1 left-0 top-1 w-0.5 bg-primary transition-opacity duration-fast ease-standard"
          :class="isActive(item.path) ? 'opacity-100' : 'opacity-0'"
        />
        <FileText class="size-4 shrink-0" :class="isActive(item.path) ? 'text-primary' : 'text-muted-foreground'" />
        <span class="flex-1 truncate">{{ item.name }}</span>
      </NuxtLink>

      <!-- Top-level folder: mono `//` section -->
      <Collapsible
        v-else-if="depth === 0"
        :open="isExpanded(item.id)"
        @update:open="(v: boolean) => setOpen(item.id, v)"
      >
        <CollapsibleTrigger
          class="flex w-full items-center gap-1.5 px-3 pb-1 pt-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <span class="text-primary opacity-70">//</span>
          <component :is="sectionIcon(item)" class="size-3.5 shrink-0" />
          <span class="flex-1 truncate text-left">{{ folderLabel(item) }}</span>
          <span class="font-mono text-[10px] font-semibold tracking-[0.06em] text-muted-foreground">{{ item.count }}</span>
          <ChevronRight
            class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-base ease-standard"
            :class="isExpanded(item.id) ? 'rotate-90' : ''"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div v-if="isOpened(item.id)" class="pb-1">
            <AppSidebarTree :items="item.children" :depth="depth + 1" />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <!-- Nested folder (video title): SidebarItem with chevron + count -->
      <Collapsible
        v-else
        :open="isExpanded(item.id)"
        @update:open="(v: boolean) => setOpen(item.id, v)"
      >
        <CollapsibleTrigger
          class="group flex w-full items-center gap-2.5 rounded-sm py-[7px] pr-3 text-left font-sans text-sm text-foreground transition-colors duration-fast ease-standard hover:bg-accent"
          :style="{ paddingLeft: `${indentPx}px` }"
        >
          <ChevronRight
            class="size-4 shrink-0 text-muted-foreground transition-transform duration-base ease-standard"
            :class="isExpanded(item.id) ? 'rotate-90' : ''"
          />
          <component :is="folderIcon(item)" class="size-4 shrink-0 text-muted-foreground" />
          <span class="flex-1 truncate">{{ item.name }}</span>
          <span class="font-mono text-[10px] font-semibold tracking-[0.06em] text-muted-foreground">{{ item.count }}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div v-if="isOpened(item.id)">
            <AppSidebarTree :items="item.children" :depth="depth + 1" />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </template>
  </div>
</template>
