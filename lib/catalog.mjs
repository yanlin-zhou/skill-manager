import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const CATEGORIES = [
  { id: 'frontend', name: '前端与设计', color: '#6f86b7', icon: 'layout' },
  { id: 'backend', name: '后端与数据', color: '#9b87b9', icon: 'database' },
  { id: 'writing', name: '写作与表达', color: '#bb8b65', icon: 'pen' },
  { id: 'creative', name: '图像与视频', color: '#bf8292', icon: 'image' },
  { id: 'productivity', name: '效率与协作', color: '#6e9b8c', icon: 'briefcase' },
  { id: 'engineering', name: '开发与工具', color: '#7d92a3', icon: 'code' },
  { id: 'research', name: '研究与分析', color: '#a69a66', icon: 'chart' },
  { id: 'life', name: '生活与灵感', color: '#b68f7d', icon: 'coffee' },
  { id: 'uncategorized', name: '待分类', color: '#969ba3', icon: 'folder' },
];

export function scalar(header, key) {
  const lines = header.split('\n');
  const index = lines.findIndex(line => new RegExp(`^\\s*${key}:\\s*`).test(line));
  if (index < 0) return '';
  let value = lines[index].replace(new RegExp(`^\\s*${key}:\\s*`), '').trim();
  if (/^[>|][-+]?\s*$/.test(value)) {
    const block = [];
    for (let i = index + 1; i < lines.length && /^\s+\S/.test(lines[i]); i++) block.push(lines[i].trim());
    return block.join(value.startsWith('|') ? '\n' : ' ');
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch { return value.slice(1, -1); }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  return value.replace(/\s+#.*$/, '');
}

export function parseSkill(content, fallback) {
  const match = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const header = match?.[1] || '';
  const body = match ? content.slice(match[0].length) : content;
  const name = scalar(header, 'name') || fallback;
  return {
    name,
    description: scalar(header, 'description'),
    version: scalar(header, 'version'),
    heading: body.match(/^#\s+(.+)$/m)?.[1]?.replace(/[*`]/g, '').trim() || name,
    validMetadata: Boolean(match && scalar(header, 'name') && scalar(header, 'description')),
    aliasTargetName: content.match(/Compatibility alias for\s+([\w-]+)/i)?.[1] || null,
    managerTarget: scalar(header, 'skill-manager-target') || null,
    body,
  };
}

export function inferCategory(skill) {
  const name = `${skill.name} ${skill.plugin || ''}`.toLowerCase();
  const description = `${skill.description} ${skill.heading}`.toLowerCase();
  if (/beer|recipe|travel|pet|精酿|宠物/.test(name)) return 'life';
  if (/frontend|impeccable|figma|product-design|design-taste|sites|css|tailwind|react-best|swiftui/.test(name)) return 'frontend';
  if (/writing-voice|humanizer|silicon-valley-letters|topic-workbench|google-docs/.test(name)) return 'writing';
  if (/cover|imagegen|etching|comic|film|video|illustration|creative-production|adobe|photo|canva/.test(name)) return 'creative';
  if (/supabase|postgres|backend|database|storage|queues|runtime-cache/.test(name)) return 'backend';
  if (/lark|google|document|pdf|presentation|spreadsheet|pages|calendar|gmail|meeting|slack/.test(name)) return 'productivity';
  if (/analytics|investing|equity|research|thinking-model|visualiz|market-sizing|kpi/.test(name)) return 'research';
  if (/vercel|superpowers|openai|skill-|playwright|test|code|git|api|deploy|debug|develop/.test(name)) return 'engineering';
  if (/前端|frontend|interface|web design/.test(description)) return 'frontend';
  if (/写作|写文章|writing|编辑中文/.test(description)) return 'writing';
  return 'uncategorized';
}

const ignored = new Set(['node_modules', '.git', 'references', 'assets', 'scripts', 'work', '.venv']);
async function dirs(root) {
  try { return (await readdir(root, { withFileTypes: true })).filter(d => d.isDirectory() || d.isSymbolicLink()); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

export async function scanSkills({ home = homedir(), library, roots: customRoots } = {}) {
  const roots = customRoots ? [...customRoots] : [
    { path: path.join(home, '.codex/skills'), kind: 'personal', label: 'Codex 本地' },
    { path: path.join(home, '.agents/skills'), kind: 'personal', label: '共享 Skills' },
  ];
  if (library) roots.push({ path: library, kind: 'workspace', label: '工作台导入' });
  const warnings = [];
  const pluginRoot = path.join(home, '.codex/plugins/cache');
  if (!customRoots) {
    for (const market of await dirs(pluginRoot)) {
      for (const plugin of await dirs(path.join(pluginRoot, market.name))) {
        const folder = path.join(pluginRoot, market.name, plugin.name);
        const versions = (await dirs(folder)).sort((a, b) => b.name.localeCompare(a.name, 'en', { numeric: true }));
        if (!versions.length) continue;
        roots.push({ path: path.join(folder, versions[0].name, 'skills'), kind: 'plugin', label: '插件缓存', plugin: plugin.name, pluginVersion: versions[0].name, market: market.name });
      }
    }
  }
  const skills = [];
  const seen = new Map();
  const locations = [];
  async function walk(folder, root, depth, ancestry = new Set()) {
    if (depth > 5) return;
    let canonical;
    try { canonical = await realpath(folder); }
    catch (error) { if (error.code !== 'ENOENT') warnings.push(`${folder}: ${error.code}`); return; }
    if (ancestry.has(canonical)) return;
    const nextAncestry = new Set([...ancestry, canonical]);
    const file = path.join(folder, 'SKILL.md');
    try {
      const actualFile = await realpath(file);
      if (seen.has(actualFile)) {
        seen.get(actualFile).locations.push(file);
        return;
      }
      const content = await readFile(file, 'utf8');
      const info = await stat(file);
      const parsed = parseSkill(content, path.basename(folder));
      const skill = {
        ...parsed,
        id: createHash('sha256').update(actualFile).digest('hex').slice(0, 16),
        path: file, realPath: actualFile, locations: [file],
        source: file.includes(`${path.sep}.system${path.sep}`) ? 'system' : root.kind,
        sourceLabel: root.label, plugin: root.plugin || null,
        pluginVersion: root.pluginVersion || null, market: root.market || null,
        modifiedAt: info.mtime.toISOString(), size: info.size,
        hash: createHash('sha256').update(parsed.body.trim()).digest('hex'),
        content,
      };
      skill.inferredCategory = inferCategory(skill);
      seen.set(actualFile, skill);
      skills.push(skill);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') warnings.push(`${file}: ${error.code || error.message}`);
    }
    for (const entry of await dirs(folder)) {
      if (!ignored.has(entry.name) && (!entry.name.startsWith('.') || entry.name === '.system')) {
        await walk(path.join(folder, entry.name), root, depth + 1, nextAncestry);
      }
    }
  }
  for (const root of roots) {
    const start = skills.length;
    await walk(root.path, root, 0);
    if (skills.length > start || root.kind !== 'plugin') locations.push({ ...root, count: skills.length - start });
  }
  // Multiple plugin caches may contain the same package. Prefer the newer named release.
  const retained = new Map();
  for (const skill of skills) {
    const key = skill.source === 'plugin' ? `${skill.plugin}:${skill.name}` : skill.id;
    const previous = retained.get(key);
    const isRelease = version => /^\d+\.\d+/.test(version || '');
    const newer = previous && (isRelease(skill.pluginVersion) !== isRelease(previous.pluginVersion)
      ? isRelease(skill.pluginVersion)
      : (skill.pluginVersion || '').localeCompare(previous.pluginVersion || '', 'en', { numeric: true }) > 0);
    if (!previous || newer) retained.set(key, skill);
  }
  return { skills: [...retained.values()], locations, warnings, scannedAt: new Date().toISOString() };
}

export function buildCatalog(scan, config) {
  const skills = scan.skills.map(raw => {
    const metadata = config.skills[raw.id] || {};
    const { content, body, ...safe } = raw;
    const events = config.events.filter(e => e.skillId === raw.id);
    return { ...safe, displayName: metadata.displayName || '', alias: metadata.alias || '', category: metadata.category || raw.inferredCategory,
      categoryOrigin: metadata.category ? 'manual' : 'inferred', favorite: metadata.favorite || false, archived: metadata.archived || false,
      notes: metadata.notes || '', configuredDependencies: metadata.dependencies || [], installedAlias: metadata.installedAlias || null,
      usageCount: events.length, lastUsedAt: events.map(e => e.at).sort().at(-1) || null,
    };
  });
  const byId = new Map(skills.map(s => [s.id, s]));
  const byPath = new Map();
  skills.forEach(s => { byPath.set(s.realPath, s); s.locations.forEach(p => byPath.set(p, s)); });
  const edges = [];
  const missing = [];
  const addEdge = edge => { if (!edges.some(e => e.from === edge.from && e.to === edge.to && e.type === edge.type)) edges.push(edge); };
  for (const raw of scan.skills) {
    for (const match of raw.body.matchAll(/\]\(<?([^\n)>]*SKILL\.md)(?:#[^\n)>]*)?>?\)/g)) {
      let reference;
      try { reference = decodeURIComponent(match[1]); } catch { continue; }
      if (/^(https?:|skill:|plugin:)/.test(reference)) continue;
      const destination = path.resolve(path.dirname(raw.path), reference.replace(/^~\//, `${homedir()}/`));
      const target = byPath.get(destination);
      if (target && target.id !== raw.id) addEdge({ from: raw.id, to: target.id, type: raw.aliasTargetName === target.name ? 'alias' : 'reference' });
      else if (!target && !destination.startsWith(path.dirname(raw.path) + path.sep)) missing.push({ from: raw.id, path: reference, type: 'reference' });
    }
    if (raw.aliasTargetName && !edges.some(e => e.from === raw.id && e.type === 'alias')) {
      const matching = skills.filter(s => s.name === raw.aliasTargetName);
      const target = skills.find(s => s.id === raw.managerTarget) || (matching.length === 1 ? matching[0] : null);
      if (target) addEdge({ from: raw.id, to: target.id, type: 'alias' });
    }
    for (const dependency of config.skills[raw.id]?.dependencies || []) {
      if (byId.has(dependency.id)) addEdge({ from: raw.id, to: dependency.id, type: 'manual', pinnedVersion: dependency.version || '' });
      else missing.push({ from: raw.id, path: dependency.id, type: 'manual' });
    }
  }
  for (const skill of skills) {
    const entries = skill.alias ? scan.skills.filter(entry => entry.source === 'personal' && entry.name === skill.alias) : [];
    const expected = skill.alias ? aliasMarkdown(skill) : '';
    skill.aliasVerified = entries.length === 1 && entries[0].managerTarget === skill.id && entries[0].content === expected;
    skill.aliasEntryStatus = skill.aliasVerified ? 'ready' : entries.length ? 'unverified'
      : skill.installedAlias?.name === skill.alias ? 'missing' : 'not-created';
  }
  const aliases = skills.filter(s => s.aliasTargetName);
  const groupedAliases = new Map();
  for (const alias of aliases) {
    const target = edges.find(e => e.from === alias.id && e.type === 'alias')?.to || null;
    const key = target || `unresolved:${alias.aliasTargetName}`;
    if (!groupedAliases.has(key)) groupedAliases.set(key, { target, name: alias.aliasTargetName, members: [] });
    groupedAliases.get(key).members.push(alias.id);
  }
  const aliasGroups = [...groupedAliases.values()];
  const identical = new Map();
  skills.filter(s => !s.aliasTargetName).forEach(s => { if (!identical.has(s.hash)) identical.set(s.hash, []); identical.get(s.hash).push(s.id); });
  const duplicates = [...identical.values()].filter(ids => ids.length > 1);
  const nameGroups = new Map();
  skills.forEach(s => { if (!nameGroups.has(s.name)) nameGroups.set(s.name, []); nameGroups.get(s.name).push(s.id); });
  const nameCollisions = [...nameGroups.entries()].filter(([, ids]) => ids.length > 1).map(([name, members]) => ({ name, members }));
  const drift = edges.filter(e => e.type === 'manual' && e.pinnedVersion && e.pinnedVersion !== (byId.get(e.to)?.version || byId.get(e.to)?.pluginVersion || ''));
  const candidates = CATEGORIES.filter(c => c.id !== 'uncategorized').map(c => ({ category: c.id, members: skills.filter(s => s.category === c.id && !s.archived && !s.aliasTargetName && s.source !== 'plugin' && s.source !== 'system').map(s => s.id) })).filter(c => c.members.length > 1);
  return { skills, edges, categories: [...CATEGORIES, ...(config.categories || [])], locations: scan.locations, warnings: scan.warnings, scannedAt: scan.scannedAt,
    health: { aliasGroups, duplicates, nameCollisions, missing, drift, candidates, invalidMetadata: skills.filter(s => !s.validMetadata).map(s => s.id) },
    usage: { since: config.createdAt, events: config.events, source: 'manager' },
  };
}

export function createsCycle(from, to, edges) {
  const stack = [to], visited = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (id === from) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    edges.filter(e => e.from === id).forEach(e => stack.push(e.to));
  }
  return false;
}

export function aliasMarkdown(skill) {
  const target = encodeURI(skill.path).replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `---\nname: ${skill.alias}\ndescription: ${JSON.stringify(`Compatibility alias for ${skill.name}. 仅当用户明确调用 $${skill.alias} 时使用此快捷入口。`)}\nmetadata:\n  skill-manager-target: ${skill.id}\n---\n\n# ${skill.alias}\n\n读取 [${skill.name.replace(/[\[\]]/g, '')}](${target})，按照该 Skill 的指令执行用户任务。\n如果本轮已读取目标 Skill，请复用已有指令。目标不存在时报告缺失，不回退到其他 Skill。\n`;
}
