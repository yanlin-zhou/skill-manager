import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { homedir, hostname } from 'node:os';
import { scanSkills, buildCatalog, parseSkill, aliasMarkdown } from './lib/catalog.mjs';
import { Store, ValidationError, validateMetadata } from './lib/store.mjs';
import { appStatus, sourceSettings, validateSources } from './lib/apps.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const { version: APP_VERSION } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const repositories = [
  { repo: 'anthropics/skills', name: 'Anthropic Skills', description: '文档、设计与自动化的官方技能集合。', categories: ['productivity', 'creative', 'engineering'], url: 'https://github.com/anthropics/skills', initial: 'A', color: 'clay' },
  { repo: 'vercel-labs/agent-skills', name: 'Vercel Agent Skills', description: '围绕 React、界面规范与部署的官方技能集合。', categories: ['frontend', 'engineering'], url: 'https://github.com/vercel-labs/agent-skills', initial: 'V', color: 'ink' },
  { repo: 'vercel-labs/skills', name: 'Skills CLI', description: '发现、安装和管理社区 Skills 的开源工具。', categories: ['engineering'], url: 'https://github.com/vercel-labs/skills', initial: '/', color: 'blue' },
];

async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new ValidationError('请使用 JSON 请求', 415);
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 1024 * 1024) throw new ValidationError('文件过大，最多支持 1 MB', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ValidationError('JSON 格式不正确'); }
}

export async function createApp({ dataDirectory = path.join(ROOT, '.skill-manager'), scanOptions = {}, aliasRoot = path.join(homedir(), '.agents/skills') } = {}) {
  const store = new Store(dataDirectory);
  const library = path.join(dataDirectory, 'library');
  let cached;
  const pending = new Map();
  let repositoryCache = null;
  const getScan = async (config, force = false) => {
    const settings = sourceSettings(config);
    const key = JSON.stringify([settings.apps, settings.projects]);
    if (!force && cached?.key === key) return cached.value;
    if (!pending.has(key)) {
      const job = scanSkills({ library, selectedApps: settings.apps, projects: settings.projects, ...scanOptions })
        .then(value => { cached = { key, value }; return value; }).finally(() => pending.delete(key));
      pending.set(key, job);
    }
    return pending.get(key);
  };
  const refresh = async () => getScan(await store.read(), true);
  const catalog = async () => {
    const config = await store.read();
    const [scan, apps] = await Promise.all([getScan(config), appStatus(config, scanOptions)]);
    return { ...buildCatalog(scan, config), appSources: { ...apps, configured: Boolean(scanOptions.roots) || apps.configured } };
  };
  await store.transaction(config => config);

  const server = createServer(async (req, res) => {
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      const host = req.headers.host || '';
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) throw new ValidationError('仅允许本机访问', 403);
      const url = new URL(req.url, `http://${host}`);
      if (req.headers.origin && req.headers.origin !== `http://${host}`) throw new ValidationError('不允许跨站请求', 403);
      if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-skill-manager'] !== 'local') throw new ValidationError('请求来源不正确', 403);
      const route = url.pathname;
      if (req.method === 'GET' && route === '/api/health') return json(200, { app: 'thomas-skill-manager', version: APP_VERSION, hostname: hostname() });
      if (req.method === 'GET' && route === '/api/catalog') return json(200, await catalog());
      if (req.method === 'POST' && route === '/api/rescan') { await body(req); await refresh(); return json(200, await catalog()); }
      if (req.method === 'GET' && route === '/api/apps') return json(200, await appStatus(await store.read(), scanOptions));
      if (req.method === 'PUT' && route === '/api/apps') {
        const input = await body(req);
        let settings;
        try { settings = await validateSources(input, scanOptions.home); }
        catch (error) { throw new ValidationError(error.message); }
        await store.transaction(config => { config.appSources = settings; });
        await refresh();
        return json(200, await catalog());
      }

      const aliasInstall = route.match(/^\/api\/skills\/([a-f0-9]{16})\/install-alias$/);
      if (req.method === 'POST' && aliasInstall) {
        await body(req);
        const data = await catalog();
        const skill = data.skills.find(s => s.id === aliasInstall[1]);
        if (!skill) throw new ValidationError('没有找到这个 Skill', 404);
        if (!scanOptions.roots && !sourceSettings(await store.read()).apps.includes('codex')) throw new ValidationError('请先在 App 来源中选择 Codex');
        if (!skill.alias || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(skill.alias)) throw new ValidationError('请先保存有效的短名');
        const folder = path.join(aliasRoot, skill.alias);
        const destination = path.join(folder, 'SKILL.md');
        await mkdir(aliasRoot, { recursive: true });
        try { await mkdir(folder); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        const canonicalRoot = await realpath(aliasRoot);
        const canonicalFolder = await realpath(folder);
        if (path.dirname(canonicalFolder) !== canonicalRoot) throw new ValidationError('短名路径指向其他目录，请换一个短名');
        const content = aliasMarkdown(skill);
        try { await writeFile(destination, content, { flag: 'wx', mode: 0o600 }); }
        catch (error) {
          if (error.code !== 'EEXIST') throw error;
          const current = await readFile(destination, 'utf8');
          if (current !== content) throw new ValidationError('这个目录已有不同的 SKILL.md，未覆盖原文件。请换一个短名。', 409);
        }
        await store.transaction(config => {
          config.skills[skill.id] = { ...(config.skills[skill.id] || {}), installedAlias: { name: skill.alias, path: destination, at: new Date().toISOString() } };
        });
        await refresh();
        return json(201, { catalog: await catalog(), path: destination });
      }

      const detail = route.match(/^\/api\/skills\/([a-f0-9]{16})(\/alias)?$/);
      if (detail) {
        const data = await catalog();
        const skill = data.skills.find(s => s.id === detail[1]);
        if (!skill) throw new ValidationError('这个 Skill 已不在本地目录中，请重新扫描', 404);
        if (req.method === 'GET' && detail[2]) {
          if (!skill.alias) throw new ValidationError('请先设置短名');
          res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="SKILL.md"' });
          return res.end(aliasMarkdown(skill));
        }
        if (req.method === 'GET') return json(200, { ...skill, content: await readFile(skill.path, 'utf8') });
        if (req.method === 'PATCH' && !detail[2]) {
          const input = await body(req);
          await store.transaction(async config => { config.skills[skill.id] = validateMetadata(skill.id, input, buildCatalog(await getScan(config), config), config); });
          return json(200, await catalog());
        }
      }

      if (req.method === 'POST' && route === '/api/skills') {
        const input = await body(req);
        if (typeof input.content !== 'string' || input.content.length > 100000) throw new ValidationError('请导入不超过 100 KB 的 SKILL.md');
        const parsed = parseSkill(input.content, '');
        if (!parsed.validMetadata || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(parsed.name)) throw new ValidationError('SKILL.md 需要 name 和 description；name 使用小写字母、数字和连字符');
        const data = await catalog();
        if (data.skills.some(s => s.name === parsed.name)) throw new ValidationError('本地已有同名 Skill，请先检查现有版本');
        const folder = path.join(library, parsed.name);
        await mkdir(folder, { recursive: true });
        try { await writeFile(path.join(folder, 'SKILL.md'), input.content, { flag: 'wx', mode: 0o600 }); }
        catch (error) { if (error.code === 'EEXIST') throw new ValidationError('工作台中已经存在此 Skill'); throw error; }
        await refresh();
        return json(201, await catalog());
      }

      if (req.method === 'POST' && route === '/api/categories') {
        const input = await body(req);
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name || name.length > 20) throw new ValidationError('分类名称需要 1–20 个字符');
        await store.transaction(async config => {
          const data = buildCatalog(await getScan(config), config);
          if (data.categories.some(c => c.name === name)) throw new ValidationError('这个分类已经存在');
          config.categories.push({ id: `custom-${randomUUID().slice(0, 8)}`, name, color: '#879c91', icon: 'folder' });
        });
        return json(201, await catalog());
      }

      if (req.method === 'POST' && route === '/api/usage') {
        const input = await body(req);
        if (!(await catalog()).skills.some(s => s.id === input.skillId)) throw new ValidationError('没有找到这个 Skill');
        await store.transaction(config => { config.events.push({ id: randomUUID(), skillId: input.skillId, at: new Date().toISOString(), source: 'manual' }); });
        return json(201, await catalog());
      }

      if (req.method === 'GET' && route === '/api/config/export') {
        const { events, appSources, ...config } = await store.read();
        config.skills = Object.fromEntries(Object.entries(config.skills).map(([id, metadata]) => { const { installedAlias, ...portable } = metadata; return [id, portable]; }));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="skill-manager-config.json"' });
        return res.end(JSON.stringify(config, null, 2));
      }
      if (req.method === 'POST' && route === '/api/config/import') {
        const input = await body(req);
        if (input.version !== 1 || !input.skills || typeof input.skills !== 'object' || Array.isArray(input.skills) || !Array.isArray(input.categories || []) || (input.categories || []).length > 100) throw new ValidationError('请选择 Skill Manager 导出的配置文件');
        let imported = 0, skipped = 0;
        await catalog();
        await store.transaction(async config => {
          const scan = await getScan(config);
          for (const category of input.categories || []) {
            if (!/^custom-[a-z0-9-]+$/.test(category.id) || typeof category.name !== 'string' || !category.name.trim() || category.name.length > 20) throw new ValidationError('导入文件包含无效分类');
            if (!config.categories.some(c => c.id === category.id || c.name === category.name)) config.categories.push({ id: category.id, name: category.name, color: '#879c91', icon: 'folder' });
          }
          const ids = new Set(scan.skills.map(s => s.id));
          // Stage the complete set before validation so aliases can be exchanged atomically.
          const proposed = structuredClone(config);
          for (const [id, metadata] of Object.entries(input.skills)) {
            if (!ids.has(id)) { skipped++; continue; }
            if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new ValidationError('Skill 配置格式不正确');
            proposed.skills[id] = { ...(config.skills[id] || {}), ...metadata };
          }
          for (const [id, metadata] of Object.entries(input.skills)) {
            if (!ids.has(id)) continue;
            proposed.skills[id] = validateMetadata(id, metadata, buildCatalog(scan, proposed), proposed);
            imported++;
          }
          return proposed;
        });
        return json(200, { catalog: await catalog(), imported, skipped });
      }

      if (req.method === 'GET' && route === '/api/discover') {
        if (url.searchParams.get('refresh') === '1') {
          repositoryCache = await Promise.all(repositories.map(async repo => {
            try {
              const response = await fetch(`https://api.github.com/repos/${repo.repo}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Local-Skill-Manager' }, signal: AbortSignal.timeout(8000) });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const data = await response.json();
              if (typeof data.stargazers_count !== 'number') throw new Error('Invalid response');
              return { ...repo, stars: data.stargazers_count, updatedAt: data.pushed_at, fetchedAt: new Date().toISOString() };
            } catch { return { ...repo, stars: null, error: '热度暂时无法获取' }; }
          }));
        }
        return json(200, { repositories: repositoryCache || repositories.map(r => ({ ...r, stars: null })) });
      }

      if (route.startsWith('/api/')) throw new ValidationError('没有找到这个接口', 404);
      if (!['GET', 'HEAD'].includes(req.method)) throw new ValidationError('不支持的请求方式', 405);
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/skill-state.js': ['skill-state.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/icons.js': ['icons.js', 'text/javascript'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
      const file = files[route];
      if (!file) throw new ValidationError('没有找到这个页面', 404);
      const content = await readFile(path.join(ROOT, 'public', file[0]));
      res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      const status = error instanceof ValidationError ? error.status : 500;
      if (status === 500) console.error(error);
      if (!res.headersSent) json(status, { error: status === 500 ? '操作未完成，本地数据已保留。请检查服务终端后重试。' : error.message });
      else res.end();
    }
  });
  return { server, store, refresh, catalog };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4317);
  const { server } = await createApp();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。可使用 PORT=4318 npm start。` : error); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Skill Manager · http://127.0.0.1:${port}\n只在本机运行 · 配置保存在 ${path.join(ROOT, '.skill-manager')}`));
}
