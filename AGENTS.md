# Project instructions

Read `AGENTS.local.md` first if present. It contains maintainer-specific machine and publication constraints and must never be committed. These public instructions do not grant contributors access to upstream publication credentials.

## Development

- Use Node.js 22+. Keep the project dependency-free at runtime and preserve its existing navigation, search, list and drawer patterns.
- Use `npm run demo` for screenshots and UI verification. Never commit a real Skill catalog, local paths, personal screenshots or credentials.
- Skill sources are read-only, except for the explicitly requested creation of a new alias entry. Never overwrite a different existing file. Archive means manager-only hiding.
- Keep the server on loopback. Network exposure or publication of local Skills requires explicit user authorization.
- Verify real evidence: cache is not enabled, a configured alias is not installed, local modification time is not an upstream update, and no manual usage record does not mean unused.

## Checks and contributions

Run `npm run check`, `npm test` and `bash -n start.command`. Use isolated fixtures. Document relevant verification and limits; do not claim a browser test passed if it did not run.

Add user-visible changes to `CHANGELOG.md` under Unreleased. External contributors open a focused PR from a fork; they do not bump or publish an upstream release without maintainer authorization.

## Maintainer releases

For an authorized, completed batch, update package version and Changelog, verify the diff and checks, commit and push. Create the matching `vX.Y.Z` tag and GitHub Release using that version's Changelog notes. Verify remote commits and release state before reporting completion.

Use SemVer: fixes and maintenance bump PATCH, compatible additions bump MINOR. During 0.x, breaking changes bump MINOR and document migration; after 1.0, they bump MAJOR. Never overwrite published versions. The compatibility surface includes local HTTP APIs, configuration format and startup commands.

Only push the intended branch and explicit new tag. Never push all local references or mirror a repository: maintainer checkouts may retain private backup history. Keep `.skill-manager/`, `work/`, `AGENTS.local.md`, environment files and credentials out of commits.

## File removal

禁止批量删除文件或目录。禁止 `del /s`、`rd /s`、`rmdir /s`、`Remove-Item -Recurse`、`rm -rf`。
需要删除时，只能一次删除一个明确路径的文件。需要批量删除时停止操作，请用户手动删除。
