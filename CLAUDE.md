# UAP Gerb Knowledge Base

Knowledge base / wiki of topics, people, places, and events covered on the UAP Gerb YouTube channel. Intended for viewing with Obsidian and its graph view.

The channel's presenter is **Gerb**. In all written content, refer to him by name, never as "the host", "the presenter" or "the narrator". Transcripts stay verbatim. Gerb has no page of his own: never create one, and never wikilink his name.

## Obsidian CLI

An Obsidian CLI is available for interacting with this vault programmatically. See the documentation at https://obsidian.md/cli for setup and usage instructions.

## Edit cards

When you change what an existing paragraph says (a corrected fact, date, name or number, a claim re-attributed to Gerb or a witness, a statement removed because no source supports it), put an edit card directly beneath that paragraph, separated by a blank line:

```markdown
> [!edit] Corrected 16 October 2026
> Earlier versions said the body was preserved in a bluish liquid. Corso says it was floating in fluid, and no source for the colour was found.
```

- The title is the kind of change plus the date: `Corrected` (the page was wrong), `Attribution clarified` (a claim stated as fact is now credited to whoever made it) or `Clarified` (detail added that changes how the paragraph reads).
- The body says, in one to three sentences, what the page used to say and why it changed. Name the source if it isn't already in the page's Sources section.
- One card per paragraph. If a paragraph is edited again later, add a second card beneath the first rather than rewriting the old one.
- Don't add a card for new material from a newly ingested video, a source added to the Sources list, new wikilinks, or rewording that keeps the facts (such as humanizer passes).
- Never delete an existing edit card. Rewording one is fine, but its facts and date stay.

The web app renders `[!edit]` as a muted note card (`WikiCallout.vue`); Obsidian renders it as a standard callout.
