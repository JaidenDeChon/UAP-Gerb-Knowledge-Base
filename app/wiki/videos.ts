import { readFileSync } from 'node:fs'
// Relative rather than the `#shared` alias — see the note in ./graph.ts.
import type { BakedVideo } from '../shared/types/wiki'
import { graphIndex } from './graph'
import { VAULT_DIR } from './vault'

/** The ingest pipeline's ledger: video id → when it was processed. */
const LEDGER = '.processed_videos.json'

type Ledger = Record<string, { title?: string, processed_at?: string }>

function readLedger(): Ledger {
  try {
    return JSON.parse(readFileSync(`${VAULT_DIR}/${LEDGER}`, 'utf8')) as Ledger
  }
  catch {
    return {}
  }
}

/** A top-level scalar from a note's frontmatter, unquoted. */
function frontmatterValue(raw: string, key: string): string | undefined {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1]
  const value = block && new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(block)?.[1]?.trim()
  return value?.replace(/^(["'])(.*)\1$/, '$2') || undefined
}

/** The ledger writes naive ISO timestamps; read them as UTC so the order and the
 * dates shown don't depend on the build machine's time zone. */
function parseTimestamp(value: string | undefined): number {
  if (!value) return Number.NaN
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`)
}

/**
 * Every video summary in the vault, most recently processed first.
 *
 * Derived entirely from what the ingest pipeline already writes — a
 * `Videos/<Title>/summary.md` with a `video_id` in its frontmatter, and that id's
 * `processed_at` in `.processed_videos.json` — so a newly processed video shows
 * up on the next build with nobody touching the app. A summary missing from the
 * ledger still lists, after the dated ones.
 */
export function buildVideos(): BakedVideo[] {
  const { stemByPath, nodeByPath } = graphIndex()
  const ledger = readLedger()
  const videos: BakedVideo[] = []

  for (const [path, stem] of stemByPath) {
    if (!stem.startsWith('Videos/') || !stem.endsWith('/summary')) continue
    const node = nodeByPath.get(path)
    if (!node) continue

    let raw: string
    try {
      raw = readFileSync(`${VAULT_DIR}/${stem}.md`, 'utf8')
    }
    catch {
      continue
    }

    const id = frontmatterValue(raw, 'video_id') ?? null
    const processed = id ? parseTimestamp(ledger[id]?.processed_at) : Number.NaN
    const seconds = Number(frontmatterValue(raw, 'duration_seconds'))

    videos.push({
      i: node.i,
      id,
      at: Number.isFinite(processed) ? new Date(processed).toISOString() : null,
      dur: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
    })
  }

  // Newest first; undated last, in graph (alphabetical) order.
  return videos.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '') || a.i - b.i)
}
