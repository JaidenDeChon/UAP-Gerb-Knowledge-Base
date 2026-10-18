// Pure helpers for fetch-documents.mjs, kept apart so tests can import them
// without running the script.

/**
 * Reflows one page of pdftotext output into Markdown paragraphs: lines broken
 * mid-paragraph are joined, words hyphenated across a line break rejoined,
 * blank lines kept as paragraph breaks. Pure, so it's unit-tested
 * (documents-lib.test.ts).
 */
export function reflowPage(text) {
  const paragraphs = text.replace(/\f/g, '').replace(/\r/g, '').split(/\n[ \t]*\n+/)
  return paragraphs
    .map(p => p.split('\n').map(l => l.trim()).filter(Boolean).reduce((out, line) => {
      if (!out) return line
      if (/[a-z]-$/.test(out) && /^[a-z]/.test(line)) return out.slice(0, -1) + line
      return `${out} ${line}`
    }, ''))
    .filter(Boolean)
    .join('\n\n')
}
