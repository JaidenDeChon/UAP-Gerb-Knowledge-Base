<script setup lang="ts">
import type { OrgNode } from '@/components/wiki/OrgChartNode.vue'

const props = defineProps<{
  root?: OrgNode
  /** Optional line under the chart; also printed in the exported image. */
  caption?: string
}>()

/** Every name in the tree, so one resolve request covers the whole chart. */
function names(node: OrgNode | undefined): string[] {
  if (!node) return []
  return [node.name, ...(node.children ?? []).flatMap(names)]
}

const { refs } = useWikiResolve(() => names(props.root))

/** Dialog title and file name: "<root> org chart". */
const label = computed(() => `${props.root?.name.trim() ?? ''} org chart`.trim())
</script>

<template>
  <!-- Toolbar (Expand + Download), scroller, caption, dialog and PNG export
       all come from the shared `wiki/DiagramFrame.vue`. -->
  <WikiDiagramFrame v-if="props.root" :label="label" kind="org chart" :caption="props.caption">
    <!-- `wiki/OrgChartNode.vue`'s directory-prefixed auto-import name is
         `WikiOrgChartNode` (see the note in that file). -->
    <WikiOrgChartNode :node="props.root" :refs="refs" />
  </WikiDiagramFrame>
</template>
