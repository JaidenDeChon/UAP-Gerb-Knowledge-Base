<script setup lang="ts">
const props = withDefaults(
  defineProps<{ title?: string, tone?: 'default' | 'accent' }>(),
  { title: '', tone: 'default' },
)
</script>

<template>
  <section
    class="my-7 overflow-hidden rounded-lg border"
    :class="props.tone === 'accent' ? 'border-primary/60' : 'border-border'"
  >
    <header
      v-if="props.title"
      class="border-b px-4 py-2"
      :class="props.tone === 'accent'
        ? 'border-primary/60 bg-primary/10 text-primary'
        : 'border-border bg-muted/40 text-muted-foreground'"
    >
      <span class="font-mono text-[11px] font-bold uppercase tracking-[0.09em]">
        {{ props.title }}
      </span>
    </header>
    <div class="panel-body px-4 py-3.5">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.panel-body :deep(p:first-child) { margin-block-start: 0; }
.panel-body :deep(p:last-child) { margin-block-end: 0; }
</style>
