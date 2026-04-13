#!/usr/bin/env python3
"""
Reorganize video wiki and transcript files into paired folders.

This script:
1. Finds all video wiki files (Video - *.md) and transcript files (Transcript - *.md)
2. Pairs them up by title
3. Creates folders named after the video titles (with colons replaced by dashes)
4. Moves wiki files to summary.md and transcript files to transcript.md
5. Creates empty transcript.md files for videos without transcripts
"""

import os
import shutil
from pathlib import Path
from typing import Dict, Set


def sanitize_folder_name(title: str) -> str:
    """
    Sanitize a video title to be a valid folder name.
    Replaces colons with dashes (for Obsidian compatibility).
    """
    # Replace colons with dashes
    sanitized = title.replace(':', ' -')
    # Remove other problematic characters if needed
    # You can add more replacements here if necessary
    return sanitized


def extract_title_from_filename(filename: str, prefix: str) -> str:
    """
    Extract the title from a filename.
    E.g., "Video - My Title.md" with prefix "Video - " returns "My Title"
    """
    if not filename.startswith(prefix):
        return None
    
    # Remove prefix and .md extension
    title = filename[len(prefix):]
    if title.endswith('.md'):
        title = title[:-3]
    
    return title


def main():
    # Define paths
    base_path = Path(__file__).parent / "UAP Gerb Knowledge Base" / "Videos"
    transcripts_path = base_path / "Transcripts"
    
    print(f"Base path: {base_path}")
    print(f"Transcripts path: {transcripts_path}")
    
    if not base_path.exists():
        print(f"Error: Base path does not exist: {base_path}")
        return
    
    # Collect all video wiki files
    video_files: Dict[str, Path] = {}
    for file in base_path.glob("Video - *.md"):
        title = extract_title_from_filename(file.name, "Video - ")
        if title:
            video_files[title] = file
    
    print(f"\nFound {len(video_files)} video wiki files")
    
    # Collect all transcript files
    transcript_files: Dict[str, Path] = {}
    if transcripts_path.exists():
        for file in transcripts_path.glob("Transcript - *.md"):
            title = extract_title_from_filename(file.name, "Transcript - ")
            if title:
                transcript_files[title] = file
    
    print(f"Found {len(transcript_files)} transcript files")
    
    # Get all unique titles
    all_titles: Set[str] = set(video_files.keys()) | set(transcript_files.keys())
    print(f"\nTotal unique video titles: {len(all_titles)}")
    
    # Ask for confirmation
    print("\n" + "="*80)
    print("This script will reorganize the files as follows:")
    print("="*80)
    
    for i, title in enumerate(sorted(all_titles)[:5], 1):
        folder_name = sanitize_folder_name(title)
        has_wiki = "✓" if title in video_files else "✗"
        has_transcript = "✓" if title in transcript_files else "✗"
        print(f"{i}. {folder_name}")
        print(f"   Wiki: {has_wiki}  Transcript: {has_transcript}")
    
    if len(all_titles) > 5:
        print(f"   ... and {len(all_titles) - 5} more")
    
    print("\n" + "="*80)
    response = input("\nProceed with reorganization? (yes/no): ").strip().lower()
    
    if response not in ['yes', 'y']:
        print("Aborted.")
        return
    
    # Create folders and move files
    print("\nReorganizing files...")
    
    for title in sorted(all_titles):
        folder_name = sanitize_folder_name(title)
        folder_path = base_path / folder_name
        
        # Create folder
        folder_path.mkdir(exist_ok=True)
        
        # Move or create summary.md (from video wiki file)
        summary_path = folder_path / "summary.md"
        if title in video_files:
            source = video_files[title]
            shutil.move(str(source), str(summary_path))
            print(f"✓ Moved wiki: {title}")
        else:
            # Create empty summary if no wiki file exists
            summary_path.write_text(f"# {title}\n\n")
            print(f"⊕ Created empty summary: {title}")
        
        # Move or create transcript.md
        transcript_path = folder_path / "transcript.md"
        if title in transcript_files:
            source = transcript_files[title]
            shutil.move(str(source), str(transcript_path))
            print(f"✓ Moved transcript: {title}")
        else:
            # Create empty transcript if no transcript file exists
            transcript_path.write_text(f"# {title}\n\nTranscript\n\n")
            print(f"⊕ Created empty transcript: {title}")
    
    # Clean up empty Transcripts directory if it's now empty
    if transcripts_path.exists() and not any(transcripts_path.iterdir()):
        transcripts_path.rmdir()
        print(f"\n✓ Removed empty Transcripts directory")
    
    print("\n" + "="*80)
    print("Reorganization complete!")
    print("="*80)
    print(f"\nCreated {len(all_titles)} video folders in:")
    print(f"{base_path}")


if __name__ == "__main__":
    main()
