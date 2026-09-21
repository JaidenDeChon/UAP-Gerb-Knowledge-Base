<script setup lang="ts">
interface Stat { value: string | number, label: string, hint?: string }

const props = withDefaults(defineProps<{ stats?: Stat[] }>(), { stats: () => [] })
</script>

<template>
  <div
    v-if="props.stats.length"
    class="ufo-stat-strip my-7 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4"
  >
    <div
      v-for="(stat, i) in props.stats"
      :key="i"
      class="ufo-stat-cell bg-card px-3.5 py-3.5"
      :class="{ 'ufo-stat-cell--lead': i === 0 }"
    >
      <div class="ufo-stat-value font-display font-bold leading-none tracking-[0.01em] text-foreground">
        {{ stat.value }}
      </div>
      <div class="mt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        {{ stat.label }}
      </div>
      <div v-if="stat.hint" class="mt-1 font-mono text-[11px] leading-4 text-muted-foreground/80">
        {{ stat.hint }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Denser, more graphic than a generic stat card: bigger numerals, the lead
   figure (first cell) given extra emphasis so the strip reads left-to-right
   as "headline number, then supporting figures" rather than four equal
   boxes. gap-px over bg-border (Tailwind classes above) keeps the
   hairline-divider technique from the parent grid — no per-cell border maths. */
.ufo-stat-value {
  font-size: clamp(26px, 3.4vw, 34px);
}
.ufo-stat-cell--lead .ufo-stat-value {
  font-size: clamp(30px, 4.2vw, 42px);
  color: hsl(var(--primary));
}
</style>
