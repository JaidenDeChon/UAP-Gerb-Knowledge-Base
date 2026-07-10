# UAP Gerb Knowledge Base

Knowledge base / wiki of topics, people, places, and events covered on the UAP Gerb YouTube channel. Intended for viewing with Obsidian and its graph view.

## Layout

- `UAP Gerb Knowledge Base/` — the Obsidian vault: video summaries, transcripts, and entity pages (People, Organizations, Locations, Concepts, Events, Operations), plus MOCs.
- `app/` — a Nuxt 4 web app for browsing the knowledge base outside of Obsidian.
- `*.py` — ingestion and maintenance scripts for pulling videos and transcripts from the channel. See `SETUP.md`.

## Web app

The app lives in `app/` and is built with Nuxt 4, Tailwind CSS, and shadcn-nuxt. Dependencies are managed with Bun.

```bash
cd app
bun install
bun run dev      # dev server on http://localhost:3000
bun run build    # production build
bun run preview  # preview the production build
```

Build output (`.nuxt`, `.output`), `node_modules`, logs, and local env files are ignored via `app/.gitignore` and should not be committed.
