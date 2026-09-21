# Rich video pages

**Status:** approved design, not yet implemented
**Pilot page:** `Videos/80 Years of UFO Crash Retrieval and Reverse Engineering - A Timeline/summary.md`

A video summary is currently prose plus a fact table. For a 2h44m chronological
survey naming dozens of incidents, that flattens the one thing the video is
actually good at: showing how eighty years of alleged programs, crashes and
contractors fit together.

This design adds a kit of structured-content components — a timeline, an org
chart, a roster, a stat strip — plus an app-global video dock that keeps playing
while the reader browses, and cues that seek it to the moment under discussion.

The pilot page uses the whole kit. The kit itself is general: every component is
reusable on any video page, and a documented escape hatch covers per-video one-offs.

## Goals

- Give the pilot page a top-down, at-a-glance read that prose cannot.
- Ship components reusable across all 53 video pages, not a bespoke page.
- Let a reader watch and read at once, without losing their place in either.
- Leave an escape hatch for visuals specific to a single video.

## Non-goals

- Rendering these visuals inside Obsidian. Obsidian shows `::` blocks as literal
  text; that is accepted (see Decisions).
- Retrofitting the other 52 video pages. This is a pilot.
- A general-purpose diagramming or charting library.

## Decisions

These were settled before design and are not open questions.

| Decision | Choice | Consequence |
|---|---|---|
| Authoring format | MDC blocks inline in `summary.md` | Best web output, free placement; Obsidian shows literal `::` + YAML |
| Video dock scope | App-global, survives navigation | Needs layout mount + shared state + persistence |
| Cue timestamps | Auto-derived, `major` entries hand-verified | `minor` cues stay approximate; this is documented on the page |
| Org chart technique | Nested `<table>` + CSS connectors | PrimeVue's approach, without the dependency |

### Why nested tables for the org chart

A table's cells centre and size themselves, so connector lines drawn as
`::before`/`::after` pseudo-elements land correctly with **zero JavaScript
measurement**. The alternative — CSS grid plus an SVG overlay — needs a
`ResizeObserver` and re-measures on font load, theme switch and container
resize, which visibly jitters. Nested tables are what PrimeVue's
`OrganizationChart` does, and the reason is sound; only the dependency is
unwanted here.

Accessibility: these tables are presentational, not tabular data. Each gets
`role="presentation"` so screen readers walk the nested `<ul>`-equivalent
semantics we expose on the node content instead of announcing rows and columns.

## Architecture

Three layers, each independently testable.

```
vault  summary.md
       ::wiki-timeline  ─┐  MDC blocks, YAML bodies,
       ::wiki-org-chart ─┤  entity refs as plain page names
       ::wiki-roster    ─┘
                         │
server /api/resolve  ────┤  names → { path, title, category }
       (reads #wiki-data's baked graph.nodes)
                         │
client components/content/Wiki*.vue
       components/wiki/WikiVideoDock.vue  (mounted in layouts/default.vue)
       composables/useVideoDock.ts, useWikiResolve.ts
```

### Layer 1 — authoring

Rich blocks are MDC, matching the existing `::wiki-callout` precedent:

```markdown
::wiki-timeline
---
events:
  - date: "1947-07-08"
    title: Roswell crash retrieval
    summary: The Roswell Army Air Field allegedly recovered a crashed craft.
    category: event
    entities: ["Jesse Marcel", "Roswell Army Air Field"]
    significance: major
    cue: 724
---
::
```

**Entity references are plain page names, never `[[wikilinks]]`.** This is a
hard constraint, not a style preference: `replaceWikiLinks` in `wiki/vault.ts`
runs over the entire file body at `content:file:beforeParse`, before any MDC
parsing. A `[[Jesse Marcel]]` inside a YAML block would be rewritten to
`[Jesse Marcel](</wiki/people/jesse-marcel>)` *in the YAML string*, corrupting
the value. Resolution happens at layer 2 instead.

### Layer 2 — resolution

New route `server/api/resolve.get.ts`. Accepts `?names=a,b,c`, returns
`(NoteRef | null)[]` positionally aligned with the input.

It reads `graph.nodes` from the already-baked `#wiki-data` virtual module, which
holds `{ i, l: label, p: path, c: category }` for every note — so no new vault
scan and no filesystem access at request time.

A lowercased-label → node map is added to `server/utils/wiki.ts` beside the
existing `nodeIndexByPath()`, memoised with the same `??=` idiom so it is built
once per server process rather than per request.

Ambiguity resolves through `vault.ts`'s existing `FOLDER_PRIORITY`, so a bare
name in YAML picks the same page a bare `[[wikilink]]` would. Diacritic folding
reuses the same `fold()` helper. **`FOLDER_PRIORITY` and `fold()` are exported
from `wiki/vault.ts` for this purpose** rather than duplicated — a second copy
would drift and silently resolve links differently from real wikilinks.

Unresolved names return `null` and render as plain text, never a dead link.
This mirrors `replaceWikiLinks`, which flattens unresolvable wikilinks to their
label.

`useWikiResolve()` batches every name on a page into one request and caches per
route.

### Layer 3 — render

**MDC components** in `app/components/content/` (auto-registered, flat directory):

| Tag | Component | Purpose |
|---|---|---|
| `::wiki-timeline` | `WikiTimeline.vue` | Era-grouped chronology rail |
| `::wiki-org-chart` | `WikiOrgChart.vue` | Hierarchy with connector lines |
| `::wiki-stat-strip` | `WikiStatStrip.vue` | At-a-glance figures |
| `::wiki-roster` | `WikiRoster.vue` | Dramatis personae cards |
| `::wiki-cue{t=724}` | `WikiCue.vue` | Inline chip; seeks the dock |
| `::wiki-panel` | `WikiPanel.vue` | Titled frame, slots markdown |
| `::wiki-grid{cols=3}` | `WikiGrid.vue` | Responsive column wrapper |
| `::wiki-figure` | `WikiFigure.vue` | Captioned block |

`WikiOrgChart` renders recursively via a private `OrgNode` sub-component.

**Shell components** in `app/components/wiki/`:

- `WikiVideoDock.vue` — floating player, mounted once in `layouts/default.vue`
- `WikiTocRail.vue` — sticky section rail with scroll-spy

**Composables** in `app/composables/`:

- `useVideoDock.ts` — global player state
- `useWikiResolve.ts` — name → `NoteRef`

## The video dock

Mounted in `layouts/default.vue` as a sibling of `<AppCommandPalette />`, so it
sits outside `<main>` and survives route changes.

State lives in `useVideoDock()`, built on Nuxt's `useState` to match the
established `useShellState.ts` pattern:

```ts
interface DockState {
  videoId: string | null
  title: string
  visible: boolean
  minimised: boolean
  x: number; y: number
  w: number; h: number
}
```

**Playback** uses the YouTube IFrame Player API, loaded lazily on first open —
not on every page load. Verified: video `o4czWtSxGig` returns
`playable_in_embed: True`.

**Drag** uses `useDraggable` from `@vueuse/core` (already a dependency).
**Resize** uses a corner handle with pointer events, preserving 16:9 and
clamping to a 240px minimum width.

**Persistence:** position, size and minimised state go to `localStorage`.
Never the playback position — a stale resume is more confusing than useful.
On mount the restored rect is clamped back inside the viewport, so a window
resize between sessions cannot strand the dock offscreen. Every read and write
is wrapped in `try/catch`; the dock must render correctly with storage blocked.

**Seeking:** `dock.seek(seconds)` on an open dock calls `player.seekTo`. On a
closed dock it opens at that timestamp. Calls arriving before the IFrame API
finishes loading queue into a single pending-seek slot (last wins).

**Mobile:** below the 900px breakpoint the dock docks to the bottom edge at full
width and drag is disabled. A draggable window on a phone is a nuisance, and it
would collide with the existing sidebar overlay at the same breakpoint.

**Accessibility:** focus-trap-free but keyboard-closable via `Escape`, with the
drag handle reachable by keyboard and movable with arrow keys. `prefers-reduced-motion`
suppresses the open/close transition.

## Cues

`cues.json` sits beside `transcript.md`:

```json
[{ "t": 724, "label": "Roswell crash retrieval",
   "confidence": "high", "match": "the Roswell Army Air Field issued" }]
```

Generated by `scripts/derive_cues.py`, which re-fetches timestamped captions
(`youtube-transcript-api` returns `start` per segment) and matches each
chronology entry against them on distinctive phrases, dates and proper nouns.

Entries with `significance: major` are then hand-verified against the transcript
text surrounding the derived timestamp, and corrected where the match missed.
Minor entries stay approximate — the page says so, once, rather than annotating
every cue.

`confidence` is carried through to the UI as a subtle affordance difference, so
an approximate cue does not look like a promise.

## Testing

The repo has no test infrastructure, and adding a runner is out of scope for a
pilot. Verification is therefore explicit and manual, and the plan must not
claim success without it:

1. `bun install` (node_modules is currently absent), then `bun run build` — must
   pass, including `vue-tsc`.
2. Drive the dev server in the browser and confirm, on the pilot page: each
   component renders; the dock opens, drags, resizes, and survives navigation to
   an entity page; a cue seeks it; the TOC rail scroll-spies.
3. Check all four themes (light, dark, dim, sepia) and both mobile and desktop
   widths. The design system has four themes; a component that only works in two
   is not done.
4. Confirm `/api/resolve` returns the same target for a bare name as the
   rendered `[[wikilink]]` for that name on the same page.
5. Confirm the page still parses in Obsidian — literal `::` blocks are expected;
   broken frontmatter or mangled wikilinks are not.

## Risks

| Risk | Mitigation |
|---|---|
| Auto-derived cues land on the wrong moment | `major` cues hand-verified; `confidence` surfaced in the UI |
| The kit is built for one page and fits no other | Every component takes data as props; nothing hardcodes this video |
| Dock obscures content on small screens | Bottom-docked below 900px, minimisable, closable |
| YAML in markdown is fiddly to author | `_templates/Video Note Template.md` gains a commented example of each block |
| Scope is large for one PR | Layers land in dependency order; each is independently reviewable |

## Escape hatch

Two tiers, because "totally custom" and "don't write Vue for a one-off" pull in
opposite directions.

**Tier 1 — primitives.** `::wiki-panel`, `::wiki-grid` and `::wiki-figure`
compose bespoke layouts in markdown with no new files. Expected to cover most
per-video one-offs.

**Tier 2 — a real component.** Drop `WikiCustomAztecDiagram.vue` into
`app/components/content/` and reference it as `::wiki-custom-aztec-diagram`.
Nuxt auto-imports it; no registration step.

The directory is deliberately **flat** rather than `content/custom/`. Nuxt
prefixes component names by path, so a nested directory would silently change
the MDC tag to `::custom-wiki-custom-aztec-diagram`.

Both tiers are documented in `docs/wiki-components.md`, written as part of this
work — the kit is worthless to future authors if its syntax lives only in
component source.

## Out of scope

Deliberately excluded, recorded so they are not rediscovered as omissions:

- Migrating the other 52 video pages.
- A cue-authoring UI. `cues.json` is written by script and hand-corrected.
- Timeline zoom/pan. Era grouping plus filters is enough at ~90 entries.
- Persisting playback position across sessions.
- Rendering any of this in Obsidian.
