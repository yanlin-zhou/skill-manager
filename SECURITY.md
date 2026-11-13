# Security

Security fixes target the latest published release. This is an early-stage, single-user local application.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/yanlin-zhou/skill-manager/security/advisories/new). Include the affected version, minimal reproduction, expected boundary and impact. Use synthetic Skills rather than personal files. Do not publish credentials or private Skill contents in an issue.

## Local boundaries

- The server listens on `127.0.0.1` and accepts local Host headers only. It has no remote login or network-sharing mode.
- Mutating API requests require the manager's request header; cross-origin requests are rejected.
- Skill text is displayed as text. Alias installation creates a new entry and refuses to overwrite different content.
- Configuration and imports live in `.skill-manager/`. They may contain local paths and must not be committed or shared unredacted.
- GitHub popularity is fetched only when requested. The app does not upload your catalog or read Codex chat logs.

Run the app with your normal user account. Adding a reverse proxy or exposing the port changes its trust boundary and is not a supported deployment.
