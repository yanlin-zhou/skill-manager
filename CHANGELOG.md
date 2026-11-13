# Changelog

记录每个发布版本的变化，采用 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 和 [Semantic Versioning](https://semver.org/)。

## [Unreleased]

## [0.4.1] - 2026-11-12

### Changed

- Renamed the public repository and package to `skill-manager`.
- Updated README titles, clone instructions, CI badge, repository metadata, security reporting and release links to the new repository URL.

## [0.4.0] - 2026-11-12

### Added

- First public source release under the MIT license, with retained icon license notices.
- English and Chinese quick-start documentation, contribution and security guides, community conduct, and Issue / PR templates.
- Read-only GitHub Actions CI for Node 22 and 24 on macOS and Linux, pinned to official Action commits.
- An `npm run demo` command and a screenshot made with isolated sample Skills.

### Changed

- Display names and summaries use Skill metadata and user configuration; personal hardcoded names and ranking preferences are no longer bundled.
- Maintainer-only machine constraints remain in an ignored local instructions file.

### Notes

- Public history starts with this release. Earlier private source history, personal machine identifiers and personal commit email are not included in the public Git ancestry.
- Existing local configuration and Skills stay on the user's computer. This release adds no remote-access mode.
- Legacy health application and macOS service identifiers are retained for compatibility.

## 0.3.0 (private development) - 2026-11-11

### Added

- 默认显示个人 Skills；个人、全部、插件缓存与系统范围可见、可切换，并记住选择。列表、分类、收藏、归档和快速查找使用同一来源范围。
- 详情先显示用途、来源状态、调用入口和版本；可复制唯一的本地原名或已核实的短名调用，保留原有编辑流程。
- 产品和 UX 评估报告，记录本轮改进依据与后续场景首选、上游版本核对建议。

### Changed

- 正常兼容入口单独展示，不计入待核对数字；同名来源、正文一致、缺失引用和版本记录变化保留证据与直达操作。
- 区分 Skill 版本、插件包版本、文件修改时间和「更新未检查」状态；依赖操作明确为「更新版本记录」。
- 短名显示统一为 `$`；卡片原名和描述文字加深，保留现有导航与简洁风格。

### Fixed

- 保存过短名不再被误认为已安装；入口删除、改写、短名变更和同名来源会影响可复制的调用和状态显示。
- 版本记录变化会打开对应 Skill 的依赖关系，不再落到默认 Skill。
- 插件缓存与单个导入文件不再暗示已启用或完整安装。

### Notes

- 尚未核对上游更新，也未读取 Codex 调用日志；没有新增自动升级、合并、删除或跨电脑访问。

## 0.2.0 (private development) - 2026-11-11

### Added

- macOS `start.command`：检查 Node.js，使用系统后台任务启动，等待健康检查通过后打开页面；重复运行复用当前版本的服务。
- 本地 `/api/health` 接口返回应用名称、版本和运行机器名称，便于确认访问的是哪台电脑上的服务。
- 项目工作约定：限定个人 Mac 上的 GitHub 操作，每批改动同步版本、Changelog、提交、标签和 GitHub Release。

### Fixed

- 启动入口让服务独立于终端会话，并对端口冲突、旧版服务和未就绪任务给出明确提示。
- 文档说明 `127.0.0.1` 仅能访问当前电脑，修正把另一台 Mac 上的服务误判为当前浏览器已可用的问题。

### Notes

- 服务仍只在本机监听，没有新增跨电脑访问能力。公司电脑上打开相同地址不会连接到个人 Mac。
- 需要 macOS 和 Node.js 22 或更新版本；启动器不自动安装软件或覆盖已有服务。

## 0.1.0 (private development) - 2026-11-09

早期私有开发版本；本节为功能记录，旧私有提交不包含在公开历史中。

### Added

- 扫描本地 Codex Skills，支持搜索、分类、显示名称、短名、收藏及归档。
- 兼容别名、重复内容、同名冲突和缺失引用检查。
- 引用图、手动依赖、手动使用记录、社区发现及配置备份与恢复。
- 极简本地管理界面及不覆盖已有文件的 Codex 短名入口。

[Unreleased]: https://github.com/yanlin-zhou/skill-manager/compare/v0.4.1...HEAD
[0.4.0]: https://github.com/yanlin-zhou/skill-manager/releases/tag/v0.4.0
[0.4.1]: https://github.com/yanlin-zhou/skill-manager/releases/tag/v0.4.1
