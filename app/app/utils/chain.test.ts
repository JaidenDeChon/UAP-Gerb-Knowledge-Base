import { describe, expect, it } from 'vitest'
import { buildChain, chainNames, MAX_CHAIN_DEPTH, normalizeItems, normalizeKind, type ChainFork, type ChainStep } from './chain'

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
