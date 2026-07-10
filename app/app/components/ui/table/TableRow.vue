<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <tr
    data-slot="table-row"
    :class="cn('border-b data-[state=selected]:bg-muted transition-colors duration-fast', props.class)"
  >
    <slot />
  </tr>
</template>
