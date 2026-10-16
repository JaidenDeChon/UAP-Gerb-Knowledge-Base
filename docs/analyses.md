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
| `contradiction` | Accounts that disagree on a name, date, place, sequence, number or who said what. This includes Gerb's coverage disagreeing with itself, and a page disagreeing with a transcript. | Video 4 puts the meeting in 1997; video 19 puts the same meeting in 1994. |
| `pattern` | The same mechanism recurring across three or more cases, at least two from different videos. | The same handoff from base security to an outside team, in four crash accounts. |

A contradiction is a finding, not an error report. Present both sides with their sources, say which the evidence favours if it does, and never "correct" a witness. If the contradiction is only an error in one of this vault's own pages (the transcript is clear and the page misread it), it isn't an analysis: fix the page instead and note the fix in the run's report.

## Confidence

Every analysis carries one label. Pick the lowest that fits.

| `confidence` | Means | Typical basis |
|---|---|---|
| `strong` | Each link in the chain is stated directly in a transcript or verified source. The inference is one small, obvious step. | Same named person, same named post, dates that overlap on the record. |
| `moderate` | The facts are solid, but joining them needs an assumption the evidence makes likely without proving it. | Probably the same person (same surname, rank and base), or the timing fits but the place is only regional. |
| `speculative` | Worth flagging, but it rests on a coincidence, an unverified identity or one ambiguous line. | A name that might be a mis-transcription; a date known only to the year. |

When a web page can't be fetched, a fact confirmed only by search-result snippets counts as verified if two independent results agree. If one snippet is all there is, the finding can be `moderate` at most.

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
- Confirm who is speaking before you attribute a quote. Cold-open montages, clips Gerb plays and interview cross-talk run speakers together in the captions. If the speaker isn't clear from the passage, say so ("a voice in the montage says") or don't rely on the quote.
- The page-humanizer pass runs after the writer, but write cleanly in the first place.
- Don't add an authorship note to the body. The app's header strip on every analysis already says that an AI research agent found and wrote it from the knowledge base and checked it against the transcripts.

## Publishing bar

All three confidence labels are published. A speculative analysis is worth a post when it's specific and honestly labelled; what keeps a lead out is the discard rules below, not its confidence.

## Discard rules

The writer discards a lead, and records why, when any of these hold:

- A transcript already makes the connection.
- The evidence doesn't say what the lead claims, or a quote doesn't appear in its source.
- It rests on a caption error, or on two different people who share a name.
- It's trivial: a shared country, decade or famous agency, or a contractor that turns up in every list of suspected contractors (Lockheed, Boeing, McDonnell Douglas, Northrop, Raytheon). A big name only counts when something specific to this case ties it in: a named person, site, contract or date.
- Its deciding premise can't be checked. If the finding stands or falls on a fact that is only Gerb's paraphrase of another source ("Gerb says the book says X"), that source has to be confirmed (a quote, a snippet of the passage, a second report of it). Otherwise discard the lead as unverifiable, and say what would revive it.
- It duplicates a published analysis. Extend that analysis instead, if the new evidence adds something.

A discarded lead is a good outcome. Publishing fewer, sounder analyses is the point.
