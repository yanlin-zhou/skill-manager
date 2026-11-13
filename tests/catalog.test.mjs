import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, unlink } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { scanSkills, buildCatalog, parseSkill, createsCycle, aliasMarkdown } from '../lib/catalog.mjs';
import { Store, validateMetadata } from '../lib/store.mjs';
import { createApp } from '../server.mjs';

const initialConfig = () => ({ version: 1, createdAt: '2026-11-09T00:00:00.000Z', skills: {}, categories: [], events: [] });
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'skill-manager-test-'));
  const root = path.join(directory, 'skills');
  const add = async (name, body, description = `Use ${name}`) => {
    await mkdir(path.join(root, name), { recursive: true });
    const content = `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\nmetadata:\n  version: "1.0.0"\n---\n\n# ${name}\n${body}\n`;
    await writeFile(path.join(root, name, 'SKILL.md'), content);
    return content;
  };
  await add('frontend-craft', 'Design interfaces.');
  await add('old-frontend', 'Read [the new skill](../frontend-craft/SKILL.md).', 'Compatibility alias for frontend-craft.');
  await add('writing-tool', 'Write clear sentences.');
  const duplicate = await add('writing-copy', 'Write clear sentences.');
  await writeFile(path.join(root, 'writing-copy/SKILL.md'), duplicate.replace('# writing-copy', '# writing-tool'));
  await add('consumer', 'Read [design](../frontend-craft/SKILL.md) and [missing](../not-installed/SKILL.md).');
  await symlink(path.join(root, 'frontend-craft'), path.join(root, 'same-target'));
  const options = { roots: [{ path: root, kind: 'personal', label: '测试目录' }] };
  return { directory, root, options, add, scan: await scanSkills(options) };
}

test('frontmatter preserves quoted Chinese, multiline descriptions and nested versions', () => {
  const parsed = parseSkill('---\r\nname: example\r\ndescription: >\r\n  第一行\r\n  第二行\r\nmetadata:\r\n  version: "1.2.3"\r\n---\r\n# Example\r\n', 'fallback');
  assert.equal(parsed.description, '第一行 第二行');
  assert.equal(parsed.version, '1.2.3');
  assert.equal(parsed.validMetadata, true);
  assert.equal(parseSkill('no metadata', 'fallback').validMetadata, false);
});

test('real paths are deduplicated; compatibility aliases and identical content stay distinct', async () => {
  const { scan, options } = await fixture();
  assert.equal(scan.skills.length, 5);
  assert.equal(options.roots.length, 1);
  const data = buildCatalog(scan, initialConfig());
  const main = data.skills.find(s => s.name === 'frontend-craft');
  assert.equal(main.locations.length, 2);
  assert.equal(data.health.aliasGroups.length, 1);
  assert.equal(data.health.aliasGroups[0].target, main.id);
  assert.equal(data.health.duplicates.length, 1);
  assert.deepEqual(data.health.duplicates[0].map(id => data.skills.find(s => s.id === id).name).sort(), ['writing-copy', 'writing-tool']);
  assert.equal(data.health.missing.length, 1);
  assert.equal(data.edges.filter(e => e.type === 'alias').length, 1);
  assert.ok(data.skills.every(s => s.usageCount === 0 && s.lastUsedAt === null));
  assert.ok(data.skills.every(s => !('content' in s) && !('body' in s)));
});

test('alias validation catches collisions without changing source files', async () => {
  const { scan } = await fixture();
  const config = initialConfig();
  const data = buildCatalog(scan, config);
  const main = data.skills.find(s => s.name === 'frontend-craft');
  const other = data.skills.find(s => s.name === 'writing-tool');
  const original = await readFile(main.path, 'utf8');
  config.skills[main.id] = validateMetadata(main.id, { alias: 'ui', displayName: '我的前端', favorite: true }, data, config);
  assert.throws(() => validateMetadata(other.id, { alias: 'ui' }, data, config), /短名已被/);
  assert.throws(() => validateMetadata(main.id, { alias: '../bad' }, data, config), /小写字母/);
  assert.throws(() => validateMetadata(main.id, { alias: 'writing-tool' }, data, config), /短名已被/);
  assert.throws(() => validateMetadata(main.id, { category: 'unknown' }, data, config), /已有分类/);
  assert.equal(await readFile(main.path, 'utf8'), original);
  const content = aliasMarkdown({ ...main, alias: 'ui' });
  assert.match(content, /name: ui/);
  assert.match(content, /skill-manager-target:/);
  assert.ok(content.includes(main.path));
});

test('same-name skills from different sources resolve aliases by the actual file reference', async () => {
  const { scan } = await fixture();
  const original = scan.skills.find(s => s.name === 'frontend-craft');
  const alternate = { ...original, id: 'alternate-source', source: 'plugin', plugin: 'example', path: '/virtual/plugin/frontend-craft/SKILL.md', realPath: '/virtual/plugin/frontend-craft/SKILL.md', locations: ['/virtual/plugin/frontend-craft/SKILL.md'] };
  scan.skills.push(alternate);
  const alias = scan.skills.find(s => s.name === 'old-frontend');
  alias.body = 'Read [frontend](/virtual/plugin/frontend-craft/SKILL.md).';
  const data = buildCatalog(scan, initialConfig());
  assert.deepEqual(data.edges.filter(e => e.from === alias.id && e.type === 'alias').map(e => e.to), ['alternate-source']);
  assert.equal(data.health.aliasGroups[0].target, 'alternate-source');
});

test('alias installation evidence tracks actual personal files instead of historical configuration', async () => {
  const f = await fixture();
  const main = f.scan.skills.find(s => s.name === 'frontend-craft');
  const config = initialConfig();
  const aliasRoot = path.join(f.directory, 'aliases');
  const destination = path.join(aliasRoot, 'ui/SKILL.md');
  const options = { roots: [...f.options.roots, { path: aliasRoot, kind: 'personal', label: '快捷入口' }] };
  config.skills[main.id] = { alias: 'ui', installedAlias: { name: 'ui', path: destination } };
  const current = async () => buildCatalog(await scanSkills(options), config).skills.find(s => s.id === main.id);
  assert.equal((await current()).aliasVerified, false);
  assert.equal((await current()).aliasEntryStatus, 'missing');
  await mkdir(path.dirname(destination), { recursive: true });
  const content = aliasMarkdown({ ...main, alias: 'ui' });
  await writeFile(destination, content);
  assert.equal((await current()).aliasVerified, true);
  await writeFile(destination, content + '\nUser modified instructions.\n');
  assert.equal((await current()).aliasVerified, false);
  assert.equal((await current()).aliasEntryStatus, 'unverified');
  await unlink(destination);
  assert.equal((await current()).aliasEntryStatus, 'missing');
  await writeFile(destination, content);
  config.skills[main.id].alias = 'new-ui';
  assert.equal((await current()).aliasVerified, false);
  assert.equal((await current()).aliasEntryStatus, 'not-created');
  config.skills[main.id].alias = 'ui';
  const cachedScan = await scanSkills(options);
  cachedScan.skills.find(s => s.name === 'ui').source = 'plugin';
  assert.equal(buildCatalog(cachedScan, config).skills.find(s => s.id === main.id).aliasVerified, false);
});

test('manual dependencies reject cycles and detect changed version records', async () => {
  const { scan } = await fixture();
  const config = initialConfig();
  let data = buildCatalog(scan, config);
  const main = data.skills.find(s => s.name === 'frontend-craft');
  const consumer = data.skills.find(s => s.name === 'consumer');
  assert.throws(() => validateMetadata(main.id, { dependencies: [{ id: consumer.id }] }, data, config), /循环/);
  assert.throws(() => validateMetadata(main.id, { dependencies: [{ id: main.id }] }, data, config), /循环/);
  config.skills[consumer.id] = validateMetadata(consumer.id, { dependencies: [{ id: main.id, version: '0.9.0' }] }, data, config);
  data = buildCatalog(scan, config);
  assert.equal(data.health.drift.length, 1);
  assert.equal(createsCycle('c', 'a', [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]), true);
});

test('atomic store serializes simultaneous saves and protects corrupt configuration', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'skill-manager-store-test-'));
  const store = new Store(directory);
  await Promise.all(Array.from({ length: 12 }, (_, index) => store.transaction(config => { config.events.push({ id: String(index) }); })));
  assert.equal((await store.read()).events.length, 12);
  await writeFile(store.file, '{invalid json');
  await assert.rejects(store.transaction(config => config), /现有文件未被覆盖/);
  assert.equal(await readFile(store.file, 'utf8'), '{invalid json');
});

test('health identifies the app version and machine while retaining local request boundaries', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'skill-manager-health-test-'));
  const { server } = await createApp({ dataDirectory: directory, scanOptions: { roots: [] } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/health`;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(await response.json(), { app: 'thomas-skill-manager', version, hostname: hostname() });
  assert.equal((await fetch(url, { headers: { Origin: 'https://example.com' } })).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(url, { headers: { Host: 'example.com' } }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(foreignHostStatus, 403);
  const module = await fetch(`http://127.0.0.1:${server.address().port}/skill-state.js`);
  assert.equal(module.status, 200);
  assert.equal(module.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.match(await module.text(), /export const SOURCE_SCOPES/);
});

test('HTTP app persists edits, creates a safe alias, refuses overwrites and rejects cross-origin writes', async t => {
  const f = await fixture();
  const aliasRoot = path.join(f.directory, 'aliases');
  const scanOptions = { roots: [...f.options.roots, { path: aliasRoot, kind: 'personal', label: '快捷入口' }] };
  const instance = await createApp({ dataDirectory: path.join(f.directory, 'data'), scanOptions, aliasRoot });
  await new Promise(resolve => instance.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => instance.server.close(resolve)));
  const base = `http://127.0.0.1:${instance.server.address().port}`;
  const request = (route, method = 'GET', data, headers = {}) => fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', 'X-Skill-Manager': 'local', ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
  let data = await (await request('/api/catalog')).json();
  const main = data.skills.find(s => s.name === 'frontend-craft');
  const writer = data.skills.find(s => s.name === 'writing-tool');
  let response = await request(`/api/skills/${main.id}`, 'PATCH', { alias: 'ui', category: 'frontend' });
  assert.equal(response.status, 200);
  data = await (await request('/api/catalog')).json();
  assert.equal(data.skills.find(s => s.id === main.id).alias, 'ui');
  response = await request(`/api/skills/${writer.id}`, 'PATCH', { alias: 'ui' });
  assert.equal(response.status, 400);
  response = await request(`/api/skills/${main.id}/alias`);
  assert.equal(response.headers.get('content-type'), 'text/markdown; charset=utf-8');
  assert.match(await response.text(), /name: ui/);
  response = await request(`/api/skills/${main.id}/install-alias`, 'POST', {});
  assert.equal(response.status, 201);
  assert.match(await readFile(path.join(aliasRoot, 'ui/SKILL.md'), 'utf8'), /skill-manager-target:/);
  response = await request(`/api/skills/${main.id}`, 'PATCH', { notes: '配置已同步' });
  assert.equal(response.status, 200, 'the generated alias must not conflict with its own target');
  await writeFile(path.join(aliasRoot, 'ui/SKILL.md'), 'User modified this file.');
  response = await request(`/api/skills/${main.id}/install-alias`, 'POST', {});
  assert.equal(response.status, 409);
  assert.equal(await readFile(path.join(aliasRoot, 'ui/SKILL.md'), 'utf8'), 'User modified this file.');
  response = await request(`/api/skills/${main.id}`, 'PATCH', { alias: 'another' }, { Origin: 'https://evil.example' });
  assert.equal(response.status, 403);
  response = await request('/api/usage', 'POST', { skillId: writer.id });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).skills.find(s => s.id === writer.id).usageCount, 1);
  response = await request('/api/config/export');
  const exported = await response.json();
  assert.equal(exported.skills[main.id].alias, 'ui');
  assert.equal(exported.skills[main.id].installedAlias, undefined);
  assert.equal(exported.events, undefined);
  response = await request('/api/config/import', 'POST', exported);
  assert.equal(response.status, 200);
  response = await request('/api/skills', 'POST', { content: '---\nname: imported-test\ndescription: A test skill\n---\n# Imported\nUseful test instructions.' });
  assert.equal(response.status, 201);
  response = await request('/api/skills', 'POST', { content: '---\nname: imported-test\ndescription: Collision\n---\n# Existing' });
  assert.equal(response.status, 400);
  response = await request('/api/categories', 'POST', { name: '我的场景' });
  assert.equal(response.status, 201);
  response = await request('/api/categories', 'POST', { name: '我的场景' });
  assert.equal(response.status, 400);
  response = await request('/api/skills', 'POST', { content: '---\nname: ../../escape\ndescription: Bad name\n---\nInvalid' });
  assert.equal(response.status, 400);
  response = await request('/.skill-manager/config.json');
  assert.equal(response.status, 404);
});
