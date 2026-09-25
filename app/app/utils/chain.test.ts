import { describe, expect, it } from 'vitest'
import {
  branchLetter,
  branchRange,
  buildChain,
  chainNames,
  joinText,
  MAX_CHAIN_DEPTH,
  normalizeItems,
  normalizeKind,
  numberChain,
  splitText,
  type ChainFork,
  type ChainItem,
  type ChainStep,
} from './chain'

describe('normalizeKind', () => {
  it('accepts the three kinds case-insensitively and defaults to custody', () => {
    expect(normalizeKind('Consequence')).toBe('consequence')
    expect(normalizeKind(' transmission ')).toBe('transmission')
    expect(normalizeKind('lineage')).toBe('custody')
    expect(normalizeKind(undefined)).toBe('custody')
  })
})

describe('normalizeItems: steps', () => {
  it('reads name, text, via, date, note and cue', () => {
    const [a, b] = normalizeItems([
      { name: ' Wright-Patterson Air Force Base ', via: ' By truck ', date: '1965-12-10', note: 'n', cue: '1840.6' },
      { text: 'Storage (alleged)', date: 1966 },
    ]) as ChainStep[]
    expect(a).toEqual({
      type: 'step',
      name: 'Wright-Patterson Air Force Base',
      resolvable: true,
      via: 'By truck',
      date: '10 Dec 1965',
      note: 'n',
      cue: 1840,
      cueApprox: false,
    })
    expect(b).toMatchObject({ name: 'Storage (alleged)', resolvable: false, date: '1966', cue: null })
  })
  it('prefers name over text, and drops steps with neither', () => {
    const items = normalizeItems([{ name: 'A', text: 'ignored' }, { via: 'orphan label' }, null, 'junk'])
    expect(items).toHaveLength(1)
    expect((items[0] as ChainStep).name).toBe('A')
  })
  it('only marks a cue approximate when there is a cue', () => {
    const [a, b, c] = normalizeItems([
      { name: 'A', cue: 12, cueApprox: true },
      { name: 'B', cueApprox: 'true' },
      { name: 'C', cue: -4 },
    ]) as ChainStep[]
    expect([a!.cue, a!.cueApprox]).toEqual([12, true])
    expect([b!.cue, b!.cueApprox]).toEqual([null, false])
    expect(c!.cue).toBeNull()
  })
})

describe('normalizeItems: forks', () => {
  it('reads labelled and bare branches', () => {
    const [start, fork, rejoin] = normalizeItems([
      { name: 'Crash site' },
      {
        via: 'Split up',
        fork: [
          { label: 'The disc', steps: [{ name: 'Helicopter' }, { name: 'Base' }] },
          [{ text: 'Destroyed' }],
        ],
      },
      { name: 'Report', via: 'Both recorded in' },
    ])
    expect(start!.type).toBe('step')
    const f = fork as ChainFork
    expect(f.type).toBe('fork')
    expect(f.via).toBe('Split up')
    expect(f.branches.map(b => [b.label, b.items.length])).toEqual([['The disc', 2], ['', 1]])
    expect((rejoin as ChainStep).via).toBe('Both recorded in')
  })
  it('drops empty branches and flattens a fork left with one', () => {
    const items = normalizeItems([
      { name: 'A' },
      { via: 'then', fork: [[{ name: 'B' }, { name: 'C' }], [], { label: 'empty', steps: [{ via: 'x' }] }] },
    ])
    expect(items.map(i => i.type)).toEqual(['step', 'step', 'step'])
    expect((items[1] as ChainStep).via).toBe('then')
  })
  it('keeps a flattened step\'s own via over the fork\'s', () => {
    const items = normalizeItems([{ via: 'fork via', fork: [[{ name: 'B', via: 'own' }]] }])
    expect((items[0] as ChainStep).via).toBe('own')
  })
  it('drops a fork with no surviving branches', () => {
    expect(normalizeItems([{ fork: [[], []] }])).toEqual([])
  })
  it('caps nesting depth', () => {
    let steps: unknown[] = [{ name: 'leaf' }]
    for (let i = 0; i < MAX_CHAIN_DEPTH + 1; i++) steps = [{ fork: [steps, [{ name: `side ${i}` }]] }]
    const top = normalizeItems(steps)
    // The fork past MAX_CHAIN_DEPTH is dropped, which leaves its parent with one
    // branch, so that parent flattens too.
    let depth = 0
    let cur = top
    while (cur[0]?.type === 'fork') {
      depth++
      cur = cur[0].branches[0]!.items
    }
    expect(depth).toBe(MAX_CHAIN_DEPTH - 1)
  })
})

describe('buildChain / chainNames', () => {
  it('collects only resolvable names, including inside forks', () => {
    const m = buildChain('consequence', [
      { name: 'A' },
      { text: 'abstract' },
      { fork: [[{ name: 'B' }], [{ name: 'C' }, { text: 'd' }]] },
    ])
    expect(m.kind).toBe('consequence')
    expect(m.names).toEqual(['A', 'B', 'C'])
    expect(chainNames(m.items)).toEqual(m.names)
  })
  it('is empty, not throwing, for missing input', () => {
    expect(buildChain(undefined, undefined)).toEqual({ kind: 'custody', items: [], names: [] })
    expect(buildChain('custody', 'nope').items).toEqual([])
  })
})

describe('branchLetter', () => {
  it('letters upper case on the main line, lower case one level in, upper again below', () => {
    expect([0, 1, 2].map(i => branchLetter(i, 1))).toEqual(['A', 'B', 'C'])
    expect(branchLetter(1, 2)).toBe('b')
    expect(branchLetter(0, 3)).toBe('A')
  })
  it('doubles up past Z', () => {
    expect(branchLetter(25, 1)).toBe('Z')
    expect(branchLetter(26, 1)).toBe('AA')
    expect(branchLetter(27, 1)).toBe('AB')
  })
})

/** Flatten a numbered chain to its step and branch keys, in reading order. */
function keys(items: ChainItem[]): string[] {
  return items.flatMap(i => i.type === 'step'
    ? [i.key!]
    : i.branches.flatMap(b => [`[${b.key}]`, ...keys(b.items)]))
}

describe('numberChain', () => {
  it('numbers main-line steps past forks, and letters branches across forks', () => {
    const m = buildChain('custody', [
      { name: 'a' },
      { fork: [[{ name: 'b' }, { name: 'c' }], [{ name: 'd' }]] },
      { name: 'e' },
      { fork: [[{ name: 'f' }], [{ name: 'g' }]] },
    ])
    expect(keys(m.items)).toEqual(['1', '[A]', 'A1', 'A2', '[B]', 'B1', '2', '[C]', 'C1', '[D]', 'D1'])
  })
  it('prefixes nested branches with their parent branch', () => {
    const m = buildChain('custody', [
      { name: 'Coyame' },
      { fork: [
        [{ text: 'Destroyed' }],
        [{ name: 'Atlanta' }, { fork: [[{ name: 'WPAFB' }], [{ text: 'Unnamed base' }]] }],
      ] },
    ])
    expect(keys(m.items)).toEqual(['1', '[A]', 'A1', '[B]', 'B1', '[Ba]', 'Ba1', '[Bb]', 'Bb1'])
  })
  it('gives every step and branch a unique key', () => {
    const m = buildChain('custody', [
      { fork: [[{ name: 'a' }, { fork: [[{ name: 'b' }, { fork: [[{ name: 'c' }], [{ name: 'd' }]] }], [{ name: 'e' }]] }], [{ name: 'f' }]] },
      { name: 'g' },
    ])
    const k = keys(m.items)
    expect(new Set(k).size).toBe(k.length)
    expect(k).toContain('AaA1')
  })
})

describe('junction wording', () => {
  const m = buildChain('custody', [
    { fork: [[{ name: 'a' }], [{ name: 'b' }], [{ name: 'c' }]] },
    { name: 'Fouche' },
    { fork: [[{ name: 'd' }], [{ name: 'e' }]] },
    { fork: [[{ name: 'f' }], [{ name: 'g' }]] },
    { name: 'end' },
    { fork: [[{ name: 'h' }], [{ name: 'i' }]] },
  ])
  it('names the step a fork splits from, or says it starts the run', () => {
    expect(splitText(m.items, 0)).toBe('Starts as 3 separate branches')
    expect(splitText(m.items, 2)).toBe('After step 1, splits into 2 branches')
    expect(splitText(m.items, 3)).toBe('Splits again into 2 branches')
    expect(splitText(m.items, 1)).toBe('')
  })
  it('names the branches that come back and the step they come back at', () => {
    expect(joinText(m.items, 0)).toBe('Branches A–C converge at step 1')
    expect(joinText(m.items, 2)).toBe('Branches D and E rejoin')
    expect(joinText(m.items, 3)).toBe('Branches F and G rejoin at step 2')
  })
  it('says nothing when the branches end the chain', () => {
    expect(joinText(m.items, 5)).toBe('')
  })
  it('ranges two branches with "and", more with a dash', () => {
    expect(branchRange((m.items[0] as ChainFork).branches)).toBe('A–C')
    expect(branchRange((m.items[2] as ChainFork).branches)).toBe('D and E')
  })
  it('numbers in place and returns the same array', () => {
    const items = normalizeItems([{ name: 'x' }])
    expect(numberChain(items)).toBe(items)
    expect((items[0] as ChainStep).key).toBe('1')
  })
})
