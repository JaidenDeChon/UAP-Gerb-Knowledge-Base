<script setup lang="ts">
import { computed, watch } from 'vue'
import { ChevronRight, FileText } from '@lucide/vue'
import type { TreeItem } from '#shared/types/wiki'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ancestorsOf, folderIcon, folderLabel, navIcon, sectionIcon } from '~/utils/sidebarNav'

defineOptions({ name: 'AppSidebarTree' })

const props = withDefaults(defineProps<{
  items?: TreeItem[]
  depth?: number
  /** Px taken off every row's indent: the rail's popovers start a level deep. */
  indentOffset?: number
}>(), {
  depth: 0,
  indentOffset: 0,
})

const isRoot = props.items === undefined
const route = useRoute()

// Only the root instance fetches; every nested instance receives `items` as a prop.
const tree = isRoot ? useTree().data : null
const entries = computed<TreeItem[]>(() => props.items ?? tree?.value ?? [])
const indentPx = computed(() => 12 + props.depth * 16 - props.indentOffset)

// Expansion + "has ever been opened" persist globally so state survives remounts.
const expanded = useState<Record<string, boolean>>('shell:tree', () => ({}))
const opened = useState<Record<string, boolean>>('shell:tree:opened', () => ({}))

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

function setOpen(id: string, value: boolean): void {
  expanded.value[id] = value
  if (value)
    opened.value[id] = true
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
            <AppSidebarTree :items="item.children" :depth="depth + 1" :indent-offset="indentOffset" />
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
            <AppSidebarTree :items="item.children" :depth="depth + 1" :indent-offset="indentOffset" />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </template>
  </div>
</template>
