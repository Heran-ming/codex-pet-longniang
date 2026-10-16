const { app, BrowserWindow, Menu, Tray, nativeImage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const urlIndex = process.argv.indexOf('--url');
const base = process.argv[urlIndex+1];
const qa = process.argv.includes('--qa');
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base || '')) process.exit(2);
app.setName('gpt-pet-control');
fs.mkdirSync(path.join(__dirname,'data','panel-profile'),{recursive:true});
app.setPath('userData',path.join(__dirname,'data','panel-profile'));
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
let win, tray, quitting = false;
function quitPanel() {
  quitting = true;
  if (tray && !tray.isDestroyed()) tray.destroy();
  if (win && !win.isDestroyed()) win.destroy();
  app.exit(0);
}
async function quitAll() {
  quitting = true;
  try { await fetch(base+'/api/quit',{method:'POST'}); } catch {}
  quitPanel();
}
function show() { if(win && !win.isDestroyed()){ win.show(); win.focus(); } }
app.whenReady().then(async()=>{
  win=new BrowserWindow({width:1100,height:810,minWidth:800,minHeight:620,
    title:'GPT娘 · 动作手账',backgroundColor:'#f5f0e7',show:!qa,
    icon:path.join(__dirname,'assets/pet.ico'),
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.setMenu(null);
  const errors=[];
  win.webContents.on('console-message',(_event,level,message)=>{if(level>=2) errors.push(message);});
  win.webContents.on('render-process-gone',(_event,details)=>{fs.appendFileSync(path.join(__dirname,'logs','panel-errors.log'),JSON.stringify(details)+'\n');});
  win.webContents.setWindowOpenHandler(({url})=>{
    if(url.startsWith('https://github.com/')) shell.openExternal(url);
    return {action:'deny'};
  });
  win.on('close',event=>{if(!quitting){event.preventDefault();win.hide();}});
  const icon=nativeImage.createFromPath(path.join(__dirname,'assets/previews/idle.png')).resize({width:32,height:32});
  tray=new Tray(icon); tray.setToolTip('GPT娘 · 独立桌宠');
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'打开动作手账',click:show},
    {type:'separator'},
    {label:'退出 GPT娘桌宠',click:quitAll},
  ]));
  tray.on('double-click',show);
  await win.loadURL(base);
  if(qa){
    const qaDir=path.join(__dirname,'qa');fs.mkdirSync(qaDir,{recursive:true});
    setTimeout(async()=>{
      try{
        const results=await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'qa-panel-renderer.js'),'utf8'));
        results.consoleErrors=errors;
        fs.writeFileSync(path.join(qaDir,'panel-qa.json'),JSON.stringify(results,null,2));
        fs.writeFileSync(path.join(qaDir,'panel.png'),(await win.webContents.capturePage()).toPNG());
        await win.setSize(820,690);
        await new Promise(r=>setTimeout(r,400));
        const compact=await win.webContents.executeJavaScript("({overflow:document.documentElement.scrollWidth>innerWidth,width:innerWidth})");
        fs.writeFileSync(path.join(qaDir,'panel-compact-qa.json'),JSON.stringify(compact,null,2));
        fs.writeFileSync(path.join(qaDir,'panel-compact.png'),(await win.webContents.capturePage()).toPNG());
      }catch(error){fs.writeFileSync(path.join(qaDir,'panel-failed.txt'),error.stack||String(error));}
    },1600);
  }
});
process.on('message',message=>{if(message?.type==='show')show();if(message?.type==='quit')quitPanel();});
process.on('disconnect',quitPanel);
app.on('before-quit',()=>{quitting=true;});
app.on('window-all-closed',()=>{});
