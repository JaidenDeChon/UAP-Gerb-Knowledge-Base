<script setup lang="ts">
import type { Component } from 'vue'
import {
  BookOpen,
  FileQuestion,
  FileText,
  Gavel,
  Landmark,
  Lightbulb,
  Mail,
  MessageSquareQuote,
  Mic,
  Newspaper,
  ScrollText,
  ShieldAlert,
} from '@lucide/vue'
import {
  buildRecord,
  RECORD_KIND_LABEL,
  RECORD_KIND_PLURAL,
  type RecordInput,
  type RecordKind,
} from '@/utils/record'

/**
 * `::wiki-record` — what a person put on the record, in date order: memos,
 * letters, sworn testimony, interviews, books, papers, complaints and public
 * statements. Each item carries its kind as a word and an icon, the date,
 * where it was given or published, who else took part, a short note, an
 * optional verbatim quote and the page it was drawn from. With several kinds
 * on the list, one button per kind narrows it.
 *
 * Marked up as an ordered list. Nothing animates.
 */
const props = withDefaults(
  defineProps<{
    items?: RecordInput[]
    /** Replaces the "On the record" kicker. */
    label?: string
    caption?: string
  }>(),
  { items: () => [], label: '', caption: '' },
)

const model = computed(() => buildRecord(props.items))
const { refs } = useWikiResolve(() => model.value.names)

const kicker = computed(() => props.label.trim() || 'On the record')

const ICONS: Record<RecordKind, Component> = {
  testimony: Landmark,
  interview: Mic,
  memo: FileText,
  letter: Mail,
  report: ScrollText,
  book: BookOpen,
  article: Newspaper,
  paper: ScrollText,
  statement: MessageSquareQuote,
  complaint: ShieldAlert,
  lawsuit: Gavel,
  patent: Lightbulb,
  other: FileQuestion,
}

const filter = ref<RecordKind | 'all'>('all')
const showFilters = computed(() => model.value.kinds.length > 1 && model.value.items.length >= 5)
const shown = computed(() =>
  filter.value === 'all' ? model.value.items : model.value.items.filter(item => item.kind === filter.value))

function count(kind: RecordKind): number {
  return model.value.items.filter(item => item.kind === kind).length
}
</script>

<template>
  <figure v-if="model.items.length" class="ufo-rec">
    <p class="ufo-rec-kicker" aria-hidden="true">
      {{ kicker }}
    </p>

    <div v-if="showFilters" class="ufo-rec-filters" role="group" aria-label="Show one kind of record">
      <button
        type="button"
        class="ufo-rec-filter"
        :aria-pressed="filter === 'all'"
        @click="filter = 'all'"
      >
        All {{ model.items.length }}
      </button>
      <button
        v-for="kind in model.kinds"
        :key="kind"
        type="button"
        class="ufo-rec-filter"
        :aria-pressed="filter === kind"
        @click="filter = kind"
      >
        <component :is="ICONS[kind]" class="ufo-rec-filter-icon" aria-hidden="true" />
        {{ RECORD_KIND_PLURAL[kind] }} {{ count(kind) }}
      </button>
    </div>

    <ol class="ufo-rec-list" :aria-label="props.caption ? `${kicker}: ${props.caption}` : kicker">
      <li v-for="item in shown" :key="item.key" class="ufo-rec-item">
        <div class="ufo-rec-when">
          <span class="ufo-rec-date">{{ item.shownDate || 'Date unknown' }}</span>
        </div>
        <div class="ufo-rec-card">
          <p class="ufo-rec-kind">
            <component :is="ICONS[item.kind]" class="ufo-rec-kind-icon" aria-hidden="true" />
            {{ RECORD_KIND_LABEL[item.kind] }}
          </p>
          <h4 class="ufo-rec-title">
            {{ item.title }}
          </h4>
          <p v-if="item.where" class="ufo-rec-where">
            <WikiEntityLink :name="item.where" :ref-data="refs.get(item.where)" variant="inline" />
          </p>
          <p v-if="item.note" class="ufo-rec-note">
            {{ item.note }}
          </p>
          <blockquote v-if="item.quote" class="ufo-rec-quote">
            “{{ item.quote }}”
          </blockquote>
          <p v-if="item.with.length" class="ufo-rec-with">
            <span class="ufo-rec-meta-label">With</span>
            <WikiEntityLink v-for="name in item.with" :key="name" :name="name" :ref-data="refs.get(name)" />
          </p>
          <p v-if="item.source" class="ufo-rec-source">
            <span class="ufo-rec-meta-label">Source</span>
            <WikiEntityLink :name="item.source" :ref-data="refs.get(item.source)" variant="inline" />
          </p>
        </div>
      </li>
    </ol>

    <figcaption v-if="props.caption" class="ufo-rec-caption">
      {{ props.caption }}
    </figcaption>
  </figure>
</template>

<style scoped>
.ufo-rec {
  container: rec / inline-size;
  margin: 1.75rem 0;
}
.ufo-rec-kicker {
  margin: 0 0 8px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  line-height: 1.4;
  color: hsl(var(--muted-foreground));
}

.ufo-rec-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
/* The timeline chronometer's small-control look: mono caps, hairline border. */
.ufo-rec-filter {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  background: hsl(var(--card));
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  transition: color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
}
.ufo-rec-filter:hover {
  color: hsl(var(--foreground));
}
.ufo-rec-filter[aria-pressed="true"] {
  border-color: hsl(var(--primary));
  color: hsl(var(--foreground));
}
.ufo-rec-filter:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.ufo-rec-filter-icon {
  width: 12px;
  height: 12px;
  color: hsl(var(--primary));
}

.ufo-rec-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
/* Wide: the date in its own column. Narrow: above the card. */
.ufo-rec-item {
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px;
}
@container rec (min-width: 34rem) {
  .ufo-rec-item {
    grid-template-columns: 92px 1fr;
    gap: 14px;
  }
  .ufo-rec-when {
    padding-top: 12px;
    text-align: right;
  }
}
.ufo-rec-date {
  font-family: var(--font-mono);
  font-size: 11.5px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
}
.ufo-rec-card {
  min-width: 0;
  padding: 10px 14px 12px;
  border: 1px solid hsl(var(--border));
  border-left: 3px solid hsl(var(--graph-cat-concepts) / 0.85);
  border-radius: 8px;
  background: hsl(var(--card));
}
.ufo-rec-kind {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}
.ufo-rec-kind-icon {
  width: 12px;
  height: 12px;
  color: hsl(var(--primary));
}
.ufo-rec-title {
  margin: 4px 0 0;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
  line-height: 21px;
  color: hsl(var(--foreground));
}
.ufo-rec-where {
  margin: 3px 0 0;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 19px;
  color: hsl(var(--muted-foreground));
}
.ufo-rec-note {
  margin: 6px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 21px;
  color: hsl(var(--foreground));
}
.ufo-rec-quote {
  margin: 8px 0 0;
  padding-left: 10px;
  border-left: 2px solid hsl(var(--border));
  font-family: var(--font-sans);
  font-size: 14px;
  font-style: italic;
  line-height: 21px;
  color: hsl(var(--muted-foreground));
}
.ufo-rec-source {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 19px;
}
.ufo-rec-source .ufo-rec-meta-label {
  margin-right: 6px;
}
/* A source is usually a long video title: let it wrap as text beside its
   label rather than drop to its own line as one block. */
.ufo-rec-source :deep(.ufo-entity-link) {
  display: inline;
}
.ufo-rec-source :deep(.ufo-entity-dot) {
  display: inline-block;
  margin-right: 4px;
  vertical-align: 1px;
}
.ufo-rec-with {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  font-size: 13px;
}
.ufo-rec-meta-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}
.ufo-rec-caption {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
}
</style>
