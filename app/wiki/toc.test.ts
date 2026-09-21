import { describe, expect, it } from 'vitest'
import type { TocBody } from './toc'
import { cleanTocLabels } from './toc'

/** The shape @nuxt/content hands the `content:file:afterParse` hook. */
function body(): TocBody {
  return {
    value: [
      ['h2', { id: 'chronology-entries-are-colour-tinted' }, 'Chronology ', [
        'wiki-info',
        { label: 'How to read this timeline' },
        'Entries are colour-tinted by category, and the chips double as the legend.',
      ]],
      ['h2', { id: 'overview' }, 'Overview'],
      ['section', {}, ['h3', { id: 'nested' }, 'A ', ['strong', {}, 'nested'], ' heading']],
    ],
    toc: {
      links: [
        {
          id: 'chronology-entries-are-colour-tinted',
          depth: 2,
          text: 'Chronology Entries are colour-tinted by category, and the chips double as the legend.',
          children: [{ id: 'nested', depth: 3, text: 'A nested heading' }],
        },
        { id: 'overview', depth: 2, text: 'Overview' },
      ],
    },
  }
}

describe('cleanTocLabels', () => {
  it('drops an embedded component\'s prose from the label', () => {
    const b = body()
    cleanTocLabels(b)
    expect(b.toc!.links![0]!.text).toBe('Chronology')
  })

  it('keeps inline markup that is part of the wording', () => {
    const b = body()
    cleanTocLabels(b)
    expect(b.toc!.links![0]!.children![0]!.text).toBe('A nested heading')
  })

  it('leaves anchor ids untouched — the rendered heading still carries them', () => {
    const b = body()
    cleanTocLabels(b)
    expect(b.toc!.links![0]!.id).toBe('chronology-entries-are-colour-tinted')
  })

  it('keeps the original text when a heading is nothing but a component', () => {
    const b: TocBody = {
      value: [['h2', { id: 'only' }, ['wiki-info', {}, 'Just an aside']]],
      toc: { links: [{ id: 'only', depth: 2, text: 'Just an aside' }] },
    }
    cleanTocLabels(b)
    expect(b.toc!.links![0]!.text).toBe('Just an aside')
  })

  it('survives a missing or empty toc', () => {
    expect(() => cleanTocLabels(null)).not.toThrow()
    expect(() => cleanTocLabels({ value: [], toc: { links: [] } })).not.toThrow()
  })
})
