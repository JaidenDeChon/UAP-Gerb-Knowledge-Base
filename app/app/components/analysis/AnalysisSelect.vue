<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * One dropdown in the `/analyses` control bar: an outline trigger naming the
 * control and its current choice ("Kind: Contradiction"), over a radio list.
 * `''` is the "everything" option, so a filter reads as unset.
 */
const props = defineProps<{
  label: string
  options: { value: string, label: string }[]
  /** Outline the trigger in the accent colour while a choice other than `''` is set. */
  filter?: boolean
}>()

const model = defineModel<string>({ required: true })

const current = computed(() => props.options.find(o => o.value === model.value)?.label ?? props.options[0]?.label)
</script>

<template>
  <DropdownMenu :modal="false">
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        class="inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 font-sans text-[13px] text-foreground transition-colors duration-fast ease-standard hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
        :class="{ 'border-primary/60': filter && model !== '' }"
      >
        <span class="truncate">
          <span class="text-muted-foreground">{{ label }}:</span>
          {{ current }}
        </span>
        <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="min-w-[12rem] border-border">
      <DropdownMenuRadioGroup v-model="model">
        <DropdownMenuRadioItem v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
