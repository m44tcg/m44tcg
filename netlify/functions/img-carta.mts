import type { Config } from '@netlify/functions'

// Repasse das imagens das cartas para o mesmo domínio do site.
// Usado pelo "Baixar como imagens (JPG)" do Meu Catálogo: o canvas só consegue exportar
// imagens da mesma origem (ou com CORS liberado), e images.pokemontcg.io nem sempre libera.
const HOSTS = ['images.pokemontcg.io', 'images.scrydex.com']
const MAX_BYTES = 3 * 1024 * 1024

export default async (req: Request) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })
  const raw = new URL(req.url).searchParams.get('u') || ''
  let alvo: URL
  try { alvo = new URL(raw) } catch { return new Response('URL inválida', { status: 400 }) }
  if (alvo.protocol !== 'https:' || !HOSTS.includes(alvo.hostname) || alvo.username || alvo.password) {
    return new Response('Host não permitido', { status: 400 })
  }

  let r: Response
  try {
    r = await fetch(alvo.toString(), { signal: AbortSignal.timeout(10000), redirect: 'error' })
  } catch {
    return new Response('Imagem indisponível', { status: 502 })
  }
  if (!r.ok) return new Response('Imagem não encontrada', { status: r.status === 404 ? 404 : 502 })

  const tipo = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(tipo)) return new Response('Tipo inválido', { status: 415 })
  const dados = await r.arrayBuffer()
  if (dados.byteLength > MAX_BYTES) return new Response('Imagem muito grande', { status: 413 })

  return new Response(dados, {
    headers: {
      'Content-Type': tipo,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=86400',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=2592000, stale-while-revalidate=86400',
    },
  })
}

export const config: Config = { path: '/img-carta' }
