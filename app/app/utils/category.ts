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
