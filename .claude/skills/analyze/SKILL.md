---
name: analyze
description: Run the analyses pipeline, which finds connections, coincidences, contradictions and patterns that the knowledge base supports but Gerb's videos never stated, and publishes the ones that hold up as blog-style posts in the Analyses section. Parallel analysis-scout agents sweep slices of the vault into a leads queue; one analysis-writer at a time tests the best lead, checks the web, and writes or discards it. Use when asked to analyze the knowledge base, find hidden connections, write analyses, or run the analyses loop. Optional args are a number N to stop after N leads are resolved, `scout` or `scout K` to only sweep K slices, or a lead id (e.g. L0007) to write just that one.
---

# Analyses on a loop

Drives `.claude/agents/analysis-scout.md` and `.claude/agents/analysis-writer.md` through `scripts/analyses.py`. The standard both agents follow is `docs/analyses.md`.

## Arguments

- **A lead id** (e.g. `L0007`): run the writer once on that lead, then the humanizer, then stop.
- **`scout`** or **`scout K`**: run one scouting round of K slices (default 3), ingest, report, and stop.
- **A number N:** stop after N leads are resolved (written or discarded).
- **No arguments:** keep going until the queue is empty and every slice has been swept, or something blocks.

## Before the first iteration

Run `python3 scripts/analyses.py status` and tell the user how many analyses are published, how many leads are open, and how many slices have been swept.

If it lists slices that were handed out but never ingested (a scout died mid-run), check `.analysis_inbox/` for their leads files and run `python3 scripts/analyses.py ingest`. Any slice still without a leads file can be dropped from `slices` in `UAP Gerb Knowledge Base/.analyses.json` so it's handed out again.

## Each iteration

1. **Scout when the queue runs low.** If fewer than 5 leads are open (`python3 scripts/analyses.py list`), run a scouting round:
   1. `python3 scripts/analyses.py next-slices 3`. It prints one entry per slice, each with its `slice` id, `packet` and `leads_file`, rotating through the lenses with `focus` (one of the most-referenced subjects) every other slice.
   2. Dispatch one `analysis-scout` per slice **in a single message so they run in parallel**, passing each its slice id, packet path and leads-file path. Keep it to 3 at a time.
   3. When all have returned, run `python3 scripts/analyses.py ingest` and commit `UAP Gerb Knowledge Base/.analyses.json` with a message like `Scout analysis leads: S004-S006 (7 leads)`.
   4. Pass on to the user any page errors the scouts reported. Don't fix them here.
   5. If `next-slices` prints nothing (`ALL SWEPT`) and no leads are open, report that and stop.
2. **Footnotes, in batches.** When no open lead is left (`python3 scripts/analyses.py next` prints `NO LEADS`) but `next-footnote` has candidates, dispatch one `analysis-writer` to footnote up to three of them in one run (the footnote route in its instructions), then continue. Footnotes are cheap and never outrank a real lead.
3. **Write one lead.** Dispatch `analysis-writer` in the foreground, one at a time (parallel writers would take the same lead). Pass the lead id if one was given.
4. **Humanize.** If the writer published a post, dispatch `page-humanizer` on that post's path. Spot-check its commit as the humanize-pages skill says: every fact, quote, wikilink and the frontmatter must survive.
5. **Push** after every 3 resolved leads, and at the end: `git push -u origin <current branch>`. If there's no open PR for the branch, open one. Never push to the default branch.
6. **Report** each resolved lead to the user in a short paragraph: the headline and decision, the kind, confidence and novelty, and the single strongest piece of evidence, or the reason for the discard.

## Pacing and cost

A scouting round is three agents reading tens of thousands of tokens each. A writer reads every source passage and searches the web. The script's own signal-finding takes about 30 seconds and costs nothing. For an unattended run, prefer `/loop /analyze 3` or a scheduled task that invokes this skill with a number.

## Tuning

The thresholds that shape the slices (pairs per links slice, the transcript proximity window, the minimum number of videos for an accounts subject) are constants at the top of `scripts/analyses.py`. Use `python3 scripts/analyses.py signals <lens>` to preview a lens before changing them. Editorial rules (what counts, the confidence labels, the voice) live only in `docs/analyses.md`, so change them there and both agents pick it up.
