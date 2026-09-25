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
  custody: 'Where it went, step by step',
  consequence: 'What led to what',
  transmission: 'How the account was passed on',
}

/**
 * What a connector between two steps says when the author wrote no `via`.
 * Shown (quieter than an authored label) so every link in the chain reads as
 * a sentence: "1 Kecksburg — moved to — 2 Army flatbed truck".
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
  /** Label on the connector INTO this step (or, on a fork, on its split junction). */
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
  /**
   * The step's node label, set by `numberChain`: "1", "2" on the main line,
   * "A1", "A2" in branch A, "Ba1" in a branch nested inside branch B.
   */
  key?: string
}

export interface ChainBranch {
  label: string
  items: ChainItem[]
  /** The branch's letter, set by `numberChain`: "A", "B", or "Ba" when nested. */
  key?: string
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

/**
 * A branch's letter: `A`, `B`, ... for forks on the main line, lower case for
 * a fork nested in a branch (`Ba`, `Bb`), upper case again one level deeper.
 * Past Z it doubles up (`AA`), which no real chain reaches.
 */
export function branchLetter(index: number, depth: number): string {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return depth % 2 === 0 ? out.toLowerCase() : out
}

/**
 * Give every step and branch its node label (mutates and returns `items`).
 * Steps in one run are numbered 1, 2, 3 after the run's prefix, skipping
 * forks; branches take letters that keep counting across the forks of one
 * run, so two forks on the main line give branches A, B and then C, D, and no
 * label repeats anywhere in the chain.
 */
export function numberChain(items: ChainItem[], prefix = '', depth = 0): ChainItem[] {
  let step = 0
  let branch = 0
  for (const item of items) {
    if (item.type === 'step') {
      item.key = `${prefix}${++step}`
      continue
    }
    for (const b of item.branches) {
      b.key = `${prefix}${branchLetter(branch++, depth + 1)}`
      numberChain(b.items, b.key, depth + 1)
    }
  }
  return items
}

/** "A and B", or "A–C" for three or more (letters within a fork are consecutive). */
export function branchRange(branches: ChainBranch[]): string {
  const keys = branches.map(b => b.key || '?')
  if (keys.length <= 2) return keys.join(' and ')
  return `${keys[0]}–${keys[keys.length - 1]}`
}

/**
 * The words on the junction where a run splits (the fork at `items[i]`):
 * which step it splits from, and into how many branches.
 */
export function splitText(items: ChainItem[], i: number): string {
  const fork = items[i]
  if (!fork || fork.type !== 'fork') return ''
  const n = fork.branches.length
  const prev = items[i - 1]
  if (prev?.type === 'step') return `After step ${prev.key}, splits into ${n} branches`
  if (prev?.type === 'fork') return `Splits again into ${n} branches`
  return `Starts as ${n} separate branches`
}

/**
 * The words on the junction where a fork's branches come back together, at
 * the item after it. Empty when nothing follows (the branches just end).
 * Branches that started the run "converge"; ones split from a step "rejoin".
 */
export function joinText(items: ChainItem[], i: number): string {
  const fork = items[i]
  const next = items[i + 1]
  if (!fork || fork.type !== 'fork' || !next) return ''
  const verb = i === 0 ? 'converge' : 'rejoin'
  const range = branchRange(fork.branches)
  return next.type === 'step'
    ? `Branches ${range} ${verb} at step ${next.key}`
    : `Branches ${range} ${verb}`
}

/** Every resolvable step name, in order, including inside forks. */
export function chainNames(items: ChainItem[]): string[] {
  return items.flatMap(item => item.type === 'step'
    ? (item.resolvable ? [item.name] : [])
    : item.branches.flatMap(b => chainNames(b.items)))
}

export function buildChain(kind: unknown, steps: unknown): ChainModel {
  const items = numberChain(normalizeItems(steps))
  return { kind: normalizeKind(kind), items, names: chainNames(items) }
}
