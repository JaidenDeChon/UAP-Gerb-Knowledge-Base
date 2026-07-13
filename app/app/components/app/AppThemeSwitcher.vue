<script setup lang="ts">
import type { Component } from 'vue'
import { computed, ref } from 'vue'
import { Check, ChevronsUpDown, CloudMoon, CloudSun, Moon, Sun } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { THEMES, useTheme, type ThemeId } from '~/composables/useTheme'

const props = withDefaults(defineProps<{ variant?: 'icon' | 'block' }>(), {
  variant: 'icon',
})

const { theme, setTheme, current } = useTheme()
const open = ref(false)

const THEME_ICON: Record<ThemeId, Component> = {
  light: Sun,
  sepia: CloudSun,
  dim: CloudMoon,
  dark: Moon,
}
const DARK = new Set<ThemeId>(['dark', 'dim'])

const currentIcon = computed<Component>(() => THEME_ICON[current.value.id] ?? Sun)
const align = computed<'start' | 'end'>(() => (props.variant === 'block' ? 'start' : 'end'))
const side = computed<'top' | 'bottom'>(() => (props.variant === 'block' ? 'top' : 'bottom'))

function schemeFor(id: ThemeId): 'light' | 'dark' {
  return DARK.has(id) ? 'dark' : 'light'
}

function select(id: ThemeId): void {
  setTheme(id)
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        v-if="variant === 'block'"
        variant="outline"
        size="sm"
        class="w-full justify-between"
        aria-label="Change theme"
      >
        <span class="flex items-center gap-2">
          <component :is="currentIcon" class="size-4" />
          <span>{{ current.label }}</span>
        </span>
        <ChevronsUpDown class="size-4 opacity-60" />
      </Button>
      <Button
        v-else
        variant="ghost"
        size="icon"
        aria-label="Change theme"
      >
        <component :is="currentIcon" class="size-5" />
      </Button>
    </PopoverTrigger>

    <PopoverContent :align="align" :side="side" :side-offset="8" class="w-[330px] p-3">
      <!-- auto-rows-fr: "less-light · warm paper" wraps to two lines and would
           otherwise make the top row taller than the bottom one. -->
      <div role="group" aria-label="Choose theme" class="grid auto-rows-fr grid-cols-2 gap-2.5">
        <button
          v-for="t in THEMES"
          :key="t.id"
          type="button"
          :data-theme="t.id"
          :aria-pressed="t.id === theme"
          :style="{ colorScheme: schemeFor(t.id) }"
          class="group relative flex flex-col overflow-hidden rounded-lg border bg-background text-left text-foreground transition-shadow duration-fast ease-standard hover:shadow-sm"
          :class="t.id === theme ? 'ring-2 ring-primary ring-offset-2 ring-offset-popover' : ''"
          @click="select(t.id)"
        >
          <span
            v-if="t.id === theme"
            class="absolute right-2 top-2 z-10 grid size-[18px] place-items-center rounded-full bg-primary text-primary-foreground shadow-sm"
            aria-hidden="true"
          >
            <Check class="size-3" />
          </span>

          <span class="block px-3.5 py-3">
            <span class="block font-display text-[14px] font-bold tracking-[-0.01em]">{{ t.label }}</span>
          </span>

          <span class="mt-auto flex flex-col gap-2 px-3.5 pb-3.5">
            <span class="rounded-md bg-primary px-2.5 py-[7px] text-center text-xs font-medium text-primary-foreground">Action</span>
            <span class="flex gap-1.5">
              <span class="h-5 flex-1 rounded-[5px] border bg-card" />
              <span class="h-5 flex-1 rounded-[5px] border bg-muted" />
              <span class="h-5 flex-1 rounded-[5px] border bg-foreground" />
            </span>
          </span>
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
