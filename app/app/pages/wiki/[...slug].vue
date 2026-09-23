<script setup lang="ts">
import type { Category } from '#shared/types/wiki'
import type { WikiPage } from '@/utils/content'
import { ChevronRight } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { firstParagraph, hasTocRail } from '@/utils/content'
import { warmContentComponents } from '@/utils/warmContentComponents'

definePageMeta({ key: route => route.path })

const route = useRoute()

// The note body loads in the browser, never on the server. @nuxt/content's
// server-side database takes seconds to come up on a cold function, and a
// server render that waits on it leaves a fresh visit staring at a blank
// screen until the first byte. So the server answers at once with the shell:
// the skeleton plus the title and share-card tags from baked data (`meta`,
// below). `lazy` makes a client-side hop paint the skeleton immediately too,
// instead of freezing on the old page while the sqlite-wasm database warms up.
// The article's content components are fetched alongside it, so it renders
// complete rather than popping blocks in after the loader has gone (see
// warmContentComponents).
const result = useAsyncData(`wiki:${route.path}`, async () => {
  const [note] = await Promise.all([
    queryCollection('wiki').path(route.path).first(),
    warmContentComponents(),
  ])
  return note
}, { lazy: true, server: false })

const { data: page, status } = result

// Title, lead and video id from the vault scan baked into the server bundle
// (`/api/meta`). It is instant, and it is what the server renders the <head>
// and a missing note's 404 from.
const metaResult = useFetch('/api/meta', {
  key: `meta:${route.path}`,
  query: { path: route.path },
  lazy: true,
})
const meta = metaResult.data

if (import.meta.server) {
  await metaResult
  if (!meta.value) {
    throw createError({ statusCode: 404, statusMessage: 'Note not found', fatal: true })
  }
}

// Client-side the query resolves after navigation, so the missing-note case is
// a settled-with-nothing watcher rather than a throw in setup. SSR watchers
// don't re-run, which is why the server keeps the throw above.
if (import.meta.client) {
  watch(status, (value) => {
    if (value === 'success' && !page.value) {
      showError({ statusCode: 404, statusMessage: 'Note not found' })
    }
  })
}

const pageTitle = usePageTitle()
const title = computed(() => page.value?.title ?? meta.value?.title)
watchEffect(() => {
  if (title.value) pageTitle.value = title.value
})
useHead({ title })

const category = computed<Category>(() =>
  page.value ? categoryFromStem(page.value.stem) : 'Root')
const isTranscript = computed(() => page.value?.stem.endsWith('/transcript') ?? false)
/** A People note's portrait, from the baked meta (see wiki/portraits.ts). */
const portrait = computed(() => (category.value === 'People' ? meta.value?.image : undefined))
const videoTitle = computed(() => (page.value ? videoTitleFromStem(page.value.stem) : null))

/**
 * A video's summary note gets the feature treatment: the hero title card in
 * place of the plain header + fact table, numbered chapters, a reading
 * progress line, and the local map moved below the body so the page opens
 * on the video rather than on graph chrome. Keyed off frontmatter alone, so
 * every video page qualifies with no authoring; transcripts stay plain.
 */
const videoId = computed(() => String(page.value?.video_id ?? '').trim())
const isFeature = computed(() => category.value === 'Videos' && !isTranscript.value && !!videoId.value)

/** The sibling transcript note's route, when this is a video summary. */
const transcriptTo = computed<string | null>(() => {
  if (!page.value) return null
  const { stem, path } = page.value
  if (/(^|\/)Videos\//.test(stem) && stem.endsWith('/summary') && path.endsWith('/summary')) {
    return path.replace(/\/summary$/, '/transcript')
  }
  return null
})


// A note's folder already renders as the green category badge, so its frontmatter
// self-tag — `person` on a People note, `video` on a Videos note, and so on — is
// pure duplication in this view. Hide it. The vault keeps the tag for Obsidian,
// which has no folder-derived badge and groups notes by exactly these tags.
const CATEGORY_SELF_TAG: Partial<Record<Category, string>> = {
  People: 'person',
  Organizations: 'organization',
  Locations: 'location',
  Concepts: 'concept',
  Events: 'event',
  Videos: 'video',
  Operations: 'operation',
  MOCs: 'moc',
}

const tags = computed<string[]>(() => {
  const selfTag = CATEGORY_SELF_TAG[category.value]
  return (page.value?.tags ?? []).filter(tag => tag.toLowerCase() !== selfTag)
})
const shownTags = computed(() => tags.value.slice(0, 6))
const extraTags = computed(() => Math.max(0, tags.value.length - 6))

const article = computed<{ lead: string, doc: WikiPage | null }>(() => {
  if (!page.value) return { lead: '', doc: null }
  const { lead, value } = splitLead(page.value.body, page.value.description)
  return { lead, doc: { ...page.value, body: { ...page.value.body, value } } }
})

// A video note that opens on a component block (a stat strip, say) has no
// lead paragraph to lift out, so the hero's standfirst falls back to the
// first paragraph wherever it sits — the same teaser the home page's
// featured card shows for this note. The body keeps the full paragraph.
const standfirst = computed(() => article.value.lead || firstParagraph(page.value?.body))

// Video pages share their own thumbnail as the social card, not the site's.
// (Declared after `standfirst`: unhead evaluates these getters synchronously
// on first run, so they must not reach into a not-yet-initialised const.)
// Until the body loads (always, during the server render), the baked meta
// stands in: a video summary is any Videos note with a video id.
const shareVideoId = computed(() => {
  if (page.value) return isFeature.value ? videoId.value : ''
  return meta.value?.category === 'Videos' ? meta.value.videoId ?? '' : ''
})
useSeoMeta({
  ogTitle: () => title.value,
  ogDescription: () => (shareVideoId.value ? (page.value ? standfirst.value : meta.value?.lead) || undefined : undefined),
  ogImage: () => (shareVideoId.value ? `https://i.ytimg.com/vi/${shareVideoId.value}/maxresdefault.jpg` : undefined),
  twitterImage: () => (shareVideoId.value ? `https://i.ytimg.com/vi/${shareVideoId.value}/maxresdefault.jpg` : undefined),
})

// WikiTocRail renders nothing under 3 headings, but its column still costs
// 200px + the row gap if the <aside> around it is unconditional — on the
// short notes that make up most of this vault, that pushes the article off
// centre for no reason. Deciding "does a rail exist" up here, from the same
// TOC data the rail itself flattens, lets the layout skip reserving that
// column rather than reserving it and rendering it empty.
const hasRail = computed(() => hasTocRail(page.value?.body?.toc))

// The <aside> is `hidden xl:block`, but leaving the flow doesn't re-centre a
// flex-row wrapper on its own — below xl the wrapper must stay byte-identical
// to the no-rail layout (`mx-auto max-w-[760px] px-8`), so the rail-only
// classes are gated behind `xl:` and only take effect once the aside itself
// is visible.
const wrapperClass = computed(() => hasRail.value
  ? 'mx-auto max-w-[760px] px-8 xl:flex xl:max-w-[1180px] xl:items-start xl:gap-10'
  : 'mx-auto max-w-[760px] px-8')
const articleClass = computed(() => hasRail.value
  ? 'pb-32 pt-10 xl:min-w-0 xl:max-w-[760px] xl:flex-1'
  : 'pb-32 pt-10')
</script>

<template>
  <WikiPageSkeleton v-if="!page" />

  <!-- One root element, not a fragment: NuxtPage's route provider wraps the
       page in a Transition/Suspense pair that expects a single root, and a
       fragment root here re-created the page on hydration. -->
  <div v-else>
    <template v-if="isFeature">
      <WikiReadingProgress />
      <WikiVideoHero
        :page="page"
        :title="page.title"
        :lead="standfirst"
        :category="category"
        :tags="shownTags"
        :extra-tags="extraTags"
        :transcript-to="transcriptTo"
        :column-class="wrapperClass"
      />
    </template>

    <div :class="wrapperClass">
      <article :class="[articleClass, isFeature ? 'pt-6' : '']">
        <template v-if="!isFeature">
          <nav class="mb-5 flex items-center gap-2 font-sans text-[13px] text-muted-foreground">
            <NuxtLink to="/map" class="transition-colors hover:text-foreground">
              Site map
            </NuxtLink>
            <ChevronRight class="size-3.5 shrink-0 opacity-60" />
            <span>{{ category }}</span>
            <template v-if="isTranscript && videoTitle">
              <ChevronRight class="size-3.5 shrink-0 opacity-60" />
              <span class="truncate">{{ videoTitle }}</span>
            </template>
          </nav>

          <div class="mb-3.5 flex flex-wrap gap-2">
            <Badge class="ufo-category-badge">{{ category }}</Badge>
            <Badge v-for="tag in shownTags" :key="tag" variant="outline">
              {{ tag }}
            </Badge>
            <Badge v-if="extraTags > 0" variant="outline">
              +{{ extraTags }}
            </Badge>
          </div>

          <!-- Uppercase display type carries no ascender/descender variety to open the
               line up, so it wants positive tracking, not the tight setting a mixed-case
               title would take. -->
          <!-- A person with a portrait gets it floated beside the title and
               lead; `flow-root` keeps the fact table below both. -->
          <div class="flow-root">
            <WikiPersonPortrait v-if="portrait" :image="portrait" :name="page.title" />

            <h1 class="mb-4 font-display text-[clamp(32px,5vw,56px)] font-extrabold uppercase leading-none tracking-[0.02em] text-foreground">
              {{ page.title }}
            </h1>

            <p v-if="article.lead" class="mb-7 font-sans text-[20px] leading-[30px] text-muted-foreground">
              {{ article.lead }}
            </p>
          </div>

          <WikiFactTable :page="page" />

          <WikiLocalMap :path="route.path" />
        </template>

        <ContentRenderer
          v-if="article.doc"
          :value="article.doc"
          class="prose-ufo wiki-prose"
          :class="{ 'is-feature': isFeature }"
        />

        <!-- On a feature page the graph neighbourhood closes the article
             instead of opening it: the page leads with the video. -->
        <template v-if="isFeature">
          <Separator class="my-10" />
          <h2 class="mb-4 font-display text-[20px] font-semibold uppercase tracking-[0.04em] text-foreground">
            In the graph
          </h2>
          <WikiLocalMap :path="route.path" />
        </template>

        <Separator class="my-8" />

        <WikiLinkedEntries :path="route.path" />
      </article>

      <!-- The aside itself is the sticky element: in the rail's flex row it can
           travel the whole height of the article, where a sticky child would
           be pinned inside an aside only as tall as the rail (component-kit
           gotcha 4b). `<main>` is the scroller, so top-0 pins it just under
           the header. -->
      <aside v-if="hasRail" class="hidden w-[200px] shrink-0 self-start pt-10 xl:sticky xl:top-0 xl:block">
        <WikiTocRail :toc="page.body?.toc" />
      </aside>
    </div>
  </div>
</template>

<style scoped>
@reference "../../assets/css/main.css";

/* Tracking comes from the --ls-h* tokens rather than a copy of their values: it
   was duplicated here AND in main.css, so retuning the tokens moved the prose
   headings and left the article's own headings behind. */
.wiki-prose :deep(h2) {
  @apply mb-4 mt-12 border-b border-border pb-2 font-display text-[30px] font-semibold leading-9 tracking-[var(--ls-h2)] text-foreground;
}
/* `:not([class])` throughout: markdown headings, paragraphs and lists never
   carry a class, while a component's own <h3>/<p>/<ol> always do — so these
   prose rules style the note's markdown and stop at the kit's markup (the
   timeline's chapter titles, card summaries and entry lists all sit inside
   this same .wiki-prose). h2 is left alone: the kit renders no h2. */
.wiki-prose :deep(h3:not([class])) {
  @apply mb-3 mt-10 font-display text-[24px] font-semibold leading-8 tracking-[var(--ls-h3)] text-foreground;
}
.wiki-prose :deep(h4:not([class])) {
  @apply mb-2 mt-8 font-display text-[20px] font-semibold leading-7 tracking-[var(--ls-h4)] text-foreground;
}
.wiki-prose :deep(p:not([class])) {
  @apply my-5 text-[16px] leading-7 text-foreground;
}
.wiki-prose :deep(ul:not([class])) {
  @apply my-5 list-disc space-y-1.5 pl-6;
}
.wiki-prose :deep(ol:not([class])) {
  @apply my-5 list-decimal space-y-1.5 pl-6;
}
.wiki-prose :deep(li:not([class])) {
  @apply text-[16px] leading-7 text-foreground;
}
.wiki-prose :deep(blockquote) {
  @apply my-6 border-l-4 border-border pl-4 italic text-muted-foreground;
}
.wiki-prose :deep(hr) {
  @apply my-8 border-t border-border;
}
.wiki-prose :deep(code) {
  @apply rounded-sm bg-muted px-1 py-0.5 font-mono text-sm;
}
.wiki-prose :deep(strong) {
  @apply font-semibold text-foreground;
}
.wiki-prose :deep(table) {
  @apply my-6 w-full border-collapse text-sm;
}
.wiki-prose :deep(th),
.wiki-prose :deep(td) {
  @apply border border-border px-3 py-2 text-left align-top;
}
.wiki-prose :deep(th) {
  @apply bg-muted/40 font-medium text-muted-foreground;
}

/* Feature pages read as chapters: every h2 carries a mono index above it.
   CSS counters only, so the TOC rail and anchors are untouched. */
.wiki-prose.is-feature {
  counter-reset: chapter;
}
.wiki-prose.is-feature :deep(h2) {
  counter-increment: chapter;
}
.wiki-prose.is-feature :deep(h2)::before {
  content: counter(chapter, decimal-leading-zero);
  display: block;
  margin-bottom: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  line-height: 1;
  color: hsl(var(--primary));
}

/*
 * The page-header category badge (`<Badge>{{ category }}</Badge>` above) is
 * the only default-variant (bg-primary/text-primary-foreground) `<Badge>` in
 * the app (every other usage passes `variant="outline"`) -- confirmed via
 * `grep -rn "<Badge" app/`. Measured directly with proper compositing
 * (bg-primary is fully opaque, so no alpha compositing needed, just the flat
 * WCAG ratio): the shared --primary-foreground token clears 4.5:1 against
 * --primary in `dark` (6.54:1), `dim`, and `sepia` (4.69:1), but only reaches
 * 3.00:1 in `light` -- --primary-foreground's near-white value (355.7 100%
 * 97.3%) is too light for light theme's --primary green (142.1 76.2% 36.3%,
 * a mid-lightness colour close to dark theme's own primary; even a switch to
 * pure white only reaches ~3.3:1 against it). Retuning --primary-foreground
 * itself would also move every default-variant Button (and Input) sitewide,
 * which is out of scope for a video-page restyle pass -- see also the
 * "Open mini-player" button's identical 3.00:1 in light, flagged but left
 * unfixed in the report. So this ONE badge gets a scoped, light-theme-only
 * override instead; dark/dim/sepia keep the shared token's default colour.
 */
:where([data-theme="light"]) .ufo-category-badge {
  color: hsl(var(--foreground));
}
</style>
