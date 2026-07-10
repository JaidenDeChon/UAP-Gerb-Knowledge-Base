// Renders scripts/share-preview.html to public/img/share-preview.png at 1200x630.
//
// Usage: node scripts/render-share-preview.mjs
//
// Drives headless Chromium over the DevTools protocol (no puppeteer dependency).
// Point CHROME at a browser binary if the defaults below don't match your box.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import net from 'node:net'

const __dirname = dirname(fileURLToPath(import.meta.url))
const HTML = pathToFileURL(resolve(__dirname, 'share-preview.html')).href
const OUT = resolve(__dirname, '../public/img/share-preview.png')
const W = 1200
const H = 630

const CANDIDATES = [
  process.env.CHROME,
  '/opt/homebrew/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean)

const { existsSync } = await import('node:fs')
const chrome = CANDIDATES.find((p) => existsSync(p))
if (!chrome) {
  console.error('No Chromium/Chrome binary found. Set CHROME=/path/to/chrome')
  process.exit(1)
}

function freePort() {
  return new Promise((res, rej) => {
    const srv = net.createServer()
    srv.listen(0, () => {
      const { port } = srv.address()
      srv.close(() => res(port))
    })
    srv.on('error', rej)
  })
}

const port = await freePort()
const proc = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--remote-debugging-port=${port}`,
  `--window-size=${W},${H}`,
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' })

async function cdp() {
  // Wait for the DevTools endpoint, then open a websocket to the page target.
  let target
  for (let i = 0; i < 100; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json())
      target = list.find((t) => t.type === 'page')
      if (target?.webSocketDebuggerUrl) break
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  if (!target) throw new Error('Could not reach Chromium DevTools')

  const { WebSocket } = await import('ws').catch(() => ({ WebSocket: globalThis.WebSocket }))
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })

  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  }
  const send = (method, params = {}) =>
    new Promise((res) => {
      const mid = ++id
      pending.set(mid, res)
      ws.send(JSON.stringify({ id: mid, method, params }))
    })

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: 2, mobile: false,
  })
  await send('Page.navigate', { url: HTML })
  await new Promise((r) => setTimeout(r, 1400)) // fonts + graph script + paint

  const { result } = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: W, height: H, scale: 1 },
    captureBeyondViewport: true,
  })
  ws.close()
  return Buffer.from(result.data, 'base64')
}

try {
  const png = await cdp()
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, png)
  console.log(`Wrote ${OUT} (${(png.length / 1024).toFixed(0)} KB, ${W}x${H}@2x)`)
} finally {
  proc.kill()
}
