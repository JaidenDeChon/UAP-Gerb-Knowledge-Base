<script setup lang="ts">
import type { NoteRef } from '#shared/types/wiki'
import { categoryBorder, categorySurface } from '@/utils/category'

export interface OrgNode {
  name: string
  label?: string
  note?: string
  children?: OrgNode[]
}

const props = defineProps<{ node: OrgNode, refs: Map<string, NoteRef> }>()

const children = computed(() => props.node.children ?? [])

/*
 * This node's own resolved category (vault `Category` domain, via
 * useWikiResolve -- NOT the timeline-event-category domain). Every
 * `<table class="ufo-org">` instance below -- one per node, recursively --
 * sets its OWN --node-* custom properties from its OWN category, so the box
 * for this node AND the connector lines this node draws down to its
 * children are tinted by this node, not by an ancestor's colour. A child
 * cell renders its own nested WikiOrgChartNode/<table>, which sets its own
 * vars afresh, so tints never leak between siblings or generations.
 */
const category = computed(() => props.refs.get(props.node.name.trim())?.category)
const nodeBorder = computed(() => categoryBorder(category.value))
const nodeSurface = computed(() => categorySurface(category.value))
</script>

<template>
  <table
    class="ufo-org"
    role="presentation"
    :style="{
      '--node-border': nodeBorder,
      '--node-surface': nodeSurface,
    }"
  >
    <tbody>
      <tr>
        <td :colspan="Math.max(children.length * 2, 2)" class="ufo-org-cell">
          <div class="ufo-org-box">
            <div v-if="props.node.label" class="ufo-org-kicker">
              {{ props.node.label }}
            </div>
            <div class="ufo-org-name">
              <WikiEntityLink :name="props.node.name" :ref-data="props.refs.get(props.node.name.trim())" />
            </div>
            <div v-if="props.node.note" class="ufo-org-note">
              {{ props.node.note }}
            </div>
          </div>
        </td>
      </tr>

      <template v-if="children.length">
        <!-- Stem down from the parent box. See the .ufo-org-* rules below for
             the full connector geometry. -->
        <tr class="ufo-org-lines">
          <td :colspan="children.length * 2" class="ufo-org-down">
            <div class="ufo-org-stem" />
          </td>
        </tr>
        <!-- Horizontal rail: half-width cells per child, so is-first/is-last
             can trim the outer edges. -->
        <tr class="ufo-org-lines">
          <template v-for="(child, i) in children" :key="`rail-${i}`">
            <td :class="['ufo-org-rail', i === 0 ? 'is-first' : '']" />
            <td :class="['ufo-org-rail', i === children.length - 1 ? 'is-last' : '']" />
          </template>
        </tr>
        <tr>
          <!-- Self-reference by the directory-prefixed auto-import name: this
               file is components/wiki/OrgChartNode.vue, which Nuxt registers
               globally as `WikiOrgChartNode` (not `OrgChartNode`, since the
               filename doesn't already start with "Wiki" for the prefix to
               dedupe against). -->
          <td v-for="(child, i) in children" :key="`child-${i}`" colspan="2" class="ufo-org-cell">
            <WikiOrgChartNode :node="child" :refs="props.refs" />
          </td>
        </tr>
      </template>
    </tbody>
  </table>
</template>

<style scoped>
/* This chart only ever renders inside the wiki article's `.wiki-prose`
   scope (`app/pages/wiki/[...slug].vue`), which styles every real markdown
   `<table>`/`<th>`/`<td>` with a 1px border, horizontal padding, left
   alignment and 100% width — exactly the "visible grid" this component
   must not inherit. Those rules compile to `.wiki-prose[data-v-page] table`
   / `...th` / `...td`: two class-level selectors (the class plus that
   page's own scoped-CSS attribute) and one element-level selector, i.e.
   specificity (0,2,1). A plain scoped rule here on the same element type
   (e.g. `.ufo-org-cell[data-v-node]`) only reaches (0,2,0) — two
   class-level, zero element-level — and loses outright at the element-level
   tier. Every rule below that resets or re-applies a border/padding/width
   on this component's own `<table>`/`<td>` elements repeats its class once
   (`.ufo-org-cell.ufo-org-cell`) to push the class-level count to 3, which
   beats (0,2,1) unconditionally regardless of element count or stylesheet
   load order. No `!important`, and `[...slug].vue` is untouched. */
.ufo-org.ufo-org {
  border-collapse: collapse;
  margin-inline: auto;
  width: auto;
}
.ufo-org-cell.ufo-org-cell {
  text-align: center;
  vertical-align: top;
  padding: 0;
  border: 0;
}
.ufo-org-box {
  display: inline-block;
  min-width: 132px;
  max-width: 220px;
  margin: 0 8px;
  padding: 8px 12px;
  /* Neutral border, NOT var(--node-border): measured directly, a
     categoryBorder() edge (0.85 alpha) against this same node's own
     categorySurface() fill (0.14 alpha, same hue) collapses to as low as
     1.56-1.59:1 for Videos in light/sepia -- worse than either alone,
     because both are blends toward the same colour. WikiRoster hit the
     identical compounding and settled on the same fix: keep the box's own
     outline neutral (matches WikiTimeline's box-border-neutral /
     rule-coloured split) and let the surface tint + the WikiEntityLink dot
     beside the name carry the category identity. */
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  /* categorySurface() -- verified >= 4.5:1 for --foreground/--muted-foreground
     text across all 8 categories x 4 themes, same guarantee WikiRoster and
     WikiTimeline rely on. Unresolved names fall back to a neutral
     muted-foreground tint (see categorySurface's own fallback). */
  background: var(--node-surface);
  text-align: center;
}
/*
 * Kicker/note colour: `--foreground`, NOT `--muted-foreground`. Measured
 * directly (composite categorySurface's 0.14-alpha tint over --card, then
 * check --muted-foreground against THAT box background, not plain --card):
 * it fails 4.5:1 for every one of the 8 categories in `light` (3.83-4.38:1)
 * and `sepia` (3.86-4.40:1), plus `videos` in `dim` (4.07:1) -- the same gap
 * found and fixed in WikiRoster (see that file's style-block comment).
 * categorySurface's >= 4.5:1 guarantee (category.ts) only ever covered
 * `--foreground`; tinting the whole box here is a new use this task
 * introduces, so `--muted-foreground` text on it is unverified and, as
 * measured, unsafe. `--foreground` is used instead, kept visually secondary
 * by size/weight (10px mono kicker, 12px note vs. the 15px name) rather
 * than by colour.
 */
.ufo-org-kicker {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: hsl(var(--foreground));
  margin-bottom: 2px;
}
.ufo-org-name {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}
.ufo-org-note {
  margin-top: 3px;
  font-family: var(--font-sans);
  font-size: 12px;
  line-height: 16px;
  color: hsl(var(--foreground));
}

/* Connectors. Fixed-height rows so the geometry never depends on content.
   Padding/height only here — border is deliberately NOT reset by this
   shared descendant selector: `.ufo-org-lines.ufo-org-lines td` compiles to
   (0,3,1) (two classes on the tr compound, plus the scope attribute on the
   td compound, plus the td element), which would out-rank a same-tier
   `.ufo-org-rail.ufo-org-rail` re-add at (0,3,0) — a single compound only
   ever gets the scope attribute once — and silently zero out the rail's
   own border-top again. Each cell type owns its full border story in its
   own rule instead (see `.ufo-org-down` and `.ufo-org-rail` below), so
   there is no same-origin specificity fight. */
.ufo-org-lines.ufo-org-lines td { padding: 0; height: 14px; }

/* Connector colour: var(--node-border) -- this node's own categoryBorder(),
   set on the <table> root above -- rather than a flat hsl(var(--border)).
   The lines a node draws down to its children read as "belonging" to that
   node, a subtle tint rather than a loud one since these are 1px hairlines.
   Geometry (widths/heights/nth-child selection) is unchanged from before. */
.ufo-org-down.ufo-org-down { text-align: center; border: 0; }
.ufo-org-stem {
  width: 1px;
  height: 14px;
  margin-inline: auto;
  background: var(--node-border);
}

.ufo-org-rail.ufo-org-rail {
  border: 0;
  border-top: 1px solid var(--node-border);
}
/* Trim the rail so it stops at the outermost children rather than overhanging. */
.ufo-org-rail.is-first { border-top-color: transparent; }
.ufo-org-rail.is-last { border-top-color: transparent; }
.ufo-org-rail:not(.is-first):not(.is-last) { border-top-color: var(--node-border); }

/* Vertical stem into each child. Each child contributes exactly two cells to
   this row (an "a" half then a "b" half); the boundary between them is that
   child's centre line, which is also the centre of its own colspan="2" box
   cell directly below. nth-child(odd) picks out every "a" half — i.e. one
   stem per child — regardless of child count, so it covers 1, 2, 3+ children
   alike, including the single-child case where the horizontal rail above is
   fully transparent and this is the only connector. Its specificity ties
   `.ufo-org-rail.ufo-org-rail` above (both two classes + the scope
   attribute); declared after it, so the tie resolves in its favour. */
.ufo-org-rail:nth-child(odd) {
  border-right: 1px solid var(--node-border);
}
</style>
