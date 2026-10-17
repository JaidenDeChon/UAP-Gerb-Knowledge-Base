import type { Component } from 'vue'
import { History, Link2, Repeat, Split, TrendingUp } from '@lucide/vue'
import {
  ANALYSIS_CONFIDENCES,
  ANALYSIS_KINDS,
  ANALYSIS_NOVELTIES,
  type AnalysisConfidence,
  type AnalysisKind,
  type AnalysisNovelty,
} from '#shared/types/wiki'

/**
 * Labels for an analysis's three frontmatter enums (see `BakedAnalysis` and
 * docs/wiki-components.md), shared by the `/analyses` cards and the strip at
 * the head of an analysis page so the two always say the same thing.
 */
export const KIND_LABEL: Record<AnalysisKind, string> = {
  'hidden-link': 'Hidden link',
  'timeline': 'Timeline',
  'contradiction': 'Contradiction',
  'change-of-view': 'Change of view',
  'pattern': 'Pattern',
}

export const KIND_ICON: Record<AnalysisKind, Component> = {
  'hidden-link': Link2,
  'timeline': History,
  'contradiction': Split,
  'change-of-view': TrendingUp,
  'pattern': Repeat,
}

export const CONFIDENCE_LABEL: Record<AnalysisConfidence, string> = {
  strong: 'Strong evidence',
  moderate: 'Moderate evidence',
  speculative: 'Speculative',
}

/** Filled steps of the three-step confidence meter. */
export const CONFIDENCE_STEPS: Record<AnalysisConfidence, number> = {
  strong: 3,
  moderate: 2,
  speculative: 1,
}

export const NOVELTY_LABEL: Record<AnalysisNovelty, string> = {
  'new': 'New connection',
  'partly-known': 'Partly known',
  'known-elsewhere': 'Known elsewhere',
}

/** What the novelty means, for a chip's tooltip. */
export const NOVELTY_HINT: Record<AnalysisNovelty, string> = {
  'new': 'A web check found nothing public that makes this connection.',
  'partly-known': 'Parts of this connection are already public outside Gerb\'s videos.',
  'known-elsewhere': 'This connection is already public outside Gerb\'s videos.',
}

export interface AnalysisMeta {
  kind: AnalysisKind | null
  confidence: AnalysisConfidence | null
  novelty: AnalysisNovelty | null
  /** `YYYY-MM-DD`. */
  date: string | null
  dek: string
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return (allowed as readonly string[]).includes(v) ? (v as T) : null
}

/**
 * An analysis note's frontmatter, as the page has it. An unquoted
 * `date: 2026-10-16` arrives parsed (a Date, or its ISO string), so only its
 * first ten characters are kept.
 */
export function readAnalysisMeta(read: (key: string) => unknown): AnalysisMeta {
  const date = read('date')
  const iso = date instanceof Date ? date.toISOString() : String(date ?? '')
  const dek = read('dek')
  return {
    kind: oneOf(ANALYSIS_KINDS, read('kind')),
    confidence: oneOf(ANALYSIS_CONFIDENCES, read('confidence')),
    novelty: oneOf(ANALYSIS_NOVELTIES, read('novelty')),
    date: /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null,
    dek: typeof dek === 'string' ? dek.trim() : '',
  }
}
