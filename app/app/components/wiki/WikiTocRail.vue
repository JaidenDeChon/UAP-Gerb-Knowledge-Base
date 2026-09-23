<script setup lang="ts">
import type { TocLink } from '@/utils/content'
import { hasTocRail, tocLinks } from '@/utils/content'

const props = defineProps<{ toc?: { links?: TocLink[] } | null }>()

/** The note's h2 spine — see `tocLinks` for why nothing deeper is listed. */
const links = computed<TocLink[]>(() => tocLinks(props.toc))
/** Single source of truth for "does a rail exist" — shared with the page,
 *  which uses it to decide whether to reserve this component's layout column. */
const hasRail = computed(() => hasTocRail(props.toc))

const activeId = ref<string | null>(null)
let observer: IntersectionObserver | null = null

function buildObserver() {
  observer?.disconnect()
  observer = null
  if (!links.value.length) return

  // rootMargin pulls the trigger line to the upper third so a heading becomes
  // active as it reaches reading position, not when it touches the viewport edge.
  // The page scrolls inside <main> (see layouts/default.vue), not the window —
  // but <main> is itself within the viewport, so the default (viewport) root
  // still tracks its scroll position correctly.
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter(e => e.isIntersecting)
      if (visible.length) activeId.value = visible[0]!.target.id
    },
    { rootMargin: '0px 0px -66% 0px', threshold: 0 },
  )
  for (const link of links.value) {
    const el = document.getElementById(link.id)
    if (el) observer.observe(el)
  }
}

onMounted(buildObserver)

// `[...slug].vue` is keyed by route path (definePageMeta({ key: route =>
// route.path })), so Vue tears down and remounts this component on every note
// change rather than patching it in place — onMounted already fires again for
// each new page. Watching `toc` too guards against any future change to that
// keying strategy leaving the observer attached to a previous page's headings.
watch(() => props.toc, buildObserver)

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <nav v-if="hasRail" class="ufo-toc" aria-label="On this page">
    <div class="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      On this page
    </div>
    <ul class="flex flex-col gap-0.5 border-l border-border">
      <li v-for="link in links" :key="link.id">
        <a
          :href="`#${link.id}`"
          class="ufo-toc-link"
          :class="{ 'is-active': activeId === link.id }"
        >
          {{ link.text }}
        </a>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
/* Sticking is the page's job: its <aside> is the sticky box (see
   wiki/[...slug].vue). This only caps the height, under the 56px header and
   the aside's 40px top padding, so a long rail scrolls itself. */
.ufo-toc {
  max-height: calc(100vh - 56px - 40px - 24px);
  overflow-y: auto;
}
.ufo-toc-link {
  display: block;
  margin-inline-start: -1px;
  border-inline-start: 1px solid transparent;
  padding-block: 3px;
  padding-inline-start: 10px;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  transition: color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard),
    font-weight var(--dur-fast) var(--ease-standard);
}
.ufo-toc-link:hover { color: hsl(var(--foreground)); }
/* Active marker: --primary colour + border, plus a non-colour weight bump so
   the active section still reads under greyscale/colour-blind viewing
   (same principle as the timeline filter chips' active state). */
.ufo-toc-link.is-active {
  border-inline-start-color: hsl(var(--primary));
  color: hsl(var(--primary));
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .ufo-toc-link {
    transition: none;
  }
}
</style>
