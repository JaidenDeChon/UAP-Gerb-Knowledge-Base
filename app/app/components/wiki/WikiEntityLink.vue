<script setup lang="ts">
import type { NoteRef } from '#shared/types/wiki'
import { tintFor } from '@/utils/category'

const props = defineProps<{ name: string, refData?: NoteRef }>()

const tint = computed(() => props.refData ? tintFor(props.refData.category) : undefined)
</script>

<template>
  <NuxtLink
    v-if="props.refData"
    :to="props.refData.path"
    data-wiki-link
    class="ufo-entity-link"
    :style="{ '--tint': tint }"
  >
    {{ props.name }}
  </NuxtLink>
  <span v-else>{{ props.name }}</span>
</template>

<style scoped>
/* Unlayered so it outranks the global `a[data-wiki-link]` primary tint in
   main.css — these links are category-coloured, not accent-coloured. */
.ufo-entity-link {
  color: var(--tint);
  text-decoration: none;
  transition: opacity var(--dur-fast) var(--ease-standard);
}
.ufo-entity-link:hover {
  opacity: 0.75;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
