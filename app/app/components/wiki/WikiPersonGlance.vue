<script setup lang="ts">
import type { WikiPage } from '@/utils/content'
import { activeLabel, ageAtDeath, formatLifeDate, hasPersonDates, lifeBar, readPersonDates } from '@/utils/person'
import { formatDate } from '@/utils/timeline'

/**
 * The "at a glance" block at the head of a People page: born, died, active
 * years and how much of the channel covers the person, as a row of figures,
 * then the same dates drawn to scale on one bar. Dates come from optional
 * frontmatter (see utils/person.ts); the video figures from `/api/person`, so
 * every person gets at least the coverage line with no authoring.
 */
const props = defineProps<{ page: WikiPage, path: string }>()

const { data: profile } = usePersonProfile(() => props.path)

function raw(key: string): unknown {
  const top = (props.page as unknown as Record<string, unknown>)[key]
  if (top !== undefined && top !== null && top !== '') return top
  const meta = props.page.meta as Record<string, unknown> | undefined
  return meta ? meta[key] : undefined
}

const dates = computed(() => readPersonDates(raw))
const name = computed(() => props.page.title)

const videoCount = computed(() => profile.value?.videos.length ?? 0)
const datedVideos = computed(() => (profile.value?.videos ?? []).map(v => v.published).filter((d): d is string => Boolean(d)))
const coverage = computed<[string, string] | null>(() => {
  const list = datedVideos.value
  return list.length ? [list[0]!, list[list.length - 1]!] : null
})

// Fractional "now" for the open end of a life or an active span. Pinned to
// the build's month on the server and the client alike, so hydration agrees.
const now = (() => {
  const d = new Date()
  return d.getUTCFullYear() + d.getUTCMonth() / 12
})()

const bar = computed(() => lifeBar(dates.value, now, coverage.value))

interface Figure { label: string, value: string, hint?: string }

const figures = computed<Figure[]>(() => {
  const out: Figure[] = []
  const { born, died } = dates.value
  if (born) out.push({ label: 'Born', value: formatLifeDate(born) })
  if (died) {
    const age = ageAtDeath(born, died)
    out.push({ label: 'Died', value: formatLifeDate(died), hint: age === null ? undefined : `Aged ${age}` })
  }
  const active = activeLabel(dates.value)
  if (active) out.push({ label: 'Years active', value: active })
  if (profile.value) {
    out.push({
      label: 'In Gerb\'s videos',
      value: `${videoCount.value} of ${profile.value.channelVideos}`,
      hint: coverage.value ? spanText(coverage.value) : undefined,
    })
    out.push({ label: 'Linked entries', value: String(profile.value.connections.length) })
  }
  return out
})

function spanText([first, last]: [string, string]): string {
  const a = formatDate(first.slice(0, 7))
  const b = formatDate(last.slice(0, 7))
  return a === b ? a : `${a} to ${b}`
}

/** One sentence that says what the bar shows, for screen readers. */
const summary = computed(() => {
  const { born, died, activeFrom, activeTo } = dates.value
  const clauses: string[] = []
  // "Born on 8 Jul 1947" for a full date, "born in 1947" or "in Jul 1947" otherwise.
  const on = (date: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? 'on' : 'in')
  if (born) clauses.push(`was born ${on(born)} ${formatLifeDate(born)}`)
  if (died) clauses.push(`died ${on(died)} ${formatLifeDate(died)}`)
  if (activeFrom !== null) {
    if (activeTo === 'present') clauses.push(`has been active since ${activeFrom}`)
    else if (activeTo === null || activeTo === activeFrom) clauses.push(`was active ${activeTo === null ? 'from' : 'in'} ${activeFrom}`)
    else clauses.push(`was active from ${activeFrom} to ${activeTo}`)
  }
  if (coverage.value) {
    const span = spanText(coverage.value)
    clauses.push(`was covered in Gerb's videos ${span.includes(' to ') ? 'from' : 'in'} ${span}`)
  }
  if (!clauses.length) return ''
  const last = clauses.pop()!
  return `${name.value} ${clauses.length ? `${clauses.join(', ')} and ${last}` : last}.`
})

const show = computed(() => hasPersonDates(dates.value) || videoCount.value > 0)
</script>

<template>
  <section v-if="show" class="ufo-glance mb-8" aria-labelledby="ufo-glance-title">
    <h2 id="ufo-glance-title" class="ufo-glance-kicker">
      At a glance
    </h2>

    <dl v-if="figures.length" class="ufo-glance-figures">
      <div v-for="figure in figures" :key="figure.label" class="ufo-glance-figure">
        <dt class="ufo-glance-label">
          {{ figure.label }}
        </dt>
        <dd class="ufo-glance-value">
          {{ figure.value }}
        </dd>
        <dd v-if="figure.hint" class="ufo-glance-hint">
          {{ figure.hint }}
        </dd>
      </div>
    </dl>

    <figure v-if="bar" class="ufo-glance-bar">
      <p class="sr-only">
        {{ summary }}
      </p>
      <div class="ufo-glance-rows" aria-hidden="true">
        <div v-if="bar.life" class="ufo-glance-row">
          <span class="ufo-glance-row-label">Life</span>
          <span class="ufo-glance-track">
            <span
              class="ufo-glance-span is-life"
              :class="{ 'is-open': bar.life.open }"
              :style="{ left: `${bar.life.from}%`, width: `${Math.max(0.8, bar.life.to - bar.life.from)}%` }"
            />
          </span>
        </div>
        <div v-if="bar.active" class="ufo-glance-row">
          <span class="ufo-glance-row-label">Active</span>
          <span class="ufo-glance-track">
            <span
              class="ufo-glance-span is-active"
              :class="{ 'is-open': bar.active.open }"
              :style="{ left: `${bar.active.from}%`, width: `${Math.max(0.8, bar.active.to - bar.active.from)}%` }"
            />
          </span>
        </div>
        <div v-if="bar.coverage" class="ufo-glance-row">
          <span class="ufo-glance-row-label">Videos</span>
          <span class="ufo-glance-track">
            <span
              class="ufo-glance-span is-videos"
              :style="{ left: `${bar.coverage.from}%`, width: `${Math.max(0.8, bar.coverage.to - bar.coverage.from)}%` }"
            />
          </span>
        </div>
        <div class="ufo-glance-row ufo-glance-axis-row">
          <span class="ufo-glance-row-label" />
          <span class="ufo-glance-axis">
            <span
              v-for="tick in bar.ticks"
              :key="tick.year"
              class="ufo-glance-tick"
              :style="{ left: `${tick.pct}%` }"
            >{{ tick.year }}</span>
          </span>
        </div>
      </div>
      <figcaption class="ufo-glance-caption">
        <template v-if="bar.life?.open">
          The Life bar fades out because no date of death is recorded.
        </template>
        <template v-if="bar.coverage">
          The Videos bar runs from the first to the last of Gerb's videos about {{ name }}.
        </template>
      </figcaption>
    </figure>
  </section>
</template>

<style scoped>
.ufo-glance-kicker {
  margin-bottom: 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: hsl(var(--primary));
}

.ufo-glance-figures {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--border));
}
.ufo-glance-figure {
  padding: 12px 14px;
  background: hsl(var(--card));
}
.ufo-glance-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}
.ufo-glance-value {
  margin-top: 6px;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.15;
  color: hsl(var(--foreground));
}
.ufo-glance-hint {
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 16px;
  color: hsl(var(--muted-foreground));
}

.ufo-glance-bar {
  margin-top: 14px;
  padding: 14px 14px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
}
.ufo-glance-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ufo-glance-row {
  display: grid;
  grid-template-columns: 56px 1fr;
  align-items: center;
  gap: 10px;
}
.ufo-glance-row-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}
.ufo-glance-track {
  position: relative;
  height: 12px;
  border-radius: 9999px;
  background: hsl(var(--muted-foreground) / 0.12);
}
.ufo-glance-span {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 9999px;
}
.ufo-glance-span.is-life {
  background: hsl(var(--graph-cat-people));
}
.ufo-glance-span.is-active {
  background: hsl(var(--primary));
}
.ufo-glance-span.is-videos {
  background: hsl(var(--graph-cat-videos));
  border: 1px solid hsl(var(--foreground) / 0.35);
}
/* An open end fades out rather than stopping: no claim that the span ended. */
.ufo-glance-span.is-open {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  mask-image: linear-gradient(to right, #000 70%, transparent);
}
.ufo-glance-axis {
  position: relative;
  height: 16px;
}
.ufo-glance-tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}
.ufo-glance-tick:first-child {
  transform: none;
}
.ufo-glance-tick:last-child {
  transform: translateX(-100%);
}
.ufo-glance-caption {
  margin-top: 6px;
  font-family: var(--font-sans);
  font-size: 12px;
  line-height: 18px;
  color: hsl(var(--muted-foreground));
}
.ufo-glance-caption:empty {
  display: none;
}
</style>
