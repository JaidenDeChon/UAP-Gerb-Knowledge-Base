<script setup lang="ts">
import type { Category } from '#shared/types/wiki'
import { categoryMark, categorySurface } from '@/utils/category'
import {
  buildCompare,
  COMPARE_MARK_HINT,
  type CompareRowInput,
  type CompareSubjectInput,
} from '@/utils/compare'

/**
 * `::wiki-compare` — a subjects-by-attributes matrix. One column per subject
 * (witness account, craft, case, program), one row per attribute, each cell
 * optionally carrying an agreement marker and a cue chip.
 *
 * Desktop: a real <table> with a sticky attribute column. Narrow containers
 * (a phone, or a narrow grid column) switch by container query to one card
 * per ATTRIBUTE, listing each subject's value under it, so the comparison a
 * row makes stays together and nothing scrolls sideways.
 */
const props = withDefaults(
  defineProps<{
    subjects?: CompareSubjectInput[]
    rows?: CompareRowInput[]
    /** Optional caption; also the table's accessible name. */
    caption?: string
    /** Label for the attribute column's header cell. */
    attributeLabel?: string
    /** YouTube id; gates the cue chips, like `::wiki-timeline`'s `video`. */
    video?: string
    videoTitle?: string
  }>(),
  { subjects: () => [], rows: () => [], caption: '', attributeLabel: '', video: '', videoTitle: '' },
)

const captionId = useId()

const model = computed(() => buildCompare(props.subjects, props.rows))

const { refs } = useWikiResolve(() => model.value.subjects.map(s => s.name))

function refOf(name: string) {
  return refs.value.get(name.trim())
}
function catOf(name: string): Category | undefined {
  return refOf(name)?.category
}

function cueTitle(subject: string, attribute: string): string {
  return `${subject}: ${attribute}`
}
</script>

<template>
  <figure
    v-if="model.subjects.length && model.rows.length"
    class="ufo-cmp"
    :class="`ufo-cmp--n${Math.min(model.subjects.length, 6)}`"
  >
    <!-- Desktop / wide container: the matrix itself. -->
    <div class="ufo-cmp-scroll">
      <table class="ufo-cmp-table" :aria-labelledby="props.caption ? captionId : undefined">
        <thead>
          <tr>
            <th scope="col" class="ufo-cmp-corner ufo-cmp-corner">
              <span class="ufo-cmp-kicker">{{ props.attributeLabel }}</span>
            </th>
            <th
              v-for="(s, si) in model.subjects"
              :key="si"
              scope="col"
              class="ufo-cmp-subject ufo-cmp-subject"
              :style="{
                '--subj-mark': categoryMark(catOf(s.name)),
                '--subj-surface': categorySurface(catOf(s.name)),
              }"
            >
              <span class="ufo-cmp-subject-name">
                <WikiEntityLink :name="s.name" :ref-data="refOf(s.name)" variant="inline" />
              </span>
              <span v-if="s.note" class="ufo-cmp-subject-note">{{ s.note }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in model.rows" :key="ri">
            <th scope="row" class="ufo-cmp-attr ufo-cmp-attr">
              <span class="ufo-cmp-attr-name">{{ row.attribute }}</span>
              <span v-if="row.note" class="ufo-cmp-attr-note">{{ row.note }}</span>
              <span v-if="row.cue !== null && props.video" class="ufo-cmp-attr-cue">
                <WikiCue
                  :t="row.cue"
                  :approx="row.cueApprox"
                  :video="props.video"
                  :video-title="props.videoTitle"
                  :entry-title="row.attribute"
                />
              </span>
            </th>
            <td
              v-for="(cell, ci) in row.cells"
              :key="ci"
              class="ufo-cmp-cell ufo-cmp-cell"
            >
              <WikiCompareCell
                :cell="cell"
                :video="props.video"
                :video-title="props.videoTitle"
                :entry-title="cueTitle(model.subjects[ci]!.name, row.attribute)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Narrow container: one card per attribute, each subject's value listed under it. -->
    <div class="ufo-cmp-cards">
      <!-- Subject notes appear once, as a key, rather than in every card. -->
      <ul v-if="model.subjects.some(s => s.note)" class="ufo-cmp-key" aria-label="Compared">
        <li v-for="(s, si) in model.subjects" :key="si" class="ufo-cmp-key-item">
          <span class="ufo-cmp-key-name">{{ s.name }}</span>
          <span v-if="s.note" class="ufo-cmp-key-note">{{ s.note }}</span>
        </li>
      </ul>
      <section
        v-for="(row, ri) in model.rows"
        :key="ri"
        class="ufo-cmp-card"
      >
        <div class="ufo-cmp-card-head">
          <h4 class="ufo-cmp-card-title">
            {{ row.attribute }}
            <span v-if="row.note" class="ufo-cmp-attr-note">{{ row.note }}</span>
          </h4>
          <WikiCue
            v-if="row.cue !== null && props.video"
            :t="row.cue"
            :approx="row.cueApprox"
            :video="props.video"
            :video-title="props.videoTitle"
            :entry-title="row.attribute"
          />
        </div>
        <dl class="ufo-cmp-card-list">
          <div
            v-for="(cell, ci) in row.cells"
            :key="ci"
            class="ufo-cmp-card-item"
            :style="{ '--subj-mark': categoryMark(catOf(model.subjects[ci]!.name)) }"
          >
            <dt class="ufo-cmp-card-subject">
              <WikiEntityLink
                :name="model.subjects[ci]!.name"
                :ref-data="refOf(model.subjects[ci]!.name)"
                variant="inline"
              />
            </dt>
            <dd class="ufo-cmp-card-value">
              <WikiCompareCell
                :cell="cell"
                :video="props.video"
                :video-title="props.videoTitle"
                :entry-title="cueTitle(model.subjects[ci]!.name, row.attribute)"
              />
            </dd>
          </div>
        </dl>
      </section>
    </div>

    <figcaption v-if="props.caption || model.marks.length" class="ufo-cmp-foot">
      <span v-if="props.caption" :id="captionId" class="ufo-cmp-caption">{{ props.caption }}</span>
      <span v-if="model.marks.length" class="ufo-cmp-legend">
        <span v-for="m in model.marks" :key="m" class="ufo-cmp-legend-item">
          <WikiCompareCell :mark="m" />
          <span class="ufo-cmp-legend-hint">{{ COMPARE_MARK_HINT[m] }}</span>
        </span>
      </span>
    </figcaption>
  </figure>
</template>

<style scoped>
/*
 * Container query, not a viewport breakpoint: the matrix can sit in a narrow
 * grid column on a wide screen just as easily as on a phone.
 */
.ufo-cmp {
  container-type: inline-size;
  margin: 1.75rem 0;
}


/* -- table (wide) --------------------------------------------------------- */

.ufo-cmp-scroll {
  overflow-x: auto;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
}

/*
 * Gotcha 4: the page styles every prose <table>/<th>/<td> at (0,2,1). Each
 * rule that resets border/padding/margin here repeats its own class, which
 * outranks it without !important.
 */
.ufo-cmp-table.ufo-cmp-table {
  width: 100%;
  margin: 0;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 14px;
  line-height: 1.45;
}
.ufo-cmp-corner.ufo-cmp-corner,
.ufo-cmp-subject.ufo-cmp-subject,
.ufo-cmp-attr.ufo-cmp-attr,
.ufo-cmp-cell.ufo-cmp-cell {
  border: 0;
  border-bottom: 1px solid hsl(var(--border));
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
}
tbody tr:last-child > .ufo-cmp-attr.ufo-cmp-attr,
tbody tr:last-child > .ufo-cmp-cell.ufo-cmp-cell {
  border-bottom: 0;
}
.ufo-cmp-cell.ufo-cmp-cell + .ufo-cmp-cell.ufo-cmp-cell,
.ufo-cmp-subject.ufo-cmp-subject + .ufo-cmp-subject.ufo-cmp-subject {
  border-left: 1px solid hsl(var(--border));
}

/* Sticky attribute column: opaque so scrolled cells pass beneath it. */
.ufo-cmp-corner.ufo-cmp-corner,
.ufo-cmp-attr.ufo-cmp-attr {
  position: sticky;
  left: 0;
  z-index: 1;
  width: 1%;
  min-width: 7rem;
  max-width: 11rem;
  background: hsl(var(--muted));
  border-right: 1px solid hsl(var(--border));
}
.ufo-cmp-corner.ufo-cmp-corner {
  vertical-align: bottom;
}
.ufo-cmp-kicker {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}

/*
 * Subject header: category tint as the surface (categorySurface, verified
 * >= 4.5:1 for --foreground over --card) on an opaque --card base, plus a
 * full-strength 3px top rule. The name keeps --foreground; category is
 * carried by the rule and WikiEntityLink's ringed dot, never colour alone.
 */
.ufo-cmp-subject.ufo-cmp-subject {
  min-width: 8rem;
  background-color: hsl(var(--card));
  background-image: linear-gradient(var(--subj-surface), var(--subj-surface));
  box-shadow: inset 0 3px 0 var(--subj-mark);
  padding-top: 13px;
}
.ufo-cmp-subject-name {
  display: block;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  color: hsl(var(--foreground));
}
.ufo-cmp-subject-note {
  display: block;
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.35;
  color: hsl(var(--foreground));
  opacity: 0.8;
}

.ufo-cmp-attr-name {
  display: block;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.ufo-cmp-attr-note {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.ufo-cmp-attr-cue {
  display: block;
  margin-top: 6px;
}
.ufo-cmp-cell.ufo-cmp-cell {
  color: hsl(var(--foreground));
}

/* -- cards (narrow) ------------------------------------------------------- */

.ufo-cmp-cards {
  display: none;
}
.ufo-cmp-card {
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
  overflow: hidden;
}
.ufo-cmp-card + .ufo-cmp-card {
  margin-top: 10px;
}
.ufo-cmp-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: hsl(var(--muted));
  border-bottom: 1px solid hsl(var(--border));
}
.ufo-cmp-card-title {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: hsl(var(--foreground));
}
.ufo-cmp-card-list {
  margin: 0;
}
.ufo-cmp-card-item {
  padding: 9px 12px 10px 13px;
  box-shadow: inset 3px 0 0 var(--subj-mark);
}
.ufo-cmp-card-item + .ufo-cmp-card-item {
  border-top: 1px solid hsl(var(--border));
}
.ufo-cmp-card-subject {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: hsl(var(--foreground));
}
.ufo-cmp-key {
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
  line-height: 1.45;
  color: hsl(var(--muted-foreground));
}
.ufo-cmp-key-item + .ufo-cmp-key-item {
  margin-top: 2px;
}
.ufo-cmp-key-name {
  font-weight: 600;
  color: hsl(var(--foreground));
}
.ufo-cmp-key-name::after {
  content: ':';
}
.ufo-cmp-key-name:last-child::after {
  content: none;
}
.ufo-cmp-key-note {
  margin-left: 5px;
}
.ufo-cmp-card-value {
  margin: 3px 0 0;
  font-size: 14px;
  line-height: 1.5;
  color: hsl(var(--foreground));
}

/*
 * Pivot to cards before the table would need to scroll sideways: the
 * attribute column (min 7rem) plus 8rem per subject, and never below 36rem
 * (a phone always gets cards). One rule per subject count, since a
 * container query can't read a custom property.
 */
@container (max-width: 36rem) {
  .ufo-cmp-scroll { display: none; }
  .ufo-cmp-cards { display: block; }
}
@container (max-width: 40rem) {
  .ufo-cmp--n4 .ufo-cmp-scroll { display: none; }
  .ufo-cmp--n4 .ufo-cmp-cards { display: block; }
}
@container (max-width: 48rem) {
  .ufo-cmp--n5 .ufo-cmp-scroll { display: none; }
  .ufo-cmp--n5 .ufo-cmp-cards { display: block; }
}
@container (max-width: 56rem) {
  .ufo-cmp--n6 .ufo-cmp-scroll { display: none; }
  .ufo-cmp--n6 .ufo-cmp-cards { display: block; }
}

/* -- caption + legend ----------------------------------------------------- */

.ufo-cmp-foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
}
.ufo-cmp-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}
.ufo-cmp-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ufo-cmp-legend-hint {
  font-size: 12px;
}
</style>
