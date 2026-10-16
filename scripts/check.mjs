import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {normalizeQuota} from '../quota-reader.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=fs.readdirSync(root).filter(file=>/\.(mjs|cjs|js)$/.test(file));
for(const file of files)execFileSync(process.execPath,['--check',path.join(root,file)],{windowsHide:true,stdio:'pipe'});
const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
assert.equal(catalog.count,36);assert.equal(catalog.actions.length,36);
for(const action of catalog.actions){
  const file=path.join(root,'data/dsh-pet/main-animation/webm',action.file);
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),action.sha256,action.id);
  assert.equal(action.fps,24);assert.equal(action.keyframePace,2.4);
}
const personality=JSON.parse(fs.readFileSync(path.join(root,'personality.json'),'utf8'));
assert.equal(personality.emotes.length,6);assert.equal(personality.quotaLine,'本小姐可不便宜');
for(const item of personality.emotes){
  assert.ok(fs.existsSync(path.join(root,'assets/emotes',item.id+'.png')));
  assert.ok(item.lines.every(line=>line.length<=8));
}
assert.equal(normalizeQuota({rateLimits:{primary:{usedPercent:30,windowDurationMins:300}}}).buckets[0].windows[0].remainingPercent,70);
assert.throws(()=>normalizeQuota({rateLimits:{primary:{usedPercent:null}}}));
console.log(JSON.stringify({syntax:files.length,animations:36,mediaHashes:'pass',emotes:6,captions:'short',quotaNormalization:'pass'}));
