# Analyses: the editorial standard

An *analysis* is a short, blog-style post in `UAP Gerb Knowledge Base/Analyses/` that sets out something the knowledge base supports but that Gerb's videos never said: a connection between two people, programs or places; a coincidence in time; a contradiction between accounts; or a pattern that repeats across unrelated cases. Two agents produce them:

- **`analysis-scout`** sweeps one slice of the vault and writes *leads* (candidate findings with evidence).
- **`analysis-writer`** takes the best lead, tries to break it, checks the web, and either writes the post or discards the lead.

The `analyze` skill drives both. `scripts/analyses.py` hands out slices, keeps the queue in `UAP Gerb Knowledge Base/.analyses.json`, and checks that every quote a scout cites appears verbatim in its source.

Both agents read this file at the start of every run.

## What counts as a finding

A finding must be all three:

1. **Unsaid.** No video makes the connection. When the videos make the broad point and only a narrower version is unsaid, the narrow version has to stand on its own as a finding. A date or two added to something Gerb already said usually doesn't. Gerb may cover both halves in different videos, or both in one video without putting them together; either qualifies. If a transcript already draws the line, even in passing, it is not a finding. Search the transcripts before believing otherwise.
2. **Supported.** Every fact it rests on is in the vault (a transcript, a summary or an entity page) and, for identifying facts such as dates, employers, ranks and places, checkable online. The *inference* is new; the facts are not.
3. **Worth a reader's time.** It changes how you read at least one video. "Both men worked in aerospace" or "both incidents happened in the United States" is not a finding. "The program manager Witness A names in 1997 ran the office Witness B says took the material in 1989" is.

### The four kinds

| `kind` | What it is | Example shape |
|---|---|---|
| `hidden-link` | Two entities that never appear together are tied by a shared person, employer, base, contractor, document or date. | X's employer in video 12 is the contractor Y names in video 31. |
| `timeline` | Events from different videos that line up in time (and usually place) once they share one timeline. | The week of A's sighting is the week B says a recovery team deployed nearby. |
| `contradiction` | Sources that disagree on a name, date, place, sequence, number or who said what, in a way a slip can't explain (see "Contradiction or footnote?" below). It also covers a view Gerb has clearly changed across several videos. | One witness puts the landing in 1954 and the filmed account puts it in 1964; the confirmation Gerb ties to one belongs to the other. |
| `pattern` | The same mechanism recurring across three or more cases, at least two from different videos. | The same handoff from base security to an outside team, in four crash accounts. |

### Contradiction or footnote?

Before treating a disagreement as a contradiction, ask whether Gerb could simply have misspoken. That's always a realistic possibility, even when it isn't the likeliest one: a swapped acronym (DS&T for ODNI), a misremembered year, a gloss on a place name ("which is of course Roswell"), a paraphrase that drifts from the clip he has just played, or a date carried over from a neighbouring line.

- **If a single slip like that could explain it, it's a footnote, not an analysis.** It gets a short correction where it happens (see "Footnotes" below). No post is written.
- **It's a contradiction only when the disagreement is in the subject matter itself** and no slip explains it: witness against witness, document against document, a claim against the record, or one source's detail that breaks another source's story. The Holloman post is the model: the confirmation Gerb attaches to the 1954 story belongs to a different, filmed event.
- **A view Gerb has clearly changed** (stated one way in one video and another way in later videos, more than once) stays an analysis, framed as a change of view. Always say plainly that Gerb's understanding may have changed as new information reached him, name that information if the transcripts or the dates point to it, and never present the change as a gotcha. The Grusch and AARO post is the model.

A contradiction is a finding, not an error report. Present both sides with their sources, say which the evidence favours if it does, and never "correct" a witness. If the contradiction is only an error in one of this vault's own pages (the transcript is clear and the page misread it), it isn't an analysis: fix the page instead and note the fix in the run's report.

## Footnotes

A footnote corrects a probable slip. It isn't an analysis, so it carries no confidence or novelty labels. It appears in three places, all with the same text:

1. **On the sentence in the video's `summary.md`** where the slip is reported, as a GFM footnote: `...which is of course Roswell.[^gerb-condron-field]`, with `[^gerb-condron-field]: <the note>` at the end of the page. Footnote ids always start with `gerb-` and are unique across the vault.
2. **On the most relevant entity page**, the same way, on the sentence that repeats the slip. Leave the page's other text alone.
3. **On the log page** `UAP Gerb Knowledge Base/Analyses/Footnotes and Corrections.md` (frontmatter `kind: footnotes`, `title: "Footnotes and Corrections"`), as one `## <short title>` entry, newest first. Each entry gives the date, what the video says (verbatim), the likely correction, the source for the correction, and links to the summary and entity page it's footnoted on.

Adding a footnote doesn't change what a paragraph says, so it needs no `> [!edit]` card (see "Edit cards" in CLAUDE.md). If you also correct the paragraph's own wording, that correction does need one.

Never put a footnote in a page's opening paragraph: the app turns that paragraph into a plain-text lead and the marker would vanish. Footnote the first later sentence that carries the claim instead.

The note itself is one or two plain sentences: what Gerb says, what the record or the clip says, and a source. Phrase it as a likely slip, never as a gotcha: "Gerb glosses Condron Field as Roswell; Condron Field was the White Sands range airfield, about 130 miles away (WSMR Museum)." Quote the transcript verbatim. Corrections of outside facts follow the same verification rules as posts.

## Confidence

Every analysis carries one label. Pick the lowest that fits.

| `confidence` | Means | Typical basis |
|---|---|---|
| `strong` | Each link in the chain is stated directly in a transcript or verified source. The inference is one small, obvious step. | Same named person, same named post, dates that overlap on the record. |
| `moderate` | The facts are solid, but joining them needs an assumption the evidence makes likely without proving it. | Probably the same person (same surname, rank and base), or the timing fits but the place is only regional. |
| `speculative` | Worth flagging, but it rests on a coincidence, an unverified identity or one ambiguous line. | A name that might be a mis-transcription; a date known only to the year. |

A library, archive or government catalog record (DTIC, the National Archives, a university repository) counts as primary verification for a document's title, number and date. When a web page can't be fetched, a fact confirmed only by search-result snippets counts as verified if two independent results agree. If one snippet is all there is, the finding can be `moderate` at most.

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

```yaml
---
title: "<Headline>"
date: 2026-10-16          # publication date
kind: hidden-link         # hidden-link | timeline | contradiction | pattern
confidence: moderate      # strong | moderate | speculative
novelty: new              # new | partly-known | known-elsewhere
dek: "One or two plain sentences saying what the analysis finds."
videos: ["<video folder title>", "..."]
tags: [analysis]
---
```

Body, in this order:

1. **Lead paragraph** (no heading): the finding in plain words, and why it matters to someone who has watched the videos.
2. `## The finding`: the claim stated precisely, with its limits.
3. `## The evidence`: numbered points. Each one names the video (wikilinked to its summary as `[[Videos/<title>/summary|<short title>]]`) or the entity page, and quotes the transcript verbatim where the point rests on what someone said. Wikilink every entity on first mention.
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

All three confidence labels are published. A speculative analysis is worth a post when it's specific and honestly labelled; what keeps a lead out is the discard rules below, not its confidence.

**Downgrade before you discard.** When a lead's facts check out but the inference is weaker than the scout claimed (the timing fits more than one explanation, the match isn't unique, the premise rests on a source that can't be checked from here), don't discard it. Narrow the claim to what the evidence does support and publish it as a `speculative` *open question*:

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

A discarded lead is a good outcome when one of these holds. When none does, downgrade instead (see "Publishing bar").
