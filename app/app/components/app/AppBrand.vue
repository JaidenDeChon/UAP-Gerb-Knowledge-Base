<script setup lang="ts">
// Pure CSS lockup: a 30x30 ring with a glowing green contact dot + the wordmark.
// `compact` fades the wordmark out, leaving the ring: the collapsed sidebar's logo.
defineProps<{ compact?: boolean }>()
</script>

<template>
  <div class="flex items-center gap-2.5 select-none">
    <span class="grid size-[30px] shrink-0 place-items-center rounded-full border-2 border-primary">
      <span class="size-[10px] rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
    </span>
    <span
      class="whitespace-nowrap font-display text-[18px] font-bold uppercase leading-none tracking-[0.1em] text-foreground transition-opacity duration-base ease-standard"
      :class="compact ? 'opacity-0' : 'opacity-100'"
      :aria-hidden="compact || undefined"
    >
      UAPG<span class="text-primary">DB</span>
    </span>
  </div>
</template>
