import { ref, type Ref } from 'vue'
import { exportFileName, isTransparentColor, wrapLines } from '@/utils/diagramExport'

/**
 * PNG export for a diagram (org chart today; any diagram wrapped in
 * `WikiDiagramFrame` tomorrow).
 *
 * The DOM → canvas step is `modern-screenshot`, imported dynamically on the
 * first click so it costs nothing at page load. It clones the diagram with
 * every element's *computed* style inlined, so the live theme's
 * `hsl(var(--…))` colours, category-tinted surfaces and connector lines come
 * out exactly as painted, and it embeds the web fonts (Inter, Chakra Petch,
 * JetBrains Mono — including the Google Fonts `@import`) as data URLs so the
 * SVG it rasterises never taints the canvas. It renders the node itself, not
 * the viewport, so a chart scrolled or clipped by its container is captured
 * whole.
 *
 * That picture is then composed onto a second canvas with the page's own
 * backdrop colour, padding, the caption (if any) and a one-line footer
 * naming the article and the site — drawn with canvas text, in the same
 * fonts and theme colours.
 */

/** Device pixels per CSS pixel. Sharp on retina without being huge. */
const EXPORT_SCALE = 2
/**
 * iOS Safari refuses canvases over 16,777,216 px (4096²); stay under it and
 * drop below 2× only for a chart big enough to hit it.
 */
const MAX_CANVAS_AREA = 16_000_000
const MAX_CANVAS_SIDE = 16_000

const PAD = 32
const MIN_WIDTH = 480
const CAPTION_SIZE = 13
const CAPTION_LINE = 19
const FOOTER_SIZE = 10
const SITE_NAME = 'UAP Gerb Knowledge Base'

export interface DiagramExportOptions {
  /** The element to capture: the diagram itself, at its natural size. */
  target: () => HTMLElement | null | undefined
  /** Article title — footer text and the first part of the file name. */
  title: () => string | undefined
  /** What the diagram is, e.g. "US Air Force org chart" — the rest of the file name. */
  label: () => string | undefined
  /** Optional caption, drawn under the diagram. */
  caption?: () => string | undefined
}

export interface DiagramExport {
  busy: Ref<boolean>
  error: Ref<string | null>
  fileName: () => string
  /** Render and save the PNG. */
  download: () => Promise<void>
  /**
   * Render and open the PNG in a new tab, where iOS can long-press → Save
   * to Photos. Must be called straight from the click handler: the tab is
   * opened synchronously, before the render, so no popup blocker objects.
   */
  view: () => void
}

/** A theme colour expression (e.g. `hsl(var(--foreground))`) as the browser resolves it here. */
function resolveColor(scope: HTMLElement, expr: string): string {
  const probe = document.createElement('span')
  probe.style.color = expr
  probe.style.display = 'none'
  scope.appendChild(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}

/** The first colour actually painted behind `el` — its card, the article, or the page. */
function backdropColor(el: HTMLElement): string {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const bg = getComputedStyle(node).backgroundColor
    if (!isTransparentColor(bg)) return bg
  }
  return resolveColor(document.body, 'hsl(var(--background))')
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))), 'image/png')
  })
}

export function useDiagramExport(options: DiagramExportOptions): DiagramExport {
  const busy = ref(false)
  const error = ref<string | null>(null)

  const fileName = () => exportFileName([options.title(), options.label()])

  async function render(): Promise<{ blob: Blob, width: number, backdrop: string }> {
    const el = options.target()
    if (!el) throw new Error('Nothing to export')

    const backdrop = backdropColor(el)
    const ink = resolveColor(el, 'hsl(var(--foreground))')
    const muted = resolveColor(el, 'hsl(var(--muted-foreground))')
    const rule = resolveColor(el, 'hsl(var(--border))')
    const sans = cssVar('--font-sans', 'sans-serif')
    const mono = cssVar('--font-mono', 'monospace')

    const width = Math.ceil(el.scrollWidth)
    const height = Math.ceil(el.scrollHeight)
    const caption = options.caption?.()?.trim() ?? ''
    const title = options.title()?.trim() ?? ''

    const captionFont = `400 ${CAPTION_SIZE}px ${sans}`
    const footerFont = `600 ${FOOTER_SIZE}px ${mono}`
    await Promise.all([
      document.fonts.ready,
      caption ? document.fonts.load(captionFont, caption) : null,
      document.fonts.load(footerFont, `${SITE_NAME}${title}`),
    ])

    // Page layout in CSS pixels, before scaling.
    const outerW = Math.max(width + PAD * 2, MIN_WIDTH)
    const measureCtx = document.createElement('canvas').getContext('2d')!
    measureCtx.font = captionFont
    const captionLines = caption
      ? wrapLines(caption, outerW - PAD * 2, s => measureCtx.measureText(s).width)
      : []
    const captionH = captionLines.length ? 14 + captionLines.length * CAPTION_LINE : 0
    const footerH = 20 + 1 + 14 + FOOTER_SIZE
    const outerH = PAD + height + captionH + footerH + PAD

    const scale = Math.min(
      EXPORT_SCALE,
      Math.sqrt(MAX_CANVAS_AREA / (outerW * outerH)),
      MAX_CANVAS_SIDE / outerW,
      MAX_CANVAS_SIDE / outerH,
    )

    const { domToCanvas } = await import('modern-screenshot')
    const shot = await domToCanvas(el, {
      width,
      height,
      scale,
      backgroundColor: null,
      font: { preferredFormat: 'woff2' },
      // The captured root sits at its natural size, clear of whatever
      // margin/centering the page gave it.
      style: { margin: '0', maxWidth: 'none' },
      filter: node => !(node instanceof HTMLElement && node.dataset.exportIgnore !== undefined),
    })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(outerW * scale)
    canvas.height = Math.round(outerH * scale)
    const ctx = canvas.getContext('2d')!
    ctx.scale(scale, scale)
    ctx.fillStyle = backdrop
    ctx.fillRect(0, 0, outerW, outerH)
    ctx.drawImage(shot, (outerW - width) / 2, PAD, width, height)

    let y = PAD + height
    if (captionLines.length) {
      y += 14
      ctx.font = captionFont
      ctx.fillStyle = muted
      ctx.textBaseline = 'top'
      for (const line of captionLines) {
        ctx.fillText(line, PAD, y + (CAPTION_LINE - CAPTION_SIZE) / 2)
        y += CAPTION_LINE
      }
    }

    y += 20
    ctx.fillStyle = rule
    ctx.fillRect(PAD, y, outerW - PAD * 2, 1)
    y += 1 + 14

    ctx.font = footerFont
    ctx.textBaseline = 'top'
    ctx.fillStyle = ink
    const site = SITE_NAME.toUpperCase()
    const siteW = ctx.measureText(site).width
    ctx.textAlign = 'right'
    ctx.fillText(site, outerW - PAD, y)
    if (title) {
      ctx.textAlign = 'left'
      ctx.fillStyle = muted
      const room = outerW - PAD * 2 - siteW - 24
      let text = title
      while (text.length > 1 && ctx.measureText(text).width > room) text = text.slice(0, -2)
      if (text !== title) text = `${text.trimEnd()}…`
      if (room > 40) ctx.fillText(text, PAD, y)
    }

    return { blob: await toBlob(canvas), width: outerW, backdrop }
  }

  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (busy.value) return
    busy.value = true
    error.value = null
    try {
      return await task()
    } catch (err) {
      console.error('[diagram export]', err)
      error.value = 'Could not create the image.'
    } finally {
      busy.value = false
    }
  }

  async function download(): Promise<void> {
    await run(async () => {
      const { blob } = await render()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName()
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    })
  }

  function view(): void {
    if (busy.value) return
    // Opened now, inside the click, so it counts as user-initiated; filled in
    // once the image exists. No `noopener`: that would hand back null and
    // leave us no window to write into.
    const win = window.open('', '_blank')
    if (win) {
      win.document.title = 'Rendering image…'
      win.document.body.style.cssText = `margin:0;min-height:100vh;display:grid;place-items:center;background:${backdropColor(options.target() ?? document.body)};color:${resolveColor(document.body, 'hsl(var(--muted-foreground))')};font:13px ${cssVar('--font-sans', 'sans-serif')}`
      win.document.body.textContent = 'Rendering image…'
    }
    void run(async () => {
      const { blob, width, backdrop } = await render()
      if (!win || win.closed) {
        // Popup blocked or closed early: fall back to a plain download.
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName()
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 30_000)
        return
      }
      // A data: URL rather than a blob: one — it lives as long as the tab,
      // and iOS "Save to Photos" re-reads the image source when saving.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
      const doc = win.document
      doc.title = fileName()
      const meta = doc.createElement('meta')
      meta.name = 'viewport'
      meta.content = 'width=device-width, initial-scale=1'
      doc.head.appendChild(meta)
      doc.body.textContent = ''
      doc.body.style.cssText = `margin:0;min-height:100vh;display:grid;place-items:center;background:${backdrop}`
      const img = doc.createElement('img')
      img.src = dataUrl
      img.alt = [options.label(), options.title()].filter(Boolean).join(' — ')
      img.style.cssText = `display:block;width:${width}px;max-width:100%;height:auto`
      doc.body.appendChild(img)
    }).then(() => {
      if (error.value && win && !win.closed) win.close()
    })
  }

  return { busy, error, fileName, download, view }
}
