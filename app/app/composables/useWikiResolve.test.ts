import type { NoteRef } from '#shared/types/wiki'
import { describe, expect, it } from 'vitest'
import { chunkNames, mergeChunkResults } from './useWikiResolve'

function ref(path: string): NoteRef {
  return { path, title: path, category: 'People' }
}

describe('chunkNames', () => {
  it('makes one chunk when the list fits under the size', () => {
    const list = Array.from({ length: 50 }, (_, i) => `name-${i}`)
    expect(chunkNames(list, 200)).toEqual([list])
  })

  it('splits a list over 200 names into a full chunk and a remainder', () => {
    const list = Array.from({ length: 250 }, (_, i) => `name-${i}`)
    const chunks = chunkNames(list, 200)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(200)
    expect(chunks[1]).toHaveLength(50)
    // Order is preserved — chunking never reorders or drops a name.
    expect(chunks.flat()).toEqual(list)
  })

  it('splits an exact multiple of the chunk size without a trailing empty chunk', () => {
    const list = Array.from({ length: 400 }, (_, i) => `name-${i}`)
    const chunks = chunkNames(list, 200)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(200)
    expect(chunks[1]).toHaveLength(200)
  })

  it('returns no chunks for an empty list', () => {
    expect(chunkNames([], 200)).toEqual([])
  })
})

describe('mergeChunkResults', () => {
  it('preserves positional alignment across a chunk boundary', () => {
    const list = Array.from({ length: 210 }, (_, i) => `name-${i}`)
    const chunks = chunkNames(list, 200)
    // Each chunk "resolves" every one of its own names to a ref carrying that
    // name, so the merged array's identity at each index is checkable.
    const settled: PromiseSettledResult<(NoteRef | null)[]>[] = chunks.map(chunk => ({
      status: 'fulfilled' as const,
      value: chunk.map(ref),
    }))

    const merged = mergeChunkResults(chunks, settled)

    expect(merged).toHaveLength(210)
    // The chunk boundary sits at index 199/200 — confirm both sides landed
    // at the position matching their original index, not shifted.
    expect(merged[199]?.path).toBe('name-199')
    expect(merged[200]?.path).toBe('name-200')
    expect(merged[209]?.path).toBe('name-209')
    // Every entry lines up with the name at the same index in the original list.
    merged.forEach((entry, i) => expect(entry?.path).toBe(list[i]))
  })

  it('degrades only the failed chunk to nulls, not the whole result', () => {
    const list = Array.from({ length: 250 }, (_, i) => `name-${i}`)
    const chunks = chunkNames(list, 200)
    const settled: PromiseSettledResult<(NoteRef | null)[]>[] = [
      { status: 'fulfilled', value: chunks[0]!.map(ref) },
      { status: 'rejected', reason: new Error('network error') },
    ]

    const merged = mergeChunkResults(chunks, settled)

    expect(merged).toHaveLength(250)
    // First chunk's names all resolved.
    expect(merged.slice(0, 200).every(entry => entry !== null)).toBe(true)
    // Second (failed) chunk degrades to null for just its own 50 names —
    // total failure would have made all 250 null.
    expect(merged.slice(200)).toEqual(Array.from({ length: 50 }, () => null))
  })

  it('returns an empty array when there are no chunks', () => {
    expect(mergeChunkResults([], [])).toEqual([])
  })
})
