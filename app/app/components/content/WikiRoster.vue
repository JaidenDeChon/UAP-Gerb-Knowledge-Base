<script setup lang="ts">
import { tintFor } from '@/utils/category'

interface Entry { name: string, role?: string, note?: string }

const props = withDefaults(defineProps<{ entries?: Entry[] }>(), { entries: () => [] })

const { refs } = useWikiResolve(() => props.entries.map(e => e.name))

function categoryOf(name: string): string {
  return refs.value.get(name.trim())?.category ?? 'Unlinked'
}
</script>

<template>
  <div v-if="props.entries.length" class="my-7 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
    <article
      v-for="entry in props.entries"
      :key="entry.name"
      class="relative overflow-hidden rounded-lg border border-border bg-card py-3 pl-4 pr-3.5"
    >
      <!-- Category spine. -->
      <span
        class="absolute inset-y-0 left-0 w-[3px]"
        :style="{ background: tintFor(refs.get(entry.name.trim())?.category) }"
        aria-hidden="true"
      />
      <div class="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {{ categoryOf(entry.name) }}
      </div>
      <h4 class="mt-1 font-display text-[17px] font-semibold leading-6">
        <WikiEntityLink :name="entry.name" :ref-data="refs.get(entry.name.trim())" />
      </h4>
      <p v-if="entry.role" class="mt-0.5 font-sans text-[13px] leading-5 text-muted-foreground">
        {{ entry.role }}
      </p>
      <p v-if="entry.note" class="mt-1.5 font-sans text-[14px] leading-6 text-foreground">
        {{ entry.note }}
      </p>
    </article>
  </div>
</template>
