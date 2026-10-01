<script setup lang="ts">
import type { Category } from '#shared/types/wiki'
import { type AffiliationInput, affiliationAxis, barGeometry, buildAffiliations } from '@/utils/affiliations'
import { categoryBorder, categorySurface } from '@/utils/category'

/**
 * `::wiki-affiliations` — where a person worked, served or belonged, and
 * when: one row per organization (or role), each with a bar on a shared axis
 * of years, so overlaps and gaps in a career read at a glance. Every row also
 * states its years in words, so the bars are never the only way to read it.
 *
 * Rows are sorted by start date. Below a 36rem container the label sits
 * above its bar instead of beside it; nothing scrolls sideways. Nothing
 * animates.
 */
const props = withDefaults(
  defineProps<{
    rows?: AffiliationInput[]
    /** Replaces the "Affiliations over time" kicker. */
    label?: string
    caption?: string
  }>(),
  { rows: () => [], label: '', caption: '' },
)

const now = (() => {
  const d = new Date()
  return d.getUTCFullYear() + (d.getUTCMonth() + 1) / 12
})()

const model = computed(() => buildAffiliations(props.rows, now))
const axis = computed(() => affiliationAxis(model.value.rows))
const { refs } = useWikiResolve(() => model.value.names)

const kicker = computed(() => props.label.trim() || 'Affiliations over time')

function category(label: string, linked: boolean): Category | undefined {
  return linked ? refs.value.get(label)?.category : undefined
}
</script>

<template>
  <figure v-if="model.rows.length && axis" class="ufo-aff">
    <p class="ufo-aff-kicker" aria-hidden="true">
      {{ kicker }}
    </p>

    <div class="ufo-aff-grid">
      <div class="ufo-aff-axis-row" aria-hidden="true">
        <span />
        <span class="ufo-aff-axis">
          <span
            v-for="tick in axis.ticks"
            :key="tick.year"
            class="ufo-aff-tick"
            :style="{ left: `${tick.pct}%` }"
          >{{ tick.year }}</span>
        </span>
      </div>

      <ol class="ufo-aff-list" :aria-label="props.caption ? `${kicker}: ${props.caption}` : kicker">
        <li v-for="row in model.rows" :key="row.key" class="ufo-aff-row">
          <div class="ufo-aff-label">
            <WikiEntityLink
              v-if="row.linked"
              :name="row.label"
              :ref-data="refs.get(row.label)"
            />
            <span v-else class="ufo-aff-plain">{{ row.label }}</span>
            <p v-if="row.role" class="ufo-aff-role">
              {{ row.role }}
            </p>
            <p class="ufo-aff-span">
              {{ row.span }}
            </p>
          </div>
          <div class="ufo-aff-track" aria-hidden="true">
            <span
              v-for="tick in axis.ticks"
              :key="tick.year"
              class="ufo-aff-gridline"
              :style="{ left: `${tick.pct}%` }"
            />
            <span
              class="ufo-aff-bar"
              :class="{ 'is-approx': row.approx, 'is-open': row.ongoing || row.openEnded }"
              :style="{
                left: `${barGeometry(row, axis).left}%`,
                width: `${barGeometry(row, axis).width}%`,
                '--aff-surface': categorySurface(category(row.label, row.linked)),
                '--aff-border': categoryBorder(category(row.label, row.linked)),
              }"
            />
          </div>
          <p v-if="row.note" class="ufo-aff-note">
            {{ row.note }}
          </p>
        </li>
      </ol>
    </div>

    <figcaption v-if="props.caption" class="ufo-aff-caption">
      {{ props.caption }}
    </figcaption>
  </figure>
</template>

<style scoped>
.ufo-aff {
  container: aff / inline-size;
  margin: 1.75rem 0;
}
.ufo-aff-kicker {
  margin: 0 0 8px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  line-height: 1.4;
  color: hsl(var(--muted-foreground));
}
.ufo-aff-grid {
  padding: 12px 14px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
}

/* Narrow: label above its bar. Wide: label column beside the bars. */
.ufo-aff-axis-row,
.ufo-aff-row {
  display: grid;
  grid-template-columns: 1fr;
  column-gap: 14px;
}
.ufo-aff-axis-row > span:first-child {
  display: none;
}
@container aff (min-width: 36rem) {
  .ufo-aff-axis-row,
  .ufo-aff-row {
    grid-template-columns: minmax(170px, 34%) 1fr;
  }
  .ufo-aff-axis-row > span:first-child {
    display: block;
  }
  .ufo-aff-note {
    grid-column: 2;
  }
}

.ufo-aff-axis {
  position: relative;
  height: 18px;
  margin: 0 8px;
}
.ufo-aff-tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.ufo-aff-list {
  display: flex;
  flex-direction: column;
}
.ufo-aff-row {
  align-items: center;
  row-gap: 6px;
  padding: 10px 0;
  border-top: 1px solid hsl(var(--border));
}
.ufo-aff-label {
  min-width: 0;
}
.ufo-aff-plain {
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  color: hsl(var(--foreground));
}
.ufo-aff-role {
  margin-top: 4px;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 18px;
  color: hsl(var(--foreground));
}
.ufo-aff-span {
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 16px;
  color: hsl(var(--muted-foreground));
}
.ufo-aff-track {
  position: relative;
  height: 16px;
  margin: 0 8px;
}
.ufo-aff-gridline {
  position: absolute;
  top: -4px;
  bottom: -4px;
  width: 1px;
  background: hsl(var(--border));
}
.ufo-aff-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 4px;
  background: var(--aff-surface);
  border: 2px solid var(--aff-border);
}
/* An estimate gets dashed ends; a span that runs on (or whose end isn't
   known) loses its right edge and fades, so it never claims to have ended. */
.ufo-aff-bar.is-approx {
  border-style: dashed;
}
.ufo-aff-bar.is-open {
  border-right: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  mask-image: linear-gradient(to right, #000 75%, transparent);
}
.ufo-aff-note {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 19px;
  color: hsl(var(--muted-foreground));
}
.ufo-aff-caption {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
}
</style>
