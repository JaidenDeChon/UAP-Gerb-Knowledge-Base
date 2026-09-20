import type { GraphNode } from '../shared/types/wiki'
import { describe, expect, it } from 'vitest'
import { FOLDER_PRIORITY, fold } from './naming'
import { buildLabelIndex, resolveName } from './resolve'
import { resolveWikiTarget, type VaultIndex } from './vault'

function node(i: number, l: string, p: string, c: GraphNode['c']): GraphNode {
  return { i, l, p, c, d: 0, x: 0, y: 0 }
}

const NODES: GraphNode[] = [
  node(0, 'Jesse Marcel', '/wiki/people/jesse-marcel', 'People'),
  node(1, 'Crane, Indiana', '/wiki/locations/crane-indiana', 'Locations'),
  node(2, 'Crane, Indiana', '/wiki/organizations/crane-indiana', 'Organizations'),
  node(3, 'Edgar Fouché', '/wiki/people/edgar-fouche', 'People'),
]

describe('resolveName', () => {
  const index = buildLabelIndex(NODES)

  it('resolves an exact name', () => {
    expect(resolveName('Jesse Marcel', index)?.p).toBe('/wiki/people/jesse-marcel')
  })

  it('is case-insensitive', () => {
    expect(resolveName('jesse marcel', index)?.p).toBe('/wiki/people/jesse-marcel')
  })

  it('trims surrounding whitespace', () => {
    expect(resolveName('  Jesse Marcel  ', index)?.p).toBe('/wiki/people/jesse-marcel')
  })

  it('prefers the higher-priority folder when a name is ambiguous', () => {
    // FOLDER_PRIORITY ranks Organizations above Locations.
    expect(resolveName('Crane, Indiana', index)?.c).toBe('Organizations')
  })

  it('falls back to diacritic-folded matching', () => {
    expect(resolveName('Edgar Fouche', index)?.p).toBe('/wiki/people/edgar-fouche')
  })

  it('returns null for an unknown name', () => {
    expect(resolveName('Nobody At All', index)).toBeNull()
  })

  it('returns null for an empty name', () => {
    expect(resolveName('   ', index)).toBeNull()
  })
})

/*
 * Parity between resolveName (server/utils/wiki.ts's graph-node resolver, used
 * for plain YAML names) and resolveWikiTarget (vault.ts's wikilink resolver).
 *
 * Both share FOLDER_PRIORITY/fold from ./naming so their *ranking rule* can't
 * quietly diverge, but sharing those two helpers doesn't stop the resolution
 * logic itself — the sequence of lookups each function tries — from drifting
 * apart. This block pins that logic to the same vault fixture, in two forms:
 * a GraphNode[] for resolveName and a hand-built VaultIndex (mirroring
 * buildVaultIndex's own ranking loop) for resolveWikiTarget.
 *
 * If either resolver's ranking or lookup order changes without the other
 * following, the "same query, same result" tests below start failing.
 */
describe('resolver parity: resolveName vs resolveWikiTarget', () => {
  /** Rank a stem's top folder against FOLDER_PRIORITY — mirrors vault.ts's
   * private `folderRank`, which isn't exported. */
  function rankOf(stem: string): number {
    const i = FOLDER_PRIORITY.indexOf(stem.split('/')[0]!)
    return i === -1 ? FOLDER_PRIORITY.length : i
  }

  /** Builds a VaultIndex the same way buildVaultIndex does, from an explicit
   * stem/path list instead of a filesystem walk — no vault.ts import touches
   * disk here. */
  function buildTestVaultIndex(entries: { stem: string, path: string }[]): VaultIndex {
    const byStem = new Map<string, string>()
    const byName = new Map<string, string>()
    const byFoldedName = new Map<string, string>()
    const nameRank = new Map<string, number>()

    for (const { stem, path } of entries) {
      byStem.set(stem.toLowerCase(), path)

      const basename = stem.split('/').pop()!
      const name = basename.toLowerCase()
      const rank = rankOf(stem)
      if (!byName.has(name) || rank < nameRank.get(name)!) {
        byName.set(name, path)
        byFoldedName.set(fold(basename), path)
        nameRank.set(name, rank)
      }
    }

    return { byStem, byName, byFoldedName }
  }

  // The same vault, expressed both ways: GraphNode[] (the graph's flat label
  // list) and stem/path pairs (the vault's folder layout).
  const GRAPH_NODES: GraphNode[] = [
    node(0, 'Jesse Marcel', '/wiki/people/jesse-marcel', 'People'),
    node(1, 'Crane, Indiana', '/wiki/locations/crane-indiana', 'Locations'),
    node(2, 'Crane, Indiana', '/wiki/organizations/crane-indiana', 'Organizations'),
    node(3, 'Edgar Fouché', '/wiki/people/edgar-fouche', 'People'),
  ]
  const VAULT_ENTRIES = [
    { stem: 'People/Jesse Marcel', path: '/wiki/people/jesse-marcel' },
    { stem: 'Locations/Crane, Indiana', path: '/wiki/locations/crane-indiana' },
    { stem: 'Organizations/Crane, Indiana', path: '/wiki/organizations/crane-indiana' },
    { stem: 'People/Edgar Fouché', path: '/wiki/people/edgar-fouche' },
    { stem: 'Videos/80 Years Timeline/summary', path: '/wiki/videos/80-years-timeline/summary' },
  ]

  const labelIndex = buildLabelIndex(GRAPH_NODES)
  const vaultIndex = buildTestVaultIndex(VAULT_ENTRIES)

  it.each([
    ['a plain name', 'Jesse Marcel', '/wiki/people/jesse-marcel'],
    ['an ambiguous name resolved by folder priority', 'Crane, Indiana', '/wiki/organizations/crane-indiana'],
    ['a diacritic name resolved by folding', 'Edgar Fouche', '/wiki/people/edgar-fouche'],
  ])('%s ("%s") resolves identically on both resolvers', (_label, query, expected) => {
    const fromName = resolveName(query, labelIndex)?.p
    const fromTarget = resolveWikiTarget(query, vaultIndex)
    expect(fromName).toBe(expected)
    expect(fromTarget).toBe(expected)
    expect(fromName).toBe(fromTarget)
  })

  // --- Documented divergences -------------------------------------------
  //
  // resolveName only ever sees plain YAML entity names — the vault's own
  // frontmatter never contains a `.md` suffix, a `Folder/Note` stem path, or
  // an Obsidian `Video - ` alias prefix, so resolveName was never built to
  // strip or expand them. resolveWikiTarget must handle all three, because
  // `[[wikilinks]]` written by hand in note bodies use every one of them.
  // These are pinned as intentional gaps, not bugs to converge.

  it('diverges on a `.md` suffix: only resolveWikiTarget strips it', () => {
    expect(resolveWikiTarget('Jesse Marcel.md', vaultIndex)).toBe('/wiki/people/jesse-marcel')
    expect(resolveName('Jesse Marcel.md', labelIndex)).toBeNull()
  })

  it('diverges on a `Folder/Note` stem path: only resolveWikiTarget has byStem', () => {
    expect(resolveWikiTarget('People/Jesse Marcel', vaultIndex)).toBe('/wiki/people/jesse-marcel')
    expect(resolveName('People/Jesse Marcel', labelIndex)).toBeNull()
  })

  it('diverges on a `Video - ` prefix: only resolveWikiTarget expands it to a summary note', () => {
    expect(resolveWikiTarget('Video - 80 Years Timeline', vaultIndex))
      .toBe('/wiki/videos/80-years-timeline/summary')
    expect(resolveName('Video - 80 Years Timeline', labelIndex)).toBeNull()
  })
})
