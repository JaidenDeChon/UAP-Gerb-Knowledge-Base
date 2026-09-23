# Component proposals

The register of new component *types* proposed for rich video articles. The `video-enricher` agent (`.claude/agents/video-enricher.md`) never builds a new component type without the user's approval.

1. The agent appends a proposal here with status `proposed`, and raises it as a question.
2. The user's answer sets it to `approved` or `declined`.
3. An `approved` proposal is built on the agent's next run, then set to `shipped`.

Extending an existing component with an optional, backward-compatible prop doesn't need a proposal. That change is documented in `docs/wiki-components.md` instead.

Read this whole file before proposing, and never re-propose an idea already listed, including declined ones.

## Template

```markdown
### <Component name> — `::wiki-<kebab-name>`

- **Status:** proposed | approved | declined | shipped (YYYY-MM-DD, with any notes from the user)
- **Premise:** what kind of content this shows that nothing in the kit can.
- **Needed by:** the video(s) that motivated it.
- **What the reader sees:** a short description of the rendered result, on desktop and on a phone.
- **Why the kit falls short:** which existing components and extensions were considered, and why they don't work.
- **Authoring sketch:**
  (the YAML an author would write)
- **Implementation plan:** files, dependencies (prefer none), accessibility, themes.
```

## Proposals

### Comparison matrix — `::wiki-compare`

- **Status:** shipped (2026-09-23). Approved by the user as proposed. Built as `WikiCompare.vue` (+ `components/wiki/CompareCell.vue`, `utils/compare.ts`), documented in `docs/wiki-components.md`. Two changes from the sketch: rows can also carry a row-level `cue` (for a point discussed across all subjects at once), and the phone layout pivots into one card per *attribute* rather than per subject, so each comparison stays together. Retrofitted into 29 Palms / Castle, Aztec, Del Rio, Peru (egg precedents), TR-3B (the four triangles) and Manhattan Project 2.0. Left as tables: NRO (a sparse 13 × 6 membership grid, better as a lookup table), Coyame (a two-column name lookup, not a comparison) and Peru's travel-time legs (a calculation).
- **Premise:** Videos constantly compare 2–5 subjects (witness accounts, craft, cases, programs) attribute by attribute. The kit has no component for a subjects-by-attributes grid, so these become plain Markdown tables.
- **Needed by:** 1997 29 Palms / Castle (his craft vs the TR-3B), 1948 Aztec (four eyewitness accounts), 1950s Del Rio (the host's four points separating two cases), 1997 Peru (egg-shaped precedents), TR-3B (two kinds of ARV), Manhattan Project 2.0 (five security pillars across two programs), NRO (13 gatekeepers × offices), Coyame (six Wikipedia-edit names).
- **What the reader sees:** A grid with a subject per column and an attribute per row. Column headers are entity links tinted by category. Each cell can carry a small marker (`same`, `differs`, `unknown`, `disputed`) so agreement and contradiction read at a glance, and an optional cue chip jumping the video to where it's discussed. Desktop: a table with a sticky attribute column. Phone: it pivots into one card per subject, so it never scrolls sideways.
- **Why the kit falls short:** Markdown tables have no markers, no cue chips and no category tint, and they overflow at phone width (the Northrop/TRW IRAD table needed a `::wiki-figure` scroll wrapper). Panels in a `::wiki-grid` show each subject but lose the row alignment that makes a comparison readable.
- **Authoring sketch:**
  ```yaml
  subjects: ["Rodrik Castle", "TR-3B"]
  rows:
    - attribute: "Shape"
      cells: [{ text: "Isosceles triangle", mark: same }, { text: "Equilateral triangle", mark: differs }]
    - attribute: "Lights"
      cells: [{ text: "Three corner lights", cue: 2259 }, { text: "Three corner lights", mark: same }]
  ```
- **Implementation plan:** `app/app/components/content/WikiCompare.vue`, no new dependencies. Subject names resolve in one batch via `useWikiResolve`. It uses the prose-table styling (gotcha 4) plus a mobile card layout via container query. Markers get text labels, not colour alone. Cue chips reuse `WikiCue`. Check in all four themes.

### Chain — `::wiki-chain`

- **Status:** approved (2026-09-23, approved by the user as proposed)
- **Premise:** Many videos trace a *sequence of hand-offs*: a chain of custody (the object moved from A to B to C), a chain of consequence (X led to Y led to Z), or how an account travelled from witness to researcher to publication. These are linear or lightly branching, and the links between steps carry meaning ("by flatbed truck", "leaked to", "led to the audit").
- **Needed by:** Coyame and Kecksburg (the object's custody), Del Rio (the Sandia thread), McCandlish (how the story travelled), Sarbacher (how his account reached the record), Northrop (TRW audit → settlement), Whistleblowers Vol.1 (Eisenhower losing control), Hidden Wing, SAIC (DSAI's seven-step trail), Sandia (AFSWP → DTRA).
- **What the reader sees:** A row of step cards joined by arrows, with a short label on each arrow. Each step is an entity link or plain text, with an optional date and cue chip. A step can fork into two or three branches, then optionally rejoin. Desktop: horizontal, wrapping into rows. Phone: vertical.
- **Why the kit falls short:** Agents drew all of these with `::wiki-org-chart`, which implies a command hierarchy that isn't there. It has no labels on links (agents crammed "the order" into node kickers), and long chains nest ever deeper, so the chart scrolls sideways.
- **Authoring sketch:**
  ```yaml
  kind: custody          # custody | consequence | transmission (sets the verb styling)
  steps:
    - name: "1965 Kecksburg, Pennsylvania Crash Retrieval"
    - via: "Army flatbed, night of 9 Dec"
      name: "Lockbourne Air Force Base, Columbus, Ohio"
      date: "1965-12-10"
      cue: 1840
    - via: "Transferred within days"
      name: "Wright-Patterson Air Force Base"
    - via: "Lead-lined brick enclosure built"
      text: "Storage (alleged)"
  ```
- **Implementation plan:** `WikiChain.vue`, CSS-only arrows (flex and grid), no dependency. Names resolve in one batch. Arrow labels are real text, and the list is marked up as an ordered list for screen readers. Check in all four themes. Retrofit the org-chart chains above, and keep `::wiki-org-chart` for true hierarchies.

### Claim and response — `::wiki-claim`

- **Status:** approved (2026-09-23, approved by the user as proposed)
- **Premise:** Nearly every video weighs a claim against challenges and replies: AARO vs Herrera, the case for and against Corso or Fouché, the prosecution vs the defence at the Aztec trial, the six MJ-12 objections and the Woods' answers, the four Kecksburg or Trepang explanations. The vault's editorial rule is "attribute, don't debunk", so *who says what* matters more than the verdict.
- **Needed by:** Corso, Herrera, TR-3B / Fouché, Aztec, MJ-12, Kecksburg, USO (Trepang), Coyame (the soldiers' deaths), Edwards (the Blackjack reversal).
- **What the reader sees:** A claim card naming who made it, when and where, with a cue chip. Under it sit responses, each labelled with its speaker (an entity link) and a stance tag (`supports`, `challenges`, `host's view`, `unresolved`). Stance tags are text, not colour alone. It stacks cleanly on a phone, and each claim stays grouped with its responses.
- **Why the kit falls short:** Paired `::wiki-panel`s have no slot for speaker or stance, so attribution lives in prose inside the panel and is easy to drop. Several panel pairs in one grid also lose which reply answers which claim once they stack on a phone.
- **Authoring sketch:**
  ```yaml
  claim: { text: "Corso never attended an NSC meeting", by: "Stanton Friedman", cue: 3120 }
  responses:
    - { by: "UAP Gerb", stance: challenges, text: "Eisenhower Library records place Corso on the NSC staff", cue: 3190 }
  ```
- **Implementation plan:** `WikiClaim.vue`, no dependency. It reuses `WikiEntityLink` and `WikiCue`. The stance tag uses the existing semantic tokens. Check in all four themes.

### Location map — `::wiki-map`

- **Status:** approved (2026-09-23, approved by the user as proposed)
- **Premise:** Almost every case is geographic (crash sites, bases, transport routes, test ranges), but no component shows *where*. The site's `/map` is a relationship graph, not a geographic map.
- **Needed by:** Kecksburg (the crash site → Lockbourne → Wright-Patterson route), Coyame (Chihuahua → Fort Bliss → Atlanta), Peru (Iquitos, Pucallpa, Lima), 29 Palms (R2508 airspace), Dugway, DUMBs (the Antelope Valley network), Del Rio, the Navy sites in the US Navy video, and Crane.
- **What the reader sees:** A compact outline map (US or world, zoomed to fit its pins) with numbered pins that link to their Location pages, optional lines for routes, and a legend listing the pins so everything is readable without the map. It's static and lightweight, with no tile server.
- **Why the kit falls short:** Nothing in the kit is spatial. Routes are written as prose or forced into trees.
- **Authoring sketch:**
  ```yaml
  region: us             # us | world | auto
  pins: ["1965 Kecksburg, Pennsylvania Crash Retrieval", "Lockbourne Air Force Base, Columbus, Ohio", "Wright-Patterson Air Force Base"]
  routes: [[0, 1], [1, 2]]
  ```
- **Implementation plan:** This is the heaviest proposal. Location pages need `coordinates: [lat, lon]` in their frontmatter: none of the 178 have it today. The enricher would add coordinates as it goes, checked online, and a one-off pass could backfill them. The map would be `WikiMap.vue` with a small bundled SVG outline (Natural Earth, public domain) and a d3-geo projection (d3 is already partly in the tree via `d3-force`). There are no tile servers or third-party requests. Pins resolve through `useWikiResolve`. The resolve API or content index would need to expose each page's coordinates. Check in all four themes.

