<script setup lang="ts">
import type { GraphNode } from '#shared/types/wiki'
import { Maximize2, X } from '@lucide/vue'
import { buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * The article's local map, in the content flow: the current note's
 * neighbourhood in the knowledge graph, rendered beneath the article body and
 * above the linked-entries section. Square on phones, 3:2 from tablet width
 * up. Replaces the old floating/draggable dock.
 *
 * Hidden entirely when the note isn't in the graph (e.g. video transcripts):
 * GraphMap would otherwise fall back to rendering the whole site map inside
 * the widget. The user preference from the sidebar ("Show local map on
 * articles") gates it too, and the header's × writes that same preference.
 */
const props = defineProps<{ path: string }>()

const localMapEnabled = useLocalMapEnabled()
const { data: graph } = useGraph()

const inGraph = computed(() =>
  graph.value?.nodes.some(n => n.p === props.path) ?? false)

const show = computed(() => localMapEnabled.value && inGraph.value)

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
        <div class="flex items-center gap-0.5">
          <button
            type="button"
            class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Expand the local map"
            @click="dialogOpen = true"
          >
            <Maximize2 :size="13" />
          </button>
          <button
            type="button"
            class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Hide the local map on articles"
            @click="localMapEnabled = false"
          >
            <X :size="14" />
          </button>
        </div>
      </div>

      <div class="relative aspect-square md:aspect-[3/2]">
        <GraphMap minimized :active-path="props.path" class="absolute inset-0" @select="onSelect" />
      </div>
    </div>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="max-w-[min(920px,calc(100vw-2rem))] gap-3">
        <DialogHeader>
          <DialogTitle class="font-mono text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Local map
          </DialogTitle>
          <DialogDescription class="sr-only">
            The neighbourhood of the current entry in the knowledge graph.
          </DialogDescription>
        </DialogHeader>

        <div class="h-[68vh] overflow-hidden rounded-lg border border-primary/70">
          <GraphMap v-if="dialogOpen" minimized :active-path="props.path" class="size-full" @select="onDialogSelect" />
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
