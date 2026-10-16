(async()=>{
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const waitFor=async(fn,timeout=8000)=>{const start=Date.now();while(!fn()){if(Date.now()-start>timeout)throw Error('Emote QA condition timed out');await sleep(60);}};
  const s=sprites[0],out={stickers:[]};
  await waitFor(()=>s.gptPersonality);
  for(const item of s.gptPersonality.personality.emotes){
    if(!s.showGptEmote(true,item.id))throw Error('Unable to show emote '+item.id);
    await waitFor(()=>s.gptEmote?.querySelector('img')?.complete&&s.gptEmote?.querySelector('img')?.naturalWidth>0);
    await waitFor(()=>decodeURIComponent(document.querySelector('video.is-front')?.currentSrc||'').includes('抬头看气泡'));
    const el=s.gptEmote,rect=el.getBoundingClientRect(),clamp=s.visibleClampRect();
    const text=el.querySelector('p').textContent;
    out.stickers.push({id:item.id,loaded:el.querySelector('img').naturalWidth>0,line:text,short:text.length<=8,looksUp:s.anim==='抬头看气泡',fits:rect.x>=clamp.x&&rect.y>=clamp.y&&rect.right<=clamp.x+clamp.w&&rect.bottom<=clamp.y+clamp.h});
    s.closeGptEmote(false);await sleep(100);
  }
  s.gptNextEmoteAt=Date.now()-100;s.gptLastUserAt=0;s.gptEmoteRequested=false;s.playIdle();
  await waitFor(()=>!!s.gptEmote);
  out.automatic=s.gptEmote!==null&&window.__dshPetDebug.lastEmote.automatic;
  out.autoLine=s.gptEmote.querySelector('p').textContent;
  const firstId=window.__dshPetDebug.lastEmote.id;
  await sleep(9000);out.autoCloses=!s.gptEmote;out.restAfterBubble=!!s.gptResting;
  s.gptNextEmoteAt=Date.now()-100;s.gptLastUserAt=0;s.gptEmoteRequested=true;s.playIdle();
  await waitFor(()=>!!s.gptEmote);out.noImmediateRepeat=window.__dshPetDebug.lastEmote.id!==firstId;
  s.closeGptEmote(false);s.showGptEmote(true,'cute');
  await waitFor(()=>s.gptEmote?.querySelector('img')?.complete&&s.gptEmote?.querySelector('img')?.naturalWidth>0);
  await sleep(800);
  return out;
})()
