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
uses a `<table>` for layout (the org-chart connector geometry), and it solves this
by **repeating its own class** to raise specificity above the page's rule,
e.g. `.ufo-org-cell.ufo-org-cell { border: 0; padding: 0; }` — three
class-level selectors beats the page's two-class-plus-element rule outright.
No `!important`, and `[...slug].vue` is left untouched.

`WikiCompare.vue` renders a real data `<table>` but wants its own borders
and padding, not the page's, so it uses the same pattern
(`.ufo-cmp-cell.ufo-cmp-cell { border: 0; ... }`).

If you ever build another table-based component, use this same pattern
(repeat the component's own class on every rule that resets or re-applies a
border/padding/width on its `<table>`/`<td>`) rather than reaching for
`!important`.

The page's prose rules for `h3`, `h4`, `p`, `ul`, `ol` and `li` are scoped
to **classless** elements (`:deep(p:not([class]))` and so on): markdown
never carries a class, a component's own markup always should. Give every
heading, paragraph and list a component renders a class, or the page's
margins and type scale leak into it — that is exactly how the old timeline
grew list numbers ("1.", "2.") beside its cards.

### 4b. `position: sticky` only holds within its parent

The timeline's chronometer is a direct child of the timeline's root, not
wrapped in a `<div>` of its own: a sticky element stops sticking the moment
its parent scrolls out, so a wrapper only as tall as the bar gives it nothing
to stick inside. Same rule for anything else that pins: put it directly in
the element that spans the region it should stay visible over.

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

### 6b. A component inside a heading no longer pollutes its anchor

`## Chronology :wiki-info[…]` used to get an id slugged from the whole
heading, aside included (300+ characters). `app/wiki/toc.ts` now re-slugs
such headings from their own words (`#chronology`) at parse time, on the
heading node and the TOC link together, skipping any slug that would collide
with another heading. Plain headings keep exactly the id `@nuxt/content`
generated.

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

A chronology read as an instrument. Above the entries a **chronometer**
(`app/app/components/wiki/TimelineChronometer.vue`, auto-imported as
`WikiTimelineChronometer`) pins to the top of the scrolling `<main>` for the
whole block: the year under the reader's eye (interpolated as they scroll),
the era it belongs to, and — while the page's video is playing in the dock —
the entry Gerb is discussing, over a proportional **ruler** of the whole
span (era bands, one tick per entry coloured by category and sized by
significance, same-year clusters stacked into lanes, decade ticks, a white
reading cursor that glides, a green video playhead that snaps between cues).
Beneath it the entries stay vertical, grouped into the eras the video frames
(or decades when none are authored), beside a spine that fills in as the
reader passes each node.

Controls on the chronometer: click anywhere on the ruler (or a tick) to
scroll to the nearest entry; drag the reading cursor to scrub, and the page
scrolls continuously so the cursor stays under the pointer (this also turns
Follow off); the ruler is a keyboard `slider` (←/→ step,
PageUp/PageDown ±5, Home/End, Enter = Sync); **Sync** seeks the video to the
entry being read; **Follow** (only while the dock holds this page's video)
lets the video scroll the page to each entry as it is discussed, and switches
itself off the moment the reader scrolls; the filter button opens the
category / "Major only" chips in a popover; the (i) button shows `help`.

Props:

| Prop | Type | Default | Notes |
|---|---|---|---|
| `events` | `TimelineEvent[]` | `[]` | YAML body. See schema below |
| `eras` | `TimelineEra[]` | `[]` | YAML body. The video's own eras — bands on the ruler and chapter headings in the list. See schema below. With none, entries group by `eraSize`-year decades exactly as before |
| `hinges` | `{ year, label }[]` | `[]` | YAML body. Single labelled years drawn as dashed markers on the ruler (a turning point that opens no era) |
| `help` | `string` | `''` | YAML body. Plain-text "how to read this" copy behind the chronometer's (i) button. Prefer this over a `:wiki-info` in the `## Chronology` heading |
| `eraSize` | `number \| string` | `10` | YAML body. Decade-bucket size used only when `eras` is empty; invalid/non-positive values fall back to `10` |
| `video` | `string` | `''` | Attribute, e.g. `video="o4czWtSxGig"`. A YouTube video ID. Gates the per-entry cue chip, Sync, Follow and the playhead: a `WikiCue` only renders for an event when **both** `event.cue` is a number **and** this prop is set |
| `videoTitle` | `string` | `''` | Attribute, written kebab-case as `video-title`. The video's own title, e.g. for the dock header — **not** any one entry's own title. Forwarded to every rendered `WikiCue` as `video-title` |

`TimelineEra` schema (YAML body):

```yaml
eras:
  - id: golden               # optional key an event's `era:` can point at (falls back to label)
    label: "The Golden Era"  # required
    from: 1947               # required
    to: 1977                 # optional, inclusive; omit for "to the present"
    summary: "Unified, centralised control under an NSC control group."   # optional
    estimate: "Wilbert B. Smith and Robert Sarbacher, 1950"                 # optional
    anchor: "the-golden-era-1947-1978"   # optional heading id for a "Read the analysis" link
hinges:
  - year: 2023
    label: "Grusch testimony"
```

Era membership is by year (`eraOf`: the *last* era whose `from` is at or
before the event's year, so a boundary year belongs to the era that starts
there). Events before the first era form an automatic "Prologue" chapter,
events after a closed last era a "Coda", undated ones "Undated". An event can
force its chapter with `era: <id>` — the pilot uses this once, because both
1994 entries share a year while one closes the Cold War era and the other
opens the Modern one.

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
    era: golden               # optional — force this entry into the era with
                               # this `id`/`label` when its year is ambiguous
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
  maintain. A "Major only" toggle is always shown. Filters hide entries from
  the list but only *dim* their ticks on the ruler, so the shape of the whole
  span never changes; a dimmed tick is inert, and a ruler click lands on the
  nearest *visible* entry — filters are never cleared behind the reader's back.
- Ruler geometry is pure and server-rendered: `timeScale` snaps the axis to
  5-year edges around the earliest/latest event or era, `fractionalYear`
  places a tick by month, `assignLanes` stacks anything closer than ~1.6% of
  the axis. All of it lives in `app/app/utils/timeline.ts` with unit tests.
- "Now discussing" resolves in **cue order**, not date order (`nowPlayingIndex`:
  the entry with the greatest `cue` at or before the player's time). The
  pilot's host cross-cuts — the 2002 Northrop/TRW entry is cued inside the
  1953 Kingman segment — so the playhead is allowed to leap backwards on the
  axis. That is the video's structure, not a bug; do not "fix" it.
- Entry cards fade/rise in on first view (`v-reveal`), once: a filter change
  re-renders the list without re-hiding it.
- `date` formatting: `"1947-07-08"` → `"8 Jul 1947"`, `"1947-07"` →
  `"Jul 1947"`; anything else (including `"c. 1980s"` or `"Unknown"`) passes
  through unchanged.

### `::wiki-watch`

Source: `app/app/components/content/WikiWatch.vue`

A small call-to-action strip that opens the video dock, for use mid-article.
Every video **summary** page already gets a play button in its hero (see
`WikiVideoHero` under "Supporting utilities"), so this block is optional
there; it remains the entry point on any page whose frontmatter carries no
`video_id`.

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

Renders a nested, table-based org chart with connector lines. It is for
true hierarchies (command, reporting lines, ownership, compartments). A
linear or lightly branching sequence of hand-offs, consequences or
successors belongs in `::wiki-chain` instead.

Props:

| Prop | Type | Default | Notes |
|---|---|---|---|
| `root` | `OrgNode` | *(none — required for anything to render)* | Nothing renders if `root` is undefined |
| `caption` | `string` | `''` | Optional line under the chart. Also printed under the chart in the exported PNG and shown in the Expand dialog's header |

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

**Toolbar: Expand and Download.** The chart sits in the shared
`WikiDiagramFrame` (see "Supporting utilities"), which puts a small toolbar
at the top-right of the chart:

- **Expand** opens the chart in a near-fullscreen dialog, scaled down to fit
  the window (never enlarged, never below 40%; past that it scrolls, and a
  mouse can drag to pan). A `100%` / `Fit` toggle switches to actual size.
  Esc, the backdrop and the close button dismiss it; focus is trapped inside
  and returned to the Expand button. The button is hidden below 640px
  (`sm`), where the dialog would be no bigger than the page.
- **Download** is a split button. The main half saves a PNG. The arrow opens
  a menu with *Download image* and *View as image*. *View as image* opens
  the PNG in a new tab so an iPhone can long-press → Save to Photos rather
  than going through Files. The tab is opened synchronously in the click
  (popup-blocker safe) and filled with an `<img>` of a `data:` URL once the
  render finishes. If the popup is blocked it falls back to a download.

The PNG is rendered in whatever theme is live (every element's computed
style is inlined, so `hsl(var(--…))` colours, category surfaces and
connectors come out exactly as painted). It captures the whole chart even
when the page has it scrolled or clipped, at 2× (lower only for a chart so
big it would pass iOS's 16.7-megapixel canvas limit), on the page's own
backdrop colour, with the caption (if any) and a one-line footer: the
article title on the left, "UAP Gerb Knowledge Base" on the right. The file
name is `<article-title>--<root-name>-org-chart.png`.

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

**Portraits.** A person whose ref carries an `image` (see "People
portraits" below) gets their photo floated into the card's top-right
corner, 92×116px, cover-cropped toward the face and faded into the card
surface along its left and bottom edges with the shared `ufo-fade-xy` mask;
the text wraps beside it. Nothing to author: the portrait comes with the
name's ref. The image is lazy-loaded in a fixed box, its alt text is
"Portrait of {name}", and its tooltip is the credit line
(`portraitCredit`). Everyone else keeps the plain card. Because a portrait
changes how a card wraps, the grid stays invisible (`opacity: 0`, space
kept) until `useWikiResolve` reports `ready`, then fades in, so the reflow
never happens in front of the reader.

### `::wiki-compare`

Source: `app/app/components/content/WikiCompare.vue` (each value rendered by
`app/app/components/wiki/CompareCell.vue`, auto-imported as
`WikiCompareCell` — gotcha 3; normalisation in `app/app/utils/compare.ts`,
unit-tested in `compare.test.ts`)

A subjects-by-attributes comparison matrix: one column per subject (witness
accounts, craft, cases, programs), one row per attribute. Use it when a video
compares 2–5 subjects point by point, where a plain Markdown table would
otherwise go. It replaces that table; it doesn't sit beside one.

What it adds over a Markdown table:

- **Subject headers are entity links** resolved in one batch
  (`useWikiResolve`), each header tinted with its category surface and a
  full-strength 3px top rule. A subject with no page renders as plain text on
  a neutral header, which is fine for things like "Civilian eyewitnesses".
- **Agreement markers.** A cell can carry `same`, `differs`, `unknown` or
  `disputed`. Each renders as a badge with a glyph *and* its word ("Same",
  "Differs"…), never colour alone; `unknown` is also dashed. The markers
  actually used are listed in a legend under the matrix.
- **Cue chips**, on a whole row (where the video discusses that attribute)
  or on a single cell (where it discusses one subject's value). They reuse
  `WikiCue` and, as in `::wiki-timeline`, only render when the block has
  `video=` set.
- **No sideways scrolling.** Wide containers get a `<table>` with a sticky
  attribute column. Narrow ones pivot (by container query, so a narrow grid
  column counts too) into **one card per attribute**, listing each subject's
  value under it, with the subjects' notes shown once as a key above the
  cards. The pivot happens at 36rem for 2–3 subjects, 40rem for 4, 48rem
  for 5 and 56rem for 6 or more, which is before the table would need to
  scroll. (The proposal sketched one card per *subject*; per attribute keeps
  each comparison together, which is the point of the component.)

Props:

| Prop | Type | Default | Notes |
|---|---|---|---|
| `subjects` | `(string \| { name, note? })[]` | `[]` | YAML body. PLAIN page titles (gotchas 1/2). `note` is a short kicker under the name, e.g. the source and year. A subject with an empty name is dropped along with its column |
| `rows` | `Row[]` | `[]` | YAML body. See schema below. A row without `attribute` is dropped |
| `caption` | `string` | `''` | YAML body. Shown under the matrix and used as the table's accessible name |
| `attributeLabel` | `string` | `''` | YAML body. Small label over the attribute column, e.g. "Point" or "Feature" |
| `video` | `string` | `''` | Attribute. YouTube id; gates every cue chip |
| `videoTitle` | `string` | `''` | Attribute, written `video-title`. Forwarded to each `WikiCue` |

Nothing renders unless there is at least one subject and one row.

`Row` schema:

```yaml
rows:
  - attribute: "Size"          # required
    note: "as reported"        # optional small line under the attribute
    cue: 770                   # optional, the whole row's moment in the video
    cueApprox: true            # optional; omit for a hand-verified cue
    cells:                     # one per subject, in subject order
      - "99.9 ft disc"                          # bare text
      - { text: "99.9 ft disc", mark: same }    # text + marker
      - { text: "\"30-something\" ft", mark: differs, cue: 7929 }  # + cue
      - { mark: unknown }                        # marker alone
```

Rows are padded (a missing cell renders as "—", read as "Not stated") or
truncated to the subject count, so a short row never shifts columns.

Worked example (from the 1948 Aztec article):

```mdc
::wiki-compare{video="QJxbyu-9Tj0" video-title="The 1948 Aztec, New Mexico UFO Crash Retrieval"}
---
caption: "The four main versions of the recovery, point by point."
attributeLabel: "Detail"
subjects:
  - name: "Frank Scully"
    note: "With Silas Newton, 1950"
  - name: "William Steinman"
    note: "UFO Crash at Aztec, 1986"
  - "Civilian eyewitnesses"
rows:
  - attribute: "Size"
    cue: 770
    cells:
      - { text: "99.9 ft disc", mark: same }
      - { text: "99.9 ft disc", mark: same }
      - { text: "About 100 ft across", mark: same }
---
::
```

Authoring rules:

- **Markers must mean something.** Mark a cell only when the video (or the
  plain content of the row) makes the agreement or contradiction the point.
  A row where every cell would say "Differs" needs no markers at all: the
  Del Rio article's four points are all differences, so it uses row cues and
  no markers. `disputed` is for a value the video itself contests.
- **Cues follow the timeline's rule** (gotcha 8): a cue without `cueApprox`
  claims you read the captions at that second. Mark anything you didn't
  check with `cueApprox: true`.
- **Keep cells short.** A cell is a value, not a paragraph; put the argument
  in the prose around the block.
- **Not for sparse membership grids** (e.g. thirteen officials by six
  offices, mostly blank): that is a lookup table, and a `::wiki-figure`
  around a Markdown table still serves it better.

### `::wiki-chain`

Source: `app/app/components/content/WikiChain.vue` (each run of steps rendered
by `app/app/components/wiki/ChainSequence.vue`, auto-imported as
`WikiChainSequence` and recursive for forks — gotcha 3; normalisation in
`app/app/utils/chain.ts`, unit-tested in `chain.test.ts`)

A sequence of hand-offs: numbered step cards down one vertical spine, each
connector carrying a short label. Use it for a **chain of custody** (the
object moved from A to B to C), a **chain of consequence** (X led to Y led to
Z), a **chain of transmission** (how an account travelled from witness to
print), or a **lineage** (an agency succeeded by the next). These used to be
drawn with `::wiki-org-chart`, which implies a command hierarchy that isn't
there, has no labels on its links, and nests ever deeper as a chain gets
longer. Keep `::wiki-org-chart` for true hierarchies: chains of command,
ownership trees, program compartments, and trees that fan out widely (the
Sarbacher article's four independent lines of transmission, each branching
again, stay a tree).

How to read it (the layout is the same at every width):

- **One spine, top to bottom.** Every step is a numbered node (1, 2, 3...) on
  a single continuous line, its card beside it. The line only ever goes
  down, so a step always comes from the node directly above it. A sequence is
  never wrapped into rows (the old side-to-side layout did, and readers took
  the rows for a grid in which one row came from another).
- **The hand-off is written on the connector.** The words between two nodes
  are that link's `via:`, with an arrowhead into the later step. A link with
  no `via` shows the kind's verb in plain, quieter type ("moved to", "led
  to", "passed to"), so every link still reads as a sentence.
- **Forks are explicit junctions.** A diamond on the spine says where the
  line divides and from which step: "From 2, splits into 2 branches", with
  the fork's `via` under it. Each branch is a bounded lane headed by its
  letter and label ("A · Fragments"), and its steps are numbered after the
  letter (A1, A2; a fork nested in branch B gives lanes Ba, Bb and steps
  Ba1...). Letters keep counting across the forks of one run, so no label
  repeats. A fork that opens the chain says "Starts as N parallel branches".
- **Rejoins are explicit too.** When the chain continues after a fork, a
  second diamond names what comes back and where: "Branches A–C rejoin at 2"
  ("converge" when the branches opened the chain). When nothing follows, the
  branches simply end in their lanes.
- **Lanes sit side by side only when all of them fit on one row** (two from
  a 30rem container, three from 42rem, four from 56rem, measured on the
  figure or, for a nested fork, on its lane): a bus drops from the junction
  into every lane and, on a rejoin, a matching bus gathers them back. Five or
  more lanes, or any that don't fit, stack: indented off the spine, which
  runs down their left edge as a rail with an elbow into each lane (and back
  out of each, on a rejoin). Lanes never wrap into a second row.

What else it renders:

- **Step cards.** Identical on the spine and in a lane. A `name:` step is an
  entity link resolved in one batch (`useWikiResolve`), its card tinted with
  the category surface plus a 3px category spine, like `::wiki-roster`. A
  `text:` step is an abstract stage with no page ("Army flatbed truck", "A
  1990s Pentagon audit"): a neutral card with a dashed border. Each card can
  carry a date kicker, a one-line note and a cue chip (`WikiCue`, only when
  the block has `video=`).
- **Kind.** `kind` sets the kicker over the chain ("Chain of custody",
  "Chain of consequence", "Chain of transmission") and the default verb.
  `transmission` draws every line dashed (word of mouth); the others solid.
  `label` overrides the kicker, e.g. "Lineage" or "Chain of ownership".
- **Accessibility.** The chain is an `<ol>` named by its kicker (and
  caption); a fork is a `<ul>` named by its junction wording ("From 2,
  splits into 2 branches"), each branch its own `<ol>` named "Branch A:
  Fragments". Connector labels, node numbers and junction wording are all
  real text; the lines, arrowheads and diamonds are decoration. Nothing
  animates, so there is nothing to switch off for reduced motion. Theme
  tokens only (lines are `--muted-foreground`), so all four themes work.

Props:

| Prop | Type | Default | Notes |
|---|---|---|---|
| `kind` | `string` | `'custody'` | YAML body. `custody` \| `consequence` \| `transmission`; anything else falls back to `custody` |
| `label` | `string` | `''` | YAML body. Replaces the kind's kicker text |
| `steps` | `Step[]` | `[]` | YAML body. See schema below |
| `caption` | `string` | `''` | YAML body. Shown under the chain; also folded into the list's accessible name |
| `video` | `string` | `''` | Attribute. YouTube id; gates every cue chip |
| `videoTitle` | `string` | `''` | Attribute, written `video-title`. Forwarded to each `WikiCue` |

Nothing renders if no step survives normalisation.

`Step` schema:

```yaml
steps:
  - name: "Kecksburg, Pennsylvania"   # PLAIN page title (gotchas 1/2), resolved to a link
    date: "1965-12-09"                 # optional; formatted like the timeline's ("9 Dec 1965"),
                                       # free strings ("1961–1992") pass through
    note: "Impact at about 4:45 p.m."  # optional one-liner
    cue: 177                           # optional, seconds into `video`
    cueApprox: true                    # optional; omit for a hand-verified cue
  - via: "Hauled out under a tarp"     # label on the connector INTO this step
    text: "Army flatbed truck"         # plain stage, never resolved (use instead of name)
  - via: "Split after the crash"       # shown under the fork's split junction
    fork:                              # two or more branches
      - label: "Fragments"             # optional lane label (the lane letter is automatic)
        steps:
          - name: "Wright-Patterson Air Force Base"
      - - text: "Destroyed"            # a branch may also be a bare list of steps
  - via: "Both recorded in"            # a step after a fork = the branches rejoin here
    text: "Blue Book file"
```

Normalisation (`buildChain`): a step with neither `name` nor `text` is
dropped; a fork keeps only branches with steps, and one left with a single
branch is flattened into the chain in its place (its first step inheriting
the fork's `via`); forks nested more than three deep are dropped. Then
`numberChain` assigns the node and lane labels, and `splitText` / `joinText`
word the junctions (all unit-tested).

Worked example (from the 1965 Kecksburg article):

```mdc
::wiki-chain{video="rgBTMzFd-hg" video-title="The 1965 Kecksburg, Pennsylvania UFO Crash"}
---
kind: custody
caption: "Where witnesses say the object and its fragments went after the crash."
steps:
  - name: "Kecksburg, Pennsylvania"
    date: "9 Dec 1965"
    cue: 177
  - via: "Split after the crash"
    fork:
      - label: "Fragments"
        steps:
          - via: "Sent on by Project Blue Book"
            name: "Wright-Patterson Air Force Base"
            cue: 1675
      - label: "The object"
        steps:
          - via: "Hauled out under a tarp, early 10 Dec"
            text: "Army flatbed truck"
            cue: 1494
          - via: "Backed into a hangar, morning of 10 Dec"
            name: "Lockbourne Air Force Base, Columbus, Ohio"
            cue: 3126
---
::
```

Authoring rules:

- **A chain earns its place** at about four steps or more, or any fork.
  Two or three hand-offs read better as a sentence.
- **Read forward.** When Gerb traces a lineage backward (DTRA back to
  AFSWP), the chain still runs oldest to newest; say so in the caption.
- **`via` is the hand-off, `note` is the why.** Keep both to a line. The
  argument belongs in the prose around the block.
- **Don't number steps yourself** or refer to "the second row": the nodes
  are numbered for you (1, 2; A1, B2), and prose can cite those labels.
- **Label every lane** when a fork has more than two branches, so the lane
  headers carry meaning beyond their letters. A fork's `via` is the reason
  for the split; leave it off rather than repeating "splits into".
- **A fork's first steps hang off the lane header**, so a first step with no
  `via` draws a bare connector (no default verb): the lane label or the
  fork's `via` already says how it got there.
- **Use `text:` for abstract stages**, not an invented page title; use
  `name:` only when a page exists (check it resolves, gotcha 2).
- **Cues follow the timeline's rule** (gotcha 8): a cue without `cueApprox`
  claims you read the captions at that second.

### `::wiki-claim`

Source: `app/app/components/content/WikiClaim.vue` (normalisation in
`app/app/utils/claim.ts`, unit-tested in `claim.test.ts`)

A claim and the attributed responses to it. Use it where a video weighs a
claim against challenges and replies: an official finding and the witness's
answer, a critic's charge and Gerb's rebuttal, a trial's prosecution and
defence, a list of objections and replies, or competing explanations that
each have a proponent and answers. The vault's rule is "attribute, don't
debunk", so the component's job is to keep **who said what** attached to
every point. It replaces the paired `::wiki-panel`s (for / against,
objection / reply) that used to carry these, which had no slot for a speaker
or a stance and lost track of which reply answered which claim once they
stacked on a phone.

What it renders:

- **Claim cards.** Each claim names who made it (`by`, entity links resolved
  in one batch through `useWikiResolve`; a name with no page is plain text),
  with an optional date, where it was made (a book, a hearing, a forum), a
  one-line note on the claimant, a short title and a cue chip. The card is
  tinted by the first claimant's category, with a 3px spine, like
  `::wiki-chain`'s step cards. A small tag labels it ("Claim", or the `term`
  you set: "Objection", "Explanation", "Charge").
- **Responses** hang under their claim from a thread line, so a reply always
  sits with the claim it answers. Each names its speaker and carries a
  **stance tag**: `supports`, `challenges`, `host` (rendered "Gerb's view")
  or `unresolved`. The tag is a word plus a glyph (plus, minus, microphone,
  question mark), never colour alone; tone (green, blue, purple, dashed grey)
  only reinforces it, on the tag's border and on the response's spine. Every
  tone was measured at 3:1 or better against `--card` in all four themes.
  Stance is optional: a response with none shows just its speaker.
- **Several claims per block** (`claims:`), each grouped with its own
  responses and numbered on its tag ("Objection 3"), separated by a hairline.
- **Layout.** One column at every width. Below a 26rem container (a phone,
  or a narrow grid column) the replies' indent tightens; nothing scrolls
  sideways.
- **Accessibility.** The claims are an `<ol>` named by the kicker and
  caption; each claim's responses are a `<ul>` named "Responses to
  <title>". A cue's accessible name says whose point it jumps to
  ("Challenges: Michael Herrera"). Nothing animates.

Props:

| Prop | Type | Default | Notes |
|---|---|---|---|
| `claim` | `Claim` | *(none)* | YAML body. A single claim (shorthand). Ignored when `claims` has entries |
| `responses` | `Response[]` | `[]` | YAML body. Responses to the single `claim`; wins over a `responses` list nested inside it |
| `claims` | `Claim[]` | `[]` | YAML body. Several claims, each with its own nested `responses` |
| `label` | `string` | `''` | YAML body. Replaces the kicker ("Claim and response", or "Claims and responses" for several) |
| `term` | `string` | `''` | YAML body. The word on each claim's tag; defaults to "Claim" |
| `caption` | `string` | `''` | YAML body. Shown under the block; also folded into the list's accessible name |
| `video` | `string` | `''` | Attribute. YouTube id; gates every cue chip |
| `videoTitle` | `string` | `''` | Attribute, written `video-title`. Forwarded to each `WikiCue` |

Nothing renders if no claim survives normalisation.

`Claim` and `Response` schema:

```yaml
claims:
  - title: "Never on the NSC"          # optional short heading
    by: "Stanton Friedman"             # PLAIN page title(s) (gotchas 1/2), or plain text;
                                       # a list for several speakers: ["A", "B"]
    date: "1997"                       # optional; formatted like the timeline's
    where: "The Eisenhower Library"    # optional: the book, hearing or forum
    note: "Critic since the 1990s"     # optional one-liner on the claimant
    text: "Corso never attended an NSC meeting."   # required
    cue: 4442                          # optional, seconds into `video`
    cueApprox: true                    # optional; omit for a hand-verified cue
    responses:
      - by: "Gerb"                 # speaker (optional)
        stance: challenges             # supports | challenges | host | unresolved
                                       # (also accepted: for, against, host's view, gerb, gerb's view, open)
        date: "2014-07"                # optional
        text: "The 1992 Senate report lists him as NSC staff."   # required
        cue: 510
        cueApprox: true
```

Normalisation (`buildClaims`): a claim or response with no `text` is
dropped; `by` is trimmed and deduplicated; an unknown stance becomes no
stance rather than a guess; cues follow the same rules as the timeline's.

Worked example (from the Michael Herrera article):

```mdc
::wiki-claim{video="4EMO38JUfVE" video-title="Michael Herrera - Insights into UAP Encounter and Black Program Insiders"}
---
caption: "The two challenges to Herrera's account that the interview takes up."
claims:
  - title: "What AARO wrote"
    by: "AARO"
    where: "AARO Historical Report Volume 1"
    text: "A former service member saw US Special Forces loading containers onto an extraterrestrial spacecraft."
    cue: 4538
    responses:
      - by: "Michael Herrera"
        stance: challenges
        text: "\"I didn't say extraterrestrial and I didn't say they were US Special Forces.\""
        cue: 4547
---
::
```

Authoring rules:

- **Only for real claim-and-response.** A claim needs someone who made it and
  at least one attributed answer, or it belongs to a set of competing
  explanations where the others are answered. Genuinely parallel panels
  (four witness accounts, two hypotheses nobody answers, two sources that
  simply disagree on a fact) stay as `::wiki-grid` panels or become a
  `::wiki-compare`.
- **Name the speaker every time.** Use the page title when there is one. When
  Gerb rebuts a point, write `by: "Gerb"` with `stance: challenges`
  (or `supports`); keep `stance: host` for his own reading or leaning where
  it is neither for nor against, and `unresolved` where he, or anyone, leaves
  it open. A group with no page ("Sceptics of the manual", "Eyewitnesses") is
  fine as plain text.
- **Stances describe the response's relation to the claim**, not whether the
  vault agrees with it. Never add a response the video doesn't make.
- **Keep text short.** A claim or reply is a sentence or three; the argument
  and the context go in the prose around the block, with the wikilinks.
- **Cues follow the timeline's rule** (gotcha 8): a cue without `cueApprox`
  claims you read the captions at that second.

### `::wiki-map`

Source: `app/app/components/content/WikiMap.vue` (normalisation, framing,
pin spreading, label placement and outline decoding in `app/app/utils/map.ts`,
unit-tested in `map.test.ts`; outline data built by
`app/scripts/build-map-outlines.mjs`)

Where a story happens: numbered pins on a static outline map, optional route
lines between them, and a numbered legend under the map that repeats
everything the map shows as text. Use it when geography is part of the
argument: a route (an object's custody, a recovery flight, a reported
course), a cluster of sites (a valley's alleged network), or places whose
relative position the video leans on (two crash sites on either side of a
town, candidate bases at different distances). A single place, or places
the video merely lists, stay in prose.

What it renders:

- **An outline map, fitted to the pins.** Country outlines are Natural Earth
  (public domain): 1:50m for the Americas and the United States, 1:110m
  elsewhere, with Natural Earth's 1:50m lakes and the 1:10m borders between
  US states drawn over them. They ship with the site as two small files in
  `app/public/geo/` (about 120 KB gzipped together), fetched once per page
  load and only by a page that has a map. **No tile server and no
  third-party request.** Projection is d3-geo: an azimuthal equal-area
  projection centred on the pins for a regional map, Equal Earth for a world
  map. A regional map labels the countries in view in quiet capitals and
  carries a scale bar in miles (with km).
- **Numbered pins.** A pin that names a page is solid and clicking it opens
  the page; a place with no page (`text:`) is a hollow, dashed pin, as
  `::wiki-chain` dashes a stage with no page. Pins that would overlap are
  nudged apart, with a leader line and a small dot at the true location. An
  optional short `label` is drawn beside the pin, on whichever side is clear.
  An optional `radius` (miles) draws a dashed circle around the pin (a search
  area, "within 7.5 miles of the lake bed").
- **Routes.** Lines joining pins in order, with a direction arrow on each
  leg that has room. `style: dashed` for anything reported, alleged or
  reconstructed. Lines are straight between the places: a route is a
  sequence, never a surveyed track, and the caption should say so.
- **The legend.** An ordered list, one row per pin: its number (same style
  as the pin), the entity link, date, radius, note and cue chip. Under it,
  each route as a line swatch, its stops ("1 → 2 → 3") and its label. A pin
  with no coordinates is still listed, marked "Not on the map". Hovering a
  legend row highlights its pin, and hovering a pin highlights its row.
- **Layout.** The SVG is drawn at the real pixel width of its column
  (measured), so pins and type keep their size on a phone. Its height
  follows the frame's shape, clamped between letterbox and portrait. The
  legend is two columns from a 36rem container, one below. Nothing scrolls
  sideways.
- **Accessibility.** The SVG is `role="img"` with a summary ("Map with 5
  numbered places and 2 routes: 1, Fort Bliss; …"); pins are not focusable,
  because the legend carries the same links and cues. Each route's stops are
  spelled out for screen readers ("Route: Fort Bliss, then Presidio…"). The
  outline fade-in and hover transitions are off under reduced motion.
- **Theming.** Water is `--card`, land a wash of `--muted-foreground`,
  borders softened `--muted-foreground`, routes and circles `--primary`,
  pins `--foreground` with `--background` numerals. Tokens only.

Props:

| Prop | Type | Default | Notes |
|---|---|---|---|
| `pins` | `(string \| Pin)[]` | `[]` | YAML body. A bare string is a page title. See schema below |
| `routes` | `(number[] \| Route)[]` | `[]` | YAML body. See schema below |
| `region` | `string` | `'auto'` | YAML body. `auto` fits the pins (and any circles); `us` shows the contiguous United States, widened to take in any pin outside it; `world` shows the whole world. `auto` also switches to a world map when the pins span more than 100° of longitude or 60° of latitude |
| `label` | `string` | `''` | YAML body. Replaces the "Map" kicker |
| `caption` | `string` | `''` | YAML body. Shown under the legend, followed by the outline credit; also names the legend list |
| `video` | `string` | `''` | Attribute. YouTube id; gates every cue chip |
| `videoTitle` | `string` | `''` | Attribute, written `video-title`. Forwarded to each `WikiCue` |

Nothing renders without at least one pin. With pins but no coordinates for
any of them, the legend renders alone.

`Pin` and `Route` schema:

```yaml
pins:
  - "Fort Bliss"                       # bare page title: placed from its coordinates
  - name: "Coyame, Chihuahua, Mexico"  # PLAIN page title (gotchas 1/2)
    label: "Coyame"                    # optional short label beside the pin
    date: "27 Aug 1974"                # optional; formatted like the timeline's
    note: "Over the convoy at 1653."   # optional one-liner in the legend
    cue: 385                           # optional, seconds into `video`
    cueApprox: true                    # optional; omit for a hand-verified cue
    radius: 90                         # optional, miles: a dashed circle
  - text: "Presidio, Texas"            # a place with no page: never resolved,
    coordinates: [29.5614, -104.3664]  # so it needs [lat, lon] here
  - name: "R2508 Complex"              # coordinates on a named pin override the
    coordinates: [34.9045, -116.9497]  # page's (a point within a larger place)
routes:
  - [1, 2, 3]                          # stops by pin number, as shown (1-based)
  - path: [3, "Valentine, Texas", 5]   # or by a pin's name or label
    label: "Back with the disc"        # shown in the legend
    style: dashed                      # reported, alleged or reconstructed
  - { from: 1, to: 4 }                 # two-stop shorthand
```

Normalisation (`buildMap`): a pin with neither `name` nor `text` is dropped
and the rest are numbered in order; `coordinates` must be a valid
`[lat, lon]` pair and `radius` a positive number of miles up to 1,500, or
they are ignored; a route stop that matches no pin is skipped, a repeated
stop collapses, and a route left with fewer than two stops is dropped.

**Where coordinates come from.** A Location page carries its own
`coordinates: [lat, lon]` frontmatter (decimal degrees, WGS 84, latitude
first):

```yaml
---
name: "Kecksburg, Pennsylvania"
coordinates: [40.1847, -79.4608]
tags:
  - location
---
```

The build bakes every note's coordinates (`wiki/geo.ts` parses them; the
bake stores them sparsely by node), and `/api/resolve` adds a `coordinates`
field to the ref of any note that has them, so a pin needs only the page
title. Refs of notes without coordinates are unchanged. The page's fact
table shows the coordinates too. **Only add coordinates you have checked
online** (Wikipedia or Wikidata's coordinate for the place, or a cited
description of a facility's position), and put the place itself, not the
nearest city, on a facility's page. For a place with no page, or a
non-Location page (an organisation), write `coordinates` on the pin
instead. Coordinates the video implies ("44.5 miles north-west of Emerson
Dry Lake") may be computed from a checked point, but say so in the note or
caption.

Worked example (from the 1974 Coyame article):

```mdc
::wiki-map{video="bL3tMByq_WM" video-title="The 1974 Coyame, Mexico UFO Crash"}
---
caption: "The recovery flight as the Denb Report describes it. The lines join the places the report names; it gives no exact flight paths."
pins:
  - name: "Fort Bliss"
    label: "Fort Bliss"
    note: "The team and four unmarked helicopters were staged here by 2100."
  - text: "Presidio, Texas"
    label: "Presidio"
    coordinates: [29.5614, -104.3664]
  - name: "Coyame, Chihuahua, Mexico"
    label: "Coyame"
    cue: 385
routes:
  - path: [1, 2, 3]
    label: "Outbound, 27 Aug: along the border, crossing north of Candelaria"
---
::
```

Authoring rules:

- **A map earns its place** when position carries the argument: a route of
  three or more stops, a cluster, or places compared by distance or side.
  Everything on it must still be in the prose or the legend.
- **Keep the frame tight.** One far-off pin shrinks everything else to a
  cluster. Leave it off and name it in the caption ("lies far to the east,
  off this map") rather than squeezing the places that matter.
- **Lines are sequences, not tracks.** Say in the caption that lines join
  named places; dash anything alleged or reconstructed; never draw a route
  the video doesn't describe.
- **Labels are short** (a town, "Edwards AFB"); the full title is in the
  legend. Skip `label` on a crowded map rather than let labels collide.
- **Nothing sensitive.** Don't pin a location the video itself asks viewers
  not to seek out (the Dugway article's alleged tunnel entrance stays
  unmapped).
- **Cues follow the timeline's rule** (gotcha 8).

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
back to rendering plain, unlinked text in that case (see gotcha 2). A note
with `coordinates:` frontmatter also comes back with
`coordinates: [lat, lon]` on its ref (baked from `wiki/geo.ts` and added by
`server/utils/resolveNames.ts`); every other ref has no such key. Likewise a
People note with a portrait comes back with `image: NotePortrait`
(`{ src, width, height, author, license, licenseUrl?, source }`, baked from
`wiki/people-images.json` by `wiki/portraits.ts`); see "People portraits".

It also returns `ready`, a computed that turns true once the lookup has
finished (or failed). Existing callers that only destructure `refs` are
unaffected; `WikiRoster` uses `ready` to hold its cards back until their
layout is final.

### `app/app/components/wiki/WikiEntityLink.vue`

Renders a `NuxtLink` tinted by `tintFor(refData.category)` when `refData` is
present, otherwise a plain `<span>{{ name }}</span>`. This is the shared
"resolved-or-plain-text" leaf used by `WikiTimeline`, `WikiRoster`,
`OrgChartNode`, `WikiCompare`, `WikiChain`, `WikiClaim` and `WikiMap`. Lives in `components/wiki/` (not `components/content/`)
because it is never referenced directly from an MDC block — only from other
components.

### `app/app/components/wiki/OrgChartNode.vue`

The recursive node renderer behind `::wiki-org-chart` (see gotchas 3 and 4
above for why it lives where it does and how its `<table>` avoids the
page's prose table styling).

### Diagram controls: `app/app/components/wiki/DiagramFrame.vue`, `DiagramToolbar.vue`, `DiagramDialog.vue`

The reusable Expand + Download controls, used today only by
`::wiki-org-chart`. Auto-imported as `WikiDiagramFrame`,
`WikiDiagramToolbar` and `WikiDiagramDialog` (gotcha 3). To give another
diagram the same controls, wrap it:

```vue
<WikiDiagramFrame :label="`${name} org chart`" kind="org chart" :caption="caption">
  <MyDiagram ... />
</WikiDiagramFrame>
```

`label` is the dialog title and the second part of the file name. `kind`
goes into the buttons' accessible names ("Expand org chart"). The default
slot is rendered **twice**, inline and again inside the dialog, so the
diagram must be a pure function of its props. The PNG is always taken from
the inline copy's `.ufo-diagram-sheet` (`width: max-content`), which holds
the diagram at its natural size however the page scrolls it. Any element
marked `data-export-ignore` is left out of the image.

`DiagramToolbar.vue` is stateless (props `label`, `expandable`, `busy`;
emits `expand`, `download`, `view`). Its buttons copy the timeline
chronometer's small-control look (26px, mono caps, hairline border,
primary icon). The split button's menu is the shared `DropdownMenu`, so it
is keyboard operable (Enter/Space/arrows/Esc).

### `app/app/composables/useDiagramExport.ts`

`useDiagramExport({ target, title, label, caption })` returns `{ busy,
error, fileName, download, view }`. Rendering uses
[`modern-screenshot`](https://github.com/qq15725/modern-screenshot)
(zero dependencies, ~27 KB minified / ~10 KB gzipped). It is loaded with a
dynamic `import()` on the first click, so it adds nothing to page load. It
clones the node with computed styles inlined, and it embeds the web fonts
(including the Google Fonts `@import` in `main.css`) as data URLs, so the
canvas is never tainted. The composable then draws that onto a second
canvas with the backdrop, padding, caption and footer, using canvas text
in the theme's own fonts and colours. `view()` must be called directly
from the click handler; see the org-chart notes above.

### `app/app/utils/diagramExport.ts`

The pure helpers behind the export and the dialog, unit-tested in
`diagramExport.test.ts`: `exportFileName()` (slugged, de-duplicated parts
joined with `--` and capped at 120 characters), `wrapLines()` (caption word
wrap), `isTransparentColor()` (finding the backdrop colour) and
`fitScale()` (the dialog's fit-to-window scale with its 40% floor).

### `app/app/components/wiki/CompareCell.vue`

Renders one `::wiki-compare` value (text, marker badge, cue chip, or "—"
for an empty cell), shared by the table and the card layout so the two can't
drift. With only `mark` set it renders just the badge, which the legend
uses. Auto-imported as `WikiCompareCell` (gotcha 3).

### `app/app/utils/compare.ts`

`buildCompare(subjects, rows)` normalises the loosely typed YAML into a
rectangular `{ subjects, rows, marks }` model: trims text, validates markers
and cues, drops nameless subjects with their column, pads or truncates each
row to the subject count, and lists the markers used (for the legend).
`COMPARE_MARK_LABEL` / `COMPARE_MARK_HINT` hold each marker's word and
one-line meaning.

### `app/app/components/wiki/ChainSequence.vue`

Renders one ordered run of `::wiki-chain` items (an `<ol>`), and recursively
a nested run for each branch of a fork. It owns all of the chain's layout
CSS, driven by `@container chain` queries against the `<figure>`
`WikiChain.vue` declares and against each branch lane, which is a `chain`
container too. Auto-imported as `WikiChainSequence` (gotcha 3).

### `app/app/utils/chain.ts`

`buildChain(kind, steps)` normalises the YAML into `{ kind, items, names }`:
steps and forks with trimmed text, formatted dates (`formatDate` from
`timeline.ts`), validated cues, single-branch forks flattened, a depth cap
(`MAX_CHAIN_DEPTH`), and the list of resolvable names for one batched
resolve. `CHAIN_KIND_LABEL` / `CHAIN_KIND_VERB` hold each kind's kicker and
screen-reader verb.

### `app/app/utils/claim.ts`

`buildClaims(claim, responses, claims)` normalises `::wiki-claim`'s YAML
into `{ claims, names }`: the single-claim shorthand or the `claims` list,
trimmed text, speakers as deduplicated lists, stances validated through
`normalizeStance` (with aliases such as `against` and `host's view`),
formatted dates and validated cues, plus every speaker name for one batched
resolve. `CLAIM_STANCE_LABEL` / `CLAIM_STANCE_HINT` hold each stance's word
and one-line meaning; `joinSpeakers` builds "A, B and C" for accessible
names.

### `app/app/utils/map.ts`

`buildMap(pins, routes)` normalises `::wiki-map`'s YAML into
`{ pins, routes, names }` (numbered pins, routes as pin indexes, resolvable
names for one batched resolve). Beside it: `placePins` (a pin's own
coordinates, else its page's), `mapFrame` (what to fit: the pins with a
minimum span of `MIN_FRAME_SPAN` degrees and 20% padding, the US, or the
world), `radiusPoints`, `boundsOutline` (edge samples for fitting a curved
projection), `spreadPins` (deterministic nudging of overlapping pins),
`placeLabels` (greedy right / left / top / bottom label placement),
`niceLength` (scale-bar lengths) and `decodeOutline` (the outline files'
delta-encoded rings and lines to GeoJSON). None of it touches d3 or the
DOM.

### `app/scripts/build-map-outlines.mjs` and `app/public/geo/`

Builds `public/geo/world.json` (countries and lakes) and
`public/geo/us-states.json` (the lines between US states) from Natural
Earth via the `world-atlas` and `us-atlas` devDependencies, plus Natural
Earth's 1:50m lakes (downloaded once from the pinned v5.1.2 release into
`scripts/.cache/`). Run `node scripts/build-map-outlines.mjs` from `app/`
only to change the outlines; the output is committed. Coordinates are
snapped to a grid and delta-encoded, and a polygon whose snapped winding
would flood the map is dropped.

### `app/app/components/wiki/WikiTocRail.vue`

The sticky "On this page" navigation rail rendered by
`app/app/pages/wiki/[...slug].vue`, driven by `tocLinks`/`hasTocRail` above.
Not an MDC component — it's wired into the page template directly, not
referenced from note bodies.

### `app/app/components/wiki/WikiVideoHero.vue`

The title card rendered by `app/app/pages/wiki/[...slug].vue` on every video
**summary** note (any `Videos/*/summary` with a `video_id`), in place of the
plain breadcrumb/badges/H1/lead/fact table. Behind the title sits the
video's YouTube thumbnail (`maxresdefault`, falling back to `hqdefault`,
dropped if neither loads), set to the right of the text with an eased left
edge and faded into the page along the bottom; the text is set on a
page-colour panel that hangs off the text column itself
(`.ufo-hero-content::before`), so the fade sits just past the column's real
right edge in both page layouts (left-set under the TOC rail, centred below
`xl`) rather than at a fixed fraction of the hero. That panel keeps the
title off the thumbnail, whose own large text would otherwise fight it. On
phones the thumbnail is a band above the text instead. Then HUD frame
corners, a HUD row (runtime, when known) and Play / Transcript / YouTube
actions. On those pages the local map moves to the end of the article, the
prose `h2`s gain chapter numbers (CSS counters), and a 2px reading-progress
line (`WikiReadingProgress.vue`) pins to the top of `<main>`. Transcript
pages stay plain. The thumbnail's fades are the shared `ufo-fade` mask
(below): `--ufo-fade-x` toward the text on desktop, `--ufo-fade-y` down the
band on phones.

### Eased image fades: `ufo-fade` (`app/app/assets/css/main.css`)

One technique for every picture that dissolves into what's behind it: the
video hero's thumbnail, the home page's Featured card
(`components/home/HomeFeatured.vue`) and people's portraits. It is a
**mask**, not a colour overlay, so the image fades to transparent and melts
into whatever surface is behind it (page, card, a category-tinted roster
card, a hover wash) in all four themes with no colour to keep in step. The
stops trace an ease-in-out ("scrim") curve instead of a two-stop linear
ramp, whose abrupt ends read as edges.

- Add `ufo-fade` to the `<img>`; it defines two masks as custom properties:
  `--ufo-fade-x` (solid up to `--ufo-fade-x-start`, default `40%`, along
  `--ufo-fade-x-dir`, default `to left`: solid on the right, fading toward
  the left edge) and `--ufo-fade-y` (the same with `--ufo-fade-y-start`,
  default `30%`, and `--ufo-fade-y-dir`, default `to bottom`).
- Apply one with `ufo-fade-x`, `ufo-fade-y`, or `ufo-fade-xy` (both,
  fading into the bottom-left corner), or set
  `mask-image: var(--ufo-fade-x)` in the component's own CSS when it
  switches axis at a breakpoint (the hero and the Featured card do).
- Override the `-start` / `-dir` properties on the same element. The rules
  live in `@layer components`, so a component's scoped (unlayered) CSS
  always wins without specificity games.
- The longer the run, the smoother it reads: give the fade most of the
  image. Where text sits beside the picture, do what the hero does and put
  the text on a surface-colour panel whose own fade overlaps the image's
  (`.ufo-hero-content::before`; `.ufo-featured-content::before` in the
  Featured card): the two eased ramps multiply into one long, soft edge.

The Featured card uses the hero's composition in miniature: thumbnail on
the right fading left under a card-colour text panel once its container is
34rem wide, a band fading down above the text below that.

### `app/app/components/wiki/WikiPersonPortrait.vue`

The portrait at the head of a People page (rendered by
`pages/wiki/[...slug].vue` from `/api/meta`'s `image`), floated right beside
the title and lead in a fixed 4:5 box, fading into the page along its lower
half (`ufo-fade-y`). Its caption is the full attribution with links: the
author (linked to the Commons file page), the licence (linked to its deed
when it has one) and "Wikimedia Commons". This is where CC BY / BY-SA
attribution is spelled out; every other surface carries the same credit as
a tooltip.

### `app/app/utils/portrait.ts`

`portraitAlt(name)` ("Portrait of David Grusch") and
`portraitCredit(image)` ("Photo: A.Savin · CC BY-SA 3.0 · Wikimedia
Commons", leaving out an unknown author). Used by the roster, the hover
preview (`ProseA.vue`, which shows a small corner portrait with the same
`ufo-fade-xy` mask) and the person page, so alt text and credit read the
same everywhere.

### `app/app/composables/useVideoClock.ts`

`useVideoClock(videoId)` → `{ isThisVideo, playing, time }`: the dock's
playback state scoped to one video, so a timeline only follows *its* video.
`time` is `null` unless the dock currently holds that exact id.

### `app/app/composables/useScrollCursor.ts`

`useScrollCursor(listRoot, { itemSelector, readingLine, stickyOffset })` →
`{ index, t, progress, refresh, refreshNow, scrollToIndex, onUserScroll }`.
Caches entry offsets in one batched read (mount, list resize, `refresh()`)
and turns the container's passive `scroll` event into one rAF of arithmetic:
which entry sits at the reading line and how far along toward the next.
`onUserScroll` fires only on wheel/touch/scroll-key input — the signal
Follow mode uses to hand control back to the reader.

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
| `currentTime` | `Ref<number>` | Playback position in whole seconds. Written only by `WikiVideoDock` (one sample on every player state change, plus a 1s poll while playing, plus an immediate write on seek). Read through `useVideoClock` |
| `playing` | `Ref<boolean>` | Whether the player is in the PLAYING state |
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

## People portraits (`app/scripts/fetch-people-images.mjs`)

Person cards show a photo when one is available: the roster, the person's
own page and the link hover preview. The photos come from Wikipedia /
Wikimedia Commons but are **never requested from Wikimedia by visitors**:
an offline script downloads small thumbnails into the repo
(`app/public/people/*.webp`, 240px wide, typically 3–17 KB) and the site
serves them itself. No page load, build or server request talks to
Wikimedia.

### How a person gets a portrait

1. **Match the page to its article, by hand.** Add
   `wikipedia: "Exact article title"` to the person's frontmatter, only
   after checking the article is about the same person (compare the
   article's description with the page's `role:`; watch for namesakes,
   disambiguation pages and redirects to something else). Obscure people
   with no article get no field and keep the plain card. `discover` helps:

   ```bash
   cd app
   node scripts/fetch-people-images.mjs discover            # roster people
   node scripts/fetch-people-images.mjs discover --all      # every People page
   node scripts/fetch-people-images.mjs discover "Ben Rich" # named pages
   ```

   It prints, for each target without `wikipedia:`, the article that page
   title leads to, its short description, whether it's a disambiguation
   page, whether Wikidata says it's a human, and whether it has a free lead
   image, beside the vault's `role:`. It writes nothing.
2. **Optionally name the file.** When an article's lead image isn't a
   portrait (David Grusch's article leads with a video of the hearing), add
   `wikipedia_image: "File:…"` naming a Commons file of the person. It goes
   through the same licence checks.
3. **Fetch.** `node scripts/fetch-people-images.mjs fetch` (same targets:
   default `--roster`, or `--all`, or page titles). For each page with
   `wikipedia:` it asks the API for the article's lead image with
   `pageimages` (`pilicense=free`), reads the file's `imageinfo` /
   `extmetadata`, applies the licence policy below, downloads the 330px
   Commons thumbnail and re-encodes it with `cwebp` (`brew install webp`;
   falls back to a JPEG via macOS `sips`), and records it in
   `app/wiki/people-images.json`. Commit the manifest, the images and the
   frontmatter together, then restart the dev server (the bake reads the
   manifest at startup).

Flags: `--retry` re-checks people previously skipped; `--force`
re-processes everyone targeted (re-downloading images, reusing cached API
answers, e.g. after changing the author clean-up); `--refresh` also
bypasses the API cache. Changing a page's `wikipedia:` or
`wikipedia_image:` re-fetches that person on the next plain run.

### Politeness

One request at a time, at least 1.1s apart; `maxlag=5` on every API call;
a descriptive User-Agent naming the project and its repository (Wikimedia's
User-Agent policy); backoff honouring `Retry-After` on 429/503. API answers
are cached in `app/scripts/.cache/people-images/` (gitignored), and a
person already in the manifest with their file on disk costs no request at
all, so re-runs are nearly free. A full roster run is about 70 image
downloads plus a handful of batched API calls.

### Licensing policy

A photo is used only if **all** of these hold, otherwise the person is
listed under `skipped` in the manifest with the reason:

- the file is hosted on **Wikimedia Commons** (`imagerepository: shared`).
  Non-free "fair use" images, which many infoboxes of living people use,
  live on Wikipedia itself and are never on Commons;
- Commons doesn't flag it `NonFree`;
- its `LicenseShortName` is a recognised free licence: CC0, CC BY or CC BY-SA
  (any version or port), a public-domain mark, "No restrictions", or
  Commons' plain "Attribution" licence. NC, ND, GFDL-only, "All rights
  reserved", fair use and a missing licence are all rejected;
- it names an author whenever the licence requires attribution (only public
  domain, CC0 and "No restrictions" may credit "Unknown author").

The manifest stores, per person, the file, its size, the tidied author
(`cleanAuthor`: HTML, repeated names, "Author:" labels, trailing links and
uploader boilerplate removed), the licence and its deed URL, and the Commons
file page. The build drops any entry missing a credit field
(`parsePortraitManifest`), so a photo is never shown without its
attribution.

### Attribution on the site

- **Person page:** a visible caption under the portrait, "Photo: {author} ·
  {licence} · Wikimedia Commons", with the author linked to the Commons file
  page and the licence to its deed (`WikiPersonPortrait.vue`).
- **Roster cards and hover previews:** the same credit as the image's
  tooltip (`title`), with the linked credit one click away on the person's
  page.

### Where the data flows

`wiki/people-images.json` → `wiki/portraits.ts` (`loadPortraits`,
validated by `parsePortraitManifest`) → baked as `portraits` (sparse, by
node index) in `#wiki-data` → added as `image` to refs by `/api/resolve`
(`resolveNames`), to `/api/preview` and to `/api/meta`. Components read it
from the ref (`useWikiResolve`), never from a hardcoded list. The pure
helpers behind the script (`FREE_LICENSE`, `vetLicense`, `cleanAuthor`,
`slugify`, `rosterNames`) live in `app/scripts/people-images-lib.mjs` with
unit tests beside them.

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
6. **Frame the eras.** Add an `eras:` list (and any `hinges:`) to the
   `::wiki-timeline` YAML, using the video's own periodisation, plus a
   one-paragraph `help:` string. Without `eras` the block still works and
   groups by decade.
7. **Check the entry point.** A video summary page's hero already carries
   the play button; add a `::wiki-watch` block only where a mid-article
   prompt is wanted.

The pilot page is the worked example of all seven steps:
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
