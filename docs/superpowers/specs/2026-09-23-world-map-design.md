# World map page — design

## Intent

A `/world` page that shows every Location in the vault on a map of the world.

What was asked for:

- a 3D globe at the top with every location pinned, in a vector style (no
  photographic texture) with a soft glow;
- a toggle that turns the pins into a heatmap;
- a list of locations beside the globe (an openable menu on mobile). Picking
  one rotates the globe to it and highlights it;
- below the globe, the same points on 2D maps, one per continent;
- the site's existing design language and UI components.

Decisions settled in conversation:

- **Coordinates live in the vault**, as `coordinates: [lat, lon]` frontmatter
  on each Location note. This is the convention `::wiki-map` already reads
  (46 of 178 notes had it). The remaining notes are geocoded once and checked
  by hand. A note that can't honestly be placed gets no coordinates and stays
  off the map. Examples: a ship, or a site the note itself calls unspecified.
- **Heat is pin density.** Every location weighs the same.
- **Selecting a location opens a preview card** with its name, type, lead
  paragraph and an "Open page" link. The selection is shared across the page:
  picking a place in the list, on the globe or on a continent map selects it
  everywhere.
- **Globe library: globe.gl**, the same one jaiden.dev uses. It comes from the
  same author as `force-graph`, which is already a dependency. It has hex
  polygons for the vector look, an atmosphere for the glow, and a built-in
  heatmap layer.

Assumptions:

- The route is `/world`, labelled "World map". It sits next to the existing
  "Site map" in the sidebar and the command palette. The graph at `/map` is
  unchanged.
- The Pins/Heat toggle applies to the globe and to every continent map.
- The selection and mode are kept in the URL (`?at=<slug>&mode=heat`), the
  same way the timeline keeps its filters, so a view can be linked to.

## Data

- `wiki/places.ts` (new, pure) takes the Location nodes that have baked
  coordinates and returns one `BakedPlace` for each: node index, the
  `location_type` frontmatter (if any) and the continent. It is baked into
  `#wiki-data` as `places`, next to `geo`.
- **Continent:** the country containing the point is found in the outlines
  the site already ships (`public/geo/world.json`, Natural Earth). Its
  ISO-numeric id is then mapped to a continent through a fixed table in
  `app/utils/world.ts`, which follows the UN M49 regions. A point at sea goes
  to the nearest country. Russia is split at 60°E (Europe / Asia).
  Continents: North America (including Central America and the Caribbean),
  South America, Europe, Africa, Asia, Oceania, Antarctica.
- `server/api/places.get.ts` serves
  `{ places: WorldPlace[], unplaced: { name, path }[] }`, where
  `WorldPlace = { path, name, lead, type, lat, lon, continent }`. The name
  and lead come from the baked previews.

## Page

`app/pages/world/index.vue`, using the same frame as `/videos` (display-font
title, mono sub-line).

1. **Header:** "World map", then a count of places and continents, then a
   Pins / Heat segmented toggle.
2. **Globe hero (`WorldGlobe.vue`):** a bordered panel. On desktop the globe
   sits on the left and the place list is a rail on the right.
   - globe.gl is loaded client-only with a dynamic import, so three.js stays
     out of every other page's bundle.
   - Look: a solid sphere one step off the card colour; countries as dotted
     hex polygons in a muted ink; the atmosphere in the theme's `--primary`
     as the glow; a faint radial glow behind the canvas. Colours are read
     from the CSS tokens and re-read when the theme changes, so all four
     themes work.
   - Pins: small points. The selected one is larger, drawn in `--primary`,
     with a pulsing ring. Hovering shows the name; clicking selects.
   - Heat: a density glow drawn on an equirectangular canvas (the same
     kernel and one-hue ramp as the continent maps) and wrapped on a
     transparent shell just above the land. *Changed during the build:*
     globe.gl's own `heatmapsData` layer computes density with WebGPU
     wherever `navigator.gpu` exists, and draws nothing where WebGPU is
     present but unusable. Since it's unused, `three/webgpu` and `three/tsl`
     (imported by three-globe at module level) are aliased to a stub. That
     keeps more than a megabyte of JavaScript off the page, and keeps the
     production build under Node's default heap.
   - Motion: a slow auto-rotate that stops once someone interacts. Selecting
     a place flies the camera to it in about 1 s. Under reduced motion there
     is no auto-rotate and the camera moves instantly. Rendering pauses while
     the globe is off-screen.
   - The preview card (`WorldPlaceCard.vue`) is overlaid on the globe's
     bottom-left corner.
3. **Place list (`WorldPlaceList.vue`):** a search box and places grouped by
   continent, with counts. The active row is highlighted and scrolled into
   view when the place is selected from elsewhere. Below 900px (the shell's
   breakpoint) the rail becomes a "Places" button that opens the list in a
   side sheet built on the existing dialog primitive. Choosing a place closes
   the sheet.
4. **Continent maps (`WorldContinentMap.vue`):** a card for every continent
   that has places, drawn with d3-geo from the shared outlines in
   `::wiki-map`'s map inks. Pins are small dots with a hover label. The
   selected pin gets the primary ring. In heat mode a canvas density layer
   (radial kernels, coloured by the same ramp) replaces the dots. Clicking a
   pin selects it and scrolls the globe back into view.
5. **Footer:** outline credit, and the notes that have no coordinates, linked.

Shared state: `useWorldSelection()` holds the selected place's slug and the
mode, synced to the route query.

Shared outlines: `WikiMap.vue`'s module-local `loadOutlines()` moves to
`app/composables/useMapOutlines.ts`, so both components fetch
`world.json` / `us-states.json` once per page load.

## Testing

- Vitest, `app/utils/world.test.ts`: every country id in `world.json`
  resolves to a continent; `continentOf` puts known points on the right
  continent (Roswell, Lima, Milan, Tehran, Pine Gap, Kamchatka, Johannesburg,
  Spitsbergen, Gulf of Guinea at sea, Ascension Island); the heat ramp
  and density helpers behave at their edges.
- Vitest, `wiki/places.test.ts`: only Locations with coordinates are placed,
  and every Location in the vault either has valid coordinates or is listed
  as unplaced.
- `vue-tsc` and `nuxt build`; a manual pass in each theme at desktop and
  phone widths.
