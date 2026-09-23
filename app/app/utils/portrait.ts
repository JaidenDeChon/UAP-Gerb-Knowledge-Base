import type { NotePortrait } from '#shared/types/wiki'

/**
 * Text for a person's portrait (`NoteRef.image`, see
 * `wiki/portraits.ts`). The portraits are freely licensed Commons files
 * stored in the repo; these keep their alt text and credit line the same on
 * every surface that shows one.
 */

/** Alt text: the picture is of the named person, and says so. */
export function portraitAlt(name: string): string {
  const clean = name.trim()
  return clean ? `Portrait of ${clean}` : 'Portrait'
}

/**
 * One-line attribution, for a tooltip or a caption:
 * `Photo: A.Savin · CC BY-SA 3.0 · Wikimedia Commons`. "Unknown author" is
 * left out rather than printed ("Photo: Public domain · Wikimedia Commons").
 */
export function portraitCredit(image: Pick<NotePortrait, 'author' | 'license'>): string {
  const author = image.author.trim()
  const known = author && !/^unknown author$/i.test(author)
  return [known ? `Photo: ${author}` : 'Photo', image.license.trim(), 'Wikimedia Commons']
    .filter(Boolean)
    .join(' · ')
}
