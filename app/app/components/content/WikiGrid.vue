<script setup lang="ts">
const props = withDefaults(defineProps<{ cols?: number | string }>(), { cols: 2 })

// MDC passes attributes as strings; clamp to a sane range.
const cols = computed(() => {
  const n = Number(props.cols)
  return Number.isFinite(n) ? Math.min(4, Math.max(1, Math.trunc(n))) : 2
})

const CLASSES: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
}
</script>

<template>
  <div class="my-6 grid gap-3" :class="CLASSES[cols]">
    <slot />
  </div>
</template>
