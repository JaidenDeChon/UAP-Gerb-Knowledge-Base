# Component proposals

The register of new component *types* proposed for rich video articles. The `video-enricher` agent (`.claude/agents/video-enricher.md`) never builds a new component type without the user's approval.

1. The agent appends a proposal here with status `proposed`, and raises it as a question.
2. The user's answer sets it to `approved` or `declined`.
3. An `approved` proposal is built on the agent's next run, then set to `shipped`.

Extending an existing component with an optional, backward-compatible prop doesn't need a proposal. That change is documented in `docs/wiki-components.md` instead.

Read this whole file before proposing, and never re-propose an idea already listed, including declined ones.

## Template

```markdown
### <Component name> — `::wiki-<kebab-name>`

- **Status:** proposed | approved | declined | shipped (YYYY-MM-DD, with any notes from the user)
- **Premise:** what kind of content this shows that nothing in the kit can.
- **Needed by:** the video(s) that motivated it.
- **What the reader sees:** a short description of the rendered result, on desktop and on a phone.
- **Why the kit falls short:** which existing components and extensions were considered, and why they don't work.
- **Authoring sketch:**
  (the YAML an author would write)
- **Implementation plan:** files, dependencies (prefer none), accessibility, themes.
```

## Proposals

_None yet._
