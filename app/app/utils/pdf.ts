import type { PDFDocumentProxy } from 'pdfjs-dist'

/**
 * pdf.js, loaded once per visit and only in the browser, the first time a
 * document viewer or an inline `::wiki-document` page needs it. Nothing about
 * it ships in the main bundle.
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

/** One shared loading task per file, so a page with several excerpts of it opens it once. */
const open = new Map<string, Promise<PDFDocumentProxy>>()

/**
 * Open a hosted PDF. The bucket serves byte ranges, so pdf.js fetches only the
 * parts the pages it draws need rather than the whole file.
 */
export function openPdf(url: string): Promise<PDFDocumentProxy> {
  let task = open.get(url)
  if (!task) {
    task = loadPdfjs().then(lib => lib.getDocument({
      url,
      disableAutoFetch: true,
      disableStream: true,
      // Served from the site by `nitro.publicAssets` in nuxt.config.
      wasmUrl: '/pdfjs/wasm/',
      cMapUrl: '/pdfjs/cmaps/',
      standardFontDataUrl: '/pdfjs/standard_fonts/',
      iccUrl: '/pdfjs/iccs/',
    }).promise)
    task.catch(() => open.delete(url))
    open.set(url, task)
  }
  return task
}

/** Forget an opened file (the viewer calls this when it unmounts and destroys it). */
export function closePdf(url: string): void {
  open.delete(url)
}

/**
 * Draw page `n` of `pdf` into a fresh canvas `cssWidth` pixels wide, sharp on
 * high-density screens. Returns the canvas and the scale it was drawn at.
 */
export async function drawPage(pdf: PDFDocumentProxy, n: number, cssWidth: number): Promise<{ canvas: HTMLCanvasElement, scale: number, height: number }> {
  const page = await pdf.getPage(n)
  const base = page.getViewport({ scale: 1 })
  const scale = cssWidth / base.width
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const viewport = page.getViewport({ scale: scale * dpr })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  await page.render({ canvas, viewport }).promise
  return { canvas, scale, height: base.height * scale }
}
