(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (condition, timeout=45000) => {
    const start=Date.now(); while(!condition()) {if(Date.now()-start>timeout)throw Error('QA condition timed out');await sleep(60);}
  };
  const s=sprites[0];s.stopMove();s.stopThrow();s.playOnce('安静陪着你');await sleep(650);
  const v=()=>document.querySelector('video.is-front');
  const first=v(), initialTime=first?.currentTime;
  let presented=0,tracking=true;
  const track=()=>{presented++;if(tracking)first.requestVideoFrameCallback(track);};
  first.requestVideoFrameCallback(track);
  await sleep(1000);tracking=false;
  const out={sprites:document.querySelectorAll('.pet-sprite').length,
    errorVisible:document.getElementById('pet-error')?.classList.contains('visible')||false,
    video:{width:v()?.videoWidth,height:v()?.videoHeight,readyState:v()?.readyState,
      error:v()?.error?.message||null,timeAdvances:v()===first&&v()?.currentTime>initialTime,presentedFramesInOneSecond:presented}};
  const hit=document.querySelector('.pet-hit'), d=window.__dshPetDebug;
  s.stopMove();s.stopThrow();
  const hitMouse=type=>{
    const r=hit.getBoundingClientRect();
    hit.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
  };
  hitMouse('contextmenu'); await sleep(100);
  out.menuText=document.body.innerText;
  out.hasActionPanel=out.menuText.includes('动作面板');
  out.hasQuotaMenu=out.menuText.includes('查看 Codex 额度');
  out.hasUnsupportedChat=out.menuText.includes('碎碎念')||out.menuText.includes('对话');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  const r=d.hitRect,m=d.winMargin,x=m.l+r.x+r.w/2,y=m.t+r.y+r.h/2;
  window.dispatchEvent(new MouseEvent('mousemove',{clientX:x,clientY:y,screenX:x,screenY:y}));
  const inside=d.interactive===true;
  window.dispatchEvent(new MouseEvent('mousemove',{clientX:0,clientY:0,screenX:0,screenY:0}));
  out.clickThrough={inside,outside:d.interactive===false};
  hit.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:x,clientY:y,screenX:500,screenY:400,pointerId:91}));
  hit.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:x+45,clientY:y+20,screenX:545,screenY:420,pointerId:91}));
  await sleep(600);const during=d.dragPos?{...d.dragPos}:null;
  window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:x+45,clientY:y+20,screenX:545,screenY:420,pointerId:91}));
  await sleep(400);out.gentleDrag={during,released:d.lastDragRelease||null};
  out.quotaAfterDrag=!!document.querySelector('.gpt-quota');
  s.playOnce('慢慢喝茶');await sleep(650);
  const old=v();s.playOnce('送你一颗心');await waitFor(()=>v()!==old,5000);await sleep(150);
  out.transition={duration:getComputedStyle(v()).transitionDuration,
    frontOpacity:Number(getComputedStyle(v()).opacity),oldOpacity:Number(getComputedStyle(old).opacity),
    oldStillPlaying:!old.paused,newPlaying:!v().paused};
  await sleep(450);out.transition.oldPausedAfterFade=old.paused;
  // Simulate the actual press/release/click route, including the drag guards.
  const clickPet=()=>{
    const b=hit.getBoundingClientRect();const ev={bubbles:true,clientX:b.x+b.width/2,clientY:b.y+b.height/2,screenX:600,screenY:500,pointerId:92};
    hit.dispatchEvent(new PointerEvent('pointerdown',ev));window.dispatchEvent(new PointerEvent('pointerup',ev));hitMouse('click');
  };
  clickPet(); await waitFor(()=>decodeURIComponent(v()?.currentSrc||'').includes('本小姐的坏笑'),5000);
  out.quotaGreeting=true;
  await waitFor(()=>document.querySelector('.gpt-quota')?.dataset.available==='true');
  const card=document.querySelector('.gpt-quota');
  out.quota={available:card.dataset.available,windows:[...card.querySelectorAll('.gpt-quota-window')].map(row=>({id:row.dataset.window,text:row.innerText})),
    text:card.innerText,clamp:s.visibleClampRect(),bounds:{x:card.offsetLeft,y:card.offsetTop,w:card.offsetWidth,h:card.offsetHeight}};
  await waitFor(()=>!s.gptQuotaGreeting,12000);
  await waitFor(()=>decodeURIComponent(v()?.currentSrc||'').includes('抬头看气泡'),5000);
  out.quotaLooksUpAfterSmirk=v().loop&&!s.once;
  out.quotaVoice=card.querySelector('.gpt-quota-voice')?.textContent;
  card.querySelector('[aria-label="刷新额度"]').click();
  await waitFor(()=>decodeURIComponent(v()?.currentSrc||'').includes('本小姐的坏笑'),5000);
  out.refreshGreetsAgain=true;
  await waitFor(()=>card.dataset.available==='true');
  clickPet();out.quotaClosesOnSecondClick=!document.querySelector('.gpt-quota');
  await sleep(600);const resumed=v(),resumedTime=resumed.currentTime;await sleep(400);
  out.playbackAfterQuotaClose=v()===resumed&&v().currentTime>resumedTime;
  clickPet();await waitFor(()=>document.querySelector('.gpt-quota')?.dataset.available==='true');
  out.quotaReopens=!!document.querySelector('.gpt-quota');
  await sleep(1900);
  return out;
})()
