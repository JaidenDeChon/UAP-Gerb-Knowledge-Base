---
name: humanize-pages
description: Run the page-humanizer agent on a loop, one wiki page at a time, so every sentence on the site is checked against the humanizer skill and rewritten to sound human without losing details. Use when asked to humanize the wiki, clean up AI-sounding prose across pages, or run the humanizer loop. Optional args are a page path to do just that one, or a number N to stop after N pages.
---

# Humanize pages on a loop

Drives `.claude/agents/page-humanizer.md` one page at a time. The agent takes the next page from `python3 scripts/humanize_pages.py next`, goes through it sentence by sentence with `.claude/skills/humanizer/SKILL.md`, verifies with `scripts/humanize_pages.py check`, records the page in `UAP Gerb Knowledge Base/.humanized_pages.json`, and commits locally. This skill repeats that and pushes the results.

The queue walks `Home.md`, then `MOCs`, `Videos` (summaries only; transcripts are never touched), `Events`, `Operations`, `People`, `Organizations`, `Concepts`, `Locations`. After every page is done once, a page whose content changed since it was humanized comes back into the queue.

## Arguments

- **A page path:** run the agent once on that page, then stop.
- **A number N:** stop after N pages.
- **No arguments:** keep going until the agent reports `ALL DONE`, or something blocks.

## Before the first iteration

Run `python3 scripts/humanize_pages.py status` and tell the user how many pages are done and how many remain.

## Each iteration

1. Dispatch the `page-humanizer` agent in the foreground, one at a time and never in parallel. Parallel runs would take the same "next" page and collide on the ledger. Pass the page if one was given; otherwise give no target.
2. Read its report:
   - **`ALL DONE`** → stop.
   - **A blocker** (uncommitted changes on the page, a check it could not pass without losing meaning) → tell the user what's blocking and stop. Don't retry blindly.
3. Spot-check the commit. `git show --stat HEAD` must touch only that page and the ledger. Then skim `git show HEAD -- "<page>"` for a dropped qualifier (*allegedly*, *claims*, *according to*) or a changed fact. If you find one, fix it in a follow-up commit before moving on.
4. Push every 10 pages, and at the end: `git push -u origin <current branch>`. If there's no open PR for the branch, open one. Never push to the default branch.
5. Give the user a one-line status per page: path, sentences changed, main patterns removed.

## Pacing

Each page is a small run, but there are about a thousand pages. For an unattended sweep, prefer `/loop /humanize-pages 10` or a scheduled Routine that invokes this skill with a number, so each firing does a batch in a fresh context.
