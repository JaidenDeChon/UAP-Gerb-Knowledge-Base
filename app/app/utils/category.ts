import type { Category } from '#shared/types/wiki'

/** Category -> the CSS custom property holding its graph colour. */
export const CATEGORY_VAR: Record<Category, string> = {
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

/** Category -> its display label, for legends/chips that need one. */
export const CATEGORY_LABEL: Record<Category, string> = {
  Root: 'Home',
  MOCs: 'MOCs',
  People: 'People',
  Organizations: 'Organizations',
  Operations: 'Operations',
  Events: 'Events',
  Locations: 'Locations',
  Concepts: 'Concepts',
  Videos: 'Videos',
}

/** Resolve a category to its `hsl(var(...))` tint, falling back when undefined. */
export function tintFor(category: Category | undefined): string {
  return category ? `hsl(var(${CATEGORY_VAR[category]}))` : 'hsl(var(--muted-foreground))'
}

/**
 * Timeline event category -> the CSS custom property holding its graph colour.
 * NOTE: this is a *different* domain from `CATEGORY_VAR` above — it keys off
 * `TimelineEvent.category` values (event/program/person/organization/document/policy),
 * not vault `Category` values. Do not merge the two maps.
 */
export const TIMELINE_TINT: Record<string, string> = {
  event: '--graph-cat-events',
  program: '--graph-cat-ops',
  person: '--graph-cat-people',
  organization: '--graph-cat-orgs',
  document: '--graph-cat-concepts',
  policy: '--graph-cat-mocs',
}

/** Resolve a timeline event category to its `hsl(var(...))` tint, falling back when unknown. */
export function timelineTintFor(category?: string): string {
  return `hsl(var(${TIMELINE_TINT[category ?? ''] ?? '--graph-cat-mocs'}))`
}

/**
 * Timeline event category -> lucide glyph name, for the small icon+label
 * category marker on timeline entry cards. Mirrors `CATEGORY_ICON` (in
 * `#shared/types/wiki`) where the domains line up, so e.g. a "person" entry
 * here uses the same glyph a vault People note uses elsewhere in the app.
 * Falls back to MOCs' `compass`, matching `timelineTintFor`'s own fallback.
 */
export const TIMELINE_ICON: Record<string, string> = {
  event: 'calendar-clock',
  program: 'crosshair',
  person: 'users',
  organization: 'building-2',
  document: 'file-text',
  policy: 'scale',
}

/** Timeline event category -> its one-word display label, for the card marker. */
export const TIMELINE_LABEL: Record<string, string> = {
  event: 'Event',
  program: 'Program',
  person: 'Person',
  organization: 'Organization',
  document: 'Document',
  policy: 'Policy',
}

/** Resolve a timeline event category to its lucide glyph name. */
export function timelineIconName(category?: string): string {
  return TIMELINE_ICON[category ?? ''] ?? 'compass'
}

/** Resolve a timeline event category to its one-word display label. */
export function timelineLabel(category?: string): string {
  return TIMELINE_LABEL[category ?? ''] ?? 'Policy'
}

/* ============================================================
   Full-strength marks vs. low-alpha surfaces
   ------------------------------------------------------------
   The 8 graph-cat-* colours were tuned as node fills on the graph
   canvas, not as tints sitting behind body copy. Used at full
   strength as a card background they read as loud, and for two
   categories (Concepts, Videos) they fail contrast outright against
   the near-white `--card` of the light-family themes (light, sepia)
   even as a small non-text mark — see the measurements in
   `.superpowers/sdd/design-foundation-report.md`. That is a property
   of the existing published tokens, not something introduced here;
   fixing it would mean re-tuning the palette, which is out of scope.

   So the rule for every component built on these colours:
     - `*Mark` / `*Border`: full (or near-full) strength — dots,
       1-2px borders, rules, icons, chip text. These are small marks,
       not the surface text sits on.
     - `*Surface` / `*SurfaceHover`: low alpha, meant to be composited
       over `--card`. Verified to hold >= 4.5:1 contrast between
       `--foreground` and the composited surface for all 8 categories
       x all 4 themes (worst case measured: 6.76:1, dim theme). A
       caller asking for `surface` does not need to think about alpha.
   ============================================================ */

/** Alpha for a low-alpha surface tint, safe as a background behind body text. */
const SURFACE_ALPHA = 0.14
/** Alpha for a hovered/active surface — slightly stronger than `SURFACE_ALPHA`. */
const SURFACE_HOVER_ALPHA = 0.22
/** Alpha for a "near-full-strength" border/rule — softer than a mark, still vivid. */
const BORDER_ALPHA = 0.85

function markOf(cssVar: string): string {
  return `hsl(var(${cssVar}))`
}
function borderOf(cssVar: string): string {
  return `hsl(var(${cssVar}) / ${BORDER_ALPHA})`
}
function surfaceOf(cssVar: string): string {
  return `hsl(var(${cssVar}) / ${SURFACE_ALPHA})`
}
function surfaceHoverOf(cssVar: string): string {
  return `hsl(var(${cssVar}) / ${SURFACE_HOVER_ALPHA})`
}

function varForCategory(category: Category | undefined): string {
  return category ? CATEGORY_VAR[category] : '--muted-foreground'
}

/** Full-strength category colour — dots, icons, chip text. */
export function categoryMark(category: Category | undefined): string {
  return markOf(varForCategory(category))
}
/** Near-full-strength category colour — 1-2px borders and rules. */
export function categoryBorder(category: Category | undefined): string {
  return borderOf(varForCategory(category))
}
/** Low-alpha category tint, safe as a surface behind body text. */
export function categorySurface(category: Category | undefined): string {
  return surfaceOf(varForCategory(category))
}
/** Slightly stronger tint for a hovered/active surface. */
export function categorySurfaceHover(category: Category | undefined): string {
  return surfaceHoverOf(varForCategory(category))
}

function varForTimeline(category?: string): string {
  return TIMELINE_TINT[category ?? ''] ?? '--graph-cat-mocs'
}

/** Full-strength timeline-category colour — dots, icons, chip text. */
export function timelineMark(category?: string): string {
  return markOf(varForTimeline(category))
}
/** Near-full-strength timeline-category colour — 1-2px borders and rules. */
export function timelineBorder(category?: string): string {
  return borderOf(varForTimeline(category))
}
/** Low-alpha timeline-category tint, safe as a surface behind body text. */
export function timelineSurface(category?: string): string {
  return surfaceOf(varForTimeline(category))
}
/** Slightly stronger tint for a hovered/active timeline surface. */
export function timelineSurfaceHover(category?: string): string {
  return surfaceHoverOf(varForTimeline(category))
}
