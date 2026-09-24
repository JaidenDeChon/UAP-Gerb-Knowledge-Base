<script setup lang="ts">
import type { NoteRef } from '#shared/types/wiki'
import { categoryMark, categorySurface } from '@/utils/category'
import { joinText, splitText, type ChainItem } from '@/utils/chain'

/**
 * One ordered run of `::wiki-chain` steps, drawn down a vertical spine:
 * numbered nodes on one continuous line, each hand-off's label written on the
 * connector between the two steps it links. A fork is a split junction on the
 * spine ("From 1, splits into 2 branches"), then a lane per branch, then a
 * rejoin junction ("Branches A and B rejoin at 2") when the run continues.
 *
 * Recursive: each lane renders its branch as a nested WikiChainSequence.
 * Lives in `components/wiki/`, so it auto-imports (and refers to itself) as
 * `WikiChainSequence` (gotcha 3).
 */
const props = withDefaults(
  defineProps<{
    items: ChainItem[]
    refs: Map<string, NoteRef>
    /** The kind's verb for a connector with no authored label ("led to"). */
    verb: string
    /** Accessible name for this list. */
    label?: string
    /** This run is a branch inside a lane: its first step hangs off the lane's header. */
    lane?: boolean
    /** The run flows on after its last item (its branches rejoin), so the spine keeps going. */
    tail?: boolean
    video?: string
    videoTitle?: string
  }>(),
  { label: '', lane: false, tail: false, video: '', videoTitle: '' },
)

function refOf(name: string): NoteRef | undefined {
  return props.refs.get(name.trim())
}

const last = computed(() => props.items.length - 1)

/** Does a connector lead into item i? Between steps, out of a lane header, or an authored label. */
function hasLink(i: number): boolean {
  return i > 0 || props.lane || !!props.items[i]!.via
}

/** The words on the connector into item i: the author's `via`, else the kind's verb between two steps. */
function linkText(i: number): { text: string, authored: boolean } {
  const item = props.items[i]!
  if (item.via) return { text: item.via, authored: true }
  return { text: props.items[i - 1]?.type === 'step' ? props.verb : '', authored: false }
}

/** A fork's branches flow back into the spine when anything follows it. */
function rejoins(i: number): boolean {
  return i < last.value || props.tail
}

function branchName(label: string, key: string | undefined): string {
  return label ? `Branch ${key}: ${label}` : `Branch ${key}`
}
</script>

<template>
  <ol class="ufo-chain-seq" :aria-label="props.label || undefined">
    <li
      v-for="(item, i) in props.items"
      :key="i"
      class="ufo-chain-item"
      :class="item.type === 'fork' ? 'is-fork' : 'is-step'"
    >
      <template v-if="item.type === 'step'">
        <!-- The connector INTO this step, its label as real text. -->
        <div v-if="hasLink(i)" class="ufo-chain-row ufo-chain-link">
          <span class="ufo-chain-gut" aria-hidden="true" />
          <span
            v-if="linkText(i).text"
            class="ufo-chain-via"
            :class="{ 'is-verb': !linkText(i).authored }"
          >{{ linkText(i).text }}</span>
        </div>

        <div
          class="ufo-chain-row ufo-chain-body"
          :class="{ 'has-in': hasLink(i), 'has-out': i < last || props.tail }"
        >
          <span class="ufo-chain-gut">
            <span class="ufo-chain-node">{{ item.key }}</span>
          </span>
          <div
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
        </div>
      </template>

      <template v-else>
        <!-- Split junction: which step the branches come from, and how many. -->
        <div
          class="ufo-chain-row ufo-chain-junction is-split"
          :class="{ 'has-in': i > 0 || props.lane }"
        >
          <span class="ufo-chain-gut" aria-hidden="true"><span class="ufo-chain-glyph" /></span>
          <p class="ufo-chain-junction-text">
            <span class="ufo-chain-junction-title">{{ splitText(props.items, i) }}</span>
            <span v-if="item.via" class="ufo-chain-via">{{ item.via }}</span>
          </p>
        </div>

        <ul
          class="ufo-chain-lanes"
          :class="[`is-${item.branches.length}`, { 'is-rejoining': rejoins(i) }]"
          :style="{ '--n': item.branches.length }"
          :aria-label="splitText(props.items, i)"
        >
          <li
            v-for="(branch, bi) in item.branches"
            :key="bi"
            class="ufo-chain-lane"
            :class="{ 'is-last': bi === item.branches.length - 1 }"
          >
            <span class="ufo-chain-wire is-in-stack" aria-hidden="true" />
            <span
              v-if="bi < item.branches.length - 1 || rejoins(i)"
              class="ufo-chain-wire is-rail"
              aria-hidden="true"
            />
            <span class="ufo-chain-wire is-in-side" aria-hidden="true" />
            <template v-if="rejoins(i)">
              <span class="ufo-chain-wire is-out-stack" aria-hidden="true" />
              <span class="ufo-chain-wire is-out-side" aria-hidden="true" />
            </template>

            <p class="ufo-chain-row ufo-chain-lane-head">
              <span class="ufo-chain-gut" aria-hidden="true" />
              <span class="ufo-chain-lane-title">
                <span class="ufo-chain-lane-key">{{ branch.key }}</span>
                <span v-if="branch.label" class="ufo-chain-lane-label">{{ branch.label }}</span>
              </span>
            </p>
            <WikiChainSequence
              :items="branch.items"
              :refs="props.refs"
              :verb="props.verb"
              :label="branchName(branch.label, branch.key)"
              lane
              :tail="rejoins(i)"
              :video="props.video"
              :video-title="props.videoTitle"
            />
            <div v-if="rejoins(i)" class="ufo-chain-row ufo-chain-tail" aria-hidden="true">
              <span class="ufo-chain-gut" />
            </div>
          </li>
        </ul>

        <!-- Rejoin junction: which branches come back, and at which step. -->
        <div
          v-if="joinText(props.items, i)"
          class="ufo-chain-row ufo-chain-junction is-join has-in"
        >
          <span class="ufo-chain-gut" aria-hidden="true"><span class="ufo-chain-glyph" /></span>
          <p class="ufo-chain-junction-text">
            <span class="ufo-chain-junction-title">{{ joinText(props.items, i) }}</span>
          </p>
        </div>
      </template>
    </li>
  </ol>
</template>

<style scoped>
/*
 * One grammar at every width: a vertical spine. Every row (connector, step,
 * junction, lane header) is a two-column grid, a gutter carrying the line and
 * the content beside it, so the line runs unbroken down the gutter and the
 * words always sit on the stretch of line they describe. Nothing wraps into
 * rows, so no row can be misread as coming from the one above it.
 *
 * The geometry (gutter width, line weight, node size) comes from custom
 * properties WikiChain.vue sets on the figure. Every element carries a class,
 * so the page's classless prose rules for p / ol / ul / li never reach it
 * (gotcha 4b).
 */
.ufo-chain-seq,
.ufo-chain-lanes {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ufo-chain-item {
  margin: 0;
  padding: 0;
}

.ufo-chain-row {
  display: grid;
  grid-template-columns: var(--chain-g) minmax(0, 1fr);
  margin: 0;
}
.ufo-chain-gut {
  position: relative;
}
/* A stretch of spine: a centred vertical line in the gutter. */
.ufo-chain-gut::before,
.ufo-chain-gut::after,
.ufo-chain-wire,
.ufo-chain-lanes::before,
.ufo-chain-lanes::after {
  box-sizing: border-box;
  position: absolute;
  border: 0 var(--chain-line-style) var(--chain-line);
  pointer-events: none;
}
.ufo-chain-gut::before,
.ufo-chain-gut::after {
  left: calc(var(--chain-x) - var(--chain-w) / 2);
  width: 0;
  border-left-width: var(--chain-w);
}

/* -- connectors ----------------------------------------------------------- */

.ufo-chain-link {
  min-height: 1.1rem;
}
.ufo-chain-link > .ufo-chain-gut::before {
  content: '';
  top: 0;
  bottom: 0;
}
/* Arrowhead, its tip on the node below. */
.ufo-chain-link > .ufo-chain-gut::after {
  content: '';
  z-index: 2;
  left: calc(var(--chain-x) - 5px);
  bottom: calc(-1 * var(--chain-node-top));
  border-width: 7px 5px 0;
  border-style: solid;
  border-color: var(--chain-line) transparent transparent;
}
.ufo-chain-via {
  display: block;
  margin: 0;
  padding: 5px 0 7px 2px;
  font-family: var(--font-sans);
  font-size: 12.5px;
  font-style: italic;
  line-height: 1.4;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}
/* The kind's default verb: there so the link reads as a sentence, but
   quieter than a label the author wrote. */
.ufo-chain-via.is-verb {
  font-style: normal;
  font-size: 11.5px;
  letter-spacing: 0.02em;
}

/* -- steps ---------------------------------------------------------------- */

.ufo-chain-body > .ufo-chain-gut::before {
  top: 0;
  height: var(--chain-node-top);
}
.ufo-chain-body > .ufo-chain-gut::after {
  top: calc(var(--chain-node-top) + var(--chain-node) / 2);
  bottom: 0;
}
.ufo-chain-body.has-in > .ufo-chain-gut::before,
.ufo-chain-body.has-out > .ufo-chain-gut::after {
  content: '';
}
.ufo-chain-node {
  position: absolute;
  z-index: 1;
  top: var(--chain-node-top);
  left: var(--chain-x);
  transform: translateX(-50%);
  box-sizing: border-box;
  min-width: var(--chain-node);
  height: var(--chain-node);
  padding: 0 5px;
  border: var(--chain-w) solid var(--chain-line);
  border-radius: 999px;
  background: hsl(var(--background));
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 700;
  line-height: calc(var(--chain-node) - 2 * var(--chain-w));
  text-align: center;
  white-space: nowrap;
  color: hsl(var(--foreground));
}

/*
 * Category tint as the surface over an opaque --card base (categorySurface is
 * verified >= 4.5:1 for --foreground on --card), plus a 3px full-strength
 * spine. The name stays --foreground; category also reads through
 * WikiEntityLink's ringed dot, never colour alone.
 */
.ufo-chain-card {
  position: relative;
  min-width: 0;
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

/* -- junctions ------------------------------------------------------------ */

.ufo-chain-junction {
  --junction-y: 17px;
}
.ufo-chain-junction > .ufo-chain-gut::before {
  top: 0;
  height: var(--junction-y);
}
.ufo-chain-junction > .ufo-chain-gut::after {
  content: '';
  top: var(--junction-y);
  bottom: 0;
}
.ufo-chain-junction.has-in > .ufo-chain-gut::before {
  content: '';
}
/* A diamond on the spine: the point where the line divides or meets. */
.ufo-chain-glyph {
  position: absolute;
  z-index: 1;
  top: calc(var(--junction-y) - 6px);
  left: calc(var(--chain-x) - 6px);
  width: 12px;
  height: 12px;
  transform: rotate(45deg);
  background: var(--chain-line);
}
.ufo-chain-junction-text {
  margin: 0;
  padding: 8px 0 6px 2px;
}
.ufo-chain-junction-title {
  display: block;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.4;
  color: hsl(var(--foreground));
}
.ufo-chain-junction-text > .ufo-chain-via {
  padding: 1px 0 0;
}

/* -- lanes ---------------------------------------------------------------- */

/*
 * Stacked by default (a phone, a narrow grid column, or too many branches to
 * fit side by side): lanes are indented off the spine, which runs on down
 * their left edge as a rail, an elbow into each lane's header, and, when the
 * branches rejoin, an elbow back out of each lane's foot.
 *
 * Side by side where every lane fits on one row (container queries below):
 * the spine drops into a bus across the top of the lanes, one drop into each,
 * and a matching bus under them gathers them back when they rejoin.
 *
 * Every difference between the two is a custom property set on the <ul>, so
 * each nested fork re-decides from its own lane's width.
 */
.ufo-chain-lanes {
  --cols: minmax(0, 1fr);
  --indent: var(--chain-g);
  --pad-y: var(--lane-gap);
  --stack: block;
  --side: none;
  --align: start;
  --side-align: start;
  --tail-ext: 5px;
  --rejoin: 0;
  position: relative;
  display: grid;
  grid-template-columns: var(--cols);
  align-items: var(--align);
  gap: var(--lane-gap);
  padding: var(--pad-y) 0 calc(var(--pad-y) * var(--rejoin)) var(--indent);
}
.ufo-chain-lanes.is-rejoining {
  --side-align: stretch;
  --rejoin: 1;
}
@container chain (min-width: 30rem) {
  .ufo-chain-lanes.is-2 {
    --cols: repeat(2, minmax(0, 1fr));
  }
}
@container chain (min-width: 42rem) {
  .ufo-chain-lanes.is-3 {
    --cols: repeat(3, minmax(0, 1fr));
  }
}
@container chain (min-width: 56rem) {
  .ufo-chain-lanes.is-4 {
    --cols: repeat(4, minmax(0, 1fr));
  }
}
@container chain (min-width: 30rem) {
  .ufo-chain-lanes.is-2 {
    --indent: 0px;
    --pad-y: var(--bus-gap);
    --stack: none;
    --side: block;
    --align: var(--side-align);
    --tail-ext: 10px;
  }
}
@container chain (min-width: 42rem) {
  .ufo-chain-lanes.is-3 {
    --indent: 0px;
    --pad-y: var(--bus-gap);
    --stack: none;
    --side: block;
    --align: var(--side-align);
    --tail-ext: 10px;
  }
}
@container chain (min-width: 56rem) {
  .ufo-chain-lanes.is-4 {
    --indent: 0px;
    --pad-y: var(--bus-gap);
    --stack: none;
    --side: block;
    --align: var(--side-align);
    --tail-ext: 10px;
  }
}

.ufo-chain-lane {
  container: chain / inline-size;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin: 0;
  padding: 6px var(--lane-pad) 10px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--muted) / 0.4);
}

/* Lane header: the branch's letter (its steps are numbered after it) and label. */
.ufo-chain-lane-head > .ufo-chain-gut::after {
  content: '';
  top: calc(var(--head-y) - 6px);
  bottom: 0;
}
/* Baseline-aligned, so a label that wraps keeps the letter (and the wire
   into it, at --head-y) on its first line. */
.ufo-chain-lane-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  padding: 4px 0 2px 2px;
}
.ufo-chain-lane-key {
  flex: none;
  min-width: 20px;
  padding: 1px 5px;
  border: 1px solid hsl(var(--foreground) / 0.5);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1.4;
  text-align: center;
  color: hsl(var(--foreground));
}
.ufo-chain-lane-label {
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.4;
  color: hsl(var(--foreground));
}

/* Where branches rejoin, each lane's line runs on to its foot. */
.ufo-chain-tail {
  flex: 1 0 0;
}
.ufo-chain-tail > .ufo-chain-gut::before {
  content: '';
  top: 0;
  bottom: calc(-1 * var(--tail-ext));
}

/*
 * The wires between the spine and the lanes. Lane coordinates: `left` is
 * measured from the lane's padding edge, one border-width inside its box; the
 * lane's own spine sits at --lane-pad + --chain-x from there, and the parent
 * spine (stacked) at --chain-x - --chain-g - 1px.
 */
.ufo-chain-lane {
  --rail-l: calc(var(--chain-x) - var(--chain-g) - 1px - var(--chain-w) / 2);
  --spine-l: calc(var(--lane-pad) + var(--chain-x) - var(--chain-w) / 2);
  --head-y: 19px;
}
/* Stacked: an elbow from the rail into the header. */
.ufo-chain-wire.is-in-stack {
  display: var(--stack);
  left: var(--rail-l);
  top: calc(-1px - var(--lane-gap));
  width: calc(var(--spine-l) - var(--rail-l) + var(--chain-w));
  height: calc(1px + var(--lane-gap) + var(--head-y) + var(--chain-w) / 2);
  border-left-width: var(--chain-w);
  border-bottom-width: var(--chain-w);
  border-bottom-left-radius: 6px;
}
/* Stacked: the rail carrying on past this lane, to the next or to the rejoin. */
.ufo-chain-wire.is-rail {
  display: var(--stack);
  left: var(--rail-l);
  top: var(--head-y);
  bottom: -1px;
  border-left-width: var(--chain-w);
}
.ufo-chain-lane.is-last > .ufo-chain-wire.is-rail {
  bottom: calc(-1px - var(--pad-y));
}
/* Stacked, rejoining: an elbow from the lane's foot back to the rail. */
.ufo-chain-wire.is-out-stack {
  display: var(--stack);
  left: var(--rail-l);
  bottom: 4px;
  width: calc(var(--spine-l) - var(--rail-l) + var(--chain-w));
  height: 12px;
  border-right-width: var(--chain-w);
  border-bottom-width: var(--chain-w);
  border-bottom-right-radius: 6px;
}
/* Side by side: a drop from the bus into the header. */
.ufo-chain-wire.is-in-side {
  display: var(--side);
  left: var(--spine-l);
  top: calc(-1px - var(--bus-gap) / 2);
  height: calc(1px + var(--bus-gap) / 2 + var(--head-y));
  border-left-width: var(--chain-w);
}
/* Side by side, rejoining: a drop from the lane's foot to the lower bus. */
.ufo-chain-wire.is-out-side {
  display: var(--side);
  left: var(--spine-l);
  top: 100%;
  height: calc(1px + var(--bus-gap) / 2);
  border-left-width: var(--chain-w);
}
/*
 * Side by side: the buses. Each runs from the parent spine to the last lane's
 * spine, whose offset from the right is one lane's width less its spine.
 */
.ufo-chain-lanes::before,
.ufo-chain-lanes::after {
  --lane-w: calc((100% - (var(--n) - 1) * var(--lane-gap)) / var(--n));
  display: var(--side);
  left: calc(var(--chain-x) - var(--chain-w) / 2);
  right: calc(var(--lane-w) - 1px - var(--lane-pad) - var(--chain-x) - var(--chain-w) / 2);
  height: calc(var(--bus-gap) / 2 + var(--chain-w) / 2);
  border-left-width: var(--chain-w);
}
.ufo-chain-lanes::before {
  content: '';
  top: 0;
  border-bottom-width: var(--chain-w);
}
.ufo-chain-lanes.is-rejoining::after {
  content: '';
  bottom: 0;
  border-top-width: var(--chain-w);
}
</style>
