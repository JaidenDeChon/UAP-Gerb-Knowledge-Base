<script setup lang="ts">
const props = withDefaults(defineProps<{ caption?: string }>(), { caption: '' })
</script>

<template>
  <figure class="my-7">
    <div class="overflow-x-auto">
      <slot />
    </div>
    <figcaption
      v-if="props.caption"
      class="mt-2.5 font-sans text-[13px] leading-5 text-muted-foreground"
    >
      {{ props.caption }}
    </figcaption>
  </figure>
</template>
