# Rich Video Pages, Part 1: Resolver + Component Kit — Implementation Plan

> **HISTORICAL — do not code against this.** This plan records intent *before*
> implementation. Seven defects in these two plans were found while executing
> them, and several code blocks below have since diverged from what shipped.
> The live reference for the component kit is **`docs/wiki-components.md`**;
> the source is the authority above both.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MDC component kit (timeline, org chart, stat strip, roster, layout primitives) and the entity-name resolver that feeds it, then apply the kit to the pilot page.

**Architecture:** Vault markdown carries MDC blocks with YAML bodies. Entity references are plain page names, resolved server-side by a new `/api/resolve` route reading the already-baked `#wiki-data` graph. Vue components in `app/components/content/` render the blocks; Nuxt auto-registers them for MDC.

**Tech Stack:** Nuxt 4, Vue 3.5, `@nuxt/content` 3.15, Tailwind v4, `@vueuse/core`, `vitest` (added here), Bun.

**Spec:** `docs/superpowers/specs/2026-09-20-rich-video-pages-design.md`

**Scope note:** The spec is split into two plans because the video dock is an independent subsystem. This plan produces working software on its own: the pilot page renders its timeline, org chart, stat strip and roster with no dock present. Part 2 adds the dock and cues. `::wiki-cue` is deliberately absent here.

## Global Constraints

- **Entity references in YAML are plain page names, never `[[wikilinks]]`.** `replaceWikiLinks` (`app/wiki/vault.ts`) rewrites the whole file body before MDC parsing and will corrupt a wikilink inside a YAML string value.
- **Four themes must work:** `light`, `dark`, `dim`, `sepia`. Never hardcode a colour. Use `hsl(var(--token))` or a Tailwind utility bound to one.
- **Category colours come from `--graph-cat-people|locations|orgs|mocs|events|ops|concepts|videos`.** These already exist per theme in `app/assets/css/main.css`.
- **Radii are tight:** `--radius-sm: 2px` through `--radius-xl: 6px`. Do not introduce rounder corners.
- **Display face is Chakra Petch** (`var(--font-display)`), body is Inter (`var(--font-sans)`), numerals/labels in JetBrains Mono (`var(--font-mono)`).
- **Unresolved entity names render as plain text, never a dead link** — mirroring how `replaceWikiLinks` flattens unresolvable wikilinks.
- **`node_modules` is absent.** Run `bun install` in `app/` before anything else.
- **Vault path contains spaces.** Always quote paths.
- Components live **flat** in `app/components/content/`. A nested directory changes the MDC tag name via Nuxt's path prefixing.

---

### Task 1: Test harness + resolver logic

**Files:**
- Modify: `app/package.json` (add `vitest`, `test` script)
- Create: `app/vitest.config.ts`
- Create: `app/wiki/resolve.ts`
- Test: `app/wiki/resolve.test.ts`

**Interfaces:**
- Consumes: `FOLDER_PRIORITY`, `fold()` from `app/wiki/vault.ts` (both currently module-private — this task exports them).
- Produces:
  - `export function buildLabelIndex(nodes: GraphNode[]): Map<string, GraphNode>`
  - `export function resolveName(name: string, index: Map<string, GraphNode>): GraphNode | null`

- [ ] **Step 1: Install dependencies**

```bash
cd app && bun install && bun add -d vitest
```

- [ ] **Step 2: Create the vitest config**

Create `app/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['wiki/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
  },
})
```

Add to `app/package.json` `scripts`:

```json
"test": "vitest run"
```

- [ ] **Step 3: Export the two helpers from vault.ts**

In `app/wiki/vault.ts`, change `const FOLDER_PRIORITY` to `export const FOLDER_PRIORITY` and `function fold` to `export function fold`.

Do **not** copy these into `resolve.ts`. A second copy would drift, and bare names in YAML would then resolve to different pages than bare `[[wikilinks]]` on the same page — the exact bug this shares them to avoid.

- [ ] **Step 4: Write the failing test**

Create `app/wiki/resolve.test.ts`:

```ts
import type { GraphNode } from '../shared/types/wiki'
import { describe, expect, it } from 'vitest'
import { buildLabelIndex, resolveName } from './resolve'

function node(i: number, l: string, p: string, c: GraphNode['c']): GraphNode {
  return { i, l, p, c, d: 0, x: 0, y: 0 }
}

const NODES: GraphNode[] = [
  node(0, 'Jesse Marcel', '/wiki/people/jesse-marcel', 'People'),
  node(1, 'Crane, Indiana', '/wiki/locations/crane-indiana', 'Locations'),
  node(2, 'Crane, Indiana', '/wiki/organizations/crane-indiana', 'Organizations'),
  node(3, 'Edgar Fouché', '/wiki/people/edgar-fouche', 'People'),
]

describe('resolveName', () => {
  const index = buildLabelIndex(NODES)

  it('resolves an exact name', () => {
    expect(resolveName('Jesse Marcel', index)?.p).toBe('/wiki/people/jesse-marcel')
  })

  it('is case-insensitive', () => {
    expect(resolveName('jesse marcel', index)?.p).toBe('/wiki/people/jesse-marcel')
  })

  it('trims surrounding whitespace', () => {
    expect(resolveName('  Jesse Marcel  ', index)?.p).toBe('/wiki/people/jesse-marcel')
  })

  it('prefers the higher-priority folder when a name is ambiguous', () => {
    // FOLDER_PRIORITY ranks Organizations above Locations.
    expect(resolveName('Crane, Indiana', index)?.c).toBe('Organizations')
  })

  it('falls back to diacritic-folded matching', () => {
    expect(resolveName('Edgar Fouche', index)?.p).toBe('/wiki/people/edgar-fouche')
  })

  it('returns null for an unknown name', () => {
    expect(resolveName('Nobody At All', index)).toBeNull()
  })

  it('returns null for an empty name', () => {
    expect(resolveName('   ', index)).toBeNull()
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

```bash
cd app && bun run test
```

Expected: FAIL — `Failed to resolve import "./resolve"`.

- [ ] **Step 6: Write the implementation**

Create `app/wiki/resolve.ts`:

```ts
import type { GraphNode } from '../shared/types/wiki'
import { fold, FOLDER_PRIORITY } from './vault'

/** Rank a node's category against FOLDER_PRIORITY; unlisted sorts last. */
function rank(category: string): number {
  const i = FOLDER_PRIORITY.indexOf(category)
  return i === -1 ? FOLDER_PRIORITY.length : i
}

/**
 * Lowercased label -> node, plus diacritic-folded aliases under the same map.
 * When two notes share a label, the higher-priority folder wins — the same rule
 * `resolveWikiTarget` applies to a bare `[[wikilink]]`, so a plain name in YAML
 * and a wikilink to that name always land on the same page.
 */
export function buildLabelIndex(nodes: GraphNode[]): Map<string, GraphNode> {
  const index = new Map<string, GraphNode>()

  const offer = (key: string, node: GraphNode): void => {
    const held = index.get(key)
    if (!held || rank(node.c) < rank(held.c)) index.set(key, node)
  }

  for (const node of nodes) {
    offer(node.l.toLowerCase(), node)
  }
  // Folded keys are a fallback only, so they are added second and never
  // overwrite an exact-label entry.
  for (const node of nodes) {
    const key = fold(node.l)
    if (!index.has(key)) offer(key, node)
  }

  return index
}

/** Resolve a plain page name to its node, or null when the vault has no such note. */
export function resolveName(
  name: string,
  index: Map<string, GraphNode>,
): GraphNode | null {
  const clean = name.trim()
  if (!clean) return null
  return index.get(clean.toLowerCase()) ?? index.get(fold(clean)) ?? null
}
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd app && bun run test
```

Expected: PASS — 7 tests.

- [ ] **Step 8: Commit**

```bash
git add app/package.json app/bun.lock app/vitest.config.ts app/wiki/resolve.ts app/wiki/resolve.test.ts app/wiki/vault.ts
git commit -m "Add entity-name resolver with folder-priority matching"
```

---

### Task 2: The /api/resolve route

**Files:**
- Create: `app/server/api/resolve.get.ts`
- Modify: `app/server/utils/wiki.ts` (add memoised label index)
- Modify: `app/shared/types/wiki.ts` (add `ResolvedRef` type)

**Interfaces:**
- Consumes: `buildLabelIndex`, `resolveName` from Task 1; `graph` from `#wiki-data`.
- Produces: `GET /api/resolve?names=a,b,c` → `(NoteRef | null)[]`, positionally aligned with input.

- [ ] **Step 1: Add the memoised index to server utils**

Append to `app/server/utils/wiki.ts`:

```ts
import type { GraphNode } from '#shared/types/wiki'
import { buildLabelIndex } from '~~/wiki/resolve'

let byLabel: Map<string, GraphNode> | undefined

/** Lowercased label -> node. Built once per server process, like nodeIndexByPath. */
export function nodeIndexByLabel(): Map<string, GraphNode> {
  return (byLabel ??= buildLabelIndex(graph.nodes))
}
```

- [ ] **Step 2: Write the route**

Create `app/server/api/resolve.get.ts`:

```ts
import type { NoteRef } from '#shared/types/wiki'
import { resolveName } from '~~/wiki/resolve'

/** Cap the batch so a malformed query cannot walk the whole vault. */
const MAX_NAMES = 200

export default defineEventHandler((event): (NoteRef | null)[] => {
  const { names } = getQuery(event)
  if (typeof names !== 'string' || !names.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing names' })
  }

  const requested = names.split(',').map(n => n.trim()).filter(Boolean)
  if (requested.length > MAX_NAMES) {
    throw createError({ statusCode: 400, statusMessage: 'Too many names' })
  }

  const index = nodeIndexByLabel()
  return requested.map((name) => {
    const node = resolveName(name, index)
    return node ? { path: node.p, title: node.l, category: node.c } : null
  })
})
```

- [ ] **Step 3: Verify against a running dev server**

```bash
cd app && bun run dev
```

In a second shell:

```bash
curl -s 'http://localhost:3000/api/resolve?names=Jesse%20Marcel,Nobody%20At%20All' | head -c 400
```

Expected: a two-element array — the first an object with `path`/`title`/`category`, the second `null`.

- [ ] **Step 4: Verify parity with a real wikilink**

Open `http://localhost:3000/wiki/videos/80-years-of-ufo-crash-retrieval-and-reverse-engineering-a-timeline/summary`, pick any `[[wikilink]]` rendered on the page, note its `href`, then:

```bash
curl -s 'http://localhost:3000/api/resolve?names=<that%20link%20text>'
```

Expected: `path` equals the rendered `href`. If they differ, the shared `FOLDER_PRIORITY` is not actually shared — go back to Task 1 Step 3.

- [ ] **Step 5: Commit**

```bash
git add app/server/api/resolve.get.ts app/server/utils/wiki.ts
git commit -m "Add /api/resolve for entity-name lookups from MDC blocks"
```

---

### Task 3: useWikiResolve composable

**Files:**
- Create: `app/composables/useWikiResolve.ts`

**Interfaces:**
- Consumes: `GET /api/resolve` from Task 2.
- Produces: `export function useWikiResolve(names: MaybeRefOrGetter<string[]>): { refs: ComputedRef<Map<string, NoteRef>> }` — a lookup keyed by the **original** name string as written in YAML.

- [ ] **Step 1: Write the composable**

Create `app/composables/useWikiResolve.ts`:

```ts
import type { NoteRef } from '#shared/types/wiki'
import type { MaybeRefOrGetter } from 'vue'

/**
 * Resolve plain page names (as written in an MDC block's YAML) to note refs.
 *
 * Batched: every name on a page goes out in one request. Keyed by the original
 * string so a component can look up exactly what its YAML said. Names with no
 * matching note are simply absent from the map — callers render plain text.
 */
export function useWikiResolve(names: MaybeRefOrGetter<string[]>) {
  const list = computed(() => {
    const seen = new Set<string>()
    for (const name of toValue(names)) {
      const clean = name.trim()
      if (clean) seen.add(clean)
    }
    return [...seen].sort()
  })

  const key = computed(() => `resolve:${list.value.join('|')}`)

  const { data } = useAsyncData(
    () => key.value,
    async (): Promise<(NoteRef | null)[]> => {
      if (!list.value.length) return []
      return await $fetch<(NoteRef | null)[]>('/api/resolve', {
        query: { names: list.value.join(',') },
      })
    },
    { watch: [list], default: () => [] },
  )

  const refs = computed(() => {
    const map = new Map<string, NoteRef>()
    const rows = data.value ?? []
    list.value.forEach((name, i) => {
      const ref = rows[i]
      if (ref) map.set(name, ref)
    })
    return map
  })

  return { refs }
}
```

Note the name list is **sorted and deduplicated** before it becomes the cache key, so two components asking for the same names in different orders share one request.

- [ ] **Step 2: Commit**

```bash
git add app/composables/useWikiResolve.ts
git commit -m "Add useWikiResolve for batched entity-name lookups"
```

---

### Task 4: WikiEntityLink — the shared link atom

**Files:**
- Create: `app/components/wiki/WikiEntityLink.vue`

**Interfaces:**
- Consumes: `NoteRef` from `#shared/types/wiki`.
- Produces: `<WikiEntityLink :name="string" :ref-data="NoteRef | undefined" />` — renders a category-tinted link, or plain text when `refData` is undefined.

Every kit component links entities, so this exists once rather than four times.

- [ ] **Step 1: Write the component**

Create `app/components/wiki/WikiEntityLink.vue`:

```vue
<script setup lang="ts">
import type { Category, NoteRef } from '#shared/types/wiki'

const props = defineProps<{ name: string, refData?: NoteRef }>()

/** Category -> the CSS custom property holding its graph colour. */
const CATEGORY_VAR: Record<Category, string> = {
  Root: '--graph-cat-mocs',
  MOCs: '--graph-cat-mocs',
  People: '--graph-cat-people',
  Organizations: '--graph-cat-orgs',
  Operations: '--graph-cat-ops',
  Events: '--graph-cat-events',
  Locations: '--graph-cat-locations',
  Concepts: '--graph-cat-concepts',
  Videos: '--graph-cat-videos',
}

const tint = computed(() =>
  props.refData ? `hsl(var(${CATEGORY_VAR[props.refData.category]}))` : undefined)
</script>

<template>
  <NuxtLink
    v-if="props.refData"
    :to="props.refData.path"
    data-wiki-link
    class="ufo-entity-link"
    :style="{ '--tint': tint }"
  >
    {{ props.name }}
  </NuxtLink>
  <span v-else>{{ props.name }}</span>
</template>

<style scoped>
/* Unlayered so it outranks the global `a[data-wiki-link]` primary tint in
   main.css — these links are category-coloured, not accent-coloured. */
.ufo-entity-link {
  color: var(--tint);
  text-decoration: none;
  transition: opacity var(--dur-fast) var(--ease-standard);
}
.ufo-entity-link:hover {
  opacity: 0.75;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/wiki/WikiEntityLink.vue
git commit -m "Add WikiEntityLink, the category-tinted entity link atom"
```

---

### Task 5: Layout primitives (panel, grid, figure)

**Files:**
- Create: `app/components/content/WikiPanel.vue`
- Create: `app/components/content/WikiGrid.vue`
- Create: `app/components/content/WikiFigure.vue`

**Interfaces:**
- Produces MDC tags `::wiki-panel{title=}`, `::wiki-grid{cols=}`, `::wiki-figure{caption=}`.

These are Tier 1 of the escape hatch: bespoke per-video layouts with no new Vue files.

- [ ] **Step 1: Write WikiPanel**

Create `app/components/content/WikiPanel.vue`:

```vue
<script setup lang="ts">
const props = withDefaults(
  defineProps<{ title?: string, tone?: 'default' | 'accent' }>(),
  { title: '', tone: 'default' },
)
</script>

<template>
  <section
    class="my-7 overflow-hidden rounded-lg border"
    :class="props.tone === 'accent' ? 'border-primary/60' : 'border-border'"
  >
    <header
      v-if="props.title"
      class="border-b px-4 py-2.5"
      :class="props.tone === 'accent'
        ? 'border-primary/60 bg-primary/10 text-primary'
        : 'border-border bg-muted/40 text-muted-foreground'"
    >
      <span class="font-mono text-[11px] font-semibold uppercase tracking-[0.08em]">
        {{ props.title }}
      </span>
    </header>
    <div class="panel-body px-4 py-3.5">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.panel-body :deep(p:first-child) { margin-block-start: 0; }
.panel-body :deep(p:last-child) { margin-block-end: 0; }
</style>
```

- [ ] **Step 2: Write WikiGrid**

Create `app/components/content/WikiGrid.vue`:

```vue
<script setup lang="ts">
const props = withDefaults(defineProps<{ cols?: number | string }>(), { cols: 2 })

// MDC passes attributes as strings; clamp to a sane range.
const cols = computed(() => {
  const n = Number(props.cols)
  return Number.isFinite(n) ? Math.min(4, Math.max(1, Math.trunc(n))) : 2
})

const CLASSES: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
}
</script>

<template>
  <div class="my-6 grid gap-3" :class="CLASSES[cols]">
    <slot />
  </div>
</template>
```

The class map is explicit rather than an interpolated `grid-cols-${n}` because Tailwind scans source statically and would not emit a class built at runtime.

- [ ] **Step 3: Write WikiFigure**

Create `app/components/content/WikiFigure.vue`:

```vue
<script setup lang="ts">
const props = withDefaults(defineProps<{ caption?: string }>(), { caption: '' })
</script>

<template>
  <figure class="my-7">
    <div class="overflow-x-auto">
      <slot />
    </div>
    <figcaption
      v-if="props.caption"
      class="mt-2.5 font-sans text-[13px] leading-5 text-muted-foreground"
    >
      {{ props.caption }}
    </figcaption>
  </figure>
</template>
```

- [ ] **Step 4: Verify in the browser**

Add to any vault note temporarily:

```markdown
::wiki-panel{title="Test panel"}
Body text inside the panel.
::

::wiki-grid{cols=3}
::wiki-panel{title="A"}
One
::
::wiki-panel{title="B"}
Two
::
::wiki-panel{title="C"}
Three
::
::
```

Load the note. Expected: a titled panel, then three panels in a row (stacking to one column below `sm`). Switch through all four themes via the theme switcher and confirm borders and text stay legible. Remove the temporary markdown afterwards.

- [ ] **Step 5: Commit**

```bash
git add app/components/content/WikiPanel.vue app/components/content/WikiGrid.vue app/components/content/WikiFigure.vue
git commit -m "Add wiki layout primitives: panel, grid, figure"
```

---

### Task 6: WikiStatStrip

**Files:**
- Create: `app/components/content/WikiStatStrip.vue`

**Interfaces:**
- Produces MDC tag `::wiki-stat-strip` with YAML body `{ stats: { value: string, label: string, hint?: string }[] }`.

- [ ] **Step 1: Write the component**

Create `app/components/content/WikiStatStrip.vue`:

```vue
<script setup lang="ts">
interface Stat { value: string | number, label: string, hint?: string }

const props = withDefaults(defineProps<{ stats?: Stat[] }>(), { stats: () => [] })
</script>

<template>
  <div
    v-if="props.stats.length"
    class="my-7 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4"
  >
    <div
      v-for="(stat, i) in props.stats"
      :key="i"
      class="bg-card px-4 py-4"
    >
      <div class="font-display text-[34px] font-bold leading-none tracking-[0.01em] text-foreground">
        {{ stat.value }}
      </div>
      <div class="mt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {{ stat.label }}
      </div>
      <div v-if="stat.hint" class="mt-1 font-sans text-[12px] leading-4 text-muted-foreground">
        {{ stat.hint }}
      </div>
    </div>
  </div>
</template>
```

The `gap-px` over a `bg-border` parent draws hairline dividers without per-cell border maths — cells are `bg-card`, the 1px gaps show the parent through.

- [ ] **Step 2: Verify in the browser**

Temporarily add to a note:

```markdown
::wiki-stat-strip
---
stats:
  - value: 80
    label: Years covered
  - value: 42
    label: Timeline entries
  - value: 17
    label: Organizations
  - value: "2h44m"
    label: Runtime
---
::
```

Expected: four cells, hairline dividers, big Chakra Petch numerals, mono uppercase labels. Below `sm` it becomes 2×2. Check all four themes. Remove the temporary markdown.

- [ ] **Step 3: Commit**

```bash
git add app/components/content/WikiStatStrip.vue
git commit -m "Add WikiStatStrip for at-a-glance video figures"
```

---

### Task 7: WikiRoster

**Files:**
- Create: `app/components/content/WikiRoster.vue`

**Interfaces:**
- Consumes: `useWikiResolve` (Task 3), `WikiEntityLink` (Task 4).
- Produces MDC tag `::wiki-roster` with YAML body `{ entries: { name: string, role?: string, note?: string }[] }`.

- [ ] **Step 1: Write the component**

Create `app/components/content/WikiRoster.vue`:

```vue
<script setup lang="ts">
import type { Category } from '#shared/types/wiki'

interface Entry { name: string, role?: string, note?: string }

const props = withDefaults(defineProps<{ entries?: Entry[] }>(), { entries: () => [] })

const { refs } = useWikiResolve(() => props.entries.map(e => e.name))

const CATEGORY_VAR: Record<Category, string> = {
  Root: '--graph-cat-mocs',
  MOCs: '--graph-cat-mocs',
  People: '--graph-cat-people',
  Organizations: '--graph-cat-orgs',
  Operations: '--graph-cat-ops',
  Events: '--graph-cat-events',
  Locations: '--graph-cat-locations',
  Concepts: '--graph-cat-concepts',
  Videos: '--graph-cat-videos',
}

function tintFor(name: string): string {
  const ref = refs.value.get(name.trim())
  return ref ? `hsl(var(${CATEGORY_VAR[ref.category]}))` : 'hsl(var(--muted-foreground))'
}

function categoryOf(name: string): string {
  return refs.value.get(name.trim())?.category ?? 'Unlinked'
}
</script>

<template>
  <div v-if="props.entries.length" class="my-7 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
    <article
      v-for="entry in props.entries"
      :key="entry.name"
      class="relative overflow-hidden rounded-lg border border-border bg-card py-3 pl-4 pr-3.5"
    >
      <!-- Category spine. -->
      <span
        class="absolute inset-y-0 left-0 w-[3px]"
        :style="{ background: tintFor(entry.name) }"
        aria-hidden="true"
      />
      <div class="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {{ categoryOf(entry.name) }}
      </div>
      <h4 class="mt-1 font-display text-[17px] font-semibold leading-6">
        <WikiEntityLink :name="entry.name" :ref-data="refs.get(entry.name.trim())" />
      </h4>
      <p v-if="entry.role" class="mt-0.5 font-sans text-[13px] leading-5 text-muted-foreground">
        {{ entry.role }}
      </p>
      <p v-if="entry.note" class="mt-1.5 font-sans text-[14px] leading-6 text-foreground">
        {{ entry.note }}
      </p>
    </article>
  </div>
</template>
```

- [ ] **Step 2: Verify in the browser**

Temporarily add:

```markdown
::wiki-roster
---
entries:
  - name: David Grusch
    role: Former NRO/NGA intelligence officer
    note: Testified to Congress in July 2023.
  - name: MITRE Corporation
    role: FFRDC operator
    note: Alleged operator of two Navy legacy programs.
  - name: Not A Real Page
    role: Control case
    note: Should render as plain text, not a link.
---
::
```

Expected: three cards. Grusch's spine is people-red, MITRE's org-blue, the control case muted grey with its name as plain text (no link, no 404). Check all four themes. Remove the temporary markdown.

- [ ] **Step 3: Commit**

```bash
git add app/components/content/WikiRoster.vue
git commit -m "Add WikiRoster for video dramatis personae"
```

---

### Task 8: WikiOrgChart

**Files:**
- Create: `app/components/content/WikiOrgChart.vue`
- Create: `app/components/wiki/OrgChartNode.vue`

**Interfaces:**
- Consumes: `useWikiResolve` (Task 3), `WikiEntityLink` (Task 4).
- Produces MDC tag `::wiki-org-chart` with YAML body `{ root: OrgNode }` where
  `interface OrgNode { name: string, label?: string, note?: string, children?: OrgNode[] }`.

Nested `<table>` with pseudo-element connectors — see the spec for why this beats grid+SVG.

- [ ] **Step 1: Write the recursive node component**

Create `app/components/wiki/OrgChartNode.vue`:

```vue
<script setup lang="ts">
import type { NoteRef } from '#shared/types/wiki'

export interface OrgNode {
  name: string
  label?: string
  note?: string
  children?: OrgNode[]
}

const props = defineProps<{ node: OrgNode, refs: Map<string, NoteRef> }>()

const children = computed(() => props.node.children ?? [])
</script>

<template>
  <table class="ufo-org" role="presentation">
    <tbody>
      <tr>
        <td :colspan="Math.max(children.length * 2, 2)" class="ufo-org-cell">
          <div class="ufo-org-box">
            <div v-if="props.node.label" class="ufo-org-kicker">
              {{ props.node.label }}
            </div>
            <div class="ufo-org-name">
              <WikiEntityLink :name="props.node.name" :ref-data="props.refs.get(props.node.name.trim())" />
            </div>
            <div v-if="props.node.note" class="ufo-org-note">
              {{ props.node.note }}
            </div>
          </div>
        </td>
      </tr>

      <template v-if="children.length">
        <!-- Stem down from the parent box. -->
        <tr class="ufo-org-lines">
          <td :colspan="children.length * 2" class="ufo-org-down">
            <div class="ufo-org-stem" />
          </td>
        </tr>
        <!-- Horizontal rail: half-width cells so the corners land under the gaps. -->
        <tr class="ufo-org-lines">
          <template v-for="(child, i) in children" :key="`rail-${i}`">
            <td :class="['ufo-org-rail', i === 0 ? 'is-first' : '']" />
            <td :class="['ufo-org-rail', i === children.length - 1 ? 'is-last' : '']" />
          </template>
        </tr>
        <tr>
          <td v-for="(child, i) in children" :key="`child-${i}`" colspan="2" class="ufo-org-cell">
            <OrgChartNode :node="child" :refs="props.refs" />
          </td>
        </tr>
      </template>
    </tbody>
  </table>
</template>

<style scoped>
.ufo-org {
  border-collapse: collapse;
  margin-inline: auto;
}
.ufo-org-cell {
  text-align: center;
  vertical-align: top;
  padding: 0;
}
.ufo-org-box {
  display: inline-block;
  min-width: 132px;
  max-width: 220px;
  margin: 0 8px;
  padding: 8px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
  text-align: center;
}
.ufo-org-kicker {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  margin-bottom: 2px;
}
.ufo-org-name {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}
.ufo-org-note {
  margin-top: 3px;
  font-family: var(--font-sans);
  font-size: 12px;
  line-height: 16px;
  color: hsl(var(--muted-foreground));
}

/* Connectors. Fixed-height rows so the geometry never depends on content. */
.ufo-org-lines td { padding: 0; height: 14px; }

.ufo-org-down { text-align: center; }
.ufo-org-stem {
  width: 1px;
  height: 14px;
  margin-inline: auto;
  background: hsl(var(--border));
}

.ufo-org-rail {
  border-top: 1px solid hsl(var(--border));
}
/* Trim the rail so it stops at the outermost children rather than overhanging. */
.ufo-org-rail.is-first { border-top-color: transparent; }
.ufo-org-rail.is-last { border-top-color: transparent; }
.ufo-org-rail:not(.is-first):not(.is-last) { border-top-color: hsl(var(--border)); }
/* Drop a stem into each child. */
.ufo-org-rail.is-last::after,
.ufo-org-rail.is-first::after { content: none; }
</style>
```

- [ ] **Step 2: Write the wrapper**

Create `app/components/content/WikiOrgChart.vue`:

```vue
<script setup lang="ts">
import type { OrgNode } from '@/components/wiki/OrgChartNode.vue'

const props = defineProps<{ root?: OrgNode }>()

/** Every name in the tree, so one resolve request covers the whole chart. */
function names(node: OrgNode | undefined): string[] {
  if (!node) return []
  return [node.name, ...(node.children ?? []).flatMap(names)]
}

const { refs } = useWikiResolve(() => names(props.root))
</script>

<template>
  <div v-if="props.root" class="my-7 overflow-x-auto pb-2">
    <OrgChartNode :node="props.root" :refs="refs" />
  </div>
</template>
```

- [ ] **Step 3: Verify in the browser and tune the rail**

Temporarily add:

```markdown
::wiki-org-chart
---
root:
  name: MITRE Corporation
  label: FFRDC
  children:
    - name: MIT Lincoln Laboratory
      label: Origin
    - name: Office of Naval Intelligence
      label: Sponsor
      children:
        - name: Naval Air Systems Command
        - name: Naval Sea Systems Command
---
::
```

Expected: a centred root box, a stem down, a horizontal rail spanning only between the outermost children, a stem into each child, and the grandchildren nested below. Horizontal scroll appears on narrow viewports rather than squashing.

**This step includes tuning.** Connector geometry is fiddly; adjust the `.ufo-org-rail` rules until the rail terminates exactly under the outer children with no overhang, in all four themes. Do not move on with a visibly broken rail.

- [ ] **Step 4: Commit**

```bash
git add app/components/content/WikiOrgChart.vue app/components/wiki/OrgChartNode.vue
git commit -m "Add WikiOrgChart with nested-table connector layout"
```

---

### Task 9: WikiTimeline

**Files:**
- Create: `app/components/content/WikiTimeline.vue`

**Interfaces:**
- Consumes: `useWikiResolve` (Task 3), `WikiEntityLink` (Task 4).
- Produces MDC tag `::wiki-timeline` with YAML body:
  ```ts
  interface TimelineEvent {
    date: string           // "1947-07-08" | "1947-07" | "1947" | "c. 1980s"
    title: string
    summary?: string
    category?: 'event' | 'program' | 'person' | 'organization' | 'document' | 'policy'
    entities?: string[]
    significance?: 'major' | 'notable' | 'minor'
  }
  ```

- [ ] **Step 1: Write the component**

Create `app/components/content/WikiTimeline.vue`:

```vue
<script setup lang="ts">
interface TimelineEvent {
  date: string
  title: string
  summary?: string
  category?: string
  entities?: string[]
  significance?: string
}

const props = withDefaults(
  defineProps<{ events?: TimelineEvent[], eraSize?: number | string }>(),
  { events: () => [], eraSize: 10 },
)

/** Leading 4-digit year, or null for a vague date like "c. 1980s". */
function yearOf(date: string): number | null {
  const m = /^\s*(?:c\.\s*)?(\d{4})/.exec(date)
  return m ? Number(m[1]) : null
}

/** Human-readable date: "1947-07-08" -> "8 Jul 1947"; passes vague dates through. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatDate(date: string): string {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (full) return `${Number(full[3])} ${MONTHS[Number(full[2]) - 1]} ${full[1]}`
  const ym = /^(\d{4})-(\d{2})$/.exec(date)
  if (ym) return `${MONTHS[Number(ym[2]) - 1]} ${ym[1]}`
  return date
}

const decade = computed(() => {
  const n = Number(props.eraSize)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 10
})

const CATEGORY_TINT: Record<string, string> = {
  event: '--graph-cat-events',
  program: '--graph-cat-ops',
  person: '--graph-cat-people',
  organization: '--graph-cat-orgs',
  document: '--graph-cat-concepts',
  policy: '--graph-cat-mocs',
}
function tintOf(category?: string): string {
  return `hsl(var(${CATEGORY_TINT[category ?? ''] ?? '--graph-cat-mocs'}))`
}

/* -- filters -- */
const categories = computed(() =>
  [...new Set(props.events.map(e => e.category).filter(Boolean))].sort() as string[])
const active = ref<string | null>(null)
const majorOnly = ref(false)

const visible = computed(() => props.events.filter((e) => {
  if (active.value && e.category !== active.value) return false
  if (majorOnly.value && e.significance !== 'major') return false
  return true
}))

/* -- era grouping -- */
interface Era { label: string, events: TimelineEvent[] }
const eras = computed<Era[]>(() => {
  const out: Era[] = []
  let current: Era | null = null
  for (const event of visible.value) {
    const year = yearOf(event.date)
    const label = year === null
      ? 'Undated'
      : `${Math.floor(year / decade.value) * decade.value}s`
    if (!current || current.label !== label) {
      current = { label, events: [] }
      out.push(current)
    }
    current.events.push(event)
  }
  return out
})

const { refs } = useWikiResolve(() => props.events.flatMap(e => e.entities ?? []))
</script>

<template>
  <div v-if="props.events.length" class="my-8">
    <!-- Filters -->
    <div class="mb-5 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        class="ufo-chip" :class="{ 'is-on': active === null }"
        @click="active = null"
      >
        All
      </button>
      <button
        v-for="category in categories"
        :key="category"
        type="button"
        class="ufo-chip"
        :class="{ 'is-on': active === category }"
        :style="{ '--chip': tintOf(category) }"
        @click="active = active === category ? null : category"
      >
        {{ category }}
      </button>
      <span class="mx-1 h-4 w-px bg-border" aria-hidden="true" />
      <button
        type="button"
        class="ufo-chip" :class="{ 'is-on': majorOnly }"
        @click="majorOnly = !majorOnly"
      >
        Major only
      </button>
      <span class="ml-auto font-mono text-[11px] text-muted-foreground">
        {{ visible.length }} / {{ props.events.length }}
      </span>
    </div>

    <p v-if="!visible.length" class="font-sans text-[14px] text-muted-foreground">
      No entries match these filters.
    </p>

    <section v-for="era in eras" :key="era.label" class="mb-8 last:mb-0">
      <h3 class="mb-3 font-display text-[20px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
        {{ era.label }}
      </h3>

      <ol class="ufo-rail">
        <li
          v-for="(event, i) in era.events"
          :key="`${event.date}-${i}`"
          class="ufo-rail-item"
          :class="{ 'is-major': event.significance === 'major' }"
        >
          <span class="ufo-dot" :style="{ background: tintOf(event.category) }" aria-hidden="true" />
          <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {{ formatDate(event.date) }}
          </div>
          <h4 class="mt-0.5 font-display text-[17px] font-semibold leading-6 text-foreground">
            {{ event.title }}
          </h4>
          <p v-if="event.summary" class="mt-1 font-sans text-[14px] leading-6 text-foreground">
            {{ event.summary }}
          </p>
          <div v-if="event.entities?.length" class="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[13px]">
            <WikiEntityLink
              v-for="name in event.entities"
              :key="name"
              :name="name"
              :ref-data="refs.get(name.trim())"
            />
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
@reference "../../assets/css/main.css";

.ufo-chip {
  @apply rounded-sm border border-border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground;
  transition: color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard);
}
.ufo-chip:hover { @apply text-foreground; }
.ufo-chip.is-on {
  border-color: var(--chip, hsl(var(--primary)));
  color: var(--chip, hsl(var(--primary)));
}

.ufo-rail {
  position: relative;
  margin: 0;
  padding: 0 0 0 22px;
  list-style: none;
}
.ufo-rail::before {
  content: '';
  position: absolute;
  inset-block: 6px 6px;
  left: 4px;
  width: 1px;
  background: hsl(var(--border));
}
.ufo-rail-item {
  position: relative;
  padding-block: 0 18px;
}
.ufo-rail-item:last-child { padding-bottom: 0; }

.ufo-dot {
  position: absolute;
  left: -22px;
  top: 5px;
  width: 9px;
  height: 9px;
  border-radius: 9999px;
  box-shadow: 0 0 0 3px hsl(var(--background));
}
.ufo-rail-item.is-major .ufo-dot {
  width: 11px;
  height: 11px;
  left: -23px;
}
</style>
```

- [ ] **Step 2: Verify in the browser**

Temporarily add a five-entry `::wiki-timeline` block covering at least two decades, one entry with `significance: major`, one with a vague date (`"c. 1980s"`), and one entity name that does not exist.

Expected: era headings per decade plus an "Undated" group for the vague date; a connecting rail with category-coloured dots; major entries visibly larger; filter chips narrowing the list and updating the `n / total` count; the unknown entity as plain text. Check all four themes and mobile width.

- [ ] **Step 3: Commit**

```bash
git add app/components/content/WikiTimeline.vue
git commit -m "Add WikiTimeline with era grouping and category filters"
```

---

### Task 10: Sticky TOC rail

**Files:**
- Create: `app/components/wiki/WikiTocRail.vue`
- Modify: `app/pages/wiki/[...slug].vue`

**Interfaces:**
- Consumes: `page.body.toc` from `@nuxt/content`.
- Produces: `<WikiTocRail :toc="page.body?.toc" />`.

- [ ] **Step 1: Write the component**

Create `app/components/wiki/WikiTocRail.vue`:

```vue
<script setup lang="ts">
interface TocLink { id: string, text: string, depth: number, children?: TocLink[] }

const props = defineProps<{ toc?: { links?: TocLink[] } | null }>()

/** h2 and h3 only — deeper levels make the rail noisier than the page. */
const links = computed<TocLink[]>(() => {
  const out: TocLink[] = []
  for (const link of props.toc?.links ?? []) {
    out.push(link)
    for (const child of link.children ?? []) {
      if (child.depth <= 3) out.push(child)
    }
  }
  return out
})

const activeId = ref<string | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (!links.value.length) return
  // rootMargin pulls the trigger line to the upper third so a heading becomes
  // active as it reaches reading position, not when it touches the viewport edge.
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter(e => e.isIntersecting)
      if (visible.length) activeId.value = visible[0]!.target.id
    },
    { rootMargin: '0px 0px -66% 0px', threshold: 0 },
  )
  for (const link of links.value) {
    const el = document.getElementById(link.id)
    if (el) observer.observe(el)
  }
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <nav v-if="links.length >= 3" class="ufo-toc" aria-label="On this page">
    <div class="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      On this page
    </div>
    <ul class="flex flex-col gap-0.5 border-l border-border">
      <li v-for="link in links" :key="link.id">
        <a
          :href="`#${link.id}`"
          class="ufo-toc-link"
          :class="{ 'is-active': activeId === link.id }"
          :style="{ paddingInlineStart: `${(link.depth - 2) * 10 + 10}px` }"
        >
          {{ link.text }}
        </a>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.ufo-toc {
  position: sticky;
  top: 24px;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
}
.ufo-toc-link {
  display: block;
  margin-inline-start: -1px;
  border-inline-start: 1px solid transparent;
  padding-block: 3px;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 18px;
  color: hsl(var(--muted-foreground));
  transition: color var(--dur-fast) var(--ease-standard);
}
.ufo-toc-link:hover { color: hsl(var(--foreground)); }
.ufo-toc-link.is-active {
  border-inline-start-color: hsl(var(--primary));
  color: hsl(var(--primary));
}

/* The article column is a fixed 760px; the rail only fits once the viewport
   can hold it alongside. Below that it is hidden rather than stacked, since a
   table of contents above the content is just a second navigation list. */
@media (max-width: 1279px) {
  .ufo-toc { display: none; }
}
</style>
```

- [ ] **Step 2: Mount it in the wiki page**

In `app/pages/wiki/[...slug].vue`, the `<article>` is currently `mx-auto max-w-[760px]`. Wrap it so the rail sits beside rather than inside the measure.

Replace the opening of the template:

```vue
<template>
  <div v-if="page" class="mx-auto flex max-w-[1180px] items-start gap-10 px-8">
    <article class="min-w-0 max-w-[760px] flex-1 pb-32 pt-10">
```

…and close it after `<WikiLinkedEntries />`:

```vue
      <WikiLinkedEntries :path="route.path" />
    </article>

    <aside class="hidden w-[200px] shrink-0 pt-10 xl:block">
      <WikiTocRail :toc="page.body?.toc" />
    </aside>
  </div>
</template>
```

Remove the now-duplicated `px-8` and `mx-auto` from the `<article>` class list — they moved to the wrapper.

- [ ] **Step 3: Verify in the browser**

Load a long note (the pilot page, or any video summary) above 1280px wide. Expected: the rail appears to the right, highlights the section you are reading as you scroll, and clicking an entry jumps to it. Below 1280px the rail disappears and the article stays centred. Confirm on a short note (fewer than three headings) that no rail renders at all.

Note that the page scrolls inside `<main>`, not the window — confirm the scroll-spy still tracks correctly given that.

- [ ] **Step 4: Commit**

```bash
git add app/components/wiki/WikiTocRail.vue app/pages/wiki/\[...slug\].vue
git commit -m "Add sticky TOC rail to wiki pages"
```

---

### Task 11: Author the pilot page

**Files:**
- Modify: `UAP Gerb Knowledge Base/Videos/80 Years of UFO Crash Retrieval and Reverse Engineering - A Timeline/summary.md`
- Read: `/private/tmp/claude-501/-Users-jaidendechon-Library-Repos-UAP-Gerb-Knowledge-Base/9a9e6722-ab7c-411e-95ae-34e944de4aa7/scratchpad/80-years-chronology.json`

**Interfaces:**
- Consumes: every component from Tasks 5–9.

- [ ] **Step 1: Convert the chronology JSON into a `::wiki-timeline` block**

The chronology file holds 42 validated entries (1933-06 → 2023-07) whose fields already match `TimelineEvent`. Convert JSON to YAML and insert the block after the `## Overview` section.

```bash
cd "/Users/jaidendechon/Library/Repos/UAP Gerb Knowledge Base" && python3 - <<'PY'
import json
SRC = "/private/tmp/claude-501/-Users-jaidendechon-Library-Repos-UAP-Gerb-Knowledge-Base/9a9e6722-ab7c-411e-95ae-34e944de4aa7/scratchpad/80-years-chronology.json"
rows = json.load(open(SRC))

def q(s):
    return json.dumps(str(s), ensure_ascii=False)

lines = ["::wiki-timeline", "---", "events:"]
for r in rows:
    lines.append(f"  - date: {q(r['date'])}")
    lines.append(f"    title: {q(r['title'])}")
    if r.get("summary"):
        lines.append(f"    summary: {q(r['summary'])}")
    if r.get("category"):
        lines.append(f"    category: {r['category']}")
    if r.get("significance"):
        lines.append(f"    significance: {r['significance']}")
    for i, e in enumerate(r.get("entities") or []):
        if i == 0:
            lines.append("    entities:")
        lines.append(f"      - {q(e)}")
lines += ["---", "::"]
print("\n".join(lines))
PY
```

Paste the output into `summary.md` after the `## Overview` prose, under a new `## Chronology` heading.

**Every name under `entities:` must be an exact vault page name.** Verify before committing:

```bash
cd "/Users/jaidendechon/Library/Repos/UAP Gerb Knowledge Base/UAP Gerb Knowledge Base" && python3 - <<'PY'
import json, pathlib, re
S = pathlib.Path("Videos/80 Years of UFO Crash Retrieval and Reverse Engineering - A Timeline/summary.md")
names = set(re.findall(r'^      - "(.+)"$', S.read_text(), re.M))
have = {p.stem for p in pathlib.Path('.').rglob('*.md') if '_templates' not in p.parts}
missing = sorted(n for n in names if n not in have)
print(f"{len(names)} entity names, {len(missing)} unresolvable")
for m in missing: print("  MISSING:", m)
PY
```

Fix any misses by correcting the name to the real page title. Do **not** create pages to satisfy the timeline.

- [ ] **Step 2: Add the stat strip**

Insert directly after the page's lead paragraph, before `## Overview`. Derive values from the chronology and the vault — do not invent them:

```markdown
::wiki-stat-strip
---
stats:
  - value: 90
    label: Years covered
    hint: 1933–2023
  - value: 42
    label: Chronology entries
  - value: 22
    label: Major events
  - value: "2h44m"
    label: Runtime
---
::
```

Confirm `90`, `42` and `22` against the JSON before writing them:

```bash
python3 -c "
import json;d=json.load(open('/private/tmp/claude-501/-Users-jaidendechon-Library-Repos-UAP-Gerb-Knowledge-Base/9a9e6722-ab7c-411e-95ae-34e944de4aa7/scratchpad/80-years-chronology.json'))
print('entries',len(d));print('major',sum(1 for x in d if x['significance']=='major'))
print('span',d[0]['date'],d[-1]['date'])"
```

- [ ] **Step 3: Add the org chart**

Read the transcript section covering the program structure and author a `::wiki-org-chart` reflecting what the video actually claims. Every `name` must be an existing vault page; `label` carries the role.

Keep it to three levels. A chart deeper than that scrolls horizontally past usefulness, and the video's own account does not support more.

- [ ] **Step 4: Add the roster**

Author a `::wiki-roster` of the 6–10 figures the video leans on most, placed before `## Key Claims`. `note` is one sentence on what this video says about them specifically — not a biography, which is what their own page is for.

- [ ] **Step 5: Fix the frontmatter duration**

`duration_seconds: 0` is wrong. The real runtime is 9829 seconds (verified via `yt-dlp`). Set `duration_seconds: 9829` so `WikiFactTable` renders `2:43:49` instead of hiding the row.

- [ ] **Step 6: Verify the whole page**

```bash
cd app && bun run dev
```

Load `/wiki/videos/80-years-of-ufo-crash-retrieval-and-reverse-engineering-a-timeline/summary`.

Check: stat strip under the lead; timeline with working filters; org chart connectors correct; roster cards category-tinted; TOC rail tracking; fact table showing `2:43:49`; no unresolved entity rendering as a broken link. Repeat in all four themes and at mobile width.

- [ ] **Step 7: Confirm Obsidian still parses the file**

```bash
cd "/Users/jaidendechon/Library/Repos/UAP Gerb Knowledge Base/UAP Gerb Knowledge Base" && python3 -c "
import re,pathlib
p=pathlib.Path('Videos/80 Years of UFO Crash Retrieval and Reverse Engineering - A Timeline/summary.md')
t=p.read_text()
assert t.startswith('---'), 'frontmatter missing'
end=t.index('\n---',3)
print('frontmatter OK')
print('mdc blocks:', len(re.findall(r'^::[a-z-]+', t, re.M)))
print('unclosed:', len(re.findall(r'^::[a-z-]+', t, re.M)) - len(re.findall(r'^::$', t, re.M)))"
```

Expected: frontmatter OK, and `unclosed: 0`. Literal `::` blocks in Obsidian are expected and accepted; broken frontmatter is not.

- [ ] **Step 8: Commit**

```bash
git add "UAP Gerb Knowledge Base/Videos/80 Years of UFO Crash Retrieval and Reverse Engineering - A Timeline/summary.md"
git commit -m "Apply the component kit to the 80 Years pilot page"
```

---

### Task 12: Document the kit

**Files:**
- Create: `docs/wiki-components.md`
- Modify: `UAP Gerb Knowledge Base/_templates/Video Note Template.md`

- [ ] **Step 1: Write the reference**

Create `docs/wiki-components.md` documenting each MDC tag with its full YAML schema and a copy-pasteable example: `wiki-timeline`, `wiki-org-chart`, `wiki-stat-strip`, `wiki-roster`, `wiki-panel`, `wiki-grid`, `wiki-figure`.

State prominently, near the top:

> Entity references inside these YAML blocks are **plain page names**, never `[[wikilinks]]`. The vault's wikilink rewriter runs over the whole file before MDC is parsed and will corrupt a wikilink inside a YAML value.

Document the Tier 2 escape hatch: drop `WikiCustom<Name>.vue` into `app/components/content/` (flat, never a subdirectory) and reference it as `::wiki-custom-<name>`.

- [ ] **Step 2: Add commented examples to the video template**

Append a commented block to `_templates/Video Note Template.md` showing a minimal `::wiki-timeline` and `::wiki-stat-strip`, so the next video author finds the syntax without reading component source.

- [ ] **Step 3: Full verification pass**

```bash
cd app && bun run test && bun run build
```

Expected: tests pass, build succeeds including `vue-tsc`. A type error here is a real failure — do not proceed past it.

- [ ] **Step 4: Commit**

```bash
git add docs/wiki-components.md "UAP Gerb Knowledge Base/_templates/Video Note Template.md"
git commit -m "Document the wiki component kit and its escape hatch"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| MDC authoring, YAML bodies | 5–9, 11 |
| `/api/resolve` reading baked graph | 2 |
| Shared `FOLDER_PRIORITY`/`fold` | 1 (Step 3) |
| Unresolved names as plain text | 4, verified in 7 |
| `useWikiResolve` batching | 3 |
| Timeline, org chart, stat strip, roster | 9, 8, 6, 7 |
| Nested-table org chart | 8 |
| Layout primitives (Tier 1 escape hatch) | 5 |
| Tier 2 escape hatch documented | 12 |
| Sticky TOC rail | 10 |
| Four-theme verification | every browser-verify step |
| `duration_seconds` correction | 11 (Step 5) |
| Obsidian still parses | 11 (Step 7) |
| `bun install` first | 1 (Step 1) |

**Deferred to Part 2:** video dock, `cues.json`, `::wiki-cue`, `derive_cues.py`. These are the spec's "Video dock" and "Cues" sections.

**Known deviation from the spec:** the spec states a test runner is out of scope. This plan adds `vitest` for pure logic only (Task 1). Visual components remain browser-verified, as the spec intends. Flagged to the user before execution.
