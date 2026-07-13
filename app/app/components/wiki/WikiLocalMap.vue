<script setup lang="ts">
import type { GraphNode } from '#shared/types/wiki'
import { Maximize2 } from '@lucide/vue'
import { LOCAL_MAX_NODES } from '~/utils/graph'
import { buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * The article's local map, in the content flow: the current note's
 * neighbourhood in the knowledge graph, rendered right above the article
 * body. Square on phones, 3:2 from tablet width up.
 *
 * Hidden entirely when the note isn't in the graph (e.g. video transcripts):
 * GraphMap would otherwise fall back to rendering the whole site map inside
 * the widget.
 */
const props = defineProps<{ path: string }>()

const { data: graph } = useGraph()

const show = computed(() =>
  graph.value?.nodes.some(n => n.p === props.path) ?? false)

/** How many entries this note links — the size of the ring the map is drawing. */
const degree = computed(() => graph.value?.nodes.find(n => n.p === props.path)?.d ?? 0)

/**
 * What the INLINE map is leaving out. Its budget goes to the 1-hop ring first
 * (most-connected first) before any 2-hop expansion, so the neighbours it shows
 * is exactly `min(degree, budget)` — no estimate. The index notes are wildly
 * over budget (People MOC links 246 entries and can show 17), and saying
 * nothing made the map look broken rather than clipped. Null once nothing is
 * being left out — most notes fit. The expanded dialog draws the whole ring, so
 * it never truncates and never shows this.
 */
const truncation = computed<{ shown: number, total: number } | null>(() => {
  const total = degree.value
  const shown = Math.min(total, LOCAL_MAX_NODES - 1) // the note itself takes a slot
  return total > shown ? { shown, total } : null
})

const dialogOpen = ref(false)

function onSelect(node: GraphNode): void {
  navigateTo(node.p)
}

function onDialogSelect(node: GraphNode): void {
  dialogOpen.value = false
  navigateTo(node.p)
}
</script>

<template>
  <section v-if="show" aria-label="Local map" class="mb-10">
    <div class="overflow-hidden rounded-lg border border-primary/70">
      <div class="flex items-center justify-between gap-2 border-b border-border/50 bg-card px-3 py-2">
        <span class="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Local map
        </span>
        <div class="flex items-center gap-2">
          <span
            v-if="truncation"
            class="font-mono text-[11px] uppercase tabular-nums tracking-[0.08em] text-muted-foreground/70"
            :title="`This note links ${truncation.total} entries; the map shows its ${truncation.shown} most-connected.`"
          >showing {{ truncation.shown }}/{{ truncation.total }}</span>
          <button
            type="button"
            class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Expand the local map"
            @click="dialogOpen = true"
          >
            <Maximize2 :size="13" />
          </button>
        </div>
      </div>

      <div class="relative aspect-square md:aspect-[3/2]">
        <GraphMap minimized :active-path="props.path" class="absolute inset-0" @select="onSelect" />
      </div>
    </div>

    <Dialog v-model:open="dialogOpen">
      <!-- The base DialogContent caps itself at `sm:max-w-lg`. tailwind-merge keys
           on the variant, so an unprefixed max-w never overrides it above `sm` —
           the override has to carry the `sm:` too, or the dialog silently stays
           512px wide. Widen toward the viewport so the full ring has room. -->
      <DialogContent class="gap-3 sm:max-w-[min(1600px,calc(100vw-4rem))]">
        <DialogHeader>
          <DialogTitle class="font-mono text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Local map
            <span v-if="degree" class="ml-1 font-normal tabular-nums text-muted-foreground/70">
              — showing all {{ degree }} links
            </span>
          </DialogTitle>
          <DialogDescription class="sr-only">
            The neighbourhood of the current entry in the knowledge graph.
          </DialogDescription>
        </DialogHeader>

        <div class="h-[min(78vh,calc(100vw-2rem))] overflow-hidden rounded-lg border border-primary/70">
          <GraphMap v-if="dialogOpen" minimized full :active-path="props.path" class="size-full" @select="onDialogSelect" />
        </div>

        <DialogFooter>
          <NuxtLink :to="'/map'" :class="buttonVariants({ size: 'sm' })" @click="dialogOpen = false">
            Open site map
          </NuxtLink>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
