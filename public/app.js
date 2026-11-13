import { icon } from './icons.js';
import { SOURCE_SCOPES, readScope, saveScope, filterSkills, scopeCounts, invocationState, aliasStatusLabel, localVersion, healthReviewCount } from './skill-state.js';

const $ = (selector, root = document) => root.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const app = $('#app'), drawer = $('#drawer'), modal = $('#modal');
const state = { data: null, page: 'library', category: 'all', filter: 'all', source: readScope(localStorage), query: '', sort: 'smart', view: localStorage.getItem('skill-view') || 'grid', pageNumber: 1, drawerId: null, drawerTab: 'overview', graphId: null, graphZoom: 1, usageFilter: 'all', repositories: [], mobileNav: false };
const pageNames = { library: '我的技能', health: '整理建议', dependencies: '依赖关系', usage: '使用记录', discover: '发现 Skills', settings: '设置' };
const title = skill => skill.displayName || skill.heading || skill.name;
const summary = skill => skill.description || '暂无描述';
const skillById = id => state.data.skills.find(skill => skill.id === id);
const categoryById = id => state.data.categories.find(category => category.id === id) || state.data.categories.at(-1);
const countText = num => new Intl.NumberFormat('zh-CN').format(num);
const shortDate = value => value ? new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '—';
const btn = (action, text, iconName, cls = 'button', data = '') => `<button type="button" class="${cls}" data-action="${action}" ${data}>${iconName ? icon(iconName) : ''}${text}</button>`;
const skillMark = (skill, size = '') => { const category = categoryById(skill.category); return `<span class="skill-mark ${size}" style="--category:${category.color}">${icon(category.icon)}</span>`; };
const pill = category => `<span class="category-pill" style="--category:${category.color}"><i></i>${escape(category.name)}</span>`;
const sourceLabel = skill => ({ personal: '本地 Skill', plugin: skill.plugin || '插件缓存', system: '系统 Skill', workspace: '工作台导入' }[skill.source]);
function healthCount() { return healthReviewCount(state.data.health); }
const searchTerms = skill => [title(skill), summary(skill), categoryById(skill.category).name];
const selectedSourceLabel = () => SOURCE_SCOPES.find(([id]) => id === state.source)[1];
function selectSource(value) { state.source = saveScope(localStorage, value); state.pageNumber = 1; }
async function api(route, options = {}) {
  const response = await fetch(route, { ...options, headers: { 'Content-Type': 'application/json', 'X-Skill-Manager': 'local', ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '操作未完成，请重试');
  return data;
}
let toastTimer;
function toast(message, error = false) {
  const node = $('#toast');
  node.innerHTML = `${icon(error ? 'alert' : 'checkcircle')}<span>${escape(message)}</span>`;
  node.className = `visible ${error ? 'error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.className = ''; }, error ? 6500 : 3500);
}
async function busy(button, task) {
  if (button?.disabled) return;
  if (button) { button.disabled = true; button.classList.add('busy'); }
  try { return await task(); }
  catch (error) { toast(error.message, true); }
  finally { if (button) { button.disabled = false; button.classList.remove('busy'); } }
}
async function updateSkill(id, patch) {
  state.data = await api(`/api/skills/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  render();
}

function renderSidebar() {
  const data = state.data;
  const nav = [ ['library', 'grid'], ['health', 'sparkles'], ['dependencies', 'graph'], ['usage', 'chart'] ];
  const counts = scopeCounts(data.skills, state.source);
  return `<aside class="sidebar ${state.mobileNav ? 'mobile-open' : ''}" aria-label="主导航">
    <a class="brand" href="#library"><span class="brand-mark"><img src="/favicon.svg" alt="" /></span><span>Skill Manager</span></a>
    ${btn('mobile-nav', '', 'close', 'icon-button mobile-nav-close', 'aria-label="关闭导航"')}<button class="workspace-picker" data-action="settings"><span class="workspace-avatar">C</span><span>Codex<small>本地 Skills</small></span>${icon('down')}</button>
    <nav class="primary-nav">${nav.map(([page, glyph]) => `<a href="#${page}" class="nav-item ${state.page === page && state.category === 'all' && state.filter !== 'favorite' && state.filter !== 'archived' ? 'active' : ''}" ${state.page === page ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${pageNames[page]}</span>${page === 'library' ? `<span class="nav-count">${counts.active}</span>` : page === 'health' && healthCount() ? `<span class="nav-count attention">${healthCount()}</span>` : ''}</a>`).join('')}
    <a href="#discover" class="nav-item ${state.page === 'discover' ? 'active' : ''}">${icon('compass')}<span>发现 Skills</span>${icon('external', 'nav-external')}</a></nav>
    <div class="nav-section-label"><span>我的分类</span>${btn('add-category', '', 'plus', 'icon-button small', 'aria-label="新增分类"')}</div>
    <nav class="category-nav">${data.categories.filter(c => c.id !== 'uncategorized').map(category => `<button class="nav-item ${state.category === category.id && state.page === 'library' ? 'active' : ''}" data-action="category" data-id="${category.id}"><i class="category-dot" style="background:${category.color}"></i><span>${escape(category.name)}</span><span class="category-count">${counts.categories[category.id] || 0}</span></button>`).join('')}
      <button class="nav-item ${state.category === 'uncategorized' ? 'active' : ''}" data-action="category" data-id="uncategorized">${icon('folder')}<span>待分类</span><span class="category-count">${counts.categories.uncategorized || 0}</span></button>
    </nav>
    <div class="sidebar-bottom"><button class="nav-item ${state.filter === 'archived' ? 'active' : ''}" data-action="archived">${icon('archive')}<span>已归档</span><span class="category-count">${counts.archived || ''}</span></button><a href="#settings" class="nav-item ${state.page === 'settings' ? 'active' : ''}">${icon('settings')}<span>设置</span></a>
      </div>
  </aside>`;
}

function render() {
  if (!state.data) return;
  app.innerHTML = `${renderSidebar()}${state.mobileNav ? btn('mobile-nav', '', null, 'mobile-nav-backdrop', 'aria-label="收起导航"') : ''}<div class="app-main"><header class="topbar">${btn('mobile-nav', '', 'menu', 'icon-button mobile-toggle', 'aria-label="展开导航" aria-expanded="' + state.mobileNav + '"')}<div class="topbar-actions"><button class="command-button" data-action="command" aria-label="快速查找 Skill">${icon('search')}<span>快速查找</span><kbd>⌘ K</kbd></button></div></header><main id="main" tabindex="-1">${renderPage()}</main></div>`;
  document.title = `${pageNames[state.page]} · Skill Manager`;
}

function pageHeading(name, actions = '') { return `<div class="page-heading"><h1>${name}</h1>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</div>`; }
function renderPage() {
  switch (state.page) {
    case 'health': return renderHealth();
    case 'dependencies': return renderDependencies();
    case 'usage': return renderUsage();
    case 'discover': return renderDiscover();
    case 'settings': return renderSettings();
    default: return renderLibrary();
  }
}

function filteredSkills() {
  return filterSkills(state.data.skills, { scope: state.source, category: state.category, filter: state.filter, query: state.query, terms: searchTerms }).sort((a, b) => {
    if (state.sort === 'name') return title(a).localeCompare(title(b), 'zh-CN');
    if (state.sort === 'updated') return b.modifiedAt.localeCompare(a.modifiedAt);
    if (state.sort === 'used') return b.usageCount - a.usageCount;
    const rank = s => (s.favorite ? -1000 : 0) + (s.aliasTargetName ? 300 : 0) + (s.source === 'system' ? 200 : s.source === 'plugin' ? 100 : 0) ;
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
}

function renderLibrary() {
  const selectedCategory = state.category !== 'all' ? categoryById(state.category) : null;
  const heading = state.filter === 'archived' ? '已归档' : selectedCategory?.name || '我的技能';
  const tabCount = filter => filterSkills(state.data.skills, { scope: state.source, category: state.category, filter }).length;
  return `${pageHeading(heading, `${btn('rescan', '扫描本地', 'refresh', 'button secondary')}${btn('add-skill', '导入 Skill', 'plus', 'button primary')}`)}
    <div class="source-switch" role="group" aria-label="来源范围">${SOURCE_SCOPES.map(([id, label]) => `<button type="button" data-action="source-scope" data-id="${id}" aria-pressed="${state.source === id}" class="${state.source === id ? 'active' : ''}">${label}<span>${scopeCounts(state.data.skills, id).active}</span></button>`).join('')}</div>
    <div class="library-tabs" role="group" aria-label="技能筛选">${[['all', '全部技能'], ['favorite', '我的收藏'], ['aliases', '快捷入口']].map(([id, label]) => `<button data-action="filter" data-id="${id}" class="tab ${state.filter === id ? 'active' : ''}" aria-pressed="${state.filter === id}">${id === 'favorite' ? icon('star') : ''}${label}<span>${tabCount(id)}</span></button>`).join('')}</div>
    <div class="library-toolbar"><label class="search-field">${icon('search')}<input id="library-search" type="search" placeholder="搜索名称、短名或描述…" value="${escape(state.query)}" aria-label="搜索技能"/><kbd>/</kbd></label><div class="toolbar-selects"><label class="select-wrap sort-select"><span class="sr-only">排序方式</span><select id="sort-select">${[['smart', '默认排序'], ['name', '按名称排序'], ['updated', '文件修改时间'], ['used', '使用记录最多']].map(([v, l]) => `<option value="${v}" ${state.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${icon('down')}</label><div class="view-toggle">${btn('view-grid', '', 'grid', state.view === 'grid' ? 'icon-button active' : 'icon-button', 'aria-label="卡片视图" aria-pressed="' + (state.view === 'grid') + '"')}${btn('view-list', '', 'list', state.view === 'list' ? 'icon-button active' : 'icon-button', 'aria-label="列表视图" aria-pressed="' + (state.view === 'list') + '"')}</div></div></div>
    <div id="library-results">${renderLibraryResults()}</div>`;
}
function renderLibraryResults() {
  const results = filteredSkills();
  const totalPages = Math.max(1, Math.ceil(results.length / 18));
  state.pageNumber = Math.min(state.pageNumber, totalPages);
  const visible = results.slice((state.pageNumber - 1) * 18, state.pageNumber * 18);
  const recovery = `${state.source !== 'all' ? btn('source-scope', '查看全部来源', 'layers', 'button secondary', 'data-id="all"') : ''}${state.query || state.category !== 'all' || state.filter !== 'all' ? btn('reset-filter', '清除筛选', 'refresh', 'button secondary') : state.source === 'all' ? btn('rescan', '扫描本地', 'refresh', 'button secondary') : ''}`;
  return `<div class="results-caption"><span>${selectedSourceLabel()} · ${state.query ? `找到 ${results.length} 个 Skill` : `共 ${results.length} 个 Skill`}${state.category !== 'all' ? ` · ${escape(categoryById(state.category).name)}` : ''}</span>${state.filter === 'archived' ? '<span>仅在工作台隐藏</span>' : state.source === 'plugin' ? '<span>缓存不代表已启用</span>' : ''}</div>
    ${!visible.length ? empty('search', state.query ? '没有找到这个 Skill' : state.filter === 'favorite' ? '暂无收藏' : state.filter === 'aliases' ? '暂无快捷入口' : '暂无 Skill', state.query ? '换个关键词试试。' : state.filter === 'favorite' ? '点击星标加入收藏。' : '', recovery) : `<div class="skills-${state.view}">${state.view === 'list' ? '<div class="list-header"><span>Skill</span><span>分类</span><span>快捷短名</span><span>来源</span><span></span></div>' : ''}${visible.map(renderSkill).join('')}</div>`}
    ${results.length ? `<div class="pagination"><span>显示 ${(state.pageNumber - 1) * 18 + 1}–${Math.min(state.pageNumber * 18, results.length)}，共 ${results.length} 个</span><div>${btn('prev-page', '上一页', null, 'button text-button', state.pageNumber === 1 ? 'disabled' : '')}<span>${state.pageNumber} / ${totalPages}</span>${btn('next-page', '下一页', null, 'button text-button', state.pageNumber === totalPages ? 'disabled' : '')}</div></div>` : ''}`;
}
function renderSkill(skill) {
  const category = categoryById(skill.category);
  const tag = skill.alias ? `<span class="alias-chip">$${escape(skill.alias)}${!skill.aliasVerified ? `<small>${aliasStatusLabel(skill)}</small>` : ''}</span>` : `<span class="set-alias">${icon('plus')}设置短名</span>`;
  if (state.view === 'list') return `<div class="skill-row"><button class="row-main" data-action="open-skill" data-id="${skill.id}">${skillMark(skill)}<span><strong>${escape(title(skill))}</strong><small>${escape(skill.name)}</small></span></button><span>${pill(category)}</span><button class="alias-button" data-action="edit-alias" data-id="${skill.id}">${tag}</button><span class="row-source">${escape(sourceLabel(skill))}</span>${btn('favorite', '', 'star', `icon-button favorite-button ${skill.favorite ? 'is-favorite' : ''}`, `data-id="${skill.id}" aria-label="${skill.favorite ? '取消收藏' : '收藏'} ${escape(title(skill))}"`)}</div>`;
  return `<article class="skill-card ${skill.aliasTargetName ? 'compatibility-card' : ''}"><div class="card-top">${skillMark(skill)}<div class="card-top-actions">${skill.aliasTargetName ? '<span class="compatibility-label">兼容入口</span>' : ''}${btn('favorite', '', 'star', `icon-button favorite-button ${skill.favorite ? 'is-favorite' : ''}`, `data-id="${skill.id}" aria-label="${skill.favorite ? '取消收藏' : '收藏'} ${escape(title(skill))}" aria-pressed="${skill.favorite}"`)}</div></div><button class="card-content" data-action="open-skill" data-id="${skill.id}"><h3>${escape(title(skill))}</h3><div class="skill-original">${escape(skill.name)}</div><p>${escape(summary(skill))}</p></button><div class="card-tags">${pill(category)}<span class="source-mini">${skill.source === 'plugin' ? '插件缓存' : skill.source === 'system' ? '系统' : skill.source === 'workspace' ? '导入' : '本地'}</span></div><div class="card-footer"><button class="alias-button" data-action="edit-alias" data-id="${skill.id}">${tag}</button>${btn('open-skill', '', 'arrow', 'icon-button card-arrow', `data-id="${skill.id}" aria-label="查看 ${escape(title(skill))}"`)}</div></article>`;
}
function empty(glyph, heading, text, action = '') { return `<div class="empty-state"><span class="empty-icon">${icon(glyph)}</span><h3>${heading}</h3>${text ? `<p>${text}</p>` : ''}${action}</div>`; }

function renderHealth() {
  const h = state.data.health;
  const issueCards = [];
  h.aliasGroups.filter(group => !group.target).forEach(group => issueCards.push(`<article class="review-card"><div class="review-card-heading"><span class="review-symbol amber">${icon('link')}</span><div><span class="overline">兼容目标待核对</span><h3>${escape(group.name)} · 未找到目标</h3></div></div><div class="review-skill-list">${group.members.map(id => skillChip(id, true)).join('')}</div>${btn('review-group', '查看入口', 'arrow', 'button secondary', `data-ids="${group.members.join(',')}"`)}</article>`));
  h.duplicates.forEach(ids => issueCards.push(`<article class="review-card"><div class="review-card-heading"><span class="review-symbol amber">${icon('copy')}</span><div><span class="overline">正文一致</span><h3>${ids.length} 份 Skill 的正文完全相同</h3></div></div><div class="review-skill-list">${ids.map(id => skillChip(id, true)).join('')}</div>${btn('review-group', '查看相关 Skills', 'arrow', 'button secondary', `data-ids="${ids.join(',')}"`)}</article>`));
  h.nameCollisions.forEach(group => issueCards.push(`<article class="review-card compact"><div class="review-card-heading"><span class="review-symbol amber">${icon('alert')}</span><div><span class="overline">同名待核对</span><h3>${escape(group.name)} · ${group.members.length} 份</h3></div></div><div class="review-skill-list">${group.members.map(id => skillChip(id, true)).join('')}</div>${btn('review-group', '查看来源', 'arrow', 'button secondary', `data-ids="${group.members.join(',')}"`)}</article>`));
  h.missing.forEach(item => issueCards.push(`<article class="review-card"><div class="review-card-heading"><span class="review-symbol amber">${icon('link')}</span><div><span class="overline">引用待核对</span><h3>未在扫描范围内找到</h3></div></div><div class="missing-list"><div>${skillChip(item.from)}<code>${escape(item.path)}</code></div></div>${btn('open-dependencies', '查看引用', 'arrow', 'button secondary', `data-id="${item.from}"`)}</article>`));
  h.drift.forEach(edge => { const version = localVersion(skillById(edge.to)); issueCards.push(`<article class="review-card"><div class="review-card-heading"><span class="review-symbol amber">${icon('refresh')}</span><div><span class="overline">版本记录变化</span><h3>${escape(title(skillById(edge.from)))}</h3></div></div><div class="review-skill-list">${skillChip(edge.from)}${icon('arrow')}${skillChip(edge.to)}</div><p>${escape(version.label)}：${escape(edge.pinnedVersion)} → ${escape(version.value)}</p>${btn('focus-dependencies', '查看依赖版本', 'arrow', 'button secondary', `data-id="${edge.from}"`)}</article>`); });
  const compatible = h.aliasGroups.filter(group => group.target);
  return `${pageHeading('整理建议', btn('rescan', '重新检查', 'refresh', 'button secondary'))}<p class="page-note">全库检查 · 含插件缓存</p><div class="section-heading"><h2>待核对 <span>${healthCount()}</span></h2></div><div class="review-grid">${issueCards.join('') || empty('checkcircle', '暂无待核对项', '')}</div>${compatible.length ? `<div class="section-heading spaced"><h2>兼容入口</h2><span>${compatible.length} 组</span></div><div class="review-grid">${compatible.map(group => `<article class="review-card"><div class="review-card-heading"><span class="review-symbol blue">${icon('link')}</span><div><h3>${escape(group.name)} · ${group.members.length} 个入口</h3></div></div><div class="review-skill-list">${group.members.map(id => skillChip(id)).join('')}<span class="relation-arrow">${icon('arrow')}</span>${skillChip(group.target)}</div><div class="review-actions"><span>SKILL.md 兼容声明</span>${btn('review-group', '查看入口', 'arrow', 'button secondary', `data-ids="${group.members.join(',')}"`)}</div></article>`).join('')}</div>` : ''}<div class="section-heading spaced"><h2>同类 Skills</h2><span>按个人分类分组</span></div><div class="scenario-grid">${h.candidates.map(group => { const category = categoryById(group.category); return `<article class="scenario-card"><span class="scenario-icon" style="color:${category.color}">${icon(category.icon)}</span><h3>${escape(category.name)}</h3><p>${group.members.length} 个 Skill</p><div class="scenario-names">${group.members.slice(0, 4).map(id => `<span>${escape(skillById(id).name)}</span>`).join('')}${group.members.length > 4 ? `<span>+${group.members.length - 4}</span>` : ''}</div>${btn('personal-category', '查看分类', 'arrow', 'button text-button', `data-id="${category.id}"`)}</article>`; }).join('')}</div>`;
}
function skillChip(id, withSource = false) { const skill = skillById(id); return skill ? `<button class="skill-chip" data-action="open-skill" data-id="${id}">${icon(categoryById(skill.category).icon)}${escape(title(skill))}${withSource ? `<small>${escape(sourceLabel(skill))}</small>` : ''}${skill.archived ? '<small>已归档</small>' : ''}</button>` : ''; }

function graphRoot() {
  return skillById(state.graphId) || state.data.skills.find(s => !s.archived && ['personal', 'workspace'].includes(s.source)) || state.data.skills[0];
}
function renderDependencies() {
  const root = graphRoot();
  if (!root) return pageHeading('依赖关系') + empty('graph', '还没有可连接的 Skill', '先扫描或导入一个 Skill。');
  state.graphId = root.id;
  const incoming = state.data.edges.filter(e => e.to === root.id);
  const outgoing = state.data.edges.filter(e => e.from === root.id);
  return `${pageHeading('依赖关系', btn('open-dependencies', '配置依赖', 'plus', 'button primary', `data-id="${root.id}"`))}<div class="graph-toolbar"><label class="select-wrap graph-select"><span>中心 Skill</span><select id="graph-root">${[...state.data.skills].sort((a, b) => title(a).localeCompare(title(b))).map(s => `<option value="${s.id}" ${s.id === root.id ? 'selected' : ''}>${escape(title(s))} · ${escape(sourceLabel(s))}</option>`).join('')}</select>${icon('down')}</label><div class="graph-legend"><span><i class="line-sample"></i>文件引用</span><span><i class="line-sample alias"></i>兼容入口</span><span><i class="line-sample manual"></i>手动依赖</span></div></div><div class="graph-canvas"><div class="graph-meta"><span class="status-light"></span> ${incoming.length + outgoing.length} 条关联</div><div class="graph-scroll" id="graph-scroll"><div class="graph-inner" style="--zoom:${state.graphZoom}">${renderGraph(root, incoming, outgoing)}</div></div><div class="graph-controls">${btn('zoom-out', '−', null, 'icon-button', 'aria-label="缩小关系图"')}<span>${Math.round(state.graphZoom * 100)}%</span>${btn('zoom-in', '+', null, 'icon-button', 'aria-label="放大关系图"')}${btn('zoom-reset', '重置', null, 'button text-button')}</div></div><div class="graph-bottom"><div class="graph-note">${icon('info')}<p>引用不代表必需依赖；手动配置不修改源文件。</p></div><div class="graph-selected"><span class="overline">当前 Skill</span><h3>${escape(title(root))}</h3><div class="graph-selected-counts"><span><strong>${incoming.length}</strong> 被引用</span><span><strong>${outgoing.length}</strong> 向外引用</span><span><strong>${escape(localVersion(root).value)}</strong> ${localVersion(root).label}</span></div>${btn('open-dependencies', '编辑依赖', 'arrow', 'button text-button', `data-id="${root.id}"`)}</div></div>${state.data.health.drift.length ? `<div class="section-heading"><h2>版本记录待同步</h2></div>${state.data.health.drift.map(edge => `<div class="version-row">${skillChip(edge.from)}${icon('arrow')}${skillChip(edge.to)}<code>${escape(edge.pinnedVersion)} → ${escape(skillById(edge.to).version || skillById(edge.to).pluginVersion || '无版本号')}</code>${btn('sync-version', '更新版本记录', 'refresh', 'button secondary', `data-from="${edge.from}" data-to="${edge.to}"`)}</div>`).join('')}` : ''}`;
}
function renderGraph(root, incoming, outgoing) {
  const height = Math.max(380, Math.max(incoming.length, outgoing.length) * 86 + 130);
  const nodeWidth = 218, nodeHeight = 65;
  const rootY = height / 2 - nodeHeight / 2;
  const positions = [];
  incoming.forEach((edge, i) => positions.push({ skill: skillById(edge.from), edge, x: 40, y: height / 2 - incoming.length * 43 + i * 86 + 10, direction: 'in' }));
  outgoing.forEach((edge, i) => positions.push({ skill: skillById(edge.to), edge, x: 710, y: height / 2 - outgoing.length * 43 + i * 86 + 10, direction: 'out' }));
  const edges = positions.map(node => {
    const x1 = node.direction === 'in' ? node.x + nodeWidth : 375 + nodeWidth;
    const y1 = node.direction === 'in' ? node.y + 32 : rootY + 32;
    const x2 = node.direction === 'in' ? 375 : node.x;
    const y2 = node.direction === 'in' ? rootY + 32 : node.y + 32;
    const mid = (x1 + x2) / 2;
    return `<path class="graph-edge ${node.edge.type}" d="M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}" marker-end="url(#graph-arrow)"/>`;
  }).join('');
  const node = (skill, x, y, center = false) => `<button class="graph-node ${center ? 'center' : ''}" style="left:${x}px;top:${y}px" data-action="${center ? 'open-dependencies' : 'graph-focus'}" data-id="${skill.id}">${skillMark(skill, 'small')}<span><strong>${escape(title(skill))}</strong><small>${center ? '当前 Skill' : skill.aliasTargetName ? '兼容入口' : escape(categoryById(skill.category).name)}</small></span></button>`;
  return `<div class="graph-board" style="height:${height}px"><svg class="graph-lines" viewBox="0 0 970 ${height}" aria-hidden="true"><defs><marker id="graph-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 1L8 5L0 9" fill="none" stroke="#adb7c4" stroke-width="1.3"/></marker></defs>${edges}</svg><span class="graph-column-label" style="left:40px">引用它的 Skills</span><span class="graph-column-label" style="left:710px">它引用的 Skills</span>${positions.map(p => node(p.skill, p.x, p.y)).join('')}${node(root, 375, rootY, true)}${!incoming.length ? '<div class="graph-empty-label" style="left:40px">暂无入向引用</div>' : ''}${!outgoing.length ? `<button class="graph-add-node" style="left:710px;top:${rootY}px" data-action="open-dependencies" data-id="${root.id}">${icon('plus')}添加一个依赖</button>` : ''}</div>`;
}

function renderUsage() {
  const used = state.data.skills.filter(s => s.usageCount);
  const total = state.data.usage.events.length;
  const list = state.data.skills.filter(s => !s.archived && (state.usageFilter === 'used' ? s.usageCount > 0 : state.usageFilter === 'unseen' ? !s.usageCount : true)).sort((a, b) => b.usageCount - a.usageCount || (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''));
  return `${pageHeading('使用记录')}<p class="page-note">全库 · 仅含手动记录；无记录不代表未使用。</p><section class="stats-strip usage-stats"><div class="stat"><div class="stat-label">累计记录</div><div class="stat-number">${total}<span>次</span></div></div><div class="stat"><div class="stat-label">有记录的 Skills</div><div class="stat-number">${used.length}<span>个</span></div></div><div class="stat"><div class="stat-label">记录开始于</div><div class="stat-number date-number">${shortDate(state.data.usage.since)}</div></div></section>${!total ? '' : `<div class="usage-bars">${used.sort((a, b) => b.usageCount - a.usageCount).slice(0, 5).map(s => `<div><button data-action="open-skill" data-id="${s.id}">${escape(title(s))}</button><span class="usage-bar-track"><i style="width:${s.usageCount / Math.max(...used.map(u => u.usageCount)) * 100}%"></i></span><strong>${s.usageCount}</strong></div>`).join('')}</div>`}<div class="library-tabs">${[['all', '全部'], ['used', '有使用记录'], ['unseen', '尚无记录']].map(([id, label]) => `<button class="tab ${state.usageFilter === id ? 'active' : ''}" data-action="usage-filter" data-id="${id}">${label}</button>`).join('')}</div><div class="usage-table"><div class="usage-row header"><span>Skill</span><span>记录次数</span><span>最近记录</span><span></span></div>${list.slice(0, 50).map(skill => `<div class="usage-row"><button class="usage-skill" data-action="open-skill" data-id="${skill.id}">${skillMark(skill, 'small')}<span>${escape(title(skill))}</span></button><span>${skill.usageCount || '尚无记录'}</span><span>${shortDate(skill.lastUsedAt)}</span>${btn('record-use', '记录使用', 'plus', 'button text-button', `data-id="${skill.id}"`)}</div>`).join('')}</div>${list.length > 50 ? `<p class="footnote">显示前 50 个</p>` : ''}`;
}

function renderDiscover() {
  const counts = state.data.categories.map(c => ({ ...c, count: state.data.skills.filter(s => s.category === c.id && !s.archived && s.source !== 'plugin' && s.source !== 'system').length })).filter(c => c.id !== 'uncategorized');
  return `${pageHeading('发现 Skills', `${btn('refresh-discover', '刷新热度', 'refresh', 'button secondary')}<a class="button primary" href="https://skills.sh/" target="_blank" rel="noopener noreferrer">skills.sh ${icon('external')}</a>`)}<div class="section-heading"><h2>场景覆盖</h2><span>本地 Skills，不含插件缓存</span></div><div class="coverage-strip">${counts.map(c => `<button data-action="personal-category" data-id="${c.id}" class="coverage-item ${!c.count ? 'gap' : ''}"><span style="color:${c.color}">${icon(c.icon)}</span><strong>${c.count}</strong><span>${escape(c.name)}</span></button>`).join('')}</div><div class="section-heading spaced"><h2>开源项目</h2></div><div class="repo-grid">${state.repositories.length ? state.repositories.map(repo => `<article class="repo-card"><div class="repo-card-top"><span class="repo-logo ${repo.color}">${escape(repo.initial)}</span><a href="${escape(repo.url)}" target="_blank" rel="noopener noreferrer" aria-label="打开 ${escape(repo.name)} 的 GitHub 仓库">${icon('external')}</a></div><h3>${escape(repo.name)}</h3><span class="repo-path">${escape(repo.repo)}</span><p>${escape(repo.description)}</p><div class="repo-category">${repo.categories.map(id => pill(categoryById(id))).join('')}</div><div class="repo-meta"><span>${icon('star')}${repo.stars !== null ? `${countText(repo.stars)} stars` : repo.error || '热度未获取'}</span><span>${repo.fetchedAt ? shortDate(repo.fetchedAt) + ' 获取' : 'GitHub'}</span></div></article>`).join('') : '<p class="muted">正在读取项目目录…</p>'}</div>`;
}

function renderSettings() {
  const personalRoots = state.data.locations.filter(l => l.kind !== 'plugin');
  const pluginCount = state.data.skills.filter(s => s.source === 'plugin').length;
  return `${pageHeading('设置')}<section class="settings-section"><div><h2>扫描来源</h2></div><div class="settings-content">${personalRoots.map(root => `<div class="source-setting"><span class="source-setting-icon">${icon('folder')}</span><div><strong>${escape(root.label)}</strong><code>${escape(root.path)}</code></div><span class="badge neutral">${root.count} 个</span></div>`).join('')}<div class="source-setting"><span class="source-setting-icon">${icon('layers')}</span><div><strong>Codex 插件缓存</strong><p>缓存不代表已启用</p></div><span class="badge neutral">${pluginCount} 个</span></div>${btn('rescan', '重新扫描目录', 'refresh', 'button secondary')}<p class="footnote">上次扫描：${new Date(state.data.scannedAt).toLocaleString('zh-CN')}</p></div></section><section class="settings-section"><div><h2>配置与备份</h2></div><div class="settings-content"><div class="settings-inline"><div><strong>导出工作台配置</strong></div><a href="/api/config/export" class="button secondary" download>${icon('download')}导出配置</a></div><div class="settings-inline"><div><strong>恢复配置</strong></div>${btn('import-config', '导入配置', 'upload', 'button secondary')}</div></div></section><section class="settings-section"><div><h2>Codex 短名</h2></div><div class="settings-content"><p class="settings-explanation">保存短名 → 创建 Codex 入口 → 在新对话中使用 <code>$短名</code>。入口保存在 <code>~/.agents/skills/短名/SKILL.md</code>，不会覆盖已有文件。</p><a class="text-link" href="https://developers.openai.com/codex/skills/" target="_blank" rel="noopener noreferrer">查看 Codex Skills 文档 ${icon('external')}</a></div></section><section class="settings-section"><div><h2>数据</h2></div><div class="settings-content"><ul class="privacy-list"><li>${icon('check')}配置：.skill-manager</li><li>${icon('check')}源文件只读</li><li>${icon('check')}使用记录：手动</li><li>${icon('check')}外部请求：GitHub 公开仓库热度</li></ul></div></section>${state.data.warnings.length ? `<div class="notice-panel">${icon('alert')}<div><strong>部分路径读取失败</strong>${state.data.warnings.map(w => `<p>${escape(w)}</p>`).join('')}</div></div>` : ''}`;
}

async function openSkill(id, tab = 'overview') {
  state.drawerId = id; state.drawerTab = tab;
  const skill = skillById(id);
  if (!skill) return;
  renderDrawer(skill);
  if (!drawer.open) drawer.showModal();
  if (tab === 'source') await loadSource(id);
}
function renderDrawer(skill) {
  const category = categoryById(skill.category);
  const tabs = [['overview', '基本信息'], ['dependencies', '依赖关系'], ['source', '原文']];
  drawer.innerHTML = `<div class="drawer-topline">${btn('close-drawer', '', 'close', 'icon-button', 'aria-label="关闭详情"')}</div><div class="drawer-heading">${skillMark(skill, 'large')}<div><h2>${escape(title(skill))}</h2><code>${escape(skill.name)}</code></div>${btn('favorite', '', 'star', `icon-button favorite-button ${skill.favorite ? 'is-favorite' : ''}`, `data-id="${skill.id}" aria-label="${skill.favorite ? '取消收藏' : '收藏'}"`)}</div><p class="drawer-description">${escape(summary(skill))}</p><div class="drawer-badges">${pill(category)}<span class="badge neutral">${escape(sourceLabel(skill))}</span>${skill.aliasTargetName ? '<span class="badge blue">兼容入口</span>' : ''}</div>${renderInvocation(skill)}<div class="drawer-tabs">${tabs.map(([id, label]) => `<button class="tab ${state.drawerTab === id ? 'active' : ''}" data-action="drawer-tab" data-id="${id}">${label}</button>`).join('')}</div><div class="drawer-body">${state.drawerTab === 'overview' ? drawerOverview(skill) : state.drawerTab === 'dependencies' ? drawerDependencies(skill) : '<div class="source-loading">正在读取 SKILL.md…</div><pre class="source-code" id="skill-source"></pre>'}</div>`;
}
function renderInvocation(skill) {
  const invocation = invocationState(skill, state.data.skills);
  return `<section class="invocation-panel" aria-label="Codex 调用"><p class="invocation-status">${escape(invocation.status)}</p>${invocation.commands.map(command => `<div class="invocation-command"><code>${escape(command)}</code>${btn('copy-invocation', '复制调用', 'copy', 'button secondary', `data-id="${skill.id}" data-command="${escape(command)}" aria-label="复制调用 ${escape(command)}"`)}</div>`).join('')}<dl class="detail-info version-info"><div><dt>Skill 版本</dt><dd>${escape(skill.version || '未标版本')}</dd></div>${skill.pluginVersion ? `<div><dt>插件包版本</dt><dd>${escape(skill.pluginVersion)}</dd></div>` : ''}<div><dt>更新状态</dt><dd>未检查</dd></div></dl></section>`;
}
function aliasInstallControl(skill) {
  if (skill.aliasVerified) return `<span class="badge blue">${icon('check')}入口已创建</span>`;
  if (skill.aliasEntryStatus === 'unverified') {
    const ids = state.data.skills.filter(entry => entry.source === 'personal' && entry.name === skill.alias).map(entry => entry.id);
    return btn('review-group', '核对已有入口', 'arrow', 'button secondary', `data-ids="${ids.join(',')}"`);
  }
  return btn('install-alias', skill.aliasEntryStatus === 'missing' ? '重新创建入口' : '创建 Codex 入口', 'plus', 'button secondary', `data-id="${skill.id}"`);
}
function drawerOverview(skill) {
  return `<form id="skill-form" data-id="${skill.id}"><label class="form-field">显示名称<input name="displayName" maxlength="80" value="${escape(skill.displayName)}" placeholder="${escape(title(skill))}"/></label><label class="form-field">快捷短名<span class="alias-input"><span>$</span><input name="alias" maxlength="32" value="${escape(skill.alias)}" placeholder="例如 ui、write、cover" pattern="[a-z0-9][a-z0-9-]{0,31}"/></span><small>小写字母、数字、连字符，最多 32 位</small></label>${skill.alias ? `<div class="alias-export"><div><strong>$${escape(skill.alias)}</strong><p>${aliasStatusLabel(skill)}</p></div></div><div class="alias-install-row"><code>~/.agents/skills/${escape(skill.alias)}/SKILL.md</code>${aliasInstallControl(skill)}<a class="icon-button" href="/api/skills/${skill.id}/alias" download="SKILL.md" aria-label="下载短名 Skill">${icon('download')}</a></div>` : ''}<label class="form-field">所属分类<select name="category">${state.data.categories.map(c => `<option value="${c.id}" ${c.id === skill.category ? 'selected' : ''}>${escape(c.name)}</option>`).join('')}</select>${skill.categoryOrigin === 'inferred' ? '<small>自动分类</small>' : ''}</label><label class="form-field">备注<textarea name="notes" maxlength="3000" rows="3" placeholder="用途或注意事项">${escape(skill.notes)}</textarea></label><div class="form-error" role="alert"></div><button type="submit" class="button primary full-width">${icon('check')}保存设置</button></form><div class="detail-section"><h3>来源信息</h3><dl class="detail-info"><div><dt>文件修改</dt><dd>${shortDate(skill.modifiedAt)}</dd></div><div><dt>使用记录</dt><dd>${skill.usageCount ? skill.usageCount + ' 次手动记录' : '尚无记录'}</dd></div></dl><code class="file-path">${escape(skill.path)}</code><div class="detail-actions">${btn('record-use', '记录一次使用', 'plus', 'button secondary', `data-id="${skill.id}"`)}${btn('archive-skill', skill.archived ? '放回技能库' : '归档', 'archive', 'button text-button', `data-id="${skill.id}"`)}</div><p class="footnote">归档不影响 Codex 调用。</p></div>`;
}
function drawerDependencies(skill) {
  const automatic = state.data.edges.filter(e => e.from === skill.id && e.type !== 'manual');
  const manual = skill.configuredDependencies;
  return `<section class="dependency-section"><h3>文件引用 <span>${automatic.length}</span></h3>${automatic.length ? automatic.map(e => `<div class="dependency-item">${skillChip(e.to)}<span class="badge neutral">${e.type === 'alias' ? '兼容入口' : '文件引用'}</span></div>`).join('') : '<div class="subtle-empty">暂无引用</div>'}</section><section class="dependency-section"><h3>手动依赖 <span>${manual.length}</span></h3><div id="manual-dependencies">${manual.map(dep => { const target = skillById(dep.id); return `<div class="dependency-item">${skillChip(dep.id)}<span class="dependency-version">${escape(dep.version || '未标版本')}</span>${btn('remove-dependency', '', 'close', 'icon-button small', `data-id="${dep.id}" data-from="${skill.id}" aria-label="移除 ${escape(target?.name || dep.id)} 的手动依赖"`)}</div>`; }).join('')}</div><form id="dependency-form" data-id="${skill.id}"><label class="form-field">添加依赖<select name="target" required><option value="">选择一个 Skill…</option>${state.data.skills.filter(s => s.id !== skill.id && !manual.some(d => d.id === s.id)).sort((a, b) => title(a).localeCompare(title(b))).map(s => `<option value="${s.id}">${escape(title(s))} · ${escape(s.plugin || s.name)}</option>`).join('')}</select></label><div class="form-error" role="alert"></div><button class="button secondary full-width" type="submit">${icon('plus')}添加依赖</button></form></section><div class="notice-panel compact">${icon('info')}<p>仅记录关系和版本，不修改或升级源文件。</p></div>`;
}
async function loadSource(id) {
  try {
    const data = await api(`/api/skills/${id}`);
    if (state.drawerId !== id || state.drawerTab !== 'source') return;
    $('#skill-source', drawer).textContent = data.content;
    $('.source-loading', drawer)?.remove();
  } catch (error) { if ($('.source-loading', drawer)) $('.source-loading', drawer).textContent = error.message; }
}

function showModal(content, cls = '') { modal.className = cls; modal.innerHTML = content; if (!modal.open) modal.showModal(); }
const modalHeader = heading => `<div class="modal-heading"><h2>${heading}</h2>${btn('close-modal', '', 'close', 'icon-button', 'aria-label="关闭窗口"')}</div>`;
function openCommand() {
  showModal(`<div class="command-input">${icon('search')}<input id="command-input" placeholder="搜索名称、短名或描述…" aria-label="快速搜索技能" autocomplete="off"/><kbd>esc</kbd></div><div id="command-results"></div><div class="command-footer"><span id="command-scope"></span><span><kbd>↑</kbd><kbd>↓</kbd> 选择 <kbd>↵</kbd> 打开</span></div>`, 'command-modal');
  renderCommand('');
  $('#command-input').focus();
}
let commandIndex = 0;
function renderCommand(query) {
  const q = query.trim().replace(/^[$/]/, '').toLowerCase();
  const candidates = filterSkills(state.data.skills, { scope: state.source, query, terms: searchTerms }).sort((a, b) => Number(b.favorite) - Number(a.favorite) || Number(Boolean(b.alias)) - Number(Boolean(a.alias)) || a.name.localeCompare(b.name, 'zh-CN')).slice(0, 7);
  commandIndex = 0;
  $('#command-scope').textContent = selectedSourceLabel();
  $('#command-results').innerHTML = candidates.length ? `<div class="command-section-label">${q ? '匹配的 Skills' : '快速打开'}</div>${candidates.map((s, i) => { const command = invocationState(s, state.data.skills).commands.at(-1); return `<button class="command-result ${i === 0 ? 'selected' : ''}" data-action="command-open" data-id="${s.id}">${skillMark(s, 'small')}<span><strong>${escape(title(s))}</strong><small>${escape(s.name)}</small></span>${command ? `<code>${escape(command)}</code>` : `<span class="command-category">${s.source === 'plugin' ? '启用未知' : s.source === 'workspace' ? '未完整安装' : s.alias ? aliasStatusLabel(s) : invocationState(s, state.data.skills).status}</span>`}${icon('arrow')}</button>`; }).join('')}` : empty('search', '没有找到匹配的 Skill', '', state.source !== 'all' ? btn('source-scope', '查看全部来源', 'layers', 'button secondary', 'data-id="all"') : '');
}

function navigate(page) {
  state.page = page; state.category = 'all'; state.filter = 'all'; state.query = ''; state.pageNumber = 1; state.mobileNav = false;
  if (location.hash !== `#${page}`) history.pushState({}, '', `#${page}`);
  render(); window.scrollTo({ top: 0 });
  if (page === 'discover') loadDiscover().catch(error => toast(error.message, true));
}
async function loadDiscover(refresh = false) {
  const data = await api(`/api/discover${refresh ? '?refresh=1' : ''}`);
  state.repositories = data.repositories;
  if (state.page === 'discover') render();
}

document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (link && pageNames[link.hash.slice(1)]) { event.preventDefault(); navigate(link.hash.slice(1)); return; }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action, id = button.dataset.id;
  if (pageNames[action]) { navigate(action); return; }
  switch (action) {
    case 'source-scope': selectSource(id); render(); if (modal.open && modal.classList.contains('command-modal')) renderCommand($('#command-input').value); break;
    case 'personal-category': selectSource('personal'); navigate('library'); state.category = id; render(); break;
    case 'mobile-nav': state.mobileNav = !state.mobileNav; render(); break;
    case 'category': state.page = 'library'; state.category = id; state.filter = 'all'; state.query = ''; state.pageNumber = 1; state.mobileNav = false; history.pushState({}, '', '#library'); render(); break;
    case 'filter': state.filter = id; state.pageNumber = 1; render(); break;
    case 'archived': navigate('library'); state.filter = 'archived'; render(); break;
    case 'reset-filter': state.category = 'all'; state.filter = 'all'; state.query = ''; state.pageNumber = 1; render(); break;
    case 'view-grid': case 'view-list': state.view = action.split('-')[1]; localStorage.setItem('skill-view', state.view); render(); break;
    case 'prev-page': case 'next-page': state.pageNumber += action === 'prev-page' ? -1 : 1; $('#library-results').innerHTML = renderLibraryResults(); $('.library-toolbar').scrollIntoView({ block: 'start' }); break;
    case 'rescan': busy(button, async () => { state.data = await api('/api/rescan', { method: 'POST', body: '{}' }); render(); toast(`扫描完成，发现 ${state.data.skills.length} 个 Skills`); }); break;
    case 'open-skill': openSkill(id); break;
    case 'edit-alias': openSkill(id).then(() => $('input[name="alias"]', drawer)?.focus()); break;
    case 'open-dependencies': openSkill(id, 'dependencies'); break;
    case 'focus-dependencies': state.graphId = id; state.graphZoom = 1; if (drawer.open) drawer.close(); navigate('dependencies'); break;
    case 'close-drawer': drawer.close(); state.drawerId = null; break;
    case 'drawer-tab': openSkill(state.drawerId, id); break;
    case 'favorite': busy(button, async () => { const favorite = !skillById(id).favorite; await updateSkill(id, { favorite }); if (drawer.open && state.drawerId === id) renderDrawer(skillById(id)); toast(favorite ? '已加入收藏' : '已取消收藏'); }); break;
    case 'copy-invocation': busy(button, async () => {
      const command = button.dataset.command;
      if (!invocationState(skillById(id), state.data.skills).commands.includes(command)) throw new Error('调用入口需重新核对');
      if (!navigator.clipboard?.writeText) throw new Error('无法复制，请手动复制调用名称');
      try { await navigator.clipboard.writeText(command); } catch { throw new Error('复制失败，请手动复制调用名称'); }
      toast('已复制 ' + command);
    }); break;
    case 'install-alias': busy(button, async () => { const result = await api(`/api/skills/${id}/install-alias`, { method: 'POST', body: '{}' }); state.data = result.catalog; render(); renderDrawer(skillById(id)); toast('Codex 入口已创建，请在新对话中使用 $' + skillById(id).alias); }); break;
    case 'archive-skill': busy(button, async () => { const archived = !skillById(id).archived; await updateSkill(id, { archived }); drawer.close(); toast(archived ? '已归档' : '已放回技能库'); }); break;
    case 'record-use': busy(button, async () => { state.data = await api('/api/usage', { method: 'POST', body: JSON.stringify({ skillId: id }) }); render(); if (drawer.open) renderDrawer(skillById(state.drawerId)); toast('已记录'); }); break;
    case 'usage-filter': state.usageFilter = id; render(); break;
    case 'review-group': { const ids = button.dataset.ids.split(','); showModal(`${modalHeader('查看相关 Skills')}<div class="review-modal-list">${ids.map(skillId => { const s = skillById(skillId); return `<div><span><strong>${escape(s.name)}</strong><small>${escape(sourceLabel(s))}${s.aliasTargetName ? ` · 指向 ${escape(s.aliasTargetName)}` : ''}</small></span>${btn('review-open', s.archived ? '查看 · 已归档' : '查看详情', 'arrow', 'button secondary', `data-id="${s.id}"`)}</div>`; }).join('')}</div>`); break; }
    case 'review-open': modal.close(); openSkill(id); break;
    case 'graph-focus': state.graphId = id; state.graphZoom = 1; render(); break;
    case 'zoom-in': case 'zoom-out': state.graphZoom = Math.max(.5, Math.min(1.5, Math.round((state.graphZoom + (action === 'zoom-in' ? .1 : -.1)) * 10) / 10)); render(); break;
    case 'zoom-reset': state.graphZoom = 1; render(); break;
    case 'remove-dependency': busy(button, async () => { const from = button.dataset.from; await updateSkill(from, { dependencies: skillById(from).configuredDependencies.filter(d => d.id !== id) }); renderDrawer(skillById(from)); toast('已移除手动依赖'); }); break;
    case 'sync-version': busy(button, async () => { const from = skillById(button.dataset.from), to = skillById(button.dataset.to); await updateSkill(from.id, { dependencies: from.configuredDependencies.map(d => d.id === to.id ? { id: to.id, version: to.version || to.pluginVersion || '' } : d) }); toast('已更新版本记录'); }); break;
    case 'refresh-discover': busy(button, async () => { await loadDiscover(true); toast(state.repositories.every(r => !r.error) ? '已获取 GitHub 最新热度' : '部分仓库热度获取失败，可稍后重试', state.repositories.some(r => r.error)); }); break;
    case 'command': openCommand(); break;
    case 'command-open': modal.close(); openSkill(id); break;
    case 'close-modal': modal.close(); break;
    case 'add-category': showModal(`${modalHeader('新建分类')}<form id="category-form"><label class="form-field">分类名称<input name="name" maxlength="20" placeholder="例如：我的写作流程" required autofocus /></label><div class="form-error" role="alert"></div><button class="button primary full-width" type="submit">${icon('plus')}创建分类</button></form>`); break;
    case 'add-skill': showModal(`${modalHeader('导入一个 Skill')}<p class="modal-description">仅导入 SKILL.md。要在 Codex 中使用，需安装完整 Skill 目录。</p><form id="import-skill-form"><label class="file-drop">${icon('upload')}<strong>选择 SKILL.md 文件</strong><span>Markdown 文件 · 最大 100 KB</span><input type="file" name="file" accept=".md,text/markdown,text/plain" required /></label><label class="form-field">文件预览<textarea id="import-preview" rows="8" readonly placeholder="选择文件后显示原文…"></textarea></label><div class="form-error" role="alert"></div><button type="submit" class="button primary full-width">${icon('plus')}导入工作台</button></form>`); break;
    case 'import-config': showModal(`${modalHeader('恢复工作台配置')}<p class="modal-description">覆盖对应 Skill 的配置；未找到的 Skill 会跳过。</p><form id="import-config-form"><label class="file-drop">${icon('upload')}<strong>选择配置备份</strong><span>Skill Manager 导出的 JSON 文件</span><input type="file" name="file" accept=".json,application/json" required /></label><div class="form-error" role="alert"></div><button class="button primary full-width" type="submit">合并配置</button></form>`); break;
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'library-search') { state.query = event.target.value; state.pageNumber = 1; $('#library-results').innerHTML = renderLibraryResults(); }
  if (event.target.id === 'command-input') renderCommand(event.target.value);
});
document.addEventListener('change', async event => {
  const field = event.target;
  if (field.id === 'sort-select') { state.sort = field.value; state.pageNumber = 1; render(); }
  if (field.id === 'graph-root') { state.graphId = field.value; state.graphZoom = 1; render(); }
  if (field.closest('#import-skill-form') && field.type === 'file') {
    const file = field.files[0];
    if (file?.size > 100000) { $('.form-error', field.form).textContent = '文件超过 100 KB，请选择更小的 SKILL.md'; return; }
    $('#import-preview').value = file ? await file.text() : '';
  }
});

document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['skill-form', 'category-form', 'dependency-form', 'import-skill-form', 'import-config-form'].includes(form.id)) return;
  event.preventDefault();
  const button = $('button[type="submit"]', form), errorNode = $('.form-error', form);
  if (button.disabled) return;
  button.disabled = true; errorNode.textContent = '';
  try {
    const values = new FormData(form);
    if (form.id === 'skill-form') {
      const patch = Object.fromEntries(values.entries());
      await updateSkill(form.dataset.id, patch);
      renderDrawer(skillById(form.dataset.id)); $('button[type="submit"]', drawer)?.focus(); toast('已保存');
    } else if (form.id === 'category-form') {
      state.data = await api('/api/categories', { method: 'POST', body: JSON.stringify({ name: values.get('name') }) });
      modal.close(); render(); toast('新分类已创建');
    } else if (form.id === 'dependency-form') {
      const skill = skillById(form.dataset.id);
      await updateSkill(skill.id, { dependencies: [...skill.configuredDependencies, { id: values.get('target') }] });
      renderDrawer(skillById(skill.id)); toast('依赖已保存');
    } else if (form.id === 'import-skill-form') {
      const file = values.get('file');
      if (file.size > 100000) throw new Error('文件超过 100 KB');
      state.data = await api('/api/skills', { method: 'POST', body: JSON.stringify({ content: await file.text() }) });
      modal.close(); selectSource('personal'); navigate('library'); toast('Skill 已导入工作台');
    } else if (form.id === 'import-config-form') {
      const file = values.get('file');
      if (file.size > 1024 * 1024) throw new Error('配置文件不能超过 1 MB');
      let parsed; try { parsed = JSON.parse(await file.text()); } catch { throw new Error('请选择有效的 JSON 配置文件'); }
      const result = await api('/api/config/import', { method: 'POST', body: JSON.stringify(parsed) });
      state.data = result.catalog; modal.close(); render(); toast(`已恢复 ${result.imported} 个 Skill 的配置${result.skipped ? `，跳过 ${result.skipped} 个未找到的 Skill` : ''}`);
    }
  } catch (error) { errorNode.textContent = error.message; }
  finally { button.disabled = false; }
});

document.addEventListener('keydown', event => {
  const editable = event.target.matches('input, textarea, select, [contenteditable]');
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openCommand(); }
  if (event.key === '/' && !editable && !modal.open && !drawer.open) { event.preventDefault(); if (state.page !== 'library') navigate('library'); $('#library-search')?.focus(); }
  if (modal.open && modal.classList.contains('command-modal') && ['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) {
    const results = [...modal.querySelectorAll('.command-result')];
    if (!results.length) return;
    event.preventDefault();
    if (event.key === 'Enter') { results[commandIndex]?.click(); return; }
    commandIndex = (commandIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
    results.forEach((el, index) => el.classList.toggle('selected', index === commandIndex));
    results[commandIndex]?.scrollIntoView({ block: 'nearest' });
  }
});
for (const dialog of [drawer, modal]) dialog.addEventListener('click', event => {
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }
});
window.addEventListener('popstate', () => { navigate(pageNames[location.hash.slice(1)] ? location.hash.slice(1) : 'library'); });

async function initialize() {
  try {
    state.data = await api('/api/catalog');
    const initialPage = location.hash.slice(1);
    if (pageNames[initialPage]) state.page = initialPage;
    render();
    if (state.page === 'discover') loadDiscover().catch(error => toast(error.message, true));
  } catch (error) {
    app.innerHTML = `<div class="startup-error">${icon('alert')}<h1>暂时无法读取技能库</h1><p>${escape(error.message)}</p><p>请确认本地服务已启动，再刷新页面。</p><button class="button primary" id="retry-startup">重新连接</button></div>`;
    $('#retry-startup').addEventListener('click', initialize);
  }
}
initialize();
