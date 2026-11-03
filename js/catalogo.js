/* M44 TCG — aba "Meu Catálogo"
   Cada pessoa monta a lista do que TEM (venda/troca) e do que PROCURA (compra/troca),
   salva no próprio navegador e compartilha por link ou WhatsApp.
   Autocomplete de cartas via api.pokemontcg.io (já liberada na CSP do netlify.toml). */
(function () {
  'use strict';
  const KEY = 'm44_catalogo_v1';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = $('#catalog');
  if (!root) return;

  const MODES = {
    have: { sale: 'Venda', trade: 'Troca', both: 'Venda ou troca' },
    want: { sale: 'Compra', trade: 'Troca', both: 'Compra ou troca' }
  };
  const CONDS = ['M', 'NM', 'SP', 'MP', 'HP', 'D'];
  const fresh = () => ({ owner: '', phone: '', items: [] });

  let data = load();
  let shared = null;       // catálogo de outra pessoa (aberto por link)
  let picked = null;       // carta escolhida no autocomplete
  let formType = 'have';
  let timer = null;

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { return fresh(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { toast('Não foi possível salvar neste navegador.'); } }
  function toast(msg) {
    const t = $('#toast'); if (!t) return alert(msg);
    t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400);
  }
  const uid = () => Math.random().toString(36).slice(2, 9);
  const brl = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const digits = s => String(s || '').replace(/\D/g, '');

  // ---------- link compartilhável (dados na própria URL, sem servidor) ----------
  function encode(d) {
    const min = { o: d.owner, p: d.phone, i: d.items.map(i => [i.type, i.name, i.set, i.number, i.qty, i.cond, i.mode, i.price, i.note]) };
    return btoa(unescape(encodeURIComponent(JSON.stringify(min)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(str) {
    try {
      const b = str.replace(/-/g, '+').replace(/_/g, '/');
      const m = JSON.parse(decodeURIComponent(escape(atob(b))));
      return {
        owner: String(m.o || ''), phone: String(m.p || ''),
        items: (m.i || []).slice(0, 300).map(r => ({ id: uid(), type: r[0] === 'want' ? 'want' : 'have', name: String(r[1] || ''), set: String(r[2] || ''), number: String(r[3] || ''), qty: +r[4] || 1, cond: String(r[5] || ''), mode: r[6] || 'both', price: r[7] || '', note: String(r[8] || '') }))
      };
    } catch { return null; }
  }
  const shareUrl = () => location.origin + location.pathname + '#catalogo=' + encode(data);

  function whatsText(d) {
    const line = i => `• ${i.qty}x ${i.name}${i.set ? ' (' + i.set + (i.number ? ' ' + i.number : '') + ')' : ''}${i.cond ? ' [' + i.cond + ']' : ''} — ${MODES[i.type][i.mode]}${i.price ? ' ' + brl(i.price) : ''}`;
    const have = d.items.filter(i => i.type === 'have').map(line);
    const want = d.items.filter(i => i.type === 'want').map(line);
    let t = `*Catálogo de ${d.owner || 'colecionador'} — M44 TCG*\n`;
    if (have.length) t += `\n*Tenho:*\n${have.join('\n')}\n`;
    if (want.length) t += `\n*Procuro:*\n${want.join('\n')}\n`;
    return t;
  }

  // ---------- render ----------
  function itemCard(i, readonly) {
    return `<li class="flex gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      ${i.img ? `<img src="${esc(i.img)}" alt="" loading="lazy" class="w-12 h-16 object-contain rounded">` : `<div class="w-12 h-16 rounded bg-slate-100 dark:bg-slate-800 grid place-items-center text-lg" aria-hidden="true">🃏</div>`}
      <div class="min-w-0 flex-1">
        <p class="font-bold truncate">${esc(i.qty)}x ${esc(i.name)}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 truncate">${esc(i.set)}${i.number ? ' · #' + esc(i.number) : ''}${i.cond ? ' · ' + esc(i.cond) : ''}</p>
        <p class="text-sm mt-0.5"><span class="inline-block px-2 py-0.5 rounded-full bg-[#004de9]/10 text-[#004de9] dark:text-sky-300 text-xs font-semibold">${MODES[i.type][i.mode]}</span>${i.price ? ` <strong class="ml-1">${brl(i.price)}</strong>` : ''}</p>
        ${i.note ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${esc(i.note)}</p>` : ''}
      </div>
      ${readonly ? '' : `<button data-cat="del" data-id="${i.id}" class="self-start h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 text-sm" aria-label="Remover ${esc(i.name)}">✕</button>`}
    </li>`;
  }
  function lists(d, readonly) {
    const col = (type, title, emptyMsg) => {
      const its = d.items.filter(i => i.type === type);
      return `<section><h3 class="font-extrabold text-lg mb-2">${title} <span class="text-sm font-normal text-slate-500">(${its.length})</span></h3>
        <ul class="space-y-2">${its.length ? its.map(i => itemCard(i, readonly)).join('') : `<li class="text-sm text-slate-500 dark:text-slate-400 py-6 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">${emptyMsg}</li>`}</ul></section>`;
    };
    return `<div class="grid md:grid-cols-2 gap-5">${col('have', '📦 Tenho', 'Nenhuma carta para venda ou troca ainda.')}${col('want', '🔎 Procuro', 'Nenhuma carta na lista de procura ainda.')}</div>`;
  }

  const inputCls = 'px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#004de9]';

  function renderShared() {
    const wa = digits(shared.phone);
    root.innerHTML = `<div class="space-y-5">
      <div class="flex flex-wrap items-center gap-3">
        <div><h2 class="text-2xl font-extrabold">Catálogo de ${esc(shared.owner || 'colecionador')}</h2><p class="text-sm text-slate-500 dark:text-slate-400">${shared.items.length} itens</p></div>
        <div class="ml-auto flex gap-2">
          ${wa ? `<a class="px-4 py-2 rounded-lg bg-[#25d366] text-white font-bold" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent('Oi! Vi seu catálogo na M44 TCG.')}">Chamar no WhatsApp</a>` : ''}
          <button data-cat="mine" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold">Ver meu catálogo</button>
        </div>
      </div>${lists(shared, true)}</div>`;
  }

  function renderMine() {
    root.innerHTML = `<div class="space-y-5">
      <div><h2 class="text-2xl font-extrabold">Meu Catálogo</h2>
      <p class="text-sm text-slate-500 dark:text-slate-400">Liste o que você tem para vender/trocar e o que procura. Compartilhe o link com outros colecionadores.</p></div>

      <div class="grid sm:grid-cols-2 gap-2">
        <input id="cat-owner" class="${inputCls}" placeholder="Seu nome" maxlength="40" value="${esc(data.owner)}" aria-label="Seu nome">
        <input id="cat-phone" class="${inputCls}" placeholder="WhatsApp com DDD (ex.: 83999999999)" inputmode="tel" maxlength="20" value="${esc(data.phone)}" aria-label="WhatsApp">
      </div>

      <form id="cat-form" class="p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 space-y-3" autocomplete="off">
        <div class="inline-flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700" role="group" aria-label="Tipo">
          <button type="button" data-cat="type" data-type="have" class="px-4 py-2 text-sm font-semibold">Tenho</button>
          <button type="button" data-cat="type" data-type="want" class="px-4 py-2 text-sm font-semibold">Procuro</button>
        </div>
        <div class="relative">
          <input id="cat-name" class="${inputCls} w-full" placeholder="Nome da carta (ex.: Charizard ex)" maxlength="80" required aria-label="Nome da carta">
          <ul id="cat-sugg" class="hidden absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl"></ul>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-6 gap-2">
          <input id="cat-set" class="${inputCls} sm:col-span-2" placeholder="Expansão" maxlength="60" aria-label="Expansão">
          <input id="cat-num" class="${inputCls}" placeholder="Nº" maxlength="12" aria-label="Número">
          <input id="cat-qty" class="${inputCls}" type="number" min="1" max="999" value="1" aria-label="Quantidade">
          <select id="cat-cond" class="${inputCls}" aria-label="Condição"><option value="">Condição</option>${CONDS.map(c => `<option>${c}</option>`).join('')}</select>
          <select id="cat-mode" class="${inputCls}" aria-label="Modalidade"></select>
        </div>
        <div class="grid sm:grid-cols-3 gap-2">
          <input id="cat-price" class="${inputCls}" type="number" min="0" step="0.01" placeholder="Preço R$ (opcional)" aria-label="Preço">
          <input id="cat-note" class="${inputCls} sm:col-span-2" placeholder="Observação (ex.: aceito troca por Pikachu)" maxlength="120" aria-label="Observação">
        </div>
        <button class="px-5 py-2 rounded-lg bg-[#004de9] text-white font-bold">Adicionar ao catálogo</button>
      </form>

      <div id="cat-lists"></div>

      <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
        <button data-cat="copy" class="px-4 py-2 rounded-lg bg-[#004de9] text-white font-semibold">Copiar link do catálogo</button>
        <button data-cat="wa" class="px-4 py-2 rounded-lg bg-[#25d366] text-white font-semibold">Compartilhar no WhatsApp</button>
        <button data-cat="text" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold">Copiar como texto</button>
        <button data-cat="clear" class="px-4 py-2 rounded-lg border border-red-300 text-red-600 font-semibold ml-auto">Limpar tudo</button>
      </div></div>`;
    syncForm(); refreshLists();
  }
  const refreshLists = () => { const el = $('#cat-lists'); if (el) el.innerHTML = lists(data, false); };
  function syncForm() {
    root.querySelectorAll('[data-cat="type"]').forEach(b => {
      const on = b.dataset.type === formType;
      b.className = 'px-4 py-2 text-sm font-semibold ' + (on ? 'bg-[#004de9] text-white' : 'bg-white dark:bg-slate-900');
      b.setAttribute('aria-pressed', on);
    });
    const m = $('#cat-mode'); if (m) m.innerHTML = Object.entries(MODES[formType]).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  }
  const render = () => shared ? renderShared() : renderMine();

  // ---------- autocomplete ----------
  async function suggest(q) {
    const ul = $('#cat-sugg'); if (!ul) return;
    if (q.length < 3) { ul.classList.add('hidden'); return; }
    try {
      const url = 'https://api.pokemontcg.io/v2/cards?pageSize=8&orderBy=-set.releaseDate&select=id,name,number,set,images&q=' + encodeURIComponent(`name:"${q.replace(/"/g, '')}*"`);
      const r = await fetch(url); if (!r.ok) throw 0;
      const { data: cards } = await r.json();
      if (!cards.length) { ul.classList.add('hidden'); return; }
      ul.innerHTML = cards.map((c, n) => `<li><button type="button" data-cat="pick" data-n="${n}" class="w-full flex items-center gap-2 p-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
        <img src="${esc(c.images?.small)}" alt="" class="w-9 h-12 object-contain"><span class="text-sm"><strong>${esc(c.name)}</strong><br><span class="text-xs text-slate-500">${esc(c.set?.name)} · #${esc(c.number)}</span></span></button></li>`).join('');
      ul._cards = cards; ul.classList.remove('hidden');
    } catch { ul.classList.add('hidden'); /* sem API: o usuário digita manualmente */ }
  }

  // ---------- eventos ----------
  root.addEventListener('input', e => {
    if (e.target.id === 'cat-owner') { data.owner = e.target.value.trim(); save(); }
    else if (e.target.id === 'cat-phone') { data.phone = e.target.value.trim(); save(); }
    else if (e.target.id === 'cat-name') { picked = null; clearTimeout(timer); timer = setTimeout(() => suggest(e.target.value.trim()), 350); }
  });
  root.addEventListener('submit', e => {
    if (e.target.id !== 'cat-form') return;
    e.preventDefault();
    const name = $('#cat-name').value.trim(); if (!name) return;
    if (data.items.length >= 300) return toast('Limite de 300 itens por catálogo.');
    data.items.push({
      id: uid(), type: formType, name, img: picked?.img || '',
      set: $('#cat-set').value.trim(), number: $('#cat-num').value.trim(),
      qty: Math.max(1, +$('#cat-qty').value || 1), cond: $('#cat-cond').value,
      mode: $('#cat-mode').value, price: $('#cat-price').value, note: $('#cat-note').value.trim()
    });
    save(); picked = null;
    ['name', 'set', 'num', 'price', 'note'].forEach(k => $('#cat-' + k).value = '');
    $('#cat-qty').value = 1; $('#cat-sugg').classList.add('hidden');
    refreshLists(); toast('Carta adicionada!');
  });
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    const act = b.dataset.cat;
    if (act === 'type') { formType = b.dataset.type; syncForm(); }
    else if (act === 'pick') {
      const c = $('#cat-sugg')._cards[+b.dataset.n];
      $('#cat-name').value = c.name; $('#cat-set').value = c.set?.name || ''; $('#cat-num').value = c.number || '';
      picked = { img: c.images?.small || '' }; $('#cat-sugg').classList.add('hidden');
    }
    else if (act === 'del') { data.items = data.items.filter(i => i.id !== b.dataset.id); save(); refreshLists(); }
    else if (act === 'copy') { await copy(shareUrl()); toast('Link copiado!'); }
    else if (act === 'text') { await copy(whatsText(data)); toast('Texto copiado!'); }
    else if (act === 'wa') window.open('https://wa.me/?text=' + encodeURIComponent(whatsText(data) + '\n' + shareUrl()), '_blank', 'noopener');
    else if (act === 'clear') { if (confirm('Apagar todo o seu catálogo?')) { data = fresh(); save(); render(); } }
    else if (act === 'mine') { shared = null; history.replaceState(null, '', location.pathname); render(); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#cat-name,#cat-sugg')) $('#cat-sugg')?.classList.add('hidden'); });
  async function copy(t) { try { await navigator.clipboard.writeText(t); } catch { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); } }

  // ---------- integração com as abas existentes ----------
  const OTHERS = ['gens', 'store', 'search', 'trades', 'mine', 'chat'];
  function openTab() {
    OTHERS.forEach(id => $('#' + id)?.classList.add('hidden'));
    ['progress', 'toolbar'].forEach(id => { const el = $('#' + id); if (el) el.style.display = 'none'; });
    root.classList.remove('hidden');
    document.querySelectorAll('[data-tab]').forEach(t => { const on = t.dataset.tab === 'catalog'; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
    render(); window.scrollTo({ top: 0 });
  }
  function closeTab() {
    root.classList.add('hidden');
    ['progress', 'toolbar'].forEach(id => { const el = $('#' + id); if (el) el.style.display = ''; });
  }
  // captura: impede que o app.js trate a aba "catalog" (ele não a conhece)
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-tab="catalog"]');
    if (t) { e.preventDefault(); e.stopPropagation(); openTab(); }
  }, true);
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-tab],[data-foot]');
    if (t && t.dataset.tab !== 'catalog') closeTab();
  });

  // link recebido: #catalogo=...
  function fromHash() {
    const m = location.hash.match(/^#catalogo=(.+)$/); if (!m) return;
    const d = decode(m[1]); if (!d) return toast('Link de catálogo inválido.');
    shared = d; openTab();
  }
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('load', () => setTimeout(fromHash, 0));
})();
