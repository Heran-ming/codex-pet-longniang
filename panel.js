'use strict';
window.gptPanelErrors=[];
window.addEventListener('error',event=>window.gptPanelErrors.push(event.message));
window.addEventListener('unhandledrejection',event=>window.gptPanelErrors.push(String(event.reason)));
const $=id=>document.getElementById(id);
let catalog, selected, category='全部', ready=false, noticeTimer;
// Paint decoded frames into an alpha canvas. Windows' video overlay can be
// absent from an Electron capture, even while the video clock is advancing.
const heroContext=$('hero-canvas').getContext('2d');
function paintHero(){
  const video=$('hero-video');
  if(video.readyState<2||!video.videoWidth)return;
  const canvas=$('hero-canvas');
  heroContext.imageSmoothingQuality='high';
  heroContext.clearRect(0,0,canvas.width,canvas.height);
  heroContext.drawImage(video,0,0,canvas.width,canvas.height);
}
for(const event of ['loadeddata','seeked','timeupdate'])$('hero-video').addEventListener(event,paintHero);
if('requestVideoFrameCallback' in $('hero-video')){
  const nextFrame=()=>{paintHero();$('hero-video').requestVideoFrameCallback(nextFrame);};
  $('hero-video').requestVideoFrameCallback(nextFrame);
}else setInterval(paintHero,100);
function notice(text,error=false){$('notice').textContent=text;$('notice').className='notice visible'+(error?' error':'');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').className='notice',3200);}
async function api(route,body){
  const response=await fetch('/api/'+route,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
  const value=await response.json();
  if(!response.ok||value.error)throw Error(value.error||'暂时没能完成，再试一下');
  return value;
}
function media(action){return '/media/'+encodeURIComponent(action.name);}
async function choose(action,send=true){
  selected=action;
  $('hero-video').src=media(action);
  $('action-title').textContent=action.name;
  $('action-category').textContent=action.category;
  $('action-description').textContent=action.description;
  $('hero-video').play().catch(error=>notice(error.message,true));
  document.querySelectorAll('.action-card').forEach(card=>card.classList.toggle('active',card.dataset.action===action.id));
  if(send){
    try{await api('play',{name:action.name});notice('她正在桌面上「'+action.name+'」');}
    catch(error){notice(error.message,true);}
  }
}
function filter(){
  const query=$('search').value.trim().toLowerCase();let count=0;
  document.querySelectorAll('.action-card').forEach(card=>{
    const action=catalog.actions.find(item=>item.id===card.dataset.action);
    const match=(category==='全部'||category===action.category)&&
      (action.name+' '+action.description+' '+action.category).toLowerCase().includes(query);
    card.hidden=!match;if(match)count++;
  });
  $('empty').hidden=count>0;
}
function render(){
  $('total-count').textContent=catalog.count;
  $('new-count').textContent=catalog.newActions;
  const groups=['全部',...new Set(catalog.actions.map(action=>action.category))];
  for(const group of groups){
    const button=document.createElement('button');button.type='button';button.dataset.category=group;
    button.classList.toggle('selected',group===category);
    const count=group==='全部'?catalog.count:catalog.actions.filter(action=>action.category===group).length;
    button.textContent=group;
    const badge=document.createElement('span');badge.textContent=count;button.append(badge);
    button.addEventListener('click',()=>{category=group;document.querySelectorAll('.category-bar button').forEach(item=>item.classList.toggle('selected',item===button));filter();});
    $('categories').append(button);
  }
  for(const action of catalog.actions){
    const card=document.createElement('button');card.type='button';card.className='action-card';card.dataset.action=action.id;card.title=action.description;
    const thumb=document.createElement('div');thumb.className='thumb';
    const image=document.createElement('img');image.src=action.preview;image.alt=action.name;image.loading='lazy';thumb.append(image);
    if(action.source.startsWith('imagegen')){
      const badge=document.createElement('span');badge.className='new-badge';badge.textContent='新动作';thumb.append(badge);
    }
    const info=document.createElement('div');info.className='action-info';
    const title=document.createElement('strong');title.textContent=action.name;
    const label=document.createElement('small');label.textContent=action.category+' · 点一下就表演';
    info.append(title,label);card.append(thumb,info);
    const icon=document.createElement('span');icon.className='play-icon';icon.textContent='↗';card.append(icon);
    card.addEventListener('click',()=>choose(action));
    card.addEventListener('mouseenter',()=>{
      if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      let video=thumb.querySelector('video');
      if(!video){video=document.createElement('video');video.muted=true;video.loop=true;video.playsInline=true;video.src=media(action);thumb.append(video);thumb.classList.add('has-video');}
      video.play().catch(()=>{});
    });
    card.addEventListener('mouseleave',()=>{const video=thumb.querySelector('video');if(video)video.pause();});
    $('actions').append(card);
  }
}
async function refreshStatus(){
  try{
    const status=await api('status');ready=status.ready;
    $('status-dot').classList.toggle('ready',ready);
    $('status-text').textContent=ready?'她正在桌面上陪你':'正在醒来…';
    $('play-selected').disabled=!ready;
    if(!document.activeElement.closest('.settings')){
      $('size').value=status.preferences.size;$('size-value').value=status.preferences.size;
      $('roam').checked=status.preferences.roam;$('autoplay').checked=status.preferences.autoplay;
      $('bubbles').checked=status.preferences.bubbles!==false;
    }
  }catch{$('status-dot').className='';$('status-text').textContent='桌宠已休息';ready=false;}
}
$('search').addEventListener('input',filter);
let quotaCard;
function hideQuota(){quotaCard?.destroy();quotaCard=null;}
$('show-quota').addEventListener('click',async()=>{
  try{await api('interaction',{kind:'quota'});notice('她帮你看看额度');}catch(error){notice(error.message,true);}
});
$('show-emote').addEventListener('click',async()=>{
  try{await api('interaction',{kind:'emote'});notice('她有一点小心思要告诉你');}catch(error){notice(error.message,true);}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')hideQuota();});
$('size').addEventListener('input',()=>$('size-value').value=$('size').value);
$('play-selected').addEventListener('click',()=>{if(selected)choose(selected);});
$('save-settings').addEventListener('click',async()=>{
  $('save-settings').disabled=true;
  try{await api('settings',{size:Number($('size').value),roam:$('roam').checked,autoplay:$('autoplay').checked,bubbles:$('bubbles').checked});notice('保存好了，她会按新的方式陪你');}
  catch(error){notice(error.message,true);}
  finally{$('save-settings').disabled=false;}
});
$('quit').addEventListener('click',async()=>{try{await api('quit',{});}catch(error){notice(error.message,true);}});
window.gptPanelReady=(async()=>{
  catalog=await (await fetch('/catalog.json')).json();
  render();await choose(catalog.actions.find(action=>action.id==='tea'),false);
  await refreshStatus();setInterval(refreshStatus,4000);
})().catch(error=>{notice(error.message,true);throw error;});
