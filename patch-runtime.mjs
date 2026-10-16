import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const helper = path.join(root, 'node_modules/dsh-pet/runtime/electron-helper');
// Codex quotas use a separate read-only adapter. Upstream's DSH balance requires
// a nonempty balance animation pool even when balanceEnabled is false; allow
// the explicit empty pool rather than loading the original character's clips.
const standalonePath = path.join(root, 'node_modules/dsh-pet/lib/standalone.js');
let standalone = fs.readFileSync(standalonePath, 'utf8');
standalone = standalone.replace('return Array.isArray(balance) && balance.length > 0;',
  'return Array.isArray(balance);');
standalone = standalone.replace('if (!Array.isArray(pool) || pool.length === 0) return false;',
  'if (!Array.isArray(pool)) return false;');
fs.writeFileSync(standalonePath, standalone);
const mainPath = path.join(helper, 'main.js');
let main = fs.readFileSync(mainPath, 'utf8');
if (!main.includes('GPT_PET_PROFILE')) {
  main = main.replace("app.setName('dsh-pet-electron-helper');",
    "app.setName('gpt-pet-companion');\n" +
    "const gptProfile = process.env.GPT_PET_PROFILE || path.join(app.getPath('appData'), 'gpt-pet-companion');\n" +
    "require('node:fs').mkdirSync(gptProfile, { recursive: true });\n" +
    "app.setPath('userData', gptProfile);\n" +
    "if (process.env.GPT_PET_QA_DIR) require(" + JSON.stringify(path.join(root, 'observe-helper.cjs')) + ");");
  main = main.replace('const openSite = (url) => {',
    "const openSite = (url) => {\n" +
    "    if (process.env.GPT_PET_PANEL_URL) {\n" +
    "      fetch(process.env.GPT_PET_PANEL_URL + '/api/show-panel', {method:'POST'}).catch(console.error);\n" +
    "      return;\n" +
    "    }");
  if (!main.includes('GPT_PET_PROFILE')) throw Error('Runtime patch anchor missing.');
}
// Keep the QA hook relocatable when the finished app is copied for installation.
main = main.replace(/if \(process\.env\.GPT_PET_QA_DIR\) require\([^\n]+\);/,
  "if (process.env.GPT_PET_QA_DIR) require(path.resolve(__dirname, '../../../../observe-helper.cjs'));");
fs.writeFileSync(mainPath, main);
if (!main.includes("ipcMain.handle('gpt:quota'")) {
  main += "\n// Companion-only read adapter: the renderer receives sanitized quota fields.\n" +
    "ipcMain.handle('gpt:quota', async (_event, force) => {\n" +
    "  const base = process.env.GPT_PET_PANEL_URL;\n" +
    "  if (!/^http:\\/\\/127\\.0\\.0\\.1:\\d+$/.test(base || '')) return {available:false,error:'额度服务未连接。'};\n" +
    "  try { return await (await fetch(base + '/api/quota' + (force ? '?refresh=1' : ''), {signal:AbortSignal.timeout(45000)})).json(); }\n" +
    "  catch { return {available:false,error:'暂时无法读取额度，请稍后重试。'}; }\n" +
    "});\n";
  fs.writeFileSync(mainPath, main);
}
const preloadPath = path.join(helper, 'preload.js');
if (!main.includes("ipcMain.handle('gpt:companion'")) {
  main += "\nipcMain.handle('gpt:companion', async () => {\n" +
    "  const base=process.env.GPT_PET_PANEL_URL;\n" +
    "  if (!/^http:\\/\\/127\\.0\\.0\\.1:\\d+$/.test(base||'')) return null;\n" +
    "  try {return await (await fetch(base+'/api/personality',{signal:AbortSignal.timeout(4000)})).json();} catch {return null;}\n" +
    "});\n";
  fs.writeFileSync(mainPath,main);
}
let preload = fs.readFileSync(preloadPath, 'utf8');
if (!preload.includes('readCompanion()')) preload=preload.replace("contextBridge.exposeInMainWorld('petBridge', {", "contextBridge.exposeInMainWorld('petBridge', {\n  readCompanion() { return ipcRenderer.invoke('gpt:companion'); },");
if (!preload.includes('readQuota(force)')) {
  preload = preload.replace("contextBridge.exposeInMainWorld('petBridge', {",
    "contextBridge.exposeInMainWorld('petBridge', {\n  readQuota(force) { return ipcRenderer.invoke('gpt:quota', !!force); },");
  fs.writeFileSync(preloadPath, preload);
}
fs.writeFileSync(preloadPath,preload);
const spritePath = path.join(helper, 'sprite.js');
let sprite = fs.readFileSync(spritePath, 'utf8');
sprite = sprite.replaceAll("'打开网站'", "'动作面板'");
sprite = sprite.replace(/^\s*\{ label: '碎碎念', action: 'whisper' \},\r?\n/m, '');
sprite = sprite.replace(/^\s*\{ label: '对话', action: 'chat' \},\r?\n/m, '');
sprite = sprite.replace("if (this.pet.balanceEnabled) tools.push({ label: '查看余额', action: 'show-balance' });",
  "tools.push({ label: '查看 Codex 额度', action: 'gpt-quota' });");
if (!sprite.includes("action: 'gpt-emote'")) sprite=sprite.replace("tools.push({ label: '查看 Codex 额度', action: 'gpt-quota' });", "tools.push({ label: '查看 Codex 额度', action: 'gpt-quota' });\n    tools.push({ label: '来个表情', action: 'gpt-emote' });");
sprite = sprite.replace(".dsh-pet-menu-column, .dsh-pet-chat'", ".dsh-pet-menu-column, .dsh-pet-chat, .gpt-quota'");
sprite = sprite.replace(".dsh-pet-chat, .gpt-quota'", ".dsh-pet-chat, .gpt-quota, .gpt-emote'");
sprite = sprite.replace('if (this.pending && this.pending.gen !== gen) return;', 'if (this.gen !== gen) return;');
if (!sprite.includes('el.gptLoadGen = gen')) sprite = sprite.replace('el.src = this.assetBase', 'el.gptLoadGen = gen;\n    el.src = this.assetBase');
sprite = sprite.replace("old.onended = null;\n        old.pause();", "old.onended = null;\n        const oldGen = old.gptLoadGen;\n        setTimeout(() => {\n          if (old.gptLoadGen === oldGen && !old.classList.contains('is-front')) old.pause();\n        }, 460);");
fs.writeFileSync(spritePath, sprite);
const indexPath = path.join(helper, 'index.html');
let index = fs.readFileSync(indexPath, 'utf8');
index = index.replace('transition: opacity 0.18s ease;', 'transition: opacity 0.42s ease-in-out;');
if (!index.includes('quota-ui.css')) index = index.replace('</head>', '<link rel="stylesheet" href="./quota-ui.css">\n  </head>');
if (!index.includes('gpt-enhancements.js')) index = index.replace('<script src="./renderer.js"></script>',
  '<script src="./quota-ui.js"></script>\n    <script src="./gpt-enhancements.js"></script>\n    <script src="./renderer.js"></script>');
fs.writeFileSync(indexPath, index);
for (const file of ['quota-ui.js', 'quota-ui.css', 'gpt-enhancements.js', 'gpt-personality.js', 'gpt-personality.css']) fs.copyFileSync(path.join(root, file), path.join(helper, file));
if (!index.includes('gpt-personality.js')) {
  index=index.replace('<script src="./renderer.js"></script>','<link rel="stylesheet" href="./gpt-personality.css">\n    <script src="./gpt-personality.js"></script>\n    <script src="./renderer.js"></script>');
  fs.writeFileSync(indexPath,index);
}
console.log('Local profile, Codex quota adapter, action menus, and soft transitions patched.');
