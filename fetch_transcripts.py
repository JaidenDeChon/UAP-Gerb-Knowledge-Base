#!/usr/bin/env python3
"""
UAP Gerb Transcript Fetcher
============================
Fetches full transcripts for all UAP Gerb YouTube videos and stores them in
video folders as transcript.md files under Videos/{video-name}/ in the vault.
Transcripts are fetched sequentially with delays between requests to be respectful to YouTube servers.

Requirements (install once):
    pip install yt-dlp youtube-transcript-api

Usage:
    # First run — fetch all available transcripts:
    python fetch_transcripts.py

    # Subsequent runs — only fetch transcripts for new videos:
    python fetch_transcripts.py --new-only

    # Fetch transcript for a single video by URL:
    python fetch_transcripts.py --url https://www.youtube.com/watch?v=VIDEO_ID

    # Limit how many videos are processed (useful for testing):
    python fetch_transcripts.py --limit 5

    # Add delay between requests to avoid rate limiting:
    python fetch_transcripts.py --delay 2.0

    # Use browser cookies to avoid IP blocks (see COOKIES.md for setup):
    python fetch_transcripts.py --cookies cookies.txt

IP Blocking / Rate Limiting:
    If you see "IpBlocked" errors, YouTube is rate-limiting your requests.
    Solutions:
    1. Use --delay 2.0 to slow down requests
    2. Export cookies from your browser (see below)
    3. Wait a few hours before retrying

Exporting Cookies (to avoid IP blocks):
    1. Install a browser extension like "Get cookies.txt LOCALLY"
       Chrome: https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc
       Firefox: https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/
    2. Visit youtube.com and make sure you're logged in
    3. Click the extension icon and export cookies.txt
    4. Save it in this directory as cookies.txt
    5. Run: python fetch_transcripts.py --cookies cookies.txt
"""

import re
import json
import sys
import subprocess
import threading
import time
from pathlib import Path
from datetime import datetime
from typing import Optional

# ── Configuration ──────────────────────────────────────────────────────────────

CHANNEL_URL = "https://www.youtube.com/@UAPGerb/videos"

# Absolute path to your Obsidian vault root
VAULT_PATH = Path(__file__).parent / "UAP Gerb Knowledge Base"

# How long (seconds) to wait for a single transcript fetch before giving up
FETCH_TIMEOUT = 900  # 15 minutes

# Delay between transcript requests (seconds) — helps avoid rate limiting
REQUEST_DELAY = 10.0

# ── Paths ──────────────────────────────────────────────────────────────────────

VIDEOS_DIR = VAULT_PATH / "Videos"
FETCHED_LOG = VAULT_PATH / ".fetched_transcripts.json"


# ── Log helpers ────────────────────────────────────────────────────────────────

def load_fetched() -> dict:
    """Load the set of already-fetched video IDs from the JSON log."""
    if FETCHED_LOG.exists():
        return json.loads(FETCHED_LOG.read_text(encoding="utf-8"))
    return {}


def save_fetched(log: dict):
    """Persist the fetched-transcript log to disk."""
    FETCHED_LOG.write_text(json.dumps(log, indent=2), encoding="utf-8")


# ── Filename helpers ───────────────────────────────────────────────────────────

def safe_title(text: str) -> str:
    """Sanitize text for use as an Obsidian page title / filename."""
    return re.sub(r'[\\/:*?"<>|#^[\]]', '', text).strip()


def sanitize_folder_name(title: str) -> str:
    """
    Sanitize a video title to be a valid folder name.
    Replaces colons with dashes (for Obsidian compatibility).
    Matches the logic in reorganize_videos.py.
    """
    # First, sanitize any problematic characters
    sanitized = safe_title(title)
    # Then replace colons with dashes in the original title
    sanitized = title.replace(':', ' -')
    # Remove other problematic characters
    sanitized = re.sub(r'[\\/*?"<>|#^[\]]', '', sanitized).strip()
    return sanitized


# ── Video discovery ────────────────────────────────────────────────────────────

def get_channel_videos() -> list[dict]:
    """Use yt-dlp to list all videos on the UAP Gerb channel."""
    print("📡 Fetching video list from UAP Gerb channel...")
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--flat-playlist",
        "--print", "%(id)s|%(title)s|%(upload_date)s|%(duration)s|%(url)s",
        CHANNEL_URL,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    videos = []
    for line in result.stdout.strip().splitlines():
        parts = line.split("|", 4)
        if len(parts) < 4:
            continue
        vid_id, title, upload_date, duration = parts[0], parts[1], parts[2], parts[3]
        url = parts[4] if len(parts) > 4 else f"https://www.youtube.com/watch?v={vid_id}"
        if upload_date and len(upload_date) == 8:
            upload_date = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:]}"
        videos.append({
            "id": vid_id,
            "title": title,
            "date": upload_date or "",
            "duration": int(duration) if duration.isdigit() else 0,
            "url": url,
        })
    print(f"  Found {len(videos)} videos.")
    return videos


# ── Transcript fetch ───────────────────────────────────────────────────────────

def fetch_transcript(video_id: str, cookies_path: Optional[str] = None) -> Optional[str]:
    """
    Fetch the full transcript for a video using YouTubeTranscriptApi.
    Returns the full text as a single string, or None if unavailable.
    
    Args:
        video_id: YouTube video ID
        cookies_path: Path to Netscape-format cookies.txt file (optional, helps avoid IP blocks)
    """
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        
        # Create API instance with cookies if provided
        if cookies_path:
            api = YouTubeTranscriptApi(cookies=cookies_path)
        else:
            api = YouTubeTranscriptApi()
        
        # Fetch transcript
        fetched = api.fetch(video_id)
        return " ".join(seg.text for seg in fetched)
    except Exception as e:
        # Return None for any error (including IpBlocked, TranscriptsDisabled, etc.)
        return None


def fetch_transcript_with_timeout(
    video_id: str,
    timeout: int = FETCH_TIMEOUT,
    cookies_path: Optional[str] = None
) -> Optional[str]:
    """
    Wrapper around fetch_transcript that enforces a wall-clock timeout.
    Returns None and prints a warning if the fetch exceeds `timeout` seconds.
    """
    result_holder: list[Optional[str]] = [None]
    error_holder: list[Optional[Exception]] = [None]

    def _fetch():
        try:
            result_holder[0] = fetch_transcript(video_id, cookies_path)
        except Exception as e:
            error_holder[0] = e

    thread = threading.Thread(target=_fetch, daemon=True)
    thread.start()
    thread.join(timeout=timeout)

    if thread.is_alive():
        # Thread is still running — the fetch timed out
        return None

    if error_holder[0]:
        return None

    return result_holder[0]


# ── Transcript writer ──────────────────────────────────────────────────────────

def write_transcript(video: dict, transcript: str) -> Path:
    """
    Write the transcript to Videos/<video-folder>/transcript.md and return
    the path of the written file. Also creates summary.md if it doesn't exist.
    """
    folder_name = sanitize_folder_name(video["title"])
    video_folder = VIDEOS_DIR / folder_name
    video_folder.mkdir(parents=True, exist_ok=True)
    
    # Write transcript.md
    transcript_path = video_folder / "transcript.md"
    transcript_content = f"""---
title: "{video['title'].replace('"', "'")}"
video_id: {video['id']}
url: {video['url']}
date: {video['date']}
duration_seconds: {video['duration']}
channel: UAP Gerb
tags:
  - transcript
  - uap-gerb
---

# {video['title']}

*Source: [YouTube]({video['url']})*

---

{transcript}
"""
    transcript_path.write_text(transcript_content, encoding="utf-8")
    
    # Create summary.md if it doesn't exist
    summary_path = video_folder / "summary.md"
    if not summary_path.exists():
        summary_content = f"""---
title: "{video['title'].replace('"', "'")}"
video_id: {video['id']}
url: {video['url']}
date: {video['date']}
channel: UAP Gerb
tags:
  - video
  - uap-gerb
---

# {video['title']}

*[Watch on YouTube]({video['url']})*

## Overview

<!-- Add video summary here -->

## Key Points

<!-- Add key points here -->

## Related

<!-- Add links to related wiki pages here -->
"""
        summary_path.write_text(summary_content, encoding="utf-8")
    
    return transcript_path


# ── Per-video task ─────────────────────────────────────────────────────────────


def process_video(
    video: dict,
    fetched_log: dict,
    cookies_path: Optional[str] = None,
    delay: float = REQUEST_DELAY,
) -> tuple[bool, dict]:
    """
    Fetch and write the transcript for one video.

    Returns (success: bool, updated_entry: dict | {}).
    """
    vid_id = video["id"]
    title = video["title"]

    print(f"  ⏳ Fetching: {title} ({vid_id})")

    transcript = fetch_transcript_with_timeout(vid_id, timeout=FETCH_TIMEOUT, cookies_path=cookies_path)

    if transcript is None:
        print(f"  ❌ No transcript: {title} ({vid_id})")
        # Add delay even after failures to avoid hammering the server
        if delay > 0:
            time.sleep(delay)
        return False, {}

    filepath = write_transcript(video, transcript)
    char_count = len(transcript)
    print(
        f"  ✅ Saved ({char_count:,} chars): {filepath.name}"
    )
    
    # Add delay after successful fetch to avoid rate limiting
    if delay > 0:
        time.sleep(delay)
    
    entry = {
        "title": title,
        "fetched_at": datetime.now().isoformat(),
        "chars": char_count,
        "file": str(filepath.relative_to(VAULT_PATH)),
    }
    return True, entry


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Fetch and store UAP Gerb video transcripts in the Obsidian vault."
    )
    parser.add_argument(
        "--new-only",
        action="store_true",
        help="Only fetch transcripts for videos not already in the log.",
    )
    parser.add_argument(
        "--url",
        type=str,
        default=None,
        help="Fetch transcript for a single video URL.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most N videos (useful for testing).",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=REQUEST_DELAY,
        help=f"Seconds to wait between transcript fetches (default: {REQUEST_DELAY}).",
    )
    parser.add_argument(
        "--cookies",
        type=str,
        default=None,
        help="Path to Netscape-format cookies.txt file (helps avoid IP blocks).",
    )
    args = parser.parse_args()

    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

    # Load existing log
    fetched_log = load_fetched()
    already_fetched = len(fetched_log)

    # Build video list
    if args.url:
        match = re.search(r"v=([a-zA-Z0-9_-]+)", args.url)
        if not match:
            print("❌ Could not parse video ID from URL.")
            sys.exit(1)
        vid_id = match.group(1)
        videos = [{"id": vid_id, "title": vid_id, "date": "", "duration": 0, "url": args.url}]
    else:
        videos = get_channel_videos()
        # Add delay after fetching channel videos to avoid rate limiting
        if args.delay > 0:
            print(f"⏸️  Waiting {args.delay} seconds before fetching transcripts...")
            time.sleep(args.delay)

    if not videos:
        print("❌ No videos found. Is yt-dlp installed?")
        sys.exit(1)

    # Filter to new-only if requested
    if args.new_only:
        videos = [v for v in videos if v["id"] not in fetched_log]
        print(f"🔎 {len(videos)} new videos to fetch (skipping {already_fetched} already fetched).")

    # Apply limit
    if args.limit:
        videos = videos[: args.limit]

    if not videos:
        print("✅ Nothing to do — all transcripts are already fetched.")
        return

    # Show cookies status
    cookies_status = f" (using cookies: {args.cookies})" if args.cookies else ""
    print(
        f"\n🚀 Fetching transcripts for {len(videos)} videos sequentially{cookies_status}\n"
        f"   (delay between requests: {args.delay}s, timeout per video: {FETCH_TIMEOUT // 60} min)\n"
    )

    success_count = 0
    fail_count = 0

    # Process videos sequentially to avoid rate limiting
    try:
        for i, video in enumerate(videos, 1):
            print(f"[{i}/{len(videos)}]", end=" ")
            try:
                ok, entry = process_video(video, fetched_log, args.cookies, args.delay)
                if ok:
                    fetched_log[video["id"]] = entry
                    save_fetched(fetched_log)
                    success_count += 1
                else:
                    fail_count += 1
            except Exception as exc:
                print(f"  ❌ Exception for {video['id']}: {exc}")
                fail_count += 1
                continue

    except KeyboardInterrupt:
        print("\n⛔ Interrupted by user. Progress saved to log.")

    print(
        f"\n✅ Done!  {success_count} fetched, {fail_count} failed/unavailable.\n"
        f"   Videos:      {VIDEOS_DIR}\n"
        f"   Log:         {FETCHED_LOG}"
    )


if __name__ == "__main__":
    main()
