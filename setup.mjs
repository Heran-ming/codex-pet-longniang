import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {findElectron} from './runtime.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<12))throw Error('需要 Node.js 22.12 或以上版本。');
if(process.platform!=='win32')throw Error('当前发布版本仅验证 Windows 10/11。');
const ensure=path.join(root,'node_modules/dsh-pet/scripts/ensure-electron.mjs');
if(!fs.existsSync(ensure))throw Error('请先运行 npm ci，或直接运行 setup.ps1。');
const config=path.join(root,'data/dsh-pet/main-config.jsonc');
fs.mkdirSync(path.dirname(config),{recursive:true});
if(!fs.existsSync(config))fs.copyFileSync(path.join(root,'default-config.json'),config);
if(!findElectron(root)){
  const result=spawnSync(process.execPath,[ensure],{cwd:root,env:{...process.env,DSH_HOME:path.join(root,'runtime')},stdio:'inherit',windowsHide:true});
  if(result.error||result.status!==0)throw Error('Electron 下载失败，请设置 GPT_PET_ELECTRON_PATH 后重试。');
}
await import('./patch-runtime.mjs');
console.log('准备完成。运行 npm start，或运行 install-local.ps1 创建桌面快捷方式。');
