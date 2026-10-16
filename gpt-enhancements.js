'use strict';
(() => {
  const proto = PetSprite.prototype;
  const oldBusy = proto.inputBusy;
  proto.inputBusy = function() { return !!this.gptQuota || oldBusy.call(this); };
  const oldMouse = proto.onMouseMove;
  proto.onMouseMove = function(event) {
    if (this.gptQuota && !this.dragState.active) {
      this.syncInputRegions(); this.setInteractive(true); this.setTip(false); return;
    }
    oldMouse.call(this, event);
  };
  const oldEnded = proto.handleEnded;
  proto.handleEnded = function() {
    if (this.gptQuota) {
      if (this.gptQuotaGreeting) {
        this.gptQuotaGreeting = false;
        this.anim = '抬头看气泡'; this.once = false; this.switchTo(this.anim, false);
      }
      return;
    }
    oldEnded.call(this);
  };
  const oldDown = proto.onPointerDown;
  proto.onPointerDown = function(event) {
    this.gptQuotaDismissedByPress = !!this.gptQuota;
    if (this.gptQuota) this.closeGptQuota();
    oldDown.call(this, event);
  };
  proto.closeGptQuota = function(resume = true) {
    if (!this.gptQuota) return;
    const card = this.gptQuota; this.gptQuota = null;
    this.gptQuotaGreeting = false;
    clearTimeout(this.gptQuotaTimer); this.gptQuotaEvents?.abort();
    card.destroy(); this.syncInputBusy();
    if (!this.inputBusy()) this.setInteractive(false);
    window.__dshPetDebug.quotaOpen = false;
    if (resume) this.playOnce('安静陪着你');
  };
  proto.showGptQuota = function() {
    if (this.gptQuota) {this.closeGptQuota(); return;}
    this.cancelGptRest?.(); this.closeGptEmote?.(false);
    this.stopThrow(); this.stopMove(); this.closeMenu(); this.setTip(false);
    const place = el => {
      const clamp = this.visibleClampRect() || {x:0,y:0,w:innerWidth,h:innerHeight};
      const hit = this.hit.getBoundingClientRect();
      el.style.maxWidth = Math.max(180, clamp.w - 16) + 'px';
      el.style.maxHeight = Math.max(100, clamp.h - 16) + 'px';
      const width = el.offsetWidth, height = el.offsetHeight;
      const x = Math.max(clamp.x+8, Math.min(clamp.x+clamp.w-width-8, hit.x+hit.width/2-width/2));
      // Above the pet whenever there is room; the monitor intersection clamps edges.
      const y = Math.max(clamp.y+8, Math.min(clamp.y+clamp.h-height-8, hit.y-height-10));
      el.style.left = x + 'px'; el.style.top = y + 'px'; this.syncInputRegions();
    };
    const card = window.GptQuotaView.create({
      read: async force => {
        if (force) {
          this.gptQuotaGreeting = true; this.facing = 'left'; this.pendingSquash = true;
          this.playOnce('本小姐的坏笑');
        }
        clearTimeout(this.gptQuotaTimer);
        this.gptQuotaTimer = setTimeout(() => this.closeGptQuota(), 45000);
        const value = await window.petBridge.readQuota(!!force);
        if (this.gptQuota === card) {
          clearTimeout(this.gptQuotaTimer);
          this.gptQuotaTimer = setTimeout(() => this.closeGptQuota(), 18000);
        }
        return value;
      }, close: () => this.closeGptQuota(), onLayout: place,
    });
    const voice=document.createElement('p');voice.className='gpt-quota-voice';voice.textContent='本小姐可不便宜';
    card.el.prepend(voice);
    this.gptQuota = card; document.body.append(card.el); place(card.el);
    this.gptQuotaGreeting = true;
    this.facing = 'left'; this.pendingSquash = true;
    this.playOnce('本小姐的坏笑');
    this.gptQuotaEvents = new AbortController();
    const signal = this.gptQuotaEvents.signal;
    document.addEventListener('keydown', event => {if (event.key === 'Escape') this.closeGptQuota();}, {signal});
    document.addEventListener('pointerdown', event => {
      if (!card.el.contains(event.target) && !this.hit.contains(event.target)) this.closeGptQuota();
    }, {signal});
    this.setInteractive(true); this.syncInputBusy();
    window.__dshPetDebug.quotaOpen = true;
    card.load();
  };
  proto.onClick = function() {
    if (this.dragState.active || this.dragState.dragging || this.justDragged) return;
    this.pressScoreFired = false;
    if (this.gptQuotaDismissedByPress) {this.gptQuotaDismissedByPress = false; return;}
    this.showGptQuota();
  };
  const oldMenu = proto.onMenuAction;
  proto.onMenuAction = function(leaf) {
    if (leaf?.action === 'gpt-quota') {this.closeMenu(); this.showGptQuota(); return;}
    if (this.gptQuota) this.closeGptQuota();
    oldMenu.call(this, leaf);
  };
  const oldDispose = proto.dispose;
  proto.dispose = function() {this.closeGptQuota(false);oldDispose.call(this);};
})();
