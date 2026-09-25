import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { graphIndex } from './graph'
import { buildPreviews } from './preview'
import { VAULT_DIR, walkVault } from './vault'
import { buildVideos } from './videos'

// These run against the real vault, like the ingest pipeline that feeds it: the
// point is that a processed video needs nothing beyond its summary and ledger entry.
describe('buildVideos', () => {
  const videos = buildVideos()
  const { nodes } = graphIndex().payload

  it('lists every video summary in the vault', () => {
    const summaries = walkVault().filter(stem => /^Videos\/[^/]+\/summary$/.test(stem))
    expect(videos).toHaveLength(summaries.length)
    expect(videos.every(v => nodes[v.i]!.c === 'Videos' && nodes[v.i]!.p.endsWith('/summary'))).toBe(true)
  })

  it('orders by processed_at, newest first, undated last', () => {
    const dated = videos.filter(v => v.at)
    expect(dated.map(v => v.at)).toEqual(dated.map(v => v.at).sort().reverse())
    expect(videos.slice(dated.length).every(v => v.at === null)).toBe(true)
  })

  it('takes processed_at from the ledger by video id', () => {
    const ledger = JSON.parse(readFileSync(`${VAULT_DIR}/.processed_videos.json`, 'utf8'))
    const [newest] = videos
    expect(newest?.id).toBeTruthy()
    expect(newest!.at!.slice(0, 19)).toBe(ledger[newest!.id!].processed_at.slice(0, 19))
  })
})

describe('preview leads', () => {
  it('skip leading MDC blocks rather than quoting them', () => {
    const previews = buildPreviews()
    const leads = Object.values(previews).map(p => p.lead)
    expect(leads.some(lead => /^::|^stats:/.test(lead))).toBe(false)
    const timeline = Object.values(previews).find(p => p.path.includes('/80-years-of-ufo-crash-retrieval'))
    expect(timeline?.lead).toMatch(/^This video brings the research of the whole UAP Gerb channel together/)
  })
})
