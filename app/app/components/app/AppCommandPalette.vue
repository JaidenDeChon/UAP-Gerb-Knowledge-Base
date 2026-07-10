<script setup lang="ts">
import type { Component } from 'vue'
import { computed, defineComponent, ref, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import {
  Atom,
  Building2,
  CalendarClock,
  Clapperboard,
  Compass,
  Crosshair,
  FileText,
  MapPin,
  Radar,
  Users,
} from '@lucide/vue'
import {
  CATEGORY_ICON,
  CATEGORY_ORDER,
  type Category,
  type GraphNode,
} from '#shared/types/wiki'
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  useCommand,
} from '@/components/ui/command'

interface Group {
  category: Category
  items: GraphNode[]
  more: number
}

const MAX_PER_GROUP = 8
const MAX_TOTAL = 50

const open = useCommandOpen()
const { data: graph } = useGraph()
const query = ref('')

// The reka Command owns the input state; mirror it into our own reactive query so
// we drive the ranking/caps ourselves. Rendered only inside <Command>'s provider.
const SearchBridge = defineComponent({
  name: 'CommandSearchBridge',
  setup() {
    const { filterState } = useCommand()
    watch(
      () => filterState.search,
      (value) => {
        query.value = value
      },
      { immediate: true },
    )
    return () => null
  },
})

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

function categoryIcon(category: Category): Component {
  return ICONS[CATEGORY_ICON[category]] ?? FileText
}

// Degree-sorted pool per category — also the "empty query" ordering.
const byCategory = computed(() => {
  const map = new Map<Category, GraphNode[]>()
  for (const node of graph.value?.nodes ?? []) {
    const arr = map.get(node.c)
    if (arr)
      arr.push(node)
    else
      map.set(node.c, [node])
  }
  for (const arr of map.values())
    arr.sort((a, b) => b.d - a.d || a.l.localeCompare(b.l))
  return map
})

// Lowercase and strip diacritics, mirroring the vault's own resolver, so an
// unaccented query ("daniken") still reaches accented labels ("Erich von Däniken").
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

// -1 no match · 0 prefix · 1 word-boundary · 2 substring. Both sides are folded,
// so `q` passed in must already be folded to match the folded label.
function rankOf(label: string, q: string): number {
  const l = fold(label)
  const idx = l.indexOf(q)
  if (idx === -1)
    return -1
  if (idx === 0)
    return 0
  const code = l.charCodeAt(idx - 1)
  const isAlnum = (code >= 48 && code <= 57) || (code >= 97 && code <= 122)
  return isAlnum ? 2 : 1
}

// Match against the raw (untrimmed) input so this set never disagrees with the
// reka Command's own substring filter, which would leave empty group headings.
const groups = computed<Group[]>(() => {
  const q = fold(query.value)
  const out: Group[] = []
  let total = 0

  for (const category of CATEGORY_ORDER) {
    const pool = byCategory.value.get(category)
    if (!pool || pool.length === 0)
      continue

    let matched: GraphNode[]
    if (!q) {
      matched = pool
    }
    else {
      matched = pool
        .map(node => ({ node, rank: rankOf(node.l, q) }))
        .filter(entry => entry.rank >= 0)
        .sort((a, b) => a.rank - b.rank || b.node.d - a.node.d || a.node.l.localeCompare(b.node.l))
        .map(entry => entry.node)
    }
    if (matched.length === 0)
      continue

    const room = Math.min(MAX_PER_GROUP, MAX_TOTAL - total)
    if (room <= 0)
      break

    const items = matched.slice(0, room)
    total += items.length
    out.push({ category, items, more: matched.length - items.length })
  }
  return out
})

// Kept in step with the item's own text so reka's secondary substring filter and
// our own visibility never disagree (which would leave an empty group heading).
const showMap = computed(() => {
  const q = fold(query.value)
  return q === '' || 'field map (all entries)'.includes(q)
})

const isEmpty = computed(
  () => query.value !== '' && !showMap.value && groups.value.length === 0,
)

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

useEventListener('keydown', (event: KeyboardEvent) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k')
    return
  // Ignore ⌘K typed into an unrelated editable field, but still let it toggle the
  // palette closed — while open, focus is trapped in the palette's own input, so
  // the target is always editable and this must not swallow the dismiss gesture.
  if (!open.value && isEditable(event.target))
    return
  event.preventDefault()
  open.value = !open.value
})

function go(path: string): void {
  open.value = false
  navigateTo(path)
}
</script>

<template>
  <CommandDialog v-model:open="open">
    <SearchBridge />
    <CommandInput placeholder="Search entries…" />
    <CommandList>
      <div v-if="isEmpty" class="px-2 py-6 text-center text-sm text-muted-foreground">
        No results found.
      </div>

      <CommandGroup v-if="showMap" heading="Navigate">
        <CommandItem value="/" @select="go('/')">
          <Radar />
          <span class="flex-1 truncate">Field Map (all entries)</span>
        </CommandItem>
      </CommandGroup>

      <CommandGroup v-for="grp in groups" :key="grp.category" :heading="grp.category">
        <CommandItem
          v-for="node in grp.items"
          :key="node.p"
          :value="node.p"
          @select="go(node.p)"
        >
          <component :is="categoryIcon(node.c)" />
          <span class="flex-1 truncate">{{ node.l }}</span>
        </CommandItem>
        <div
          v-if="grp.more > 0"
          class="px-2 py-1.5 font-mono text-[11px] tracking-[0.02em] text-muted-foreground"
        >
          + {{ grp.more }} more
        </div>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>
