<script setup lang="ts">
interface Stat { value: string | number, label: string, hint?: string }

const props = withDefaults(defineProps<{ stats?: Stat[] }>(), { stats: () => [] })
</script>

<template>
  <div
    v-if="props.stats.length"
    class="my-7 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4"
  >
    <div
      v-for="(stat, i) in props.stats"
      :key="i"
      class="bg-card px-4 py-4"
    >
      <div class="font-display text-[34px] font-bold leading-none tracking-[0.01em] text-foreground">
        {{ stat.value }}
      </div>
      <div class="mt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {{ stat.label }}
      </div>
      <div v-if="stat.hint" class="mt-1 font-sans text-[12px] leading-4 text-muted-foreground">
        {{ stat.hint }}
      </div>
    </div>
  </div>
</template>
