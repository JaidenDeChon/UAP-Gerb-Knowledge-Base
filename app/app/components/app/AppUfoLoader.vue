<script setup lang="ts">
/**
 * The loading mark: Bob Lazar's "sport model" disc, built part by part,
 * held for a beat, then taken apart in reverse order, forever.
 *
 * A side-elevation cutaway after Lazar's account of the S-4 craft: a disc about
 * 40 ft across and 15 ft tall, on three levels:
 * - the lower level holds three gravity amplifiers over three emitters set in a
 *   triangle on the underside;
 * - the middle level has a hexagonal floor, three undersized seats, and the
 *   basketball-sized reactor (square base plate, hemispherical top) at its centre,
 *   with waveguides running from it to the amplifiers;
 * - the top level has a ring of small black portholes;
 * - a hatch in the hull collapses to let crew in, and in flight the hull wears a
 *   blue corona.
 *
 * The drawing is static SVG, so the server renders the finished craft. On the
 * client each part gets one Web Animation on a shared clock, starting mid-hold
 * so the first frame matches the server's. `prefers-reduced-motion` keeps the
 * assembled craft and skips the loop.
 */

interface Part {
  /** Readout shown while the part flies in and out. */
  label: string
  /** Where it flies in from, relative to where it lands (SVG units, degrees). */
  from: { x?: number, y?: number, rotate?: number, scale?: number }
}

// Bottom up, the order a craft would be built in. Keys match the `data-part`
// groups in the template.
const PARTS: Part[] = [
  { label: 'Lower hull', from: { y: 70 } },
  { label: 'Gravity emitters ×3', from: { y: 90, scale: 0.4 } },
  { label: 'Gravity amplifiers ×3', from: { x: -150, rotate: -25 } },
  { label: 'Hexagonal deck', from: { x: 170 } },
  { label: 'Waveguides', from: { x: -170, y: -20 } },
  { label: 'Reactor · element 115', from: { y: -110, rotate: 180, scale: 0.3 } },
  { label: 'Crew seats ×3', from: { x: 160, y: -30 } },
  { label: 'Hull rim · hatch', from: { x: -190 } },
  { label: 'Upper level · portholes', from: { y: -120 } },
  { label: 'Corona', from: { scale: 0.2 } },
]

// Timing, in ms. Each part starts `STEP` after the one before and takes `FLY`
// to land, so a few are in the air at once; the teardown runs a little quicker.
const STEP = 420
const FLY = 620
const STEP_OUT = 300
const FLY_OUT = 460
const HOLD = 1600
const REST = 500

const n = PARTS.length
const assembled = (n - 1) * STEP + FLY
const outStart = assembled + HOLD
const cycle = outStart + (n - 1) * STEP_OUT + FLY_OUT + REST

const root = ref<SVGSVGElement | null>(null)
let animations: Animation[] = []

function away({ x = 0, y = 0, rotate = 0, scale = 1 }: Part['from']): string {
  return `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scale})`
}

const LANDED = 'translate(0px, 0px) rotate(0deg) scale(1)'
const EASE_IN = 'cubic-bezier(0.16, 1, 0.3, 1)' // decelerate into place
const EASE_OUT = 'cubic-bezier(0.7, 0, 0.84, 0)' // accelerate away

onMounted(() => {
  const svg = root.value
  if (!svg || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (typeof svg.animate !== 'function') return

  const at = (ms: number) => Math.min(1, Math.max(0, ms / cycle))
  // Web Animations throws on offsets that go backwards, so clamp each to its
  // predecessor rather than trust the arithmetic above at every boundary.
  const monotonic = (frames: Keyframe[]): Keyframe[] => {
    let floor = 0
    return frames.map((frame) => {
      floor = Math.max(floor, Number(frame.offset ?? floor))
      return { ...frame, offset: floor }
    })
  }
  const loop = (el: Element, frames: Keyframe[]) => {
    animations.push(el.animate(monotonic(frames), { duration: cycle, iterations: Infinity }))
  }

  try {
    build()
  }
  catch {
    // A loader must never take the page down with it: fall back to the
    // static, assembled craft the server rendered.
    for (const animation of animations) animation.cancel()
    animations = []
    return
  }

  // Open mid-hold, fully assembled, which is what the server rendered.
  const start = outStart - HOLD / 2
  for (const animation of animations) animation.currentTime = start

  function build(): void {
    PARTS.forEach((part, i) => {
      const inStart = i * STEP
      const inEnd = inStart + FLY
      // Reverse order out: the last part built is the first to leave.
      const leave = outStart + (n - 1 - i) * STEP_OUT
      const gone = leave + FLY_OUT
      const off = away(part.from)

      const el = svg.querySelector<SVGGElement>(`[data-part="${i}"]`)
      if (el) {
        loop(el, [
          { offset: 0, transform: off, opacity: 0 },
          { offset: at(inStart), transform: off, opacity: 0, easing: EASE_IN },
          { offset: at(inEnd), transform: LANDED, opacity: 1 },
          { offset: at(leave), transform: LANDED, opacity: 1, easing: EASE_OUT },
          { offset: at(gone), transform: off, opacity: 0 },
          { offset: 1, transform: off, opacity: 0 },
        ])
      }

      // Its readout shows from launch until the next part launches, on the way
      // in and again on the way out. Each fades out before the next fades in,
      // so two never overlap.
      const label = svg.querySelector<SVGTextElement>(`[data-label="${i}"]`)
      if (label) {
        // The last one hands over to the title as the craft completes.
        const inHide = i === n - 1 ? assembled : (i + 1) * STEP
        const outHide = i === 0 ? gone : outStart + (n - i) * STEP_OUT
        loop(label, [
          { offset: 0, opacity: 0 },
          { offset: at(inStart), opacity: 0 },
          { offset: at(inStart + 120), opacity: 1 },
          { offset: at(inHide - 90), opacity: 1 },
          { offset: at(inHide), opacity: 0 },
          { offset: at(leave), opacity: 0 },
          { offset: at(leave + 90), opacity: 1 },
          { offset: at(outHide - 90), opacity: 1 },
          { offset: at(outHide), opacity: 0 },
          { offset: 1, opacity: 0 },
        ])
      }
    })

    const title = svg.querySelector<SVGTextElement>('[data-label="title"]')
    if (title) {
      loop(title, [
        { offset: 0, opacity: 0 },
        { offset: at(assembled + 60), opacity: 0 },
        { offset: at(assembled + 260), opacity: 1 },
        { offset: at(outStart), opacity: 1 },
        { offset: at(outStart + 80), opacity: 0 },
        { offset: 1, opacity: 0 },
      ])
    }
  }
})

onBeforeUnmount(() => {
  for (const animation of animations) animation.cancel()
  animations = []
})
</script>

<template>
  <svg
    ref="root"
    class="ufo-loader"
    viewBox="0 0 320 196"
    fill="none"
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="ufo-corona-fill" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="hsl(var(--ufo-corona))" stop-opacity="0.55" />
        <stop offset="60%" stop-color="hsl(var(--ufo-corona))" stop-opacity="0.16" />
        <stop offset="100%" stop-color="hsl(var(--ufo-corona))" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="ufo-core" cx="50%" cy="60%" r="50%">
        <stop offset="0%" stop-color="hsl(var(--ufo-corona))" stop-opacity="0.95" />
        <stop offset="100%" stop-color="hsl(var(--ufo-corona))" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="ufo-hull" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="hsl(var(--primary))" stop-opacity="0.16" />
        <stop offset="100%" stop-color="hsl(var(--primary))" stop-opacity="0.02" />
      </linearGradient>
    </defs>

    <!-- Static instrument frame: a range ring, ticks and a centreline. -->
    <g class="ufo-frame">
      <ellipse cx="160" cy="84" rx="150" ry="74" />
      <path d="M160 6v8M160 154v8M6 84h8M306 84h8" />
      <path class="ufo-frame-dash" d="M20 84h280" />
    </g>

    <!-- 10 · The blue corona Lazar saw in flight, last on and first off.
         Drawn first so it glows behind the hull, not over the portholes. -->
    <g data-part="9" class="ufo-part">
      <ellipse cx="160" cy="92" rx="146" ry="54" fill="url(#ufo-corona-fill)" stroke="none" class="ufo-pulse" />
      <ellipse cx="160" cy="132" rx="70" ry="6" fill="url(#ufo-core)" stroke="none" class="ufo-pulse" />
    </g>

    <!-- 1 · Lower hull: the shallow convex belly under the rim. -->
    <g data-part="0" class="ufo-part">
      <path class="ufo-hull" d="M52 105 C 88 118 118 126 160 126 C 202 126 232 118 268 105 Z" />
      <path class="ufo-seam" d="M78 112 C 110 121 210 121 242 112" />
    </g>

    <!-- 2 · Gravity emitters: three, in a triangle on the underside. -->
    <g data-part="1" class="ufo-part">
      <g class="ufo-emitter">
        <ellipse cx="112" cy="121" rx="10" ry="3.6" />
        <ellipse cx="112" cy="121" rx="4.5" ry="1.6" class="ufo-glow" />
      </g>
      <g class="ufo-emitter">
        <ellipse cx="208" cy="121" rx="10" ry="3.6" />
        <ellipse cx="208" cy="121" rx="4.5" ry="1.6" class="ufo-glow" />
      </g>
      <g class="ufo-emitter ufo-far">
        <ellipse cx="160" cy="126.5" rx="8" ry="2.8" />
        <ellipse cx="160" cy="126.5" rx="3.5" ry="1.2" class="ufo-glow" />
      </g>
    </g>

    <!-- 3 · Gravity amplifiers: rectangular units in the lower level, one over
         each emitter (the far one drawn dimmer, behind). -->
    <g data-part="2" class="ufo-part">
      <g class="ufo-far">
        <rect x="153" y="106" width="14" height="17" rx="1.5" />
        <path d="M156 110h8M156 114h8M156 118h8" />
      </g>
      <rect x="104" y="104" width="16" height="15" rx="1.5" />
      <path d="M107 108h10M107 111.5h10M107 115h10" />
      <rect x="200" y="104" width="16" height="15" rx="1.5" />
      <path d="M203 108h10M203 111.5h10M203 115h10" />
    </g>

    <!-- 4 · The middle level's hexagonal deck. -->
    <g data-part="3" class="ufo-part">
      <path d="M58 98 L262 98" class="ufo-deck" />
      <g class="ufo-hex">
        <path d="M86 101.5 l3 -1.8 3 1.8 0 1.2 -3 1.8 -3 -1.8 Z" />
        <path d="M122 101.5 l3 -1.8 3 1.8 0 1.2 -3 1.8 -3 -1.8 Z" />
        <path d="M192 101.5 l3 -1.8 3 1.8 0 1.2 -3 1.8 -3 -1.8 Z" />
        <path d="M228 101.5 l3 -1.8 3 1.8 0 1.2 -3 1.8 -3 -1.8 Z" />
      </g>
    </g>

    <!-- 5 · Waveguides from the reactor down to each amplifier. -->
    <g data-part="4" class="ufo-part">
      <path class="ufo-guide" d="M152 97 C 138 99 122 100 112 104" />
      <path class="ufo-guide" d="M168 97 C 182 99 198 100 208 104" />
      <path class="ufo-guide ufo-far" d="M160 97 L160 106" />
    </g>

    <!-- 6 · The reactor: square base plate, hemispherical top, glowing core. -->
    <g data-part="5" class="ufo-part">
      <rect x="147" y="91" width="26" height="6" rx="1" />
      <path class="ufo-hull" d="M150 91 A 10 10 0 0 1 170 91 Z" />
      <circle cx="160" cy="87" r="5" fill="url(#ufo-core)" stroke="none" class="ufo-pulse" />
    </g>

    <!-- 7 · Three undersized seats facing the reactor. -->
    <g data-part="6" class="ufo-part">
      <path d="M96 97 v-5 h7 M96 92 v-8" />
      <path d="M224 97 v-5 h-7 M224 92 v-8" />
      <path class="ufo-far" d="M190 97 v-4 h5 M190 93 v-6" />
    </g>

    <!-- 8 · The hull rim, with the hatch cut into it. -->
    <g data-part="7" class="ufo-part">
      <path class="ufo-hull" d="M30 101 L52 97 L268 97 L290 101 L268 105 L52 105 Z" />
      <path class="ufo-hatch" d="M64 97 C 64 90 70 85.5 77 85 L80 97" />
      <path class="ufo-hex ufo-hatch-cells" d="M69 92.5 l2 -1.2 2 1.2 0 1 -2 1.2 -2 -1.2 Z M73 88.8 l2 -1.2 2 1.2 0 1 -2 1.2 -2 -1.2 Z" />
    </g>

    <!-- 9 · The upper hull and top level, ringed with small black portholes. -->
    <g data-part="8" class="ufo-part">
      <path class="ufo-hull" d="M52 97 C 80 89 100 79 116 72 L204 72 C 220 79 240 89 268 97 Z" />
      <path class="ufo-hull" d="M116 72 C 119 51 138 38 160 37 C 182 38 201 51 204 72 Z" />
      <g class="ufo-port">
        <rect x="126.5" y="59" width="6" height="3.4" rx="1.4" />
        <rect x="140.5" y="56" width="6" height="3.4" rx="1.4" />
        <rect x="157" y="55" width="6" height="3.4" rx="1.4" />
        <rect x="173.5" y="56" width="6" height="3.4" rx="1.4" />
        <rect x="187.5" y="59" width="6" height="3.4" rx="1.4" />
      </g>
      <path class="ufo-seam" d="M122 66 C 140 63 180 63 198 66" />
    </g>

    <!-- Readouts. -->
    <g class="ufo-readout">
      <text
        v-for="(part, i) in PARTS"
        :key="i"
        :data-label="i"
        x="160"
        y="184"
        class="ufo-label"
      >
        {{ String(i + 1).padStart(2, '0') }}/{{ n }} · {{ part.label }}
      </text>
      <text data-label="title" x="160" y="184" class="ufo-label ufo-title">
        Sport model · S-4
      </text>
    </g>
  </svg>
</template>

<style scoped>
.ufo-loader {
  /* Lazar's blue corona. The org-blue graph token is the kit's themed blue. */
  --ufo-corona: var(--graph-cat-orgs);
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
  stroke: hsl(var(--primary));
  stroke-width: 1.1;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ufo-part {
  transform-box: view-box;
  transform-origin: 160px 96px;
  will-change: transform, opacity;
}

.ufo-frame {
  stroke: hsl(var(--muted-foreground));
  stroke-opacity: 0.22;
  stroke-width: 0.6;
}
.ufo-frame-dash {
  stroke-dasharray: 2 5;
}

.ufo-hull {
  fill: url(#ufo-hull);
}
.ufo-seam,
.ufo-hex {
  stroke-opacity: 0.45;
  stroke-width: 0.7;
}
.ufo-far {
  opacity: 0.5;
}
.ufo-deck {
  stroke-width: 1.4;
}
.ufo-hatch {
  stroke-dasharray: 1.6 1.4;
}

.ufo-emitter .ufo-glow {
  fill: hsl(var(--ufo-corona));
  stroke: none;
}

/* Energy running down the waveguides. */
.ufo-guide {
  stroke: hsl(var(--ufo-corona));
  stroke-dasharray: 3 3;
  animation: ufo-flow 0.9s linear infinite;
}

/* Portholes read black: filled with the foreground ink on light themes and
   the page background on dark ones, ringed in the line colour either way. */
.ufo-port rect {
  fill: hsl(var(--foreground));
  stroke-width: 0.6;
}
[data-theme='dark'] .ufo-port rect,
[data-theme='dim'] .ufo-port rect {
  fill: hsl(var(--background));
}

.ufo-pulse {
  animation: ufo-pulse 2.4s ease-in-out infinite;
}

.ufo-label {
  fill: hsl(var(--muted-foreground));
  stroke: none;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 8px;
  letter-spacing: 0.16em;
  text-anchor: middle;
  text-transform: uppercase;
  opacity: 0;
}
.ufo-title {
  fill: hsl(var(--primary));
  opacity: 1;
}

@keyframes ufo-flow {
  to { stroke-dashoffset: -12; }
}
@keyframes ufo-pulse {
  0%, 100% { opacity: 0.75; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .ufo-guide,
  .ufo-pulse {
    animation: none;
  }
}
</style>
