<script setup lang="ts">
import type { NuxtError } from '#app'
import { Button } from '@/components/ui/button'

const props = defineProps<{ error: NuxtError }>()

useThemeHead()

const code = computed(() => props.error?.statusCode ?? 500)
const message = computed(
  () =>
    props.error?.statusMessage
    || (code.value === 404 ? 'This entry is not in the archive.' : 'Something went wrong.'),
)

function backToMap(): void {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 text-center">
    <div class="flex items-center gap-2.5">
      <span
        class="grid size-[30px] shrink-0 place-items-center rounded-full border-2 border-primary"
      >
        <span class="size-2.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
      </span>
      <span class="font-display text-lg font-bold uppercase tracking-[0.1em] text-foreground">
        UAPG<span class="text-primary">DB</span>
      </span>
    </div>

    <div class="flex flex-col items-center gap-3">
      <p class="font-display text-[clamp(72px,16vw,128px)] font-extrabold uppercase leading-none tracking-[0.02em] text-foreground">
        {{ code }}
      </p>
      <p class="max-w-md font-sans text-lg text-muted-foreground">
        {{ message }}
      </p>
    </div>

    <Button variant="default" size="lg" @click="backToMap">
      Back to the map
    </Button>
  </div>
</template>
