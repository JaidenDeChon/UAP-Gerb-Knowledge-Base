# Wiki component kit

Reference for the MDC (Markdown Components) blocks available inside `.md` notes
in the vault. These render as rich, structured content on the web app
(`app/`) — timelines, org charts, stat strips, rosters, a timestamped video
dock, and layout primitives — while still being plain Markdown that Obsidian
can open.

Every MDC component lives in `app/app/components/content/` and every prop
below was read directly from that component's source
(`defineProps`/`withDefaults`), not inferred from usage. The video dock
itself (`WikiVideoDock.vue`) is not an MDC component — see "Supporting
utilities" below for where it lives and why. If this doc and a component's
source ever disagree, the source wins — file a fix.

The best worked example of the whole kit in a real note is the pilot page:
`UAP Gerb Knowledge Base/Videos/80 Years of UFO Crash Retrieval and Reverse Engineering - A Timeline/summary.md`.

---

## Read this before you write a single YAML block

### 1. Entity references are plain page names — never `[[wikilinks]]`

Inside a component's YAML body (`entities:`, `name:`, `root.name`, etc.), write
the bare page title as a string. **Do not** wrap it in `[[double brackets]]`.

```yaml
# Right
entities:
  - "David Grusch"
  - "Roswell Crash"

# Wrong — will corrupt the YAML value
entities:
  - "[[David Grusch]]"
```

Why: `app/wiki/vault.ts`'s `replaceWikiLinks()` runs a regex rewrite over the
**entire raw file body** — wired in `app/nuxt.config.ts` as a Nuxt Content
`before:parse` hook — before `@nuxt/content`/MDC ever tokenizes the file. It
does not know it's inside a fenced YAML block; it just sees `[[...]]`
anywhere in the text and rewrites it to a Markdown link
(`[Label](<path>)`). Do that inside a YAML string and you get a Markdown
link *embedded in the string value*, which either breaks YAML parsing or
resolves to a garbage entity name. The components resolve entity names
themselves (via `/api/resolve`, see below) — they don't need, and can't use,
a pre-rendered link.

### 2. The name must be the page's real title, not a display alias

The vault has aliased wikilinks like
`[[Strategic Defense Initiative (SDI)|Strategic Defense Initiative]]` — the
*display text* is "Strategic Defense Initiative" but the *actual page title*
is "Strategic Defense Initiative (SDI)". Only the real title resolves through
`/api/resolve`. Aliases, partial titles, and typos do not.

**A name that doesn't resolve fails silently.** It just renders as plain,
unlinked text — no error, no dead-link warning, no console message. A typo
is trivially easy to miss during authoring. When you write an entity name
into one of these YAML blocks, open the rendered page and confirm it turned
into a coloured link, not plain text.

### 3. Custom components go flat in `components/content/`, never a subdirectory

Nuxt auto-imports components and names them after their path relative to the
components directory. A file directly in `components/content/` resolves
**unprefixed** — `WikiRoster.vue` → `<WikiRoster>` → MDC tag `::wiki-roster`.
A file in a subdirectory like `components/wiki/` gets that directory folded
into the name as a prefix instead: `components/wiki/OrgChartNode.vue`
registers as `WikiOrgChartNode` (not `OrgChartNode` — the filename doesn't
already start with "Wiki" for Nuxt to dedupe against it).

This is exactly what broke `WikiOrgChart`'s recursive self-reference during
development: `OrgChartNode.vue` refers to itself as `<WikiOrgChartNode>`,
not `<OrgChartNode>`, precisely because of where it lives.

Practical rule: **any new MDC-facing component goes flat in
`app/app/components/content/`.** If a component name ever seems not to
resolve, check the real registered name in `app/.nuxt/components.d.ts`
rather than guessing.

### 4. A `<table>`-based component inherits the wiki page's prose table styling

`app/app/pages/wiki/[...slug].vue` styles every `<table>`/`<th>`/`<td>`
rendered inside a note's body:

```css
.wiki-prose :deep(table) { @apply my-6 w-full border-collapse text-sm; }
.wiki-prose :deep(th),
.wiki-prose :deep(td) { @apply border border-border px-3 py-2 text-left align-top; }
```

Those rules compile to specificity `(0,2,1)` (`.wiki-prose[scope-attr] table`
and friends). Any component that renders its own `<table>`/`<td>` — for
structural layout, not tabular prose — inherits visible borders and padding
it never asked for. `OrgChartNode.vue` is the one component in the kit that
uses a `<table>` (for the org-chart connector geometry), and it solves this
by **repeating its own class** to raise specificity above the page's rule,
e.g. `.ufo-org-cell.ufo-org-cell { border: 0; padding: 0; }` — three
class-level selectors beats the page's two-class-plus-element rule outright.
No `!important`, and `[...slug].vue` is left untouched.

If you ever build another table-based component, use this same pattern
(repeat the component's own class on every rule that resets or re-applies a
border/padding/width on its `<table>`/`<td>`) rather than reaching for
`!important`.

### 5. A third-party library that replaces your mount element strips Vue's scoped-style attribute

`WikiVideoDock.vue` hands a plain DOM node to the YouTube IFrame API:
`new YT.Player(mountEl, { videoId, ... })`. `YT.Player` doesn't render
*into* `mountEl` — it **replaces** it outright with its own `<iframe>`. That
iframe inherits `mountEl`'s `class` attribute but not Vue's scoped-style
attribute (`data-v-xxxxxxxx`), because Vue never touched the replacement
node. Any scoped CSS written against the original element — including a
`:deep()` selector that assumes it's still there — silently stops applying
the moment the swap happens.

`WikiVideoDock` solves this with a **surviving scoped wrapper**:
`.ufo-dock-stage` owns the 16:9 box (`aspect-ratio: 16 / 9; width: 100%`)
and is never itself handed to `YT.Player`. A fresh, disposable `<div>` is
created imperatively and appended *inside* the wrapper on every mount
(never reused via a template ref, since the previous mount node may already
be gone). The iframe is then sized from the surviving wrapper —
`.ufo-dock-stage :deep(iframe) { position: absolute; inset: 0; width: 100%;
height: 100%; }` — targeting an ancestor Vue still owns, not the node that
got swapped out.

**Generalise this**: any future component that hands a DOM node to a
third-party library which might replace that node (map libraries, charting
libraries, embeds) needs the same shape — a surviving wrapper that owns
layout/sizing, with a throwaway mount node inside it. This is a sibling of
gotcha 4 above: both are cases where markup a component doesn't fully
control (the page's prose CSS; a third-party library's DOM surgery) can
silently defeat the component's own styling, and the fix in both cases is
to raise the component's own claim on the relevant element rather than
fight the intruder directly.

### 6. The dock must mount in the layout, outside `<main>`

`WikiVideoDock` is mounted once in `app/app/layouts/default.vue`, as a
sibling of `<main>`/`<slot />` — not inside it:

```vue
<main ref="mainRef" ...>
  <slot />
</main>
...
<AppCommandPalette />
<WikiVideoDock />
```

`<main>`'s content is the routed page (`<slot />`), and Nuxt fully
unmounts and remounts that subtree on navigation between wiki notes. A
component placed inside it would unmount along with the outgoing page —
silently, with no error — and playback would simply stop dead the moment
someone clicked a link. The entire point of the dock ("keeps playing as you
browse the wiki") requires it to survive navigation, which means it has to
live in a part of the layout that navigation never touches.
`WikiVideoDock`'s own `v-if="dock.visible.value && dock.videoId.value"`
controls whether it's *visible* — that's a separate concern from whether
it's *mounted*, and only the layout placement guarantees the latter.

### 7. Cue buttons need an explicit `aria-label`

A `::wiki-cue` button's visible text is a bare timestamp, e.g. `16:27`.
Accessible-name computation prefers an element's text content over its
`title` attribute, so without an explicit `aria-label` a screen reader
announces only "16:27" — no verb, no context, nothing to indicate it's a
button that does something. `WikiCue.vue` builds a real name instead:

```
Jump to {timestamp} in the video ({entry title})
```

— falling back to `Jump to {timestamp} in the video` with no parenthetical
when the caller didn't supply an `entry-title` (i.e. a bare `::wiki-cue`
block used outside `::wiki-timeline`, which always passes one).

### 8. `confidence` means hand-verified, not high-scoring

`scripts/derive_cues.py` **always** writes `"confidence": "low"` for every
cue it produces, regardless of how well a caption window scored. `"high"`
is applied only afterward, by hand, by a human who read the live caption
text around a candidate timestamp and confirmed the video is actually
discussing that event there — that promotion never happens automatically.

This exists because the matching score is recall-only —
`score = hit / len(want)`, with no precision term — so a chronology entry
with few distinctive tokens (proper nouns, four-digit years) can score a
perfect `1.0` against a caption window that just happens to share an
incidental phrase, while being about something else entirely. That's the
exact mechanism that once mislanded a cue for a 1963 event ("CIA
Directorate of Science and Technology founded") 67 minutes away, onto an
unrelated 2011 segment that happened to score higher. A ranking signal is
not evidence of correctness — only reading the actual transcript is.

The UI treats the distinction as load-bearing, not cosmetic: `WikiCue`
renders a `low`-confidence cue (`cueApprox: true`) with a leading `~` and a
dashed border (`.is-approx`) so it reads as a hint, not a promise, while a
hand-verified `high` cue renders as a plain, confident-looking timestamp.

### 9. Re-running `derive_cues.py` would destroy hand-verified work — it refuses to overwrite

`derive_cues.py` exits with an error if `--out` already exists, unless
`--force` is passed. An existing `cues.json` may contain timestamps a
human corrected and promoted to `"confidence": "high"` (gotcha 8) — the
script has no way to reproduce that judgment; re-running it can only
regenerate fresh `"low"`-confidence guesses from scratch. Without the
guard, a routine re-run (say, to pick up an edited chronology) would
silently clobber every hand verification made since the file was first
generated. Pass `--force` only when you genuinely intend to discard
whatever hand-verification is currently in the file.

---

## Components

All MDC tag names below are the actual auto-import names, lowercased and
kebab-cased by Nuxt Content — e.g. `WikiTimeline.vue` → `::wiki-timeline`.

### `::wiki-timeline`

Source: `app/app/components/content/WikiTimeline.vue`

Filterable, era-grouped chronology with a rail/dot visual.

Props:

| Prop | Type | Default | Notes |
|---|---|---|---|
| `events` | `TimelineEvent[]` | `[]` | YAML body. See schema below |
| `eraSize` | `number \| string` | `10` | YAML body. Decade-bucket size, e.g. `10` groups into "1940s"/"1950s"; invalid/non-positive values fall back to `10` |
| `video` | `string` | `''` | Attribute, e.g. `video="o4czWtSxGig"`. A YouTube video ID. Gates the per-entry cue chip: a `WikiCue` only renders for an event when **both** `event.cue` is a number **and** this prop is set — an entry with `cue` but no video-level `video` renders no chip at all |
| `videoTitle` | `string` | `''` | Attribute, written kebab-case as `video-title` (standard Vue prop↔attribute casing). The video's own title, e.g. for the dock header — **not** any one entry's own title. Forwarded to every rendered `WikiCue` as `video-title` |

`TimelineEvent` schema (YAML body):

```yaml
events:
  - date: "1947-07"          # required. "YYYY-MM-DD", "YYYY-MM", "YYYY",
                              # "c. 1980s", or a free string like "Unknown"
    title: "Roswell crash retrieval"   # required
    summary: "One or more non-human craft were allegedly recovered..."  # optional
    category: event           # optional — one of: event, program, person,
                               # organization, document, policy (drives dot/chip
                               # colour via TIMELINE_TINT — see below)
    entities:                 # optional — PLAIN page names, see gotcha 1/2
      - "David Grusch"
      - "Roswell Crash"
    significance: major       # optional — only "major" has any effect
                               # (bigger dot, "Major only" filter)
    cue: 1502                 # optional — second offset into `video` where this
                               # entry is discussed. Only rendered when the
                               # block's `video` attribute is also set. See
                               # `::wiki-cue` below and gotchas 8/9
    cueApprox: true           # optional — true when `cue`'s confidence in
                               # cues.json is "low" (i.e. not hand-verified).
                               # Renders the chip with a leading `~` and a
                               # dashed border. Omit (or false) for a
                               # hand-verified ("high") cue
```

Behaviour worth knowing:

- Nothing renders if `events` is empty.
- Events are sorted ascending by leading year from a **copy** of `events`
  (never mutates the prop) before being grouped into eras, so authors don't
  need to hand-sort. Same-year entries and undated entries keep their
  authored order. Events with no parseable year form a single trailing
  "Undated" era.
- The leading year is read with `^\s*(?:c\.\s*)?(\d{4})` — a `c.`-prefixed
  circa date like `"c. 1980s"` groups by `1980`, not into a catch-all.
- Category filter chips are auto-derived from whatever `category` values are
  present in `events` (deduplicated, sorted) — there's no separate list to
  maintain. A "Major only" toggle is always shown.
- `date` formatting: `"1947-07-08"` → `"8 Jul 1947"`, `"1947-07"` →
  `"Jul 1947"`; anything else (including `"c. 1980s"` or `"Unknown"`) passes
  through unchanged.

### `::wiki-watch`

Source: `app/app/components/content/WikiWatch.vue`

A small call-to-action strip that opens the video dock. This is the intended
entry point for "just start watching" a video — nothing else opens the dock
from a cold page load, so a page with `::wiki-cue`/`cue`-bearing timeline
entries but no `::wiki-watch` block has no way to open the player except by
clicking one of those cues.

Props (attribute syntax, not a YAML body):

| Prop | Type | Default | Notes |
|---|---|---|---|
| `video` | `string` | `''` | A YouTube video ID (not a URL). Nothing renders when this is empty |
| `title` | `string` | `''` | Passed to `dock.open()` as the dock header title |

```mdc
::wiki-watch{video="o4czWtSxGig" title="80 Years of UFO Crash Retrieval"}
::
```

Clicking the button calls `dock.open({ videoId: props.video, title:
props.title })` — see `useVideoDock` below.

### `::wiki-cue`

Source: `app/app/components/content/WikiCue.vue`

A small inline button rendering a timestamp (`16:27`) that jumps the dock to
that moment in a video. `::wiki-timeline` renders one of these automatically
next to any event with a numeric `cue` (see above); it can also be dropped
directly into note prose.

Props (attribute syntax, not a YAML body):

| Prop | Type | Default | Notes |
|---|---|---|---|
| `t` | `number \| string` | `0` | Seconds into the video. Non-finite or negative values coerce to `0`; truncated to an integer |
| `video` | `string` | `''` | A YouTube video ID. With no `video`, clicking is a no-op (a dev-mode console warning fires; see below) |
| `approx` | `boolean \| string` | `false` | `true`/`"true"` renders the `~` prefix and dashed border. Normally forwarded from `TimelineEvent.cueApprox` |
| `videoTitle` | `string` | `''` | Attribute `video-title`. The video's own title — used as the dock header title if this cue has to *open* the dock (i.e. a different or no video is currently loaded) |
| `entryTitle` | `string` | `''` | Attribute `entry-title`. The timeline entry this cue belongs to; folded into the accessible name (gotcha 7) when known |

```mdc
::wiki-cue{t=724 video="o4czWtSxGig" video-title="80 Years of UFO Crash Retrieval"}
::
```

Behaviour worth knowing:

- The visible label is `h:mm:ss` past the first hour, `m:ss` before it (e.g.
  `16:27` or `1:03:12`).
- Clicking calls `dock.open({ videoId, at: seconds, title })` when the dock
  has no video loaded or a *different* one loaded, or just `dock.seek(seconds)`
  when the right video is already current — `seek()` also un-minimises and
  reopens a closed-but-loaded dock, so a closed dock with the right video
  cached still responds correctly to a click.
- With no `video` prop resolved at all (only reachable via a bare
  `::wiki-cue` block, since `::wiki-timeline` never renders the chip without
  one — see the `video` prop above), a click is a deliberate no-op: a
  `console.warn` fires in dev (`import.meta.dev`) rather than either doing
  nothing silently or throwing.
- See gotcha 7 above for why `aria-label` is set explicitly rather than
  relying on `title`.

### `::wiki-org-chart`

Source: `app/app/components/content/WikiOrgChart.vue` (recursion via
`app/app/components/wiki/OrgChartNode.vue`, auto-imported as
`WikiOrgChartNode` — see gotcha 3)

Renders a nested, table-based org chart with connector lines.

Props:

| Prop | Type | Default | Notes |
|---|---|---|---|
| `root` | `OrgNode` | *(none — required for anything to render)* | Nothing renders if `root` is undefined |

`OrgNode` schema (recursive):

```yaml
root:
  name: "CIA"                 # required. PLAIN page name — see gotcha 1/2
  label: "NSC covert-activities executive agent"   # optional, small kicker text
  note: "Shown here as the video's through-line institution..."  # optional
  children:                   # optional, recursive OrgNode[]
    - name: "Majestic 12"
      label: "Alleged UFO steering group"
      note: "..."
    - name: "CIA Directorate of Science and Technology"
      label: "Reverse-engineering gatekeeper"
      children:
        - name: "MITRE Corporation"
          label: "FFRDC reverse-engineering partner"
```

Every `name` in the whole tree is resolved in a single batched request
(`useWikiResolve`), so the chart doesn't fan out one network call per node.
Scrolls horizontally on overflow rather than shrinking.

Each node's box surface is tinted by its own resolved category
(`categorySurface`), and the connector lines it draws down to its children
pick up the same node's `categoryBorder`. The box's own 1px outline stays
neutral (`hsl(var(--border))`), not category-coloured — a category-tinted
border against that same category's tinted surface was measured to collapse
below 1.6:1 for Videos in light/sepia, so the outline is kept as a plain
hairline and the category reads through the surface tint plus the
`WikiEntityLink` dot beside the node's name instead.

### `::wiki-stat-strip`

Source: `app/app/components/content/WikiStatStrip.vue`

A row of large numbers/labels — 2 columns on mobile, 4 columns at `sm:` and up.

Props:

| Prop | Type | Default |
|---|---|---|
| `stats` | `Stat[]` | `[]` |

`Stat` schema:

```yaml
stats:
  - value: 90                 # required — string or number; quote it if it
                               # needs to stay a string, e.g. "2h44m"
    label: "Years covered"    # required
    hint: "1933–2023"         # optional, small caption under the label
  - value: 42
    label: "Chronology entries"
```

Nothing renders if `stats` is empty.

### `::wiki-roster`

Source: `app/app/components/content/WikiRoster.vue`

A grid of person/entity cards, whole-card tinted with the entity's category
surface plus a category-coloured left spine — 1 column on mobile, 2 columns
at `sm:` and up.

Props:

| Prop | Type | Default |
|---|---|---|
| `entries` | `Entry[]` | `[]` |

`Entry` schema:

```yaml
entries:
  - name: "David Grusch"      # required. PLAIN page name — see gotcha 1/2
    role: "Whistleblower, ex-NRO/NGA intelligence officer"   # optional
    note: "The video bookends its timeline with Grusch..."   # optional
```

The small uppercase label above each name (e.g. "PEOPLE") is the resolved
entity's vault category, read via `useWikiResolve`; an entry whose `name`
doesn't resolve shows "Unlinked" there instead and renders its name as plain
text (see gotcha 2). The spine colour is `tintFor(category)` — see below.

### `::wiki-panel` (Tier 1 primitive)

Source: `app/app/components/content/WikiPanel.vue`

A bordered box with an optional header, for slotted Markdown/MDC content.

Props (attribute syntax, not a YAML body):

| Prop | Type | Default | Notes |
|---|---|---|---|
| `title` | `string` | `''` | Header is only rendered when non-empty |
| `tone` | `'default' \| 'accent'` | `'default'` | `accent` tints the border/header with the primary colour |

```mdc
::wiki-panel{title="Program Structure" tone="accent"}
Body content goes here — ordinary Markdown, wikilinks, other MDC blocks, etc.
::
```

### `::wiki-grid` (Tier 1 primitive)

Source: `app/app/components/content/WikiGrid.vue`

A responsive grid container for laying out multiple `::wiki-panel` (or other)
blocks side by side.

Props:

| Prop | Type | Default | Notes |
|---|---|---|---|
| `cols` | `number \| string` | `2` | Clamped to `1`–`4`; non-numeric falls back to `2`. Breakpoints: `1` is always 1 col; `2` is 1 col → 2 at `sm:`; `3` is 1 → 2 (`sm:`) → 3 (`lg:`); `4` is 2 → 4 (`lg:`) |

```mdc
::wiki-grid{cols=3}
::wiki-panel{title="One"}
First panel body.
::
::wiki-panel{title="Two" tone="accent"}
Accent panel body.
::
::wiki-panel
Untitled panel body.
::
::
```

### `::wiki-figure` (Tier 1 primitive)

Source: `app/app/components/content/WikiFigure.vue`

Wraps slotted content (an image, a table, another component) in a
`<figure>` with a horizontal-scroll wrapper and an optional caption.

Props:

| Prop | Type | Default |
|---|---|---|
| `caption` | `string` | `''` |

```mdc
::wiki-figure{caption="A captioned figure."}
![alt text](./some-image.png)
::
```

`caption` is only rendered (as a `<figcaption>`) when non-empty.

---

## The escape hatch — two tiers

**Tier 1 — primitives.** `::wiki-panel`, `::wiki-grid`, and `::wiki-figure`
compose bespoke per-video layouts with no new component files. Reach for
these first.

**Tier 2 — a real component.** When a video genuinely needs something the
primitives can't express (a bespoke diagram, a specialized visualization),
drop a new single-file component into `app/app/components/content/` —
**flat, never in a subdirectory** (gotcha 3) — following the naming
convention `WikiCustom<Name>.vue`. Nuxt auto-imports it; there is no
registration step. Reference it from a note as
`::wiki-custom-<kebab-name>`, e.g. `WikiCustomAztecDiagram.vue` →
`::wiki-custom-aztec-diagram`.

---

## Supporting utilities (referenced by every component above)

### `app/app/utils/category.ts`

- `CATEGORY_VAR: Record<Category, string>` — maps each vault `Category`
  (`Root`/`MOCs` → `--graph-cat-mocs`, `People` → `--graph-cat-people`,
  `Organizations` → `--graph-cat-orgs`, `Operations` → `--graph-cat-ops`,
  `Events` → `--graph-cat-events`, `Locations` → `--graph-cat-locations`,
  `Concepts` → `--graph-cat-concepts`, `Videos` → `--graph-cat-videos`) to
  the CSS custom property holding its graph colour.
- `tintFor(category?: Category): string` — returns `hsl(var(--graph-cat-*))`
  for a known category, or `hsl(var(--muted-foreground))` when `category` is
  undefined (i.e. the entity didn't resolve). Used by `WikiRoster` and
  `WikiEntityLink`.
- `TIMELINE_TINT: Record<string, string>` — a **separate** domain: keys off
  `TimelineEvent.category` string values (`event`, `program`, `person`,
  `organization`, `document`, `policy`), not vault `Category` values. Do not
  conflate the two maps.
- `timelineTintFor(category?: string): string` — resolves a timeline event's
  category to `hsl(var(--graph-cat-*))`, falling back to
  `hsl(var(--graph-cat-mocs))` for an unknown/missing category.

### `app/app/utils/content.ts`

- `tocLinks(toc)` — flattens a note's table of contents to h2/h3 entries
  only (deeper headings are dropped as noise). Shared by `WikiTocRail` (which
  renders the list) and the wiki page itself.
- `hasTocRail(toc)` — `true` once a note has at least 3 headings
  (`MIN_TOC_LINKS`). This is the single source of truth both `WikiTocRail`
  and `app/app/pages/wiki/[...slug].vue` call, so the rail's `v-if` and the
  page's decision to reserve a layout column for it never disagree.

### `app/app/composables/useWikiResolve.ts`

`useWikiResolve(names)` batch-resolves plain page names (exactly what you
wrote in YAML — see gotcha 1) to `NoteRef`s (`{ path, title, category }`) via
`/api/resolve`. Names are trimmed, deduplicated, and sorted before the
request; up to 200 unique names go out per request (`server/api/resolve.get.ts`'s
cap), chunked and fetched in parallel if a page exceeds that. Returns
`{ refs }`, a `Map<string, NoteRef>` keyed by the exact trimmed name string a
component passed in. A name with no matching note — or in a chunk whose
request failed — is simply absent from the map; every component here falls
back to rendering plain, unlinked text in that case (see gotcha 2).

### `app/app/components/wiki/WikiEntityLink.vue`

Renders a `NuxtLink` tinted by `tintFor(refData.category)` when `refData` is
present, otherwise a plain `<span>{{ name }}</span>`. This is the shared
"resolved-or-plain-text" leaf used by `WikiTimeline`, `WikiRoster`, and
`OrgChartNode`. Lives in `components/wiki/` (not `components/content/`)
because it is never referenced directly from an MDC block — only from other
components.

### `app/app/components/wiki/OrgChartNode.vue`

The recursive node renderer behind `::wiki-org-chart` (see gotchas 3 and 4
above for why it lives where it does and how its `<table>` avoids the
page's prose table styling).

### `app/app/components/wiki/WikiTocRail.vue`

The sticky "On this page" navigation rail rendered by
`app/app/pages/wiki/[...slug].vue`, driven by `tocLinks`/`hasTocRail` above.
Not an MDC component — it's wired into the page template directly, not
referenced from note bodies.

### `app/app/composables/useVideoDock.ts`

The app-global video dock's shared state and behaviour, consumed by
`WikiWatch`, `WikiCue`, and `WikiVideoDock` (below). `useVideoDock()` reads
back the same `useState`-backed refs everywhere it's called — there is only
ever one dock — and returns:

| Field | Type | Notes |
|---|---|---|
| `videoId` | `Ref<string \| null>` | The currently loaded video's ID, or `null` |
| `title` | `Ref<string>` | The dock header title |
| `visible` | `Ref<boolean>` | Whether the dock is showing at all (closed vs. open) |
| `minimised` | `Ref<boolean>` | Open but collapsed to just the header bar |
| `rect` | `Ref<DockRect>` | `{ x, y, w, h }` — current position/size |
| `pendingSeek` | `Ref<number \| null>` | A queued seek not yet applied to the player; see below |
| `hydrate()` | `() => void` | Restores `rect`/`minimised` from `localStorage`, clamped to the live viewport. Called once, client-side, from `WikiVideoDock`'s `onMounted` |
| `open(opts)` | `(opts: { videoId, title?, at?: number }) => void` | Loads a video, shows the dock un-minimised, and optionally queues a seek |
| `close()` | `() => void` | Hides the dock, clears `videoId` and any pending seek |
| `toggleMinimise()` | `() => void` | Flips `minimised` and persists the new geometry |
| `seek(seconds)` | `(seconds: number) => void` | Queues a seek; also un-minimises/reopens the dock when a video is already loaded |
| `takePendingSeek()` | `() => number \| null` | Reads and atomically clears `pendingSeek` — the intended way for the player to consume it (see below) |

Two behaviours worth knowing when building on top of this:

- **Playback position is deliberately never persisted.** `persistDock(rect,
  minimised)` — called from `toggleMinimise()` and from `WikiVideoDock`'s
  drag/resize/nudge handlers — writes only `{ x, y, w, h, minimised }` to
  `localStorage` under the key `ufo:dock`. `videoId`, `title`,
  `pendingSeek`, and `visible` are never written. A page reload always comes
  back with the dock closed (remembering *where* it was, not *what was
  playing*) rather than silently resuming a video the reader may not have
  meant to keep loaded.
- **A restored rect is always re-clamped, so it can never reopen offscreen.**
  `hydrate()` merges whatever was stored over `DEFAULT_RECT` and immediately
  runs the result through `clampRect(rect, window.innerWidth,
  window.innerHeight)` before assigning it. This matters because geometry
  persists indefinitely across sessions and devices: a rect saved on a large
  display would otherwise come back off the edge of a smaller one, with no
  way to drag it back into view. `WikiVideoDock` re-runs `clampRect` again
  on every window resize (`syncViewport`), for the same reason mid-session.
  `clampRect` is exported and unit-tested standalone (pure, no DOM) —
  see `app/app/composables/useVideoDock.test.ts` if you need to reason about
  its edge cases (e.g. a degenerate zero-size viewport).
- **Pending-seek is a single-slot queue, last write wins.** A cue click
  before the YouTube IFrame API/player exists sets `pendingSeek`; the
  player's `onReady` callback consumes it via `takePendingSeek()`, which
  reads and nulls it in the same step so a re-firing watcher can't
  re-apply a stale value. A seek arriving after the player already exists is
  consumed the same way from a `watch(() => dock.pendingSeek.value, ...)` in
  `WikiVideoDock` instead.

### `app/app/components/wiki/WikiVideoDock.vue`

The draggable, resizable YouTube player itself. Mounted exactly once, in
`app/app/layouts/default.vue`, outside `<main>` — see gotcha 6 above for why
that placement is load-bearing rather than incidental. Not an MDC component;
nothing in note bodies references it directly.

Worth knowing if you're touching this component:

- Drag uses `@vueuse/core`'s `useDraggable` on the header bar; resize is a
  hand-rolled `pointerdown`/`pointermove`/`pointerup` listener pair on a
  corner grip, using pointer capture so a release outside the viewport still
  delivers `pointerup`. Both end by re-clamping and calling `persistDock`.
- Below a 900px viewport width the dock switches to a fixed, bottom-docked,
  full-width bar (`.is-mobile`) with dragging and resizing disabled — a
  draggable floating window fights the mobile shell's own drawer/overlay at
  that width.
- `Escape` closes the dock (`onKeydown` on the root element); arrow keys
  nudge it by 16px when the drag handle has focus (disabled on mobile).
- The YouTube IFrame API script is loaded lazily, once, only when a video is
  actually opened (`loadApi()`) — never on a cold page load that doesn't use
  the dock.
- The open/close and enter/leave transition is skipped under
  `prefers-reduced-motion: reduce`.
- See gotcha 5 above for the mount-node replacement issue this component
  works around (`.ufo-dock-stage`).

---

## Cue derivation (`scripts/derive_cues.py`)

Produces the `cues.json` sidecar that `cue`/`cueApprox` (see `::wiki-timeline`
above) are hand-merged from. Not run by the app at build or request time —
it's an offline, one-off-per-video step you run from a terminal.

```bash
python3 scripts/derive_cues.py \
  --video-id o4czWtSxGig \
  --chronology /path/to/chronology.json \
  --out "UAP Gerb Knowledge Base/Videos/<video folder>/cues.json"
```

| Flag | Required | Notes |
|---|---|---|
| `--video-id` | yes | The YouTube video ID (fetches its caption track via `youtube_transcript_api`, trying `en`/`en-US`/`en-GB`) |
| `--chronology` | yes | Path to a JSON array of `{ title, summary?, entities?, date }` rows — the same shape as the timeline's `events`, minus `category`/`significance`/`cue*` |
| `--out` | yes | Where to write `cues.json` |
| `--force` | no | Required to overwrite an existing `--out` file — see gotcha 9 above for why |

How it matches an entry to a timestamp: captions are split into rolling
45-second windows with 50% overlap (`WINDOW_SECONDS`, so a phrase can't fall
into a seam between windows). Each chronology row is reduced to a set of
"distinctive tokens" — capitalised words (minus a small stopword list) plus
any four-digit `18xx`/`19xx`/`20xx` year, pulled from its `title`, `summary`,
`entities`, and `date` — and matched against the same token extraction run
over every window. **`entities` is not run through that same extraction,
though:** each entity string is added as-is, lowercased whole, not split into
capitalised-word tokens. A single-word entity (`"Roswell"` → `"roswell"`)
still matches a window token fine, but a multi-word entity (`"David Grusch"`
→ `"david grusch"`) becomes one token containing a space, which can never
equal any of the single-word tokens extracted from a caption window — so a
cue relying solely on a multi-word entity to match will never score a hit.
Keep `title`/`summary` phrased so the distinguishing words appear there too;
don't rely on `entities` alone. The window with the highest `hit /
len(want)` overlap wins; a row that produces no tokens at all (e.g. no
title/summary/entities/year worth extracting) is skipped rather than
assigned an arbitrary window.
Output rows are `{ t: number, label: string, confidence: "low", match:
string }`, sorted ascending by `t`, where `label` is copied from the row's
`title` (this is the join key used when merging into a note's timeline YAML,
below) and `match` is up to 280 characters of the winning window's caption
text, kept so a human reviewer can see *why* it scored well without
re-fetching captions. **Every cue's `confidence` is `"low"`** — see gotcha 8
above.

## Authoring flow for a new video

End to end, from nothing to a page with a working dock and cued timeline:

1. **Write the chronology** — the `events:` list for `::wiki-timeline`
   (`date`, `title`, `summary`, `category`, `entities`, `significance`), as
   you would for any timeline page, but without `cue`/`cueApprox` yet.
2. **Derive candidate cues.** Save that same data (or a reduced
   `{title, summary, entities, date}` view of it) as a chronology JSON file,
   then run `scripts/derive_cues.py` against it (above) to produce
   `cues.json` next to the note.
3. **Hand-verify the important ones.** For each `significance: major` entry,
   find its cue in `cues.json`, then read the live caption text around that
   `t` (e.g. fetch a ±20/+60 second window with `youtube_transcript_api`
   directly) and confirm the video is actually discussing that event there.
   Correct `t` by hand for anything that's landed on the wrong moment, then
   set that cue's `"confidence": "high"`. Leave minor/notable cues as
   `"low"` unless you have reason to check them too. **Do not skip this** —
   see gotcha 8 above for what an unverified cue can get wrong.
4. **Merge cues into the timeline YAML.** For each timeline entry whose
   `title` matches a cue's `label`, add `cue: <t>` to that entry, plus
   `cueApprox: true` when the cue's `confidence` is `"low"`. Omit
   `cueApprox` entirely for a hand-verified (`"high"`) cue.
5. **Wire up the video on the block itself** — add `video="<id>"` (and
   `video-title="<title>"`) to the `::wiki-timeline` block's attributes, so
   the per-entry `WikiCue` chips actually render (the `video` prop gate —
   see the `::wiki-timeline` props table above).
6. **Add an entry point.** Drop a `::wiki-watch{video="<id>"
   title="<title>"}` block somewhere near the top of the note (e.g. right
   after a stat strip) — this is the only way to open the dock without
   first clicking a cue.

The pilot page is the worked example of all six steps:
`UAP Gerb Knowledge Base/Videos/80 Years of UFO Crash Retrieval and Reverse Engineering - A Timeline/summary.md`
alongside its `cues.json` in the same folder.

---

## Theming

The vault supports four themes, toggled via `data-theme` on the root
element: `light`, `dark`, `dim`, `sepia` (`app/app/assets/css/main.css`).
**Any colour a component uses must come from `hsl(var(--token))`, never a
literal hex or `rgb()` value** — that's what makes a component render
correctly across all four themes (and both light/dark in Obsidian, where
none of this MDC syntax renders at all — see below).

The category tint variables, defined per-theme in `main.css`:

- `--graph-cat-people`
- `--graph-cat-locations`
- `--graph-cat-orgs`
- `--graph-cat-mocs`
- `--graph-cat-events`
- `--graph-cat-ops`
- `--graph-cat-concepts`
- `--graph-cat-videos`

Use `tintFor()` / `timelineTintFor()` (above) rather than referencing these
variables by name directly — they already handle the fallback case for an
unresolved/unknown category.

When adding a new component, open every note that uses it under all four
themes before considering it done.

---

## Obsidian trade-off

These `::wiki-*` blocks are Nuxt Content **MDC syntax**, not something
Obsidian understands. Opening a note that contains one in Obsidian shows the
literal `::wiki-timeline`, the YAML, and the closing `::` as plain text in
reading view (fenced-looking, but not collapsed or rendered).

**This is a known, accepted trade-off, not a bug.** The alternative —
teaching Obsidian to render these blocks, e.g. via a custom plugin — is out
of scope for this project. Do not "fix" it by removing MDC blocks, wrapping
them in HTML comments, or otherwise trying to hide them from Obsidian; the
web app is the intended rendering target for this content, and Obsidian
remains fully usable for editing and graph-view navigation regardless.
