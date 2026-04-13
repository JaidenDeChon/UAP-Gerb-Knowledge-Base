---
name: "Duplicate Patterns"
description: "Common duplicate types found in the vault — speech-to-text variants, acronym splits, with/without parentheticals"
type: feedback
---

## Primary Source of Duplicates
Speech-to-text transcription generates variant spellings of proper nouns, which then get created as separate wiki pages. A single person can have 5-9 variant pages (e.g., Jonathan Wagant had 8 misspelling variants).

**Why:** Transcripts are auto-generated and entity pages were bulk-created from them without deduplication.

**How to apply:** When enumerating entities, always search the People/ directory for fuzzy name matches. Check first 3-4 characters of surnames. Common patterns:
- Vowel substitutions: Wagant/Wayan/Weant/Wiant/Wgant
- Missing letters: Fuche/Fouche/Fuché
- Honorific inclusion/exclusion: Mr. Castle / Rod / Rodrik Castle
- Acronym vs full name: VMA-513 / VMA 513 / VMA 513 Flying Nightmares

## Other Duplicate Sources
- Location pages existing in both Locations/ and Organizations/ (e.g., NAS Lemoore had one in each)
- Concept pages with/without parenthetical qualifiers (e.g., Immaculate Constellation vs Immaculate Constellation (IMCON))
- Operations/ vs Events/ classification disagreements (e.g., Hunter Warrior in both)
- TR-3B variant designations as separate concept pages (TR-3B, TR-3B Astra, TR-3B Black Manta, TR3B XF-131 Super Sentinel)

## Resolution
- Identify canonical page (most content OR correct spelling)
- Merge unique content into canonical
- Replace duplicates with redirect stubs (frontmatter redirect_to + one-line body)
- Update MOC files when applicable
- The "NSA Special Response Teams (SRTs)" page was actually about DOE SRTs — renamed during Castle video processing
- Peru Crash video: "Joe Staulia" was a speech-to-text variant of "Joseph Stafula" — required `mv` rename + full rewrite
- Peru Crash video: "Staff Sergeant Montgre" was a variant of "Staff Sergeant Montil" — redirect stub
- Event/Operation classification conflicts: "Operation Laser Strike" existed in both Events/ and Operations/ — Events/ version redirected to Operations/ canonical page
- Some event pages are created as duplicates of incident pages (e.g., "Crash Site Retrieval Mission" and "Jonathan Wagant UFO Crash Retrieval Encounter" both duplicated "Peru UFO Crash Incident")
