import { stemToPath } from './vault'

/**
 * Notes that moved folder, as `[old stem, new stem]`. A note's route comes
 * from its folder, so a move changes its address; these keep links people
 * have shared or bookmarked working, as permanent redirects (Nitro writes
 * them into Netlify's `_redirects`). Wikilinks inside the vault need nothing:
 * they name the note, not its folder.
 */
export const MOVED_NOTES: [string, string][] = [
  // October 2026: single-document pages into the new Documents folder.
  ["Concepts/Wilson-Davis Memo", "Documents/Wilson-Davis Memo"],
  ["Concepts/Hottel Memo", "Documents/Hottel Memo"],
  ["Concepts/AARO Historical Report Volume 1", "Documents/AARO Historical Report Volume 1"],
  ["Concepts/Alleged Leaked UAP Task Force Report", "Documents/Alleged Leaked UAP Task Force Report"],
  ["Concepts/Eisenhower Briefing Document", "Documents/Eisenhower Briefing Document"],
  ["Concepts/Special Operations Manual (SOM 1-01)", "Documents/Special Operations Manual (SOM 1-01)"],
  ["Concepts/Bowen Manuscript", "Documents/Bowen Manuscript"],
  ["Concepts/Denb Report", "Documents/Denb Report"],
  ["Concepts/Bechtel Tunneling Report (1974)", "Documents/Bechtel Tunneling Report (1974)"],
  ["Concepts/Beneath the Surface (Gallaudet White Paper)", "Documents/Beneath the Surface (Gallaudet White Paper)"],
  ["Concepts/Condon Report", "Documents/Condon Report"],
  ["Concepts/The Day After Roswell", "Documents/The Day After Roswell"],
  ["Concepts/USAF Regulation 200-2", "Documents/USAF Regulation 200-2"],
  ["Concepts/JANAP 146c", "Documents/JANAP 146c"],
  ["Concepts/OPNAV 3820", "Documents/OPNAV 3820"],
  ["Concepts/Executive Order 10501", "Documents/Executive Order 10501"],
  ["Concepts/Executive Order 13526", "Documents/Executive Order 13526"],
  ["Concepts/Atomic Energy Act of 1954", "Documents/Atomic Energy Act of 1954"],
  ["Events/Bob Fish Email to John Podesta", "Documents/Bob Fish Email to John Podesta"],
  ["Events/GAO Report on Army Guard Program", "Documents/GAO Report on Army Guard Program"],
  ["Events/Environmental Assessment Report on Avery Technical Center", "Documents/Environmental Assessment Report on Avery Technical Center"],
  ["Events/Schumer Amendment (NDAA)", "Documents/Schumer Amendment (NDAA)"],
  ["Operations/UAP Campaign Plan - Way Forward", "Documents/UAP Campaign Plan - Way Forward"],
]

/** `routeRules` redirecting each moved note's old route to its new one. */
export function movedNoteRedirects(): Record<string, { redirect: { to: string, statusCode: 301 } }> {
  return Object.fromEntries(MOVED_NOTES.map(([from, to]) =>
    [stemToPath(from), { redirect: { to: stemToPath(to), statusCode: 301 } }]))
}
