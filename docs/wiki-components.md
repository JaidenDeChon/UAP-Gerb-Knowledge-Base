# Wiki component kit

Reference for the MDC (Markdown Components) blocks available inside `.md` notes
in the vault. These render as rich, structured content on the web app
(`app/`) — timelines, org charts, stat strips, rosters, and layout
primitives — while still being plain Markdown that Obsidian can open.

Every component lives in `app/app/components/content/` and every prop below
was read directly from that component's source (`defineProps`/`withDefaults`),
not inferred from usage. If this doc and a component's source ever disagree,
the source wins — file a fix.

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
| `events` | `TimelineEvent[]` | `[]` | See schema below |
| `eraSize` | `number \| string` | `10` | Decade-bucket size, e.g. `10` groups into "1940s"/"1950s"; invalid/non-positive values fall back to `10` |

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

A grid of person/entity cards with a category-coloured left spine — 1 column
on mobile, 2 columns at `sm:` and up.

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
