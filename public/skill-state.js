export const SOURCE_SCOPES = [
  ['personal', '个人'], ['all', '全部'], ['plugin', '插件缓存'], ['system', '系统'],
];

export function normalizeScope(value) {
  return SOURCE_SCOPES.some(([id]) => id === value) ? value : 'personal';
}

export function readScope(storage) {
  try { return normalizeScope(storage.getItem('skill-source')); }
  catch { return 'personal'; }
}

export function saveScope(storage, value) {
  const scope = normalizeScope(value);
  try { storage.setItem('skill-source', scope); } catch { /* The selection still works for this visit. */ }
  return scope;
}

export function scopeSkills(skills, scope) {
  const selected = normalizeScope(scope);
  return skills.filter(skill => selected === 'all' || (selected === 'personal'
    ? ['personal', 'workspace'].includes(skill.source) : skill.source === selected));
}

export function filterSkills(skills, { scope = 'personal', category = 'all', filter = 'all', query = '', terms = () => [] } = {}) {
  const q = query.trim().replace(/^[$/]/, '').toLowerCase();
  return scopeSkills(skills, scope).filter(skill => {
    if (filter === 'archived' ? !skill.archived : skill.archived) return false;
    if (filter === 'favorite' && !skill.favorite) return false;
    if (filter === 'aliases' && !skill.alias && !skill.aliasTargetName) return false;
    if (category !== 'all' && skill.category !== category) return false;
    return !q || [skill.name, skill.displayName, skill.alias, skill.description, skill.plugin, skill.notes, ...terms(skill)].join(' ').toLowerCase().includes(q);
  });
}

export function scopeCounts(skills, scope) {
  const inScope = scopeSkills(skills, scope);
  const active = inScope.filter(skill => !skill.archived);
  return { active: active.length, archived: inScope.length - active.length,
    categories: Object.fromEntries([...new Set(active.map(skill => skill.category))].map(id => [id, active.filter(skill => skill.category === id).length])),
  };
}

const validName = name => typeof name === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(name);
export function aliasStatusLabel(skill) {
  return ({ ready: '入口已创建', unverified: '入口待核对', missing: '入口未找到', 'not-created': '入口未创建' })[skill.aliasEntryStatus] || '入口未创建';
}
export function invocationState(skill, skills) {
  if (!skill) return { commands: [], status: 'Skill 未找到', aliasReady: false };
  const commands = [];
  const collisions = skills.filter(other => other.id !== skill.id && other.name === skill.name);
  const aliasEntry = skill.aliasVerified && validName(skill.alias) && skills.find(entry => entry.source === 'personal' && entry.name === skill.alias && entry.managerTarget === skill.id);
  const sourceState = skill.source === 'plugin' ? '插件缓存 · 启用状态未知'
    : skill.source === 'workspace' ? '导入文件 · 未完整安装'
    : skill.source === 'system' ? '系统 Skill · 调用状态未确认'
    : !skill.validMetadata ? '元数据待核对'
    : !validName(skill.name) ? '名称待核对'
    : collisions.length ? '同名待核对' : '本地 Skill';
  if (skill.source === 'personal' && skill.validMetadata && validName(skill.name) && !collisions.length) commands.push(`$${skill.name}`);
  // An imported Markdown file is not evidence that the complete Skill is installed.
  if (aliasEntry && skill.source !== 'workspace' && !skills.some(entry => entry.id !== aliasEntry.id && entry.name === skill.alias)) commands.push(`$${skill.alias}`);
  return { commands, status: sourceState, aliasReady: Boolean(aliasEntry) };
}

export function localVersion(skill) {
  return { label: skill.version ? 'Skill 版本' : skill.pluginVersion ? '插件包版本' : 'Skill 版本', value: skill.version || skill.pluginVersion || '未标版本' };
}

export function healthReviewCount(health) {
  return health.duplicates.length + health.nameCollisions.length + health.missing.length + health.drift.length
    + health.aliasGroups.filter(group => !group.target).length;
}
