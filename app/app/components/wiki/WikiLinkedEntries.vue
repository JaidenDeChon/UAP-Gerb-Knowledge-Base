<script setup lang="ts">
import type { NoteRef } from '#shared/types/wiki'
import { CornerUpLeft, FileText } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{ path: string }>()

const { data } = useNoteLinks(() => props.path)

const LIMIT = 40

const outgoing = computed<NoteRef[]>(() => data.value?.outgoing ?? [])
const backlinks = computed<NoteRef[]>(() => data.value?.backlinks ?? [])

const showAllOut = ref(false)
const showAllBack = ref(false)

// The entry page reuses this component across notes; forget expansion on nav.
watch(() => props.path, () => {
  showAllOut.value = false
  showAllBack.value = false
})

const shownOut = computed(() => (showAllOut.value ? outgoing.value : outgoing.value.slice(0, LIMIT)))
const shownBack = computed(() => (showAllBack.value ? backlinks.value : backlinks.value.slice(0, LIMIT)))
</script>

<template>
  <div v-if="outgoing.length || backlinks.length" class="flex flex-col gap-10">
    <section v-if="outgoing.length">
      <h2 class="mb-3.5 font-display text-[20px] font-semibold uppercase tracking-[0.04em] text-foreground">
        Linked entries
      </h2>
      <div class="flex flex-wrap gap-2">
        <Button
          v-for="ref in shownOut"
          :key="ref.path"
          as-child
          variant="outline"
          size="sm"
        >
          <NuxtLink :to="ref.path">
            <FileText class="size-3.5" />
            {{ ref.title }}
          </NuxtLink>
        </Button>
      </div>
      <Button
        v-if="outgoing.length > LIMIT"
        variant="ghost"
        size="sm"
        class="mt-3"
        @click="showAllOut = !showAllOut"
      >
        {{ showAllOut ? 'Show fewer' : `Show all ${outgoing.length}` }}
      </Button>
    </section>

    <section v-if="backlinks.length">
      <h2 class="mb-3.5 font-display text-[20px] font-semibold uppercase tracking-[0.04em] text-foreground">
        Backlinks
      </h2>
      <div class="flex flex-wrap gap-2">
        <Button
          v-for="ref in shownBack"
          :key="ref.path"
          as-child
          variant="outline"
          size="sm"
        >
          <NuxtLink :to="ref.path">
            <CornerUpLeft class="size-3.5" />
            {{ ref.title }}
          </NuxtLink>
        </Button>
      </div>
      <Button
        v-if="backlinks.length > LIMIT"
        variant="ghost"
        size="sm"
        class="mt-3"
        @click="showAllBack = !showAllBack"
      >
        {{ showAllBack ? 'Show fewer' : `Show all ${backlinks.length}` }}
      </Button>
    </section>
  </div>
</template>
