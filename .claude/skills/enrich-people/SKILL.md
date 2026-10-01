---
name: enrich-people
description: Run the person-enricher agent on a loop, turning People pages into profiles (verified dates, a career chart, a timeline, a record of memos, testimony and interviews, a cast and claims) like the David Grusch and Robert Scandrett pilots, most-connected person first. Use when asked to enrich people, process People pages into the profile format, or run the people loop. Optional args are a page name to do just that one, or a number N to stop after N people.
---

# Enrich People pages on a loop

Drives `.claude/agents/person-enricher.md` one person at a time. The agent takes the most-connected People page not yet in `UAP Gerb Knowledge Base/.rich_people.json` (from `python3 scripts/enrich_people.py next`), verifies the person's dates, corrects the page against the transcripts, adds the components the material earns, verifies the page in the browser and commits locally. This skill repeats that, relays any component proposal to the user, sends each enriched page through the humanizer, and pushes.

## Arguments

- **A page name** (e.g. `Luis Elizondo`): run the agent once on that page, then stop.
- **A number N:** stop after N people.
- **No arguments:** keep going until the agent reports `ALL DONE`, or something blocks.

## Before the first iteration

Run `python3 scripts/enrich_people.py status` and tell the user how many People pages are enriched and how many remain.

## Each iteration

1. Dispatch the `person-enricher` agent in the foreground, one at a time. Parallel runs would pick the same person and collide on the ledger. Pass the page if one was given.
2. Read its report:
   - If it says `ALL DONE`, stop.
   - If it reports a blocker, tell the user what's blocking and stop.
   - If it has a `## Question for the user`, handle it exactly as the enrich-videos skill does (Approve, Decline, Change it; record the answer in `docs/component-proposals.md` and commit).
3. Dispatch the `page-humanizer` agent on the page the enricher just committed (pass its path), so every new sentence and caption is humanized. Spot-check its commit as the humanize-pages skill says.
4. Push every 5 people, and at the end: `git push -u origin <current branch>`. If there's no open PR for the branch, open one. Never push to the default branch.
5. Give the user a one-paragraph status per person: the dates added and their sources, any corrections, the components used.

## Pacing

Each run reads every summary and transcript passage about one person and checks dates online, so a well-connected person can take a long time. For an unattended loop, prefer `/loop /enrich-people 5` or a scheduled Routine that invokes this skill with a number.
