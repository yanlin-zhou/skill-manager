# App sources

Skill Manager reads local `SKILL.md` directories from the Apps you select. Selection changes this manager's catalog; it does not copy, enable, disable or delete Skills in another App.

## Choose sources

The first screen offers Codex, Claude Code and Cursor. Select any combination and choose **载入 Skills**. Reopen **管理 App** from the sidebar, library or settings to change the selection. Choose no Apps to disconnect all App sources; saved metadata remains in the local configuration.

Optional project directories must be existing absolute paths, or paths beginning with `~/`. The manager reads the selected Apps' standard Skill subdirectories inside those projects. It does not crawl your home directory to discover every repository. Add a nested project explicitly when its Skills live below a monorepo root.

## Directory rules

| App | Global directories | Inside a selected project |
| --- | --- | --- |
| Codex | `~/.agents/skills`, legacy `~/.codex/skills` | `.agents/skills`, legacy `.codex/skills` |
| Claude Code | `~/.claude/skills` | `.claude/skills` |
| Cursor | `~/.cursor/skills`, `~/.agents/skills`, compatible `~/.claude/skills` and `~/.codex/skills` | The corresponding `.cursor`, `.agents`, `.claude` and `.codex` Skill directories |

Codex and Claude plugin Skill caches are included only when that App is selected. Cache presence does not prove a plugin is enabled. Cursor's compatibility directories are intentionally included: selecting Cursor can read a Skill under `.claude/skills` even if the Claude Code source itself is unchecked.

A directory found on disk does not prove that an App is installed, enabled or using it in the current session. App badges represent the selected directory readers. Shared real files and symbolic links are merged into one row, retaining all matching App memberships. Separate copies remain separate records so versions and contents can be compared.

## Search and invocation

The App picker, source scope, categories, favorites, archive and quick search share the same inventory filter. Dependency and review pages keep the full loaded catalog so cross-source relationships remain visible.

Codex call names use `$name`; Claude Code and Cursor use `/name`. Copy actions are based on local file, metadata and App-scope evidence, not an execution test inside the other App. Same names in unrelated Apps do not create a same-App collision. Project Skills must be invoked in the relevant project. Synced or cached layouts and unresolved names are not presented as verified calls.

Display names, categories, notes and search short names can be managed for all sources. Creating a new native alias entry remains an explicit **Codex** action. It is offered only when Codex is selected and never rewrites the source Skill. Native alias installation for Claude Code and Cursor is not implemented.

## Persistence and limits

- Selected App IDs and project paths are stored in `.skill-manager/config.json` under `appSources`; this file stays private and gitignored.
- Portable metadata exports omit machine-local App source settings. Choose sources on the destination machine before restoring metadata.
- Upgrading an existing Codex-only catalog retains its Codex selection and metadata, then offers the new source screen. Unselecting and reselecting sources preserves stable real-file IDs.
- This integration reads local `SKILL.md` files, not Claude.ai / Cowork accounts, legacy command files, Cursor rules, chat logs, enterprise directories or runtime-bundled menus. Custom global configuration homes are not automatically discovered.
- App policy, workspace trust and current-session settings may restrict what the App loads; this manager does not override them.

Directory and call-format references: [Codex](https://developers.openai.com/codex/skills/), [Claude Code](https://code.claude.com/docs/en/skills), [Cursor](https://cursor.com/docs/skills).
