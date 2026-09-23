<script setup lang="ts">
import type { NoteRef } from '#shared/types/wiki'
import { categoryMark, categorySurface } from '@/utils/category'
import type { ChainItem } from '@/utils/chain'

/**
 * One ordered run of `::wiki-chain` steps. Recursive: a fork renders each of
 * its branches as a nested WikiChainSequence. Lives in `components/wiki/`, so
 * it auto-imports (and refers to itself) as `WikiChainSequence` (gotcha 3).
 */
const props = withDefaults(
  defineProps<{
    items: ChainItem[]
    refs: Map<string, NoteRef>
    /** Screen-reader word for an arrow with no authored label ("led to"). */
    verb: string
    /** Accessible name for this list. */
    label?: string
    /** Draw an arrow into the first step too (a branch, flowing out of its fork). */
    leading?: boolean
    video?: string
    videoTitle?: string
  }>(),
  { label: '', leading: false, video: '', videoTitle: '' },
)

function refOf(name: string): NoteRef | undefined {
  return props.refs.get(name.trim())
}

function hasArrow(i: number, via: string): boolean {
  return i > 0 || props.leading || !!via
}

function branchName(label: string, i: number): string {
  return label || `Branch ${i + 1}`
}
</script>

<template>
  <ol class="ufo-chain-seq" :aria-label="props.label || undefined">
    <li
      v-for="(item, i) in props.items"
      :key="i"
      class="ufo-chain-item"
      :class="[
        item.type === 'fork' ? 'is-fork' : 'is-step',
        { 'is-rejoin': i > 0 && props.items[i - 1]!.type === 'fork' },
      ]"
    >
      <!-- The arrow INTO this item, with its label as real text. -->
      <div v-if="hasArrow(i, item.via)" class="ufo-chain-link">
        <span class="ufo-chain-arrow" aria-hidden="true" />
        <span v-if="item.via" class="ufo-chain-via">{{ item.via }}</span>
        <span v-else class="ufo-chain-sr">{{ props.verb }}</span>
      </div>

      <div
        v-if="item.type === 'step'"
        class="ufo-chain-card"
        :class="{ 'is-plain': !item.resolvable }"
        :style="item.resolvable ? {
          '--step-mark': categoryMark(refOf(item.name)?.category),
          '--step-surface': categorySurface(refOf(item.name)?.category),
        } : undefined"
      >
        <p v-if="item.date" class="ufo-chain-date">{{ item.date }}</p>
        <p class="ufo-chain-name">
          <WikiEntityLink
            v-if="item.resolvable"
            :name="item.name"
            :ref-data="refOf(item.name)"
            variant="inline"
          />
          <template v-else>{{ item.name }}</template>
        </p>
        <p v-if="item.note" class="ufo-chain-note">{{ item.note }}</p>
        <div v-if="item.cue !== null && props.video" class="ufo-chain-cue">
          <WikiCue
            :t="item.cue"
            :approx="item.cueApprox"
            :video="props.video"
            :video-title="props.videoTitle"
            :entry-title="item.name"
          />
        </div>
      </div>

      <div v-else class="ufo-chain-fork">
        <span class="ufo-chain-sr">Splits into {{ item.branches.length }} branches:</span>
        <ul class="ufo-chain-branches" :class="`is-${Math.min(item.branches.length, 4)}`">
          <li v-for="(branch, bi) in item.branches" :key="bi" class="ufo-chain-branch">
            <p v-if="branch.label" class="ufo-chain-branch-label">{{ branch.label }}</p>
            <WikiChainSequence
              :items="branch.items"
              :refs="props.refs"
              :verb="props.verb"
              :label="branchName(branch.label, bi)"
              leading
              :video="props.video"
              :video-title="props.videoTitle"
            />
          </li>
        </ul>
      </div>
    </li>
  </ol>
</template>

<style scoped>
/*
 * Layout is driven by the `chain` container WikiChain.vue declares on its
 * <figure>: vertical by default (a phone, or a narrow grid column), and a
 * horizontal, wrapping row of cards from 40rem up. A container query rather
 * than a viewport breakpoint, for the same reason as ::wiki-compare.
 *
 * Every element here carries a class, so the page's classless prose rules for
 * p / ol / ul / li never reach it (gotcha 4b).
 */
.ufo-chain-seq,
.ufo-chain-branches {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ufo-chain-seq {
  display: flex;
  flex-direction: column;
}
.ufo-chain-item {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
}

.ufo-chain-sr {
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

/* -- arrows (vertical) ---------------------------------------------------- */

.ufo-chain-link {
  display: flex;
  align-items: stretch;
  min-height: 2rem;
  padding-left: 1.1rem;
}
.ufo-chain-arrow {
  position: relative;
  flex: none;
  width: 0;
  margin: 3px 0 9px;
  border-left: 2px var(--chain-line-style, solid) var(--chain-line);
}
/* Arrowhead: a CSS triangle in the line's colour. */
.ufo-chain-arrow::after {
  content: '';
  position: absolute;
  left: -6px;
  bottom: -7px;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 7px solid var(--chain-line);
}
.ufo-chain-via {
  align-self: center;
  margin: 0;
  padding: 4px 0 8px 12px;
  font-family: var(--font-sans);
  font-size: 12.5px;
  font-style: italic;
  line-height: 1.4;
  color: hsl(var(--muted-foreground));
}

/* -- step cards ----------------------------------------------------------- */

/*
 * Category tint as the surface over an opaque --card base (categorySurface is
 * verified >= 4.5:1 for --foreground on --card), plus a 3px full-strength
 * spine. The name stays --foreground; category also reads through
 * WikiEntityLink's ringed dot, never colour alone.
 */
.ufo-chain-card {
  position: relative;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  padding: 9px 12px 10px 15px;
  background-color: hsl(var(--card));
  background-image: linear-gradient(var(--step-surface, transparent), var(--step-surface, transparent));
  box-shadow: inset 3px 0 0 var(--step-mark, hsl(var(--muted-foreground)));
}
/* A plain-text stage (no page): neutral, dashed, no spine. */
.ufo-chain-card.is-plain {
  border-style: dashed;
  box-shadow: none;
  padding-left: 12px;
}
.ufo-chain-date {
  margin: 0 0 2px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  line-height: 1.4;
  color: hsl(var(--foreground));
  opacity: 0.8;
}
.ufo-chain-name {
  margin: 0;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  color: hsl(var(--foreground));
}
/* A long name wraps: keep the category dot on its first line. */
.ufo-chain-name :deep(.ufo-entity-link) {
  align-items: flex-start;
}
.ufo-chain-name :deep(.ufo-entity-dot) {
  margin-top: 0.42em;
}
.ufo-chain-note {
  margin: 4px 0 0;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.45;
  color: hsl(var(--foreground));
}
.ufo-chain-cue {
  margin-top: 7px;
}

/* -- forks ---------------------------------------------------------------- */

/*
 * Each branch is a lane: parallel alternatives, read side by side where
 * there is room. A lane is itself a `chain` container, so the sequence inside
 * it picks its own layout from the lane's width, not the whole figure's.
 */
.ufo-chain-branches {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 8px;
}
@container chain (min-width: 30rem) {
  .ufo-chain-branches {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@container chain (min-width: 40rem) {
  .ufo-chain-branches.is-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.ufo-chain-branch {
  container: chain / inline-size;
  margin: 0;
  padding: 8px 10px 10px;
  border: 1px dashed hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--muted) / 0.45);
}
.ufo-chain-branch-label {
  margin: 0 0 2px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.4;
  color: hsl(var(--foreground));
}
/* A branch's first arrow flows straight out of the lane's top edge. */
.ufo-chain-branch > .ufo-chain-seq > .ufo-chain-item:first-child > .ufo-chain-link {
  min-height: 1.5rem;
}

/* -- horizontal (wide container) ------------------------------------------ */

@container chain (min-width: 40rem) {
  .ufo-chain-seq {
    flex-direction: row;
    flex-wrap: wrap;
    /* Each card keeps its own height (no tall empty cards beside a long
       one); an arrow centres on the card it points to. */
    align-items: flex-start;
    row-gap: 12px;
  }
  /* An arrow and the card it points to wrap together, so a row that starts
     with an arrow reads as "continued". */
  .ufo-chain-item.is-step:not(.is-rejoin) {
    flex-direction: row;
    align-items: stretch;
    flex: 1 1 10rem;
    max-width: 15rem;
  }
  .ufo-chain-item.is-step:not(.is-rejoin):has(> .ufo-chain-link) {
    flex: 1 1 16.5rem;
    max-width: 22rem;
  }
  .ufo-chain-item.is-step:not(.is-rejoin) > .ufo-chain-card {
    flex: 1 1 10rem;
    min-width: 0;
  }
  /* A fork takes a whole row, its lanes side by side beneath it. */
  .ufo-chain-item.is-fork {
    flex: 1 1 100%;
  }
  /* Where the branches rejoin, the arrow comes down out of the lanes, so it
     keeps the vertical form, and the card keeps a step's width. */
  .ufo-chain-item.is-rejoin {
    flex: 1 1 100%;
  }
  .ufo-chain-item.is-rejoin > .ufo-chain-card {
    max-width: 22rem;
  }

  .ufo-chain-item.is-step:not(.is-rejoin) > .ufo-chain-link {
    flex-direction: column;
    justify-content: center;
    flex: none;
    width: 6.5rem;
    min-height: 0;
    padding: 0 10px 0 6px;
  }
  .ufo-chain-item.is-step:not(.is-rejoin) > .ufo-chain-link > .ufo-chain-arrow {
    width: auto;
    height: 0;
    margin: 0 8px 0 0;
    border-left: 0;
    border-top: 2px var(--chain-line-style, solid) var(--chain-line);
  }
  .ufo-chain-item.is-step:not(.is-rejoin) > .ufo-chain-link > .ufo-chain-arrow::after {
    left: auto;
    right: -7px;
    bottom: auto;
    top: -6px;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
    border-right: 0;
    border-left: 7px solid var(--chain-line);
  }
  .ufo-chain-item.is-step:not(.is-rejoin) > .ufo-chain-link > .ufo-chain-via {
    order: -1;
    align-self: stretch;
    padding: 0 0 6px;
    font-size: 11.5px;
    line-height: 1.35;
    text-align: center;
    overflow-wrap: anywhere;
  }
}
</style>
