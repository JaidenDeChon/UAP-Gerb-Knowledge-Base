<script setup lang="ts">
import type { WorldPlace } from '#shared/types/wiki'
import { ArrowRight, MapPin, X } from '@lucide/vue'
import { buttonVariants } from '@/components/ui/button'
import { tintFor } from '@/utils/category'
import { CONTINENT_BY_ID, formatPlaceType } from '@/utils/world'

/**
 * The selected place, over the globe's corner: where it is, what kind of
 * place it is, the opening of its page, and the way to that page.
 */
const props = defineProps<{ place: WorldPlace }>()
defineEmits<{ close: [] }>()

const type = computed(() => formatPlaceType(props.place.type))
const continent = computed(() => CONTINENT_BY_ID.get(props.place.continent)?.name ?? '')

function degrees(v: number, pos: string, neg: string): string {
  return `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`
}
const coords = computed(() => `${degrees(props.place.lat, 'N', 'S')}, ${degrees(props.place.lon, 'E', 'W')}`)
</script>

<template>
  <article class="ufo-place-card" :aria-label="`Selected: ${place.name}`">
    <header class="flex items-start gap-3">
      <span class="ufo-place-icon" :style="{ '--tint': tintFor('Locations') }" aria-hidden="true">
        <MapPin class="size-4" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="font-mono text-[10.5px] font-semibold uppercase leading-4 tracking-[0.1em] text-muted-foreground">
          {{ continent }}<template v-if="type">
            · {{ type }}
          </template>
        </p>
        <h2 class="mt-0.5 font-display text-[19px] font-bold uppercase leading-6 tracking-[0.015em] text-foreground">
          {{ place.name }}
        </h2>
      </div>
      <button type="button" class="ufo-place-close" aria-label="Clear selection" @click="$emit('close')">
        <X class="size-4" />
      </button>
    </header>

    <p v-if="place.lead" class="mt-2.5 line-clamp-4 font-sans text-[13.5px] leading-[1.55] text-foreground/85">
      {{ place.lead }}
    </p>

    <footer class="mt-3 flex items-center justify-between gap-3">
      <span class="font-mono text-[11px] tracking-[0.04em] text-muted-foreground">{{ coords }}</span>
      <NuxtLink :to="place.path" :class="buttonVariants({ size: 'sm' })">
        Open page
        <ArrowRight />
      </NuxtLink>
    </footer>
  </article>
</template>

<style scoped>
.ufo-place-card {
  width: 100%;
  padding: 14px 14px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card) / 0.92);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(10px);
}
.ufo-place-icon {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  margin-top: 1px;
  border-radius: var(--radius-lg);
  color: var(--tint);
  background: color-mix(in srgb, var(--tint) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--tint) 35%, transparent);
}
.ufo-place-close {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  margin: -4px -4px 0 0;
  border-radius: var(--radius-md);
  color: hsl(var(--muted-foreground));
  transition: color var(--duration-fast) ease, background-color var(--duration-fast) ease;
}
.ufo-place-close:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--accent));
}
.ufo-place-close:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 1px;
}
@media (prefers-reduced-motion: no-preference) {
  .ufo-place-card {
    animation: ufo-place-in var(--duration-slow) var(--ease-out);
  }
}
@keyframes ufo-place-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
</style>
