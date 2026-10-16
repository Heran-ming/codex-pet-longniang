import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import readline from 'node:readline';

export function findCodex() {
  if (process.env.GPT_PET_CODEX_PATH && fs.existsSync(process.env.GPT_PET_CODEX_PATH)) return process.env.GPT_PET_CODEX_PATH;
  try {
    const candidates = execFileSync('where.exe', ['codex.exe'], { encoding:'utf8',windowsHide:true,timeout:2000 })
      .trim().split(/\r?\n/).filter(file => fs.existsSync(file));
    if(candidates.length) return candidates[0];
  } catch {}
  const bin=path.join(process.env.LOCALAPPDATA,'OpenAI/Codex/bin');
  if(fs.existsSync(bin)){
    const candidates=fs.readdirSync(bin,{withFileTypes:true}).filter(item=>item.isDirectory())
      .map(item=>path.join(bin,item.name,'codex.exe')).filter(file=>fs.existsSync(file))
      .sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
    if(candidates.length)return candidates[0];
  }
  throw Error('没有找到本机 Codex，请先打开并登录 Codex。');
}
export async function readRawQuota() {
  const child=spawn(findCodex(),['app-server','--listen','stdio://'],{
    windowsHide:true,stdio:['pipe','pipe','pipe'],
    env:{...process.env,RUST_LOG:'error'},
  });
  const lines=readline.createInterface({input:child.stdout});
  const pending=new Map();
  let sequence=0,closed=false;
  const send=message=>child.stdin.write(JSON.stringify(message)+'\n');
  const call=(method,params)=>new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('额度查询超时，请稍后再点一次。'));},20000);
    pending.set(id,{resolve,reject,timer});
    send({id,method,...(params?{params}:{})});
  });
  child.stderr.on('data',()=>{}); // No credential-bearing diagnostics are persisted.
  child.on('error',()=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('本机 Codex 额度服务启动失败。'));}pending.clear();});
  child.on('exit',()=>{closed=true;for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('本机 Codex 额度服务已退出。'));}pending.clear();});
  lines.on('line',line=>{
    let message;try{message=JSON.parse(line);}catch{return;}
    if(message.id===undefined||!pending.has(message.id))return;
    const item=pending.get(message.id);pending.delete(message.id);clearTimeout(item.timer);
    if(message.error) item.reject(Error(message.error.code===-32000?'Codex 登录或额度读取暂时不可用，请先确认 Codex 已登录。':'额度服务返回错误（'+message.error.code+'）。'));
    else item.resolve(message.result);
  });
  try{
    await call('initialize',{clientInfo:{name:'gpt_pet_companion',title:'GPT娘桌宠额度查询',version:'1.3.0'}});
    send({method:'initialized',params:{}});
    return await call('account/rateLimits/read');
  } finally {
    lines.close();
    if(!closed){child.stdin.end();child.kill();}
  }
}
function windowLabel(minutes){
  if(minutes===10080)return '每周';
  if(minutes===300)return '5小时';
  if(typeof minutes!=='number'||!Number.isFinite(minutes))return '额度';
  if(minutes%1440===0)return minutes/1440+'天';
  if(minutes%60===0)return minutes/60+'小时';
  return minutes+'分钟';
}
function resetText(seconds){
  if(typeof seconds!=='number'||!Number.isFinite(seconds))return null;
  return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
    .format(new Date(seconds*1000));
}
export function normalizeQuota(raw,now=Date.now()){
  const buckets=raw.rateLimitsByLimitId && Object.keys(raw.rateLimitsByLimitId).length ?
    Object.values(raw.rateLimitsByLimitId) : raw.rateLimits ? [raw.rateLimits] : [];
  const normalized=buckets.map(bucket=>{
    const windows=['primary','secondary'].map(key=>{
      const win=bucket[key];
      if(!win||typeof win.usedPercent!=='number'||!Number.isFinite(win.usedPercent))return null;
      const used=Math.max(0,Math.min(100,win.usedPercent));
      return {id:key,label:windowLabel(win.windowDurationMins),usedPercent:used,remainingPercent:Math.round((100-used)*10)/10,
        durationMinutes:win.windowDurationMins??null,resetsAt:typeof win.resetsAt==='number'?win.resetsAt:null,resetText:resetText(win.resetsAt)};
    }).filter(Boolean);
    return {id:bucket.limitId||'codex',name:bucket.limitName||'Codex',plan:bucket.planType||null,windows};
  }).filter(bucket=>bucket.windows.length);
  if(!normalized.length)throw Error('当前账户暂未返回额度数据。');
  return {available:true,fetchedAt:new Date(now).toISOString(),source:'Codex account/rateLimits/read',buckets:normalized};
}
export async function readQuota(){return normalizeQuota(await readRawQuota());}
