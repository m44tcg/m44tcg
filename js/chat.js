/* Chat privado entre anunciante e interessado.
   Carregar DEPOIS de app.js (usa: user, tab, identity, esc, toast e render globais). */
(() => {
  const q = s => document.querySelector(s);
  const S = { email: null, convs: [], active: null, msgs: [], lastId: 0, pending: null, pendingUrl: '', sending: false };
  const imgCache = new Map();
  const cur = () => S.convs.find(c => c.id === S.active) || null;

  /* ---------- API ---------- */
  let tok = { v: null, at: 0 };
  async function token() {
    if (tok.v && Date.now() - tok.at < 4 * 60e3) return tok.v; // evita renovar a sessão a cada polling
    let t = null;
    try { t = await (await identity()).refreshSession(); } catch {}
    t ||= (document.cookie.match(/(?:^|; )nf_jwt=([^;]*)/) || [])[1];
    if (t) tok = { v: decodeURIComponent(t), at: Date.now() };
    return tok.v;
  }
  async function api(path, opts = {}) {
    const headers = {};
    const t = await token();
    if (t) headers.Authorization = 'Bearer ' + t;
    if (opts.json) headers['Content-Type'] = 'application/json';
    const r = await fetch('/api/chat' + path, {
      method: opts.method || 'GET', credentials: 'same-origin', headers,
      body: opts.json ? JSON.stringify(opts.json) : opts.form,
    });
    if (opts.blob) { if (!r.ok) throw new Error('Imagem indisponível.'); return r.blob(); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Erro ao falar com o servidor.');
    return j;
  }

  /* ---------- Utilidades ---------- */
  const fmtTime = iso => {
    const d = new Date(iso), hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? hm : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + hm;
  };
  function updateBadge() {
    const n = S.convs.reduce((s, c) => s + (c.unread || 0), 0), b = q('#chat-badge');
    if (b) { b.textContent = n > 99 ? '99+' : n; b.style.display = n ? 'inline-grid' : 'none'; }
  }
  function reset(email = null) {
    S.email = email; S.convs = []; S.active = null; S.msgs = []; S.lastId = 0; clearPending(); updateBadge();
  }
  function clearPending() {
    if (S.pendingUrl) URL.revokeObjectURL(S.pendingUrl);
    S.pending = null; S.pendingUrl = '';
  }
  // Reduz a foto no navegador (máx. 1600px, JPEG) antes de enviar: economiza banda e armazenamento.
  async function shrink(file) {
    let bmp;
    try { bmp = await createImageBitmap(file); } catch { throw new Error('Não consegui ler essa imagem. Use JPG, PNG ou WebP.'); }
    const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bmp.width * sc)); cv.height = Math.max(1, Math.round(bmp.height * sc));
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height); bmp.close?.();
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Não consegui processar a imagem.');
    if (blob.size > 4 * 1024 * 1024) throw new Error('Imagem muito grande.');
    return blob;
  }
  // <img> não envia o cabeçalho Authorization, então a imagem é baixada com fetch e exibida via blob URL.
  const imgUrl = id => {
    if (!imgCache.has(id)) imgCache.set(id, api(`/messages/${id}/image`, { blob: true }).then(b => URL.createObjectURL(b)));
    return imgCache.get(id);
  };
  function hydrateImages() {
    document.querySelectorAll('#chat-msgs img[data-mid]:not([src])').forEach(img => {
      imgUrl(img.dataset.mid).then(u => { img.src = u; }, () => { img.alt = 'Imagem indisponível'; img.classList.add('opacity-40'); });
    });
  }
  function lightbox(src) {
    const o = document.createElement('div');
    o.className = 'fixed inset-0 z-[60] bg-slate-950/90 grid place-items-center p-4 cursor-zoom-out';
    o.innerHTML = `<img src="${src}" alt="Imagem ampliada" class="max-w-full max-h-full rounded-lg">`;
    const close = () => { o.remove(); removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    o.onclick = close; addEventListener('keydown', onKey); document.body.appendChild(o);
  }

  /* ---------- Desenho ---------- */
  const box = 'rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800';
  function layout() {
    const el = q('#chat'); if (!el) return;
    if (!user) { el.innerHTML = '<p class="py-16 text-center text-slate-500">Entre com sua conta para conversar com outros treinadores.</p>'; return; }
    el.innerHTML = `<div class="grid md:grid-cols-[320px_1fr] gap-3" style="height:calc(100dvh - 210px);min-height:440px">
      <aside id="chat-list" class="${S.active ? 'hidden md:block' : 'block'} ${box} overflow-y-auto" aria-label="Conversas"></aside>
      <section id="chat-pane" class="${S.active ? 'flex' : 'hidden md:flex'} ${box} flex-col overflow-hidden"></section></div>`;
    drawList(); drawPane();
  }
  function drawList() {
    const el = q('#chat-list'); if (!el) return;
    el.innerHTML = S.convs.length ? S.convs.map(c => `<button type="button" data-conv="${c.id}" class="w-full flex items-center gap-3 p-3 text-left border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 ${c.id === S.active ? 'bg-blue-50 dark:bg-slate-800' : ''}">
        <img src="${esc(c.cardImage)}" alt="" loading="lazy" class="w-10 h-14 object-contain rounded shrink-0" onerror="this.style.opacity=.15">
        <span class="min-w-0 flex-1">
          <span class="flex items-baseline justify-between gap-2"><strong class="truncate text-sm">${esc(c.peerName)}</strong><span class="text-[11px] text-slate-500 shrink-0">${fmtTime(c.lastAt)}</span></span>
          <span class="block text-xs text-slate-500 truncate">${esc(c.cardName)}</span>
          <span class="block text-xs truncate ${c.unread ? 'font-bold' : 'text-slate-500'}">${c.lastMine ? 'Você: ' : ''}${esc(c.lastPreview || 'Nova conversa')}</span>
        </span>
        ${c.unread ? `<span class="min-w-[20px] h-5 px-1.5 rounded-full bg-[#004de9] text-white text-xs font-bold grid place-items-center">${c.unread}</span>` : ''}
      </button>`).join('')
      : '<p class="p-6 text-center text-sm text-slate-500">Nenhuma conversa ainda. Na aba Trocas, clique em “Conversar” em uma oferta.</p>';
  }
  function drawPane() {
    const el = q('#chat-pane'); if (!el) return;
    const c = cur();
    if (!c) { el.innerHTML = '<div class="m-auto text-center text-sm text-slate-500 p-6">Selecione uma conversa.</div>'; return; }
    el.innerHTML = `
      <header class="flex items-center gap-3 p-3 border-b border-slate-200 dark:border-slate-800">
        <button type="button" data-chat-back class="md:hidden h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 font-bold" aria-label="Voltar às conversas">←</button>
        <img src="${esc(c.cardImage)}" alt="" class="w-9 h-12 object-contain rounded shrink-0" onerror="this.style.opacity=.15">
        <div class="min-w-0"><p class="font-bold text-sm truncate">${esc(c.peerName)}</p>
          <p class="text-xs text-slate-500 truncate">Carta: ${esc(c.cardName)}${c.offerActive ? '' : ' · anúncio removido'}</p></div>
        ${c.offerActive ? '' : '<button type="button" data-chat-del class="ml-auto shrink-0 px-3 py-1.5 rounded-lg border border-red-300 text-red-600 dark:border-red-800 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950">Excluir conversa</button>'}
      </header>
      <div id="chat-msgs" class="flex-1 overflow-y-auto p-3 space-y-2" aria-live="polite"><p class="text-center text-xs text-slate-500 py-6">Carregando mensagens…</p></div>
      <div id="chat-preview"></div>
      <form id="chat-form" class="flex items-end gap-2 p-3 border-t border-slate-200 dark:border-slate-800">
        <label class="h-10 w-10 shrink-0 grid place-items-center rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800" title="Enviar imagem" aria-label="Anexar imagem">📎
          <input id="chat-file" type="file" accept="image/*" class="hidden"></label>
        <textarea id="chat-input" rows="1" maxlength="2000" aria-label="Mensagem" placeholder="Escreva uma mensagem…" class="flex-1 max-h-32 resize-none px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#004de9]"></textarea>
        <button id="chat-send" type="submit" class="h-10 px-4 rounded-lg bg-[#004de9] text-white text-sm font-semibold disabled:opacity-40">Enviar</button>
      </form>`;
    drawMsgs(); drawPreview();
  }
  const bubble = m => `<div class="flex ${m.mine ? 'justify-end' : 'justify-start'}"><div class="max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? 'bg-[#004de9] text-white rounded-br-sm' : 'bg-slate-100 dark:bg-slate-800 rounded-bl-sm'}">
      ${m.image ? `<img data-mid="${m.id}" alt="Imagem enviada" class="rounded-lg mb-1 max-h-64 min-w-[120px] min-h-[80px] bg-black/10 cursor-zoom-in">` : ''}
      ${m.body ? `<p class="whitespace-pre-wrap break-words">${esc(m.body)}</p>` : ''}
      <span class="block text-[10px] opacity-70 text-right mt-0.5">${fmtTime(m.createdAt)}</span></div></div>`;
  function drawMsgs() {
    const el = q('#chat-msgs'); if (!el) return;
    el.innerHTML = S.msgs.length ? S.msgs.map(bubble).join('') : '<p class="text-center text-xs text-slate-500 py-6">Nenhuma mensagem ainda. Diga olá!</p>';
    el.scrollTop = el.scrollHeight; hydrateImages();
  }
  function appendMsgs(list, force) {
    const el = q('#chat-msgs'); if (!el) return;
    if (!el.querySelector('[data-mid], .flex')) el.innerHTML = '';
    const near = force || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    el.insertAdjacentHTML('beforeend', list.map(bubble).join(''));
    if (near) el.scrollTop = el.scrollHeight;
    hydrateImages();
  }
  function drawPreview() {
    const el = q('#chat-preview'); if (!el) return;
    el.innerHTML = S.pendingUrl ? `<div class="flex items-center gap-3 px-3 pt-2">
      <img src="${S.pendingUrl}" alt="Imagem a enviar" class="h-16 rounded-lg border border-slate-200 dark:border-slate-700">
      <button type="button" data-chat-unpick class="text-xs underline text-slate-500">Remover imagem</button></div>` : '';
  }

  /* ---------- Dados ---------- */
  async function refreshList() {
    if (!user) { if (S.email) reset(); return; }
    if (S.email !== user.email) reset(user.email);
    try {
      const j = await api('/conversations');
      S.convs = j.conversations;
      if (tab === 'chat' && S.active) { const c = cur(); if (c) c.unread = 0; } // a conversa aberta é marcada como lida
      updateBadge();
      if (tab === 'chat') drawList();
    } catch {}
  }
  async function loadMsgs() {
    const id = S.active; if (!id) return;
    try {
      const j = await api(`/conversations/${id}/messages`);
      if (S.active !== id) return;
      S.msgs = j.messages; S.lastId = S.msgs.length ? S.msgs[S.msgs.length - 1].id : 0;
      const c = cur(); if (c) c.unread = 0;
      updateBadge(); drawList(); drawMsgs();
    } catch (e) { toast(e.message); }
  }
  async function pollMsgs() {
    const id = S.active;
    if (!user || !id || tab !== 'chat' || document.hidden || S.sending) return;
    try {
      const j = await api(`/conversations/${id}/messages?after=${S.lastId}`);
      if (S.active !== id) return;
      const fresh = j.messages.filter(m => m.id > S.lastId);
      if (!fresh.length) return;
      S.msgs.push(...fresh); S.lastId = fresh[fresh.length - 1].id;
      appendMsgs(fresh); refreshList();
    } catch {}
  }
  async function send() {
    const c = cur(), inp = q('#chat-input'), btn = q('#chat-send');
    if (!c || !inp || S.sending) return;
    const text = inp.value.trim();
    if (!text && !S.pending) return;
    S.sending = true; btn.disabled = true;
    try {
      const fd = new FormData();
      if (text) fd.append('body', text);
      if (S.pending) fd.append('image', S.pending, 'foto.jpg');
      const { message } = await api(`/conversations/${c.id}/messages`, { method: 'POST', form: fd });
      if (S.active === c.id && message.id > S.lastId) { S.msgs.push(message); S.lastId = message.id; appendMsgs([message], true); }
      inp.value = ''; inp.style.height = ''; clearPending(); drawPreview();
      c.lastPreview = text || '📷 Imagem'; c.lastMine = true; c.lastAt = message.createdAt; drawList();
    } catch (e) { toast(e.message); }
    finally { S.sending = false; const b = q('#chat-send'); if (b) b.disabled = false; }
  }
  async function removeConv() {
    const c = cur(); if (!c || c.offerActive) return;
    if (!confirm(`Excluir esta conversa com ${c.peerName}? As mensagens e imagens serão apagadas para os dois lados. Isso não pode ser desfeito.`)) return;
    try {
      await api(`/conversations/${c.id}`, { method: 'DELETE' });
      S.convs = S.convs.filter(x => x.id !== c.id);
      S.active = null; S.msgs = []; S.lastId = 0; clearPending();
      updateBadge(); layout(); toast('Conversa excluída.');
    } catch (e) { toast(e.message); }
  }
  function select(id) { S.active = id; S.msgs = []; S.lastId = 0; clearPending(); layout(); loadMsgs(); }

  /* ---------- Eventos ---------- */
  const root = q('#chat');
  root.addEventListener('click', e => {
    const img = e.target.closest('img[data-mid]');
    if (img && img.src) return lightbox(img.src);
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.conv) select(Number(t.dataset.conv));
    else if ('chatBack' in t.dataset) { S.active = null; layout(); }
    else if ('chatDel' in t.dataset) removeConv();
    else if ('chatUnpick' in t.dataset) { clearPending(); drawPreview(); }
  });
  root.addEventListener('submit', e => { if (e.target.id === 'chat-form') { e.preventDefault(); send(); } });
  root.addEventListener('change', async e => {
    if (e.target.id !== 'chat-file') return;
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { const blob = await shrink(f); clearPending(); S.pending = blob; S.pendingUrl = URL.createObjectURL(blob); drawPreview(); }
    catch (err) { toast(err.message); }
  });
  root.addEventListener('keydown', e => {
    if (e.target.id === 'chat-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  root.addEventListener('input', e => {
    if (e.target.id === 'chat-input') { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'; }
  });

  // Polling leve: mensagens a cada 4 s com a conversa aberta; lista/contador a cada 30 s.
  setInterval(() => { if (!document.hidden && tab === 'chat') pollMsgs(); }, 4000);
  setInterval(() => { if (!document.hidden) refreshList(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshList(); pollMsgs(); } });

  /* ---------- API pública (usada pelo app.js) ---------- */
  window.M44Chat = {
    render() { layout(); if (user) { refreshList(); if (S.active) loadMsgs(); } },
    refresh: refreshList,
    async open(offerId) {
      if (!user) { toast('Entre com sua conta para conversar.'); return; }
      try {
        const { conversation } = await api('/conversations', { method: 'POST', json: { offerId: Number(offerId) } });
        if (S.email !== user.email) reset(user.email);
        const i = S.convs.findIndex(c => c.id === conversation.id);
        if (i >= 0) S.convs[i] = { ...S.convs[i], ...conversation, unread: S.convs[i].unread }; else S.convs.unshift(conversation);
        S.active = conversation.id; S.msgs = []; S.lastId = 0;
        tab = 'chat'; window.render();
      } catch (e) { toast(e.message); }
    },
  };
})();
