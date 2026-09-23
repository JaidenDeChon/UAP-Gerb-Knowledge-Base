/**
 * Pure normalisation behind `::wiki-claim` (WikiClaim.vue): turns the loosely
 * typed YAML an author writes into a clean list of claims, each with its
 * attributed responses, that the component can render without further
 * guarding. No Nuxt runtime, so it is unit-tested directly.
 *
 * A block holds one claim (the `claim:` + `responses:` shorthand) or several
 * (`claims:`, each carrying its own `responses:`). Every claim and response
 * names who said it (`by`), because the vault's rule is "attribute, don't
 * debunk": who says what matters more than any verdict.
 */
import { formatDate } from './timeline'

/** Where a response stands on the claim it answers. */
export type ClaimStance = 'supports' | 'challenges' | 'host' | 'unresolved'

export const CLAIM_STANCES: readonly ClaimStance[] = ['supports', 'challenges', 'host', 'unresolved']

/** Visible text for each stance tag: stance is never colour alone. */
export const CLAIM_STANCE_LABEL: Record<ClaimStance, string> = {
  supports: 'Supports',
  challenges: 'Challenges',
  host: 'Host\'s view',
  unresolved: 'Unresolved',
}

/** One-line meaning for each stance, used as the tag's tooltip. */
export const CLAIM_STANCE_HINT: Record<ClaimStance, string> = {
  supports: 'Backs the claim',
  challenges: 'Disputes the claim',
  host: 'The video host\'s own reading',
  unresolved: 'Leaves the question open',
}

/**
 * Spellings an author might reach for, mapped to a stance. Anything else is
 * no stance at all (the response renders with its speaker and no tag), never
 * a guessed one.
 */
const STANCE_ALIASES: Record<string, ClaimStance> = {
  'supports': 'supports',
  'support': 'supports',
  'for': 'supports',
  'challenges': 'challenges',
  'challenge': 'challenges',
  'against': 'challenges',
  'host': 'host',
  'host\'s view': 'host',
  'hosts view': 'host',
  'host view': 'host',
  'host-view': 'host',
  'unresolved': 'unresolved',
  'open': 'unresolved',
}

/** Who said it: one page title or plain name, or several. */
export type ClaimSpeakerInput = string | number | (string | number)[] | null | undefined

export interface ClaimResponseInput {
  text?: string | number
  by?: ClaimSpeakerInput
  stance?: string
  date?: string | number
  cue?: number | string
  cueApprox?: boolean | string
}

export interface ClaimInput {
  /** Optional short heading for the claim ("Soviet disinformation"). */
  title?: string | number
  text?: string | number
  by?: ClaimSpeakerInput
  date?: string | number
  /** Where it was made: a book, a hearing, a forum. */
  where?: string | number
  note?: string | number
  cue?: number | string
  cueApprox?: boolean | string
  responses?: ClaimResponseInput[]
}

export interface ClaimResponse {
  text: string
  by: string[]
  stance: ClaimStance | null
  /** Formatted for display ("Jul 2014"); empty when none. */
  date: string
  cue: number | null
  cueApprox: boolean
}

export interface Claim {
  title: string
  text: string
  by: string[]
  date: string
  where: string
  note: string
  cue: number | null
  cueApprox: boolean
  responses: ClaimResponse[]
}

export interface ClaimModel {
  claims: Claim[]
  /** Every speaker named anywhere in the block, deduplicated, for one batched resolve. */
  names: string[]
}

function str(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''
}

export function normalizeStance(v: unknown): ClaimStance | null {
  const k = str(v).toLowerCase().replace(/[‘’]/g, '\'').replace(/\s+/g, ' ')
  return STANCE_ALIASES[k] ?? null
}

export function normalizeSpeakers(v: unknown): string[] {
  const list = Array.isArray(v) ? v : [v]
  const out: string[] = []
  for (const s of list) {
    const name = str(s)
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

function normalizeCue(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null
}

function isApprox(cue: number | null, v: unknown): boolean {
  return cue !== null && (v === true || v === 'true')
}

/** A response needs text; one without is dropped. */
export function normalizeResponses(input: unknown): ClaimResponse[] {
  const out: ClaimResponse[] = []
  for (const raw of Array.isArray(input) ? input : []) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as ClaimResponseInput
    const text = str(r.text)
    if (!text) continue
    const cue = normalizeCue(r.cue)
    out.push({
      text,
      by: normalizeSpeakers(r.by),
      stance: normalizeStance(r.stance),
      date: formatDate(str(r.date)),
      cue,
      cueApprox: isApprox(cue, r.cueApprox),
    })
  }
  return out
}

/** A claim needs text; one without is dropped along with its responses. */
export function normalizeClaim(raw: unknown, responses?: unknown): Claim | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as ClaimInput
  const text = str(c.text)
  if (!text) return null
  const cue = normalizeCue(c.cue)
  return {
    title: str(c.title),
    text,
    by: normalizeSpeakers(c.by),
    date: formatDate(str(c.date)),
    where: str(c.where),
    note: str(c.note),
    cue,
    cueApprox: isApprox(cue, c.cueApprox),
    responses: normalizeResponses(responses ?? c.responses),
  }
}

/**
 * Build the block's model. `claims` (a list, each with its own responses)
 * wins when it holds anything; otherwise the single `claim` + `responses`
 * shorthand is used. A `responses` list beside `claim` takes precedence over
 * one nested inside it.
 */
export function buildClaims(claim: unknown, responses: unknown, claims: unknown): ClaimModel {
  let list: Claim[] = []
  if (Array.isArray(claims) && claims.length) {
    list = claims.map(c => normalizeClaim(c)).filter((c): c is Claim => c !== null)
  }
  else {
    const one = normalizeClaim(claim, Array.isArray(responses) ? responses : undefined)
    if (one) list = [one]
  }
  const names: string[] = []
  for (const c of list) {
    for (const n of [...c.by, ...c.responses.flatMap(r => r.by)]) {
      if (!names.includes(n)) names.push(n)
    }
  }
  return { claims: list, names }
}

/** "A", "A and B", "A, B and C": how a list of speakers reads in an accessible name. */
export function joinSpeakers(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
