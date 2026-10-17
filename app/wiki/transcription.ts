/**
 * Square brackets in a document transcription are editorial marks (`[sic]`,
 * `[redacted]`, `*[stamp: RECEIVED]*`; see docs/documents.md). MDC would
 * parse a bare `[text]` as an inline span and drop the brackets, so before a
 * transcription is parsed every bracket pair that isn't a Markdown link is
 * escaped. Nested marks (`[stamp: INDEXED - [illegible]]`) are escaped from
 * the inside out. Pure, so it's unit-tested directly.
 */
const MARK_RE = /(?<!\\)\[((?:\\[[\]]|[^[\]\n])*)\](?![([])/g

export function escapeEditorialBrackets(body: string): string {
  let out = body
  for (let previous = ''; previous !== out;) {
    previous = out
    out = out.replace(MARK_RE, (_m, inner: string) => `\\[${inner}\\]`)
  }
  return out
}

/** Whether a content file is a document transcription. */
export function isTranscriptionFile(id: string): boolean {
  return id.includes('Documents/Transcriptions/')
}
