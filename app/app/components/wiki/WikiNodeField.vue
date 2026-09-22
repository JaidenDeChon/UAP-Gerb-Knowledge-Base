<script setup lang="ts">
/**
 * An animated field of connected nodes — the app's knowledge-graph motif,
 * alive. Nodes drift slowly; any two within `linkDistance` are joined by a
 * line whose opacity falls off with distance; the pointer "grabs" nearby
 * nodes with lines of its own; a few hub nodes glow.
 *
 * Hand-rolled on a 2D canvas rather than a particles library: the whole
 * effect is a hundred lines, every colour comes straight from the theme
 * tokens (`--primary`, `--graph-edge`) so it re-themes with the page, and
 * it can be exact about when it runs — one static frame under
 * `prefers-reduced-motion`, paused while off-screen or in a background tab,
 * capped at the display's frame rate. Nothing renders on the server; the
 * canvas is empty until mount, so hydration has nothing to match.
 *
 * Fills its parent (`position: absolute; inset: 0`). Pointer position is
 * read from the parent so the canvas itself never intercepts clicks.
 */
const props = withDefaults(
  defineProps<{
    /** Nodes per 10,000 css px²; the total is clamped to [24, 140]. */
    density?: number
    /** Longest link, in css px. */
    linkDistance?: number
    /** Radius within which the pointer draws links to nodes; 0 disables. */
    grabDistance?: number
    /** Drift speed multiplier. */
    speed?: number
  }>(),
  { density: 1.15, linkDistance: 150, grabDistance: 180, speed: 1 },
)

interface Node { x: number, y: number, vx: number, vy: number, r: number, hub: boolean }

const canvas = ref<HTMLCanvasElement | null>(null)

let ctx: CanvasRenderingContext2D | null = null
let nodes: Node[] = []
let w = 0
let h = 0
let dpr = 1
let frame = 0
let lastTs = 0
let onScreen = true
let reduced = false
/** Pointer in canvas space, resolved once per frame from `pointerClient`. */
let pointer: { x: number, y: number } | null = null
/** Last pointer position in viewport space; the move handler stores this and nothing else. */
let pointerClient: { x: number, y: number } | null = null
let colors = { node: '142 70% 45%', edge: '0 0% 45%' }

let resizeObserver: ResizeObserver | null = null
let intersection: IntersectionObserver | null = null
let themeObserver: MutationObserver | null = null
let motionQuery: MediaQueryList | null = null
let dprQuery: MediaQueryList | null = null
/** The nearest ancestor that receives pointer events; the stage and canvas do not. */
let parent: HTMLElement | null = null

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** The theme's raw HSL triplets, read once per theme so the field re-colours with the page. */
function readColors(): void {
  if (!canvas.value) return
  const cs = getComputedStyle(canvas.value)
  const node = cs.getPropertyValue('--primary').trim()
  const edge = cs.getPropertyValue('--graph-edge').trim()
  colors = { node: node || colors.node, edge: edge || colors.edge }
}

function hsl(triplet: string, alpha: number): string {
  return `hsl(${triplet} / ${alpha})`
}

/** Grow or shrink the population to match the area, keeping existing nodes in place. */
function seed(): void {
  const target = clamp(Math.round((w * h / 10000) * props.density), 24, 140)
  while (nodes.length > target) nodes.pop()
  while (nodes.length < target) {
    const angle = Math.random() * Math.PI * 2
    const v = (0.12 + Math.random() * 0.22) * props.speed
    const hub = Math.random() < 0.1
    nodes.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      r: hub ? 3.2 + Math.random() * 1.4 : 1.5 + Math.random() * 1.5,
      hub,
    })
  }
}

function resize(): void {
  if (!canvas.value || !ctx) return
  const prevW = w
  const prevH = h
  w = canvas.value.clientWidth
  h = canvas.value.clientHeight
  dpr = clamp(window.devicePixelRatio || 1, 1, 2)
  canvas.value.width = Math.round(w * dpr)
  canvas.value.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  // Keep the arrangement when the box changes shape rather than re-rolling it.
  if (prevW > 0 && prevH > 0) {
    for (const n of nodes) {
      n.x = (n.x / prevW) * w
      n.y = (n.y / prevH) * h
    }
  }
  seed()
  if (reduced || !running()) draw()
}

/** Advance the drift; `dt` in 1/60ths of a second so speed is frame-rate independent. */
function step(dt: number): void {
  const margin = 24
  for (const n of nodes) {
    n.x += n.vx * dt
    n.y += n.vy * dt
    if (n.x < -margin) n.x = w + margin
    else if (n.x > w + margin) n.x = -margin
    if (n.y < -margin) n.y = h + margin
    else if (n.y > h + margin) n.y = -margin
  }
}

function draw(): void {
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  const R = props.linkDistance
  const R2 = R * R

  // Links: opacity falls off with distance, so clusters read as clusters.
  ctx.lineWidth = 1
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]!
      const dx = a.x - b.x
      const dy = a.y - b.y
      const d2 = dx * dx + dy * dy
      if (d2 > R2) continue
      const t = 1 - Math.sqrt(d2) / R
      ctx.strokeStyle = hsl(colors.edge, 0.1 + t * 0.45)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }

  // The pointer joins the graph: lines to whatever is in reach.
  if (pointer && props.grabDistance > 0) {
    const G = props.grabDistance
    const G2 = G * G
    for (const n of nodes) {
      const dx = n.x - pointer.x
      const dy = n.y - pointer.y
      const d2 = dx * dx + dy * dy
      if (d2 > G2) continue
      const t = 1 - Math.sqrt(d2) / G
      ctx.strokeStyle = hsl(colors.node, 0.1 + t * 0.5)
      ctx.beginPath()
      ctx.moveTo(pointer.x, pointer.y)
      ctx.lineTo(n.x, n.y)
      ctx.stroke()
    }
  }

  // Nodes; hubs carry the brand glow.
  for (const n of nodes) {
    ctx.beginPath()
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
    if (n.hub) {
      ctx.shadowColor = hsl(colors.node, 0.9)
      ctx.shadowBlur = 12
      ctx.fillStyle = hsl(colors.node, 0.95)
    }
    else {
      ctx.shadowBlur = 0
      ctx.fillStyle = hsl(colors.node, 0.75)
    }
    ctx.fill()
  }
  ctx.shadowBlur = 0
}

function running(): boolean {
  return frame !== 0
}

/** One layout read per frame, and only while the pointer is over the hero — never inside the move handler. */
function resolvePointer(): void {
  if (!pointerClient || !canvas.value) {
    pointer = null
    return
  }
  const rect = canvas.value.getBoundingClientRect()
  pointer = { x: pointerClient.x - rect.left, y: pointerClient.y - rect.top }
}

function loop(ts: number): void {
  frame = 0
  if (!onScreen || reduced || document.hidden) return
  const dt = lastTs ? clamp((ts - lastTs) / (1000 / 60), 0, 3) : 1
  lastTs = ts
  step(dt)
  resolvePointer()
  draw()
  frame = requestAnimationFrame(loop)
}

function start(): void {
  if (running() || reduced || !onScreen || document.hidden) return
  lastTs = 0
  frame = requestAnimationFrame(loop)
}

function stop(): void {
  if (frame) cancelAnimationFrame(frame)
  frame = 0
}

function onPointerMove(event: PointerEvent): void {
  if (reduced) return
  pointerClient = { x: event.clientX, y: event.clientY }
}
function onPointerLeave(): void {
  pointerClient = null
  pointer = null
}
function onVisibility(): void {
  if (document.hidden) stop()
  else start()
}
function onMotionChange(): void {
  reduced = !!motionQuery?.matches
  if (reduced) {
    stop()
    pointerClient = null
    pointer = null
    draw()
  }
  else {
    start()
  }
}
/**
 * The ResizeObserver only sees the CSS box, so a window dragged to a display
 * with a different pixel ratio would keep a stale backing store and blur.
 * A media query for the *current* ratio fires the moment it stops matching.
 */
function watchDpr(): void {
  dprQuery?.removeEventListener('change', onDprChange)
  dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  dprQuery.addEventListener('change', onDprChange)
}
function onDprChange(): void {
  resize()
  watchDpr()
}

onMounted(() => {
  const el = canvas.value
  if (!el) return
  ctx = el.getContext('2d')
  if (!ctx) return

  // The stage the canvas sits in is `pointer-events: none` so the hero's
  // buttons stay clickable, which also means no pointer event ever targets
  // or bubbles through it. Climb to the first ancestor that is hit-testable
  // (the hero section) and listen there.
  let target: HTMLElement | null = el.parentElement
  while (target && getComputedStyle(target).pointerEvents === 'none') target = target.parentElement
  parent = target

  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reduced = motionQuery.matches
  motionQuery.addEventListener('change', onMotionChange)

  readColors()
  resize()
  draw()
  watchDpr()

  // Re-read the tokens once the new theme has landed on <html>. The theme
  // ref changes first and unhead patches `data-theme` a task later, so a
  // watcher on the ref (even after nextTick) would still read the old
  // theme's colours; the attribute is what the token selectors key on.
  themeObserver = new MutationObserver(() => {
    readColors()
    if (!running()) draw()
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(el)

  // No work while scrolled away: the hero is only ever at the top of a page.
  intersection = new IntersectionObserver(([entry]) => {
    onScreen = !!entry?.isIntersecting
    if (onScreen) start()
    else stop()
  }, { threshold: 0 })
  intersection.observe(el)

  document.addEventListener('visibilitychange', onVisibility)
  parent?.addEventListener('pointermove', onPointerMove, { passive: true })
  parent?.addEventListener('pointerleave', onPointerLeave)

  start()
})

onBeforeUnmount(() => {
  stop()
  resizeObserver?.disconnect()
  intersection?.disconnect()
  themeObserver?.disconnect()
  motionQuery?.removeEventListener('change', onMotionChange)
  dprQuery?.removeEventListener('change', onDprChange)
  document.removeEventListener('visibilitychange', onVisibility)
  parent?.removeEventListener('pointermove', onPointerMove)
  parent?.removeEventListener('pointerleave', onPointerLeave)
})
</script>

<template>
  <canvas ref="canvas" class="ufo-nodefield" aria-hidden="true" />
</template>

<style scoped>
.ufo-nodefield {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
