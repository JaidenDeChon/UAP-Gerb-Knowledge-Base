<script setup lang="ts">
import type { Component } from 'vue'
import type { NoteRef } from '#shared/types/wiki'
import { CircleHelp, CircleMinus, CirclePlus, Mic, Quote } from '@lucide/vue'
import { categoryMark, categorySurface } from '@/utils/category'
import {
  buildClaims,
  CLAIM_STANCE_HINT,
  CLAIM_STANCE_LABEL,
  joinSpeakers,
  type Claim,
  type ClaimInput,
  type ClaimResponse,
  type ClaimResponseInput,
  type ClaimStance,
} from '@/utils/claim'

/**
 * `::wiki-claim` — a claim and the attributed responses to it: who made the
 * claim (and when, and where), then each reply labelled with its speaker and
 * a stance tag ("Supports", "Challenges", "Host's view", "Unresolved"). One
 * block can hold several claims, each kept together with its own replies, so
 * nothing loses track of what answers what when the page narrows to a phone.
 *
 * Stance is carried by the tag's word and glyph first; its tone (border,
 * glyph, spine) only reinforces it. The markup is an ordered list of claims,
 * each followed by a named list of responses. Nothing animates.
 */
const props = withDefaults(
  defineProps<{
    /** A single claim (shorthand). Ignored when `claims` has entries. */
    claim?: ClaimInput
    /** Responses to the single `claim`. */
    responses?: ClaimResponseInput[]
    /** Several claims, each with its own `responses`. */
    claims?: ClaimInput[]
    /** Overrides the kicker ("Claim and response" / "Claims and responses"). */
    label?: string
    /** The word on each claim card's tag: "Claim", or e.g. "Objection", "Explanation". */
    term?: string
    /** Optional caption under the block; also folded into the list's accessible name. */
    caption?: string
    /** YouTube id; gates the cue chips, like `::wiki-timeline`'s `video`. */
    video?: string
    videoTitle?: string
  }>(),
  {
    claim: undefined,
    responses: () => [],
    claims: () => [],
    label: '',
    term: '',
    caption: '',
    video: '',
    videoTitle: '',
  },
)

const STANCE_ICON: Record<ClaimStance, Component> = {
  supports: CirclePlus,
  challenges: CircleMinus,
  host: Mic,
  unresolved: CircleHelp,
}

const model = computed(() => buildClaims(props.claim, props.responses, props.claims))

const { refs } = useWikiResolve(() => model.value.names)

function refOf(name: string): NoteRef | undefined {
  return refs.value.get(name.trim())
}

const many = computed(() => model.value.claims.length > 1)
const kicker = computed(() => props.label.trim() || (many.value ? 'Claims and responses' : 'Claim and response'))
const term = computed(() => props.term.trim() || 'Claim')
const listLabel = computed(() => props.caption ? `${kicker.value}: ${props.caption}` : kicker.value)

/** The claim card takes the category tint of its first speaker that has a page. */
function claimCategory(c: Claim) {
  for (const n of c.by) {
    const r = refOf(n)
    if (r) return r.category
  }
  return undefined
}

function claimTag(i: number): string {
  return many.value ? `${term.value} ${i + 1}` : term.value
}

function claimCueTitle(c: Claim, i: number): string {
  const who = joinSpeakers(c.by)
  const head = c.title || claimTag(i)
  return who ? `${head}, ${who}` : head
}

function responseCueTitle(r: ClaimResponse): string {
  const who = joinSpeakers(r.by)
  const stance = r.stance ? CLAIM_STANCE_LABEL[r.stance] : 'Response'
  return who ? `${stance}: ${who}` : stance
}

function responsesLabel(c: Claim, i: number): string {
  return `Responses to ${c.title ? `"${c.title}"` : claimTag(i).toLowerCase()}`
}
</script>

<template>
  <figure v-if="model.claims.length" class="ufo-claim">
    <p class="ufo-claim-kicker" aria-hidden="true">
      {{ kicker }}
    </p>
    <ol class="ufo-claim-list" :class="{ 'is-many': many }" :aria-label="listLabel">
      <li v-for="(c, i) in model.claims" :key="i" class="ufo-claim-item">
        <div
          class="ufo-claim-card"
          :style="{
            '--claim-mark': categoryMark(claimCategory(c)),
            '--claim-surface': claimCategory(c) ? categorySurface(claimCategory(c)) : 'transparent',
          }"
        >
          <div class="ufo-claim-head">
            <span class="ufo-claim-tag">
              <Quote class="ufo-claim-tag-icon" aria-hidden="true" />
              {{ claimTag(i) }}
            </span>
            <span v-if="c.by.length" class="ufo-claim-by">
              <template v-for="(n, ni) in c.by" :key="n">
                <template v-if="ni > 0">{{ ni === c.by.length - 1 ? ' and ' : ', ' }}</template>
                <WikiEntityLink :name="n" :ref-data="refOf(n)" variant="inline" />
              </template>
            </span>
            <span v-if="c.date || c.where" class="ufo-claim-when">
              <span v-if="c.date">{{ c.date }}</span>
              <span v-if="c.date && c.where" aria-hidden="true"> · </span>
              <span v-if="c.where" class="ufo-claim-where">{{ c.where }}</span>
            </span>
            <span v-if="c.cue !== null && props.video" class="ufo-claim-cue">
              <WikiCue
                :t="c.cue"
                :approx="c.cueApprox"
                :video="props.video"
                :video-title="props.videoTitle"
                :entry-title="claimCueTitle(c, i)"
              />
            </span>
          </div>
          <p v-if="c.note" class="ufo-claim-note">{{ c.note }}</p>
          <p v-if="c.title" class="ufo-claim-title">{{ c.title }}</p>
          <p class="ufo-claim-text">{{ c.text }}</p>
        </div>

        <ul v-if="c.responses.length" class="ufo-claim-responses" :aria-label="responsesLabel(c, i)">
          <li
            v-for="(r, ri) in c.responses"
            :key="ri"
            class="ufo-claim-response"
            :class="r.stance ? `is-${r.stance}` : 'is-none'"
          >
            <div class="ufo-claim-head">
              <span v-if="r.stance" class="ufo-claim-stance" :title="CLAIM_STANCE_HINT[r.stance]">
                <component :is="STANCE_ICON[r.stance]" class="ufo-claim-stance-icon" aria-hidden="true" />
                {{ CLAIM_STANCE_LABEL[r.stance] }}
              </span>
              <span v-if="r.by.length" class="ufo-claim-by">
                <template v-for="(n, ni) in r.by" :key="n">
                  <template v-if="ni > 0">{{ ni === r.by.length - 1 ? ' and ' : ', ' }}</template>
                  <WikiEntityLink :name="n" :ref-data="refOf(n)" variant="inline" />
                </template>
              </span>
              <span v-if="r.date" class="ufo-claim-when">{{ r.date }}</span>
              <span v-if="r.cue !== null && props.video" class="ufo-claim-cue">
                <WikiCue
                  :t="r.cue"
                  :approx="r.cueApprox"
                  :video="props.video"
                  :video-title="props.videoTitle"
                  :entry-title="responseCueTitle(r)"
                />
              </span>
            </div>
            <p class="ufo-claim-text is-response">{{ r.text }}</p>
          </li>
        </ul>
      </li>
    </ol>
    <figcaption v-if="props.caption" class="ufo-claim-caption">
      {{ props.caption }}
    </figcaption>
  </figure>
</template>

<style scoped>
/*
 * Every element carries a class, so the page's classless prose rules for
 * p / ol / ul / li never reach it (gotcha 4b). Layout is one column at every
 * width: a claim card, then its responses hanging off a thread line beneath
 * it. The `claim` container only tightens the indent on narrow columns.
 */
.ufo-claim {
  container: claim / inline-size;
  margin: 1.75rem 0;
  /* The thread joining replies to their claim: a mark, not text, and
     decorative (the list structure carries the grouping), so a muted tone. */
  --claim-thread: hsl(var(--muted-foreground) / 0.45);
}
.ufo-claim-kicker {
  margin: 0 0 8px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  line-height: 1.4;
  color: hsl(var(--muted-foreground));
}
.ufo-claim-list,
.ufo-claim-responses {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ufo-claim-list {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}
/* Several claims: a hairline between groups so each reads as one unit. */
.ufo-claim-list.is-many > .ufo-claim-item + .ufo-claim-item {
  padding-top: 1.1rem;
  border-top: 1px solid hsl(var(--border));
}
.ufo-claim-item {
  margin: 0;
  padding: 0;
}

/* -- shared header row ---------------------------------------------------- */

.ufo-claim-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}
.ufo-claim-by {
  font-family: var(--font-sans);
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  color: hsl(var(--foreground));
}
/* Meta text sits on the claimant's category tint, where --muted-foreground
   drops under 4.5:1 in light and sepia; a softened --foreground clears it. */
.ufo-claim-when {
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
  color: hsl(var(--foreground) / 0.78);
}
.ufo-claim-where {
  font-style: italic;
  font-family: var(--font-sans);
  font-size: 12px;
}
/* The cue sits at the end of the header row, and wraps under it when narrow. */
.ufo-claim-cue {
  margin-left: auto;
  display: inline-flex;
}
.ufo-claim-text {
  margin: 6px 0 0;
  font-family: var(--font-sans);
  font-size: 14.5px;
  line-height: 1.55;
  color: hsl(var(--foreground));
}
.ufo-claim-text.is-response {
  margin-top: 5px;
  font-size: 14px;
}

/* -- the claim card ------------------------------------------------------- */

/*
 * Tinted by the claimant's category over an opaque --card base
 * (categorySurface is verified >= 4.5:1 for --foreground on --card), with a
 * 3px spine, like ::wiki-chain's step cards. An unlinked claimant gets a
 * neutral card and a muted spine.
 */
.ufo-claim-card {
  position: relative;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  padding: 10px 14px 12px 16px;
  background-color: hsl(var(--card));
  background-image: linear-gradient(var(--claim-surface, transparent), var(--claim-surface, transparent));
  box-shadow: inset 3px 0 0 var(--claim-mark, hsl(var(--muted-foreground)));
}
.ufo-claim-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 16px;
  color: hsl(var(--foreground));
}
.ufo-claim-tag-icon {
  width: 11px;
  height: 11px;
  flex: none;
  color: hsl(var(--muted-foreground));
}
.ufo-claim-title {
  margin: 6px 0 0;
  font-family: var(--font-display);
  font-size: 15.5px;
  font-weight: 600;
  line-height: 1.3;
  color: hsl(var(--foreground));
}
.ufo-claim-title + .ufo-claim-text {
  margin-top: 3px;
}
.ufo-claim-note {
  margin: 2px 0 0;
  font-family: var(--font-sans);
  font-size: 12.5px;
  line-height: 1.45;
  color: hsl(var(--foreground) / 0.78);
}
/* A long name wraps: keep the category dot on its first line. */
.ufo-claim-by :deep(.ufo-entity-link) {
  align-items: flex-start;
}
.ufo-claim-by :deep(.ufo-entity-dot) {
  margin-top: 0.38em;
}

/* -- responses ------------------------------------------------------------ */

/*
 * Responses hang off a thread line that drops from the claim card, each
 * joined to it by a short tick, so a reply visibly belongs to the claim
 * above it at any width.
 */
.ufo-claim-responses {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 0 1.1rem;
  padding: 10px 0 0 1.1rem;
  border-left: 2px solid var(--claim-thread);
}
@container claim (max-width: 26rem) {
  .ufo-claim-responses {
    margin-left: 0.5rem;
    padding-left: 0.75rem;
  }
}
.ufo-claim-response {
  --tone: var(--muted-foreground);
  position: relative;
  margin: 0;
  padding: 8px 12px 10px 13px;
  border: 1px solid hsl(var(--border));
  border-left: 3px solid hsl(var(--tone));
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
}
.ufo-claim-response::before {
  content: '';
  position: absolute;
  top: 1.05rem;
  left: calc(-1.1rem - 5px);
  width: calc(1.1rem + 2px);
  border-top: 2px solid var(--claim-thread);
}
@container claim (max-width: 26rem) {
  .ufo-claim-response::before {
    left: calc(-0.75rem - 5px);
    width: calc(0.75rem + 2px);
  }
}
/*
 * Stance tones, each measured >= 3:1 against --card as a mark in all four
 * themes (spine and glyph): green, blue, purple, and a dashed grey for
 * "unresolved". --graph-cat-videos was tried for the host and rejected: it
 * falls to 1.9:1 in light and sepia.
 */
.ufo-claim-response.is-supports { --tone: var(--primary); }
.ufo-claim-response.is-challenges { --tone: var(--graph-cat-orgs); }
.ufo-claim-response.is-host { --tone: var(--graph-cat-events); }
.ufo-claim-response.is-unresolved { border-left-style: dashed; }

/*
 * Stance tag: word + glyph + tone, like ::wiki-compare's markers. The word is
 * always --foreground (the tone tokens fail 4.5:1 as text in some themes);
 * tone lives in the border, the glyph and a faint wash over an opaque --card
 * base. "Unresolved" is also dashed, so every stance reads without hue.
 */
.ufo-claim-stance {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px 1px 5px;
  border: 1px solid hsl(var(--tone) / 0.7);
  border-radius: var(--radius-sm);
  background-color: hsl(var(--card));
  background-image: linear-gradient(hsl(var(--tone) / 0.1), hsl(var(--tone) / 0.1));
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 16px;
  text-transform: uppercase;
  color: hsl(var(--foreground));
  white-space: nowrap;
}
.ufo-claim-response.is-unresolved .ufo-claim-stance {
  border-style: dashed;
}
.ufo-claim-stance-icon {
  width: 11px;
  height: 11px;
  flex: none;
  color: hsl(var(--tone));
}

.ufo-claim-caption {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
}
</style>
