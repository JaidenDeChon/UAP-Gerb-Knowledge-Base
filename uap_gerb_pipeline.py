#!/usr/bin/env python3
"""
UAP Gerb Knowledge Base Pipeline
==================================
Fetches all videos from the UAP Gerb YouTube channel, extracts transcripts,
uses Claude API to identify people, organizations, concepts, events, operations,
and locations, then writes Obsidian-ready markdown files to your vault.

Requirements (install once):
    pip install yt-dlp youtube-transcript-api anthropic

Usage:
    # First run — process all videos:
    python uap_gerb_pipeline.py

    # Subsequent runs — only process new videos:
    python uap_gerb_pipeline.py --new-only

    # Process a single video by URL:
    python uap_gerb_pipeline.py --url https://www.youtube.com/watch?v=VIDEO_ID

    # Run without Claude API (basic mode — no entity extraction):
    python uap_gerb_pipeline.py --no-api

    # Estimate storage before running (no files written):
    python uap_gerb_pipeline.py --estimate

Storage notes:
    - Raw transcripts are NEVER written to disk. They live in RAM only and are
      discarded immediately after extraction for each video.
    - Each processed video produces roughly 3-8 KB of markdown (video note +
      entity stubs). A 200-video channel ≈ 2-5 MB total — well under 1% of
      typical M1 Air storage.
    - The processed log (.processed_videos.json) is a few KB regardless of
      channel size.
"""

import os
import re
import json
import time
import shutil
import argparse
import subprocess
import textwrap
from pathlib import Path
from datetime import datetime
from typing import Optional

# ── Configuration ──────────────────────────────────────────────────────────────

CHANNEL_URL = "https://www.youtube.com/@UAPGerb/videos"

# Absolute path to your Obsidian vault root
VAULT_PATH = Path(__file__).parent / "UAP Gerb Knowledge Base"

# Anthropic API key — three ways to set this (in order of preference):
#   1. Paste your key directly here:  ANTHROPIC_API_KEY = "sk-ant-..."
#   2. Add to ~/.zshrc:               echo 'export ANTHROPIC_API_KEY=sk-ant-...' >> ~/.zshrc
#   3. Export in current terminal:    export ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_API_KEY = "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"

# Claude model to use for extraction
EXTRACTION_MODEL = "claude-sonnet-4-6"           # best quality for UAP entity extraction
# EXTRACTION_MODEL = "claude-haiku-4-5-20251001" # cheaper alternative (~4x less cost)

# Transcript chunk size in characters (~2000 tokens ≈ 8000 chars is safe)
CHUNK_SIZE = 6000

# How many seconds to pause between API calls (be a good citizen)
API_DELAY = 0.5

# ── Vault directories ───────────────────────────────────────────────────────────

DIRS = {
    "videos":        VAULT_PATH / "Videos",
    "people":        VAULT_PATH / "People",
    "organizations": VAULT_PATH / "Organizations",
    "concepts":      VAULT_PATH / "Concepts",
    "events":        VAULT_PATH / "Events",
    "operations":    VAULT_PATH / "Operations",
    "locations":     VAULT_PATH / "Locations",
    "templates":     VAULT_PATH / "_templates",
}

PROCESSED_LOG = VAULT_PATH / ".processed_videos.json"

# ── Extraction prompt ───────────────────────────────────────────────────────────

EXTRACTION_PROMPT = """\
You are building a knowledge base about UAP (Unidentified Aerial Phenomena) from YouTube transcripts.
Analyze the following transcript chunk and extract structured information.

Return ONLY a valid JSON object with these keys:
{{
  "people": [
    {{"name": "Full Name", "role": "their role/description", "context": "why they are relevant"}}
  ],
  "organizations": [
    {{"name": "Org Name", "type": "govt/military/private/research/etc", "context": "relevance"}}
  ],
  "concepts": [
    {{"name": "Concept Name", "description": "brief explanation"}}
  ],
  "events": [
    {{"name": "Event Name", "date": "YYYY or YYYY-MM or YYYY-MM-DD or empty", "context": "what happened"}}
  ],
  "operations": [
    {{"name": "Operation Name", "context": "description"}}
  ],
  "locations": [
    {{"name": "Location Name", "context": "relevance"}}
  ],
  "key_claims": [
    "one-sentence claim or assertion made in this segment"
  ]
}}

Rules:
- Only include entities clearly mentioned in the transcript.
- Use proper full names (e.g. "Bob Lazar", not just "Bob").
- For dates, use ISO format where possible; otherwise leave empty string.
- Keep descriptions concise (1–2 sentences max).
- Return ONLY the JSON object, no markdown, no explanation.

Transcript chunk:
{chunk}
"""

SUMMARY_PROMPT = """\
You are summarizing a UAP-related YouTube video for a knowledge base.
Below are the extracted entities and key claims from the full transcript.

Write a 2–4 sentence summary of the video's main topic and key takeaways.
Be specific and factual. Do not editorialize. Write in third person.
Reference specific names, events, or claims where relevant.

Extracted data:
{extracted_json}

Video title: {title}
"""


# ── Helper functions ────────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    """Convert text to a safe filename slug."""
    text = re.sub(r'[^\w\s-]', '', text.lower())
    text = re.sub(r'[\s_-]+', '-', text)
    return text.strip('-')


def safe_title(text: str) -> str:
    """Sanitize text for use as an Obsidian page title / filename."""
    # Remove characters that Obsidian can't handle in filenames
    return re.sub(r'[\\/:*?"<>|#^[\]]', '', text).strip()


def wikilink(name: str) -> str:
    return f"[[{safe_title(name)}]]"


def load_processed() -> dict:
    if PROCESSED_LOG.exists():
        return json.loads(PROCESSED_LOG.read_text())
    return {}


def save_processed(log: dict):
    PROCESSED_LOG.write_text(json.dumps(log, indent=2))


def ensure_dirs():
    for d in DIRS.values():
        d.mkdir(parents=True, exist_ok=True)


# ── Video discovery ─────────────────────────────────────────────────────────────

def get_channel_videos() -> list[dict]:
    """Use yt-dlp (as a Python module) to list all videos on the channel."""
    import sys
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
        # Parse upload_date YYYYMMDD → YYYY-MM-DD
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


def get_transcript(video_id: str) -> Optional[str]:
    """Fetch the transcript for a video. Returns plain text or None."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        # New API (>= 0.6.0): instance-based
        api = YouTubeTranscriptApi()
        fetched = api.fetch(video_id)
        return " ".join(seg.text for seg in fetched)
    except Exception:
        pass
    try:
        # Fallback: old API (< 0.6.0): class-based
        from youtube_transcript_api import YouTubeTranscriptApi
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=["en", "en-US"])
        return " ".join(seg["text"] for seg in transcript_list)
    except Exception as e:
        print(f"    ⚠️  No transcript for {video_id}: {e}")
        return None


def chunk_text(text: str, size: int = CHUNK_SIZE) -> list[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end])
        start = end - 500  # 500-char overlap for context continuity
        if start >= len(text):
            break
    return chunks


# ── Claude extraction ───────────────────────────────────────────────────────────

def extract_entities_with_claude(chunk: str, client, chunk_label: str = "") -> dict:
    """Call Claude API to extract entities from a transcript chunk."""
    import threading

    prompt = EXTRACTION_PROMPT.format(chunk=chunk)
    result_holder = [None]
    error_holder = [None]

    def call_api():
        try:
            result_holder[0] = client.messages.create(
                model=EXTRACTION_MODEL,
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as e:
            error_holder[0] = e

    thread = threading.Thread(target=call_api, daemon=True)
    thread.start()

    # Show a live elapsed-time ticker while waiting
    start = time.time()
    timeout = 360  # seconds before we give up
    while thread.is_alive():
        elapsed = int(time.time() - start)
        print(f"       {chunk_label}({elapsed}s)...   ", end="\r")
        if elapsed >= timeout:
            print(f"\n    ⚠️  Chunk timed out after {timeout}s — skipping.")
            return {}
        time.sleep(1)

    elapsed = int(time.time() - start)
    print(f"       {chunk_label}done in {elapsed}s        ")

    if error_holder[0]:
        print(f"    ⚠️  API error: {error_holder[0]}")
        return {}

    raw = result_holder[0].content[0].text.strip()
    # Strip markdown code fences if model wraps the JSON
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def generate_summary(extracted: dict, title: str, client) -> str:
    """Generate a summary paragraph from the merged extracted data."""
    prompt = SUMMARY_PROMPT.format(
        extracted_json=json.dumps(extracted, indent=2),
        title=title,
    )
    response = client.messages.create(
        model=EXTRACTION_MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text.strip()


def merge_extractions(chunks_data: list[dict]) -> dict:
    """
    Merge entity lists across all chunks, deduplicating by normalized name.
    """
    merged = {
        "people": {},
        "organizations": {},
        "concepts": {},
        "events": {},
        "operations": {},
        "locations": {},
        "key_claims": [],
    }

    def normalize(name: str) -> str:
        return re.sub(r'\s+', ' ', name.strip().lower())

    for chunk in chunks_data:
        for key in ["people", "organizations", "concepts", "events", "operations", "locations"]:
            for item in chunk.get(key, []):
                if not isinstance(item, dict) or "name" not in item:
                    continue
                norm = normalize(item["name"])
                if norm not in merged[key]:
                    merged[key][norm] = item
        for claim in chunk.get("key_claims", []):
            if isinstance(claim, str) and claim.strip():
                merged["key_claims"].append(claim.strip())

    # Convert dicts back to lists
    for key in ["people", "organizations", "concepts", "events", "operations", "locations"]:
        merged[key] = list(merged[key].values())

    # Deduplicate claims
    seen = set()
    deduped_claims = []
    for c in merged["key_claims"]:
        if c not in seen:
            seen.add(c)
            deduped_claims.append(c)
    merged["key_claims"] = deduped_claims

    return merged


# ── Obsidian file writers ───────────────────────────────────────────────────────

def write_video_note(video: dict, extracted: dict, summary: str):
    """Write the main Video note to the Videos/ folder."""
    title = safe_title(video["title"])
    filename = DIRS["videos"] / f"Video - {title}.md"

    def items_to_links(key: str) -> str:
        items = extracted.get(key, [])
        if not items:
            return "_None identified_"
        lines = []
        for item in items:
            name = safe_title(item.get("name", ""))
            context = item.get("context", item.get("description", ""))
            lines.append(f"- {wikilink(name)}" + (f" — {context}" if context else ""))
        return "\n".join(lines)

    people_section = items_to_links("people")
    orgs_section = items_to_links("organizations")
    concepts_section = items_to_links("concepts")
    events_section = items_to_links("events")
    ops_section = items_to_links("operations")
    locs_section = items_to_links("locations")

    claims_section = "\n".join(
        f"- {c}" for c in extracted.get("key_claims", [])
    ) or "_None identified_"

    all_tags = []
    for key in ["people", "organizations", "concepts", "events", "operations", "locations"]:
        for item in extracted.get(key, []):
            name = item.get("name", "")
            if name:
                all_tags.append(safe_title(name))

    content = f"""---
title: "{video['title'].replace('"', "'")}"
date: {video['date']}
video_id: {video['id']}
url: {video['url']}
channel: UAP Gerb
duration_seconds: {video['duration']}
tags:
  - video
  - uap-gerb
---

## Summary
{summary or '_No summary generated._'}

## People
{people_section}

## Organizations
{orgs_section}

## Concepts
{concepts_section}

## Events & Dates
{events_section}

## Operations
{ops_section}

## Locations
{locs_section}

## Key Claims
{claims_section}

---
*Source: [YouTube]({video['url']})*
"""
    filename.write_text(content, encoding="utf-8")
    return filename


def write_entity_stub(name: str, entity_type: str, context: str = "", extra: dict = None):
    """
    Write (or update) a stub note for an entity (person, org, concept, etc.).
    Only creates the file if it doesn't already exist, to preserve manual edits.
    """
    dir_map = {
        "people":        ("People",        "person"),
        "organizations": ("Organizations", "organization"),
        "concepts":      ("Concepts",      "concept"),
        "events":        ("Events",        "event"),
        "operations":    ("Operations",    "operation"),
        "locations":     ("Locations",     "location"),
    }
    folder_name, tag = dir_map.get(entity_type, ("Concepts", "concept"))
    folder = DIRS[entity_type]
    safe_name = safe_title(name)
    filename = folder / f"{safe_name}.md"

    if filename.exists():
        return  # Don't overwrite manually-edited stubs

    extra = extra or {}
    date_line = f"date: {extra.get('date', '')}\n" if extra.get("date") else ""
    role_line = f"role: \"{extra.get('role', '')}\"\n" if extra.get("role") else ""
    org_type_line = f"org_type: \"{extra.get('type', '')}\"\n" if extra.get("type") else ""

    content = f"""---
name: "{safe_name}"
{role_line}{org_type_line}{date_line}tags:
  - {tag}
---

{context or f'_Stub page for {safe_name}. Details will accumulate via backlinks._'}

## Appearances
*(Populated automatically via Obsidian backlinks from [[Videos]])*
"""
    filename.write_text(content, encoding="utf-8")


def write_all_entity_stubs(extracted: dict):
    """Write stub notes for every entity found in the extraction."""
    for item in extracted.get("people", []):
        write_entity_stub(item["name"], "people", item.get("context", ""), {"role": item.get("role", "")})
    for item in extracted.get("organizations", []):
        write_entity_stub(item["name"], "organizations", item.get("context", ""), {"type": item.get("type", "")})
    for item in extracted.get("concepts", []):
        write_entity_stub(item["name"], "concepts", item.get("description", ""))
    for item in extracted.get("events", []):
        write_entity_stub(item["name"], "events", item.get("context", ""), {"date": item.get("date", "")})
    for item in extracted.get("operations", []):
        write_entity_stub(item["name"], "operations", item.get("context", ""))
    for item in extracted.get("locations", []):
        write_entity_stub(item["name"], "locations", item.get("context", ""))


# ── Index / MOC files ───────────────────────────────────────────────────────────

def write_home_note():
    """Write the vault home / MOC (Map of Content) note."""
    content = """---
title: "UAP Gerb Knowledge Base"
tags:
  - moc
  - home
---

# UAP Gerb Knowledge Base

This vault contains extracted knowledge from the [UAP Gerb YouTube channel](https://www.youtube.com/@UAPGerb).

## Maps of Content

- [[Videos MOC]] — All processed episodes
- [[People MOC]] — All people mentioned
- [[Organizations MOC]] — Government bodies, agencies, companies
- [[Concepts MOC]] — Ideas, technologies, phenomena
- [[Events MOC]] — Historical and recent events
- [[Operations MOC]] — Named government / military operations
- [[Locations MOC]] — Places, facilities, regions

---
*Last updated by pipeline: auto-generated*
"""
    (VAULT_PATH / "Home.md").write_text(content, encoding="utf-8")


def rebuild_moc(entity_type: str, title: str, tag: str):
    """Rebuild a Map of Content listing all notes of a given type."""
    folder = DIRS[entity_type]
    files = sorted(folder.glob("*.md"))
    lines = [f"- [[{f.stem}]]" for f in files]
    content = f"""---
title: "{title}"
tags:
  - moc
  - {tag}
---

# {title}

{chr(10).join(lines) if lines else '_No entries yet._'}
"""
    (VAULT_PATH / f"{title}.md").write_text(content, encoding="utf-8")


def rebuild_all_mocs():
    rebuild_moc("videos",        "Videos MOC",        "video")
    rebuild_moc("people",        "People MOC",        "person")
    rebuild_moc("organizations", "Organizations MOC", "organization")
    rebuild_moc("concepts",      "Concepts MOC",      "concept")
    rebuild_moc("events",        "Events MOC",        "event")
    rebuild_moc("operations",    "Operations MOC",    "operation")
    rebuild_moc("locations",     "Locations MOC",     "location")


# ── Main pipeline ───────────────────────────────────────────────────────────────

def process_video(video: dict, client, use_api: bool) -> bool:
    """
    Full pipeline for one video. Returns True on success.
    """
    vid_id = video["id"]
    title = video["title"]
    print(f"\n🎬 Processing: {title} ({vid_id})")

    # 1. Get transcript (held in RAM only — never written to disk)
    transcript = get_transcript(vid_id)
    if not transcript:
        print("    ❌ Skipping — no transcript available.")
        return False

    print(f"    ✅ Transcript: {len(transcript):,} characters (~{len(transcript.encode())//1024} KB in RAM)")

    if not use_api or not client:
        # Basic mode: write the video note without entity extraction
        extracted = {"people": [], "organizations": [], "concepts": [],
                     "events": [], "operations": [], "locations": [], "key_claims": []}
        summary = "_Transcript available but entity extraction requires an Anthropic API key._"
        write_video_note(video, extracted, summary)
        del transcript  # free RAM immediately
        print("    📝 Video note written (basic mode — no entity extraction).")
        return True

    # 2. Chunk transcript and extract entities
    chunks = chunk_text(transcript)
    del transcript  # ← free the raw transcript from RAM immediately after chunking
    print(f"    🔍 Extracting entities from {len(chunks)} chunks...")
    chunks_data = []
    for i, chunk in enumerate(chunks):
        label = f"Chunk {i+1}/{len(chunks)} — "
        data = extract_entities_with_claude(chunk, client, chunk_label=label)
        chunks_data.append(data)
        del chunk  # free each chunk as we go
        time.sleep(API_DELAY)
    del chunks
    print()

    # 3. Merge and deduplicate
    extracted = merge_extractions(chunks_data)
    del chunks_data  # free intermediate extraction data
    people_count = len(extracted.get("people", []))
    orgs_count = len(extracted.get("organizations", []))
    print(f"    📊 Found: {people_count} people, {orgs_count} orgs, "
          f"{len(extracted.get('concepts', []))} concepts, "
          f"{len(extracted.get('events', []))} events")

    # 4. Generate summary
    summary = generate_summary(extracted, title, client)
    time.sleep(API_DELAY)

    # 5. Write Obsidian files (each MD file is a few KB — tiny)
    write_video_note(video, extracted, summary)
    write_all_entity_stubs(extracted)
    del extracted  # free entity data after writing
    print(f"    ✅ Obsidian notes written.")
    return True


def main():
    parser = argparse.ArgumentParser(description="UAP Gerb → Obsidian pipeline")
    parser.add_argument("--new-only", action="store_true",
                        help="Only process videos not already in the log")
    parser.add_argument("--url", type=str, default=None,
                        help="Process a single video URL instead of the full channel")
    parser.add_argument("--no-api", action="store_true",
                        help="Skip Claude API extraction (basic mode)")
    parser.add_argument("--limit", type=int, default=None,
                        help="Process at most N videos (useful for testing)")
    parser.add_argument("--estimate", action="store_true",
                        help="Estimate storage usage without writing any files")
    args = parser.parse_args()

    ensure_dirs()

    # ── Disk space check ────────────────────────────────────────────────────────
    free_bytes = shutil.disk_usage(VAULT_PATH).free
    free_gb = free_bytes / (1024 ** 3)
    if free_gb < 0.5:
        print(f"⚠️  Low disk space: {free_gb:.2f} GB free. Proceeding cautiously.")
    else:
        print(f"💾 Disk space available: {free_gb:.1f} GB — plenty for this vault.")

    # Set up Claude client
    client = None
    use_api = not args.no_api
    if use_api:
        api_key = ANTHROPIC_API_KEY
        if not api_key:
            print("⚠️  No ANTHROPIC_API_KEY set. Running in basic mode (no entity extraction).")
            print("    Set it with: export ANTHROPIC_API_KEY=sk-ant-...")
            use_api = False
        else:
            try:
                import anthropic
                client = anthropic.Anthropic(api_key=api_key)
                print(f"🤖 Claude client ready ({EXTRACTION_MODEL})")
            except ImportError:
                print("⚠️  anthropic package not installed. Run: pip install anthropic")
                use_api = False

    # Load processed log
    processed = load_processed()

    # Get video list
    if args.url:
        # Single video mode
        vid_id = re.search(r"v=([a-zA-Z0-9_-]+)", args.url)
        if not vid_id:
            print("❌ Could not parse video ID from URL.")
            return
        videos = [{"id": vid_id.group(1), "title": "Unknown", "date": "", "duration": 0, "url": args.url}]
    else:
        videos = get_channel_videos()

    if not videos:
        print("❌ No videos found. Check that yt-dlp is installed and the channel URL is correct.")
        return

    # Filter to unprocessed if --new-only
    if args.new_only:
        videos = [v for v in videos if v["id"] not in processed]
        print(f"🔎 {len(videos)} new videos to process.")

    # Apply limit
    if args.limit:
        videos = videos[:args.limit]

    # ── Estimate mode ────────────────────────────────────────────────────────────
    if args.estimate:
        n = len(videos)
        # Rough estimates: ~5 KB per video note, ~0.5 KB per entity stub,
        # assume avg ~40 unique entities per video
        video_notes_kb = n * 5
        entity_stubs_kb = n * 40 * 0.5  # many stubs will be shared across videos
        total_kb = video_notes_kb + entity_stubs_kb
        print(f"\n📊 Storage estimate for {n} videos:")
        print(f"   Video notes:       ~{video_notes_kb:,} KB ({video_notes_kb/1024:.1f} MB)")
        print(f"   Entity stubs:      ~{int(entity_stubs_kb):,} KB ({entity_stubs_kb/1024:.1f} MB)")
        print(f"   Total (est):       ~{int(total_kb):,} KB ({total_kb/1024:.1f} MB)")
        print(f"   Available:          {free_gb:.1f} GB")
        print(f"\n   ✅ This is {total_kb/1024/free_gb/10:.2f}% of your available disk space.")
        print("   Raw transcripts are NOT stored — only the extracted markdown files.")
        return

    # Process each video
    success_count = 0
    for video in videos:
        try:
            ok = process_video(video, client, use_api)
            if ok:
                processed[video["id"]] = {
                    "title": video["title"],
                    "processed_at": datetime.now().isoformat(),
                }
                save_processed(processed)
                success_count += 1
        except KeyboardInterrupt:
            print("\n⛔ Interrupted by user.")
            break
        except Exception as e:
            print(f"    ❌ Error processing {video['id']}: {e}")
            continue

    # Rebuild MOCs and home note
    print("\n📚 Rebuilding Maps of Content...")
    rebuild_all_mocs()
    write_home_note()

    print(f"\n✅ Done! Processed {success_count}/{len(videos)} videos.")
    print(f"   Vault: {VAULT_PATH}")


if __name__ == "__main__":
    main()
