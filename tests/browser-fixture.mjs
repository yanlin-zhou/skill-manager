// Synthetic multi-app demo. No installed user library or chat history is read.
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'skill-manager-demo-'));
const home = path.join(directory, 'home');
async function add(folder, name, heading, description, body = 'Synthetic demonstration instructions.') {
  const target = path.join(home, folder, name);
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'SKILL.md'), `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\nmetadata:\n  version: "1.0.0"\n---\n# ${heading}\n${body}\n`);
  return target;
}
const shared = await add('.agents/skills', 'frontend-craft', 'Frontend Craft', '设计并实现清晰、易用的前端界面。');
await add('.codex/skills', 'api-review', 'API 检查', '检查接口约定、错误处理和数据边界。');
await add('.claude/skills', 'humanizer-zh', '中文表达润色', '删去重复和空话，让中文读起来更自然。');
await add('.claude/skills', 'research-notes', '研究笔记', '汇总资料，标出来源和待验证的问题。');
await add('.cursor/skills', 'react-review', 'React 检查', '检查组件结构、状态和交互。');
await add('.cursor/skills', 'browser-check', '浏览器检查', '检查页面交互、布局和浏览器行为。');
await add('.codex/skills/.system', 'skill-installer', 'Skill Installer', '演示系统来源的 Skill。');
await add('.codex/plugins/cache/demo/tools/1.0.0/skills', 'plugin-tool', 'Codex 插件示例', '示例缓存，不代表已启用。');
await add('.claude/plugins/cache/demo/tools/1.0.0/skills', 'plugin-tool', 'Claude 插件示例', '同名插件可以来自不同 App。');
await mkdir(path.join(home, '.claude/skills'), { recursive: true });
await symlink(shared, path.join(home, '.claude/skills/frontend-craft'));
await add('sample-project/.claude/skills', 'project-docs', '项目文档', '仅在添加对应项目后载入。');
const { server } = await createApp({ dataDirectory: path.join(directory, 'data'), aliasRoot: path.join(home, '.agents/skills'), scanOptions: { home } });
server.listen(4318, '127.0.0.1', () => console.log(`Isolated demo: http://127.0.0.1:4318\nProject fixture: ${path.join(home, 'sample-project')}`));
