import fs from 'node:fs';
import path from 'node:path';
export function findElectron(root) {
  const candidates=[process.env.GPT_PET_ELECTRON_PATH,
    path.join(root,'runtime/electron/electron.exe'),
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE,'.dsh/electron/electron.exe') : null];
  return candidates.find(file=>file&&fs.existsSync(file))||null;
}
