# Contributing

Bug reports, small fixes and focused feature proposals are welcome.

## Local development

Use Node.js 22 or newer. No dependency install is required.

```sh
git clone https://github.com/yanlin-zhou/skill-manager.git
cd skill-manager
npm run demo
```

The demo runs at <http://127.0.0.1:4318> using isolated sample Skills. Use `npm run dev` to work with your own local library at port 4317. Configuration is stored in `.skill-manager/` and must stay out of commits.

## Before opening a pull request

1. Open an issue for a larger change so the workflow can be discussed first.
2. Fork the repository and create a focused branch. Keep existing search, category, list and drawer patterns.
3. Run `npm run check`, `npm test` and `bash -n start.command` on macOS or Linux. Use the demo for UI checks.
4. Describe the user-visible change and how you verified it. Add relevant notes under **Unreleased** in `CHANGELOG.md`; maintainers choose the release version.
5. Exclude local Skills, configuration, environment files and personal screenshots. Report security issues through [private vulnerability reporting](https://github.com/yanlin-zhou/skill-manager/security/advisories/new).

Tests use temporary directories and never clean them recursively. Do not introduce bulk file deletion or overwrite an existing Skill. Archive means hiding a row in this manager, not disabling a Codex Skill.

## Project layout

- `server.mjs`: loopback-only HTTP server and API.
- `lib/`: catalog scanning, dependency evidence and configuration validation.
- `public/`: vanilla JavaScript and CSS, with no build step.
- `tests/`: isolated fixtures, model tests and HTTP regression tests.

## Releases

Maintainers update the package version and Changelog, verify checks, then publish a matching `vX.Y.Z` tag and GitHub Release. Public history starts at v0.4.0. Earlier private history is intentionally not part of this repository. Push explicit branches and tags only.

The package has `private: true` to prevent accidental npm publication; the source is publicly available under MIT. Contributions are provided under the same license. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled icon notices.
