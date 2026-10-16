import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readQuota } from './quota-reader.mjs';
import { findElectron } from './runtime.mjs';
import './patch-runtime.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
const LOGS = path.join(ROOT, 'logs');
fs.mkdirSync(LOGS, { recursive: true });
const STATE = path.join(DATA, 'companion-state.json');
const PREFS = path.join(DATA, 'preferences.json');
const CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog.json'), 'utf8'));
const PERSONALITY = JSON.parse(fs.readFileSync(path.join(ROOT, 'personality.json'), 'utf8'));
let interaction = {seq:0,kind:null,at:0};
const CONFIG_FILE = path.join(DATA, 'dsh-pet/main-config.jsonc');
fs.mkdirSync(path.dirname(CONFIG_FILE),{recursive:true});
if(!fs.existsSync(CONFIG_FILE))fs.copyFileSync(path.join(ROOT,'default-config.json'),CONFIG_FILE);
const allowedNames = new Set(CATALOG.actions.map(action => action.name));
const runtimeRoot = path.join(ROOT, 'node_modules/dsh-pet');
const qa = process.argv.includes('--qa');
const appId = 'gpt-pet-companion-local';
const instance = randomUUID();
let backendPort, controlPort, backend, panel, stopping = false, ready = false;
let lastRequested = null;
let quotaSnapshot = null, quotaPending = null, quotaAttemptAt = 0;
async function accountQuota(force = false) {
  const age = Date.now() - quotaAttemptAt;
  if (quotaPending) return quotaPending;
  if (quotaSnapshot && age < (force ? 5000 : 15000)) return quotaSnapshot;
  quotaAttemptAt = Date.now();
  quotaPending = readQuota().then(value => (quotaSnapshot = value)).catch(error => {
    quotaSnapshot = { available: false, fetchedAt: new Date().toISOString(),
      error: error.message || '暂时无法读取额度，请确认 Codex 已登录。' };
    return quotaSnapshot;
  }).finally(() => { quotaPending = null; });
  return quotaPending;
}
let preferences = { size: 430, roam: true, autoplay: true, bubbles: true };
try { preferences = { ...preferences, ...JSON.parse(fs.readFileSync(PREFS, 'utf8')) }; } catch {}

function log(message) {
  const line = new Date().toISOString() + ' ' + message;
  fs.appendFileSync(path.join(LOGS, 'companion.log'), line + '\n');
  console.log(line);
}
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
async function requestBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16384) throw Error('请求过大');
  }
  return raw ? JSON.parse(raw) : {};
}
async function engine(route, method = 'GET', body) {
  if (!backendPort || !ready) throw Error('桌宠正在启动，请稍候');
  const response = await fetch('http://127.0.0.1:' + backendPort + '/dsh-pet-7340' + route, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw Error(result.message || result.reason || '动作请求失败');
  return result;
}
function showPanel() {
  if (panel?.connected) panel.send({ type: 'show' });
}
async function applyPreferences(next) {
  const size = Number(next.size);
  if (!Number.isInteger(size) || size < 280 || size > 680 ||
      typeof next.roam !== 'boolean' || typeof next.autoplay !== 'boolean') throw Error('设置值无效');
  const conf = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'default-config.json'), 'utf8'));
  conf.pets[0].size = size;
  conf.pets[0].fixedEnabled = !next.roam;
  conf.animations.categories.forEach((category, index) => {
    category.weight = next.autoplay ? (baseline.animations.categories.find(item => item.id === category.id)?.weight || 0) : 0;
  });
  conf.animationWeights = { idle: next.autoplay ? 24 : 1,
    turn: next.autoplay ? 4 : 0, move: next.roam && next.autoplay ? 6 : 0 };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(conf, null, 2));
  await engine('/reload', 'POST', {});
  preferences = { size, roam: next.roam, autoplay: next.autoplay, bubbles: typeof next.bubbles === 'boolean' ? next.bubbles : preferences.bubbles };
  fs.writeFileSync(PREFS, JSON.stringify(preferences, null, 2));
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (req.method !== 'GET' && req.headers.origin &&
        req.headers.origin !== 'http://127.0.0.1:' + controlPort) return json(res, 403, { error: '来源无效' });
    if (url.pathname === '/health') return json(res, 200, { appId, instance, ready, root: ROOT });
    if (url.pathname === '/catalog.json') return json(res, 200, CATALOG);
    if (url.pathname === '/api/status') return json(res, 200, { ready, preferences, lastRequested, actions: CATALOG.count });
    if (url.pathname === '/api/personality') return json(res, 200, {preferences,personality:PERSONALITY,interaction,assetBase:'http://127.0.0.1:'+controlPort+'/assets/emotes/'});
    if (url.pathname === '/api/interaction' && req.method === 'POST') {
      const body = await requestBody(req);
      if (!['quota','emote'].includes(body.kind)) return json(res,400,{error:'互动类型无效'});
      interaction = {seq:interaction.seq+1,kind:body.kind,at:Date.now()};
      return json(res,200,{ok:true,seq:interaction.seq});
    }
    if (url.pathname === '/api/quota' && req.method === 'GET') return json(res, 200, await accountQuota(url.searchParams.get('refresh') === '1'));
    if (url.pathname === '/api/show-panel' && req.method === 'POST') {
      showPanel(); return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/play' && req.method === 'POST') {
      const body = await requestBody(req);
      if (!allowedNames.has(body.name)) return json(res, 400, { error: '没有这段动作' });
      await engine('/anim?pet=main', 'POST', { name: body.name });
      lastRequested = { name: body.name, at: Date.now() };
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/settings' && req.method === 'POST') {
      await applyPreferences(await requestBody(req));
      return json(res, 200, { ok: true, preferences });
    }
    if (url.pathname === '/api/quit' && req.method === 'POST') {
      json(res, 200, { ok: true }); setTimeout(shutdown, 100); return;
    }
    if (url.pathname === '/api/engine-state') return json(res, 200, await engine('/state'));
    if (url.pathname.startsWith('/media/')) {
      const name = decodeURIComponent(url.pathname.slice(7));
      if (!allowedNames.has(name)) return json(res, 404, { error: '没有这段动作' });
      const file = path.join(DATA, 'dsh-pet/main-animation/webm', name + '.webm');
      return streamFile(req, res, file, 'video/webm');
    }
    if (url.pathname.startsWith('/assets/previews/')) {
      const id = path.basename(url.pathname, '.png');
      if (!CATALOG.actions.some(action => action.id === id)) return json(res, 404, {});
      return streamFile(req, res, path.join(ROOT, 'assets/previews', id + '.png'), 'image/png');
    }
    if (url.pathname.startsWith('/assets/emotes/')) {
      const id=path.basename(url.pathname,'.png');
      if (!PERSONALITY.emotes.some(item=>item.id===id)) return json(res,404,{});
      return streamFile(req,res,path.join(ROOT,'assets/emotes',id+'.png'),'image/png');
    }
    if (url.pathname === '/assets/pet.ico') return streamFile(req, res, path.join(ROOT, 'assets/pet.ico'), 'image/x-icon');
    const staticMap = { '/': ['panel.html', 'text/html; charset=utf-8'],
      '/panel.js': ['panel.js', 'text/javascript; charset=utf-8'],
      '/quota-ui.js': ['quota-ui.js', 'text/javascript; charset=utf-8'],
      '/quota-ui.css': ['quota-ui.css', 'text/css; charset=utf-8'],
      '/panel.css': ['panel.css', 'text/css; charset=utf-8'] };
    if (staticMap[url.pathname]) {
      const [name, mime] = staticMap[url.pathname];
      return streamFile(req, res, path.join(ROOT, name), mime);
    }
    return json(res, 404, { error: '未找到' });
  } catch (error) { json(res, 400, { error: String(error.message || error) }); }
});
function streamFile(req, res, file, type) {
  const { size } = fs.statSync(file);
  const range = req.headers.range;
  let start = 0, end = size - 1, status = 200;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) { res.writeHead(416); res.end(); return; }
    start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size-1) : size-1;
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': 'bytes */'+size }); res.end(); return; }
    status = 206;
  }
  const headers = { 'Content-Type': type, 'Content-Length': end-start+1, 'Accept-Ranges': 'bytes',
    'Cache-Control': type.startsWith('text/') ? 'no-store' : 'private, max-age=3600' };
  if (status === 206) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
  res.writeHead(status, headers);
  const stream = fs.createReadStream(file, { start, end });
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}
async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}
async function shutdown() {
  if (stopping) return; stopping = true; log('Closing companion.');
  ready = false;
  if (panel?.connected) panel.send({ type: 'quit' });
  try { await fetch('http://127.0.0.1:' + backendPort + '/shutdown', { method: 'POST', signal: AbortSignal.timeout(5000) }); } catch {}
  server.close();
  const drain = child => new Promise(resolve => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return resolve();
    const timer = setTimeout(() => {child.kill(); resolve();}, 4000);
    child.once('exit', () => {clearTimeout(timer);resolve();});
  });
  await Promise.allSettled([drain(backend), drain(panel)]);
  // On Windows a hung GPU helper can survive its Electron parent. Close only
  // Electron processes carrying this exact app directory in their command line.
  if (process.platform === 'win32') {
    const cleanup = "$scope = $env:GPT_PET_CLEANUP_ROOT; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -and $_.CommandLine.Contains($scope) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    await new Promise(resolve => execFile('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(cleanup,'utf16le').toString('base64')],
      {windowsHide:true,timeout:5000,env:{...process.env,GPT_PET_CLEANUP_ROOT:ROOT}}, () => resolve()));
  }
  await new Promise(resolve => setTimeout(resolve, 300));
  try { if (JSON.parse(fs.readFileSync(STATE, 'utf8')).instance === instance) fs.unlinkSync(STATE); } catch {}
  log('Companion closed.');
  process.exit(0);
}
async function start() {
  try {
    const previous = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const response = await fetch(previous.url + '/health', { signal: AbortSignal.timeout(1000) });
    const health = await response.json();
    if (health.appId === appId && health.instance === previous.instance) {
      await fetch(previous.url + '/api/show-panel', { method: 'POST' });
      log('Opened existing companion.'); return;
    }
  } catch {}
  const conf = JSON.parse(fs.readFileSync(CONFIG_FILE,'utf8'));
  const interactionNames = CATALOG.actions.filter(item=>item.category==='互动表情').map(item=>item.name);
  if (interactionNames.length) {
    let category=conf.animations.categories.find(item=>item.id==='互动表情');
    if (!category) {category={id:'互动表情',weight:0,actions:[],noMirror:true};conf.animations.categories.push(category);}
    category.actions=interactionNames; category.weight=0;
    fs.writeFileSync(CONFIG_FILE,JSON.stringify(conf,null,2));
  }
  const electron = findElectron(ROOT);
  if (!electron) throw Error('缺少 Electron 运行时，请先运行 setup.ps1。');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  controlPort = server.address().port;
  backendPort = await freePort();
  const panelUrl = 'http://127.0.0.1:' + controlPort;
  const env = { ...process.env, DSH_HOME: DATA, DSH_PET_ELECTRON_PATH: electron,
    GPT_PET_PANEL_URL: panelUrl, GPT_PET_PROFILE: path.join(DATA, 'helper-profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  if (qa) env.GPT_PET_QA_DIR = path.join(ROOT, 'qa');
  const stdout = fs.openSync(path.join(LOGS, 'engine.log'), 'a');
  backend = spawn(process.execPath, [path.join(runtimeRoot, 'lib/standalone.js'), '--port', String(backendPort)],
    { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', stdout, stdout] });
  backend.once('error', error => { log('Backend spawn failed: ' + error.message); shutdown(); });
  backend.once('exit', code => { if (!stopping) { log('Backend exited: ' + code); shutdown(); } });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:' + backendPort + '/health', { signal: AbortSignal.timeout(600) });
      const health = await response.json();
      if (health.plugin?.root === runtimeRoot) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) throw Error('桌宠引擎启动未完成，请查看 logs/engine.log');
  fs.writeFileSync(STATE, JSON.stringify({ appId, instance, pid: process.pid, backendPid: backend.pid,
    backendPort, controlPort, url: panelUrl, root: ROOT }, null, 2));
  panel = spawn(electron, [path.join(ROOT, 'panel-main.cjs'), '--url', panelUrl, ...(qa ? ['--qa'] : [])],
    { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', stdout, stdout, 'ipc'] });
  panel.once('error', error => log('Panel spawn failed: ' + error.message));
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  log('Ready: ' + panelUrl + '; ' + CATALOG.count + ' animations.');
}
start().catch(error => { log(error.stack || String(error)); shutdown(); });
