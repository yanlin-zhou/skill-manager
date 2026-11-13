import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sourceSettings, validateSources } from '../lib/apps.mjs';
import { scanSkills, buildCatalog } from '../lib/catalog.mjs';
import { createApp } from '../server.mjs';
import { filterSkills, scopeCounts, invocationState } from '../public/skill-state.js';

async function fixture() {
  const home = await mkdtemp(path.join(tmpdir(), 'skill-manager-apps-'));
  async function add(folder, name, body = 'Useful sample instructions.', metadata = true) {
    const directory = path.join(home, folder, name);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'SKILL.md'), metadata ? `---\nname: ${name}\ndescription: Sample ${name}\n---\n# ${name}\n${body}\n` : body);
    return directory;
  }
  const shared = await add('.agents/skills', 'shared');
  await add('.codex/skills', 'codex-only');
  await add('.claude/skills', 'claude-only');
  await add('.cursor/skills', 'cursor-only');
  await symlink(shared, path.join(home, '.claude/skills/shared'));
  return { home, add, shared };
}
const config = () => ({ version: 1, skills: {}, categories: [], events: [], createdAt: new Date().toISOString() });

test('app selection reads only selected directory sets and merges shared physical files', async () => {
  const f = await fixture();
  assert.deepEqual((await scanSkills({ home: f.home, selectedApps: [] })).skills, []);
  const codex = await scanSkills({ home: f.home, selectedApps: ['codex'] });
  assert.deepEqual(codex.skills.map(s => s.name).sort(), ['codex-only', 'shared']);
  const claude = await scanSkills({ home: f.home, selectedApps: ['claude'] });
  assert.deepEqual(claude.skills.map(s => s.name).sort(), ['claude-only', 'shared']);
  const all = await scanSkills({ home: f.home, selectedApps: ['codex', 'claude', 'cursor'] });
  assert.equal(all.skills.length, 4);
  const shared = all.skills.find(s => s.name === 'shared');
  assert.deepEqual([...shared.appIds].sort(), ['claude', 'codex', 'cursor']);
  assert.equal(shared.locations.length, 2);
  assert.equal(shared.id, codex.skills.find(s => s.name === 'shared').id);
  const cursor = await scanSkills({ home: f.home, selectedApps: ['cursor'] });
  assert.equal(cursor.skills.length, 4, 'Cursor explicitly includes its documented compatibility directories');
  assert.ok(cursor.skills.every(s => s.appIds.length === 1 && s.appIds[0] === 'cursor'));
});

test('project opt-in and app-native calls preserve scope and do not invent cross-app collisions', async () => {
  const f = await fixture();
  const project = path.join(f.home, 'project');
  await f.add('project/.claude/skills', 'project-tool');
  await f.add('.claude/skills', 'claude-plain', '# Plain instructions', false);
  let scan = await scanSkills({ home: f.home, selectedApps: ['codex', 'claude'] });
  assert.ok(!scan.skills.some(s => s.name === 'project-tool'));
  scan = await scanSkills({ home: f.home, selectedApps: ['codex', 'claude'], projects: [project] });
  assert.equal(scan.skills.find(s => s.name === 'project-tool').origins[0].project, project);
  const shared = scan.skills.find(s => s.name === 'shared');
  assert.deepEqual(invocationState(shared, scan.skills).commands.sort(), ['$shared', '/shared']);
  assert.deepEqual(invocationState(scan.skills.find(s => s.name === 'claude-plain'), scan.skills).commands, ['/claude-plain']);
  await f.add('.claude/skills', 'codex-only', 'A different app uses this name.');
  scan = await scanSkills({ home: f.home, selectedApps: ['codex', 'claude'] });
  assert.equal(buildCatalog(scan, config()).health.nameCollisions.length, 0);
  assert.deepEqual(invocationState(scan.skills.find(s => s.name === 'codex-only' && s.appIds.includes('codex')), scan.skills).commands, ['$codex-only']);
  const counts = scopeCounts(scan.skills, 'personal', 'codex');
  assert.equal(counts.active, 2);
  assert.equal(filterSkills(scan.skills, { app: 'codex', query: 'claude-only' }).length, 0);
});

test('plugin caches are opt-in and same-named packages in different apps remain distinct', async () => {
  const f = await fixture();
  await f.add('.codex/plugins/cache/market/tool/1.0.0/skills', 'plugin-tool');
  await f.add('.claude/plugins/cache/market/tool/1.0.0/skills', 'plugin-tool');
  const codex = await scanSkills({ home: f.home, selectedApps: ['codex'] });
  assert.equal(codex.skills.filter(s => s.source === 'plugin').length, 1);
  const both = await scanSkills({ home: f.home, selectedApps: ['codex', 'claude'] });
  const packages = both.skills.filter(s => s.source === 'plugin');
  assert.equal(packages.length, 2);
  assert.ok(packages.every(s => invocationState(s, both.skills).commands.length === 0));
});

test('source settings validate app IDs and explicit projects without changing legacy defaults', async () => {
  const f = await fixture();
  assert.deepEqual(sourceSettings(config()), { apps: ['codex'], projects: [], configured: false });
  await assert.rejects(validateSources({ apps: ['unknown'] }, f.home), /请选择/);
  await assert.rejects(validateSources({ apps: ['codex', 'codex'] }, f.home), /请选择/);
  await assert.rejects(validateSources({ apps: ['claude'], projects: ['relative'] }, f.home), /绝对路径/);
  await assert.rejects(validateSources({ apps: [], projects: [path.join(f.home, 'absent')] }, f.home), /不存在/);
  const settings = await validateSources({ apps: ['cursor', 'codex'], projects: [f.home, f.home] }, f.home);
  assert.deepEqual(settings, { apps: ['codex', 'cursor'], projects: [await realpath(f.home)], configured: true });
});

test('app invocation respects hidden commands, synced caches and per-app folder requirements', async () => {
  const f = await fixture();
  const hidden = await f.add('.claude/skills', 'hidden');
  await writeFile(path.join(hidden, 'SKILL.md'), '---\nname: hidden\ndescription: Automatic only\nuser-invocable: false\n---\n# Hidden\n');
  await f.add('.claude/skills/synced', 'synced-tool');
  const malformed = await f.add('.claude/skills', 'malformed');
  await writeFile(path.join(malformed, 'SKILL.md'), '---\nname: malformed\nMissing closing header.');
  const mismatched = await f.add('.cursor/skills', 'folder-name');
  await writeFile(path.join(mismatched, 'SKILL.md'), '---\nname: another-name\ndescription: Mismatched name\n---\n# Sample\n');
  const scan = await scanSkills({ home: f.home, selectedApps: ['claude', 'cursor'] });
  const calls = name => invocationState(scan.skills.find(s => s.name === name), scan.skills).calls;
  assert.ok(!calls('hidden').some(call => call.appId === 'claude'));
  assert.deepEqual(calls('synced-tool'), []);
  assert.deepEqual(calls('malformed'), []);
  assert.deepEqual(calls('another-name'), []);
});

test('HTTP onboarding persists chosen apps, preserves hidden metadata and reopens consistently', async t => {
  const f = await fixture();
  const dataDirectory = path.join(f.home, 'manager-data');
  const options = { dataDirectory, scanOptions: { home: f.home }, aliasRoot: path.join(f.home, '.agents/skills') };
  const app = await createApp(options);
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const request = (route, method = 'GET', data) => fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'X-Skill-Manager': 'local' }, body: data === undefined ? undefined : JSON.stringify(data) });
  let catalog = await (await request('/api/catalog')).json();
  assert.equal(catalog.appSources.configured, false);
  assert.equal(catalog.skills.length, 0);
  assert.equal(catalog.appSources.available.length, 3);
  catalog = await (await request('/api/apps', 'PUT', { apps: ['codex', 'claude'], projects: [] })).json();
  assert.equal(catalog.appSources.configured, true);
  assert.equal(catalog.skills.length, 3);
  await f.add('.claude/skills', 'newly-installed');
  catalog = await (await request('/api/apps', 'PUT', { apps: ['codex', 'claude'], projects: [] })).json();
  assert.ok(catalog.skills.some(s => s.name === 'newly-installed'), 'loading unchanged sources must still rescan their contents');
  const target = catalog.skills.find(s => s.name === 'codex-only');
  assert.equal((await request(`/api/skills/${target.id}`, 'PATCH', { favorite: true, notes: 'Keep this setting' })).status, 200);
  catalog = await (await request('/api/apps', 'PUT', { apps: ['claude'], projects: [] })).json();
  assert.ok(!catalog.skills.some(s => s.id === target.id));
  catalog = await (await request('/api/apps', 'PUT', { apps: ['codex', 'claude'], projects: [] })).json();
  assert.equal(catalog.skills.find(s => s.id === target.id).favorite, true);
  assert.equal(catalog.skills.find(s => s.id === target.id).notes, 'Keep this setting');
  const original = await readFile(path.join(f.home, '.codex/skills/codex-only/SKILL.md'), 'utf8');
  assert.match(original, /Useful sample instructions/);
  const exported = await (await request('/api/config/export')).json();
  assert.equal(exported.appSources, undefined, 'machine-local paths do not belong in a portable metadata backup');
  assert.equal((await request('/api/apps', 'PUT', { apps: ['bad'], projects: [] })).status, 400);
  const rejected = await fetch(base + '/api/apps', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Skill-Manager': 'local', Origin: 'https://example.com' }, body: JSON.stringify({ apps: [] }) });
  assert.equal(rejected.status, 403);
  assert.deepEqual((await (await createApp(options)).catalog()).appSources.apps, ['codex', 'claude']);
});
