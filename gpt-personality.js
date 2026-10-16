'use strict';
(() => {
  const proto=PetSprite.prototype;
  const jitter=range=>range[0]*1000+Math.random()*(range[1]-range[0])*1000;
  const oldBusy=proto.inputBusy;
  proto.inputBusy=function(){return !!this.gptEmote||oldBusy.call(this);};
  const oldMouse=proto.onMouseMove;
  proto.onMouseMove=function(event){
    if(this.gptEmote&&!this.dragState.active){this.syncInputRegions();this.setInteractive(true);this.setTip(false);return;}
    oldMouse.call(this,event);
  };
  proto.cancelGptRest=function(){clearTimeout(this.gptRestTimer);this.gptResting=false;};
  const oldOnce=proto.playOnce;
  proto.playOnce=function(name){this.cancelGptRest();oldOnce.call(this,name);};
  proto.gptCanEmote=function(){
    return !!this.gptPersonality&&!this.gptDisposed&&!this.gptQuota&&!this.gptEmote&&!this.dragState.active&&!this.justDragged&&!this.menuOpen&&!this.chatOpen&&this.throwRef===null&&this.moveRef===null&&!this.pendingMove;
  };
  proto.closeGptEmote=function(resume=true){
    if(!this.gptEmote)return;
    clearTimeout(this.gptEmoteTimer);this.gptEmoteEvents?.abort();this.gptEmote.remove();this.gptEmote=null;
    this.gptEmoteRequested=false;
    this.gptNextEmoteAt=Date.now()+jitter(this.gptPersonality?.personality.nextDelaySeconds||[35,70]);
    this.syncInputBusy();if(!this.inputBusy())this.setInteractive(false);
    window.__dshPetDebug.emoteOpen=false;
    if(resume&&!this.gptDisposed)this.playIdle();
  };
  proto.showGptEmote=function(force=false,selectedId){
    if(force){this.closeGptQuota(false);this.closeGptEmote(false);this.stopMove();this.stopThrow();}
    if(!this.gptCanEmote())return false;
    const data=this.gptPersonality,all=data.personality.emotes;
    const choices=all.filter(item=>item.id!==this.gptLastEmoteId);
    const emote=selectedId?all.find(item=>item.id===selectedId):choices[Math.floor(Math.random()*choices.length)];
    if(!emote)return false;
    this.cancelGptRest();this.stopMove();this.stopThrow();this.setTip(false);
    const el=document.createElement('aside');el.className='gpt-emote';el.dataset.mood=emote.mood;el.dataset.emote=emote.id;
    el.setAttribute('role','status');el.setAttribute('aria-live','polite');
    const close=document.createElement('button');close.className='gpt-emote-close';close.textContent='×';close.setAttribute('aria-label','收起表情');
    close.addEventListener('click',()=>this.closeGptEmote());
    const img=document.createElement('img');img.src=data.assetBase+emote.id+'.png';img.alt=emote.name;img.draggable=false;
    const line=document.createElement('p');line.textContent=emote.lines[Math.floor(Math.random()*emote.lines.length)];
    el.append(close,img,line);document.body.append(el);this.gptEmote=el;this.gptLastEmoteId=emote.id;this.gptEmoteRequested=false;
    const place=()=>{
      if(this.gptEmote!==el)return;
      const clamp=this.visibleClampRect()||{x:0,y:0,w:innerWidth,h:innerHeight};const body=this.hit.getBoundingClientRect();
      el.style.maxWidth=Math.max(160,clamp.w-16)+'px';
      const x=Math.max(clamp.x+8,Math.min(clamp.x+clamp.w-el.offsetWidth-8,body.x+body.width/2-el.offsetWidth/2));
      const y=Math.max(clamp.y+8,Math.min(clamp.y+clamp.h-el.offsetHeight-8,body.y-el.offsetHeight-16));
      el.style.left=x+'px';el.style.top=y+'px';this.syncInputRegions();
    };
    img.addEventListener('load',place);img.addEventListener('error',()=>{el.dataset.imageError='true';});place();
    this.facing='left';this.anim='抬头看气泡';this.once=false;this.switchTo(this.anim,false);
    this.setInteractive(true);this.syncInputBusy();
    window.__dshPetDebug.emoteOpen=true;window.__dshPetDebug.lastEmote={id:emote.id,line:line.textContent,at:Date.now(),automatic:!force};
    this.gptEmoteEvents=new AbortController();const signal=this.gptEmoteEvents.signal;
    document.addEventListener('keydown',event=>{if(event.key==='Escape')this.closeGptEmote();},{signal});
    this.gptEmoteTimer=setTimeout(()=>this.closeGptEmote(),data.personality.visibleSeconds*1000);
    return true;
  };
  proto.startGptAmbient=function(){
    if(this.gptAmbientTimer)return;
    this.gptLastUserAt=Date.now();this.gptNextEmoteAt=Infinity;
    const tick=async()=>{
      if(this.gptDisposed||this.gptAmbientReading)return;
      this.gptAmbientReading=true;
      try{
        const data=await window.petBridge.readCompanion();if(!data||this.gptDisposed)return;
        const first=!this.gptPersonality;this.gptPersonality=data;
        if(first){this.gptNextEmoteAt=Date.now()+jitter(data.personality.firstDelaySeconds);this.gptCommandSeq=data.interaction.seq;}
        if(data.interaction.seq>this.gptCommandSeq){
          this.gptCommandSeq=data.interaction.seq;
          if(data.interaction.kind==='quota')this.showGptQuota();
          else this.showGptEmote(true);
        }
        if(!data.preferences.bubbles)return;
        if(Date.now()>=this.gptNextEmoteAt&&Date.now()-this.gptLastUserAt>10000)this.gptEmoteRequested=true;
        if(this.gptEmoteRequested&&this.gptCanEmote()&&(this.gptResting||this.anim==='安静陪着你'))this.showGptEmote();
      }finally{this.gptAmbientReading=false;}
    };
    this.gptAmbientTimer=setInterval(()=>tick().catch(()=>{}),2000);tick().catch(()=>{});
  };
  const oldIdle=proto.playIdle;
  proto.playIdle=function(){
    this.startGptAmbient();this.cancelGptRest();
    if(this.gptQuota||this.gptEmote||this.gptDisposed)return;
    if(this.gptEmoteRequested&&this.gptCanEmote()){this.showGptEmote();return;}
    this.gptResting=true;this.anim='安静陪着你';this.once=false;this.switchTo(this.anim,false);
    this.gptRestTimer=setTimeout(()=>{
      this.gptResting=false;
      if(this.gptDisposed||this.gptQuota||this.gptEmote||this.dragState.active||this.menuOpen)return;
      if(this.gptEmoteRequested&&this.gptCanEmote())this.showGptEmote();else oldIdle.call(this);
    },4500+Math.random()*3500);
  };
  const oldEnded=proto.handleEnded;
  proto.handleEnded=function(){
    if(this.gptEmote)return;
    if(this.gptEmoteRequested&&this.gptCanEmote()){this.showGptEmote();return;}
    oldEnded.call(this);
  };
  const oldDown=proto.onPointerDown;
  proto.onPointerDown=function(event){
    this.gptLastUserAt=Date.now();this.gptEmoteRequested=false;this.cancelGptRest();this.closeGptEmote(false);oldDown.call(this,event);
  };
  const oldContext=proto.onContextMenu;
  proto.onContextMenu=function(event){
    this.gptLastUserAt=Date.now();this.gptEmoteRequested=false;this.cancelGptRest();this.closeGptEmote(false);this.closeGptQuota(false);oldContext.call(this,event);
  };
  const oldMenu=proto.onMenuAction;
  proto.onMenuAction=function(leaf){
    if(leaf?.action==='gpt-emote'){this.closeMenu();this.showGptEmote(true);return;}
    this.closeGptEmote(false);oldMenu.call(this,leaf);
  };
  const oldDispose=proto.dispose;
  proto.dispose=function(){
    this.gptDisposed=true;clearInterval(this.gptAmbientTimer);this.cancelGptRest();this.closeGptEmote(false);oldDispose.call(this);
  };
})();
