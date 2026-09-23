/**
 * Pure normalisation behind `::wiki-chain` (WikiChain.vue): turns the loosely
 * typed YAML an author writes into a clean list of steps and forks the
 * component can render without further guarding. No Nuxt runtime, so it is
 * unit-tested directly.
 *
 * A chain is an ordered list of items. An item is either a STEP (an entity or
 * a plain-text stage, with the label on the arrow leading into it) or a FORK
 * (the chain splits into two or more parallel branches, each its own list of
 * items). Items after a fork are where the branches rejoin.
 */
import { formatDate } from './timeline'

/** What kind of hand-off the chain traces. Sets the kicker and the arrows' unspoken verb. */
export type ChainKind = 'custody' | 'consequence' | 'transmission'

export const CHAIN_KINDS: readonly ChainKind[] = ['custody', 'consequence', 'transmission']

/** Visible kicker over the chain, and the list's accessible name. */
export const CHAIN_KIND_LABEL: Record<ChainKind, string> = {
  custody: 'Chain of custody',
  consequence: 'Chain of consequence',
  transmission: 'Chain of transmission',
}

/**
 * What an arrow with no authored `via` label says to a screen reader. Sighted
 * readers see only the arrow; the word is never shown, so it never competes
 * with the labels an author actually wrote.
 */
export const CHAIN_KIND_VERB: Record<ChainKind, string> = {
  custody: 'moved to',
  consequence: 'led to',
  transmission: 'passed to',
}

/** Forks nest at most this deep; anything deeper is dropped. Chains should be light. */
export const MAX_CHAIN_DEPTH = 3

export interface ChainStepInput {
  /** A page title (resolved to an entity link when a page exists). */
  name?: string
  /** Plain text for an abstract stage with no page; never resolved. */
  text?: string
  /** Label on the arrow INTO this step (or into this fork). */
  via?: string
  date?: string | number
  note?: string
  cue?: number | string
  cueApprox?: boolean | string
  /** Makes this item a fork: two or more parallel branches. */
  fork?: ChainBranchInput[]
}

/** A branch as authored: a bare list of steps, or an object with a label. */
export type ChainBranchInput = ChainStepInput[] | { label?: string, steps?: ChainStepInput[] }

export interface ChainStep {
  type: 'step'
  /** The display name (the page title, or the plain text). */
  name: string
  /** True when `name` came from `name:` and should be resolved to a page. */
  resolvable: boolean
  via: string
  /** Formatted for display ("10 Dec 1965"); empty when none. */
  date: string
  note: string
  cue: number | null
  cueApprox: boolean
}

export interface ChainBranch {
  label: string
  items: ChainItem[]
}

export interface ChainFork {
  type: 'fork'
  via: string
  branches: ChainBranch[]
}

export type ChainItem = ChainStep | ChainFork

export interface ChainModel {
  kind: ChainKind
  items: ChainItem[]
  /** Every resolvable name in the chain, for one batched resolve. */
  names: string[]
}

function str(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''
}

export function normalizeKind(v: unknown): ChainKind {
  const k = str(v).toLowerCase()
  return (CHAIN_KINDS as readonly string[]).includes(k) ? (k as ChainKind) : 'custody'
}

function normalizeCue(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null
}

function normalizeBranch(input: ChainBranchInput, depth: number): ChainBranch {
  if (Array.isArray(input)) return { label: '', items: normalizeItems(input, depth) }
  const b = (input && typeof input === 'object') ? input : {}
  return { label: str(b.label), items: normalizeItems(b.steps, depth) }
}

/**
 * Normalise one list of items. A step with neither `name` nor `text` is
 * dropped. A fork keeps only branches that still have items; a fork left with
 * a single branch is flattened into the list in its place (its first step
 * inheriting the fork's `via` if it has none of its own), and one with none is
 * dropped. Forks nested deeper than `MAX_CHAIN_DEPTH` are dropped.
 */
export function normalizeItems(input: unknown, depth = 0): ChainItem[] {
  const out: ChainItem[] = []
  for (const raw of Array.isArray(input) ? input : []) {
    if (!raw || typeof raw !== 'object') continue
    const s = raw as ChainStepInput
    const via = str(s.via)

    if (Array.isArray(s.fork)) {
      if (depth + 1 > MAX_CHAIN_DEPTH) continue
      const branches = s.fork.map(b => normalizeBranch(b, depth + 1)).filter(b => b.items.length)
      if (branches.length >= 2) {
        out.push({ type: 'fork', via, branches })
      }
      else if (branches.length === 1) {
        const items = branches[0]!.items
        const first = items[0]!
        if (via && !first.via) items[0] = { ...first, via }
        out.push(...items)
      }
      continue
    }

    const name = str(s.name)
    const text = str(s.text)
    if (!name && !text) continue
    const cue = normalizeCue(s.cue)
    out.push({
      type: 'step',
      name: name || text,
      resolvable: !!name,
      via,
      date: formatDate(str(s.date)),
      note: str(s.note),
      cue,
      cueApprox: cue !== null && (s.cueApprox === true || s.cueApprox === 'true'),
    })
  }
  return out
}

/** Every resolvable step name, in order, including inside forks. */
export function chainNames(items: ChainItem[]): string[] {
  return items.flatMap(item => item.type === 'step'
    ? (item.resolvable ? [item.name] : [])
    : item.branches.flatMap(b => chainNames(b.items)))
}

export function buildChain(kind: unknown, steps: unknown): ChainModel {
  const items = normalizeItems(steps)
  return { kind: normalizeKind(kind), items, names: chainNames(items) }
}
