'use strict';
// A shared, credential-free view for our desktop window and action panel.
window.GptQuotaView = {
  create({read, close, onLayout = () => {}}) {
    const make = (tag, cls, text) => {
      const el = document.createElement(tag); el.className = cls;
      if (text !== undefined) el.textContent = text;
      return el;
    };
    const el = make('section', 'gpt-quota');
    el.setAttribute('aria-label', 'Codex 剩余额度');
    el.setAttribute('role', 'dialog');
    const header = make('header', 'gpt-quota-header');
    const title = make('div', 'gpt-quota-title', 'Codex 剩余额度');
    const tools = make('div', 'gpt-quota-tools');
    const refresh = make('button', '', '↻'); refresh.title = '刷新额度'; refresh.setAttribute('aria-label', '刷新额度');
    const dismiss = make('button', '', '×'); dismiss.title = '收起'; dismiss.setAttribute('aria-label', '收起额度');
    tools.append(refresh, dismiss); header.append(title, tools);
    const content = make('div', 'gpt-quota-content'); content.setAttribute('aria-live', 'polite');
    el.append(header, content);
    let disposed = false, pending;
    function layout() { requestAnimationFrame(() => { if (!disposed) onLayout(el); }); }
    function render(data) {
      content.replaceChildren();
      if (!data?.available) {
        content.append(make('p', 'gpt-quota-message', data?.error || '暂时无法读取额度，请确认 Codex 已登录。'));
        el.dataset.available = 'false'; layout(); return;
      }
      el.dataset.available = 'true';
      for (const bucket of data.buckets) {
        if (data.buckets.length > 1) content.append(make('p', 'gpt-quota-bucket', bucket.name));
        for (const win of bucket.windows) {
          const row = make('div', 'gpt-quota-window'); row.dataset.window = win.id;
          const labels = make('div', 'gpt-quota-labels');
          labels.append(make('span', '', win.label), make('strong', 'gpt-quota-percent', win.remainingPercent + '%'));
          const track = make('div', 'gpt-quota-track');
          const fill = make('i', win.remainingPercent <= 15 ? 'low' : ''); fill.style.width = win.remainingPercent + '%';
          track.append(fill);
          row.append(labels, track, make('p', 'gpt-quota-reset', win.resetText ? win.resetText + ' 重置' : '重置时间暂未返回'));
          content.append(row);
        }
      }
      const at = new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(data.fetchedAt));
      content.append(make('p', 'gpt-quota-note', '查询于 ' + at + ' · 北京时间'));
      layout();
    }
    async function load(force = false) {
      if (pending) return pending;
      refresh.disabled = true; el.dataset.available = 'loading';
      content.replaceChildren(make('p', 'gpt-quota-message', '正在读取当前账户额度…')); layout();
      pending = (async () => {
        try { const data = await read(force); if (!disposed) render(data); return data; }
        catch (error) { const data = {available:false,error:error.message}; if (!disposed) render(data); return data; }
        finally { pending = null; if (!disposed) refresh.disabled = false; }
      })();
      return pending;
    }
    refresh.addEventListener('click', () => load(true)); dismiss.addEventListener('click', close);
    return {el, load, destroy() {disposed = true; el.remove();}};
  }
};
