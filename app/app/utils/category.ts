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
