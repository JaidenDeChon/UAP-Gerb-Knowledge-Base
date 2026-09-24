import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveWikiTarget, VAULT_DIR, walkVault, WIKILINK_RE } from './vault'

// Runs against the real vault. Video pages live at Videos/<title>/summary.md, so a
// link to one must be written [[Videos/<title>/summary|<title>]]: the legacy
// [[Video - <title>]] form resolves nowhere in Obsidian. scripts/fix_video_links.py
// rewrites any that creep back in. Transcripts are verbatim and never checked.
describe('video wikilinks', () => {
  const pages = walkVault()
    .filter(stem => !stem.endsWith('/transcript'))
    .map(stem => ({ stem, links: [...readFileSync(`${VAULT_DIR}/${stem}.md`, 'utf8').matchAll(WIKILINK_RE)] }))

  it('never use the legacy [[Video - <title>]] form', () => {
    const legacy = pages.flatMap(({ stem, links }) =>
      links.filter(m => /^Video\s*-/i.test(m[2]!)).map(m => `${stem}: ${m[0]}`))
    expect(legacy, 'run python3 scripts/fix_video_links.py').toEqual([])
  })

  it('point at a video summary that exists', () => {
    const broken = pages.flatMap(({ stem, links }) =>
      links.filter(m => m[2]!.startsWith('Videos/') && !resolveWikiTarget(m[2]!)).map(m => `${stem}: ${m[0]}`))
    expect(broken).toEqual([])
  })
})
