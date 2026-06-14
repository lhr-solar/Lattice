---
name: obsidian-mind
description: >-
  Operate the lattice-agent-vault using obsidian-mind conventions — persistent
  agent memory, om-* workflows, brain/ topic notes, work tracking, and tiered
  context loading. Use when saving session context, running standup/wrap-up,
  filing decisions, or maintaining vault indexes. Prefer QMD semantic search
  before reading full notes.
---

# Obsidian Mind (Lattice vault)

Vault path: `lattice-agent-vault/` (relative to repo root).

## Token discipline

1. **Codebase questions** → use `graphify query` (see graphify rule), not vault reads.
2. **Vault memory** → read `brain/North Star.md` excerpt + `index.md` catalog first; use QMD before full file reads.
3. **Commands** → read only the matching command file under `.claude/commands/` when invoked.
4. **Never** load `CLAUDE.md` or the full vault listing unless the user asks for vault maintenance.

## Conventions (summary)

Full operating manual: `lattice-agent-vault/CLAUDE.md` (read on demand only).

| Area | Purpose |
|------|---------|
| `brain/` | Durable memory — North Star, decisions, patterns, gotchas |
| `work/` | Active projects, archive, incidents, 1-1s |
| `reference/lattice/` | Lattice codebase knowledge (from graphify + architect) |
| `wiki/` | Second-brain ingest output (entities, concepts, architecture notes) |
| `perf/` | Brag doc, competencies, review evidence |
| `thinking/` | Scratchpad — promote then delete |

## Commands

Read and follow the matching file in `lattice-agent-vault/.claude/commands/`:

| Trigger | File |
|---------|------|
| standup / start session | `om-standup.md` |
| brain dump / capture | `om-dump.md` |
| wrap up / end session | `om-wrap-up.md` |
| weekly review | `om-weekly.md` |
| vault audit | `om-vault-audit.md` |
| document codebase | use second-brain `obsidian-architect` (see obsidian-second-brain skill) |

## Linking rules

- Every note gets YAML frontmatter with `description` for progressive disclosure.
- Wikilink related people, projects, and decisions in `## Related`.
- A note without links is incomplete — fix before ending a session.

## Upgrades

Submodule source: `lattice-agent-vault/_vendor/obsidian-mind/`. Run `scripts/setup-obsidian-vault.sh` to refresh scaffold.
