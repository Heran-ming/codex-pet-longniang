(async()=>{
  await window.gptPanelReady;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const out={cards:document.querySelectorAll('.action-card').length,overflow:document.documentElement.scrollWidth>innerWidth};
  document.querySelector('[data-category="亲昵"]').click();
  out.affectionCards=document.querySelectorAll('.action-card:not([hidden])').length;
  document.getElementById('search').value='喝茶';document.getElementById('search').dispatchEvent(new Event('input'));
  out.searchWithinCategory=document.querySelectorAll('.action-card:not([hidden])').length;
  document.querySelector('[data-category="全部"]').click();
  out.searchCards=document.querySelectorAll('.action-card:not([hidden])').length;
  document.getElementById('search').value='';document.getElementById('search').dispatchEvent(new Event('input'));
  await choose(catalog.actions.find(item=>item.id==='heart'),false);await sleep(1800);
  const v=document.getElementById('hero-video'),c=document.getElementById('hero-canvas');
  out.playedTitle=document.getElementById('action-title').textContent;
  out.video={readyState:v.readyState,width:v.videoWidth,height:v.videoHeight,time:v.currentTime,error:v.error?.message||null};
  out.canvas={width:c.width,height:c.height,visiblePixels:Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data).filter((a,i)=>i%4===3&&a>30).length};
  out.hasQuotaButton=!!document.getElementById('show-quota');
  out.hasEmoteButton=!!document.getElementById('show-emote');
  out.bubblesDefaultOn=document.getElementById('bubbles').checked;
  out.uiErrors=window.gptPanelErrors||[];
  await sleep(250);
  return out;
})()
