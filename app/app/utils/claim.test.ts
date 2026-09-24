import { describe, expect, it } from 'vitest'
import {
  buildClaims,
  joinSpeakers,
  normalizeClaim,
  normalizeResponses,
  normalizeSpeakers,
  normalizeStance,
} from './claim'

describe('normalizeStance', () => {
  it('accepts the four stances and common spellings, case-insensitively', () => {
    expect(normalizeStance('Supports')).toBe('supports')
    expect(normalizeStance(' against ')).toBe('challenges')
    expect(normalizeStance('challenge')).toBe('challenges')
    expect(normalizeStance('host\'s view')).toBe('host')
    expect(normalizeStance('Host’s  View')).toBe('host')
    expect(normalizeStance('open')).toBe('unresolved')
  })
  it('returns null for anything else rather than guessing', () => {
    expect(normalizeStance('debunks')).toBeNull()
    expect(normalizeStance(undefined)).toBeNull()
    expect(normalizeStance(3)).toBeNull()
  })
})

describe('normalizeSpeakers', () => {
  it('takes one name or a list, trimmed and deduplicated', () => {
    expect(normalizeSpeakers(' Stanton Friedman ')).toEqual(['Stanton Friedman'])
    expect(normalizeSpeakers(['Ryan S. Wood', ' Robert Wood', 'Ryan S. Wood', '', null])).toEqual(['Ryan S. Wood', 'Robert Wood'])
    expect(normalizeSpeakers(undefined)).toEqual([])
  })
})

describe('normalizeResponses', () => {
  it('reads text, speaker, stance, date and cue', () => {
    const [r] = normalizeResponses([
      { text: ' Records place him on the NSC staff ', by: 'UAP Gerb', stance: 'challenges', date: '2014-07', cue: '3190.8' },
    ])
    expect(r).toEqual({
      text: 'Records place him on the NSC staff',
      by: ['UAP Gerb'],
      stance: 'challenges',
      date: 'Jul 2014',
      cue: 3190,
      cueApprox: false,
    })
  })
  it('drops responses with no text, and junk entries', () => {
    const out = normalizeResponses([{ by: 'Someone', stance: 'supports' }, null, 'junk', { text: 'kept' }])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ text: 'kept', by: [], stance: null, cue: null })
  })
  it('only marks a cue approximate when there is a cue', () => {
    const [a, b, c] = normalizeResponses([
      { text: 'a', cue: 12, cueApprox: true },
      { text: 'b', cueApprox: 'true' },
      { text: 'c', cue: -4 },
    ])
    expect([a!.cue, a!.cueApprox]).toEqual([12, true])
    expect([b!.cue, b!.cueApprox]).toEqual([null, false])
    expect(c!.cue).toBeNull()
  })
})

describe('normalizeClaim', () => {
  it('reads every field and its nested responses', () => {
    const c = normalizeClaim({
      title: 'Soviet disinformation',
      text: 'SOM 1-01 was made to be leaked to Soviet spies',
      by: 'John B. Alexander',
      date: 2011,
      where: 'UFOs: Myths, Conspiracies, and Realities',
      note: 'n',
      cue: 4100,
      cueApprox: 'true',
      responses: [{ text: 'No psywar sense', by: 'Ryan S. Wood', stance: 'challenges' }],
    })
    expect(c).toMatchObject({
      title: 'Soviet disinformation',
      by: ['John B. Alexander'],
      date: '2011',
      where: 'UFOs: Myths, Conspiracies, and Realities',
      note: 'n',
      cue: 4100,
      cueApprox: true,
    })
    expect(c!.responses).toHaveLength(1)
  })
  it('drops a claim with no text', () => {
    expect(normalizeClaim({ by: 'X', responses: [{ text: 'orphan' }] })).toBeNull()
    expect(normalizeClaim('junk')).toBeNull()
  })
})

describe('buildClaims', () => {
  it('builds one claim from the claim + responses shorthand', () => {
    const m = buildClaims(
      { text: 'Corso never attended an NSC meeting', by: 'Stanton Friedman', cue: 3120 },
      [{ text: 'Senate report lists him as NSC staff', by: 'UAP Gerb', stance: 'challenges' }],
      undefined,
    )
    expect(m.claims).toHaveLength(1)
    expect(m.claims[0]!.responses[0]!.stance).toBe('challenges')
    expect(m.names).toEqual(['Stanton Friedman', 'UAP Gerb'])
  })
  it('prefers a sibling responses list over one nested in the claim', () => {
    const m = buildClaims({ text: 'c', responses: [{ text: 'nested' }] }, [{ text: 'sibling' }], [])
    expect(m.claims[0]!.responses.map(r => r.text)).toEqual(['sibling'])
  })
  it('uses the claims list when it has entries, dropping empty claims', () => {
    const m = buildClaims({ text: 'ignored' }, [], [
      { text: 'A meteor', by: 'Project Blue Book', responses: [{ text: 'Then why chaff?', by: 'UAP Gerb', stance: 'host' }] },
      { by: 'Nobody' },
      { text: 'A Soviet probe', by: ['James Oberg', 'Project Blue Book'] },
    ])
    expect(m.claims.map(c => c.text)).toEqual(['A meteor', 'A Soviet probe'])
    expect(m.names).toEqual(['Project Blue Book', 'UAP Gerb', 'James Oberg'])
  })
  it('is empty when nothing usable was authored', () => {
    expect(buildClaims(undefined, undefined, undefined)).toEqual({ claims: [], names: [] })
    expect(buildClaims({ by: 'X' }, [], [])).toEqual({ claims: [], names: [] })
  })
})

describe('joinSpeakers', () => {
  it('reads naturally for one, two or more names', () => {
    expect(joinSpeakers([])).toBe('')
    expect(joinSpeakers(['A'])).toBe('A')
    expect(joinSpeakers(['A', 'B'])).toBe('A and B')
    expect(joinSpeakers(['A', 'B', 'C'])).toBe('A, B and C')
  })
})
