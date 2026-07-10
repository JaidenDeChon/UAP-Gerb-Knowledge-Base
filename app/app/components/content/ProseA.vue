<script setup lang="ts">
import type { NotePreview } from '#shared/types/wiki'
import { ArrowUpRight } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { CardTitle } from '@/components/ui/card'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{ href?: string, target?: string }>(),
  { href: '', target: undefined },
)

const isInternal = computed(() => props.href.startsWith('/'))

const preview = ref<NotePreview | null>(null)
const loading = ref(false)
let started = false

async function load(open: boolean): Promise<void> {
  if (!open || started || !isInternal.value) return
  started = true
  loading.value = true
  try {
    preview.value = await fetchNotePreview(props.href)
  }
  catch {
    // Swallow — the link still works, we just skip the preview.
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <HoverCard v-if="isInternal" :open-delay="200" :close-delay="120" @update:open="load">
    <HoverCardTrigger as-child>
      <NuxtLink
        :to="href"
        data-wiki-link
        class="text-primary underline-offset-2 decoration-primary/40 hover:underline"
      >
        <slot />
      </NuxtLink>
    </HoverCardTrigger>

    <HoverCardContent v-if="loading || preview">
      <div v-if="preview" class="flex flex-col gap-2">
        <CardTitle class="text-[16px] leading-5 tracking-normal">
          {{ preview.title }}
        </CardTitle>
        <div>
          <Badge variant="outline">{{ preview.category }}</Badge>
        </div>
        <p v-if="preview.lead" class="line-clamp-4 text-[13px] leading-5 text-muted-foreground">
          {{ preview.lead }}
        </p>
      </div>

      <div v-else class="flex flex-col gap-2">
        <div class="h-4 w-2/3 animate-pulse rounded-sm bg-muted" />
        <div class="h-4 w-16 animate-pulse rounded-sm bg-muted" />
        <div class="h-3 w-full animate-pulse rounded-sm bg-muted" />
        <div class="h-3 w-4/5 animate-pulse rounded-sm bg-muted" />
      </div>
    </HoverCardContent>
  </HoverCard>

  <a
    v-else
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex items-baseline gap-0.5 text-primary underline-offset-2 decoration-primary/40 hover:underline"
  >
    <slot />
    <ArrowUpRight class="size-3 self-center" />
  </a>
</template>
