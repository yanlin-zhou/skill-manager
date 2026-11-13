import { readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export const APPS = [
  { id: 'codex', name: 'Codex', initial: 'Cx', folders: ['.agents/skills', '.codex/skills'], pluginFolder: '.codex/plugins/cache' },
  { id: 'claude', name: 'Claude Code', initial: 'Cl', folders: ['.claude/skills'], pluginFolder: '.claude/plugins/cache' },
  { id: 'cursor', name: 'Cursor', initial: 'Cu', folders: ['.cursor/skills', '.agents/skills', '.claude/skills', '.codex/skills'] },
];

export function sourceSettings(config) {
  if (!config.appSources) return { apps: ['codex'], projects: [], configured: false };
  const value = config.appSources;
  return { apps: APPS.filter(app => Array.isArray(value.apps) && value.apps.includes(app.id)).map(app => app.id),
    projects: Array.isArray(value.projects) ? value.projects.filter(p => typeof p === 'string' && path.isAbsolute(p)) : [], configured: value.configured === true };
}

export async function validateSources(input, home = homedir()) {
  if (!input || !Array.isArray(input.apps) || input.apps.length > APPS.length || input.apps.some(id => !APPS.some(app => app.id === id)) || new Set(input.apps).size !== input.apps.length) throw new Error('请选择列表中的 App');
  if (!Array.isArray(input.projects || []) || (input.projects || []).length > 20) throw new Error('最多添加 20 个项目目录');
  const projects = [];
  for (const value of input.projects || []) {
    if (typeof value !== 'string' || value.length > 2000 || value.includes('\0')) throw new Error('项目目录格式不正确');
    const expanded = value.trim().replace(/^~(?=\/|$)/, home);
    if (!path.isAbsolute(expanded)) throw new Error('项目目录请使用绝对路径，例如 ~/projects/my-app');
    let canonical;
    try { canonical = await realpath(expanded); if (!(await stat(canonical)).isDirectory()) throw new Error(); }
    catch { throw new Error(`项目目录不存在或无法读取：${value}`); }
    if (!projects.includes(canonical)) projects.push(canonical);
  }
  return { apps: APPS.filter(app => input.apps.includes(app.id)).map(app => app.id), projects, configured: true };
}

async function directories(folder) {
  try { return (await readdir(folder, { withFileTypes: true })).filter(item => item.isDirectory() || item.isSymbolicLink()); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

export async function rootsForApps({ home = homedir(), selectedApps = ['codex'], projects = [], warnings = [] } = {}) {
  const roots = new Map();
  function add(root) {
    const key = `${root.kind}:${root.path}`;
    if (roots.has(key)) roots.get(key).appIds = [...new Set([...roots.get(key).appIds, ...root.appIds])];
    else roots.set(key, root);
  }
  for (const app of APPS.filter(app => selectedApps.includes(app.id))) {
    for (const base of [home, ...projects]) {
      for (const folder of app.folders) add({ path: path.join(base, folder), kind: 'personal', label: `${app.name}${base === home ? ' 本地' : ' 项目'}`, appIds: [app.id], project: base === home ? null : base });
    }
    if (!app.pluginFolder) continue;
    const pluginRoot = path.join(home, app.pluginFolder);
    try { for (const market of await directories(pluginRoot)) {
      for (const plugin of await directories(path.join(pluginRoot, market.name))) {
        const folder = path.join(pluginRoot, market.name, plugin.name);
        const versions = (await directories(folder)).sort((a, b) => b.name.localeCompare(a.name, 'en', { numeric: true }));
        if (versions.length) add({ path: path.join(folder, versions[0].name, 'skills'), kind: 'plugin', label: `${app.name} 插件缓存`, appIds: [app.id], plugin: plugin.name, pluginVersion: versions[0].name, market: market.name });
      }
    } } catch (error) { warnings.push(`${app.name} 插件目录：${error.code || error.message}`); }
  }
  return [...roots.values()];
}

export async function appStatus(config, { home = homedir() } = {}) {
  const settings = sourceSettings(config);
  const apps = await Promise.all(APPS.map(async app => {
    const directories = await Promise.all([...app.folders, ...(app.pluginFolder ? [app.pluginFolder] : [])].map(async folder => {
      const location = path.join(home, folder);
      try { return { path: location, displayPath: `~/${folder}`, exists: (await stat(location)).isDirectory() }; }
      catch { return { path: location, displayPath: `~/${folder}`, exists: false }; }
    }));
    return { id: app.id, name: app.name, initial: app.initial, selected: settings.apps.includes(app.id), directories };
  }));
  return { ...settings, available: apps };
}
