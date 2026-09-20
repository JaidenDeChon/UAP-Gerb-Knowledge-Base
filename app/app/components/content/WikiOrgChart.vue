<script setup lang="ts">
import type { OrgNode } from '@/components/wiki/OrgChartNode.vue'

const props = defineProps<{ root?: OrgNode }>()

/** Every name in the tree, so one resolve request covers the whole chart. */
function names(node: OrgNode | undefined): string[] {
  if (!node) return []
  return [node.name, ...(node.children ?? []).flatMap(names)]
}

const { refs } = useWikiResolve(() => names(props.root))
</script>

<template>
  <div v-if="props.root" class="my-7 overflow-x-auto pb-2">
    <!-- `wiki/OrgChartNode.vue`'s directory-prefixed auto-import name is
         `WikiOrgChartNode` (see the note in that file). -->
    <WikiOrgChartNode :node="props.root" :refs="refs" />
  </div>
</template>
