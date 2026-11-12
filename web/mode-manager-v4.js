(function () {
  'use strict';
  const originalFetch = window.fetch.bind(window);
  const mode = location.pathname.includes('h3-image') ? 'image' : 'video';
  const labels = { video: 'VIDEO H3', image: 'H3 IMAGE' };
  let badge;

  function ensureBadge() {
    if (badge) return badge;
    badge = document.createElement('span');
    badge.id = 'kendo-mode-state';
    badge.style.cssText = 'display:inline-flex;align-items:center;gap:.4rem;border:1px solid #30303a;border-radius:999px;padding:.35rem .65rem;font:600 11px/1 system-ui;color:inherit;white-space:nowrap';
    const header = document.querySelector('header');
    const nav = header?.querySelector('nav');
    if (header) header.insertBefore(badge, nav || null);
    return badge;
  }

  function show(text, busy = false) {
    const el = ensureBadge();
    el.textContent = `${busy ? '● ' : ''}${text}`;
    el.style.borderColor = busy ? '#e31545' : '#30303a';
  }

  function notice(text) {
    const target = document.querySelector(mode === 'image' ? '#image-notice' : '#notice');
    if (target) target.textContent = text;
  }

  async function refresh() {
    try {
      const response = await originalFetch('/api/kendo/mode', { cache: 'no-store' });
      const state = await response.json();
      if (state.switching) show('กำลังเคลียร์ VRAM', true);
      else if (state.active_mode === mode) show(`${labels[mode]} READY`);
      else if (state.active_mode) show(`${labels[state.active_mode]} LOADED`);
      else show(`${labels[mode]} STANDBY`);
    } catch {
      show(`${labels[mode]} STANDBY`);
    }
  }

  window.fetch = async function (input, init) {
    const raw = typeof input === 'string' ? input : input?.url || '';
    const url = new URL(raw, location.href);
    if (url.origin === location.origin && url.pathname === '/api/comfy/prompt' && (init?.method || 'GET').toUpperCase() === 'POST') {
      let payload;
      try { payload = JSON.parse(init?.body || '{}'); }
      catch { return originalFetch(input, init); }
      show(`กำลังเตรียม ${labels[mode]} · เคลียร์ VRAM เมื่อจำเป็น`, true);
      notice('กำลังตรวจคิวและเตรียมหน่วยความจำสำหรับโหมดนี้…');
      const response = await originalFetch('/api/kendo/prompt', {
        ...init,
        headers: { ...(init?.headers || {}), 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, ...payload })
      });
      void refresh();
      return response;
    }
    return originalFetch(input, init);
  };

  addEventListener('DOMContentLoaded', () => { ensureBadge(); void refresh(); });
  setInterval(refresh, 5000);
})();
