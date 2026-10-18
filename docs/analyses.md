# Analyses: the editorial standard

An *analysis* is a short, blog-style post in `UAP Gerb Knowledge Base/Analyses/` that sets out something the knowledge base supports but that Gerb's videos never said or never showed: a passage in a primary document that directly shows something significant; an outside record that confirms a claim from the videos; a connection between two people, programs or places; a coincidence in time; a contradiction between accounts; or a pattern that repeats across unrelated cases. Positive findings count as much as ones that knock a claim down. Two agents produce them:

- **`analysis-scout`** sweeps one slice of the vault and writes *leads* (candidate findings with evidence).
- **`analysis-writer`** takes the best lead, tries to break it, checks the web, and either writes the post or discards the lead.

The `analyze` skill drives both. `scripts/analyses.py` hands out slices, keeps the queue in `UAP Gerb Knowledge Base/.analyses.json`, and checks that every quote a scout cites appears verbatim in its source.

Both agents read this file at the start of every run.

## The evidence

The vault holds three kinds of source, and the agents use all of them:

- **Video transcripts** (`Videos/<title>/transcript.md`): what Gerb and the people he plays actually said. Ground truth for what the videos claim.
- **Primary documents**: `Documents/` holds a page for each memo, report, letter, regulation, law or leaked paper the videos touch on, and `Documents/Transcriptions/<Title> (Transcription).md` holds a clean full text of each hosted one, checked against the page images (see `docs/documents.md`). A transcription is primary evidence: it's an outside record that doesn't depend on the videos, so it can both support a finding and test what a video says a document says. The document's own page is this vault's description of it and can be wrong, like any wiki page.
- **The wiki's own pages** (summaries and entity pages): this vault's reading of the transcripts and documents. Useful for finding things, never the last word.

## What counts as a finding

A finding must be all three:

1. **Unsaid.** No video makes the connection (for a `smoking-gun` or `corroboration`, no video shows or quotes the passage, or the video mentions it in a way that understates what it says). When the videos make the broad point and only a narrower version is unsaid, the narrow version has to stand on its own as a finding. A date or two added to something Gerb already said usually doesn't. Gerb may cover both halves in different videos, or both in one video without putting them together; either qualifies. If a transcript already draws the line, even in passing, it is not a finding. Search the transcripts before believing otherwise.
2. **Supported.** Every fact it rests on is in the vault (a transcript, a document transcription, a summary or an entity page) and, for identifying facts such as dates, employers, ranks and places, checkable online. The *inference* is new; the facts are not.
3. **Worth a reader's time.** It changes how you read at least one video. "Both men worked in aerospace" or "both incidents happened in the United States" is not a finding. "The program manager Witness A names in 1997 ran the office Witness B says took the material in 1989" is. So is "a memo one video mentions in passing assigns named teams to recover objects that come down".

### The seven kinds

| `kind` | What it is | Example shape |
|---|---|---|
| `smoking-gun` | A passage in a primary document that directly shows something significant (an acknowledged program, a recovery, a transfer of material, an instruction to conceal, a named official's involvement) that the videos and wiki haven't highlighted or have understated. The passage carries it on its own words, read in context. The site labels it "Smoking gun". | An Air Force memo that one video mentions in passing assigns intelligence teams to recover objects that come down, and names the units. |
| `corroboration` | A claim from one of Gerb's videos, or from a witness he covers, that a primary document or a solid outside record independently confirms, where the video didn't show that confirmation. Framed fairly and positively. The site labels it "Confirmed". | A witness says his unit was put on alert in a given week; a declassified log, from a source the witness never saw, records the alert. |
| `hidden-link` | Two entities that never appear together are tied by a shared person, employer, base, contractor, document or date. | X's employer in video 12 is the contractor Y names in video 31. |
| `timeline` | Events from different videos that line up in time (and usually place) once they share one timeline. | The week of A's sighting is the week B says a recovery team deployed nearby. |
| `contradiction` | Sources that disagree on a name, date, place, sequence, number or who said what, in a way a slip can't explain (see "Contradiction or footnote?" below). | One witness puts the landing in 1954 and the filmed account puts it in 1964; the confirmation Gerb ties to one belongs to the other. |
| `change-of-view` | Gerb's own view or account of something shifts across several videos. Frame it as his understanding developing as new information reached him, and name that information where the dates point to it. It's not a contradiction, and never a gotcha. | In 2024 he describes a program as an official Pentagon effort; by 2026, after new interviews and records, he calls it a cover story. |
| `pattern` | The same mechanism recurring across three or more cases, at least two from different videos. | The same handoff from base security to an outside team, in four crash accounts. |

### Smoking gun, confirmation, or overreach?

The positive kinds carry the biggest risk of overreach, so they get the hardest test.

- **The passage has to say it.** A `smoking-gun` stands on the document's own words. Read the whole section around the passage, plus the document's date, author, addressee and purpose. A sentence that describes a hypothetical, quotes a rumour the author goes on to dismiss, sums up a public report, or sets out a contingency plan is not an admission. If the passage only shows something significant once you add an assumption, it's at most a `speculative` open question, and usually a different kind.
- **Consistent isn't confirmed.** A `corroboration` needs the record to state the same specific fact as the claim (the same person, place, unit, date or event) and to be independent of the claimant: not the witness's own later statement, a book that took the story from him, or a document he is known to have read before telling it. A document that only makes the claim plausible ("the base existed", "the agency did this kind of work") confirms nothing.
- **Already shown?** If a video quotes or shows the passage and draws the same conclusion, it's not a finding. If a video mentions the document but never shows what this passage says, or understates it, it can be.
- **Check the reading.** A finding that turns on one word must survive a look at the page image (`node scripts/fetch-documents.mjs page "<Title>" N` from `app/`). A bracketed reading in the transcription (`[word?]`, `[illegible]`, `[t]est`) can't carry a finding on its own. If the image can't settle it, say so plainly and label the finding `speculative`.
- **Provenance matters.** A `leaked` or `disputed` document (see `provenance` on its page) can't be a smoking gun for what it describes, only for what its existence shows. Say what the dispute is.
- **Outside records follow the usual rules.** Any outside fact a positive finding states as fact needs two independent sources, or one primary record (an archive or official catalog). Otherwise attribute it.

### Contradiction or footnote?

Before treating a disagreement as a contradiction, ask whether Gerb could simply have misspoken. That's always a realistic possibility, even when it isn't the likeliest one: a swapped acronym (DS&T for ODNI), a misremembered year, a gloss on a place name ("which is of course Roswell"), a paraphrase that drifts from the clip he has just played, or a date carried over from a neighbouring line.

- **If a single slip like that could explain it, it's a footnote, not an analysis.** It gets a short correction where it happens (see "Footnotes" below). No post is written.
- **It's a contradiction only when the disagreement is in the subject matter itself** and no slip explains it: witness against witness, document against document, a claim against the record, or one source's detail that breaks another source's story. The Holloman post is the model: the confirmation Gerb attaches to the 1954 story belongs to a different, filmed event.
- **A view Gerb has clearly changed** (stated one way in one video and another way in later videos, more than once) stays an analysis, framed as a change of view. Always say plainly that Gerb's understanding may have changed as new information reached him, name that information if the transcripts or the dates point to it, and never present the change as a gotcha. The Grusch and AARO post is the model.

A primary document makes a strong second source for a contradiction: if a video says a memo says X and the transcription says Y, that's a document-against-video contradiction, provided a slip doesn't explain it (a misremembered date in a passing remark is still a footnote).

A contradiction is a finding, not an error report. Present both sides with their sources, say which the evidence favours if it does, and never "correct" a witness. If the contradiction is only an error in one of this vault's own pages (the transcript is clear and the page misread it), it isn't an analysis: fix the page instead and note the fix in the run's report.

## Footnotes

A footnote corrects a probable slip. It isn't an analysis, so it carries no confidence or novelty labels. It appears in two places, both with the same text:

1. **On the sentence in the video's `summary.md`** where the slip is reported, as a GFM footnote: `...which is of course Roswell.[^gerb-condron-field]`, with `[^gerb-condron-field]: <the note>` at the end of the page. Footnote ids always start with `gerb-` and are unique across the vault.
2. **On the most relevant entity page**, the same way, on the sentence that repeats the slip. Leave the page's other text alone.

Adding a footnote doesn't change what a paragraph says, so it needs no `> [!edit]` card (see "Edit cards" in CLAUDE.md). If you also correct the paragraph's own wording, that correction does need one.

Never put a footnote in a page's opening paragraph: the app turns that paragraph into a plain-text lead and the marker would vanish. Footnote the first later sentence that carries the claim instead.

The note itself is one or two plain sentences: what Gerb says, what the record or the clip says, and a source. Phrase it as a likely slip, never as a gotcha: "Gerb glosses Condron Field as Roswell; Condron Field was the White Sands range airfield, about 130 miles away (WSMR Museum)." Quote the transcript verbatim. Corrections of outside facts follow the same verification rules as posts.

## Citing documents

- **Link the document's page** on first mention: `[[Hottel Memo]]`, never the transcription's file. Readers reach the transcription and the page images from the document's page.
- **Quote the transcription verbatim,** square brackets and all: `[illegible]`, `[sic]`, `[redacted (b)(6)]` stay as written. Never fill a redaction or an illegible word from elsewhere inside the quotation marks; if another source suggests the missing word, say so outside the quote.
- **Give the page or section.** Transcriptions have `## Page N` headings, and the page number matches the PDF, so write "page 4 of the memo" or "section 3.2 of the report". In the evidence list, cite as `[[Hottel Memo]], page 2`.
- **Be honest about the scan.** If a key reading rests on OCR that the transcription marks as doubtful, or the image is faint, say so in `## What cuts against it`. If there's no transcription, quote the copy at `source_url` and say which copy you used.
- **Say what kind of document it is**, in plain words, the first time: a 1950 FBI office memo, a 1995 report by Congress's auditors, a draft policy memo. Date, issuer and purpose often decide what a passage can mean.
- In `evidence` (the scout's leads) a document quote's `source` is the transcription file, `Documents/Transcriptions/<Title> (Transcription).md`, so the ingest check can find it.

## Confidence

Every analysis carries one label. Pick the lowest that fits.

| `confidence` | Means | Typical basis |
|---|---|---|
| `strong` | Each link in the chain is stated directly in a transcript or verified source. The inference is one small, obvious step. | Same named person, same named post, dates that overlap on the record. |
| `moderate` | The facts are solid, but joining them needs an assumption the evidence makes likely without proving it. | Probably the same person (same surname, rank and base), or the timing fits but the place is only regional. |
| `speculative` | Worth flagging, but it rests on a coincidence, an unverified identity or one ambiguous line. | A name that might be a mis-transcription; a date known only to the year. |

A library, archive or government catalog record (DTIC, the National Archives, a university repository) counts as primary verification for a document's title, number and date. When a web page can't be fetched, a fact confirmed only by search-result snippets counts as verified if two independent results agree. If one snippet is all there is, the finding can be `moderate` at most.

For a `smoking-gun`, `strong` means the passage is from a checked transcription (or confirmed on the page image), its context has been read, and it states the significant point in its own words. For a `corroboration`, `strong` means the record and the claim agree on a specific detail and the record is clearly independent of the claimant.

Common names, years that are crowded with events (1947, 1952, 1997), and caption errors in the transcripts all inflate apparent links. Weigh them before choosing a label.

## Novelty

The writer searches the web for each finding and records what it found:

| `novelty` | Means |
|---|---|
| `new` | No source found makes this connection. |
| `partly-known` | Researchers have noted part of it, or the same thing in a weaker form. |
| `known-elsewhere` | It's established outside the channel, just never made on it. Still worth writing: the post tells Gerb's audience something the videos left out, and cites who said it first. |

## The post

File: `UAP Gerb Knowledge Base/Analyses/<Headline>.md`. The headline is the file name, so keep it short and free of `/ : ? * " < > |`.

### Headline and dek

The headline and the dek are what a viewer sees on the index, so they have to make sense on the first read to someone who hasn't seen the post or the videos it draws on. Write them the way a person would say the finding out loud.

- **One idea, plain words.** Say what was found, not every variable behind it. "The ship said to have recovered a UFO in 1973 wasn't in the Pacific yet" works. "The pod in the Safeguard's logs fits Bluegill Triple Prime's own instrument pods" doesn't: it assumes the reader already knows the ship, the test and the log.
- **At most two names in a headline,** and only names viewers know (Grusch, Elizondo, Roswell, Lockheed). Leave witness codes, office acronyms, ship names, document numbers and project names a casual viewer won't recognise for the dek or the body, and explain them there.
- **No possessive shorthand.** Not "Gerb's Grusch", "Gerb's ATIP" or "Gerb's Kona Blue theory". Say what you mean: "How Gerb's view of Grusch and AARO changed", "Gerb's theory about why Kona Blue was blocked".
- **The dek is two or three short sentences,** each with one point: what Gerb or the source says, what the record shows, and why it matters. Spell out or explain every acronym and name a newcomer wouldn't know. No sentence should need rereading.
- **No compressed verbs or insider phrasing:** "Gerb rests X on Y", "fits", "sits oddly with", "runs back to". Say "Gerb's evidence for X is Y" or "doesn't match".
- **The opening paragraph follows the same rules.** Set the scene first (who or what this is about, and why it matters), then the specifics, one idea per sentence. Explain each acronym, office, program, document or minor person on first mention in a few plain words. Leave names and dates the opening doesn't need for the evidence section. About 80 to 150 words.
- **Positive findings say what the document shows,** in plain words, not that it's proof. "A 1961 Air Force memo names the teams sent to recover downed objects" works. "A 1950 FBI memo records the story of three saucers recovered in New Mexico" works, because it says what the memo records without claiming the story is true. "Smoking gun", "proof", "confirmed at last" and "bombshell" don't belong in a headline. For a confirmation, name what was confirmed and by what, as in "A 1995 congressional audit backs the claim that Roswell's outgoing messages were destroyed". These headlines are examples of the shape, not published findings.
- Keep it as narrow as the finding, but plainly worded. For an open question, hedge in plain words ("Tom DeLonge's NRO adviser may not have been Luis Elizondo"). Headlines can't end in a question mark, because the headline is the file name.

```yaml
---
title: "<Headline>"
date: 2026-10-16          # publication date
kind: smoking-gun         # smoking-gun | corroboration | hidden-link | timeline | contradiction | change-of-view | pattern
confidence: moderate      # strong | moderate | speculative
novelty: new              # new | partly-known | known-elsewhere
impact: 4                 # 4 | 5, from "Publishing bar"; drives the site's "Most significant" sort
dek: "One or two plain sentences saying what the analysis finds."
videos: ["<video folder title>", "..."]
tags: [analysis]
---
```

Body, in this order:

1. **Lead paragraph** (no heading): the finding in plain words, and why it matters to someone who has watched the videos.
2. `## The finding`: the claim stated precisely, with its limits.
3. `## The evidence`: numbered points. Each one names the video (wikilinked to its summary as `[[Videos/<title>/summary|<short title>]]`), the document (wikilinked to its page, with the page number) or the entity page, and quotes the transcript or transcription verbatim where the point rests on what someone said or wrote. Wikilink every entity on first mention. For a `smoking-gun`, the first point is the passage itself, quoted at enough length to show its context; for a `corroboration`, put the claim and the record that confirms it side by side.
4. `## How it fits together`: the reasoning, step by step. This is where a component can help: `::wiki-timeline` for a timeline finding, `::wiki-compare` for a contradiction, `::wiki-chain` for a handoff, `::wiki-roster` for a pattern's cases. Only use one when it shows the shape better than prose, and follow `docs/wiki-components.md` exactly.
5. `## What cuts against it`: other explanations, the weakest link, and what the evidence does not show. Never skip this section.
6. `## Already known?`: what the web check found, with links. Say plainly if nothing turned up.
7. `## What would settle it`: the document, record or question that would confirm or kill the finding.
8. `## Sources`: the vault pages and outside sources used.

Length: as short as the evidence allows, usually 400 to 900 words.

## Voice

- Write like a sharp researcher talking to a fellow viewer: plain, direct, curious, never breathless. No "bombshell", "explosive", "you won't believe".
- Call the presenter **Gerb**, never "the host" or "the narrator". Never wikilink his name; he has no page.
- Attribute every claim: "Fouche says", "according to Weygandt". A witness's account is reported, not endorsed and not debunked. The analysis's own inference is marked as inference: "this suggests", "if these are the same man".
- Quotes from transcripts are verbatim, including their stumbles. Fix nothing inside quotation marks.
- Never mention how the post was made: no "scout", "lead", "writer", "slice" or "the pipeline". The reader sees a researched post, not its workflow.
- Keep quotation marks out of the `dek`; put quotes in the body.
- Confirm who is speaking before you attribute a quote. Cold-open montages, clips Gerb plays and interview cross-talk run speakers together in the captions. If the speaker isn't clear from the passage, say so ("a voice in the montage says") or don't rely on the quote.
- The page-humanizer pass runs after the writer, but write cleanly in the first place.
- Don't add an authorship note to the body. The app's header strip on every analysis already says that an AI research agent found and wrote it from the knowledge base and checked it against the transcripts.

## Publishing bar

Only the juiciest findings are published, positive or negative. "Juicy" is about **impact**, not confidence: how much the finding changes the story of a subject viewers care about. Every lead carries an `impact` score.

| `impact` | Means | Example shape |
|---|---|---|
| 5 | Changes how a central case, person or program reads: a flagship witness's account, where crash material went, who controlled a program, whether a key document holds together. | The officer a famous witness says briefed him was elsewhere that year; the custody chain of a major crash runs through a different agency than every video assumes; an official document assigns the recovery of downed objects to a named unit; a record independent of a flagship witness confirms the core of his account. |
| 4 | Materially changes a significant thread about a well-covered subject. | A senior official's dates put him on the other side of the contractor line during an episode Gerb treats as central; a document shows a named official directing secrecy about a case the videos cover. |
| 3 | An interesting detail that changes a minor thread. | Two minor figures from different videos served at the same base. |
| 1-2 | Trivia, or a correction with no consequence for the story. | A date off by a year in a passing remark. |

- **Impact 4 or 5 is required to publish.** Below 4, a lead is shelved (or footnoted if it's a slip), however solid it is.
- **Confidence and impact trade off.** `strong` or `moderate` needs impact 4 or more. `speculative` needs impact 5: a low-confidence finding is only worth a reader's time when it would matter a lot if true.
- **Prefer the big subjects.** A finding about one of the most-referenced people, programs or cases (`python3 scripts/analyses.py signals focus`) is worth more than the same finding about a minor one. Impact 5 almost always involves one of them.
- **The positive kinds meet the same bar.** A confirmation of a side detail (the witness really was in the Navy, the base really exists) is impact 1 to 3 and is shelved. A confirmation counts when it backs the part of an account that matters: the event itself, the custody, the people named. A smoking gun counts when what the passage shows would change how a viewer reads a central case or program. And a well-known passage the videos already lean on isn't one, however strong.
- **Score honestly after the break-it phase,** not before. A lead the scout scored 4 that shrinks to a minor point once narrowed is shelved.

**Downgrade before you discard,** as long as the bar above still holds. When a lead's facts check out but the inference is weaker than the scout claimed (the timing fits more than one explanation, the match isn't unique, the premise rests on a source that can't be checked from here), don't discard it. Narrow the claim to what the evidence does support and publish it as a `speculative` *open question*:

- The headline asks or states the narrower point, never the scout's stronger one.
- It's short, about 300 to 750 words including quotes (verbatim quotes run long), and uses the usual sections. `## What cuts against it` comes straight after `## The finding`, ahead of the evidence, so the reader meets the weaknesses first.
- `## What would settle it` names the specific document, passage or record that would confirm or kill it.

"Publishing fewer, sounder analyses" still holds for anything labelled `strong` or `moderate`.

## Discard rules

The writer discards a lead, and records why, when any of these hold:

- A transcript already makes the connection.
- The evidence doesn't say what the lead claims and no narrower claim survives, or a quote doesn't appear in its source.
- It rests on a caption error, or on two different people who share a name.
- It's trivial: a shared country, decade or famous agency, or a contractor that turns up in every list of suspected contractors (Lockheed, Boeing, McDonnell Douglas, Northrop, Raytheon). A big name only counts when something specific to this case ties it in: a named person, site, contract or date.
- Its deciding premise can't be checked *and* nothing specific is left once that premise is set aside. If the finding stands or falls on Gerb's paraphrase of another source ("Gerb says the book says X") that can't be confirmed, it can still run as a speculative open question, provided the post says plainly that the premise is unconfirmed and what would confirm it.
- It's a probable slip (see "Contradiction or footnote?"). Write a footnote instead and resolve the lead as `footnoted`.
- It duplicates a published analysis. Extend that analysis instead, if the new evidence adds something.
- *Smoking gun:* the passage doesn't say it once read in context (it's hypothetical, quoted to be dismissed, a summary of someone else's claim, or about something else); the key word is an OCR misreading or a doubtful bracketed reading the page image doesn't settle and nothing else carries the finding; the document is `disputed` or `leaked` and the finding needs it to be genuine; or a video already quotes the passage and draws the same conclusion.
- *Corroboration:* the record is only consistent with the claim and doesn't state the same specific fact; it isn't independent of the claimant (his own later statement, a book that took the story from him, a document he had read); the confirmed detail is incidental to the account; or a video already shows the confirmation.

A discarded lead is a good outcome when one of these holds. When none does, downgrade instead (see "Publishing bar").
