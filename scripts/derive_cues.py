#!/usr/bin/env python3
"""Derive timeline cue timestamps by matching chronology entries to captions.

Timestamps are approximate by construction: captions are a rolling transcript,
not a chapter list. This script can only score candidate windows by shared
distinctive tokens — that score is useful for ranking candidates, but it is
NOT evidence that the window is actually correct (a window can outscore the
right one purely on an incidental phrase match). So every cue this script
emits is written with "confidence": "low", regardless of score. "high" is
reserved for cues a human has since read against the live caption track and
confirmed word-for-word; that promotion happens by hand, after this script
runs, never automatically here.
"""
import argparse, json, os, re, sys
from youtube_transcript_api import YouTubeTranscriptApi

STOP = {
    'the','a','an','of','and','to','in','on','at','for','with','by','from','as',
    'that','this','it','is','was','were','be','been','has','have','had','his',
    'her','its','their','they','he','she','we','you','i','but','or','not','are',
}
WINDOW_SECONDS = 45

def tokens(text):
    """Distinctive tokens: capitalised words and four-digit years, lowercased.

    NOTE this is a recall-only signal: score = hit / len(want), with no
    precision term. An entry with few distinctive tokens (or an incidental
    phrase shared with an unrelated passage elsewhere in the video) can score
    1.0 on a window that isn't actually about it -- that is exactly the
    mechanism that mislanded a "1963, CIA Directorate of Science and
    Technology founded" cue 67 minutes away, onto an unrelated window that
    happened to contain the same phrase in passing. The scoring is good
    enough for ranking candidate windows, but it is NOT evidence that the
    top-ranked window is correct. That is why every cue below is written out
    at "confidence": "low" -- human review of the actual caption text is not
    a formality, it is the only thing that can catch this failure mode.
    """
    out = set()
    for w in re.findall(r"\b[A-Z][A-Za-z'-]{2,}\b", text):
        if w.lower() not in STOP:
            out.add(w.lower())
    out.update(re.findall(r'\b(?:18|19|20)\d{2}\b', text))
    return out

def windows(segments):
    """Rolling WINDOW_SECONDS windows over the caption track."""
    out, i = [], 0
    while i < len(segments):
        start = segments[i].start
        text, j = [], i
        while j < len(segments) and segments[j].start - start < WINDOW_SECONDS:
            text.append(segments[j].text)
            j += 1
        out.append((start, ' '.join(text)))
        i += max(1, (j - i) // 2)  # 50% overlap so a phrase cannot fall in a seam
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--video-id', required=True)
    ap.add_argument('--chronology', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--force', action='store_true',
        help='Overwrite --out even if it already exists.')
    args = ap.parse_args()

    if os.path.exists(args.out) and not args.force:
        sys.exit(
            f'{args.out} already exists and --force was not given.\n'
            'Refusing to overwrite it: an existing cues.json may contain '
            'hand-verified timestamps (confidence: "high") that this script '
            'has no way to reproduce -- it can only re-derive fresh "low" '
            'confidence guesses. If you are sure you want to discard '
            'whatever is there now, re-run with --force.'
        )

    rows = json.load(open(args.chronology))
    segments = list(YouTubeTranscriptApi().fetch(
        args.video_id, languages=['en', 'en-US', 'en-GB']))
    print(f'{len(segments)} caption segments', file=sys.stderr)

    wins = [(t, txt, tokens(txt)) for t, txt in windows(segments)]
    cues = []
    for row in rows:
        want = tokens(f"{row['title']} {row.get('summary', '')}")
        want |= {e.lower() for e in row.get('entities', [])}
        want |= set(re.findall(r'\b(?:18|19|20)\d{2}\b', row['date']))
        if not want:
            continue
        best_t, best_score, best_text = None, 0.0, ''
        for t, txt, have in wins:
            hit = len(want & have)
            if not hit:
                continue
            score = hit / len(want)
            if score > best_score:
                best_t, best_score, best_text = t, score, txt
        if best_t is None:
            continue
        cues.append({
            't': int(best_t),
            'label': row['title'],
            # Always "low" here: a token-overlap score is a ranking signal,
            # not proof the window is correct. "high" is applied only by a
            # human who has read this cue's caption window and confirmed it.
            # best_score (unused past this point) still gates nothing else.
            'confidence': 'low',
            # Wider than a token-overlap score needs, on purpose: 120 chars
            # was not enough to show WHY a window scored well, which made a
            # correct cue look unsupported on a later audit. Human review
            # should still re-derive this excerpt from the final, possibly
            # hand-corrected `t` (see the coordinator fix that regenerated
            # cues.json's match fields) rather than trust this raw one.
            'match': best_text[:280],
        })

    cues.sort(key=lambda c: c['t'])
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(cues, f, indent=2, ensure_ascii=False)
    print(f'wrote {len(cues)} cues (all "low" confidence pending hand-verification) to {args.out}', file=sys.stderr)

if __name__ == '__main__':
    main()
