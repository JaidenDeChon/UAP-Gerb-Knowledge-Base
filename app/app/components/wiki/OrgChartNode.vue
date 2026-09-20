<script setup lang="ts">
import type { NoteRef } from '#shared/types/wiki'

export interface OrgNode {
  name: string
  label?: string
  note?: string
  children?: OrgNode[]
}

const props = defineProps<{ node: OrgNode, refs: Map<string, NoteRef> }>()

const children = computed(() => props.node.children ?? [])
</script>

<template>
  <table class="ufo-org" role="presentation">
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
.ufo-org {
  border-collapse: collapse;
  margin-inline: auto;
}
.ufo-org-cell {
  text-align: center;
  vertical-align: top;
  padding: 0;
}
.ufo-org-box {
  display: inline-block;
  min-width: 132px;
  max-width: 220px;
  margin: 0 8px;
  padding: 8px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
  text-align: center;
}
.ufo-org-kicker {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
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
  color: hsl(var(--muted-foreground));
}

/* Connectors. Fixed-height rows so the geometry never depends on content. */
.ufo-org-lines td { padding: 0; height: 14px; }

.ufo-org-down { text-align: center; }
.ufo-org-stem {
  width: 1px;
  height: 14px;
  margin-inline: auto;
  background: hsl(var(--border));
}

.ufo-org-rail {
  border-top: 1px solid hsl(var(--border));
}
/* Trim the rail so it stops at the outermost children rather than overhanging. */
.ufo-org-rail.is-first { border-top-color: transparent; }
.ufo-org-rail.is-last { border-top-color: transparent; }
.ufo-org-rail:not(.is-first):not(.is-last) { border-top-color: hsl(var(--border)); }

/* Vertical stem into each child. Each child contributes exactly two cells to
   this row (an "a" half then a "b" half); the boundary between them is that
   child's centre line, which is also the centre of its own colspan="2" box
   cell directly below. nth-child(odd) picks out every "a" half — i.e. one
   stem per child — regardless of child count, so it covers 1, 2, 3+ children
   alike, including the single-child case where the horizontal rail above is
   fully transparent and this is the only connector. */
.ufo-org-rail:nth-child(odd) {
  border-right: 1px solid hsl(var(--border));
}
</style>
