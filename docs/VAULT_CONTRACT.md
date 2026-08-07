# Vault Contract

`ai-company-vault` is a long-term memory and application-data dependency. Its
existing paths have API-level compatibility requirements.

## Rules

- Do not move, rename or delete existing Vault files or directories.
- `00_HOME/` is navigation only; `memory/` is the source of truth.
- Do not manually restructure app-managed Markdown containing JSON blocks.
- Preserve unknown fields when parsing old data and supply defaults only for
  missing fields.
- Store volatile queue/session/job state in Redis, not Vault.
- Add cross-department relationships by Artifact ID and Wikilink, not copies.

The machine-readable registry is
`ai-secretary/app/lib/vault/managed-files.ts`.

## Managed formats

Planning, Note and Fund Stores use:

1. frontmatter;
2. human-readable Markdown;
3. a fenced JSON block used by the application.

Writes go through Store `build/parse/save` functions and the Vault adapter.
Planning remains at `memory/personal/planning/YYYY-MM-DD.md`; Note remains under
`memory/personal/note/`; Fund remains under `memory/personal/fund/`.

## Adding memory

1. Choose the owning department and Artifact type.
2. Reuse an existing physical path when it is already the source of truth.
3. Add metadata and lineage without rewriting unrelated existing fields.
4. Register app-managed paths.
5. Link the source from the relevant `00_HOME/*_INDEX.md`.
6. Put only a small durable summary in Core Memory. Working and Archive content
   must be loaded on demand.

Local filesystem development requires an explicit `VAULT_ROOT`. Production
GitHub-backed access requires its existing GitHub environment configuration.

