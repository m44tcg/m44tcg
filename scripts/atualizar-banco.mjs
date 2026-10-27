// Atualiza js/m44-db.js com TODAS as expansões e cartas do repositório público pokemon-tcg-data
// (antigas e novas, incluindo promos, Trainer Gallery, Galarian Gallery, Shiny Vault etc.)
// e acrescenta o código PTCGO/Liga (ptcgoCode, ex.: SVI, PAL, OBF) de cada expansão.
//
// Uso (precisa de internet e Node 18+):   node scripts/atualizar-banco.mjs
// Opções: --so-novas   só baixa expansões que ainda não estão no banco (mais rápido)
//
// Não apaga nada: expansões/cartas que já existem no banco e não vierem do repositório são mantidas.
import { readFile, writeFile } from 'node:fs/promises'
import vm from 'node:vm'

const ARQ = new URL('../js/m44-db.js', import.meta.url)
const BASE = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master'
const soNovas = process.argv.includes('--so-novas')

const get = async (url, tentativas = 3) => {
  for (let i = 1; i <= tentativas; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return await r.json()
      if (r.status === 404) return null
    } catch {}
    await new Promise(r => setTimeout(r, 800 * i))
  }
  return null
}

// 1) lê o banco atual
const src = await readFile(ARQ, 'utf8')
const ctx = { window: {} }
vm.runInNewContext(src, ctx)
const atual = ctx.window.M44_DB
if (!atual?.sets || !atual?.cards) throw new Error('Não consegui ler js/m44-db.js')
console.log(`Banco atual: ${atual.sets.length} expansões, ${atual.cards.length} cartas`)

// 2) baixa a lista de expansões
const remotos = await get(`${BASE}/sets/en.json`)
if (!Array.isArray(remotos)) throw new Error('Não consegui baixar a lista de expansões (verifique a internet).')

const setsPorId = new Map(atual.sets.map(s => [s.id, s]))
const cartasPorSet = new Map()
for (const r of atual.cards) { if (!cartasPorSet.has(r[3])) cartasPorSet.set(r[3], []); cartasPorSet.get(r[3]).push(r) }

const imgPeq = (set, n) => `https://images.pokemontcg.io/${set}/${n}.png`
const imgGra = (set, n) => `https://images.pokemontcg.io/${set}/${n}_hires.png`
const linha = (c, setId) => {
  const row = [c.id, c.name, String(c.number), setId, c.rarity || '']
  const p = c.images?.small, g = c.images?.large
  // só guarda a URL quando ela difere do padrão (economiza tamanho)
  if ((p && p !== imgPeq(setId, c.number)) || (g && g !== imgGra(setId, c.number))) row.push(p || '', g || '')
  return row
}

let novasSets = 0, cartasAdd = 0, setsAtualizados = 0
for (const rs of remotos) {
  const existente = setsPorId.get(rs.id)
  const meta = { id: rs.id, name: rs.name, series: rs.series, printedTotal: rs.printedTotal, total: rs.total,
    releaseDate: rs.releaseDate, images: rs.images, ...(rs.ptcgoCode ? { ptcgoCode: rs.ptcgoCode } : {}) }
  if (existente) {
    if (rs.ptcgoCode && !existente.ptcgoCode) existente.ptcgoCode = rs.ptcgoCode
    if (soNovas) continue
  } else { atual.sets.push(meta); setsPorId.set(rs.id, meta); novasSets++ }

  const cartas = await get(`${BASE}/cards/en/${rs.id}.json`)
  if (!Array.isArray(cartas) || !cartas.length) { console.log(`  ${rs.id}: sem dados, mantido como está`); continue }
  const antigas = cartasPorSet.get(rs.id) || []
  if (cartas.length < antigas.length) { console.log(`  ${rs.id}: repositório tem menos cartas (${cartas.length} < ${antigas.length}), mantido`); continue }
  const ids = new Set(antigas.map(r => r[0]))
  const novas = cartas.filter(c => !ids.has(c.id)).map(c => linha(c, rs.id))
  if (novas.length) { cartasPorSet.set(rs.id, [...antigas, ...novas]); cartasAdd += novas.length; setsAtualizados++; console.log(`  ${rs.id}: +${novas.length} cartas`) }
}

// 3) ordena expansões por data e grava
atual.sets.sort((a, b) => String(a.releaseDate).localeCompare(String(b.releaseDate)))
const ordem = new Map(atual.sets.map((s, i) => [s.id, i]))
const cards = [...cartasPorSet.entries()].sort((a, b) => (ordem.get(a[0]) ?? 9999) - (ordem.get(b[0]) ?? 9999)).flatMap(([, v]) => v)
const out = { geradoEm: new Date().toISOString().slice(0, 10), sets: atual.sets, cards, dex: atual.dex }
const cab = '/* Catálogo Pokémon TCG pré-carregado (expansões, cartas e Pokédex). Gerado a partir de pokemon-tcg-data e PokéAPI. */\n'
await writeFile(ARQ, `${cab}window.M44_DB=${JSON.stringify(out)};\n`)
console.log(`\nPronto: ${novasSets} expansões novas, +${cartasAdd} cartas em ${setsAtualizados} expansões.`)
console.log(`Total agora: ${out.sets.length} expansões, ${out.cards.length} cartas. Faça o deploy e aumente o ?v= no index.html.`)
