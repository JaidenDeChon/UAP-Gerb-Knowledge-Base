<script setup lang="ts">
/**
 * The loading mark: Bob Lazar's "sport model" disc, materializing part by
 * part, held for a beat, then disintegrating in reverse order, forever.
 *
 * A side-elevation cutaway after Lazar's account of the S-4 craft and the
 * reconstructions drawn from it:
 * - a low, sleek disc with a knife-edge rim;
 * - an upper hull rising in shallow steps to a truncated-cone cabin, with
 *   slanted rectangular windows and a flat cap carrying a short mast;
 * - a shallow belly finished in a lip ring.
 * Inside:
 * - the middle level's hexagonal deck, with three undersized seats and the
 *   basketball-sized reactor (square base plate, hemispherical top) at its
 *   centre;
 * - below it, three gravity amplifiers angled down through the hull, fed by
 *   waveguides from the reactor;
 * - in flight, the blue corona and the amplifiers' beams.
 *
 * The loop opens on the finished craft, which glows and pulses for a few
 * seconds, comes apart in reverse order, then rebuilds.
 *
 * Each part phases in and out like Half-Life 2's disintegration, dropping a
 * little into place as it materializes and lifting off as it dissolves:
 * - on the way in, embers fall into place, a bloom outline flares, and the
 *   part flickers into solidity;
 * - on the way out, the outline flares again, the part flickers and burns
 *   away, and its embers rise off it.
 *
 * No JavaScript runs any of it. Every part is a stack of absolutely positioned
 * layers (body, bloom copy, two ember clouds) animated with CSS `opacity` and
 * `transform` only, so:
 * - it starts the moment the server's HTML paints, before the app hydrates;
 * - browsers run it on the compositor, so it keeps moving while the main
 *   thread is busy loading the page.
 * The keyframes are generated from the timing constants below and sent in the
 * page <head>. `prefers-reduced-motion` shows the finished craft, still.
 */

interface Part {
  /** SVG markup, drawn in the shared 320×140 viewBox. */
  svg: string
  /** Rough bounds [x0, y0, x1, y1] the part's embers are scattered over. */
  box: [number, number, number, number]
}

// Bottom up, the order a craft would be built in. Markup goes in through
// v-html, so its classes are styled by the unscoped block below.
const PARTS: Part[] = [
  { // lower hull and lip ring
    box: [24, 96, 296, 118],
    svg: `<path class="ufo-hull" d="M20 95 C 62 104 96 111 118 113 L202 113 C 224 111 258 104 300 95 Z"/>
      <path class="ufo-hull" d="M118 113 L124 118.5 L196 118.5 L202 113"/>
      <path class="ufo-seam" d="M52 101 C 100 109 220 109 268 101"/>`,
  },
  { // gravity amplifiers, angled down, each ending in an emitter (unpowered:
    // green until the reactor goes in)
    box: [94, 94, 226, 118],
    svg: `<g class="ufo-far"><rect x="154" y="98" width="12" height="18" rx="2"/>
        <ellipse cx="160" cy="118" rx="5.5" ry="1.8" class="ufo-emitter"/></g>
      <g transform="rotate(28 104 104)"><rect x="98" y="94" width="12" height="18" rx="2"/>
        <path d="M100.5 99h7M100.5 103h7M100.5 107h7" class="ufo-seam"/>
        <ellipse cx="104" cy="113" rx="6" ry="2" class="ufo-emitter"/></g>
      <g transform="rotate(-28 216 104)"><rect x="210" y="94" width="12" height="18" rx="2"/>
        <path d="M212.5 99h7M212.5 103h7M212.5 107h7" class="ufo-seam"/>
        <ellipse cx="216" cy="113" rx="6" ry="2" class="ufo-emitter"/></g>`,
  },
  { // the middle level's hexagonal deck
    box: [44, 90, 276, 97],
    svg: `<path class="ufo-deck" d="M44 92 L276 92"/>
      <g class="ufo-seam">
        <path d="M80 94.5 l3 -1.6 3 1.6 0 1 -3 1.6 -3 -1.6 Z"/>
        <path d="M128 94.5 l3 -1.6 3 1.6 0 1 -3 1.6 -3 -1.6 Z"/>
        <path d="M186 94.5 l3 -1.6 3 1.6 0 1 -3 1.6 -3 -1.6 Z"/>
        <path d="M234 94.5 l3 -1.6 3 1.6 0 1 -3 1.6 -3 -1.6 Z"/>
      </g>`,
  },
  { // waveguides from the reactor to each amplifier, empty until it's in
    box: [106, 91, 214, 99],
    svg: `<path class="ufo-guide" d="M151 92 C 136 94 118 95 108 98"/>
      <path class="ufo-guide" d="M169 92 C 184 94 202 95 212 98"/>
      <path class="ufo-guide ufo-far" d="M160 92 L160 98"/>`,
  },
  { // three undersized seats facing the reactor
    box: [98, 80, 222, 92],
    svg: `<path d="M100 92 v-3.5 h7 v3.5 M100 88.5 v-7 h2"/>
      <path d="M220 92 v-3.5 h-7 v3.5 M220 88.5 v-7 h-2"/>
      <path class="ufo-far" d="M188 92 v-3 h5 v3 M188 89 v-5.5 h1.5"/>`,
  },
  { // upper hull: knife-edge rim, shallow steps, the collapsing hatch
    box: [14, 70, 306, 95],
    svg: `<path class="ufo-hull" d="M12 93 C 52 87 84 79 104 70 L216 70 C 236 79 268 87 308 93 L300 95.5 L20 95.5 Z"/>
      <path class="ufo-seam" d="M44 88 C 100 82.5 220 82.5 276 88"/>
      <path class="ufo-seam" d="M76 80 C 120 76 200 76 244 80"/>
      <path class="ufo-hatch" d="M62 92 C 62 87.5 66 84.5 72 84 L75 92"/>`,
  },
  { // the cabin: a truncated cone, ringed with slanted windows
    box: [106, 51, 214, 70],
    // The walls leave the hull's shoulder (104,70) on the tangent the upper
    // hull's curve arrives with, and the cap's rounded shoulders continue
    // from the walls, so the silhouette flows up without steps or ledges.
    svg: `<path class="ufo-hull" d="M104 70 C 114 65.5 122 58 128 51 L192 51 C 198 58 206 65.5 216 70 Z"/>
      <g class="ufo-window">
        <path d="M137 55.5 L151 55.5 L149.5 65.5 L132 65.5 Z"/>
        <path d="M169 55.5 L183 55.5 L188 65.5 L170.5 65.5 Z"/>
        <path class="ufo-far" d="M127 56.5 L131 56.5 L126 65.5 L120.5 65.5 Z"/>
        <path class="ufo-far" d="M189 56.5 L193 56.5 L199.5 65.5 L194 65.5 Z"/>
      </g>
      <path class="ufo-seam" d="M110 67.3 L210 67.3"/>`,
  },
  { // the flat cap and its short mast
    box: [128, 36, 192, 51],
    svg: `<path class="ufo-hull" d="M128 51 C 130 48.6 132.5 47.5 136 47.5 L184 47.5 C 187.5 47.5 190 48.6 192 51 Z"/>
      <path d="M160 47.5 V38"/>
      <circle cx="160" cy="37" r="1.2" class="ufo-emitter"/>`,
  },
  { // the reactor: square base plate, hemispherical top, glowing core. It
    // provides the power, so it goes in last and switches everything on
    box: [148, 78, 172, 92],
    svg: `<rect x="149" y="87" width="22" height="5" rx="1"/>
      <path class="ufo-hull" d="M151.5 87 A 8.5 8.5 0 0 1 168.5 87 Z"/>
      <circle cx="160" cy="83.5" r="4.5" fill="url(#ufo-core)" stroke="none" class="ufo-pulse"/>`,
  },
  { // power on: the reactor lights the emitters, waveguides and mast tip.
    // Drawn over the unpowered parts; left out of the dissolve's outline.
    box: [96, 36, 224, 120],
    svg: `<g class="ufo-nobloom">
        <ellipse cx="160" cy="118" rx="9" ry="3.4" class="ufo-glow ufo-halo"/>
        <ellipse cx="160" cy="118" rx="5.5" ry="1.8" class="ufo-glow"/>
        <g transform="rotate(28 104 104)"><ellipse cx="104" cy="113" rx="10" ry="3.8" class="ufo-glow ufo-halo"/>
          <ellipse cx="104" cy="113" rx="6" ry="2" class="ufo-glow"/></g>
        <g transform="rotate(-28 216 104)"><ellipse cx="216" cy="113" rx="10" ry="3.8" class="ufo-glow ufo-halo"/>
          <ellipse cx="216" cy="113" rx="6" ry="2" class="ufo-glow"/></g>
        <path class="ufo-guide-live" d="M151 92 C 136 94 118 95 108 98"/>
        <path class="ufo-guide-live" d="M169 92 C 184 94 202 95 212 98"/>
        <path class="ufo-guide-live ufo-far" d="M160 92 L160 98"/>
        <circle cx="160" cy="37" r="2.6" class="ufo-glow ufo-halo"/>
        <circle cx="160" cy="37" r="1.2" class="ufo-glow"/>
      </g>`,
  },
  { // corona and the amplifiers' beams
    box: [20, 40, 300, 136],
    // The corona is wider than the drawing on purpose: it runs past the
    // viewBox (the SVG doesn't clip) so its glow spreads well beyond the
    // craft on every side.
    svg: `<ellipse cx="160" cy="80" rx="240" ry="124" fill="url(#ufo-corona-fill)" stroke="none" class="ufo-pulse"/>
      <path d="M96 112 L64 140 L94 140 L110 113 Z" fill="url(#ufo-beam)" stroke="none" class="ufo-pulse"/>
      <path d="M224 112 L256 140 L226 140 L210 113 Z" fill="url(#ufo-beam)" stroke="none" class="ufo-pulse"/>
      <path d="M154 120 L148 140 L172 140 L166 120 Z" fill="url(#ufo-beam)" stroke="none" class="ufo-pulse"/>`,
  },
]

// Timing, in ms. Each part starts materializing `STEP` after the one before
// and takes `PHASE_IN`; the disintegration runs in reverse order.
const STEP = 380
const PHASE_IN = 760
const STEP_OUT = 320
const PHASE_OUT = 880
// The finished craft holds, glowing, for a while before it comes apart.
const HOLD = 4000
const REST = 500

/** How far (SVG units) a part drops as it lands, and lifts as it leaves. */
const DRIFT = 7
const DROP = 'cubic-bezier(0.2, 0.7, 0.3, 1)' // settles into place
const LIFT = 'cubic-bezier(0.5, 0, 0.8, 0.4)' // eases off, then away

const VIEW_W = 320
const VIEW_H = 140

/** Deterministic embers for part `i`, scattered over its box, split into two
 *  clouds that drift different distances. Seeded, so SSR and client agree. */
function embers(i: number): { a: string, b: string } {
  const [x0, y0, x1, y1] = PARTS[i]!.box
  let seed = 9173 * (i + 1)
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const count = Math.max(8, Math.min(22, Math.round((x1 - x0) / 9)))
  const clouds = { a: '', b: '' }
  for (let k = 0; k < count; k++) {
    const x = (x0 + rand() * (x1 - x0)).toFixed(1)
    const y = (y0 + rand() * (y1 - y0)).toFixed(1)
    const r = (0.5 + rand() * 0.9).toFixed(2)
    clouds[k % 2 ? 'b' : 'a'] += `<circle cx="${x}" cy="${y}" r="${r}"/>`
  }
  return clouds
}

const layers = PARTS.map((part, i) => ({ svg: part.svg, ...embers(i) }))

/** Paint order: the corona (the last part) first, so it glows behind the
 *  hull; the rest in build order, which puts the power-on layer on top. */
const paintOrder = [PARTS.length - 1, ...PARTS.keys()].slice(0, PARTS.length)

function keyframesCss(): string {
  const n = PARTS.length
  const assembled = (n - 1) * STEP + PHASE_IN
  const outStart = assembled + HOLD
  const gone = outStart + (n - 1) * STEP_OUT + PHASE_OUT
  const cycle = gone + REST
  const pct = (ms: number) => `${((Math.min(cycle, Math.max(0, ms)) / cycle) * 100).toFixed(3)}%`
  const up = (units: number) => `translateY(${((-units / VIEW_H) * 100).toFixed(2)}%)`
  const P = PHASE_IN
  const Q = PHASE_OUT

  const frames = (name: string, stops: [number, string][]) =>
    `@keyframes ${name}{${stops.map(([ms, css]) => `${pct(ms)}{${css}}`).join('')}}`

  const rules = PARTS.map((_, i) => {
    const s = i * STEP // starts materializing
    const l = outStart + (n - 1 - i) * STEP_OUT // starts disintegrating
    return [
      // The body flickers in once the embers have gathered, and flickers out
      // under the flare.
      frames(`ufo-body-${i}`, [
        [0, 'opacity:0'], [s + P * 0.35, 'opacity:0'], [s + P * 0.5, 'opacity:.55'],
        [s + P * 0.6, 'opacity:.15'], [s + P * 0.8, 'opacity:.85'], [s + P, 'opacity:1'],
        [l, 'opacity:1'], [l + Q * 0.2, 'opacity:.55'], [l + Q * 0.3, 'opacity:.9'],
        [l + Q * 0.55, 'opacity:.2'], [l + Q * 0.75, 'opacity:0'], [cycle, 'opacity:0'],
      ]),
      // The bloom outline: the edge that glows as matter arrives or burns off.
      frames(`ufo-bloom-${i}`, [
        [0, 'opacity:0'], [s, 'opacity:0'], [s + P * 0.5, 'opacity:1'], [s + P + 160, 'opacity:0'],
        [l, 'opacity:0'], [l + Q * 0.3, 'opacity:1'], [l + Q * 0.8, 'opacity:.5'],
        [l + Q, 'opacity:0'], [cycle, 'opacity:0'],
      ]),
      // Embers fall into place on the way in and rise off on the way out; the
      // second cloud drifts farther and a little later.
      ...([['a', 10, 16, 0], ['b', 18, 26, 0.12]] as const).map(([cloud, fall, rise, lag]) =>
        frames(`ufo-ember-${cloud}-${i}`, [
          [0, `transform:${up(fall)};opacity:0`],
          [s + P * lag, `transform:${up(fall)};opacity:0`],
          [s + P * (0.3 + lag), `transform:${up(fall * 0.4)};opacity:1`],
          [s + P * (0.75 + lag), 'transform:translateY(0);opacity:0'],
          [l + Q * (0.1 + lag), 'transform:translateY(0);opacity:0'],
          [l + Q * (0.3 + lag), `transform:${up(rise * 0.2)};opacity:1`],
          [l + Q, `transform:${up(rise)};opacity:0`],
          [cycle, `transform:${up(rise)};opacity:0`],
        ])),
      // The whole part (body, outline, embers) drops a little into place as
      // it materializes, as if assembled in mid-air, and lifts off as it
      // dissolves.
      frames(`ufo-drift-${i}`, [
        [0, `transform:${up(DRIFT)}`],
        [s, `transform:${up(DRIFT)};animation-timing-function:${DROP}`],
        [s + P, 'transform:translateY(0)'],
        [l, `transform:translateY(0);animation-timing-function:${LIFT}`],
        [l + Q, `transform:${up(DRIFT)}`],
        [cycle, `transform:${up(DRIFT)}`],
      ]),
      `.ufo-part[data-part="${i}"]{animation-name:ufo-drift-${i}}`,
      `[data-part="${i}"]>.ufo-body{animation-name:ufo-body-${i}}`,
      `[data-part="${i}"]>.ufo-bloom{animation-name:ufo-bloom-${i}}`,
      `[data-part="${i}"]>.ufo-ember-a{animation-name:ufo-ember-a-${i}}`,
      `[data-part="${i}"]>.ufo-ember-b{animation-name:ufo-ember-b-${i}}`,
    ].join('')
  })

  // A negative delay opens every layer on the frame where the craft has just
  // finished assembling, so the loop starts complete and runs on from there.
  return `.ufo-phase{animation-duration:${cycle}ms;animation-timing-function:linear;`
    + `animation-iteration-count:infinite;animation-fill-mode:both;animation-delay:-${assembled}ms}`
    + rules.join('')
    // Reduced motion: the finished craft, still, with no bloom or embers.
    + '@media (prefers-reduced-motion:reduce){.ufo-phase{animation:none}'
    + '.ufo-bloom,.ufo-ember-a,.ufo-ember-b{opacity:0}}'
}

// Server-rendered into <head>, so the loop runs before any script does.
useHead({ style: [{ key: 'ufo-loader-keyframes', textContent: keyframesCss() }] })

const viewBox = `0 0 ${VIEW_W} ${VIEW_H}`
</script>

<template>
  <div class="ufo-loader" aria-hidden="true">
    <!-- The gradients and bloom every layer uses. -->
    <svg class="ufo-svg" :viewBox="viewBox" fill="none">
      <defs>
        <radialGradient id="ufo-corona-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="hsl(var(--ufo-corona))" stop-opacity="0.5" />
          <stop offset="60%" stop-color="hsl(var(--ufo-corona))" stop-opacity="0.14" />
          <stop offset="100%" stop-color="hsl(var(--ufo-corona))" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="ufo-core" cx="50%" cy="60%" r="50%">
          <stop offset="0%" stop-color="hsl(var(--ufo-corona))" stop-opacity="0.95" />
          <stop offset="100%" stop-color="hsl(var(--ufo-corona))" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="ufo-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="hsl(var(--ufo-corona))" stop-opacity="0.55" />
          <stop offset="100%" stop-color="hsl(var(--ufo-corona))" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="ufo-hull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="hsl(var(--primary))" stop-opacity="0.18" />
          <stop offset="100%" stop-color="hsl(var(--primary))" stop-opacity="0.03" />
        </linearGradient>
        <!-- A soft halo under a hot core: the bloom copy's glow. Static; only
             the layer's opacity animates. -->
        <filter id="ufo-bloom" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="halo" />
          <feMerge>
            <feMergeNode in="halo" />
            <feMergeNode in="halo" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>

    <div
      v-for="i in paintOrder"
      :key="i"
      class="ufo-part ufo-phase"
      :data-part="i"
    >
      <svg class="ufo-svg ufo-phase ufo-body" :viewBox="viewBox" fill="none">
        <g v-html="layers[i]!.svg" />
      </svg>
      <svg class="ufo-svg ufo-phase ufo-bloom" :viewBox="viewBox" fill="none">
        <g class="ufo-bloom-halo" filter="url(#ufo-bloom)" v-html="layers[i]!.svg" />
        <g class="ufo-bloom-core" v-html="layers[i]!.svg" />
      </svg>
      <svg class="ufo-svg ufo-phase ufo-ember-a" :viewBox="viewBox">
        <g class="ufo-embers" v-html="layers[i]!.a" />
      </svg>
      <svg class="ufo-svg ufo-phase ufo-ember-b" :viewBox="viewBox">
        <g class="ufo-embers" v-html="layers[i]!.b" />
      </svg>
    </div>
  </div>
</template>

<!-- Unscoped: the part markup arrives through v-html, which scoped styles
     can't reach. Every class is `ufo-` prefixed. -->
<style>
.ufo-loader {
  /* Lazar's blue corona. The org-blue graph token is the kit's themed blue. */
  --ufo-corona: var(--graph-cat-orgs);
  position: relative;
  aspect-ratio: 320 / 140;
  width: 100%;
}

.ufo-part,
.ufo-loader .ufo-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.ufo-loader .ufo-svg {
  overflow: visible;
  stroke: hsl(var(--primary));
  stroke-width: 1.1;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Each animated layer is its own compositing layer: opacity and transform
   only, set by the keyframes in <head>. With no animation (reduced motion)
   the body rests in place. */
.ufo-loader .ufo-phase {
  will-change: transform, opacity;
}

.ufo-loader .ufo-hull {
  fill: url(#ufo-hull);
}
.ufo-loader .ufo-seam {
  stroke-opacity: 0.45;
  stroke-width: 0.7;
}
.ufo-loader .ufo-far {
  opacity: 0.5;
}
.ufo-loader .ufo-deck {
  stroke-width: 1.4;
}
.ufo-loader .ufo-hatch {
  stroke-dasharray: 1.6 1.4;
}
/* Unpowered emitters and mast tip: the line colour, lightly filled. */
.ufo-loader .ufo-emitter {
  fill: hsl(var(--primary) / 0.35);
  stroke-width: 0.8;
}
/* Powered: the reactor's blue, each with a soft pulsing halo. */
.ufo-loader .ufo-glow {
  fill: hsl(var(--ufo-corona));
  stroke: none;
}
.ufo-loader .ufo-halo {
  animation: ufo-halo 2.4s ease-in-out infinite;
}
/* The power-on layer never gets the dissolve's outline. */
.ufo-loader .ufo-bloom .ufo-nobloom {
  display: none;
}

/* The windows read dark: the foreground ink on light themes, the page
   background on dark ones, framed in the line colour either way. */
.ufo-loader .ufo-window path {
  fill: hsl(var(--foreground));
  stroke-width: 0.7;
}
[data-theme='dark'] .ufo-loader .ufo-window path,
[data-theme='dim'] .ufo-loader .ufo-window path {
  fill: hsl(var(--background));
}

/* The bloom copy: outlines only, drawn hot. A wide accent-coloured stroke
   under the blur filter makes the halo; a thin foreground stroke on top is
   the core (white-hot on dark themes, a dark silhouette edge on light ones). */
.ufo-loader .ufo-bloom * {
  fill: none !important;
  stroke-opacity: 1 !important;
}
.ufo-loader .ufo-bloom-halo * {
  stroke: hsl(var(--primary)) !important;
  stroke-width: 2.2;
}
.ufo-loader .ufo-bloom-core * {
  stroke: hsl(var(--foreground)) !important;
  stroke-width: 0.6;
}
/* Fill-only shapes (the corona, the beams, glowing cores) have no outline to
   burn: tracing them would ring the blue light in green. */
.ufo-loader .ufo-bloom [stroke='none'] {
  stroke: none !important;
}

.ufo-loader .ufo-embers {
  fill: hsl(var(--primary));
  stroke: none;
}
.ufo-loader .ufo-embers circle:nth-child(3n) {
  fill: hsl(var(--foreground));
}

/* The waveguides: empty dashes in the line colour until the reactor is in,
   then blue energy running down them. */
.ufo-loader .ufo-guide {
  stroke-dasharray: 3 3;
  stroke-opacity: 0.6;
}
.ufo-loader .ufo-guide-live {
  stroke: hsl(var(--ufo-corona));
  stroke-dasharray: 3 3;
  animation: ufo-flow 0.9s linear infinite;
}
.ufo-loader .ufo-pulse {
  animation: ufo-pulse 2.4s ease-in-out infinite;
}

@keyframes ufo-flow {
  to { stroke-dashoffset: -12; }
}
@keyframes ufo-pulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}
@keyframes ufo-halo {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 0.45; }
}

@media (prefers-reduced-motion: reduce) {
  .ufo-loader .ufo-guide-live,
  .ufo-loader .ufo-pulse,
  .ufo-loader .ufo-halo {
    animation: none;
  }
  .ufo-loader .ufo-halo {
    opacity: 0.3;
  }
}
</style>
