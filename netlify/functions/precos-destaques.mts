import type { Config } from '@netlify/functions'

// Valores de mercado das "Cartas raras em alta": TCGplayer (USD) e Cardmarket (EUR) via pokemontcg.io, convertidos para BRL.
export default async (req: Request) => {
  const ids = (new URL(req.url).searchParams.get('ids') || '')
    .split(',').map(s => s.trim()).filter(s => /^[a-z0-9.]+-[a-z0-9]+$/i.test(s)).slice(0, 30)
  if (!ids.length) return Response.json({ error: 'Informe ?ids=set-numero' }, { status: 400 })

  const q = ids.map(id => `id:${id}`).join(' OR ')
  const [cardsRes, fxRes] = await Promise.allSettled([
    fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&select=id,tcgplayer,cardmarket&pageSize=50`, { signal: AbortSignal.timeout(20000) }).then(r => r.json()),
    fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(8000) }).then(r => r.json()),
  ])
  if (cardsRes.status !== 'fulfilled' || !Array.isArray(cardsRes.value?.data)) {
    return Response.json({ error: 'Preços indisponíveis no momento' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
  const rates = fxRes.status === 'fulfilled' ? fxRes.value?.rates : null
  const usdBrl = Number(rates?.BRL) || null
  const eurBrl = usdBrl && Number(rates?.EUR) ? usdBrl / Number(rates.EUR) : null

  const cards: Record<string, unknown> = {}
  for (const c of cardsRes.value.data) {
    const variants = Object.values(c.tcgplayer?.prices || {}) as Array<Record<string, number>>
    // Usa a variante mais valiosa (holofoil, 1st edition etc.)
    const best = variants.filter(v => v.market || v.mid).sort((a, b) => (b.market || b.mid) - (a.market || a.mid))[0]
    const cm = c.cardmarket?.prices
    const usd = best ? best.market || best.mid : null
    const eur = cm ? cm.trendPrice || cm.averageSellPrice || null : null
    cards[c.id] = {
      usd, usdLow: best?.low ?? null,
      eur,
      brl: usd && usdBrl ? Math.round(usd * usdBrl * 100) / 100 : eur && eurBrl ? Math.round(eur * eurBrl * 100) / 100 : null,
      atualizado: c.tcgplayer?.updatedAt || c.cardmarket?.updatedAt || null,
      tcgplayer: c.tcgplayer?.url || null,
    }
  }
  return Response.json({ usdBrl, eurBrl, cards, ts: Date.now() }, {
    headers: {
      'Cache-Control': 'public, max-age=600',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
    },
  })
}

export const config: Config = { path: '/api/precos-destaques' }
