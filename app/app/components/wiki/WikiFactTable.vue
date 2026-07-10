<script setup lang="ts">
import type { WikiPage } from '@/utils/content'
import { ExternalLink, FileText } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{ page: WikiPage }>()

type Row =
  | { type: 'text', label: string, value: string, mono: boolean }
  | { type: 'transcript', label: string, to: string }
  | { type: 'watch', label: string, url: string }

/** Read a frontmatter key from the note, whether hoisted to a column or in `meta`. */
function raw(key: string): unknown {
  const top = (props.page as unknown as Record<string, unknown>)[key]
  if (top !== undefined && top !== null && top !== '') return top
  const meta = props.page.meta as Record<string, unknown> | undefined
  return meta ? meta[key] : undefined
}

function clean(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) {
    const joined = value.map(v => String(v).trim()).filter(Boolean).join(' · ')
    return joined || undefined
  }
  const s = String(value).trim()
  const upper = s.toUpperCase()
  if (!s || upper === 'NA' || upper === 'N/A' || upper === 'NULL' || upper === 'UNKNOWN') {
    return undefined
  }
  return s
}

function field(key: string): string | undefined {
  return clean(raw(key))
}

/** aliases / alternate_names / alias, flattened, deduped, joined. */
function alsoKnownAs(): string | undefined {
  const values: string[] = []
  for (const key of ['aliases', 'alternate_names', 'alias']) {
    const value = raw(key)
    if (Array.isArray(value)) values.push(...value.map(v => String(v)))
    else if (value !== undefined && value !== null) values.push(String(value))
  }
  const deduped = [...new Set(values.map(v => v.trim()).filter(Boolean))]
  return deduped.length ? deduped.join(' · ') : undefined
}

function span(): string | undefined {
  const start = field('date_start')
  const end = field('date_end')
  if (start && end) return `${start} – ${end}`
  return start ?? end
}

function duration(): string | undefined {
  const value = raw('duration_seconds')
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  const total = Math.floor(n)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${Math.floor(total / 3600)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`
}

const transcriptTo = computed<string | null>(() => {
  const { stem, path } = props.page
  if (/(^|\/)Videos\//.test(stem) && stem.endsWith('/summary') && path.endsWith('/summary')) {
    return path.replace(/\/summary$/, '/transcript')
  }
  return null
})

const watchUrl = computed<string | undefined>(() => {
  const url = field('url')
  return url && /^https?:\/\//i.test(url) ? url : undefined
})

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const push = (label: string, value: string | undefined, mono = false): void => {
    if (value) out.push({ type: 'text', label, value, mono })
  }

  push('Role', field('role'))
  push('Type', field('org_type') ?? field('location_type'))
  push('Date', field('date'), true)
  push('Span', span(), true)
  push('Also known as', alsoKnownAs())
  push('Official name', field('official_name'))
  push('Abbreviation', field('abbreviation'))
  push('Channel', field('channel'))
  push('Video ID', field('video_id'), true)
  push('Duration', duration(), true)

  if (transcriptTo.value) {
    out.push({ type: 'transcript', label: 'Transcript', to: transcriptTo.value })
  }
  if (watchUrl.value) {
    out.push({ type: 'watch', label: 'Watch', url: watchUrl.value })
  }
  return out
})
</script>

<template>
  <div v-if="rows.length" class="mb-8 overflow-hidden rounded-lg border border-border">
    <table class="w-full border-collapse text-left">
      <tbody>
        <tr
          v-for="(row, i) in rows"
          :key="i"
          class="border-b border-border last:border-b-0"
        >
          <th
            scope="row"
            class="w-[140px] px-4 py-3 text-left align-top font-sans text-[13px] font-medium text-muted-foreground"
          >
            {{ row.label }}
          </th>
          <td class="px-4 py-3 align-top text-[14px] text-foreground">
            <span
              v-if="row.type === 'text'"
              :class="row.mono ? 'font-mono' : 'font-sans'"
            >
              {{ row.value }}
            </span>

            <NuxtLink
              v-else-if="row.type === 'transcript'"
              :to="row.to"
              class="inline-flex items-center gap-1.5 text-primary underline-offset-2 hover:underline"
            >
              <FileText class="size-3.5" />
              Read full transcript
            </NuxtLink>

            <Button v-else as-child variant="outline" size="sm">
              <a :href="row.url" target="_blank" rel="noopener noreferrer">
                Watch
                <ExternalLink class="size-3.5" />
              </a>
            </Button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
