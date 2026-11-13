import test from 'node:test';
import assert from 'node:assert/strict';
import { readScope, saveScope, filterSkills, scopeCounts, invocationState, localVersion, healthReviewCount } from '../public/skill-state.js';

const skill = (id, source, extra = {}) => ({ id, name: id, source, category: 'frontend', validMetadata: true, archived: false, ...extra });

test('source scope keeps list, categories, archive, favorites and shortcuts within one inventory', () => {
  const skills = [skill('design', 'personal', { favorite: true, alias: 'ui' }), skill('draft', 'workspace', { category: 'writing' }),
    skill('cache', 'plugin', { favorite: true, alias: 'cached' }), skill('internal', 'system'), skill('old', 'personal', { archived: true })];
  assert.deepEqual(filterSkills(skills).map(s => s.id), ['design', 'draft']);
  assert.deepEqual(scopeCounts(skills, 'personal'), { active: 2, archived: 1, categories: { frontend: 1, writing: 1 } });
  assert.deepEqual(filterSkills(skills, { filter: 'favorite' }).map(s => s.id), ['design']);
  assert.deepEqual(filterSkills(skills, { filter: 'aliases' }).map(s => s.id), ['design']);
  assert.deepEqual(filterSkills(skills, { filter: 'archived' }).map(s => s.id), ['old']);
  assert.deepEqual(filterSkills(skills, { category: 'writing' }).map(s => s.id), ['draft']);
  assert.equal(filterSkills(skills, { scope: 'all' }).length, 4);
  assert.deepEqual(filterSkills(skills, { scope: 'plugin' }).map(s => s.id), ['cache']);
  assert.equal(scopeCounts(skills, 'plugin').archived, 0);
  assert.equal(filterSkills(skills, { query: '$cached' }).length, 0, 'quick search must not discover cache entries outside the current scope');
  assert.deepEqual(filterSkills(skills, { scope: 'all', query: '$cached' }).map(s => s.id), ['cache']);
  assert.deepEqual(filterSkills(skills, { query: '封面', terms: s => s.id === 'design' ? ['文章封面'] : [] }).map(s => s.id), ['design']);
});

test('source preference persists valid selections and rejects stale values without blocking the app', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(readScope(storage), 'personal');
  assert.equal(saveScope(storage, 'plugin'), 'plugin');
  assert.equal(readScope(storage), 'plugin');
  values.set('skill-source', 'workspace');
  assert.equal(readScope(storage), 'personal');
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(readScope(denied), 'personal');
  assert.equal(saveScope(denied, 'all'), 'all');
});

test('copyable calls require an unambiguous personal name or a verified current alias entry', () => {
  const original = skill('design', 'personal', { alias: 'ui', installedAlias: { name: 'ui' } });
  assert.deepEqual(invocationState(original, [original]).commands, ['$design'], 'historical alias metadata alone is not an installation');
  const verified = { ...original, aliasVerified: true };
  assert.deepEqual(invocationState(verified, [verified]).commands, ['$design'], 'a verified flag without the actual entry is insufficient');
  const entry = skill('entry-id', 'personal', { name: 'ui', managerTarget: 'design' });
  assert.deepEqual(invocationState(verified, [verified, entry]).commands, ['$design', '$ui']);
  assert.deepEqual(invocationState(verified, [verified, { ...entry, source: 'plugin' }]).commands, ['$design']);
  assert.deepEqual(invocationState(verified, [verified, { ...entry, managerTarget: 'elsewhere' }]).commands, ['$design']);
  const renamed = { ...verified, alias: 'new-ui' };
  assert.deepEqual(invocationState(renamed, [renamed, entry]).commands, ['$design']);
  const collision = skill('cached-design', 'plugin', { name: 'design' });
  assert.deepEqual(invocationState(original, [original, collision]).commands, []);
  assert.equal(invocationState(original, [original, collision]).status, '同名待核对');
  const cached = { ...verified, source: 'plugin' };
  assert.deepEqual(invocationState(cached, [cached, entry]).commands, ['$ui']);
  assert.match(invocationState(cached, [cached, entry]).status, /启用状态未知/);
  const imported = { ...verified, source: 'workspace' };
  assert.deepEqual(invocationState(imported, [imported, entry]).commands, []);
  assert.match(invocationState(imported, [imported, entry]).status, /未完整安装/);
  assert.deepEqual(invocationState(skill('system', 'system'), []).commands, []);
  assert.deepEqual(invocationState({ ...original, validMetadata: false }, [original]).commands, []);
  assert.deepEqual(invocationState({ ...original, name: 'invalid name' }, [original]).commands, []);
  assert.equal(invocationState({ ...original, name: 'invalid name' }, [original]).status, '名称待核对');
});

test('review count excludes resolved compatibility groups while retaining evidence that needs review', () => {
  const health = { aliasGroups: [{ target: 'design' }, { target: null }], duplicates: [['a', 'b']], nameCollisions: [{}], missing: [{}, {}], drift: [{}] };
  assert.equal(healthReviewCount(health), 6);
  assert.equal(healthReviewCount({ aliasGroups: [{ target: 'design' }], duplicates: [], nameCollisions: [], missing: [], drift: [] }), 0);
  assert.deepEqual(localVersion({ pluginVersion: '2.0.0' }), { label: '插件包版本', value: '2.0.0' });
  assert.deepEqual(localVersion({ version: '1.1.0', pluginVersion: '2.0.0' }), { label: 'Skill 版本', value: '1.1.0' });
  assert.equal(localVersion({}).value, '未标版本');
});
