/* M44 TCG — Minha Coleção: buscar um Pokémon pelo nome e ver TODAS as cartas dele
   em todas as expansões e promos já lançadas (dados: api.pokemontcg.io).
   Cada carta tem os botões "Procuro" e "Vendo/Troco", que enviam para o Meu Catálogo. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const form = $('#pk-form'), input = $('#pk-q');
  if (!form || !input) return;

  const API = 'https://api.pokemontcg.io/v2/cards';
  const MAX_PAGES = 4;                       // até 1000 cartas por busca
  const cache = new Map();                   // termo -> cartas
  let cards = [], filter = 'all', ctrl = null;

  const isPromo = s => /promo|black star/i.test((s.name || '') + ' ' + (s.series || ''));
  const toast = msg => { const t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400); };

  // ---------- modal (criado uma vez) ----------
  const modal = document.createElement('div');
  modal.id = 'pk-modal';
  modal.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/70 p-3 sm:p-6';
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'pk-title');
  modal.innerHTML = `<section class="w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col">
    <header class="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 p-4 sm:p-5">
      <div class="min-w-0"><h2 id="pk-title" class="text-lg sm:text-xl font-extrabold truncate"></h2><p id="pk-sub" class="text-sm text-slate-500 dark:text-slate-400"></p></div>
      <button id="pk-close" type="button" class="ml-auto rounded-lg px-3 py-2 bg-slate-100 dark:bg-slate-800 font-bold" aria-label="Fechar">✕</button>
    </header>
    <div id="pk-filters" class="flex flex-wrap gap-2 px-4 sm:px-5 pt-3"></div>
    <div id="pk-body" class="overflow-y-auto p-4 sm:p-5"></div>
  </section>`;
  document.body.appendChild(modal);
  const open = () => { modal.classList.remove('hidden'); modal.classList.add('flex'); document.body.style.overflow = 'hidden'; };
  const close = () => { ctrl?.abort(); modal.classList.add('hidden'); modal.classList.remove('flex'); document.body.style.overflow = ''; };
  $('#pk-close', modal).addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });

  // ---------- busca ----------
  function buildQuery(term) {
    const words = term.replace(/["\\():*?\[\]{}^~!+\-/]/g, ' ').split(/\s+/).filter(Boolean);
    return words.map(w => `name:${w}`).join(' ');          // cada palavra precisa estar no nome
  }
  async function fetchPage(q, page, signal) {
    for (let t = 0; ; t++) {
      try {
        const r = await fetch(`${API}?q=${encodeURIComponent(q)}&page=${page}&pageSize=250&orderBy=-set.releaseDate&select=id,name,number,rarity,set,images`, { signal });
        if (!r.ok) throw new Error(r.status);
        return await r.json();
      } catch (e) {
        if (e.name === 'AbortError' || t >= 2) throw e;
        await new Promise(res => setTimeout(res, 900 * (t + 1)));   // a API às vezes oscila: tenta de novo
      }
    }
  }
  async function search(term) {
    const key = term.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    ctrl?.abort(); ctrl = new AbortController();
    const q = buildQuery(term); if (!q) return [];
    const today = new Date(), out = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const j = await fetchPage(q, page, ctrl.signal);
      (j.data || []).forEach(c => out.push({
        id: c.id, name: c.name, number: String(c.number || ''), rarity: c.rarity || '',
        set: c.set?.name || '', setId: c.set?.id || '', series: c.set?.series || '', release: c.set?.releaseDate || '',
        promo: isPromo(c.set || {}), img: c.images?.small || ''
      }));
      $('#pk-sub').textContent = `Carregando... ${out.length} cartas encontradas`;
      if ((j.data || []).length < 250) break;
    }
    // só o que já foi lançado
    const released = out.filter(c => !c.release || new Date(c.release.replace(/\//g, '-')) <= today);
    cache.set(key, released);
    return released;
  }

  // ---------- exibição ----------
  const num = n => parseInt(n, 10) || 0;
  function render() {
    const list = cards.filter(c => filter === 'all' || (filter === 'promo' ? c.promo : !c.promo));
    const groups = new Map();
    list.forEach(c => { if (!groups.has(c.setId)) groups.set(c.setId, []); groups.get(c.setId).push(c); });
    const ordered = [...groups.values()].sort((a, b) => (b[0].release || '').localeCompare(a[0].release || ''));
    const nPromo = cards.filter(c => c.promo).length;
    $('#pk-sub').textContent = `${cards.length} carta(s) · ${new Set(cards.map(c => c.setId)).size} expansões/promos já lançadas`;
    const chip = (k, label, n) => `<button type="button" data-pk-filter="${k}" class="px-3 py-1.5 rounded-full text-sm font-semibold ${filter === k ? 'bg-[#004de9] text-white' : 'bg-slate-100 dark:bg-slate-800'}">${label} (${n})</button>`;
    $('#pk-filters').innerHTML = chip('all', 'Todas', cards.length) + chip('set', 'Expansões', cards.length - nPromo) + chip('promo', 'Promos', nPromo);
    if (!ordered.length) { $('#pk-body').innerHTML = '<p class="py-12 text-center text-slate-500">Nenhuma carta neste filtro.</p>'; return; }
    $('#pk-body').innerHTML = ordered.map(g => {
      const s = g[0];
      g.sort((a, b) => num(a.number) - num(b.number) || a.number.localeCompare(b.number));
      return `<section class="mb-6"><h3 class="font-extrabold mb-2">${esc(s.set)} <span class="text-sm font-normal text-slate-500">· ${esc(s.series)} · ${esc((s.release || '').slice(0, 4))} · ${g.length} carta(s)${s.promo ? ' · Promo' : ''}</span></h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">${g.map(c => tile(c)).join('')}</div></section>`;
    }).join('');
  }
  function tile(c) {
    const i = cards.indexOf(c);
    return `<div class="rounded-xl border border-slate-200 dark:border-slate-800 p-2 flex flex-col">
      ${c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)} ${esc(c.set)} ${esc(c.number)}" loading="lazy" class="w-full aspect-[5/7] object-contain rounded">` : '<div class="w-full aspect-[5/7] grid place-items-center text-2xl bg-slate-100 dark:bg-slate-800 rounded">🃏</div>'}
      <p class="text-xs font-bold mt-1 truncate" title="${esc(c.name)}">${esc(c.name)}</p>
      <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">#${esc(c.number)}${c.rarity ? ' · ' + esc(c.rarity) : ''}</p>
      <div class="flex gap-1 mt-1.5">
        <button type="button" data-pk-add="want" data-i="${i}" class="flex-1 text-[11px] font-bold px-1 py-1.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">🔎 Procuro</button>
        <button type="button" data-pk-add="have" data-i="${i}" class="flex-1 text-[11px] font-bold px-1 py-1.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">📦 Vendo/Troco</button>
      </div></div>`;
  }

  modal.addEventListener('click', e => {
    const f = e.target.closest('[data-pk-filter]');
    if (f) { filter = f.dataset.pkFilter; render(); return; }
    const a = e.target.closest('[data-pk-add]'); if (!a) return;
    const c = cards[+a.dataset.i];
    if (!c || !window.M44Catalogo) return toast('O Meu Catálogo não está disponível.');
    const r = window.M44Catalogo.add({ type: a.dataset.pkAdd, name: c.name, set: c.set, number: c.number, img: c.img });
    if (r === null) return;
    toast(`${r ? 'Quantidade atualizada' : 'Adicionada'} em ${a.dataset.pkAdd === 'want' ? 'Procuro' : 'Vendo/Troco'}`);
    const old = a.textContent; a.textContent = '✓ Adicionada'; setTimeout(() => a.textContent = old, 1200);
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const term = input.value.trim();
    if (term.length < 2) return toast('Digite pelo menos 2 letras do nome do Pokémon.');
    filter = 'all'; cards = [];
    $('#pk-title').textContent = term; $('#pk-sub').textContent = 'Buscando em todas as expansões e promos...';
    $('#pk-filters').innerHTML = '';
    $('#pk-body').innerHTML = '<div class="py-16 text-center text-slate-500">Carregando cartas...</div>';
    open();
    try {
      cards = await search(term);
      if (!cards.length) {
        $('#pk-sub').textContent = 'Nenhuma carta encontrada';
        $('#pk-body').innerHTML = '<p class="py-12 text-center text-slate-500">Nada encontrado. Use o nome em inglês, como nas cartas (ex.: Charizard, Bulbasaur, Mr. Mime).</p>';
        return;
      }
      render();
    } catch (err) {
      if (err.name === 'AbortError') return;
      $('#pk-sub').textContent = 'Não foi possível carregar';
      $('#pk-body').innerHTML = '<div class="py-12 text-center"><p class="text-slate-500 mb-3">A base de cartas não respondeu. Tente novamente em instantes.</p><button type="button" id="pk-retry" class="px-4 py-2 rounded-lg bg-[#004de9] text-white font-bold">Tentar de novo</button></div>';
      $('#pk-retry').onclick = () => form.requestSubmit();
    }
  });
})();
