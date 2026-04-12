# UAP Gerb Knowledge Base — Setup Guide

## Quick Start

### 1. Install dependencies (one time)

```bash
pip install yt-dlp youtube-transcript-api anthropic
```

### 2. Get an Anthropic API key (optional but recommended)

Go to [console.anthropic.com](https://console.anthropic.com), sign up, and create an API key.
The extraction step uses **Claude Haiku** — very cheap (fractions of a cent per video).

Set the key in your terminal:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Or add it to your `~/.zshrc` so it persists across sessions:

```bash
echo 'export ANTHROPIC_API_KEY=sk-ant-...' >> ~/.zshrc
source ~/.zshrc
```

### 3. Run the pipeline

```bash
cd "/path/to/UAP Gerb Knowledge Base"

# Check estimated storage first (no files written):
python uap_gerb_pipeline.py --estimate

# Process all videos (with Claude entity extraction):
python uap_gerb_pipeline.py

# Process just the 5 most recent videos (good for testing):
python uap_gerb_pipeline.py --limit 5

# After the first run, only process new videos:
python uap_gerb_pipeline.py --new-only

# Run without API key (writes video notes but skips entity extraction):
python uap_gerb_pipeline.py --no-api
```

### 4. Open in Obsidian

Point Obsidian at the **`UAP Gerb Knowledge Base/`** subfolder as your vault.
Open **Home.md** as your starting point.

---

## Storage footprint

Raw transcripts are **never written to disk** — they live in RAM only during processing
and are discarded immediately after extraction for each video.

| Asset | Typical size |
|---|---|
| One video note | 3–8 KB |
| One entity stub | ~500 bytes |
| Processed log | < 50 KB |
| **200-video channel total** | **~5–10 MB** |

This is well under 0.1% of an M1 MacBook Air's storage.

---

## Vault structure

```
UAP Gerb Knowledge Base/
├── Home.md                   ← Start here
├── Videos MOC.md             ← Index of all episodes
├── People MOC.md
├── Organizations MOC.md
├── Concepts MOC.md
├── Events MOC.md
├── Operations MOC.md
├── Locations MOC.md
├── Videos/
│   └── Episode Title.md      ← One file per video
├── People/
│   └── Bob Lazar.md          ← Auto-generated stubs
├── Organizations/
├── Concepts/
├── Events/
├── Operations/
├── Locations/
└── _templates/
```

## Connecting to a Claude Project

Once the vault has several dozen videos processed:

1. In Claude, create a new Project for UAP Gerb research.
2. Upload the markdown files (or a zip of the vault) to the Project's knowledge base.
3. In Project instructions, add: *"This vault uses Obsidian wikilinks `[[Name]]` to connect entities. Videos/ contains episode summaries; People/, Organizations/, etc. contain entity stubs."*
4. You can now ask Claude questions like *"What's the pattern of claims about Skinwalker Ranch across all episodes?"* and it will cite specific video notes.

Re-run `uap_gerb_pipeline.py --new-only` whenever new videos drop, then re-upload the new files to the Project.
