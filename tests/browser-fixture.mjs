// Isolated demo: all Skill content below is synthetic; no installed library is read.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'skill-manager-demo-'));
const root = path.join(directory, 'skills');
async function add(folder, name, heading, description, body = 'Synthetic demonstration instructions.') {
  await mkdir(path.join(folder, name), { recursive: true });
  await writeFile(path.join(folder, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\nmetadata:\n  version: "1.0.0"\n---\n# ${heading}\n${body}\n`);
}
for (const sample of [
  ['frontend-craft', 'Frontend Craft', '设计并实现清晰、易用的前端界面。'],
  ['humanizer-zh', '中文表达润色', '删去重复和空话，让中文读起来更自然。'],
  ['playwright', '浏览器检查', '检查页面交互、布局和浏览器行为。'],
  ['api-review', 'API 检查', '检查接口约定、错误处理和数据边界。'],
  ['database-review', '数据库检查', '核对查询、索引与数据结构。'],
  ['document-helper', '文档整理', '整理文档结构，保留事实与来源。'],
  ['research-notes', '研究笔记', '汇总资料，标出来源和待验证的问题。'],
  ['old-frontend', 'Frontend 兼容入口', 'Compatibility alias for frontend-craft.', 'Read [frontend](../frontend-craft/SKILL.md).'],
]) await add(root, ...sample);
const pluginRoot = path.join(directory, 'plugin-cache');
await add(pluginRoot, 'react-review', 'React Review', '示例插件缓存：检查 React 组件。');
await add(pluginRoot, 'api-review', 'Plugin API Review', '示例同名来源：不代表已启用。');
const systemRoot = path.join(directory, 'system');
await add(systemRoot, 'skill-installer', 'Skill Installer', '演示系统来源的 Skill。');
const aliasRoot = path.join(directory, 'aliases');
const { server } = await createApp({ dataDirectory: path.join(directory, 'data'), aliasRoot, scanOptions: { roots: [
  { path: root, kind: 'personal', label: '演示本地目录' },
  { path: aliasRoot, kind: 'personal', label: '演示短名入口' },
  { path: pluginRoot, kind: 'plugin', label: '演示插件缓存', plugin: 'demo-plugin', pluginVersion: '1.0.0' },
  { path: systemRoot, kind: 'system', label: '演示系统目录' },
] } });
server.listen(4318, '127.0.0.1', () => console.log(`Isolated demo: http://127.0.0.1:4318\n${directory}`));
