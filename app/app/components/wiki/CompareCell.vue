<script setup lang="ts">
import type { Component } from 'vue'
import { CircleHelp, Equal, EqualNot, TriangleAlert } from '@lucide/vue'
import { COMPARE_MARK_HINT, COMPARE_MARK_LABEL, type CompareCell, type CompareMark } from '@/utils/compare'

/**
 * One value in `::wiki-compare` — shared by the table cell (wide) and the
 * card row (narrow) so the two layouts can never drift apart. Auto-imports
 * as `WikiCompareCell` (directory prefix, see gotcha 3). When `cell` is
 * omitted it renders just the marker badge, which the legend reuses.
 */
const props = withDefaults(
  defineProps<{
    cell?: CompareCell
    /** Render only this marker's badge (the legend). */
    mark?: CompareMark
    video?: string
    videoTitle?: string
    entryTitle?: string
  }>(),
  { video: '', videoTitle: '', entryTitle: '' },
)

const MARK_ICON: Record<CompareMark, Component> = {
  same: Equal,
  differs: EqualNot,
  unknown: CircleHelp,
  disputed: TriangleAlert,
}

const badge = computed(() => props.cell?.mark ?? props.mark ?? null)
const showCue = computed(() => !!props.cell && props.cell.cue !== null && !!props.video)
</script>

<template>
  <span v-if="!props.cell && badge" class="ufo-cmp-mark" :class="`is-${badge}`">
    <component :is="MARK_ICON[badge]" class="ufo-cmp-mark-icon" aria-hidden="true" />
    {{ COMPARE_MARK_LABEL[badge] }}
  </span>
  <template v-else-if="props.cell">
    <template v-if="props.cell.empty">
      <span aria-hidden="true" class="ufo-cmp-dash">—</span>
      <span class="ufo-cmp-sr">Not stated</span>
    </template>
    <template v-else>
      <span v-if="props.cell.text" class="ufo-cmp-text">{{ props.cell.text }}</span>
      <span v-if="badge || showCue" class="ufo-cmp-meta">
        <span v-if="badge" class="ufo-cmp-mark" :class="`is-${badge}`" :title="COMPARE_MARK_HINT[badge]">
          <component :is="MARK_ICON[badge]" class="ufo-cmp-mark-icon" aria-hidden="true" />
          {{ COMPARE_MARK_LABEL[badge] }}
        </span>
        <WikiCue
          v-if="showCue"
          :t="props.cell.cue ?? 0"
          :approx="props.cell.cueApprox"
          :video="props.video"
          :video-title="props.videoTitle"
          :entry-title="props.entryTitle"
        />
      </span>
    </template>
  </template>
</template>

<style scoped>
.ufo-cmp-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.ufo-cmp-text {
  display: block;
}
.ufo-cmp-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.ufo-cmp-dash {
  color: hsl(var(--muted-foreground));
}

/*
 * Marker badge: text label + glyph + tone. The label is always --foreground
 * (the tone tokens fail 4.5:1 as text in some themes); tone lives in the
 * border, the glyph and a faint wash over an opaque --card base (so it
 * composites the same on any tinted ancestor). "unknown" is also dashed, so
 * every marker reads without hue.
 */
.ufo-cmp-mark {
  --mark-tone: var(--muted-foreground);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px 1px 5px;
  border: 1px solid hsl(var(--mark-tone) / 0.7);
  border-radius: var(--radius-sm);
  background-color: hsl(var(--card));
  background-image: linear-gradient(hsl(var(--mark-tone) / 0.1), hsl(var(--mark-tone) / 0.1));
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 16px;
  text-transform: uppercase;
  color: hsl(var(--foreground));
  white-space: nowrap;
}
.ufo-cmp-mark.is-same { --mark-tone: var(--primary); }
.ufo-cmp-mark.is-differs { --mark-tone: var(--graph-cat-orgs); }
.ufo-cmp-mark.is-disputed { --mark-tone: var(--destructive); }
.ufo-cmp-mark.is-unknown { border-style: dashed; }
.ufo-cmp-mark-icon {
  width: 11px;
  height: 11px;
  flex: none;
  color: hsl(var(--mark-tone));
}
</style>
