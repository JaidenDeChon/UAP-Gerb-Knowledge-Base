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
- Delete duplicates entirely with `rm` — do NOT create redirect stubs (they clutter the vault; Obsidian has no native redirect support)
- Update MOC files when applicable
- The "NSA Special Response Teams (SRTs)" page was actually about DOE SRTs — renamed during Castle video processing
- Peru Crash video: "Joe Staulia" was a speech-to-text variant of "Joseph Stafula" — required `mv` rename + full rewrite
- ARV TR-3B video: Area 51 had 6 variant pages (Area 51 Groom Lake, Area 51 (Groom Lake), Area 51  Groom Lake, Groom Lake (Area 51), plus canonical); Brad Sorenson had 3 variants (Brad, Brad Sorensen, Brad S); Edwards AFB had 2 variants (Edwards Air Force Base, California; Edwards 412th Test Wing); Helendale had 2 variants; Nellis AFB had 2 variants; Papoose Lake had 2 variants; Electrogravitics had 3 variant concept pages; SDI had 1 variant
- ARV TR-3B video: Lawrence Livermore had duplicate across Locations/ and Organizations/ directories — same entity, different category folders
- ARV TR-3B video: Belgian UFO Wave existed in Concepts/ but should be in Events/ — created redirect in Concepts/ pointing to Events/ canonical
- ARV TR-3B video: TREATS.md renamed to TREAT.md (correct acronym: Tactical Reconnaissance Engineering Assessment Team, not plural)
- Peru Crash video: "Staff Sergeant Montgre" was a variant of "Staff Sergeant Montil" — redirect stub
- Event/Operation classification conflicts: "Operation Laser Strike" existed in both Events/ and Operations/ — Events/ version redirected to Operations/ canonical page
- Some event pages are created as duplicates of incident pages (e.g., "Crash Site Retrieval Mission" and "Jonathan Wagant UFO Crash Retrieval Encounter" both duplicated "Peru UFO Crash Incident")
- ARV McCandlish video: "Mark Mandel" and "Mark Mandish" were both speech-to-text variants of "Mark McCandlish" — deleted both stubs; canonical is Mark McCandlish.md
- ARV McCandlish video: "Aviation Week" in Organizations was duplicate of "Aviation Week and Space Technology" — deleted stub
- ARV McCandlish video: "USAF Plant 42" existed in both Organizations/ (stub) and Locations/ (stub) — both deleted; canonical is Locations/Air Force Plant 42.md
- ARV McCandlish video: "Air Force Plant 42, Palmdale, California" in Locations was stub duplicate of "Air Force Plant 42" — deleted
- ARV McCandlish video: Immaculate Constellation existed in Operations/ as two pages and Concepts/ — deleted both Operations/ stubs; canonical is Concepts/Immaculate Constellation (IMCON).md
- DUMBs video: "Richard Solder" in People/ was speech-to-text variant of "Richard Sauder" — deleted stub, canonical is Richard Sauder.md
- DUMBs video: DUMB concept pages had 5 variants: "Deep Underground Military Bases (DUMBs)" (canonical), "Deep Underground Military Base (DUMB)", "DUMB (Deep Underground Military Base)", "DUMBs (Deep Underground Military Bases)", "Underground Facilities (DUMBs)" — deleted all 4 variants
- DUMBs video: Tunnel Boring Machine had 2 pages: "Tunnel Boring Machine (TBM)" (canonical) and "Tunnel Boring Machines" — deleted stub
- DUMBs video: Maglev had 2 pages: "Maglev Underground Transportation" (canonical) and "Maglev Underground Train Systems" — deleted stub
- DUMBs video: Subterranean Facility had 3 pages: "Subterranean Facility (STIF)" (canonical), "STIFF (Subterranean Facility)", "Subterranean Facility" — deleted 2 stubs
- FLYBY video: "Lou Elizondo" → consolidated into "Luis Elizondo" (nickname vs. full name pattern)
- FLYBY video: "Lieutenant Jacobs" + "Bob Jacobs" → consolidated into "Robert Jacobs" (rank/nickname vs. full name)
- FLYBY video: "Senate Intelligence Committee" → consolidated into "Senate Select Committee on Intelligence" (shortened vs. formal name)
- Lockheed Martin video: "Jim Ryder" → consolidated into "James T. Ryder" (informal vs. full name)
- Herrera Insights video: "Dr. Steven Greer" → consolidated into "Steven Greer" (with honorific vs. without)
- Herrera Insights video: "Shawn Kirkpatrick" / "Shan Kirkpatrick" → consolidated into "Sean Kirkpatrick" (speech-to-text vowel variants)
- Herrera Insights video: "Denver" → consolidated into "USS Denver" (missing ship prefix)
- Herrera Insights video: "The Daily Mail" → consolidated into "Daily Mail" (article prefix variant)
- Herrera Whistleblower video: "Joey.md" → consolidated into "Joey Is Not My Name" (short name vs. full handle)
- Herrera Whistleblower video: "Unknown InsiderOperative.md" → consolidated into "The Insider" (generic vs. specific name)
- Herrera Whistleblower video: "Carl Nell" / "Nell" / "Colonel Nell" → consolidated into "Karl Nell" (name spelling + rank prefix + bare surname variants)
- Herrera Whistleblower video: Duplicate directory "Michael Herrera UFO Whistleblower (ft. Joeyisnotmyname)" (without dash) deleted — canonical is with dash
- FLYBY video: "McMinnville UFO Photos" → consolidated into "McMinnville UFO Photographs" (trivial word variation)
- FLYBY video: Found 14+ SAP duplicate pages — systemic issue flagged for dedicated cleanup
- METAPOD video: "Lou Elizondo" → already consolidated (caught by FLYBY agent first)
- METAPOD video: AATIP had triplicates across Organizations/, Operations/, Concepts/ — consolidated into Operations/ canonical
- METAPOD video: "UAP Characteristics (AATIP)" → consolidated into "Five UAP Characteristics (AATIP)" (more descriptive name)
- Global Air Force video: "Vasa, Finland" → consolidated into "Vaasa, Finland" (correct modern Finnish spelling)
