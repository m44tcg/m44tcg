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
  let setId = '';          // id da expansão escolhida no autocomplete
  let sets = null;         // cache da lista de expansões
  let token = 0;           // descarta respostas antigas da busca

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
  function badge(i, readonly) {
    const cls = 'inline-block px-2 py-0.5 rounded-full bg-[#004de9]/10 text-[#004de9] dark:text-sky-300 text-xs font-semibold';
    return readonly ? `<span class="${cls}">${MODES[i.type][i.mode]}</span>`
      : `<button type="button" data-cat="cycle" data-id="${i.id}" title="Clique para alterar" class="${cls}">${MODES[i.type][i.mode]} ⟳</button>`;
  }
  function itemCard(i, readonly) {
    return `<li class="flex gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      ${i.img ? `<img src="${esc(i.img)}" alt="" loading="lazy" class="w-12 h-16 object-contain rounded">` : `<div class="w-12 h-16 rounded bg-slate-100 dark:bg-slate-800 grid place-items-center text-lg" aria-hidden="true">🃏</div>`}
      <div class="min-w-0 flex-1">
        <p class="font-bold truncate">${esc(i.qty)}x ${esc(i.name)}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 truncate">${esc(i.set)}${i.number ? ' · #' + esc(i.number) : ''}${i.cond ? ' · ' + esc(i.cond) : ''}</p>
        <p class="text-sm mt-0.5">${badge(i, readonly)}${i.price ? ` <strong class="ml-1">${brl(i.price)}</strong>` : ''}</p>
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
          <button data-cat="img" class="px-4 py-2 rounded-lg bg-[#004de9] text-white font-semibold">Baixar como imagens</button>
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
          <input id="cat-name" class="${inputCls} w-full" placeholder="Nome ou número da carta (ex.: Charizard ex ou 125)" maxlength="80" required aria-label="Nome da carta">
          <ul id="cat-sugg" class="hidden absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl"></ul>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-6 gap-2">
          <div class="relative col-span-2"><input id="cat-set" class="${inputCls} w-full" placeholder="Expansão (ex.: Obsidian Flames)" maxlength="60" aria-label="Expansão">
            <ul id="cat-setsugg" class="hidden absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl"></ul></div>
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
        <button data-cat="img" class="px-4 py-2 rounded-lg bg-[#004de9] text-white font-semibold">Baixar como imagens</button>
        <button data-cat="copy" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold">Copiar link do catálogo</button>
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

  // ---------- autocomplete (nome, número e expansão) ----------
  const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const clean = x => String(x).replace(/["\\]/g, '');
  const API = 'https://api.pokemontcg.io/v2/';

  async function loadSets() {
    if (sets) return sets;
    try {
      const r = await fetch(API + 'sets?select=id,name,series,releaseDate&orderBy=-releaseDate&pageSize=250');
      sets = (await r.json()).data || [];
    } catch { sets = []; }
    return sets;
  }
  async function suggestSets(q) {
    const ul = $('#cat-setsugg'); if (!ul) return;
    const all = await loadSets(), n = norm(q);
    const hits = (n ? all.filter(x => norm(x.name).includes(n) || norm(x.series).includes(n) || norm(x.id) === n) : all).slice(0, 8);
    if (!hits.length) { ul.classList.add('hidden'); return; }
    ul._sets = hits;
    ul.innerHTML = hits.map((x, k) => `<li><button type="button" data-cat="pickset" data-n="${k}" class="w-full text-left p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"><strong>${esc(x.name)}</strong><br><span class="text-xs text-slate-500">${esc(x.series)} · ${esc((x.releaseDate || '').slice(0, 4))} · ${esc(x.id)}</span></button></li>`).join('');
    ul.classList.remove('hidden');
  }

  // Ponto de ligação com o banco do site: defina window.M44_searchCards({name, number, setId, setName})
  // retornando (ou resolvendo) uma lista de { name, number, set, setId, img }. Esses itens aparecem primeiro.
  async function searchCards() {
    const ul = $('#cat-sugg'); if (!ul) return;
    let name = $('#cat-name').value.trim();
    let number = $('#cat-num').value.trim();
    const setName = $('#cat-set').value.trim();
    if (!number && /^\d+(\s*\/\s*\d+)?$/.test(name)) { number = name; name = ''; }   // só dígitos no nome = número
    number = number.replace(/\s*\/.*$/, '').replace(/^0+(?=\d)/, '');
    if (name.length < 2 && !number && !setId) { ul.classList.add('hidden'); return; }
    const my = ++token, out = [];
    if (typeof window.M44_searchCards === 'function') {
      try { (await window.M44_searchCards({ name, number, setId, setName }) || []).slice(0, 8).forEach(c => out.push({ ...c, src: 'db' })); } catch { /* segue só com a API */ }
    }
    try {
      const q = [];
      if (name) q.push(`name:"${clean(name)}*"`);
      if (number) q.push(`number:"${clean(number)}"`);
      if (setId) q.push(`set.id:"${clean(setId)}"`); else if (setName) q.push(`set.name:"${clean(setName)}*"`);
      if (q.length) {
        const r = await fetch(API + 'cards?pageSize=12&select=id,name,number,set,images&q=' + encodeURIComponent(q.join(' ')));
        if (r.ok) (await r.json()).data.forEach(c => out.push({ name: c.name, number: c.number, set: c.set?.name || '', setId: c.set?.id || '', img: c.images?.small || '', src: 'api' }));
      }
    } catch { /* sem API: o usuário digita manualmente */ }
    if (my !== token) return;
    const seen = new Set(), list = out.filter(c => { const k = norm(c.name) + '|' + norm(c.set) + '|' + c.number; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
    if (!list.length) { ul.classList.add('hidden'); return; }
    ul._cards = list;
    ul.innerHTML = list.map((c, k) => `<li><button type="button" data-cat="pick" data-n="${k}" class="w-full flex items-center gap-2 p-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
      ${c.img ? `<img src="${esc(c.img)}" alt="" class="w-9 h-12 object-contain">` : '<span class="w-9 h-12 grid place-items-center">🃏</span>'}
      <span class="text-sm"><strong>${esc(c.name)}</strong>${c.src === 'db' ? ' <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">no banco</span>' : ''}<br><span class="text-xs text-slate-500">${esc(c.set)} · #${esc(c.number)}</span></span></button></li>`).join('');
    ul.classList.remove('hidden');
  }

  // ---------- eventos ----------
  root.addEventListener('input', e => {
    if (e.target.id === 'cat-owner') { data.owner = e.target.value.trim(); save(); }
    else if (e.target.id === 'cat-phone') { data.phone = e.target.value.trim(); save(); }
    else if (e.target.id === 'cat-name' || e.target.id === 'cat-num') { picked = null; clearTimeout(timer); timer = setTimeout(searchCards, 350); }
    else if (e.target.id === 'cat-set') { setId = ''; picked = null; suggestSets(e.target.value.trim()); }
  });
  root.addEventListener('focusin', e => { if (e.target.id === 'cat-set') suggestSets(e.target.value.trim()); });
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
    ['name', 'num', 'price', 'note'].forEach(k => $('#cat-' + k).value = '');   // mantém a expansão p/ cadastrar várias da mesma
    $('#cat-qty').value = 1; $('#cat-sugg').classList.add('hidden');
    refreshLists(); toast('Carta adicionada!');
  });
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    const act = b.dataset.cat;
    if (act === 'type') { formType = b.dataset.type; syncForm(); }
    else if (act === 'pick') {
      const c = $('#cat-sugg')._cards[+b.dataset.n];
      $('#cat-name').value = c.name; $('#cat-set').value = c.set || ''; $('#cat-num').value = c.number || '';
      setId = c.setId || ''; picked = { img: c.img || '' }; $('#cat-sugg').classList.add('hidden');
    }
    else if (act === 'pickset') {
      const x = $('#cat-setsugg')._sets[+b.dataset.n];
      $('#cat-set').value = x.name; setId = x.id; $('#cat-setsugg').classList.add('hidden');
      searchCards();   // já lista as cartas da expansão escolhida
    }
    else if (act === 'del') { data.items = data.items.filter(i => i.id !== b.dataset.id); save(); refreshLists(); }
    else if (act === 'img') { b.disabled = true; try { await exportImages(shared || data); } finally { b.disabled = false; } }
    else if (act === 'cycle') {
      const it = data.items.find(i => i.id === b.dataset.id); if (!it) return;
      const order = ['sale', 'trade', 'both']; it.mode = order[(order.indexOf(it.mode) + 1) % 3]; save(); refreshLists();
    }
    else if (act === 'copy') { await copy(shareUrl()); toast('Link copiado!'); }
    else if (act === 'text') { await copy(whatsText(data)); toast('Texto copiado!'); }
    else if (act === 'wa') window.open('https://wa.me/?text=' + encodeURIComponent(whatsText(data) + '\n' + shareUrl()), '_blank', 'noopener');
    else if (act === 'clear') { if (confirm('Apagar todo o seu catálogo?')) { data = fresh(); save(); render(); } }
    else if (act === 'mine') { shared = null; history.replaceState(null, '', location.pathname); render(); }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#cat-name,#cat-num,#cat-sugg')) $('#cat-sugg')?.classList.add('hidden');
    if (!e.target.closest('#cat-set,#cat-setsugg')) $('#cat-setsugg')?.classList.add('hidden');
  });
  async function copy(t) { try { await navigator.clipboard.writeText(t); } catch { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); } }

  // ---------- adicionar item (usado também pela Minha Coleção) ----------
  const normTxt = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  function addItem({ type, name, set = '', number = '', img = '', mode = 'both', qty = 1 }) {
    name = String(name || '').trim(); if (!name) return null;
    type = type === 'want' ? 'want' : 'have';
    const dup = data.items.find(i => i.type === type && normTxt(i.name) === normTxt(name) && normTxt(i.set) === normTxt(set) && String(i.number) === String(number));
    if (dup) dup.qty = Math.min(999, (+dup.qty || 1) + qty);
    else {
      if (data.items.length >= 300) { toast('Limite de 300 itens por catálogo.'); return null; }
      data.items.push({ id: uid(), type, name, set, number: String(number), img, qty, cond: '', mode, price: '', note: '' });
    }
    save(); if (!shared) refreshLists();
    return !!dup;
  }
  window.M44Catalogo = { add: addItem };

  // ---------- baixar catálogo como imagens (PNG) ----------
  const W = 1080, H = 1350, PAD = 40, GAP = 16, COLS = 4, ROWS = 3, PER = COLS * ROWS;
  const loadImg = src => new Promise(res => {
    if (!src) return res(null);
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => res(im); im.onerror = () => res(null); im.src = src;
    setTimeout(() => res(null), 8000);
  });
  function fit(x, text, maxW) {
    if (x.measureText(text).width <= maxW) return text;
    while (text.length > 1 && x.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
  }
  function rr(x, px, py, w, h, r) {
    x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath();
  }
  function drawPage(d, pg, n, total, imgs) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), have = pg.type === 'have';
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a1126'); g.addColorStop(1, '#0f1d45');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = '#004de9'; x.fillRect(0, 0, W, 8);
    // cabeçalho
    x.fillStyle = '#fff'; x.textBaseline = 'alphabetic'; x.font = '800 46px "Barlow Condensed", Outfit, sans-serif';
    x.fillText(fit(x, 'Catálogo de ' + (d.owner || 'colecionador'), W - 2 * PAD - 120), PAD, 84);
    x.font = '700 22px Outfit, sans-serif'; x.fillStyle = '#94a3b8'; x.textAlign = 'right'; x.fillText(`${n}/${total}`, W - PAD, 80); x.textAlign = 'left';
    const label = have ? 'TENHO · venda ou troca' : 'PROCURO · compra ou troca';
    x.font = '700 20px Outfit, sans-serif'; const lw = x.measureText(label).width + 32;
    x.fillStyle = have ? '#10b981' : '#f59e0b'; rr(x, PAD, 104, lw, 38, 19); x.fill();
    x.fillStyle = '#04122e'; x.fillText(label, PAD + 16, 130);
    // grade
    const top = 170, cw = (W - 2 * PAD - (COLS - 1) * GAP) / COLS, rh = (H - 80 - top - (ROWS - 1) * GAP) / ROWS;
    pg.its.forEach((it, k) => {
      const cx = PAD + (k % COLS) * (cw + GAP), cy = top + Math.floor(k / COLS) * (rh + GAP);
      x.fillStyle = '#131d3b'; rr(x, cx, cy, cw, rh, 14); x.fill();
      x.strokeStyle = '#22305c'; x.lineWidth = 1.5; x.stroke();
      const bx = cx + 10, by = cy + 10, bw = cw - 20, bh = 222, im = imgs.get(it.id);
      if (im) { const sc = Math.min(bw / im.width, bh / im.height), iw = im.width * sc, ih = im.height * sc; x.drawImage(im, bx + (bw - iw) / 2, by + (bh - ih) / 2, iw, ih); }
      else { x.fillStyle = '#1b2a55'; rr(x, bx + bw / 2 - 80, by + 10, 160, bh - 20, 10); x.fill(); x.fillStyle = '#64748b'; x.font = '600 15px Outfit, sans-serif'; x.textAlign = 'center'; x.fillText('Sem imagem', bx + bw / 2, by + bh / 2 + 5); x.textAlign = 'left'; }
      if ((+it.qty || 1) > 1) { x.fillStyle = '#004de9'; rr(x, cx + 10, cy + 10, 46, 26, 13); x.fill(); x.fillStyle = '#fff'; x.font = '700 15px Outfit, sans-serif'; x.textAlign = 'center'; x.fillText(`${it.qty}x`, cx + 33, cy + 28); x.textAlign = 'left'; }
      x.fillStyle = '#fff'; x.font = '700 19px Outfit, sans-serif'; x.fillText(fit(x, it.name, cw - 20), cx + 10, cy + 262);
      x.fillStyle = '#94a3b8'; x.font = '400 14px Outfit, sans-serif';
      x.fillText(fit(x, [it.set, it.number ? '#' + it.number : '', it.cond].filter(Boolean).join(' · '), cw - 20), cx + 10, cy + 285);
      const ml = MODES[it.type][it.mode]; x.font = '700 13px Outfit, sans-serif'; const mw = x.measureText(ml).width + 18;
      x.fillStyle = 'rgba(0,77,233,.35)'; rr(x, cx + 10, cy + rh - 40, mw, 26, 13); x.fill(); x.fillStyle = '#cfe0ff'; x.fillText(ml, cx + 19, cy + rh - 22);
      if (it.price) { x.fillStyle = '#fff'; x.font = '700 17px Outfit, sans-serif'; x.textAlign = 'right'; x.fillText(brl(it.price), cx + cw - 10, cy + rh - 21); x.textAlign = 'left'; }
    });
    // rodapé
    x.fillStyle = '#22305c'; x.fillRect(PAD, H - 66, W - 2 * PAD, 1.5);
    x.fillStyle = '#fff'; x.font = '800 24px "Barlow Condensed", Outfit, sans-serif'; x.fillText('M44 TCG', PAD, H - 28);
    if (d.phone) { x.font = '600 20px Outfit, sans-serif'; x.fillStyle = '#cfe0ff'; x.textAlign = 'right'; x.fillText('WhatsApp: ' + d.phone, W - PAD, H - 28); x.textAlign = 'left'; }
    return new Promise(res => c.toBlob(res, 'image/png'));
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function exportImages(d) {
    if (!d.items.length) return toast('Seu catálogo está vazio.');
    toast('Gerando imagens...');
    try { await Promise.all(['400 20px Outfit', '700 20px Outfit', '800 20px "Barlow Condensed"'].map(f => document.fonts.load(f))); } catch { /* usa fonte reserva */ }
    const loaded = await Promise.all(d.items.map(i => loadImg(i.img)));
    const imgs = new Map(d.items.map((i, k) => [i.id, loaded[k]]));
    const pages = [];
    ['have', 'want'].forEach(type => { const its = d.items.filter(i => i.type === type); for (let k = 0; k < its.length; k += PER) pages.push({ type, its: its.slice(k, k + PER) }); });
    const slug = normTxt(d.owner).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'colecionador';
    for (let k = 0; k < pages.length; k++) {
      const blob = await drawPage(d, pages[k], k + 1, pages.length, imgs);
      if (!blob) { toast('Não foi possível gerar a imagem neste navegador.'); return; }
      download(blob, `catalogo-m44-${slug}-${pages[k].type === 'have' ? 'tenho' : 'procuro'}-${k + 1}.png`);
      await new Promise(r => setTimeout(r, 400));   // evita o bloqueio de downloads múltiplos
    }
    toast(pages.length > 1 ? `${pages.length} imagens baixadas!` : 'Imagem baixada!');
  }

  // ---------- Minha Coleção: botões "Procuro" e "Vendo/Troco" nas cartas da expansão ----------
  const setContent = $('#set-cards-content');
  function cardInfo(card) {
    const im = card.querySelector('img'); if (!im) return null;
    const txt = (card.textContent || '').replace(/\s+/g, ' ');
    const m = txt.match(/(\d{1,4})\s*\/\s*\d{1,4}/) || txt.match(/#\s*([A-Za-z0-9-]+)/);
    const title = ($('#set-cards-title')?.textContent || '').trim();
    const generic = /^cartas da expans/i.test(title);
    return {
      name: (card.dataset.name || im.alt || card.querySelector('h3,h4,strong,[class*="name"]')?.textContent || '').trim(),
      number: card.dataset.number || (m ? m[1] : ''),
      set: card.dataset.set || (generic ? '' : title),
      img: im.currentSrc || im.src || ''
    };
  }
  function decorate() {
    if (!setContent) return;
    setContent.querySelectorAll('img').forEach(im => {
      let card = im;
      while (card.parentElement && card.parentElement !== setContent && card.parentElement.querySelectorAll('img').length === 1) card = card.parentElement;
      if (card === im) card = im.parentElement;
      if (!card || card === setContent || card.querySelector('.m44-cat-actions')) return;
      const bar = document.createElement('div'); bar.className = 'm44-cat-actions flex gap-1 mt-1.5';
      bar.innerHTML = '<button type="button" data-cat-add="want" class="flex-1 text-[11px] font-bold px-2 py-1.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">🔎 Procuro</button>'
        + '<button type="button" data-cat-add="have" class="flex-1 text-[11px] font-bold px-2 py-1.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">📦 Vendo/Troco</button>';
      card.appendChild(bar);
    });
  }
  if (setContent) {
    new MutationObserver(decorate).observe(setContent, { childList: true, subtree: true });
    setContent.addEventListener('click', e => {
      const b = e.target.closest('[data-cat-add]'); if (!b) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const info = cardInfo(b.closest('.m44-cat-actions').parentElement);
      if (!info || !info.name) return toast('Não consegui identificar essa carta.');
      const type = b.dataset.catAdd, r = addItem({ ...info, type });
      if (r === null) return;
      toast(`${r ? 'Quantidade atualizada' : 'Adicionada'} em ${type === 'want' ? 'Procuro' : 'Vendo/Troco'} — veja em Meu Catálogo`);
      const old = b.textContent; b.textContent = '✓ Adicionada'; setTimeout(() => b.textContent = old, 1200);
    }, true);
    decorate();
  }

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
