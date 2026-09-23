---
name: enrich-videos
description: Run the video-enricher agent on a loop, turning video summaries into rich articles like the 80-year timeline pilot, newest-published first. Use when asked to enrich videos, process videos into the dynamic article format, or run the enrichment loop. Optional args are a video URL, id or title to do just that one, or a number N to stop after N videos.
---

# Enrich videos on a loop

Drives `.claude/agents/video-enricher.md` one video at a time. The agent picks the most recently published video not yet in `UAP Gerb Knowledge Base/.rich_videos.json`, ingests it first if needed, builds the rich article, verifies it, and commits locally. This skill repeats that, relays the agent's component proposals to the user, and pushes the results.

## Arguments

- **A video URL, id or title:** run the agent once on that video, then stop.
- **A number N:** stop after N videos.
- **No arguments:** keep going until the agent reports every video is enriched, or something blocks.

## Each iteration

1. Dispatch the `video-enricher` agent in the foreground, one at a time and never in parallel. Parallel runs would pick the same "newest un-enriched" video and collide on the ledger. Pass the video if one was given; otherwise give no target.
2. Read its report:
   - **"Every video is enriched"** → stop.
   - **A blocker** (channel listing failed, transcript IP-blocked, verification failed and couldn't be fixed) → tell the user what's blocking and stop. Don't retry blindly.
   - **`## Question for the user`** → ask the user with `AskUserQuestion`. Offer "Approve", "Decline" and "Change it" (their notes). Record the answer on that proposal in `docs/component-proposals.md`:
     - status `approved` or `declined`
     - the date
     - the user's notes

     Then commit that file. An approved proposal gets built by the agent at the start of its next run.
3. Push the branch (`git push -u origin <current branch>`). If there's no open PR for it, open one describing the enriched videos. Never push to the default branch.
4. Give the user a one-paragraph status: the video enriched, the components used, cue status, and any proposal decided. Then start the next iteration.

## Pacing

Each run is long: it reads a full transcript and verifies cues against captions. For an unattended loop, prefer `/loop /enrich-videos` or a scheduled Routine that invokes this skill with `1`, so each firing does exactly one video in a fresh context.
