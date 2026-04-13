---
name: "Wiki Conventions"
description: "File naming, redirect stubs, frontmatter patterns, MOC structure, and organizational conventions for the UAP Gerb KB"
type: reference
---

## File Structure
- Entity pages live in category folders: People/, Organizations/, Locations/, Concepts/, Events/, Operations/
- Video pages live in Videos/[Video Title]/ with summary.md and transcript.md
- MOC (Map of Content) files at root: People MOC.md, Organizations MOC.md, etc. — alphabetical bullet lists of wikilinks
- Templates in _templates/

## Frontmatter Conventions
- People: `name`, `role`, `tags: [person]`
- Organizations: `name`, `org_type` (govt|private|military|research), `tags: [organization]`
- Locations: `name`, `location_type` (facility|site|base|region), `tags: [location]`
- Concepts: `name`, `tags: [concept]`
- Events: `name`, `date`, `tags: [event]`
- Redirects: `name`, `redirect_to: "[[Target Page]]"` — body is "This page has been consolidated with [[Target Page]]."

## MOC Updates
- When renaming pages, update the corresponding MOC file (e.g., Organizations MOC.md) to match the new wikilink
- MOC entries are simple bullet points: `- [[Page Name]]`

## Sources Section
- Every entity page should end with `## Sources` listing wikilinked video pages
- Format: `- [[Video - Full Video Title]]`

## Wikilinks
- Use `[[Page Name]]` for standard links
- Use `[[Page Name|Display Text]]` for aliases
- Link entities on first mention in each major section
