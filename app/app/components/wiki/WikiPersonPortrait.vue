<script setup lang="ts">
import type { NotePortrait } from '#shared/types/wiki'
import { portraitAlt } from '@/utils/portrait'

/**
 * A person's portrait at the head of their own page, with its full credit.
 * Floated right by the page, beside the title and lead. The picture is a
 * freely licensed Wikimedia Commons file stored in the repo
 * (`wiki/portraits.ts`); this is where its attribution is spelled out with
 * links, as CC BY / BY-SA require. Every other surface (roster cards, hover
 * previews) carries the same credit as a tooltip.
 */
const props = defineProps<{ image: NotePortrait, name: string }>()

const author = computed(() =>
  /^unknown author$/i.test(props.image.author.trim()) ? '' : props.image.author.trim())
</script>

<template>
  <figure class="ufo-person-portrait">
    <img
      :src="image.src"
      :width="image.width"
      :height="image.height"
      :alt="portraitAlt(name)"
      decoding="async"
      class="ufo-person-portrait-img ufo-fade ufo-fade-y"
    >
    <figcaption class="ufo-person-portrait-credit">
      <a :href="image.source" target="_blank" rel="noopener noreferrer">
        <template v-if="author">Photo: {{ author }}</template>
        <template v-else>Photo</template>
      </a>
      <span aria-hidden="true"> · </span>
      <a v-if="image.licenseUrl" :href="image.licenseUrl" target="_blank" rel="noopener noreferrer license">{{ image.license }}</a>
      <span v-else>{{ image.license }}</span>
      <span aria-hidden="true"> · </span>
      <span>Wikimedia Commons</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.ufo-person-portrait {
  float: right;
  width: clamp(88px, 24vw, 168px);
  margin: 4px 0 12px clamp(14px, 3vw, 20px);
}
/* A fixed 4:5 box whatever the photo's shape (no shift as it loads),
   cover-cropped toward the face, dissolving into the page along its lower
   half with the shared `ufo-fade` mask. */
.ufo-person-portrait-img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  object-position: 50% 22%;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  --ufo-fade-y-start: 55%;
}
.ufo-person-portrait-credit {
  margin-top: 2px;
  font-family: var(--font-sans);
  font-size: 11px;
  line-height: 15px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}
.ufo-person-portrait-credit a {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: hsl(var(--border));
  text-underline-offset: 2px;
}
.ufo-person-portrait-credit a:hover,
.ufo-person-portrait-credit a:focus-visible {
  color: hsl(var(--foreground));
  text-decoration-color: currentColor;
}
</style>
