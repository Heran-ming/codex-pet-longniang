// QA only: inspect our own Electron renderer, without accessing other apps.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.GPT_PET_QA_DIR;
fs.mkdirSync(out,{recursive:true});
app.on('browser-window-created',(_event,win)=>{
  const errors=[];
  win.webContents.on('console-message',(_event,level,message)=>{
    if(level>=2) errors.push(message);
  });
  win.webContents.once('did-finish-load',()=>{
    setTimeout(async()=>{
      try{
        const result=await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'qa-native-renderer.js'),'utf8'));
        fs.writeFileSync(path.join(out,'desktop-quota.png'),(await win.webContents.capturePage()).toPNG());
        result.emotes=await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'qa-emote-renderer.js'),'utf8'));
        result.consoleErrors=errors;
        result.windowVisible=win.isVisible();
        result.backgroundColor=win.getBackgroundColor();
        result.alwaysOnTop=win.isAlwaysOnTop();
        result.bounds=win.getBounds();
        const capture=await win.webContents.capturePage();
        const pixels=capture.toBitmap();
        let alphaMin=255,alphaMax=0;
        for(let index=3;index<pixels.length;index+=4){alphaMin=Math.min(alphaMin,pixels[index]);alphaMax=Math.max(alphaMax,pixels[index]);}
        result.captureAlpha=[alphaMin,alphaMax];
        fs.writeFileSync(path.join(out,'helper-qa.json'),JSON.stringify(result,null,2));
        fs.writeFileSync(path.join(out,'desktop-pet.png'),capture.toPNG());
      }catch(error){fs.writeFileSync(path.join(out,'helper-failed.txt'),error.stack||String(error));}
    },6500);
  });
});
