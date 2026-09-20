# Rich Video Pages, Part 2: Video Dock + Cues — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an app-global, draggable, resizable YouTube dock that keeps playing across navigation, plus timestamp cues that seek it from anywhere on a wiki page.

**Architecture:** A single dock component mounts in `layouts/default.vue`, outside `<main>`, so route changes never unmount it. State lives in a `useState`-backed composable matching the existing `useShellState.ts` pattern. Cue timestamps are derived offline from timestamped captions into a `cues.json` sidecar, then referenced from markdown.

**Tech Stack:** Nuxt 4, Vue 3.5, `@vueuse/core` (`useDraggable`), YouTube IFrame Player API, `vitest`, Python 3 (offline cue derivation).

**Spec:** `docs/superpowers/specs/2026-09-20-rich-video-pages-design.md`

**Depends on:** Part 1 (`2026-09-20-rich-video-pages-1-component-kit.md`) must be complete. Task 4 below modifies `WikiTimeline.vue`, created there.

## Global Constraints

- **Four themes must work:** `light`, `dark`, `dim`, `sepia`. Never hardcode a colour; use `hsl(var(--token))`.
- **Radii are tight** (`--radius-sm: 2px` … `--radius-xl: 6px`).
- **Every `localStorage` read and write is wrapped in `try/catch`.** The dock must render correctly with site data blocked or cleared.
- **Never persist playback position** — only geometry and minimised state.
- **Mobile is bottom-docked, full width, drag disabled**, below the existing 900px breakpoint used by `layouts/default.vue`.
- **The dock must not render at all until opened.** No YouTube iframe, no API script, on a cold page load.
- **Vault path contains spaces.** Always quote paths.
- Verified facts to use as-is: video `o4czWtSxGig` is `playable_in_embed: True`, duration **9829s**, and its captions expose **4,075** timestamped segments.

---

### Task 1: useVideoDock composable

**Files:**
- Create: `app/composables/useVideoDock.ts`
- Create: `app/composables/useVideoDock.test.ts`
- Modify: `app/vitest.config.ts` (add `composables/**/*.test.ts` to `include`)

**Interfaces:**
- Produces:
  - `interface DockRect { x: number, y: number, w: number, h: number }`
  - `export function clampRect(rect: DockRect, vw: number, vh: number): DockRect`
  - `export function useVideoDock(): { videoId, title, visible, minimised, rect, open(o), close(), toggleMinimise(), seek(s), pendingSeek }`

`clampRect` is pure and exported separately so it can be unit-tested without a DOM.

- [ ] **Step 1: Extend the vitest include glob**

In `app/vitest.config.ts`, change `include` to:

```ts
include: ['wiki/**/*.test.ts', 'server/**/*.test.ts', 'app/composables/**/*.test.ts'],
```

- [ ] **Step 2: Write the failing test**

Create `app/composables/useVideoDock.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { clampRect } from './useVideoDock'

describe('clampRect', () => {
  it('leaves a rect that already fits untouched', () => {
    expect(clampRect({ x: 40, y: 40, w: 360, h: 203 }, 1440, 900))
      .toEqual({ x: 40, y: 40, w: 360, h: 203 })
  })

  it('pulls a rect back inside when it overhangs the right edge', () => {
    const r = clampRect({ x: 1400, y: 40, w: 360, h: 203 }, 1440, 900)
    expect(r.x + r.w).toBeLessThanOrEqual(1440)
    expect(r.x).toBeGreaterThanOrEqual(0)
  })

  it('pulls a rect back inside when it overhangs the bottom edge', () => {
    const r = clampRect({ x: 40, y: 880, w: 360, h: 203 }, 1440, 900)
    expect(r.y + r.h).toBeLessThanOrEqual(900)
  })

  it('handles a negative origin from a previous larger viewport', () => {
    const r = clampRect({ x: -200, y: -80, w: 360, h: 203 }, 1440, 900)
    expect(r.x).toBe(0)
    expect(r.y).toBe(0)
  })

  it('shrinks a rect wider than the viewport, preserving 16:9', () => {
    const r = clampRect({ x: 0, y: 0, w: 2000, h: 1125 }, 800, 600)
    expect(r.w).toBeLessThanOrEqual(800)
    expect(Math.abs(r.w / r.h - 16 / 9)).toBeLessThan(0.02)
  })

  it('never shrinks below the 240px minimum width', () => {
    const r = clampRect({ x: 0, y: 0, w: 100, h: 56 }, 1440, 900)
    expect(r.w).toBe(240)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd app && bun run test
```

Expected: FAIL — cannot resolve `./useVideoDock`.

- [ ] **Step 4: Write the implementation**

Create `app/composables/useVideoDock.ts`:

```ts
export interface DockRect { x: number, y: number, w: number, h: number }

const MIN_W = 240
const RATIO = 16 / 9
const STORAGE_KEY = 'ufo:dock'

export const DEFAULT_RECT: DockRect = { x: 24, y: 24, w: 384, h: Math.round(384 / RATIO) }

/**
 * Force a rect fully inside a viewport, preserving 16:9.
 *
 * Geometry is persisted across sessions, so a rect saved on a large display can
 * come back on a small one — without this the dock would open offscreen and be
 * unreachable. Pure, so it is unit-tested without a DOM.
 */
export function clampRect(rect: DockRect, vw: number, vh: number): DockRect {
  let w = Math.max(MIN_W, Math.min(rect.w, vw))
  let h = Math.round(w / RATIO)
  if (h > vh) {
    h = Math.max(Math.round(MIN_W / RATIO), vh)
    w = Math.round(h * RATIO)
  }
  const x = Math.max(0, Math.min(rect.x, Math.max(0, vw - w)))
  const y = Math.max(0, Math.min(rect.y, Math.max(0, vh - h)))
  return { x, y, w, h }
}

function readStored(): Partial<DockRect> & { minimised?: boolean } {
  if (import.meta.server) return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  }
  catch {
    // Private mode, blocked site data, or corrupt JSON — defaults are fine.
    return {}
  }
}

export function persistDock(rect: DockRect, minimised: boolean): void {
  if (import.meta.server) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rect, minimised }))
  }
  catch {
    // Non-fatal: the dock simply won't remember where it was.
  }
}

/**
 * The app-global video dock. Mounted once in the default layout, so playback
 * survives navigation between wiki notes.
 */
export function useVideoDock() {
  const videoId = useState<string | null>('dock:video', () => null)
  const title = useState<string>('dock:title', () => '')
  const visible = useState<boolean>('dock:visible', () => false)
  const minimised = useState<boolean>('dock:minimised', () => false)
  const rect = useState<DockRect>('dock:rect', () => ({ ...DEFAULT_RECT }))

  /** Set by cues, consumed by the player once the IFrame API is ready. Last wins. */
  const pendingSeek = useState<number | null>('dock:seek', () => null)

  /** Restore geometry from localStorage, clamped to the current viewport. */
  function hydrate(): void {
    const stored = readStored()
    const merged = { ...DEFAULT_RECT, ...stored }
    rect.value = clampRect(merged, window.innerWidth, window.innerHeight)
    if (typeof stored.minimised === 'boolean') minimised.value = stored.minimised
  }

  function open(opts: { videoId: string, title?: string, at?: number }): void {
    videoId.value = opts.videoId
    if (opts.title) title.value = opts.title
    visible.value = true
    minimised.value = false
    if (typeof opts.at === 'number') pendingSeek.value = opts.at
  }

  function close(): void {
    visible.value = false
    videoId.value = null
    pendingSeek.value = null
  }

  function toggleMinimise(): void {
    minimised.value = !minimised.value
    persistDock(rect.value, minimised.value)
  }

  /** Seek the dock. Opens it first if it is closed and we know which video. */
  function seek(seconds: number): void {
    pendingSeek.value = Math.max(0, Math.round(seconds))
    if (videoId.value) {
      visible.value = true
      minimised.value = false
    }
  }

  return {
    videoId, title, visible, minimised, rect, pendingSeek,
    hydrate, open, close, toggleMinimise, seek,
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd app && bun run test
```

Expected: PASS — 6 new tests, plus Part 1's resolver tests still green.

- [ ] **Step 6: Commit**

```bash
git add app/composables/useVideoDock.ts app/composables/useVideoDock.test.ts app/vitest.config.ts
git commit -m "Add useVideoDock with viewport-clamped geometry"
```

---

### Task 2: The dock component

**Files:**
- Create: `app/components/wiki/WikiVideoDock.vue`
- Modify: `app/layouts/default.vue`

**Interfaces:**
- Consumes: `useVideoDock` (Task 1).
- Produces: a mounted dock reacting to `useVideoDock()` state. No props.

- [ ] **Step 1: Write the component**

Create `app/components/wiki/WikiVideoDock.vue`:

```vue
<script setup lang="ts">
import { Minus, Square, X } from '@lucide/vue'
import { useDraggable } from '@vueuse/core'
import { clampRect, persistDock } from '@/composables/useVideoDock'

const dock = useVideoDock()

const frame = ref<HTMLElement | null>(null)
const handle = ref<HTMLElement | null>(null)
const mount = ref<HTMLElement | null>(null)

const isMobile = ref(false)
function syncViewport(): void {
  isMobile.value = window.innerWidth <= 900
  dock.rect.value = clampRect(dock.rect.value, window.innerWidth, window.innerHeight)
}

/* ---------------------------------------------------------------- drag -- */

const { x, y } = useDraggable(handle, {
  initialValue: { x: dock.rect.value.x, y: dock.rect.value.y },
  preventDefault: true,
  disabled: computed(() => isMobile.value),
  onEnd() {
    dock.rect.value = clampRect(
      { ...dock.rect.value, x: x.value, y: y.value },
      window.innerWidth, window.innerHeight,
    )
    x.value = dock.rect.value.x
    y.value = dock.rect.value.y
    persistDock(dock.rect.value, dock.minimised.value)
  },
})

/* -------------------------------------------------------------- resize -- */

let resizing = false
function startResize(event: PointerEvent): void {
  if (isMobile.value) return
  resizing = true
  const startX = event.clientX
  const startW = dock.rect.value.w

  function move(e: PointerEvent): void {
    if (!resizing) return
    dock.rect.value = clampRect(
      { ...dock.rect.value, x: x.value, y: y.value, w: startW + (e.clientX - startX) },
      window.innerWidth, window.innerHeight,
    )
  }
  function up(): void {
    resizing = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    persistDock(dock.rect.value, dock.minimised.value)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

/* ------------------------------------------------- YouTube IFrame API -- */

let player: { seekTo: (s: number, allow: boolean) => void, destroy: () => void } | null = null
let apiReady: Promise<void> | null = null

/** Load the IFrame API once, lazily — never on a cold page load. */
function loadApi(): Promise<void> {
  if (apiReady) return apiReady
  apiReady = new Promise<void>((resolve) => {
    const w = window as unknown as Record<string, unknown>
    if (w.YT && (w.YT as { Player?: unknown }).Player) return resolve()
    const prev = w.onYouTubeIframeAPIReady as (() => void) | undefined
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve() }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
  return apiReady
}

async function mountPlayer(id: string): Promise<void> {
  await loadApi()
  await nextTick()
  if (!mount.value) return
  player?.destroy()
  const YT = (window as unknown as { YT: any }).YT
  player = new YT.Player(mount.value, {
    videoId: id,
    playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
    events: {
      onReady() {
        if (dock.pendingSeek.value !== null) {
          player?.seekTo(dock.pendingSeek.value, true)
          dock.pendingSeek.value = null
        }
      },
    },
  })
}

watch(() => dock.videoId.value, (id) => { if (id) mountPlayer(id) })

// A seek arriving after the player exists applies immediately; one arriving
// before it is ready is picked up by onReady above.
watch(() => dock.pendingSeek.value, (seconds) => {
  if (seconds === null || !player) return
  player.seekTo(seconds, true)
  dock.pendingSeek.value = null
})

onMounted(() => {
  dock.hydrate()
  syncViewport()
  x.value = dock.rect.value.x
  y.value = dock.rect.value.y
  window.addEventListener('resize', syncViewport)
  if (dock.videoId.value) mountPlayer(dock.videoId.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)
  player?.destroy()
  player = null
})

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') dock.close()
}

/** Arrow keys nudge the dock when the drag handle has focus. */
function nudge(dx: number, dy: number): void {
  if (isMobile.value) return
  dock.rect.value = clampRect(
    { ...dock.rect.value, x: x.value + dx, y: y.value + dy },
    window.innerWidth, window.innerHeight,
  )
  x.value = dock.rect.value.x
  y.value = dock.rect.value.y
  persistDock(dock.rect.value, dock.minimised.value)
}

const style = computed(() => isMobile.value
  ? {}
  : { left: `${x.value}px`, top: `${y.value}px`, width: `${dock.rect.value.w}px` })
</script>

<template>
  <div
    v-if="dock.visible.value && dock.videoId.value"
    ref="frame"
    class="ufo-dock"
    :class="{ 'is-mobile': isMobile, 'is-min': dock.minimised.value }"
    :style="style"
    role="complementary"
    aria-label="Video player"
    @keydown="onKeydown"
  >
    <header
      ref="handle"
      class="ufo-dock-bar"
      :tabindex="isMobile ? -1 : 0"
      @keydown.up.prevent="nudge(0, -16)"
      @keydown.down.prevent="nudge(0, 16)"
      @keydown.left.prevent="nudge(-16, 0)"
      @keydown.right.prevent="nudge(16, 0)"
    >
      <span class="ufo-dock-title">{{ dock.title.value || 'Now playing' }}</span>
      <button type="button" class="ufo-dock-btn" aria-label="Minimise" @click="dock.toggleMinimise()">
        <component :is="dock.minimised.value ? Square : Minus" class="size-3.5" />
      </button>
      <button type="button" class="ufo-dock-btn" aria-label="Close player" @click="dock.close()">
        <X class="size-3.5" />
      </button>
    </header>

    <div v-show="!dock.minimised.value" class="ufo-dock-body">
      <div ref="mount" class="ufo-dock-mount" />
      <span
        v-if="!isMobile"
        class="ufo-dock-grip"
        aria-hidden="true"
        @pointerdown="startResize"
      />
    </div>
  </div>
</template>

<style scoped>
.ufo-dock {
  position: fixed;
  z-index: 70;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--popover));
  box-shadow: var(--shadow-lg);
}
.ufo-dock-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px 5px 10px;
  border-bottom: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  cursor: grab;
  user-select: none;
}
.ufo-dock-bar:active { cursor: grabbing; }
.ufo-dock.is-mobile .ufo-dock-bar { cursor: default; }

.ufo-dock-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}
.ufo-dock-btn {
  display: inline-flex;
  padding: 3px;
  border-radius: var(--radius-sm);
  color: hsl(var(--muted-foreground));
}
.ufo-dock-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.ufo-dock-body { position: relative; }
.ufo-dock-mount { aspect-ratio: 16 / 9; width: 100%; }
.ufo-dock-mount :deep(iframe) { display: block; width: 100%; height: 100%; border: 0; }

.ufo-dock-grip {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(
    135deg, transparent 50%, hsl(var(--border)) 50%, hsl(var(--border)) 100%
  );
}

/* Below the shell's own 900px breakpoint the dock is bottom-docked and fixed.
   A draggable window on a phone fights the sidebar overlay at the same width. */
.ufo-dock.is-mobile {
  inset: auto 0 0 0;
  width: 100%;
  border-radius: 0;
  border-inline: 0;
  border-bottom: 0;
}

@media (prefers-reduced-motion: reduce) {
  .ufo-dock { transition: none; }
}
</style>
```

- [ ] **Step 2: Mount it in the layout**

In `app/layouts/default.vue`, add beside the existing command palette:

```vue
    <AppCommandPalette />
    <WikiVideoDock />
  </div>
</template>
```

It must sit outside `<main>`, as a sibling of `<AppCommandPalette />`. Inside `<main>` it would unmount on navigation, defeating the entire point.

- [ ] **Step 3: Verify in the browser**

Temporarily add a button to any page calling
`useVideoDock().open({ videoId: 'o4czWtSxGig', title: '80 Years' })`.

Check: the dock appears; the title bar drags it; the corner grip resizes it preserving 16:9; minimise collapses to the bar; close removes it; **navigating to another wiki note keeps it playing**; reloading restores its position; `Escape` closes it. At <900px it bottom-docks full width and does not drag. Verify in all four themes.

Then confirm the lazy load: open a wiki page fresh, and in devtools' Network tab confirm **no request to `youtube.com/iframe_api`** until the dock is opened.

Remove the temporary button.

- [ ] **Step 4: Commit**

```bash
git add app/components/wiki/WikiVideoDock.vue app/layouts/default.vue
git commit -m "Add app-global draggable video dock"
```

---

### Task 3: Cue derivation script

**Files:**
- Create: `scripts/derive_cues.py`
- Create: `UAP Gerb Knowledge Base/Videos/80 Years of UFO Crash Retrieval and Reverse Engineering - A Timeline/cues.json`

**Interfaces:**
- Produces `cues.json`: `[{ "t": number, "label": string, "confidence": "high"|"low", "match": string }]`

- [ ] **Step 1: Write the script**

Create `scripts/derive_cues.py`. It takes a video id, a chronology JSON, and an output path; fetches timestamped captions; and for each chronology entry scores caption windows on shared distinctive tokens (proper nouns, four-digit years), emitting the best window's start time.

```python
#!/usr/bin/env python3
"""Derive timeline cue timestamps by matching chronology entries to captions.

Timestamps are approximate by construction: captions are a rolling transcript,
not a chapter list. Entries scoring below CONFIDENCE_FLOOR are marked
"confidence": "low" so the UI can present them as approximate rather than exact.
"""
import argparse, json, re, sys
from youtube_transcript_api import YouTubeTranscriptApi

STOP = {
    'the','a','an','of','and','to','in','on','at','for','with','by','from','as',
    'that','this','it','is','was','were','be','been','has','have','had','his',
    'her','its','their','they','he','she','we','you','i','but','or','not','are',
}
WINDOW_SECONDS = 45
CONFIDENCE_FLOOR = 0.34

def tokens(text):
    """Distinctive tokens: capitalised words and four-digit years, lowercased."""
    out = set()
    for w in re.findall(r"\b[A-Z][A-Za-z'-]{2,}\b", text):
        if w.lower() not in STOP:
            out.add(w.lower())
    out.update(re.findall(r'\b(?:18|19|20)\d{2}\b', text))
    return out

def windows(segments):
    """Rolling WINDOW_SECONDS windows over the caption track."""
    out, i = [], 0
    while i < len(segments):
        start = segments[i].start
        text, j = [], i
        while j < len(segments) and segments[j].start - start < WINDOW_SECONDS:
            text.append(segments[j].text)
            j += 1
        out.append((start, ' '.join(text)))
        i += max(1, (j - i) // 2)  # 50% overlap so a phrase cannot fall in a seam
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--video-id', required=True)
    ap.add_argument('--chronology', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    rows = json.load(open(args.chronology))
    segments = list(YouTubeTranscriptApi().fetch(
        args.video_id, languages=['en', 'en-US', 'en-GB']))
    print(f'{len(segments)} caption segments', file=sys.stderr)

    wins = [(t, txt, tokens(txt)) for t, txt in windows(segments)]
    cues = []
    for row in rows:
        want = tokens(f"{row['title']} {row.get('summary', '')}")
        want |= {e.lower() for e in row.get('entities', [])}
        want |= set(re.findall(r'\b(?:18|19|20)\d{2}\b', row['date']))
        if not want:
            continue
        best_t, best_score, best_text = None, 0.0, ''
        for t, txt, have in wins:
            hit = len(want & have)
            if not hit:
                continue
            score = hit / len(want)
            if score > best_score:
                best_t, best_score, best_text = t, score, txt
        if best_t is None:
            continue
        cues.append({
            't': int(best_t),
            'label': row['title'],
            'confidence': 'high' if best_score >= CONFIDENCE_FLOOR else 'low',
            'match': best_text[:120],
        })

    cues.sort(key=lambda c: c['t'])
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(cues, f, indent=2, ensure_ascii=False)
    high = sum(1 for c in cues if c['confidence'] == 'high')
    print(f'wrote {len(cues)} cues ({high} high confidence) to {args.out}', file=sys.stderr)

if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run it**

```bash
cd "/Users/jaidendechon/Library/Repos/UAP Gerb Knowledge Base" && python3 scripts/derive_cues.py \
  --video-id o4czWtSxGig \
  --chronology "/private/tmp/claude-501/-Users-jaidendechon-Library-Repos-UAP-Gerb-Knowledge-Base/9a9e6722-ab7c-411e-95ae-34e944de4aa7/scratchpad/80-years-chronology.json" \
  --out "UAP Gerb Knowledge Base/Videos/80 Years of UFO Crash Retrieval and Reverse Engineering - A Timeline/cues.json"
```

Sanity-check the output: every `t` must be between 0 and 9829, and the list must be ascending.

```bash
python3 -c "
import json
c=json.load(open('UAP Gerb Knowledge Base/Videos/80 Years of UFO Crash Retrieval and Reverse Engineering - A Timeline/cues.json'))
ts=[x['t'] for x in c]
print(len(c),'cues; range',min(ts),max(ts))
assert ts==sorted(ts), 'not ascending'
assert max(ts)<=9829, 'cue past end of video'
print('high confidence:',sum(1 for x in c if x['confidence']=='high'))"
```

- [ ] **Step 3: Hand-verify the major cues**

For each chronology entry with `significance: "major"` (22 of them), find its cue, then read the transcript around that timestamp to confirm the video is actually discussing that event there.

Because `transcript.md` has no timestamps, check against the live caption track:

```bash
python3 - <<'PY'
from youtube_transcript_api import YouTubeTranscriptApi
T = 724            # <- the cue's t
segs = [s for s in YouTubeTranscriptApi().fetch("o4czWtSxGig", languages=["en"])
        if T - 20 <= s.start <= T + 60]
print(" ".join(s.text for s in segs))
PY
```

Correct any cue whose surrounding text is clearly about something else by editing its `t` in `cues.json` directly. Leave `minor` and `notable` cues as derived.

**Do not skip this step.** It is the difference between a cue the reader can trust and a link that lands them somewhere random in a 2h43m video.

- [ ] **Step 4: Commit**

```bash
git add scripts/derive_cues.py "UAP Gerb Knowledge Base/Videos/80 Years of UFO Crash Retrieval and Reverse Engineering - A Timeline/cues.json"
git commit -m "Add cue derivation script and cues for the 80 Years video"
```

---

### Task 4: Wire cues into the page

**Files:**
- Create: `app/components/content/WikiCue.vue`
- Create: `app/components/content/WikiWatch.vue`
- Modify: `app/components/content/WikiTimeline.vue` (from Part 1)
- Modify: `UAP Gerb Knowledge Base/Videos/80 Years of UFO Crash Retrieval and Reverse Engineering - A Timeline/summary.md`

**Interfaces:**
- Consumes: `useVideoDock` (Task 1), the `TimelineEvent` shape from Part 1 Task 9.
- Produces: `::wiki-cue{t=724 video="o4czWtSxGig"}`, `::wiki-watch{video= title=}`, and a `cue` field on `TimelineEvent`.

- [ ] **Step 1: Write WikiCue**

Create `app/components/content/WikiCue.vue`:

```vue
<script setup lang="ts">
import { Play } from '@lucide/vue'

const props = withDefaults(
  defineProps<{ t?: number | string, video?: string, approx?: boolean | string }>(),
  { t: 0, video: '', approx: false },
)

const dock = useVideoDock()

const seconds = computed(() => {
  const n = Number(props.t)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0
})

const label = computed(() => {
  const s = seconds.value
  const h = Math.floor(s / 3600)
  const m = Math.floor(s / 60) % 60
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
})

const isApprox = computed(() => props.approx === true || props.approx === 'true')

function go(): void {
  if (props.video && dock.videoId.value !== props.video) {
    dock.open({ videoId: props.video, at: seconds.value })
    return
  }
  dock.seek(seconds.value)
}
</script>

<template>
  <button
    type="button"
    class="ufo-cue"
    :class="{ 'is-approx': isApprox }"
    :title="isApprox ? 'Approximate timestamp' : 'Jump to this moment'"
    @click="go"
  >
    <Play class="size-2.5" />
    <span>{{ isApprox ? '~' : '' }}{{ label }}</span>
  </button>
</template>

<style scoped>
.ufo-cue {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 5px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 16px;
  color: hsl(var(--muted-foreground));
  vertical-align: baseline;
  transition: color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard);
}
.ufo-cue:hover {
  border-color: hsl(var(--primary));
  color: hsl(var(--primary));
}
/* Approximate cues read as a hint, not a promise. */
.ufo-cue.is-approx { border-style: dashed; }
</style>
```

- [ ] **Step 2: Write WikiWatch**

Create `app/components/content/WikiWatch.vue` — the block that opens the dock in the first place:

```vue
<script setup lang="ts">
import { Play } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = withDefaults(
  defineProps<{ video?: string, title?: string }>(),
  { video: '', title: '' },
)

const dock = useVideoDock()
</script>

<template>
  <div v-if="props.video" class="my-6 flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
    <Button size="sm" @click="dock.open({ videoId: props.video, title: props.title })">
      <Play class="size-3.5" />
      Watch here
    </Button>
    <p class="font-sans text-[13px] leading-5 text-muted-foreground">
      Opens a player you can move and resize. It keeps playing as you browse the wiki,
      and timestamps on this page jump straight to the moment.
    </p>
  </div>
</template>
```

- [ ] **Step 3: Add cues to the timeline**

In `app/components/content/WikiTimeline.vue`:

Extend the interface:

```ts
interface TimelineEvent {
  date: string
  title: string
  summary?: string
  category?: string
  entities?: string[]
  significance?: string
  cue?: number
  cueApprox?: boolean
}
```

Add a `video` prop:

```ts
const props = withDefaults(
  defineProps<{ events?: TimelineEvent[], eraSize?: number | string, video?: string }>(),
  { events: () => [], eraSize: 10, video: '' },
)
```

And render the chip beside each date — replace the date `<div>` with:

```vue
          <div class="flex items-center gap-2">
            <span class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              {{ formatDate(event.date) }}
            </span>
            <WikiCue
              v-if="typeof event.cue === 'number'"
              :t="event.cue"
              :video="props.video"
              :approx="event.cueApprox"
            />
          </div>
```

- [ ] **Step 4: Merge cues into the page's timeline YAML**

```bash
cd "/Users/jaidendechon/Library/Repos/UAP Gerb Knowledge Base" && python3 - <<'PY'
import json
D = "UAP Gerb Knowledge Base/Videos/80 Years of UFO Crash Retrieval and Reverse Engineering - A Timeline"
cues = {c['label']: c for c in json.load(open(f'{D}/cues.json'))}
for label, c in sorted(cues.items(), key=lambda kv: kv[1]['t']):
    approx = '  cueApprox: true' if c['confidence'] == 'low' else ''
    print(f"{c['t']:>6}  {'~' if approx else ' '} {label}")
print(f"\n{len(cues)} cues to merge")
PY
```

For each timeline entry in `summary.md` whose `title` matches a cue `label`, add `cue: <t>` and, when the cue's confidence is `low`, `cueApprox: true`.

Then add `video="o4czWtSxGig"` to the `::wiki-timeline` block's attributes:

```markdown
::wiki-timeline{video="o4czWtSxGig"}
```

- [ ] **Step 5: Add the watch block and the approximation note**

Insert a `::wiki-watch{video="o4czWtSxGig" title="80 Years of UFO Crash Retrieval"}` block immediately after the stat strip.

Add one line under the `## Chronology` heading, stated once rather than per cue:

```markdown
Timestamps are derived from the video's captions. Those on major entries have
been checked by hand; the rest are approximate and marked with `~`.
```

- [ ] **Step 6: Verify end to end**

```bash
cd app && bun run dev
```

On the pilot page: click **Watch here** — the dock opens. Click a cue — the video seeks there. Minimise, then click another cue — it restores and seeks. Close the dock, click a cue — it reopens at that timestamp. Navigate to an entity page — playback continues. Approximate cues show `~` and a dashed border.

Check all four themes and mobile width.

- [ ] **Step 7: Commit**

```bash
git add app/components/content/WikiCue.vue app/components/content/WikiWatch.vue app/components/content/WikiTimeline.vue "UAP Gerb Knowledge Base/Videos/80 Years of UFO Crash Retrieval and Reverse Engineering - A Timeline/summary.md"
git commit -m "Wire timestamp cues into the timeline and dock"
```

---

### Task 5: Document and verify

**Files:**
- Modify: `docs/wiki-components.md` (from Part 1 Task 12)

- [ ] **Step 1: Document the dock components**

Add sections for `::wiki-watch` and `::wiki-cue` with their attributes, and document `cue` / `cueApprox` on `wiki-timeline` events. Explain that cues are derived by `scripts/derive_cues.py` and that major ones are hand-verified.

- [ ] **Step 2: Full verification**

```bash
cd app && bun run test && bun run build
```

Expected: all tests pass; build succeeds including `vue-tsc`.

- [ ] **Step 3: Confirm Obsidian still parses the pilot page**

```bash
cd "/Users/jaidendechon/Library/Repos/UAP Gerb Knowledge Base/UAP Gerb Knowledge Base" && python3 -c "
import re,pathlib
t=pathlib.Path('Videos/80 Years of UFO Crash Retrieval and Reverse Engineering - A Timeline/summary.md').read_text()
assert t.startswith('---')
o=len(re.findall(r'^::[a-z-]+', t, re.M)); c=len(re.findall(r'^::\$', t, re.M))
print('open blocks',o,'closers',c,'unclosed',o-c)"
```

Expected: `unclosed 0`.

- [ ] **Step 4: Commit**

```bash
git add docs/wiki-components.md
git commit -m "Document the video dock and cue components"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Dock mounted in layout, survives navigation | 2 (Step 2) |
| `useState`-backed shared state | 1 |
| `useDraggable` drag, corner-handle resize, 16:9 | 2 |
| Geometry persisted, playback position **not** | 1 (`persistDock`) |
| Clamp restored rect into viewport | 1 (`clampRect`, 6 tests) |
| `try/catch` on all storage access | 1 |
| IFrame API loaded lazily | 2 (verified Step 3) |
| Pending-seek queue, last wins | 1 + 2 |
| Bottom-docked, drag disabled below 900px | 2 |
| `Escape` closes, arrow keys nudge | 2 |
| `prefers-reduced-motion` | 2 |
| `cues.json` sidecar + derivation script | 3 |
| Major cues hand-verified | 3 (Step 3) |
| `confidence` surfaced in UI | 4 (`is-approx`) |
| Documentation | 5 |

**Type consistency:** `DockRect`, `clampRect`, `persistDock`, `useVideoDock` are used with identical signatures across Tasks 1, 2 and 4. `TimelineEvent` gains `cue`/`cueApprox` in Task 4 Step 3, matching the YAML written in Step 4.

**Deliberate carry-over:** `WikiWatch` was not in the spec's component list. It is required — nothing else opens the dock, and the spec's cue behaviour ("if the dock is closed, it opens at that timestamp") only covers cues, leaving no entry point for someone who wants to just start watching.
