import type { PDFDocumentProxy } from 'pdfjs-dist'

/**
 * pdf.js, loaded once per visit and only in the browser, the first time a
 * document viewer (on a document's page or in a `::wiki-document`) needs
 * it. Nothing about it ships in the main bundle.
 *
 * The legacy build, not the default one: pdf.js 6 calls very recent
 * JavaScript (`Map.prototype.getOrInsertComputed`, among others) that many
 * browsers in use don't have yet, and the legacy build polyfills it.
 */
type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

let pdfjs: Promise<Pdfjs> | undefined

export function loadPdfjs(): Promise<Pdfjs> {
  pdfjs ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default
    return lib
  })
  return pdfjs
}

/** One shared document per file, so a page with several viewers of it opens it once. */
const open = new Map<string, { task: Promise<PDFDocumentProxy>, destroy: () => void, users: number }>()

/** A viewer's hold on an opened file: the document, and a way to let go of it. */
export interface PdfHandle {
  pdf: Promise<PDFDocumentProxy>
  /** Idempotent. The last viewer to let go destroys the document. */
  release: () => void
}

/**
 * Feeds pdf.js the byte ranges it asks for, fetched with `Range` requests.
 *
 * pdf.js's own loader decides whether a server takes ranges from the
 * `Accept-Ranges` response header, and the bucket doesn't list it in
 * `Access-Control-Expose-Headers`, so a page can't read it: left to itself,
 * pdf.js downloads the whole file (119 MB for the Project Grudge report).
 * The bucket does answer ranges, and the manifest knows each file's length,
 * so this asks for them directly.
 */
function rangeTransport(lib: Pdfjs, url: string, length: number, onFail: () => void): InstanceType<Pdfjs['PDFDataRangeTransport']> {
  const transport = new lib.PDFDataRangeTransport(length, null)
  const inFlight = new Set<AbortController>()
  async function fetchRange(begin: number, end: number, attempt: number): Promise<void> {
    const ctrl = new AbortController()
    inFlight.add(ctrl)
    try {
      const res = await fetch(url, { headers: { Range: `bytes=${begin}-${end - 1}` }, signal: ctrl.signal })
      if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP ${res.status}`)
      const bytes = new Uint8Array(await res.arrayBuffer())
      // A server that ignores `Range` sends the whole file.
      transport.onDataRange(begin, res.status === 200 ? bytes.subarray(begin, end) : bytes)
    }
    catch (e) {
      if (ctrl.signal.aborted) return
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 600 * (attempt + 1)))
        return fetchRange(begin, end, attempt + 1)
      }
      console.warn('pdf range request failed', e)
      onFail()
    }
    finally {
      inFlight.delete(ctrl)
    }
  }
  transport.requestDataRange = (begin: number, end: number) => void fetchRange(begin, end, 0)
  transport.abort = () => {
    for (const c of inFlight) c.abort()
    inFlight.clear()
  }
  return transport
}

/**
 * The smallest range pdf.js asks for. Smaller than its default (64 KiB):
 * opening a document reads every page's dictionary (to check the last page
 * exists), and in a PDF bound from scans each sits beside its page's image,
 * so every one of them costs a chunk. Runs of chunks a page needs go out as
 * one request, so drawing pages doesn't pay for the smaller size.
 */
const CHUNK = 16_384

/**
 * Open a hosted PDF, or share the copy another viewer on the page already
 * opened. With the file's length (`bytes`, from the manifest), pdf.js
 * fetches only the byte ranges the pages it draws need, rather than the
 * whole file.
 */
export function acquirePdf(url: string, bytes?: number): PdfHandle {
  let entry = open.get(url)
  if (!entry) {
    let loading: ReturnType<Pdfjs['getDocument']> | null = null
    let destroyed = false
    let opened = false
    const task = loadPdfjs().then((lib) => {
      if (destroyed) throw new Error('released')
      // Destroying a loading task doesn't reject its promise, so a file whose
      // ranges can't be fetched fails the open here instead.
      let fail: (e: Error) => void = () => undefined
      const failed = new Promise<never>((_, reject) => { fail = reject })
      loading = lib.getDocument({
        ...(bytes
          ? { range: rangeTransport(lib, url, bytes, () => {
              if (opened) return
              fail(new Error('range requests failed'))
              void loading?.destroy()
            }) }
          : { url }),
        disableAutoFetch: true,
        disableStream: true,
        rangeChunkSize: CHUNK,
        // Served from the site by `nitro.publicAssets` in nuxt.config.
        wasmUrl: '/pdfjs/wasm/',
        cMapUrl: '/pdfjs/cmaps/',
        standardFontDataUrl: '/pdfjs/standard_fonts/',
        iccUrl: '/pdfjs/iccs/',
      })
      return Promise.race([
        loading.promise.then((doc) => {
          opened = true
          return doc
        }),
        failed,
      ])
    })
    const created = {
      task,
      users: 0,
      destroy: () => {
        destroyed = true
        void loading?.destroy()
      },
    }
    // A failed open is forgotten, so trying again starts afresh.
    task.catch(() => {
      if (open.get(url) === created) open.delete(url)
    })
    entry = created
    open.set(url, entry)
  }
  const held = entry
  held.users++
  let released = false
  return {
    pdf: held.task,
    release() {
      if (released) return
      released = true
      held.users--
      if (held.users > 0) return
      if (open.get(url) === held) open.delete(url)
      held.destroy()
    },
  }
}

/**
 * How many device pixels to draw per CSS pixel for a page `cssWidth` by
 * `cssHeight`: the screen's density, at most 2, and less when that would make
 * the canvas larger than `maxPixels` (a zoomed-in page on a wide screen could
 * otherwise take hundreds of megabytes).
 */
export function canvasScale(cssWidth: number, cssHeight: number, dpr: number, maxPixels = 16_777_216): number {
  const wanted = Math.min(Math.max(dpr || 1, 1), 2)
  const area = cssWidth * cssHeight
  if (!(area > 0)) return wanted
  return Math.min(wanted, Math.sqrt(maxPixels / area))
}
