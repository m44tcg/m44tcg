const GENS = [
  { gen: 1, title: "1ª Geração - Kanto",  start: 1,   end: 151 },
  { gen: 2, title: "2ª Geração - Johto",  start: 152, end: 251 },
  { gen: 3, title: "3ª Geração - Hoenn",  start: 252, end: 386 },
  { gen: 4, title: "4ª Geração - Sinnoh", start: 387, end: 493 },
  { gen: 5, title: "5ª Geração - Unova",  start: 494, end: 649 },
  { gen: 6, title: "6ª Geração - Kalos",  start: 650, end: 721 },
  { gen: 7, title: "7ª Geração - Alola",  start: 722, end: 809 },
  { gen: 8, title: "8ª Geração - Galar",  start: 810, end: 905 },
  { gen: 9, title: "9ª Geração - Paldea", start: 906, end: 1025 },
];
const MAX_ID = GENS[GENS.length - 1].end;
const ART = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const $ = s => document.querySelector(s);
const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { toast('Armazenamento cheio: exporte um backup para não perder dados.'); return false; } }
};
let _tt; function toast(msg) { const t = document.getElementById('toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(_tt); _tt = setTimeout(() => t.classList.remove('show'), 3200); }
const debounce = (fn, ms = 180) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
try { navigator.storage?.persist?.(); } catch {}
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let user = LS.get('pk-user', null);
let col = new Set(); // coleção de Pokémon usada pelo sistema de trocas
let data = [];
let setCol = new Set();
let setData = [];
let seriesSel = 'all';
let tab = 'store', query = '', genSel = 'all', statusSel = 'all';
const openGens = new Set([1]);
const openSets = new Set([1]);

const colKey = () => 'pk-col-' + (user ? user.email : 'guest');
const uid = () => (user ? user.email : 'guest');
const loadCol = () => {
  col = new Set(LS.get(colKey(), []));
  // migração: dados antigos eram globais; passam para o primeiro perfil que abrir
  const mig = (key, legacy) => { const cur = LS.get(key, null); if (cur) return cur; const old = LS.get(legacy, null); if (old && old.length) { LS.set(key, old); LS.set(legacy, null); return old; } return []; };
  setCol = new Set(mig('pk-sets-' + uid(), 'pk-sets-col'));
  expansionCardCol.clear(); mig('pk-expcards-' + uid(), 'pk-expansion-cards-col').forEach(i => expansionCardCol.add(i));
};
const saveSets = () => LS.set('pk-sets-' + uid(), [...setCol]);
const saveExp = () => LS.set('pk-expcards-' + uid(), [...expansionCardCol]);
const saveCol = () => LS.set(colKey(), [...col]);

/* ---------- Tema ---------- */
function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark);
  LS.set('pk-dark', dark);
}
applyTheme(LS.get('pk-dark', true));
$('#btn-theme').onclick = () => applyTheme(!document.documentElement.classList.contains('dark'));

/* ---------- Login com Google (Netlify Identity) ---------- */
let identityLib = null;
const identity = () => identityLib ||= import('https://esm.sh/@netlify/identity@2.0.0');
function loginAs(u) {
  user = u; LS.set('pk-user', user);
  const guest = LS.get('pk-col-guest', []);
  if (!LS.get(colKey(), []).length && guest.length) LS.set(colKey(), guest);
  loadCol(); renderUser(); render();
}
function fromIdentity(u) {
  const email = String(u.email || '').toLowerCase();
  return { name: u.name || email.split('@')[0] || 'Treinador', email, picture: u.pictureUrl || '', google: u.provider === 'google' };
}
async function initAuth() {
  try {
    const { handleAuthCallback, getUser, AuthError } = await identity();
    try {
      const result = await handleAuthCallback();
      if (result?.user) { loginAs(fromIdentity(result.user)); toast('Login realizado com sucesso.'); return; }
    } catch (e) {
      if (e instanceof AuthError) toast('Não foi possível entrar com o Google. Tente novamente.');
    }
    const u = await getUser();
    if (u) { if (!user || user.email !== String(u.email || '').toLowerCase()) loginAs(fromIdentity(u)); }
    else if (user) { user = null; LS.set('pk-user', null); loadCol(); renderUser(); render(); }
  } catch {}
}
async function googleLogin() {
  try { (await identity()).oauthLogin('google'); }
  catch { toast('Não foi possível carregar o login do Google. Verifique a conexão.'); }
}
async function logoutUser() {
  try { await (await identity()).logout(); } catch {}
  user = null; LS.set('pk-user', null); loadCol(); renderUser(); render();
}
function renderUser() {
  applyStore();
  const mt = document.querySelector('[data-tab="mine"]'); if (mt) mt.style.display = user ? '' : 'none';
  const ct = document.querySelector('[data-tab="chat"]'); if (ct) ct.style.display = user ? '' : 'none';
  if (!user && (tab === 'mine' || tab === 'chat')) tab = 'store';
  const a = $('#user-area');
  if (user) {
    a.innerHTML = `<div class="flex items-center gap-2">
      ${user.picture ? `<img src="${esc(user.picture)}" alt="" referrerpolicy="no-referrer" class="h-8 w-8 rounded-full object-cover">` : `<span class="h-8 w-8 rounded-full bg-[#004de9] text-white grid place-items-center font-bold">${esc(user.name[0].toUpperCase())}</span>`}
      <span class="hidden sm:block text-sm font-semibold">${esc(user.name)}</span>
      <button id="btn-out" class="text-sm underline text-slate-600 dark:text-slate-400">Sair</button></div>`;
    $('#btn-out').onclick = logoutUser;
  } else {
    a.innerHTML = `<button id="btn-in" class="btn-login"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/></svg>Entrar</button>`;
    $('#btn-in').onclick = googleLogin;
  }
}

/* ---------- Dados ---------- */
async function loadData() {
  $('#gens').innerHTML = `<div class="py-16 text-center"><div class="w-10 h-10 mx-auto mb-3 border-4 border-[#004de9] border-t-transparent rounded-full animate-spin"></div><p class="text-slate-500">Carregando cartas...</p></div>`;
  try {
    let list = (window.M44_DB?.dex?.length ? window.M44_DB.dex.map(([id, name]) => ({ id, name })) : null) || LS.get('pk-list-v1', null);
    if (!list) {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=${MAX_ID}`);
      if (!res.ok) throw new Error(res.status);
      const { results } = await res.json();
      list = results.map(p => ({ id: +p.url.split('/').filter(Boolean).pop(), name: p.name[0].toUpperCase() + p.name.slice(1) }));
      LS.set('pk-list-v1', list);
    }
    const byId = new Map(list.map(p => [p.id, p]));
    data = GENS.map(g => {
      const cards = [];
      for (let id = g.start; id <= g.end; id++) {
        const p = byId.get(id);
        if (p) cards.push({ id: `gen${g.gen}-${id}`, name: p.name, number: '#' + String(id).padStart(3, '0'), image: ART(id) });
      }
      return { gen: g.gen, title: g.title, cards };
    });
    render();
  } catch (e) {
    $('#gens').innerHTML = `<div class="py-12 text-center text-red-600 dark:text-red-400"><p class="mb-3">Não foi possível conectar à PokéAPI. Verifique sua internet.</p><button onclick="loadData()" class="px-4 py-2 rounded-lg bg-[#004de9] text-white font-semibold">Tentar novamente</button></div>`;
  }
}

/* ---------- Expansões do Pokémon TCG ---------- */
// Expansões vêm exclusivamente do catálogo consultado; não adicionamos expansões fictícias.
function normalizeSetDate(v) {
  if (!v) return '';
  const parts = String(v).replaceAll('-', '/').split('/');
  if (parts.length !== 3) return '';
  if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
  return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
}
function groupSets(sets) {
  const bySeries = new Map();
  for (const set of sets) {
    const series = set.series || 'Outras coleções';
    if (!bySeries.has(series)) bySeries.set(series, []);
    const date = normalizeSetDate(set.releaseDate);
    const total = Number(set.total || set.printedTotal || 0);
    bySeries.get(series).push({
      id: `set-${set.id}`, sourceId: set.id, name: set.name,
      number: total ? `${total} cartas${date ? ' · ' + date.slice(0,4) : ''}` : (date ? `Lançada em ${date.split('-').reverse().join('/')}` : 'Expansão'),
      image: set.images?.logo || set.images?.symbol || '', releaseDate: date, total
    });
  }
  const groups = [...bySeries.entries()].map(([title, cards]) => ({ title, cards: cards.sort((a,b) => (a.releaseDate || '').localeCompare(b.releaseDate || '') || a.name.localeCompare(b.name)) }));
  groups.sort((a,b) => {
    const da = a.cards.reduce((v,c) => c.releaseDate && (!v || c.releaseDate > v) ? c.releaseDate : v, '');
    const db = b.cards.reduce((v,c) => c.releaseDate && (!v || c.releaseDate > v) ? c.releaseDate : v, '');
    return db.localeCompare(da);
  });
  return groups.map((g, i) => ({ gen: i + 1, title: g.title, cards: g.cards }));
}
async function loadSets() {
  const box = $('#gens');
  if (tab === 'all') box.innerHTML = `<div class="py-16 text-center"><div class="w-10 h-10 mx-auto mb-3 border-4 border-[#004de9] border-t-transparent rounded-full animate-spin"></div><p class="text-slate-500">Carregando expansões do Pokémon TCG...</p></div>`;
  try {
    let sets = window.M44_SETS_DB ? [...window.M44_SETS_DB] : [];
    if (!sets.length) try {
      const response = await fetch('https://api.pokemontcg.io/v2/sets?pageSize=250&orderBy=releaseDate');
      if (!response.ok) throw new Error('API');
      const json = await response.json();
      sets = Array.isArray(json.data) ? json.data : [];
    } catch {
      const response = await fetch('https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json');
      if (!response.ok) throw new Error('catálogo');
      sets = await response.json();
    }
    const cutoff = new Date().toISOString().slice(0, 10);
    sets = sets.filter(s => {
      const d = normalizeSetDate(s.releaseDate);
      return !d || d <= cutoff;
    });
    // Não completar com nomes/códigos inventados: manter apenas dados retornados pelo catálogo.
    sets = sets.filter(s => s && s.id && s.name && s.images && (s.images.logo || s.images.symbol));
    setData = groupSets(sets);
    $('#gen-sel').innerHTML = '<option value="all">Todas as expansões</option>' + setData.map(g => `<option value="${g.gen}">${esc(g.title)}</option>`).join('');
    render();
  } catch (e) {
    if (tab === 'all') box.innerHTML = `<div class="py-12 text-center text-red-600 dark:text-red-400"><p class="mb-3">Não foi possível carregar a lista de expansões. Verifique sua internet e tente novamente.</p><button onclick="loadSets()" class="px-4 py-2 rounded-lg bg-[#004de9] text-white font-semibold">Tentar novamente</button></div>`;
  }
}
const expansionCardCol = new Set();
let activeSetCardRequest = 0;
function closeSetCards() {
  const modal = $('#set-cards-modal');
  modal.classList.add('hidden'); modal.classList.remove('flex');
}
async function openSetCards(setId, setName) {
  const modal = $('#set-cards-modal');
  const content = $('#set-cards-content');
  const requestId = ++activeSetCardRequest;
  $('#set-cards-title').textContent = setName || 'Cartas da expansão';
  $('#set-cards-subtitle').textContent = 'Carregando lista de cartas...';
  content.innerHTML = '<div class="py-12 text-center text-slate-500"><div class="w-9 h-9 mx-auto mb-3 border-4 border-[#004de9] border-t-transparent rounded-full animate-spin"></div>Buscando cartas da expansão...</div>';
  modal.classList.remove('hidden'); modal.classList.add('flex');
  try {
    let cards = [];
    const embedded = window.M44_BY_SET && window.M44_BY_SET[setId] ? window.M44_BY_SET[setId].map(m44ApiCard) : null;
    let raw = embedded || [];
    for (let page = 1; page <= 6 && !embedded; page++) {
      const response = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent('set.id:' + setId)}&pageSize=250&page=${page}&orderBy=number`);
      if (!response.ok) throw new Error('API indisponível');
      const pj = await response.json();
      const part = Array.isArray(pj.data) ? pj.data : [];
      raw = raw.concat(part);
      if (part.length < 250 || (pj.totalCount && raw.length >= pj.totalCount)) break;
    }
    const json = { data: raw };
    cards = Array.isArray(json.data) ? json.data.filter(card => card && card.id && card.name && card.number && card.images && (card.images.small || card.images.large)) : [];
    if (requestId !== activeSetCardRequest) return;
    if (!cards.length) {
      content.innerHTML = '<div class="py-12 text-center text-slate-500">Não encontramos cartas para esta expansão no catálogo online.</div>';
      $('#set-cards-subtitle').textContent = 'Nenhuma carta encontrada';
      return;
    }
    $('#set-cards-subtitle').textContent = `${cards.length} cartas no catálogo · clique em uma carta para marcar ou desmarcar na sua coleção`;
    content.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">${cards.map(card => {
      const id = String(card.id); const owned = expansionCardCol.has(id);
      const img = card.images?.small || card.images?.large || '';
      const number = [card.number, card.set?.printedTotal ? '/ ' + card.set.printedTotal : ''].filter(Boolean).join(' ');
      return `<button type="button" data-exp-card="${esc(id)}" aria-pressed="${owned}" class="rounded-xl border ${owned ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60'} p-2 text-left transition hover:-translate-y-0.5 hover:shadow-md"><img src="${esc(img)}" alt="${esc(card.name)}" loading="lazy" decoding="async" class="w-full aspect-[3/4] object-contain rounded-lg" onerror="this.closest('[data-exp-card]')?.remove()"><span class="mt-2 block text-sm font-bold">${esc(card.name || 'Carta Pokémon')}</span><span class="block text-xs text-slate-500 dark:text-slate-400">${esc(number)}${card.rarity ? ' · ' + esc(card.rarity) : ''}</span><span class="mt-1 block text-xs font-bold ${owned ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#004de9] dark:text-[#8eb0ff]'}">${owned ? '✓ Na minha coleção' : '＋ Adicionar à coleção'}</span></button>`;
    }).join('')}</div>`;
  } catch (error) {
    if (requestId !== activeSetCardRequest) return;
    $('#set-cards-subtitle').textContent = 'Não foi possível carregar as cartas';
    content.innerHTML = '<div class="py-12 text-center"><p class="mb-3 text-slate-600 dark:text-slate-300">Não foi possível buscar as cartas desta expansão. Confira sua conexão e tente novamente.</p><button type="button" id="set-cards-retry" class="rounded-lg bg-[#004de9] px-4 py-2 text-white font-bold">Tentar novamente</button></div>';
    $('#set-cards-retry').onclick = () => openSetCards(setId, setName);
  }
}
$('#set-cards-close').addEventListener('click', closeSetCards);
$('#set-cards-modal').addEventListener('click', e => { if (e.target.id === 'set-cards-modal') closeSetCards(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSetCards(); });
$('#set-cards-content').addEventListener('click', e => {
  const card = e.target.closest('[data-exp-card]'); if (!card) return;
  const id = card.dataset.expCard;
  if (expansionCardCol.has(id)) expansionCardCol.delete(id); else expansionCardCol.add(id);
  saveExp();
  const owned = expansionCardCol.has(id);
  card.setAttribute('aria-pressed', String(owned));
  card.classList.toggle('border-emerald-400', owned);
  card.classList.toggle('bg-emerald-50', owned);
  card.classList.toggle('dark:bg-emerald-950/40', owned);
  card.classList.toggle('border-slate-200', !owned);
  card.classList.toggle('dark:border-slate-700', !owned);
  card.classList.toggle('bg-slate-50', !owned);
  card.classList.toggle('dark:bg-slate-800/60', !owned);
  const label = card.querySelector('span.mt-1');
  if (label) { label.textContent = owned ? '✓ Na minha coleção' : '＋ Adicionar à coleção'; label.className = `mt-1 block text-xs font-bold ${owned ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#004de9] dark:text-[#8eb0ff]'}`; }
});

function renderSets() {
  const term = query.trim().toLowerCase();
  let html = '', shown = 0;
  for (const g of setData) {
    if (seriesSel !== 'all' && +seriesSel !== g.gen) continue;
    const cards = g.cards.filter(c =>
      (statusSel === 'all' || (statusSel === 'have') === setCol.has(c.id)) &&
      (!term || c.name.toLowerCase().includes(term) || c.number.toLowerCase().includes(term)));
    if (!cards.length) continue;
    shown += cards.length;
    const owned = cards.filter(c => setCol.has(c.id)).length;
    html += `<details data-set-group="${g.gen}" class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" ${openSets.has(g.gen) || term ? 'open' : ''}>
      <summary class="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"><span class="chev transition-transform text-slate-400">▶</span><span class="font-bold">${esc(g.title)}</span><span class="ml-auto text-sm text-slate-500 dark:text-slate-400" data-set-gc="${g.gen}">${owned}/${cards.length}</span><span class="w-24 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden hidden sm:block"><span data-set-gb="${g.gen}" class="block h-full bg-[#004de9]" style="width:${cards.length ? owned/cards.length*100 : 0}%"></span></span></summary>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-4 pt-1">${cards.map(c => `<div class="slot ${setCol.has(c.id) ? 'on' : 'off'} rounded-xl p-3 bg-slate-50 dark:bg-slate-800/60 text-center min-h-[170px] flex flex-col items-center justify-center gap-2">${c.image ? `<img src="${esc(c.image)}" alt="Logo ${esc(c.name)}" loading="lazy" decoding="async" class="w-full h-16 object-contain" onerror="this.closest('.slot')?.remove()">` : `<span class="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-950 text-[#004de9] dark:text-[#8eb0ff] grid place-items-center font-black text-lg">TCG</span>`}<span class="block text-sm font-semibold">${esc(c.name)}</span><span class="block text-xs text-slate-500 dark:text-slate-400">${esc(c.number)}</span><button type="button" data-view-set="${esc(c.sourceId)}" data-set-name="${esc(c.name)}" class="w-full rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-xs font-bold text-[#004de9] dark:text-[#8eb0ff] hover:bg-blue-50 dark:hover:bg-slate-800">Ver cartas</button><button type="button" data-setid="${esc(c.id)}" aria-pressed="${setCol.has(c.id)}" class="w-full rounded-lg px-2 py-1.5 text-xs font-bold ${setCol.has(c.id) ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}">${setCol.has(c.id) ? '✓ Na coleção' : '＋ Marcar expansão'}</button></div>`).join('')}</div></details>`;
  }
  if (!shown) html = `<div class="py-16 text-center text-slate-500">${statusSel === 'have' && !setCol.size ? 'Sua coleção de expansões está vazia. Escolha “Todas as expansões” e marque as que você tem.' : 'Nenhuma expansão encontrada para esse filtro.'}</div>`;
  $('#gens').innerHTML = html;
  statsSets();
}
function statsSets() {
  const all = setData.reduce((n, g) => n + g.cards.length, 0);
  const have = setData.reduce((n, g) => n + g.cards.filter(c => setCol.has(c.id)).length, 0);
  const pct = all ? Math.round(have / all * 100) : 0;
  $('#total-have').textContent = have; $('#total-all').textContent = all; $('#total-pct').textContent = pct + '%'; $('#total-bar').style.width = pct + '%';
  for (const g of setData) {
    const owned = g.cards.filter(c => setCol.has(c.id)).length;
    const gc = document.querySelector(`[data-set-gc="${g.gen}"]`), gb = document.querySelector(`[data-set-gb="${g.gen}"]`);
    if (gc) gc.textContent = `${owned}/${g.cards.length}`;
    if (gb) gb.style.width = (g.cards.length ? owned / g.cards.length * 100 : 0) + '%';
  }
}

/* ---------- Renderização ---------- */
function render() {
  document.querySelectorAll('.tab').forEach(b => {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', on);
    b.classList.toggle('is-active', on);
  });
  const trades = tab === 'trades', store = tab === 'store', srch = tab === 'search', mine = tab === 'mine', chat = tab === 'chat';
  const chatEl = $('#chat'); if (chatEl) chatEl.classList.toggle('hidden', !chat);
  $('#store').classList.toggle('hidden', !store);
  $('#trades').classList.toggle('hidden', !trades);
  $('#search').classList.toggle('hidden', !srch);
  $('#mine').classList.toggle('hidden', !mine);
  $('#gens').classList.toggle('hidden', trades || store || srch || mine || chat);
  $('#toolbar').classList.toggle('hidden', trades || store || srch || mine || chat);
  $('#progress').classList.toggle('hidden', store || srch || mine || chat);
  if (chat) { if (window.M44Chat) window.M44Chat.render(); return; }
  if (store) return renderStore();
  if (srch) return renderSearch();
  if (mine) { loadMarket(); return renderMine(); }
  if (trades) { loadMarket(); $('#progress p').innerHTML = `Você tem <strong id="total-have" class="text-slate-900 dark:text-white">0</strong> de <span id="total-all">0</span> cartas`; renderTrades(); return stats(); }
  $('#progress p').innerHTML = `Você tem <strong id="total-have" class="text-slate-900 dark:text-white">0</strong> de <span id="total-all">0</span> expansões`;
  if (tab === 'all') { renderSets(); return; }
  const term = query.trim().toLowerCase();
  let html = '', shown = 0;
  for (const g of data) {
    if (genSel !== 'all' && +genSel !== g.gen) continue;
    const cards = g.cards.filter(c =>
      (statusSel === 'all' || (statusSel === 'have') === col.has(c.id)) &&
      (!term || c.name.toLowerCase().includes(term) || c.number.includes(term)));
    if (!cards.length) continue;
    shown += cards.length;
    html += `<details data-gen="${g.gen}" class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" ${openGens.has(g.gen) || term ? 'open' : ''}>
      <summary class="flex items-center gap-3 px-4 py-3 cursor-pointer select-none">
        <span class="chev transition-transform text-slate-400">▶</span>
        <span class="font-bold">${g.title}</span>
        <span class="ml-auto text-sm text-slate-500 dark:text-slate-400" data-gc="${g.gen}"></span>
        <span class="w-24 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden hidden sm:block"><span data-gb="${g.gen}" class="block h-full bg-[#004de9]"></span></span>
      </summary>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 p-4 pt-1">
        ${cards.map(c => `<button data-id="${c.id}" aria-pressed="${col.has(c.id)}" class="slot ${col.has(c.id) ? 'on' : 'off'} rounded-xl p-2 bg-slate-50 dark:bg-slate-800/60 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#004de9]">
          <img src="${c.image}" alt="${esc(c.name)}" loading="lazy" decoding="async" class="w-full aspect-square object-contain" onerror="this.style.opacity=.15">
          <span class="block text-xs text-slate-500 dark:text-slate-400">${c.number}</span>
          <span class="block text-sm font-semibold truncate">${esc(c.name)}</span>
        </button>`).join('')}
      </div></details>`;
  }
  if (!shown) {
    html = `<div class="py-16 text-center text-slate-500">${statusSel === 'have' && !col.size
      ? 'Sua coleção está vazia. Mude o filtro para "Todas as cartas" e toque nas cartas que você tem.'
      : 'Nenhuma carta encontrada para esse filtro.'}</div>`;
  }
  $('#gens').innerHTML = html;
  stats();
}

function stats() {
  const all = data.reduce((n, g) => n + g.cards.length, 0);
  const have = data.reduce((n, g) => n + g.cards.filter(c => col.has(c.id)).length, 0);
  const pct = all ? Math.round(have / all * 100) : 0;
  $('#total-have').textContent = have;
  $('#total-all').textContent = all;
  $('#total-pct').textContent = pct + '%';
  $('#total-bar').style.width = pct + '%';
  for (const g of data) {
    const h = g.cards.filter(c => col.has(c.id)).length;
    const gc = document.querySelector(`[data-gc="${g.gen}"]`);
    const gb = document.querySelector(`[data-gb="${g.gen}"]`);
    if (gc) gc.textContent = `${h}/${g.cards.length}`;
    if (gb) gb.style.width = (h / g.cards.length * 100) + '%';
  }
}

/* ---------- Eventos ---------- */
$('#gens').addEventListener('click', e => {
  const viewSet = e.target.closest('[data-view-set]');
  if (viewSet) { openSetCards(viewSet.dataset.viewSet, viewSet.dataset.setName); return; }
  const sb = e.target.closest('[data-setid]');
  if (sb) {
    const id = sb.dataset.setid;
    if (setCol.has(id)) setCol.delete(id); else setCol.add(id);
    saveSets();
    renderSets();
    return;
  }
  const b = e.target.closest('[data-id]');
  if (!b) return;
  const id = b.dataset.id;
  if (col.has(id) && lockedIds().has(id)) return alert('Essa carta está em uma oferta de troca. Cancele a oferta para removê-la.');
  col.has(id) ? col.delete(id) : col.add(id);
  saveCol();
  if (statusSel !== 'all') return render();
  const on = col.has(id);
  b.classList.toggle('on', on);
  b.classList.toggle('off', !on);
  b.setAttribute('aria-pressed', on);
  stats();
});
$('#gens').addEventListener('toggle', e => {
  const sg = +e.target.dataset?.setGroup;
  if (sg) { e.target.open ? openSets.add(sg) : openSets.delete(sg); return; }
  const g = +e.target.dataset?.gen;
  if (g) e.target.open ? openGens.add(g) : openGens.delete(g);
}, true);
document.querySelectorAll('.tab').forEach(b => b.onclick = () => { tab = b.dataset.tab; $('#hq').value = ''; searchQ = ''; render(); });
$('#q').oninput = debounce(e => { query = e.target.value; render(); });
$('#status-sel').onchange = e => { statusSel = e.target.value; render(); };
$('#gen-sel').onchange = e => { seriesSel = e.target.value; render(); };

$('#btn-export').onclick = () => {
  const blob = new Blob([JSON.stringify({ versao: 2, exportadoEm: new Date().toISOString(), cartas: [...col], expansoes: [...setCol], cartasExpansao: [...expansionCardCol] })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'colecao-pokemon.json';
  a.click();
  URL.revokeObjectURL(a.href);
};
$('#btn-import').onclick = () => $('#file').click();
$('#file').onchange = async e => {
  try {
    const json = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(json.cartas)) throw 0;
    const n0 = col.size + setCol.size + expansionCardCol.size;
    json.cartas.forEach(id => col.add(String(id)));
    (Array.isArray(json.expansoes) ? json.expansoes : []).forEach(id => setCol.add(String(id)));
    (Array.isArray(json.cartasExpansao) ? json.cartasExpansao : []).forEach(id => expansionCardCol.add(String(id)));
    saveCol(); saveSets(); saveExp(); render();
    toast(`Backup importado: ${col.size + setCol.size + expansionCardCol.size - n0} itens novos.`);
  } catch { alert('Arquivo de backup inválido.'); }
  e.target.value = '';
};

/* ---------- Loja M44 TCG ---------- */
let WHATSAPP = '55XXXXXXXXXXX'; // troque pelo número da loja: DDI + DDD + número
const PRODUCTS = [ // edite nomes, preços e categorias da sua loja
  { id: 'p1', nome: 'Booster avulso', cat: 'Boosters', preco: 24.9, antes: 29.9, desc: 'Pacote com cartas aleatórias.' },
  { id: 'p2', nome: 'Box de boosters', cat: 'Boosters', preco: 219.9, antes: 259.9, desc: 'Caixa fechada com vários pacotes.' },
  { id: 'p3', nome: 'Deck pronto para jogar', cat: 'Decks', preco: 89.9, desc: 'Deck de 60 cartas, pronto para a primeira partida.' },
  { id: 'p4', nome: 'Sleeves (65 un.)', cat: 'Acessórios', preco: 19.9, antes: 24.9, desc: 'Protetores de carta tamanho padrão.' },
  { id: 'p5', nome: 'Fichário 9 bolsos', cat: 'Acessórios', preco: 79.9, desc: 'Guarda até 360 cartas.' },
  { id: 'p6', nome: 'Carta rara avulsa', cat: 'Cartas avulsas', preco: 15, desc: 'Consulte a carta disponível no WhatsApp.' },
];
const PROMOS = [ // slides da vitrine: edite títulos, textos e destinos (cat:Categoria, tab:trades, scroll:id)
  { titulo: 'Semana de boosters', texto: 'Boosters e boxes com preço especial por tempo limitado.', btn: 'Ver boosters', go: 'cat:Boosters' },
  { titulo: 'Cartas raras em alta', texto: 'Veja quais cartas estão valorizadas no mercado agora.', btn: 'Ver destaques', go: 'scroll:store-destaques' },
  { titulo: 'Troque com outros treinadores', texto: 'Escaneie suas cartas e publique ofertas de troca.', btn: 'Ir para Trocas', go: 'tab:trades' },
];
const HIGHLIGHTS = [ // img = "set/número" no pokemontcg.io; n = nº Pokédex (imagem reserva); busca = termo na Liga.
  // Preço manual da Liga: acrescente preco: 123.45, data: '19/10/2026' na carta. Com PRICE_API configurada, o preço é atualizado sozinho.
  { img: 'swsh7/215', n: 197, busca: 'Umbreon VMAX Evolving Skies', nome: 'Umbreon VMAX (Alternate Art)', set: 'Evolving Skies · 215', tag: 'Em alta', nota: 'A famosa "Moonbreon", carta-referência da era moderna.' },
  { img: 'sv3pt5/199', n: 6, busca: 'Charizard ex 199 Pokémon 151', nome: 'Charizard ex (Special Illustration Rare)', set: 'Pokémon 151 · 199', tag: 'Em alta', nota: 'Ganhou força com os 30 anos da franquia.' },
  { img: 'sv8pt5/161', n: 197, busca: 'Umbreon ex 161 Prismatic Evolutions', nome: 'Umbreon ex (Special Illustration Rare)', set: 'Prismatic Evolutions · 161', tag: 'Em alta', nota: 'Chase card de um dos sets mais disputados.' },
  { img: 'swsh8/271', n: 94, busca: 'Gengar VMAX 271 Fusion Strike', nome: 'Gengar VMAX (Alternate Art)', set: 'Fusion Strike · 271', tag: 'Em alta', nota: 'Gengar é um dos Pokémon que mais valorizam em cartas.' },
  { img: 'ex8/107', n: 384, busca: 'Rayquaza Gold Star EX Deoxys', nome: 'Rayquaza ★ (Gold Star)', set: 'EX Deoxys · 107', tag: 'Rara', nota: 'Uma das Gold Stars mais cobiçadas.' },
  { img: 'base1/4', n: 6, busca: 'Charizard Base Set', nome: 'Charizard', set: 'Base Set · 4', tag: 'Rara', nota: 'A carta mais icônica do início do jogo.' },
  { img: 'sv3pt5/205', n: 151, busca: 'Mew ex 205 Pokémon 151', nome: 'Mew ex (Special Illustration Rare)', set: 'Pokémon 151 · 205', tag: 'Rara', nota: 'Outra chase card do set 151.' },
];
const HL_REF = { // valores de referência (15/10/2026), usados até a atualização automática chegar
  'swsh7/215': { brl: 11436.21, usd: 2264.7, eur: 1579.48 }, 'sv3pt5/199': { brl: 1632.94, usd: 323.37, eur: 235.71 },
  'sv8pt5/161': { brl: 6411.64, usd: 1269.69 }, 'swsh8/271': { brl: 5187.73, usd: 1027.32, eur: 962.3 },
  'ex8/107': { brl: 12629.41, usd: 2500.99, eur: 3519.25 }, 'base1/4': { brl: 4820.76, usd: 954.65, eur: 4184.6 },
  'sv3pt5/205': { brl: 126.45, usd: 25.04, eur: 16.63 },
};
const hlAuto = LS.get('pk-hl-cache', {});
function hlPriceHTML(h) {
  const a = hlAuto[h.img] || (HL_REF[h.img] && { mk: 1, ...HL_REF[h.img], data: '2026/10/15' });
  if (a && a.mk) return `<p class="text-sm font-bold">${brl(a.brl)} <span class="font-normal text-xs text-slate-500">mercado</span></p>${a.usd ? `<p class="text-xs text-slate-500">US$ ${a.usd.toFixed(2)}${a.eur ? ` · € ${a.eur.toFixed(2)}` : ''}</p>` : ''}<p class="text-[11px] text-slate-400">TCGplayer/Cardmarket${a.data ? ' · ' + esc(a.data) : ''}</p>`;
  if (a && a.avg) return `<p class="text-sm font-bold">${brl(a.avg)} <span class="font-normal text-xs text-slate-500">média</span></p>${a.min ? `<p class="text-xs text-slate-500">a partir de ${brl(a.min)}</p>` : ''}<p class="text-[11px] text-slate-400">Fonte: Liga Pokémon</p>`;
  if (h.preco != null) return `<p class="text-sm font-bold">${brl(h.preco)}</p><p class="text-[11px] text-slate-400">Liga Pokémon${h.data ? ' · ' + esc(h.data) : ''}</p>`;
  return '<p class="text-xs text-slate-500">Veja o preço na Liga Pokémon</p>';
}
async function loadHighlightPrices() {
  if (HIGHLIGHTS.every(h => hlAuto[h.img] && hlAuto[h.img].mk && Date.now() - hlAuto[h.img].ts < 6 * 3600 * 1000)) return;
  try {
    const ids = HIGHLIGHTS.map(h => h.img.replace('/', '-')).join(',');
    const j = await (await fetch(`/api/precos-destaques?ids=${encodeURIComponent(ids)}`)).json();
    let changed = false;
    for (const h of HIGHLIGHTS) {
      const c = j.cards && j.cards[h.img.replace('/', '-')];
      if (c && c.brl) { hlAuto[h.img] = { mk: 1, brl: c.brl, usd: c.usd, eur: c.eur, data: c.atualizado, ts: Date.now() }; changed = true; }
    }
    if (changed) { LS.set('pk-hl-cache', hlAuto); if (tab === 'store') renderStore(); }
  } catch {}
}
const imgCard = (h, big) => `https://images.pokemontcg.io/${h.img.split('/')[0]}/${h.img.split('/')[1]}${big ? '_hires' : ''}.png`;
function openZoom(src, alt) {
  const o = document.createElement('div');
  o.className = 'fixed inset-0 z-50 bg-black/80 grid place-items-center p-4 cursor-zoom-out';
  o.innerHTML = `<img src="${src}" alt="${esc(alt)}" class="max-h-[90vh] max-w-full rounded-xl shadow-2xl">`;
  const close = e => { if (e.type === 'click' || e.key === 'Escape') { o.remove(); document.removeEventListener('keydown', close); } };
  o.addEventListener('click', close);
  document.addEventListener('keydown', close);
  document.body.appendChild(o);
}
let heroIdx = 0, heroTimer = null;
function showSlide(i) {
  heroIdx = (i + PROMOS.length) % PROMOS.length;
  document.querySelectorAll('[data-slide]').forEach((el, k) => {
    const on = k === heroIdx;
    el.classList.toggle('opacity-100', on); el.classList.toggle('opacity-0', !on); el.classList.toggle('pointer-events-none', !on);
  });
  document.querySelectorAll('[data-dot]').forEach((el, k) => {
    const on = k === heroIdx;
    el.classList.toggle('w-6', on); el.classList.toggle('bg-white', on); el.classList.toggle('w-2', !on); el.classList.toggle('bg-white/50', !on);
  });
  startHero();
}
function startHero() {
  clearInterval(heroTimer);
  return; // vitrine nova é estática; carrossel antigo desativado
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  heroTimer = setInterval(() => { if (tab !== 'store') return clearInterval(heroTimer); showSlide(heroIdx + 1); }, 6000);
}
// Vitrine de cartas do hero: imagens em assets/cartas/ (lista.js é gerado por scripts/lista-cartas.mjs)
let REEL = null, reelIdx = 0, reelTimer = null;
function fillReel() {
  const box = $('#hero-reel'); if (!box) return;
  if (!REEL) REEL = (Array.isArray(window.CARTAS) ? window.CARTAS : []).filter(Boolean).map(f => 'assets/cartas/' + f);
  const glow = '<span class="reel__glow"></span><span class="reel__glow reel__glow--b"></span><span class="reel__grid"></span>';
  if (!REEL.length) { box.innerHTML = glow + `<img class="hero__ph" src="${$('#logo').src}" alt="">`; return; }
  box.innerHTML = glow + '<div class="reel__stage">' + REEL.map((src, i) => `<div class="reel__card" data-reel="${i}"><img src="${esc(src)}" alt="" draggable="false"></div>`).join('') + '</div>';
  reelIdx %= REEL.length;
  placeReel();
  clearInterval(reelTimer);
  if (REEL.length > 1) reelTimer = setInterval(() => {
    if (!box.isConnected) return clearInterval(reelTimer);
    if (!box.matches(':hover') && !document.hidden) { reelIdx = (reelIdx + 1) % REEL.length; placeReel(); }
  }, 3200);
  box.onclick = e => { const c = e.target.closest('[data-reel]'); if (c) { reelIdx = +c.dataset.reel; placeReel(); } };
}
function placeReel() {
  const n = REEL.length;
  document.querySelectorAll('#hero-reel .reel__card').forEach((el, i) => {
    let d = (i - reelIdx + n) % n; if (d > n / 2) d -= n;
    const a = Math.abs(d);
    el.style.setProperty('--d', d); el.style.setProperty('--a', a);
    el.style.zIndex = 10 - a;
    el.classList.toggle('is-on', d === 0);
    el.classList.toggle('is-out', a > 2);
  });
}
function homeHTML() {
  const card = 'rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800';
  const hero = `<section class="hero" aria-labelledby="hero-title">
    <div class="hero__copy">
      <p class="pill"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/></svg>Pokémon TCG · preços sincronizados com LigaPokémon</p>
      <h2 id="hero-title" class="hero__title">Compre e <em>troque</em> cartas.</h2>
      <p class="hero__text">A loja <strong>M44 TCG</strong> traz singles, booster boxes e acessórios com preços comparados ao mercado. Monte sua coleção e proponha trocas com valores reais.</p>
      <ul class="hero__trust">
        <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>Cartas verificadas</li>
        <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h14l-3-3M20 16H6l3 3"/></svg>Sistema de trocas</li>
        <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L5 14h6l-1 8 8-12h-6z"/></svg>Envio rápido</li>
      </ul>
    </div>
    <div class="hero__media hero__reel" id="hero-reel" aria-hidden="true"></div>
  </section>`;
  const dest = `<section id="store-destaques" class="mb-8 scroll-mt-32">
    <h2 class="text-lg font-bold">Cartas raras em alta</h2>
    <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Para você ter noção do que está valorizado. Seleção de outubro de 2026 com base em guias de tendências do mercado; não são itens à venda. Os valores são de mercado internacional (TCGplayer/Cardmarket), convertidos para reais e atualizados automaticamente. Toque na carta para ampliar.</p>
    <div class="flex gap-4 overflow-x-auto pb-2 snap-x">${HIGHLIGHTS.map(h => `<article class="snap-start shrink-0 w-48 ${card} p-3">
        <span class="inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${h.tag === 'Em alta' ? 'bg-[#0050e6] text-white' : 'bg-[#e8f0ff] text-[#0050e6] dark:bg-[#0c1a3a] dark:text-[#6e9bff]'}">${esc(h.tag)}</span>
        <button data-zoom="${imgCard(h, true)}" data-alt="${esc(h.nome)}" class="block w-full my-2 cursor-zoom-in" aria-label="Ampliar ${esc(h.nome)}">
          <img src="${imgCard(h)}" alt="${esc(h.nome)}" loading="lazy" onerror="this.onerror=null;this.src='${ART(h.n)}'" class="w-full aspect-[245/342] object-contain rounded-lg"></button>
        <h3 class="font-bold text-sm leading-snug">${esc(h.nome)}</h3>
        <p class="text-xs text-slate-500 dark:text-slate-400">${esc(h.set)}</p>
        <div class="mt-1">${hlPriceHTML(h)}</div>
        <p class="text-xs mt-1">${esc(h.nota)}</p>
        <a href="${ligaUrl(h.busca)}" target="_blank" rel="noopener" class="inline-block mt-2 text-xs underline text-[#0050e6] dark:text-[#6e9bff]">Ver na Liga Pokémon</a>
      </article>`).join('')}</div></section>`;
  const promo = PRODUCTS.filter(p => p.antes);
  const prom = promo.length ? `<section class="mb-8"><h2 class="text-lg font-bold mb-3">Promoções</h2>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${promo.map(p => `<div data-prod="${esc(p.id)}" class="cursor-pointer flex items-center gap-3 p-4 ${card}">
      <span class="px-2 py-1 rounded-lg bg-[#0050e6] text-white text-sm font-bold">-${Math.round((1 - p.preco / p.antes) * 100)}%</span>
      <div class="flex-1 min-w-0"><h3 class="font-bold truncate">${esc(p.nome)}</h3><p class="text-sm"><strong>${brl(p.preco)}</strong> <s class="text-slate-400">${brl(p.antes)}</s></p></div>
      <button data-add="${p.id}" class="px-3 py-1.5 rounded-lg bg-[#0050e6] text-white text-sm font-semibold">Adicionar</button></div>`).join('')}</div></section>` : '';
  return hero + prom + dest;
}

let cart = LS.get('pk-cart', {}), storeCat = 'Todos';
const brl = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const saveCart = () => { LS.set('pk-cart', cart); updateCartBadge(); if (!$('#cart-modal').classList.contains('hidden')) drawCart(); };

function renderStore() {
  const cats = ['Todos', ...new Set(PRODUCTS.map(p => p.cat))];
  const items = PRODUCTS.filter(p => storeCat === 'Todos' || p.cat === storeCat);
  const lines = PRODUCTS.filter(p => cart[p.id]);
  const total = lines.reduce((n, p) => n + p.preco * cart[p.id], 0);
  const qtyBtn = 'h-8 w-8 rounded-lg border border-slate-300 dark:border-slate-700 font-bold';
  $('#store').innerHTML = adminBarHTML() + homeHTML() + `
    <h2 id="store-produtos" class="text-lg font-bold mb-3 scroll-mt-32">Todos os produtos</h2>
    <div class="flex flex-wrap gap-2 mb-5">${cats.map(c => `<button data-cat="${c}" class="px-3 py-1.5 rounded-full text-sm font-semibold border ${c === storeCat ? 'bg-[#0050e6] text-white border-transparent' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'}">${c}</button>`).join('')}</div>
    <div class="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
      <div class="pgrid">
        ${items.map(p => { const out = p.estoque === 0, low = p.estoque > 0 && p.estoque <= 3, diff = p.liga > p.preco ? p.liga - p.preco : 0;
          return `<article class="pcard" data-prod="${esc(p.id)}" tabindex="0" aria-label="Ver detalhes de ${esc(p.nome)}">
          <div class="pcard__img">${p.img ? `<img src="${p.img}" alt="${esc(p.nome)}" loading="lazy">` : `<img class="pcard__ph" src="${$('#logo').src}" alt="">`}
            ${p.cond ? `<span class="tag tag--cond">${esc(p.cond)}</span>` : ''}
            ${out ? '<span class="tag tag--out">Esgotado</span>' : low ? `<span class="tag tag--low">Últimas ${p.estoque}</span>` : p.antes ? `<span class="tag tag--low">-${Math.round((1 - p.preco / p.antes) * 100)}%</span>` : ''}</div>
          <div class="pcard__body">
            <p class="pcard__set">${esc(p.set || p.cat)}</p>
            <h3 class="pcard__name">${esc(p.nome)}</h3>
            ${p.liga > 0 ? `<p class="pcard__liga">Liga: ${brl(p.liga)}${diff ? ` <span class="down">▼ ${brl(diff)}</span>` : ''}</p>` : ''}
            <p class="price">${brl(p.preco)}${p.antes ? `<s>${brl(p.antes)}</s>` : ''}</p>
            <button class="btn-buy" data-add="${p.id}" ${out ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11L21 7H6"/></svg>${out ? 'Esgotado' : 'Comprar'}</button>
          </div></article>`; }).join('')}
      </div>
      <aside class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 lg:sticky lg:top-28">
        <h2 class="font-bold mb-3">Seu carrinho</h2>
        ${lines.length ? lines.map(p => `<div class="flex items-center gap-2 mb-2 text-sm">
            <span class="flex-1 truncate">${esc(p.nome)}</span>
            <button data-sub="${p.id}" class="${qtyBtn}" aria-label="Diminuir">−</button><span class="w-5 text-center">${cart[p.id]}</span><button data-add="${p.id}" class="${qtyBtn}" aria-label="Aumentar">+</button>
          </div>`).join('') + `<div class="flex justify-between font-bold border-t border-slate-200 dark:border-slate-800 pt-3 mt-3"><span>Total</span><span>${brl(total)}</span></div>
          <button id="btn-checkout" class="w-full mt-4 px-4 py-2.5 rounded-lg bg-[#0050e6] text-white font-semibold">Finalizar pelo WhatsApp</button>
          <button id="btn-clear" class="w-full mt-2 text-xs underline text-slate-500">Esvaziar pedido</button>`
          : '<p class="text-sm text-slate-500">Adicione produtos para montar seu pedido.</p>'}
      </aside>
    </div>`;
  startHero();
  fillReel();
}

$('#store').addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) { const pa = e.target.closest('[data-prod]'); if (pa) openProduct(pa.dataset.prod); return; }
  if (t.dataset.zoom) return openZoom(t.dataset.zoom, t.dataset.alt || '');
  if (t.dataset.dot) return showSlide(+t.dataset.dot);
  if (t.dataset.nav) return showSlide(heroIdx + (t.dataset.nav === 'next' ? 1 : -1));
  if (t.dataset.go) {
    const [kind, val] = t.dataset.go.split(':');
    if (kind === 'tab') { tab = val; return render(); }
    if (kind === 'cat') { storeCat = val; renderStore(); return $('#store-produtos').scrollIntoView({ behavior: 'smooth' }); }
    if (kind === 'scroll') return $('#' + val).scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (t.dataset.ask) {
    if (WHATSAPP.includes('X')) return alert('Defina o número de WhatsApp da loja na constante WHATSAPP do código.');
    return window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Olá, M44 TCG! Tenho interesse na carta ' + t.dataset.ask + '.')}`, '_blank');
  }
  if (t.dataset.cat) storeCat = t.dataset.cat;
  else if (t.dataset.add) addToCart(t.dataset.add);
  else if (t.dataset.sub) { cart[t.dataset.sub]--; if (cart[t.dataset.sub] <= 0) delete cart[t.dataset.sub]; }
  else if (t.id === 'btn-clear') cart = {};
  else if (t.id === 'btn-checkout') {
    if (WHATSAPP.includes('X')) return alert('Defina o número de WhatsApp da loja na constante WHATSAPP do código.');
    const lines = PRODUCTS.filter(p => cart[p.id]);
    const total = lines.reduce((n, p) => n + p.preco * cart[p.id], 0);
    const msg = 'Olá, M44 TCG! Quero fazer este pedido:\n' + lines.map(p => `- ${cart[p.id]}x ${p.nome} (${brl(p.preco)})`).join('\n') + `\nTotal: ${brl(total)}`;
    return window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');
  }
  saveCart(); renderStore();
});

/* ---------- Administração da loja (seu Gmail) ---------- */
const ADMIN_EMAILS = ['m44tcg@gmail.com']; // coloque aqui o(s) Gmail(s) administrador(es). Ex.: ['seuemail@gmail.com']
const isAdmin = () => !!(user && user.google && ADMIN_EMAILS.some(e => String(e).toLowerCase() === user.email));
const DEFAULT_STORE = JSON.parse(JSON.stringify({ produtos: PRODUCTS, promos: PROMOS, whatsapp: WHATSAPP }));
let storeCfg = null, ed = null;
function applyStore() {
  const draft = isAdmin() ? LS.get('pk-store-draft', null) : null;
  const c = draft || storeCfg || DEFAULT_STORE;
  if (Array.isArray(c.produtos)) PRODUCTS.splice(0, PRODUCTS.length, ...c.produtos);
  if (Array.isArray(c.promos) && c.promos.length) PROMOS.splice(0, PROMOS.length, ...c.promos);
  if (c.whatsapp) WHATSAPP = c.whatsapp;
  heroIdx = 0;
  updateCartBadge();
}
async function loadStoreConfig() {
  try { const r = await fetch('data/loja.json', { cache: 'no-store' }); if (r.ok) storeCfg = await r.json(); } catch {}
  applyStore(); if (tab === 'store') renderStore();
}
function adminBarHTML() {
  if (!isAdmin()) return '';
  return `<div class="mb-5 p-3 rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 flex flex-wrap items-center gap-3 text-sm"><strong>Modo administrador</strong><span class="flex-1">Edite produtos, banners, preços e fotos da loja.</span><button id="btn-admin" class="px-3 py-1.5 rounded-lg bg-[#0050e6] text-white font-semibold">Editar loja</button></div>`;
}
const INP = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm';
const fld = (sec, i, k, label, val, ph = '', num = false) => `<label class="block text-xs font-semibold text-slate-500 dark:text-slate-400">${label}<input ${num ? 'data-num="1" inputmode="decimal"' : ''} data-sec="${sec}" data-i="${i}" data-k="${k}" value="${esc(val ?? '')}" placeholder="${esc(ph)}" class="${INP} mt-1 font-normal text-slate-900 dark:text-slate-100"></label>`;
const photoFld = (sec, i, img) => { const [W, H] = PHOTO_SIZE[sec] || [800, 800], box = sec === 'promos' ? 'w-40 aspect-[8/3]' : 'w-20 aspect-square';
  return `<div class="flex items-center gap-3 flex-wrap">${img ? `<img src="${img}" alt="" class="${box} rounded-lg object-cover border border-slate-200">` : `<div class="${box} rounded-lg bg-slate-100 dark:bg-slate-800 grid place-items-center text-[11px] text-slate-400">sem foto</div>`}<div><label class="inline-block px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm cursor-pointer">${img ? 'Trocar foto' : 'Adicionar foto'}<input type="file" accept="image/jpeg,image/png,image/webp" class="hidden" data-photo="${sec}:${i}"></label>${img ? ` <button type="button" data-rmphoto="${sec}:${i}" class="text-xs underline text-red-600">Remover</button>` : ''}<p class="text-[11px] text-slate-400 mt-1">Saída automática: ${W}×${H} px</p></div></div>`; };
let photoMode = LS.get('pk-photomode', 'fit');
const PHOTO_SIZE = { produtos: [800, 800], promos: [1600, 600] };
async function fileToDataUrl(file, sec) {
  if (!/^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(file.type)) throw new Error('Escolha uma imagem JPG, PNG ou WebP (fotos HEIC do iPhone não são aceitas).');
  if (file.size > 25 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 25 MB).');
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Não foi possível ler essa imagem. Tente outro arquivo.')); }; im.src = u; }); }
  const sw = bmp.width, sh = bmp.height, [W, H] = PHOTO_SIZE[sec] || [800, 800];
  if (!sw || !sh) throw new Error('Imagem inválida.');
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  if (photoMode === 'fill') {
    const k = Math.max(W / sw, H / sh), dw = sw * k, dh = sh * k;
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    // fundo na cor das bordas da própria foto, para a imagem inteira caber sem sobras estranhas
    const sc = Math.min(1, 64 / Math.max(sw, sh)), tw = Math.max(1, Math.round(sw * sc)), th = Math.max(1, Math.round(sh * sc));
    const t = document.createElement('canvas'); t.width = tw; t.height = th; const tg = t.getContext('2d');
    tg.fillStyle = '#fff'; tg.fillRect(0, 0, tw, th); tg.drawImage(bmp, 0, 0, tw, th);
    const px = [[0, 0], [tw - 1, 0], [0, th - 1], [tw - 1, th - 1]].map(([x, y]) => tg.getImageData(x, y, 1, 1).data);
    const m = i => Math.round(px.reduce((n, d) => n + d[i], 0) / 4);
    g.fillStyle = `rgb(${m(0)},${m(1)},${m(2)})`; g.fillRect(0, 0, W, H);
    const k = Math.min(W / sw, H / sh), dw = sw * k, dh = sh * k; g.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  if (Math.max(sw, sh) < Math.min(W, H) * 0.6) toast('Foto pequena: pode ficar com pouca nitidez. Prefira uma imagem maior.');
  let q = .88, url = c.toDataURL('image/jpeg', q);
  while (url.length > 600000 && q > .5) { q -= .08; url = c.toDataURL('image/jpeg', q); }
  return url;
}
function drawAdmin() {
  const cats = [...new Set(ed.produtos.map(p => p.cat).filter(Boolean))];
  const gos = [['', 'Sem destino'], ...cats.map(c => ['cat:' + c, 'Categoria: ' + c]), ['scroll:store-destaques', 'Cartas raras em alta'], ['scroll:store-produtos', 'Todos os produtos'], ['tab:trades', 'Aba Trocas']];
  const box = 'rounded-xl border border-slate-200 dark:border-slate-800 p-3 mb-3 space-y-2';
  $('#admin-body').innerHTML = `<div class="flex items-center mb-4"><h2 class="text-xl font-extrabold">Editar loja</h2><button data-act="close" class="ml-auto px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold" aria-label="Fechar">✕</button></div>
  <div class="${box}">${fld('root', 0, 'whatsapp', 'WhatsApp da loja (DDI + DDD + número, só dígitos)', ed.whatsapp, '5583999999999')}</div>
  <div class="${box}"><p class="text-sm font-semibold">Como ajustar as fotos que você enviar</p>
    <label class="flex items-start gap-2 text-sm"><input type="radio" name="photomode" value="fit" ${photoMode === 'fit' ? 'checked' : ''} class="mt-1"><span><strong>Mostrar inteira</strong> (recomendado): nada é cortado; sobras ficam na cor das bordas da foto.</span></label>
    <label class="flex items-start gap-2 text-sm"><input type="radio" name="photomode" value="fill" ${photoMode === 'fill' ? 'checked' : ''} class="mt-1"><span><strong>Preencher tudo</strong>: recorta o centro da foto para ocupar o espaço todo.</span></label>
    <p class="text-xs text-slate-500">Produtos ficam em 800×800 px (quadrado) e banners em 1600×600 px. A escolha vale para as próximas fotos enviadas.</p></div>
  <h3 class="font-bold mt-4 mb-2">Banners da vitrine</h3>
  ${ed.promos.map((b, i) => `<div class="${box}"><div class="grid sm:grid-cols-2 gap-2">${fld('promos', i, 'titulo', 'Título', b.titulo)}${fld('promos', i, 'btn', 'Texto do botão', b.btn)}</div>${fld('promos', i, 'texto', 'Texto', b.texto)}<label class="block text-xs font-semibold text-slate-500">Para onde o botão leva<select data-sec="promos" data-i="${i}" data-k="go" class="${INP} mt-1 font-normal">${gos.map(([v, l]) => `<option value="${esc(v)}" ${v === b.go ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>${photoFld('promos', i, b.img)}<button type="button" data-del="promos:${i}" class="text-xs underline text-red-600">Excluir banner</button></div>`).join('')}
  <button data-add="promos" class="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold">+ Novo banner</button>
  <h3 class="font-bold mt-6 mb-2">Produtos</h3>
  ${ed.produtos.map((p, i) => `<div class="${box}"><div class="grid sm:grid-cols-2 gap-2">${fld('produtos', i, 'nome', 'Nome', p.nome)}${fld('produtos', i, 'cat', 'Categoria', p.cat, 'Boosters, Decks…')}${fld('produtos', i, 'set', 'Expansão · número', p.set, 'Scarlet & Violet 151 · 199/165')}${fld('produtos', i, 'cond', 'Condição', p.cond, 'NM')}${fld('produtos', i, 'liga', 'Preço na Liga (R$)', p.liga, 'opcional', true)}${fld('produtos', i, 'preco', 'Preço (R$)', p.preco, '24,90', true)}${fld('produtos', i, 'antes', 'Preço antigo (opcional, mostra desconto)', p.antes, '29,90', true)}${fld('produtos', i, 'estoque', 'Estoque (opcional; 0 = esgotado)', p.estoque, 'ex.: 12', true)}</div>${fld('produtos', i, 'desc', 'Descrição', p.desc)}${photoFld('produtos', i, p.img)}<button type="button" data-del="produtos:${i}" class="text-xs underline text-red-600">Excluir produto</button></div>`).join('')}
  <button data-add="produtos" class="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold">+ Novo produto</button>
  <div class="sticky bottom-0 -mx-4 sm:-mx-6 mt-6 px-4 sm:px-6 py-3 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2">
    <button data-act="save" class="px-4 py-2 rounded-lg bg-[#0050e6] text-white font-semibold text-sm">Salvar e pré-visualizar</button>
    <button data-act="download" class="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold text-sm">Baixar loja.json (para publicar)</button>
    <button data-act="discard" class="px-4 py-2 rounded-lg text-sm underline text-slate-500">Descartar alterações salvas</button></div>`;
}
function openAdmin() { ed = JSON.parse(JSON.stringify({ produtos: PRODUCTS, promos: PROMOS, whatsapp: WHATSAPP })); drawAdmin(); const m = $('#admin-modal'); m.classList.remove('hidden'); m.classList.add('flex'); }
function closeAdmin() { const m = $('#admin-modal'); m.classList.add('hidden'); m.classList.remove('flex'); }
function cleanCfg() {
  return { produtos: ed.produtos.filter(p => p.nome && p.preco > 0).map(p => ({ ...p, id: p.id || 'p' + Date.now() + Math.random().toString(36).slice(2, 5) })),
    promos: ed.promos.filter(b => b.titulo), whatsapp: String(ed.whatsapp || '').replace(/\D/g, '') || WHATSAPP };
}
document.addEventListener('click', e => { if (e.target.closest('#btn-admin')) openAdmin(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAdmin(); });
$('#admin-body').addEventListener('input', e => {
  const t = e.target; if (!t.dataset.k) return;
  const o = t.dataset.sec === 'root' ? ed : ed[t.dataset.sec][+t.dataset.i];
  let v = t.value;
  if (t.dataset.num) { v = parseFloat(String(v).replace(',', '.')); if (t.dataset.k === 'estoque') v = isNaN(v) || v < 0 ? null : Math.floor(v); else if (!(v > 0)) v = null; }
  if (v == null) { if (t.dataset.k === 'antes' || t.dataset.k === 'estoque' || t.dataset.k === 'liga') delete o[t.dataset.k]; else o[t.dataset.k] = 0; } else o[t.dataset.k] = v;
});
$('#admin-body').addEventListener('change', async e => {
  const t = e.target;
  if (t.name === 'photomode') { photoMode = t.value; LS.set('pk-photomode', photoMode); return; }
  if (!t.dataset.photo || !t.files[0]) return;
  const [sec, i] = t.dataset.photo.split(':'), file = t.files[0];
  try { ed[sec][+i].img = await fileToDataUrl(file, sec); drawAdmin(); toast('Foto ajustada com sucesso.'); }
  catch (err) { toast(err && err.message ? err.message : 'Não foi possível ler essa imagem.'); t.value = ''; }
});
$('#admin-body').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.del) { const [sec, i] = t.dataset.del.split(':'); if (confirm('Excluir este item?')) { ed[sec].splice(+i, 1); drawAdmin(); } return; }
  if (t.dataset.rmphoto) { const [sec, i] = t.dataset.rmphoto.split(':'); delete ed[sec][+i].img; drawAdmin(); return; }
  if (t.dataset.add === 'produtos') { ed.produtos.push({ id: 'p' + Date.now(), nome: '', cat: ed.produtos[0]?.cat || 'Boosters', preco: 0, desc: '' }); drawAdmin(); return; }
  if (t.dataset.add === 'promos') { ed.promos.push({ titulo: '', texto: '', btn: 'Ver mais', go: '' }); drawAdmin(); return; }
  const a = t.dataset.act;
  if (a === 'close') return closeAdmin();
  if (a === 'save') { if (LS.set('pk-store-draft', cleanCfg())) { applyStore(); renderStore(); closeAdmin(); toast('Salvo neste navegador. Para os clientes verem, baixe o loja.json e publique.'); } return; }
  if (a === 'download') {
    const blob = new Blob([JSON.stringify(cleanCfg())], { type: 'application/json' }), l = document.createElement('a');
    l.href = URL.createObjectURL(blob); l.download = 'loja.json'; l.click(); URL.revokeObjectURL(l.href);
    toast('Coloque o loja.json na pasta do site, junto do index.html, e publique de novo.'); return;
  }
  if (a === 'discard') { if (confirm('Voltar para a loja publicada e apagar o rascunho deste navegador?')) { LS.set('pk-store-draft', null); applyStore(); renderStore(); closeAdmin(); } }
});

/* ---------- Pesquisa de produtos, cartas e expansões ---------- */
const normTxt = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
let searchQ = '', searchMore = 48; const searchOnline = new Map(), searchTried = new Set(); let searchReq = 0;
function renderSearch() { if (!$('#sres')) $('#search').innerHTML = '<div id="sres"></div>'; drawSearch(); }
function drawSearch() {
  const out = $('#sres'); if (!out) return;
  const q = normTxt(searchQ).trim();
  if (q.length < 2) {
    out.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400 mb-3">Digite pelo menos 2 letras. Algumas ideias:</p><div class="flex flex-wrap gap-2">${['Charizard', 'Pikachu', 'Umbreon', 'Booster', 'Deck', 'Sleeves'].map(x => `<button data-q="${x}" class="px-3 py-1.5 rounded-full text-sm font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">${x}</button>`).join('')}</div>`;
    return;
  }
  const toks = q.split(/\s+/), hit = h => toks.every(t => h.includes(t));
  const prods = PRODUCTS.filter(p => hit(normTxt(`${p.nome} ${p.cat} ${p.desc || ''}`)));
  const sets = setData.flatMap(g => g.cards).filter(c => hit(normTxt(c.name))).slice(0, 12);
  const pool = new Map();
  [...allTcgCards, ...Object.values(tcgCardCache), ...searchOnline.values()].forEach(c => { if (c && c.id) pool.set(c.id, c); });
  let cards = [];
  for (const c of pool.values()) { if (!c._h) c._h = normTxt(`${c.name} ${c.number} ${c.setName} ${c.rarity}`); if (hit(c._h)) cards.push(c); }
  cards.sort((a, b) => (normTxt(b.name).startsWith(q) - normTxt(a.name).startsWith(q)) || String(a.name).localeCompare(b.name) || String(a.setName).localeCompare(b.setName));
  if (!window.M44_DB && cards.length < 12 && q.length >= 3 && !searchTried.has(q)) {
    searchTried.add(q); const my = ++searchReq;
    findTcgCardsByNameOrCode(searchQ).then(l => { l.forEach(c => searchOnline.set(c.id, c)); if (my === searchReq) drawSearch(); }).catch(() => {});
  }
  const sec = (t, n, body) => `<section class="mb-8"><h2 class="text-lg font-bold mb-3">${t} <span class="text-sm font-normal text-slate-500">(${n})</span></h2>${body}</section>`;
  const prodHTML = p => `<div data-prod="${esc(p.id)}" class="cursor-pointer flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"><img src="${p.img || $('#logo').src}" alt="" class="h-14 w-14 rounded-lg object-cover ${p.img ? '' : 'opacity-70 p-1 bg-[#e8f0ff]'}"><div class="flex-1 min-w-0"><h3 class="font-bold truncate">${esc(p.nome)}</h3><p class="text-xs text-slate-500">${esc(p.cat)}</p><p class="text-sm"><strong>${brl(p.preco)}</strong>${p.antes ? ` <s class="text-xs text-slate-400">${brl(p.antes)}</s>` : ''}</p></div><button data-add="${esc(p.id)}" class="px-3 py-1.5 rounded-lg bg-[#0050e6] text-white text-sm font-semibold">Adicionar</button></div>`;
  const cardHTML = c => `<div class="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 flex flex-col text-center"><button data-zoom="${esc(c.image)}" data-alt="${esc(c.name)}" class="block cursor-zoom-in" aria-label="Ampliar ${esc(c.name)}"><img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy" class="w-full aspect-[245/342] object-contain rounded-lg"></button><h3 class="text-sm font-semibold mt-1 leading-snug">${esc(c.name)}</h3><p class="text-xs text-slate-500">${esc(c.setName || '')} · ${esc(c.number)}</p>${c.rarity ? `<p class="text-[11px] text-slate-400">${esc(c.rarity)}</p>` : ''}<button data-ask="${esc(`${c.name} (${c.setName || ''} ${c.number})`)}" class="mt-2 px-2 py-1 rounded-lg border border-[#0050e6] text-[#0050e6] dark:text-[#6e9bff] dark:border-[#6e9bff] text-xs font-semibold">Consultar no WhatsApp</button></div>`;
  let html = '';
  if (prods.length) html += sec('Produtos da loja', prods.length, `<div class="grid sm:grid-cols-2 gap-3">${prods.map(prodHTML).join('')}</div>`);
  if (sets.length) html += sec('Expansões', sets.length, `<div class="flex flex-wrap gap-2">${sets.map(c => `<button data-set="${esc(c.sourceId)}" data-name="${esc(c.name)}" class="px-3 py-2 rounded-xl text-sm font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-left">${esc(c.name)}<span class="block text-xs font-normal text-slate-500">${esc(c.number)}</span></button>`).join('')}</div>`);
  if (cards.length) html += sec('Cartas', cards.length.toLocaleString('pt-BR'), `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">${cards.slice(0, searchMore).map(cardHTML).join('')}</div>${cards.length > searchMore ? '<button data-more="1" class="mt-4 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold">Mostrar mais</button>' : ''}`);
  if (!html) html = `<p class="py-12 text-center text-slate-500">Nada encontrado para “${esc(searchQ)}”.${!window.M44_DB && !catalogLoaded ? ' O catálogo completo de cartas ainda está carregando; tente de novo em instantes.' : ''}</p>`;
  out.innerHTML = html;
}
$('#search').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) { const pa = e.target.closest('[data-prod]'); if (pa) openProduct(pa.dataset.prod); return; }
  if (t.dataset.zoom) return openZoom(t.dataset.zoom, t.dataset.alt || '');
  if (t.dataset.ask) {
    if (WHATSAPP.includes('X')) return alert('Defina o número de WhatsApp da loja.');
    return window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Olá, M44 TCG! Tenho interesse na carta ' + t.dataset.ask + '.')}`, '_blank');
  }
  if (t.dataset.add) { if (addToCart(t.dataset.add)) toast('Adicionado ao carrinho.'); return; }
  if (t.dataset.set) return openSetCards(t.dataset.set, t.dataset.name);
  if (t.dataset.more) { searchMore += 48; return drawSearch(); }
  if (t.dataset.q) { searchQ = t.dataset.q; $('#hq').value = searchQ; return drawSearch(); }
});

let prevTab = 'store';
$('#hq').addEventListener('input', debounce(e => {
  searchQ = e.target.value; searchMore = 48;
  const has = searchQ.trim().length > 0;
  if (has && tab !== 'search') { prevTab = tab; tab = 'search'; render(); scrollTo({ top: 0 }); }
  else if (!has && tab === 'search') { tab = prevTab; render(); }
  else if (tab === 'search') drawSearch();
}, 200));
$('#hq').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; e.target.dispatchEvent(new Event('input')); e.target.blur(); } });
/* ---------- Detalhes do produto ---------- */
let prodId = null, prodQty = 1;
function addToCart(id, n = 1) {
  const p = PRODUCTS.find(x => x.id === id); if (!p) return false;
  const have = cart[id] || 0;
  if (p.estoque != null && have + n > p.estoque) { toast(p.estoque - have > 0 ? `Só há ${p.estoque} em estoque.` : (p.estoque === 0 ? 'Produto esgotado.' : `Você já tem todo o estoque (${p.estoque}) no pedido.`)); return false; }
  cart[id] = have + n; saveCart(); return true;
}
function openProduct(id) { if (!PRODUCTS.some(x => x.id === id)) return; prodId = id; prodQty = 1; drawProduct(); const m = $('#prod-modal'); m.classList.remove('hidden'); m.classList.add('flex'); }
function closeProduct() { const m = $('#prod-modal'); m.classList.add('hidden'); m.classList.remove('flex'); }
function drawProduct() {
  const p = PRODUCTS.find(x => x.id === prodId); if (!p) return closeProduct();
  const inCart = cart[p.id] || 0, out = p.estoque === 0, left = p.estoque != null ? Math.max(0, p.estoque - inCart) : 99;
  prodQty = Math.min(Math.max(1, prodQty), Math.max(1, left));
  const disc = p.antes ? Math.round((1 - p.preco / p.antes) * 100) : 0;
  const stock = p.estoque == null ? '' : out ? '<p class="mt-3 text-sm font-semibold text-red-600">Esgotado</p>' : `<p class="mt-3 text-sm text-slate-500 dark:text-slate-400">Em estoque: <strong class="text-slate-900 dark:text-white">${p.estoque}</strong> ${p.estoque === 1 ? 'unidade' : 'unidades'}</p>`;
  const qb = 'h-10 w-10 rounded-lg border border-slate-300 dark:border-slate-700 text-lg font-bold';
  $('#prod-body').innerHTML = `<div class="grid md:grid-cols-2 gap-5">
    <div class="relative rounded-2xl overflow-hidden bg-[#e8f0ff] dark:bg-[#0c1a3a] aspect-square grid place-items-center">${disc ? `<span class="absolute z-10 top-3 left-3 px-2.5 py-1 rounded-full bg-[#0050e6] text-white text-sm font-bold">-${disc}%</span>` : ''}${p.img ? `<img src="${p.img}" alt="${esc(p.nome)}" class="w-full h-full object-contain">` : `<img src="${$('#logo').src}" alt="" class="w-1/2 opacity-80">`}</div>
    <div class="flex flex-col pr-8 md:pr-0">
      <span class="text-xs text-slate-500 dark:text-slate-400">${esc(p.cat)}</span>
      <h2 class="text-2xl font-extrabold leading-tight">${esc(p.nome)}</h2>
      <p class="mt-2"><strong class="text-3xl">${brl(p.preco)}</strong>${p.antes ? ` <s class="ml-2 text-slate-400">${brl(p.antes)}</s>` : ''}</p>
      <p class="mt-3 text-slate-600 dark:text-slate-300 whitespace-pre-line">${esc(p.desc || 'Sem descrição.')}</p>
      ${stock}${inCart ? `<p class="mt-1 text-sm text-slate-500">No carrinho: <strong>${inCart}</strong></p>` : ''}
      <div class="mt-auto pt-5">${out ? '<p class="text-sm text-slate-500 mb-3">Este produto está esgotado no momento.</p>' : `
        <div class="flex items-center gap-3 mb-3"><span class="text-sm font-semibold">Quantidade</span><button data-pq="-1" class="${qb}" aria-label="Diminuir">−</button><span class="w-8 text-center font-bold" aria-live="polite">${prodQty}</span><button data-pq="1" class="${qb}" aria-label="Aumentar">+</button><span class="ml-auto text-sm text-slate-500">Subtotal <strong class="text-slate-900 dark:text-white">${brl(p.preco * prodQty)}</strong></span></div>
        <button data-pact="add" class="w-full px-4 py-3 rounded-lg bg-[#0050e6] text-white font-semibold">Adicionar ao pedido</button>`}
        <button data-pact="ask" class="w-full mt-2 px-4 py-2.5 rounded-lg border border-[#0050e6] text-[#0050e6] dark:text-[#6e9bff] dark:border-[#6e9bff] font-semibold text-sm">Perguntar no WhatsApp</button></div>
    </div></div>`;
}
$('#prod-modal').addEventListener('click', e => {
  if (e.target.id === 'prod-modal') return closeProduct();
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.pq) { prodQty += +t.dataset.pq; return drawProduct(); }
  const a = t.dataset.pact; if (!a) return;
  const p = PRODUCTS.find(x => x.id === prodId);
  if (a === 'close') return closeProduct();
  if (a === 'add' && p && addToCart(p.id, prodQty)) { toast(`${prodQty}x ${p.nome} adicionado ao carrinho.`); closeProduct(); if (tab === 'store') renderStore(); return; }
  if (a === 'ask' && p) {
    if (WHATSAPP.includes('X')) return alert('Defina o número de WhatsApp da loja.');
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Olá, M44 TCG! Tenho interesse no produto ${p.nome} (${prodQty}x).`)}`, '_blank');
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProduct(); });
$('#store').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('article[data-prod]')) openProduct(e.target.dataset.prod); });

/* ---------- Carrinho de compras ---------- */
const cartLines = () => PRODUCTS.filter(p => cart[p.id] > 0);
const cartCount = () => cartLines().reduce((n, p) => n + cart[p.id], 0);
function updateCartBadge() {
  const b = $('#cart-badge'); if (!b) return;
  const n = cartCount(); b.textContent = n > 99 ? '99+' : n; b.style.display = n ? 'grid' : 'none';
  $('#btn-cart').setAttribute('aria-label', n ? `Abrir carrinho (${n} ${n === 1 ? 'item' : 'itens'})` : 'Abrir carrinho');
}
function openCart() { drawCart(); const m = $('#cart-modal'); m.classList.remove('hidden'); m.classList.add('flex'); }
function closeCart() { const m = $('#cart-modal'); m.classList.add('hidden'); m.classList.remove('flex'); }
function drawCart() {
  // remove itens que não existem mais na loja e respeita o estoque
  let fixed = false;
  for (const id of Object.keys(cart)) {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) { delete cart[id]; fixed = true; continue; }
    if (p.estoque != null && cart[id] > p.estoque) { if (p.estoque > 0) cart[id] = p.estoque; else delete cart[id]; fixed = true; }
  }
  if (fixed) { LS.set('pk-cart', cart); toast('Alguns itens foram ajustados conforme o estoque.'); }
  const lines = cartLines(), total = lines.reduce((n, p) => n + p.preco * cart[p.id], 0), n = cartCount();
  $('#cart-count').textContent = n ? `(${n} ${n === 1 ? 'item' : 'itens'})` : '';
  const qb = 'h-8 w-8 rounded-lg border border-slate-300 dark:border-slate-700 font-bold';
  if (!lines.length) {
    $('#cart-body').innerHTML = '<div class="py-16 text-center text-slate-500"><p class="text-lg font-semibold mb-1">Seu carrinho está vazio</p><p class="text-sm mb-4">Adicione produtos da loja para montar seu pedido.</p><button data-cact="shop" class="px-4 py-2 rounded-lg bg-[#0050e6] text-white font-semibold text-sm">Ver produtos</button></div>';
    $('#cart-foot').innerHTML = ''; return;
  }
  $('#cart-body').innerHTML = lines.map(p => `<div class="flex gap-3 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
    <button data-cprod="${esc(p.id)}" class="shrink-0" aria-label="Ver ${esc(p.nome)}"><img src="${p.img || $('#logo').src}" alt="" class="h-16 w-16 rounded-lg object-cover ${p.img ? '' : 'p-1.5 bg-[#e8f0ff] opacity-80'}"></button>
    <div class="flex-1 min-w-0"><h3 class="font-semibold text-sm leading-snug">${esc(p.nome)}</h3><p class="text-xs text-slate-500">${brl(p.preco)} cada</p>
      <div class="flex items-center gap-2 mt-2"><button data-cminus="${esc(p.id)}" class="${qb}" aria-label="Diminuir">−</button><span class="w-6 text-center text-sm font-bold">${cart[p.id]}</span><button data-cplus="${esc(p.id)}" class="${qb}" aria-label="Aumentar">+</button>
      <button data-crm="${esc(p.id)}" class="ml-auto text-xs underline text-red-600">Remover</button></div></div>
    <strong class="text-sm whitespace-nowrap">${brl(p.preco * cart[p.id])}</strong></div>`).join('');
  $('#cart-foot').innerHTML = `<label class="block text-xs font-semibold text-slate-500 mb-2">Seu nome<input id="cart-name" value="${esc(LS.get('pk-cart-name', user ? user.name : ''))}" class="${INP} mt-1 font-normal text-slate-900 dark:text-slate-100" placeholder="Como devemos te chamar?"></label>
    <label class="block text-xs font-semibold text-slate-500 mb-3">Observações (opcional)<textarea id="cart-obs" rows="2" class="${INP} mt-1 font-normal text-slate-900 dark:text-slate-100" placeholder="Ex.: retirada na loja, entrega, dúvidas…"></textarea></label>
    <div class="flex justify-between items-baseline mb-3"><span class="font-semibold">Total</span><strong class="text-2xl">${brl(total)}</strong></div>
    <button data-cact="checkout" class="w-full px-4 py-3 rounded-lg bg-[#0050e6] text-white font-semibold">Finalizar pelo WhatsApp</button>
    <button data-cact="clear" class="w-full mt-2 text-xs underline text-slate-500">Esvaziar carrinho</button>`;
}
$('#btn-cart').addEventListener('click', openCart);
$('#cart-modal').addEventListener('click', e => {
  const t = e.target.closest('[data-cact],[data-cminus],[data-cplus],[data-crm],[data-cprod]'); if (!t) return;
  const d = t.dataset;
  if (d.cminus) { cart[d.cminus]--; if (cart[d.cminus] <= 0) delete cart[d.cminus]; saveCart(); if (tab === 'store') renderStore(); return; }
  if (d.cplus) { if (addToCart(d.cplus) && tab === 'store') renderStore(); return; }
  if (d.crm) { delete cart[d.crm]; saveCart(); if (tab === 'store') renderStore(); return; }
  if (d.cprod) { closeCart(); return openProduct(d.cprod); }
  if (d.cact === 'close') return closeCart();
  if (d.cact === 'shop') { closeCart(); if (tab !== 'store') { tab = 'store'; $('#hq').value = ''; searchQ = ''; render(); } return $('#store-produtos')?.scrollIntoView({ behavior: 'smooth' }); }
  if (d.cact === 'clear') { if (confirm('Esvaziar o carrinho?')) { cart = {}; saveCart(); if (tab === 'store') renderStore(); } return; }
  if (d.cact === 'checkout') {
    if (WHATSAPP.includes('X')) return alert('Defina o número de WhatsApp da loja.');
    const lines = cartLines(); if (!lines.length) return;
    const name = ($('#cart-name').value || '').trim(), obs = ($('#cart-obs').value || '').trim();
    if (name) LS.set('pk-cart-name', name);
    const total = lines.reduce((n, p) => n + p.preco * cart[p.id], 0);
    const msg = 'Olá, M44 TCG! Quero fazer este pedido:\n' + lines.map(p => `- ${cart[p.id]}x ${p.nome} (${brl(p.preco)})`).join('\n') + `\nTotal: ${brl(total)}` + (name ? `\nNome: ${name}` : '') + (obs ? `\nObs.: ${obs}` : '');
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });
updateCartBadge();

/* ---------- Trocas ---------- */
const cardId = n => `gen${GENS.find(g => n >= g.start && n <= g.end).gen}-${n}`;
// Apenas ofertas publicadas por usuários (remove ofertas de exemplo salvas anteriormente).
// Anúncios compartilhados entre todos os usuários, guardados no servidor (/api/trocas).
let market = [];
LS.set('pk-market', null);
const fromServer = o => {
  if (o.giveCard?.id) tcgCardCache[o.giveCard.id] ||= o.giveCard;
  if (o.wantCard?.id) tcgCardCache[o.wantCard.id] ||= o.wantCard;
  return { id: o.id, owner: o.mine && user ? user.email : 'outro:' + o.id, ownerName: o.ownerName, give: o.give, want: o.want || null,
    price: typeof o.giveCard?.price === 'number' ? o.giveCard.price : null, condition: o.giveCard?.condition || '', note: o.giveCard?.note || '' };
};
async function loadMarket() {
  try {
    const r = await fetch('/api/trocas', { credentials: 'same-origin' });
    if (!r.ok) throw 0;
    market = (await r.json()).offers.map(fromServer);
    if (tab === 'trades') renderTrades(); else if (tab === 'mine') renderMine();
  } catch { toast('Não foi possível carregar as ofertas de troca.'); }
}
async function apiTrocas(method, opts = {}) {
  // Renova o login antes de enviar, para o servidor reconhecer o usuário mesmo com o token expirado.
  let token = null;
  try { token = await (await identity()).refreshSession(); } catch {}
  token ||= (document.cookie.match(/(?:^|; )nf_jwt=([^;]*)/) || [])[1];
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + decodeURIComponent(token);
  const r = await fetch('/api/trocas' + (opts.q || ''), { method, credentials: 'same-origin', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Erro ao falar com o servidor.');
  return j;
}
const COND = { M: 'Mint (M)', NM: 'Near Mint (NM)', SP: 'Pouco usada (SP)', MP: 'Moderadamente usada (MP)', HP: 'Muito usada (HP)', D: 'Danificada (D)' };
const detailsLine = o => {
  const parts = [];
  if (o.condition && COND[o.condition]) parts.push(`<span class="px-2 py-0.5 rounded-full text-[11px] font-bold border border-emerald-400 text-emerald-600 dark:text-emerald-400">${esc(COND[o.condition])}</span>`);
  if (typeof o.price === 'number') parts.push(`<span class="font-bold text-[#004de9] dark:text-[#6e9bff]">${brl(o.price)}</span>`);
  return (parts.length ? `<div class="flex flex-wrap items-center gap-2 mt-1 text-sm">${parts.join('')}</div>` : '') + (o.note ? `<p class="text-xs text-slate-500 mt-1">${esc(o.note)}</p>` : '');
};
let editDraft = { price: '', cond: '', note: '' };
const pick = { give: null, want: null, edit: null };
let editingId = null; // anúncio em edição na aba Minhas Cartas
const saveMarket = () => {};
const lockedIds = () => new Set(user ? market.filter(o => o.owner === user.email).map(o => o.give) : []);
// Catálogo TCG completo: metadados (código, nome, expansão e URL da imagem) persistidos em IndexedDB.
// As imagens são mostradas pela URL oficial do catálogo para evitar um HTML gigante.
const tcgCardCache = LS.get('pk-tcg-card-cache-v1', {});
let allTcgCards = Object.values(tcgCardCache);
let catalogLoadPromise = null;
let catalogLoaded = false;
const CATALOG_DB = 'm44-tcg-catalog-v1';
function openCatalogDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB indisponível'));
    const req = indexedDB.open(CATALOG_DB, 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
async function catalogReadAll() {
  const db = await openCatalogDb();
  return new Promise((resolve, reject) => { const tx = db.transaction('cards', 'readonly'); const req = tx.objectStore('cards').getAll(); req.onsuccess = () => { db.close(); resolve(req.result || []); }; req.onerror = () => { db.close(); reject(req.error); }; });
}
async function catalogPutMany(cards) {
  if (!cards.length) return;
  const db = await openCatalogDb();
  return new Promise((resolve, reject) => { const tx = db.transaction('cards', 'readwrite'); const store = tx.objectStore('cards'); cards.forEach(c => store.put(c)); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); }; });
}
function updateCatalogStatus(message) { document.querySelectorAll('[data-catalog-status]').forEach(el => { el.textContent = message; }); }
function cardOf(id) {
  if (tcgCardCache[id]) return tcgCardCache[id];
  if (!cardOf.m || cardOf.n !== data.length) { cardOf.m = new Map(data.flatMap(g => g.cards.map(c => [c.id, c]))); cardOf.n = data.length; }
  return cardOf.m.get(id) || allTcgCards.find(c => c.id === id);
}
function normalizeCardCode(v) { return String(v || '').toLowerCase().replace(/\s+/g, '').replace(/\.0$/, ''); }
function apiCardToLocal(card) {
  const number = String(card.number || '');
  const total = card.set?.printedTotal || card.set?.total || '';
  return { id: 'tcg-' + card.id, tcgId: card.id, name: card.name || 'Carta Pokémon', number: total ? `${number}/${total}` : number,
    image: card.images?.small || card.images?.large || '', setName: card.set?.name || '', rarity: card.rarity || '' };
}
async function preloadAllTcgCards(forceRetry = false) {
  if (window.M44_DB?.cards?.length) {
    if (!catalogLoaded) { allTcgCards = window.M44_DB.cards.map(r => apiCardToLocal(m44ApiCard(r))); catalogLoaded = true; }
    updateCatalogStatus(`Catálogo offline: ${allTcgCards.length.toLocaleString('pt-BR')} cartas`);
    return;
  }
  if (catalogLoadPromise) return catalogLoadPromise;
  catalogLoadPromise = (async () => {
    try {
      updateCatalogStatus('Preparando catálogo completo de cartas…');
      const stored = await catalogReadAll().catch(() => []);
      if (stored.length) {
        allTcgCards = stored;
        catalogLoaded = localStorage.getItem('m44-tcg-catalog-complete') === '1';
        updateCatalogStatus(catalogLoaded
          ? `Banco local completo: ${stored.length.toLocaleString('pt-BR')} cartas, códigos e imagens.`
          : `Banco parcial: ${stored.length.toLocaleString('pt-BR')} cartas. Continuando o carregamento…`);
      }
      if (catalogLoaded && !forceRetry) return;
      localStorage.removeItem('m44-tcg-catalog-complete');
      let total = 0;
      const pageSize = 250;
      for (let page = 1; ; page++) {
        let json = null, lastError = null;
        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            const response = await fetch(`https://api.pokemontcg.io/v2/cards?page=${page}&pageSize=${pageSize}&orderBy=set.releaseDate`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            json = await response.json();
            if (!Array.isArray(json.data)) throw new Error('Resposta inválida do catálogo');
            break;
          } catch (err) {
            lastError = err;
            updateCatalogStatus(`Tentando carregar o catálogo (página ${page}, tentativa ${attempt}/4)…`);
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          }
        }
        if (!json) throw lastError || new Error('Falha ao carregar catálogo');
        total = Number(json.totalCount || total || 0);
        const batch = json.data.map(apiCardToLocal);
        if (!batch.length) break;
        await catalogPutMany(batch);
        const byId = new Map(allTcgCards.map(c => [c.id, c]));
        batch.forEach(c => byId.set(c.id, c));
        allTcgCards = [...byId.values()];
        batch.forEach(c => { tcgCardCache[c.id] = c; });
        updateCatalogStatus(`Baixando banco completo: página ${page} · ${allTcgCards.length.toLocaleString('pt-BR')} cartas com código e imagem${total ? ` de ${total.toLocaleString('pt-BR')}` : ''}…`);
        if (json.data.length < pageSize || (total && page * pageSize >= total)) break;
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      const verified = await catalogReadAll();
      allTcgCards = verified;
      if (total && verified.length < total) {
        catalogLoaded = false;
        updateCatalogStatus(`Banco parcial: ${verified.length.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} cartas. Clique em “Completar banco de cartas” para tentar novamente.`);
        return;
      }
      catalogLoaded = true;
      try { localStorage.setItem('m44-tcg-catalog-complete', '1'); } catch (_) {}
      try { LS.set('pk-tcg-card-cache-v1', Object.fromEntries(Object.entries(tcgCardCache).slice(-500))); } catch (_) {}
      updateCatalogStatus(`Banco completo pronto: ${verified.length.toLocaleString('pt-BR')} cartas com códigos e imagens salvas neste navegador.`);
    } catch (err) {
      catalogLoaded = false;
      updateCatalogStatus(`${allTcgCards.length ? `Banco parcial (${allTcgCards.length.toLocaleString('pt-BR')} cartas).` : 'O banco ainda não foi carregado.'} Não foi possível completar o download. Verifique a internet e clique em “Completar banco de cartas”.`);
    }
  })().finally(() => { catalogLoadPromise = null; });
  return catalogLoadPromise;
}
/* ---------- Busca por todos os tipos de código ----------
   Aceita: 90/128 · 090/128 · 90 · me55-90 · sv1 025 · SVI 25/198 (código PTCGO/Liga) · TG05 · GG10 · SWSH123 · SVP 045 */
const PTCGO_FALLBACK = { sv1:'SVI', sv2:'PAL', sv3:'OBF', sv3pt5:'MEW', sv4:'PAR', sv4pt5:'PAF', sv5:'TEF', sv6:'TWM', sv6pt5:'SFA', sv7:'SCR', sv8:'SSP', sv8pt5:'PRE', sv9:'JTG', sv10:'DRI', zsv10pt5:'BLK', rsv10pt5:'WHT',
  swsh1:'SSH', swsh2:'RCL', swsh3:'DAA', swsh35:'CPA', swsh4:'VIV', swsh45:'SHF', swsh5:'BST', swsh6:'CRE', swsh7:'EVS', cel25:'CEL', swsh8:'FST', swsh9:'BRS', swsh10:'ASR', pgo:'PGO', swsh11:'LOR', swsh12:'SIT', swsh12pt5:'CRZ',
  sm1:'SUM', sm2:'GRI', sm3:'BUS', sm35:'SLG', sm4:'CIN', sm5:'UPR', sm6:'FLI', sm7:'CES', sm75:'DRM', sm8:'LOT', sm9:'TEU', sm10:'UNB', sm11:'UNM', sm115:'HIF', sm12:'CEC', me1:'MEG', me2:'PFL', me2pt5:'ASC' };
let _ptcgoBySet = null;
function ptcgoOf(setId) {
  if (!_ptcgoBySet) {
    _ptcgoBySet = {};
    (window.M44_SETS_DB || []).forEach(x => { if (x.ptcgoCode) _ptcgoBySet[x.id] = String(x.ptcgoCode).toLowerCase(); });
  }
  return _ptcgoBySet[setId] || (PTCGO_FALLBACK[setId] || '').toLowerCase();
}
const cardSetId = c => { const t = String(c.tcgId || ''); const i = t.lastIndexOf('-'); return i > 0 ? t.slice(0, i).toLowerCase() : ''; };
// "TG05/30" -> { pre:'tg', num:5, suf:'', tot:'30' }
function cardNumInfo(c) {
  const m = /^([a-z]*)0*(\d+)([a-z]*)(?:\/(.+))?$/i.exec(String(c.number || '').replace(/\s+/g, ''));
  return m ? { pre: m[1].toLowerCase(), num: Number(m[2]), suf: m[3].toLowerCase(), tot: (m[4] || '').toLowerCase() } : null;
}
// Interpreta o que foi digitado; devolve null se não parecer um código.
function parseCodeQuery(raw) {
  const t = String(raw || '').trim().toLowerCase().replace(/[–—_]/g, '-').replace(/\s*\/\s*/g, '/');
  let m = /^0*(\d+)([a-z]?)(?:\/(\d*))?$/.exec(t.replace(/\s+/g, ''));
  if (m) return { kind: 'num', num: Number(m[1]), suf: m[2], tot: (m[3] || '').replace(/^0+(?=\d)/, '') };
  m = /^([a-z][a-z0-9]*?)[\s\-]*0*(\d+)([a-z]?)(?:\/(\w+))?$/.exec(t);
  if (m) return { kind: 'pre', pre: m[1], num: Number(m[2]), suf: m[3], tot: (m[4] || '').replace(/^0+(?=\d)/, '') };
  return null;
}
function codeMatches(c, q) {
  const n = cardNumInfo(c); if (!n) return false;
  if (n.num !== q.num || (q.suf && n.suf !== q.suf)) return false;
  const tot = n.tot.replace(/^[a-z]*0*(?=\d)/, '');
  if (q.tot && !tot.startsWith(q.tot.replace(/^[a-z]*0*(?=\d)/, ''))) return false;
  if (q.kind === 'num') return true;
  const sid = cardSetId(c);
  return q.pre === sid || q.pre === ptcgoOf(sid) || q.pre === n.pre || String(c.tcgId || '').toLowerCase() === `${q.pre}-${q.num}`;
}
const codeSuggestTimers = {};
async function findTcgCardsByPartialCode(query) {
  const clean = normalizeCardCode(query);
  // Sugere conforme qualquer parte da numeração digitada (ex.: 008 encontra
  // 008/068, 007/008 e 133/008), como a busca da Liga Pokémon.
  if (!clean || !/^\d+(?:\/\d*)?$/.test(clean) || clean.replace('/', '').length < 2) return [];
  const allLocal = data.flatMap(g => g.cards);
  const unique = new Map();
  [...allLocal, ...allTcgCards, ...Object.values(tcgCardCache)].forEach(c => {
    if (c && c.id && c.number) unique.set(c.id, c);
  });
  const matchesQuery = c => {
    const n = normalizeCardCode(c.number);
    return clean.includes('/') ? n.startsWith(clean) : n.includes(clean);
  };
  let matches = [...unique.values()].filter(matchesQuery);
  // Consulta online também durante a digitação, mesmo que o banco completo ainda não tenha acabado.
  try {
    const digits = clean.replace('/', '');
    const q = clean.includes('/')
      ? `number:${clean.split('/')[0]}*`
      : `number:*${digits}*`;
    const response = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=100&orderBy=-set.releaseDate`);
    if (response.ok) {
      const json = await response.json();
      const online = (json.data || []).map(apiCardToLocal);
      online.forEach(c => { tcgCardCache[c.id] = c; unique.set(c.id, c); });
      try { LS.set('pk-tcg-card-cache-v1', tcgCardCache); } catch (_) {}
      matches = [...unique.values()].filter(matchesQuery);
      // Também mantém resultados da API que correspondem ao início do numerador.
      if (!matches.length) matches = online.filter(matchesQuery);
    }
  } catch (_) { /* usa as sugestões locais quando offline */ }
  const seen = new Set();
  return matches.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id); return true;
  }).sort((a,b) => {
    const an = normalizeCardCode(a.number), bn = normalizeCardCode(b.number);
    const aStart = an.startsWith(clean), bStart = bn.startsWith(clean);
    return Number(bStart) - Number(aStart) || (a.setName || '').localeCompare(b.setName || '') || (a.name || '').localeCompare(b.name || '');
  }).slice(0, 10);
}
async function findTcgCardsByNameOrCode(query) {
  const raw = String(query || '').trim();
  const clean = normalizeCardCode(raw);
  if (!raw) return [];
  const allLocal = data.flatMap(g => g.cards);
  const unique = new Map();
  [...allLocal, ...allTcgCards, ...Object.values(tcgCardCache)].forEach(c => { if (c?.id) unique.set(c.id, c); });
  const isCode = /^\d+(?:\/\d*)?$/.test(clean);
  const cq = parseCodeQuery(raw);
  const low = raw.toLocaleLowerCase();
  const matchesLocal = c => (isCode && normalizeCardCode(c.number).includes(clean)) || (cq && codeMatches(c, cq))
    || (!isCode && (String(c.name || '').toLocaleLowerCase().includes(low) || String(c.setName || '').toLocaleLowerCase().includes(low)));
  let matches = [...unique.values()].filter(matchesLocal);
  // Consulta o catálogo online para nomes e códigos; os resultados guardam nome, número e imagem da MESMA carta.
  try {
    const safe = raw.replace(/[\\{}()[\]^"~*?:!+\-&|]/g, ' ').trim().replace(/\s+/g, ' ');
    const q = isCode
      ? (clean.includes('/') ? `number:${clean.split('/')[0]}*` : `number:*${clean}*`)
      : (cq && cq.kind === 'pre')
        ? `(set.id:${cq.pre} OR set.ptcgoCode:${cq.pre.toUpperCase()} OR number:${cq.pre.toUpperCase()}*) number:*${cq.num}*`
        : `name:${safe.split(' ').map(w => w + '*').join(' AND name:')}`;
    const response = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=100&orderBy=-set.releaseDate`);
    if (response.ok) {
      const json = await response.json();
      const online = (json.data || []).map(apiCardToLocal);
      online.forEach(c => { tcgCardCache[c.id] = c; unique.set(c.id, c); });
      try { LS.set('pk-tcg-card-cache-v1', tcgCardCache); } catch (_) {}
      matches = [...unique.values()].filter(matchesLocal);
      // Se a consulta textual for mais ampla que o filtro local, preservar os resultados válidos da API.
      if (!matches.length) matches = online;
    }
  } catch (_) { /* mantém busca local para uso offline */ }
  const seen = new Set();
  return matches.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; })
    .sort((a,b) => {
      const aa = isCode ? normalizeCardCode(a.number) : String(a.name || '').toLocaleLowerCase();
      const bb = isCode ? normalizeCardCode(b.number) : String(b.name || '').toLocaleLowerCase();
      const needle = isCode ? clean : raw.toLocaleLowerCase();
      return Number(aa.startsWith(needle)) * -1 + Number(bb.startsWith(needle)) || (a.setName || '').localeCompare(b.setName || '') || (a.name || '').localeCompare(b.name || '');
    }).slice(0, 30);
}
async function findTcgCardByCode(code) {
  const cq = parseCodeQuery(code);
  if (cq && cq.kind === 'pre') {
    const hit = [...allTcgCards, ...Object.values(tcgCardCache)].find(c => codeMatches(c, cq));
    if (hit) return hit;
  }
  const clean = normalizeCardCode(code);
  const local = data.flatMap(g => g.cards).find(c => normalizeCardCode(c.number) === clean || normalizeCardCode(c.number).endsWith('/' + clean));
  if (local) return local;
  const cached = [...allTcgCards, ...Object.values(tcgCardCache)].find(c => normalizeCardCode(c.number) === clean || normalizeCardCode(c.number).endsWith('/' + clean));
  if (cached) return cached;
  const numerator = clean.includes('/') ? clean.split('/')[0] : clean;
  if (!numerator) return null;
  // Pesquisa pelo número na base pública de cartas e valida o código/total no resultado.
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent('number:"' + numerator + '"')}&pageSize=250&orderBy=-set.releaseDate`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível consultar o catálogo online.');
  const json = await response.json();
  const cards = (json.data || []).map(apiCardToLocal);
  for (const c of cards) tcgCardCache[c.id] = c;
  LS.set('pk-tcg-card-cache-v1', tcgCardCache);
  let matches = cards.filter(c => normalizeCardCode(c.number) === clean || (!clean.includes('/') && normalizeCardCode(c.number).split('/')[0] === clean));
  if (clean.includes('/')) matches = matches.filter(c => normalizeCardCode(c.number).endsWith('/' + clean.split('/')[1]));
  return matches[0] || null;
}
function addHistory(email, rec) {
  const h = LS.get('pk-trades-' + email, []);
  h.unshift(rec);
  LS.set('pk-trades-' + email, h.slice(0, 20));
}
/* ---------- Preços (Liga Pokémon) e scanner ---------- */
const PRICE_API = ''; // URL de um servidor seu que consulte a Liga e responda JSON {min, avg, max} para ?q=NOME. Atualiza preços da vitrine e do scanner
const prices = LS.get('pk-prices', {});
const priceOf = id => (typeof prices[id] === 'number' ? prices[id] : null);
const setPrice = (id, v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  if (isFinite(n) && n >= 0) prices[id] = n; else delete prices[id];
  LS.set('pk-prices', prices);
};
const ligaUrl = query => `https://www.ligapokemon.com.br/?view=cards/search&card=${encodeURIComponent(query)}`;
function searchLigaByCode() {
  const input = document.getElementById('liga-code-search');
  const code = (input?.value || '').trim();
  if (!code) { alert('Digite o código da carta, por exemplo 123/198.'); input?.focus(); return; }
  window.open(ligaUrl(code), '_blank', 'noopener');
}
const priceLine = id => { const v = priceOf(id); return v != null
  ? `<span class="block text-xs font-semibold text-[#004de9] dark:text-[#6e9bff]">${brl(v)}</span>`
  : '<span class="block text-xs text-slate-400">sem preço</span>'; };
const priceEditor = id => { const v = priceOf(id), c = cardOf(id); return `<div class="flex flex-wrap items-center gap-2 mt-1 text-xs">
  <label class="text-slate-500">Preço Liga (R$)</label>
  <input data-price="${id}" inputmode="decimal" value="${v != null ? String(v).replace('.', ',') : ''}" placeholder="0,00" class="w-20 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
  <a href="${ligaUrl(`${c.name} ${c.number}`)}" target="_blank" rel="noopener" class="underline text-[#004de9] dark:text-[#6e9bff]">Consultar na Liga</a></div>`; };
function balance(o, mine) {
  const pg = priceOf(o.give), pw = priceOf(o.want);
  if (pg == null || pw == null) return '<p class="basis-full text-xs text-slate-500">Informe o preço Liga das duas cartas para comparar o valor da troca.</p>';
  const rec = mine ? pw : pg, giv = mine ? pg : pw, d = rec - giv;
  const txt = Math.abs(d) <= Math.max(rec, giv) * 0.15 ? 'Troca equilibrada' : d > 0 ? `Você recebe ${brl(d)} a mais em valor` : `Você entrega ${brl(-d)} a mais em valor`;
  return `<p class="basis-full text-xs font-semibold">${txt} <span class="font-normal text-slate-500">(com base nos preços da Liga)</span></p>`;
}

const scan = { busy: false, msg: '', ids: [] };
const loadTess = () => window.Tesseract ? Promise.resolve() : new Promise((ok, err) => {
  const el = document.createElement('script');
  el.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  el.onload = ok; el.onerror = () => err(new Error('cdn'));
  document.head.appendChild(el);
});
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 9;
  const d = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}
function matchNames(text) {
  const toks = [...new Set(text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter(t => t.length >= 3))];
  const hits = new Map();
  for (const c of data.flatMap(g => g.cards)) {
    const n = c.name.toLowerCase().replace(/[^a-z]/g, '');
    if (n.length < 3) continue;
    for (const t of toks) {
      const d = t.length >= 5 ? lev(n, t) : (n === t ? 0 : 9);
      if (d <= 1) hits.set(c.id, Math.max(hits.get(c.id) || 0, n.length * 2 - d * 3));
    }
  }
  return [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
}
async function autoPrice(id) {
  if (!PRICE_API || priceOf(id) != null) return;
  try {
    const j = await (await fetch(`${PRICE_API}?q=${encodeURIComponent(cardOf(id).name)}`)).json();
    if (j.avg) setPrice(id, j.avg);
  } catch {}
}
async function runScan(file) {
  scan.busy = true; scan.msg = ''; scan.ids = []; renderTrades();
  try {
    await loadTess();
    const { data: { text } } = await Tesseract.recognize(file, 'eng');
    scan.ids = matchNames(text);
    if (!scan.ids.length) scan.msg = 'Não consegui identificar o nome. Tente outra foto, com boa luz e a carta reta, ou use a busca de cartas abaixo.';
    else for (const id of scan.ids) await autoPrice(id);
  } catch { scan.msg = 'Não foi possível ler a imagem. Verifique sua internet e tente de novo.'; }
  scan.busy = false; renderTrades();
}
function scanBlock() {
  if (scan.busy) return '<p class="text-sm text-slate-500">Lendo a carta... na primeira vez o leitor de texto é baixado e pode demorar.</p>';
  if (scan.msg) return `<p class="text-sm text-slate-600 dark:text-slate-400">${esc(scan.msg)}</p>`;
  const b = 'px-3 py-1.5 rounded-lg text-sm font-semibold';
  return scan.ids.map(id => {
    const own = col.has(id);
    return `<div class="flex flex-wrap items-center gap-3 p-3 mb-2 rounded-xl border border-slate-200 dark:border-slate-800">${chip(cardOf(id))}
      <div class="flex-1 min-w-[200px]">${priceEditor(id)}<div class="flex flex-wrap gap-2 mt-2"><button data-scan="give" data-cid="${id}" class="${b} bg-[#004de9] text-white">Oferecer em troca</button>${own ? ''
        : `<button data-scan="own" data-cid="${id}" class="${b} border border-slate-300 dark:border-slate-700">Adicionar à minha coleção</button><button data-scan="want" data-cid="${id}" class="${b} border border-slate-300 dark:border-slate-700">Quero esta</button>`}</div></div></div>`;
  }).join('');
}

const chip = c => `<div class="text-center w-24"><img src="${c.image}" alt="${esc(c.name)}" loading="lazy" class="w-20 h-20 mx-auto object-contain"><span class="block text-xs text-slate-500 dark:text-slate-400">${c.number}</span><span class="block text-sm font-semibold truncate">${esc(c.name)}</span>${priceLine(c.id)}</div>`;
const btnCls = 'px-3 py-1.5 rounded-lg text-sm font-semibold';
function pickRes(key, term) {
  const locked = lockedIds(), t = term.trim().toLowerCase();
  const list = [...allTcgCards, ...Object.values(tcgCardCache)]
    .filter(c => c && c.tcgId && c.image && c.number && c.setName && /^https?:\/\//i.test(c.image))
    .filter(c => key === 'want' ? !col.has(c.id) : !locked.has(c.id))
    .filter(c => t && (c.name.toLowerCase().includes(t) || c.number.includes(t))).slice(0, 12);
  return list.map(c => `<button data-pick="${key}" data-cid="${c.id}" class="px-2 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 hover:border-[#004de9]">${c.number} ${esc(c.name)}</button>`).join('')
    || `<span class="text-xs text-slate-500">${t ? 'Nenhuma carta disponível' : 'Digite o nome ou o código para ver sugestões.'}</span>`;
}
const picker = (key, label) => `<div class="flex-1 min-w-[220px]">
  <p class="text-sm font-semibold mb-1">${label}</p>
  <div class="min-h-[100px] mb-2">${pick[key] ? chip(cardOf(pick[key])) : '<p class="text-xs text-slate-500">Nenhuma carta escolhida</p>'}</div>${pick[key] ? priceEditor(pick[key]) : ''}
  <input data-pq="${key}" placeholder="Buscar por nome ou código (ex.: 123/198)" class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
  <div class="flex flex-wrap gap-2 mt-2"><button type="button" data-code-pick="${key}" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#004de9] text-white">Selecionar pelo código</button><button type="button" data-liga-pick="${key}" class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:border-[#004de9]">Consultar preço na Liga Pokémon</button></div>
  <p class="text-xs text-slate-500 mt-1">Digite o nome da carta ou o código (ex.: Charizard ou 123/198) e selecione a sugestão com a imagem correspondente.</p>
  <p data-catalog-status class="text-[11px] text-slate-500 mt-1">${window.M44_DB?.cards?.length ? `Catálogo offline: ${window.M44_DB.cards.length.toLocaleString('pt-BR')} cartas` : catalogLoaded ? `Banco completo: ${allTcgCards.length.toLocaleString('pt-BR')} cartas` : 'Banco de cartas: aguardando carregamento…'}</p>
  <button type="button" data-catalog-retry class="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:border-[#004de9]">Completar banco de cartas</button>
  <div id="res-${key}" class="flex flex-wrap gap-1 mt-2">${pickRes(key, '')}</div>
  <div id="code-res-${key}" class="flex flex-col gap-1 mt-2" role="listbox" aria-label="Sugestões de cartas"></div></div>`;

function renderTrades() {
  const el = $('#trades');
  if (!data.length) { el.innerHTML = '<p class="py-16 text-center text-slate-500">Carregando cartas...</p>'; return; }
  if (!user) { el.innerHTML = '<p class="py-16 text-center text-slate-500">Entre com sua conta para publicar e aceitar trocas.</p>'; return; }
  const locked = lockedIds();
  const offer = o => {
    const g = cardOf(o.give), mine = o.owner === user.email;
    const single = !o.want;
    const w = single ? null : cardOf(o.want);
    let act;
    if (mine) act = `<button data-cancel="${o.id}" class="${btnCls} border border-slate-300 dark:border-slate-700">Remover anúncio</button>`;
    else if (single) act = '<span class="text-xs text-slate-500">Carta anunciada para troca</span>';
    else {
      const why = !col.has(o.want) ? `Você precisa ter ${w.name}` : col.has(o.give) ? `Você já tem ${g.name}` : locked.has(o.want) ? 'Sua carta está em outra oferta' : '';
      act = why ? `<span class="text-xs text-slate-500">${esc(why)}</span>` : `<button data-accept="${o.id}" class="${btnCls} bg-[#004de9] text-white">Aceitar troca</button>`;
    }
    if (!mine) act += ` <button data-chat-offer="${o.id}" class="${btnCls} border border-slate-300 dark:border-slate-700 ml-1">💬 Conversar</button>`;
    return `<div class="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <span class="w-20 text-sm font-semibold truncate">${esc(mine ? 'Você' : o.ownerName)}</span>${chip(g)}${single ? '<div class="min-w-[150px] flex-1"><p class="font-semibold text-sm">Quer trocar esta carta</p>${detailsLine(o)}<p class="text-xs text-slate-500 mt-1">Entre em contato com o anunciante para combinar a troca.</p></div>' : `<span class="text-xl text-slate-400">⇄</span>${chip(w)}${balance(o, mine)}`}<div class="ml-auto text-right">${act}</div></div>`;
  };
  // Seus próprios anúncios não aparecem aqui: ficam na aba "Minhas Cartas".
  const ordered = market.filter(o => o.owner !== user.email);
  const hist = LS.get('pk-trades-' + user.email, []).slice(0, 5);
  el.innerHTML = `
    <section class="mb-6 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <h2 class="font-bold mb-1">Buscar carta por código e consultar preço</h2>
      <p class="text-xs text-slate-500 mb-3">Digite a numeração impressa na carta (por exemplo, 123/198). A busca abrirá os resultados na Liga Pokémon para você conferir os preços atuais.</p>
      <form id="liga-code-form" class="flex flex-wrap gap-2">
        <input id="liga-code-search" type="text" autocomplete="off" placeholder="Código da carta (ex.: 123/198)" class="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
        <button id="btn-liga-code" type="submit" class="px-3 py-2 rounded-lg text-sm font-semibold bg-[#004de9] text-white">Buscar preço na Liga Pokémon</button>
      </form>
    </section>
    <section class="mb-6 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <h2 class="font-bold mb-1">Escanear carta</h2>
      <p class="text-xs text-slate-500 mb-3">Tire uma foto da carta com o nome legível. O app lê o texto e sugere o Pokémon para você confirmar.</p>
      <label class="${btnCls} inline-block bg-[#004de9] text-white cursor-pointer">Escanear com a câmera
        <input id="scan-file" type="file" accept="image/*" capture="environment" class="hidden"></label>
      <div class="mt-3">${scanBlock()}</div>
    </section>
    <section class="mb-6 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <h2 class="font-bold mb-1">Anunciar carta para troca</h2>
      <p class="text-xs text-slate-500 mb-3">Informe o código ou o nome da carta que você quer oferecer e publique. Não é preciso que ela esteja na sua coleção.</p>
      <div class="flex flex-wrap gap-5">${picker('give', 'Carta que quero trocar')}</div>
      <button id="btn-pub" class="${btnCls} mt-4 bg-[#004de9] text-white disabled:opacity-40" ${pick.give ? '' : 'disabled'}>Publicar carta</button>
    </section>
    <section class="mb-6">
      <div class="flex items-center justify-between mb-2"><h2 class="font-bold">Ofertas abertas</h2></div>
      <p class="text-xs text-slate-500 mb-3">Veja as cartas anunciadas pelos treinadores. Anúncios com uma única carta indicam o que a pessoa quer trocar.</p>
      <div class="space-y-3">${ordered.map(offer).join('') || '<p class="text-slate-500 py-6 text-center">Nenhuma oferta de outros treinadores no momento.</p>'}</div>
    </section>
    <section><h2 class="font-bold mb-2">Minhas trocas recentes</h2>
      ${hist.length ? hist.map(h => `<p class="text-sm text-slate-600 dark:text-slate-400">Você deu ${esc(cardOf(h.give).name)} e recebeu ${esc(cardOf(h.get).name)} de ${esc(h.with)}.</p>`).join('') : '<p class="text-sm text-slate-500">Nenhuma troca concluída.</p>'}
    </section>`;
}

/* ---------- Minhas Cartas: anúncios do próprio usuário (editar / remover) ---------- */
function renderMine() {
  const el = $('#mine');
  if (!user) { el.innerHTML = '<p class="py-16 text-center text-slate-500">Entre com sua conta para ver e editar suas cartas.</p>'; return; }
  if (!data.length) { el.innerHTML = '<p class="py-16 text-center text-slate-500">Carregando cartas...</p>'; return; }
  const mine = market.filter(o => o.owner === user.email);
  const row = o => {
    const g = cardOf(o.give);
    if (!g) return '';
    const editing = editingId === o.id;
    return `<div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <div class="flex flex-wrap items-center gap-3">${chip(g)}
        <div class="min-w-[150px] flex-1"><p class="font-semibold text-sm">${esc(g.name)}</p><p class="text-xs text-slate-500">${esc(g.number || '')}${g.setName ? ' · ' + esc(g.setName) : ''}</p>${detailsLine(o)}</div>
        <div class="ml-auto flex gap-2">${editing
          ? `<button data-edit-cancel class="${btnCls} border border-slate-300 dark:border-slate-700">Cancelar</button>`
          : `<button data-edit="${o.id}" class="${btnCls} bg-[#004de9] text-white">Editar</button><button data-cancel="${o.id}" class="${btnCls} border border-slate-300 dark:border-slate-700">Remover</button>`}</div>
      </div>
      ${editing ? `<div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
        <div class="grid gap-3 sm:grid-cols-3">
          <label class="block text-sm font-semibold">Valor (R$)<input data-edit-field="price" inputmode="decimal" value="${esc(editDraft.price)}" placeholder="0,00" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-normal"></label>
          <label class="block text-sm font-semibold">Condição<select data-edit-field="cond" class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-normal"><option value="">Não informada</option>${Object.entries(COND).map(([k, v]) => `<option value="${k}" ${editDraft.cond === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="block text-sm font-semibold sm:col-span-3">Observação (opcional)<input data-edit-field="note" maxlength="200" value="${esc(editDraft.note)}" placeholder="Ex.: pequena marca na borda, aceito troca por..." class="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-normal"></label>
        </div>
        <details class="mt-4"${pick.edit ? ' open' : ''}><summary class="cursor-pointer text-sm font-semibold">Trocar por outra carta (opcional)</summary><div class="flex flex-wrap gap-5 mt-3">${picker('edit', 'Nova carta deste anúncio')}</div></details>
        <button data-save-edit="${o.id}" class="${btnCls} mt-4 bg-[#004de9] text-white disabled:opacity-40">Salvar alterações</button></div>` : ''}
    </div>`;
  };
  const comPreco = mine.filter(o => typeof o.price === 'number');
  const total = comPreco.reduce((t, o) => t + o.price, 0);
  const resumo = mine.length ? `<div class="grid grid-cols-3 gap-2 mb-4 text-center">
      <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"><p class="text-xl font-extrabold">${mine.length}</p><p class="text-xs text-slate-500">anúncios</p></div>
      <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"><p class="text-xl font-extrabold text-[#004de9] dark:text-[#6e9bff]">${brl(total)}</p><p class="text-xs text-slate-500">valor anunciado</p></div>
      <div class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"><p class="text-xl font-extrabold">${mine.length - comPreco.length}</p><p class="text-xs text-slate-500">sem preço</p></div></div>` : '';
  el.innerHTML = `<section>
    <h2 class="font-bold mb-1">Minhas cartas anunciadas</h2>
    <p class="text-xs text-slate-500 mb-3">Só você vê esta lista. Os outros treinadores veem seus anúncios na aba Trocas; você não os vê lá. Para anunciar uma nova carta, use a aba Trocas.</p>
    ${resumo}
    <div class="space-y-3">${mine.map(row).join('') || '<p class="text-slate-500 py-6 text-center">Você ainda não anunciou nenhuma carta.</p>'}</div>
  </section>`;
}

function accept(id) {
  const o = market.find(x => x.id === id);
  if (!o || !user || !o.want) return;
  let oc = null;
  if (o.owner) {
    oc = new Set(LS.get('pk-col-' + o.owner, []));
    if (!oc.has(o.give) || oc.has(o.want)) {
      market = market.filter(x => x !== o); saveMarket();
      alert('Essa oferta não é mais válida e foi removida.');
      return renderTrades();
    }
    oc.delete(o.give); oc.add(o.want);
    LS.set('pk-col-' + o.owner, [...oc]);
    addHistory(o.owner, { give: o.give, get: o.want, with: user.name });
  }
  col.delete(o.want); col.add(o.give); saveCol();
  addHistory(user.email, { give: o.want, get: o.give, with: o.ownerName });
  market = market.filter(x => x !== o); saveMarket();
  render();
}

$('#trades').addEventListener('submit', e => {
  if (e.target.id === 'liga-code-form') { e.preventDefault(); searchLigaByCode(); }
});
const refresh = () => (tab === 'mine' ? renderMine() : renderTrades());
async function onTradeClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.hasAttribute('data-catalog-retry')) {
    updateCatalogStatus('Tentando completar o banco de cartas…');
    t.disabled = true;
    try { await preloadAllTcgCards(true); } finally { t.disabled = false; }
    return;
  }
  if (t.dataset.pick) { pick[t.dataset.pick] = t.dataset.cid; const inp = document.querySelector(`[data-pq="${t.dataset.pick}"]`); if (inp) inp.value = ''; const box = document.querySelector(`#code-res-${t.dataset.pick}`); if (box) box.innerHTML = ''; refresh(); }
  else if (t.dataset.codePick) {
    const key = t.dataset.codePick;
    const input = document.querySelector(`[data-pq="${key}"]`);
    const code = (input?.value || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!code) { alert('Digite o código da carta, por exemplo 123/198.'); input?.focus(); return; }
    const locked = lockedIds();
    let match;
    const button = t;
    button.disabled = true; button.textContent = 'Buscando...';
    try { match = (await findTcgCardsByNameOrCode(code))[0] || await findTcgCardByCode(code); }
    catch (err) { alert('Não consegui consultar o catálogo de cartas. Verifique sua conexão e tente novamente.'); }
    if (!match) { alert('Não encontrei uma carta com esse nome ou código. Confira o texto e tente novamente.'); refresh(); return; }
    if (key !== 'want' && locked.has(match.id)) { alert('Essa carta já está anunciada em outra troca.'); refresh(); return; }
    pick[key] = match.id;
    refresh();
  }
  else if (t.dataset.ligaPick) {
    const key = t.dataset.ligaPick;
    const input = document.querySelector(`[data-pq=\"${key}\"]`);
    const query = (input?.value || '').trim();
    if (!query) { alert('Digite o nome ou código da carta (ex.: 123/198).'); input?.focus(); return; }
    window.open(ligaUrl(query), '_blank', 'noopener');
  }
  else if (t.dataset.scan) {
    const id = t.dataset.cid, a = t.dataset.scan;
    if (a === 'own') { col.add(id); saveCol(); }
    else if (a === 'want') pick.want = id;
    else if (a === 'give' && !lockedIds().has(id)) pick.give = id;
    refresh();
  }
  else if (t.dataset.edit) {
    const o = market.find(x => x.id === t.dataset.edit);
    editingId = t.dataset.edit; pick.edit = null;
    editDraft = { price: o && o.price != null ? String(o.price).replace('.', ',') : '', cond: o?.condition || '', note: o?.note || '' };
    refresh();
  }
  else if (t.hasAttribute('data-edit-cancel')) { editingId = null; pick.edit = null; refresh(); }
  else if (t.dataset.saveEdit) {
    const id = t.dataset.saveEdit;
    const raw = editDraft.price.trim().replace(/\./g, '').replace(',', '.');
    const price = raw === '' ? null : Number(raw);
    if (price !== null && (!Number.isFinite(price) || price < 0)) { toast('Informe um valor válido, por exemplo 25,90.'); return; }
    const body = { price, condition: editDraft.cond, note: editDraft.note.trim() };
    if (pick.edit) body.giveCard = cardOf(pick.edit);
    t.disabled = true; t.textContent = 'Salvando...';
    try {
      const { offer } = await apiTrocas('PUT', { q: '?id=' + encodeURIComponent(id), body });
      const i = market.findIndex(o => o.id === id); if (i >= 0) market[i] = fromServer(offer);
      editingId = null; pick.edit = null; toast('Anúncio atualizado.');
    } catch (err) { toast(err.message); }
    refresh(); loadMarket();
  }
  else if (t.dataset.chatOffer) { if (window.M44Chat) window.M44Chat.open(t.dataset.chatOffer); }
  else if (t.dataset.accept) accept(t.dataset.accept);
  else if (t.dataset.cancel) {
    t.disabled = true;
    try { await apiTrocas('DELETE', { q: '?id=' + encodeURIComponent(t.dataset.cancel) }); market = market.filter(o => o.id !== t.dataset.cancel); if (editingId === t.dataset.cancel) editingId = null; toast('Anúncio removido.'); }
    catch (err) { toast(err.message); }
    refresh(); loadMarket();
  }
  else if (t.id === 'btn-pub' && pick.give) {
    if (lockedIds().has(pick.give)) { toast('Essa carta já está anunciada.'); return; }
    const giveCard = cardOf(pick.give);
    if (!giveCard) { toast('Carta não encontrada. Selecione novamente pelo código.'); return; }
    t.disabled = true; t.textContent = 'Publicando...';
    try {
      const { offer } = await apiTrocas('POST', { body: { giveCard } });
      market.unshift(fromServer(offer)); pick.give = null; toast('Carta publicada! Gerencie em "Minhas Cartas".');
    } catch (err) { toast(err.message); }
    refresh(); loadMarket();
  }
}
$('#trades').addEventListener('click', onTradeClick);
$('#mine').addEventListener('click', onTradeClick);
$('#trades').addEventListener('change', e => {
  if (e.target.id === 'scan-file' && e.target.files[0]) runScan(e.target.files[0]);
  else if (e.target.dataset.price) { setPrice(e.target.dataset.price, e.target.value); refresh(); }
});
function onTradeInput(e) {
  const f = e.target.dataset.editField;
  if (f) { editDraft[f] = e.target.value; return; }
  const k = e.target.dataset.pq;
  if (!k) return;
  const value = e.target.value;
  $('#res-' + k).innerHTML = pickRes(k, value);
  const suggestions = $('#code-res-' + k);
  if (codeSuggestTimers[k]) clearTimeout(codeSuggestTimers[k]);
  const typed = value.trim();
  if (typed.length < 2) { suggestions.innerHTML = ''; suggestions.className = 'flex flex-col gap-1 mt-2'; return; }
  suggestions.className = 'mt-1 max-h-80 overflow-y-auto flex flex-col gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-lg';
  suggestions.innerHTML = '<span class="text-xs text-slate-500 p-2">Buscando cartas por nome ou código…</span>';
  codeSuggestTimers[k] = setTimeout(async () => {
    const inputNow = document.querySelector(`[data-pq="${k}"]`);
    if (!inputNow || inputNow.value.trim() !== typed) return;
    const locked = lockedIds();
    try {
      const matches = await findTcgCardsByNameOrCode(typed);
      if (inputNow.value.trim() !== typed) return;
      const eligible = matches.filter(c => c && c.tcgId && c.image && c.number && c.setName && /^https?:\/\//i.test(c.image) && (k === 'want' || !locked.has(c.id)));
      suggestions.innerHTML = eligible.length ? eligible.map(c => `<button type="button" role="option" data-pick="${k}" data-cid="${c.id}" class="w-full flex items-center gap-3 text-left p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-[#004de9] hover:bg-blue-50 dark:hover:bg-slate-800 shadow-sm"><img src="${esc(c.image || '')}" alt="${esc(c.name || 'Carta Pokémon')}" class="w-14 h-20 object-contain shrink-0 rounded border border-slate-100 dark:border-slate-700" loading="lazy" onerror="this.style.opacity='.15'"><span class="min-w-0 flex-1"><span class="block text-sm font-semibold">${esc(c.name || 'Carta Pokémon')}</span><span class="block text-xs text-slate-500">${esc(c.number || '')} · ${esc(c.setName || '')}${c.rarity ? ' · ' + esc(c.rarity) : ''}</span></span><span class="text-xs font-bold text-[#004de9]">Selecionar</span></button>`).join('') : '<span class="text-xs text-slate-500 p-2">Nenhuma carta encontrada. Tente outro nome ou código.</span>';
    } catch (_) {
      suggestions.innerHTML = '<span class="text-xs text-slate-500 p-2">Não foi possível carregar sugestões online. Confira sua conexão; resultados já salvos continuam disponíveis.</span>';
    }
  }, 300);
}
$('#trades').addEventListener('input', onTradeInput);
$('#mine').addEventListener('input', onTradeInput);

addEventListener('storage', e => { if (e.key && /^pk-(col|sets|expcards)-/.test(e.key)) { loadCol(); render(); } });
loadCol();
renderUser();
initAuth().then(loadMarket).then(() => { if (window.M44Chat) window.M44Chat.refresh(); });
loadData();
preloadAllTcgCards();
loadSets();
render();
loadHighlightPrices();
loadStoreConfig();
