import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { CATEGORIES, createsCycle } from './catalog.mjs';

export class ValidationError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

export class Store {
  constructor(directory) { this.directory = directory; this.file = path.join(directory, 'config.json'); this.queue = Promise.resolve(); }
  async read() {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      if (data.version !== 1 || !data.skills || !Array.isArray(data.events)) throw new Error('Invalid config');
      return data;
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('本地配置无法读取。请检查 .skill-manager/config.json，现有文件未被覆盖。');
      return { version: 1, createdAt: new Date().toISOString(), skills: {}, categories: [], events: [] };
    }
  }
  transaction(update) {
    const job = this.queue.then(async () => {
      const config = await this.read();
      const next = await update(config) || config;
      await mkdir(this.directory, { recursive: true });
      await writeFile(`${this.file}.tmp`, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
      await rename(`${this.file}.tmp`, this.file);
      return next;
    });
    this.queue = job.catch(() => {});
    return job;
  }
}

export function validateMetadata(id, input, catalog, config) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('配置格式不正确');
  if (!catalog.skills.some(s => s.id === id)) throw new ValidationError('没有找到这个 Skill', 404);
  const output = { ...(config.skills[id] || {}) };
  for (const [key, value] of Object.entries(input)) {
    if (['displayName', 'notes', 'alias'].includes(key)) {
      const max = key === 'notes' ? 3000 : 80;
      if (typeof value !== 'string' || value.length > max) throw new ValidationError(`${key} 最多 ${max} 个字符`);
      output[key] = value.trim();
    } else if (['favorite', 'archived'].includes(key)) {
      if (typeof value !== 'boolean') throw new ValidationError(`${key} 必须是布尔值`);
      output[key] = value;
    } else if (key === 'category') {
      if (![...CATEGORIES, ...(config.categories || [])].some(c => c.id === value)) throw new ValidationError('请选择已有分类');
      output.category = value;
    } else if (key === 'dependencies') {
      if (!Array.isArray(value) || value.length > 50) throw new ValidationError('最多配置 50 个依赖');
      const unique = new Set();
      output.dependencies = value.map(d => {
        if (!d || typeof d.id !== 'string' || unique.has(d.id)) throw new ValidationError('依赖重复或格式不正确');
        unique.add(d.id);
        const target = catalog.skills.find(s => s.id === d.id);
        if (!target) throw new ValidationError('依赖的 Skill 不存在');
        const retainedEdges = catalog.edges.filter(e => !(e.from === id && e.type === 'manual'));
        if (createsCycle(id, d.id, retainedEdges)) throw new ValidationError('这个依赖会形成循环，请选择其他 Skill');
        const version = d.version ?? (target.version || target.pluginVersion || '');
        if (typeof version !== 'string' || version.length > 100) throw new ValidationError('依赖版本格式不正确');
        return { id: d.id, version };
      });
    } else throw new ValidationError(`不支持的配置项：${key}`);
  }
  if (output.alias) {
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(output.alias)) throw new ValidationError('短名使用小写字母、数字和连字符，最多 32 位');
    const conflict = catalog.skills.find(s => s.id !== id && s.managerTarget !== id && ((config.skills[s.id]?.alias || '').toLowerCase() === output.alias || s.name.toLowerCase() === output.alias));
    if (conflict) throw new ValidationError(`短名已被 ${conflict.name} 使用，请换一个`);
    if (catalog.skills.find(s => s.id === id)?.name === output.alias) throw new ValidationError('短名和原名相同，请设置一个更容易记住的名称');
  }
  return output;
}
