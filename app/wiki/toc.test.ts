import { describe, expect, it } from 'vitest'
import type { MinimarkElement, TocBody } from './toc'
import { cleanTocLabels, headingSlug } from './toc'

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

  it('re-slugs the id of a heading that embeds a component, on the node AND the toc link', () => {
    const b = body()
    cleanTocLabels(b)
    expect(b.toc!.links![0]!.id).toBe('chronology')
    expect((b.value![0] as MinimarkElement)[1].id).toBe('chronology')
  })

  it('leaves the id of a plain heading exactly as generated', () => {
    const b = body()
    cleanTocLabels(b)
    expect(b.toc!.links![1]!.id).toBe('overview')
    expect(b.toc!.links![0]!.children![0]!.id).toBe('nested')
  })

  it('keeps the generated id when the cleaned slug would collide with another heading', () => {
    const b: TocBody = {
      value: [
        ['h2', { id: 'overview' }, 'Overview'],
        ['h2', { id: 'overview-how-to-read' }, 'Overview ', ['wiki-info', {}, 'How to read']],
      ],
      toc: {
        links: [
          { id: 'overview', depth: 2, text: 'Overview' },
          { id: 'overview-how-to-read', depth: 2, text: 'Overview How to read' },
        ],
      },
    }
    cleanTocLabels(b)
    expect(b.toc!.links![1]!.id).toBe('overview-how-to-read')
    expect(b.toc!.links![1]!.text).toBe('Overview')
    expect((b.value![1] as MinimarkElement)[1].id).toBe('overview-how-to-read')
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

describe('headingSlug', () => {
  it('matches the id @nuxtjs/mdc generates for ordinary headings', () => {
    expect(headingSlug('The Golden Era (1947-1978)')).toBe('the-golden-era-1947-1978')
    expect(headingSlug('Key Figures')).toBe('key-figures')
    expect(headingSlug("Program Structure -- chip's dot")).toBe('program-structure-chips-dot')
  })

  it('prefixes a leading digit and trims edge hyphens like mdc does', () => {
    expect(headingSlug('1947: Roswell')).toBe('_1947-roswell')
    expect(headingSlug('-- aside --')).toBe('aside')
  })
})
