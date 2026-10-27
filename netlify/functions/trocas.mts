import type { Config } from '@netlify/functions'
import { getUser } from '@netlify/identity'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { tradeOffers } from '../../db/schema.js'

// Anúncios de troca compartilhados: todos veem, só usuários logados publicam e só o dono remove.
const MAX_POR_USUARIO = 50
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function cleanCard(c: any) {
  if (!c || typeof c !== 'object') return null
  const card = {
    id: str(c.id, 120), name: str(c.name, 120), number: str(c.number, 40),
    image: str(c.image, 500), setName: str(c.setName, 120), tcgId: str(c.tcgId, 80),
  }
  if (!card.id || !card.name || !/^https?:\/\//i.test(card.image)) return null
  return card
}

// Detalhes do anúncio (guardados dentro do JSON da carta, sem mudar o schema).
const CONDICOES = ['M', 'NM', 'SP', 'MP', 'HP', 'D']
const cleanPrice = (v: unknown) => {
  if (v === null || v === '' || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? Math.round(n * 100) / 100 : undefined
}
const cleanCond = (v: unknown) => (typeof v === 'string' && CONDICOES.includes(v) ? v : '')

const toJson = (r: typeof tradeOffers.$inferSelect, userId?: string) => ({
  id: String(r.id), ownerName: r.ownerName, mine: !!userId && r.ownerId === userId,
  give: r.giveId, giveCard: r.giveCard, want: r.wantId, wantCard: r.wantCard, createdAt: r.createdAt,
})

export default async (req: Request) => {
  const user = await getUser()

  if (req.method === 'GET') {
    const rows = await db.select().from(tradeOffers).orderBy(desc(tradeOffers.createdAt)).limit(300)
    return Response.json({ offers: rows.map(r => toJson(r, user?.id)) }, { headers: { 'Cache-Control': 'no-store' } })
  }

  if (!user) return Response.json({ error: 'Entre com sua conta para continuar.' }, { status: 401 })

  if (req.method === 'POST') {
    const body = await req.json().catch(() => null)
    const give = cleanCard(body?.giveCard)
    if (!give) return Response.json({ error: 'Carta inválida.' }, { status: 400 })
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(tradeOffers).where(eq(tradeOffers.ownerId, user.id))
    if (n >= MAX_POR_USUARIO) return Response.json({ error: `Limite de ${MAX_POR_USUARIO} anúncios atingido.` }, { status: 400 })
    const dup = await db.select({ id: tradeOffers.id }).from(tradeOffers)
      .where(and(eq(tradeOffers.ownerId, user.id), eq(tradeOffers.giveId, give.id))).limit(1)
    if (dup.length) return Response.json({ error: 'Essa carta já está anunciada.' }, { status: 409 })
    const email = String(user.email || '').toLowerCase()
    const [row] = await db.insert(tradeOffers).values({
      ownerId: user.id, ownerEmail: email,
      ownerName: str(user.name, 80) || email.split('@')[0] || 'Treinador',
      giveId: give.id, giveCard: give,
    }).returning()
    return Response.json({ offer: toJson(row, user.id) }, { status: 201 })
  }

  // Edição: só o dono troca a carta do próprio anúncio.
  if (req.method === 'PUT') {
    const id = Number(new URL(req.url).searchParams.get('id'))
    if (!Number.isInteger(id)) return Response.json({ error: 'Anúncio inválido.' }, { status: 400 })
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return Response.json({ error: 'Dados inválidos.' }, { status: 400 })
    const [own] = await db.select().from(tradeOffers).where(and(eq(tradeOffers.id, id), eq(tradeOffers.ownerId, user.id))).limit(1)
    if (!own) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })
    const prev: any = own.giveCard || {}
    // Carta: troca só se enviada; senão mantém a atual.
    const base = cleanCard(body.giveCard ?? prev)
    if (!base) return Response.json({ error: 'Carta inválida.' }, { status: 400 })
    const price = 'price' in body ? cleanPrice(body.price) : (prev.price ?? null)
    if (price === undefined) return Response.json({ error: 'Valor inválido.' }, { status: 400 })
    const condition = 'condition' in body ? cleanCond(body.condition) : (prev.condition || '')
    const note = 'note' in body ? str(body.note, 200) : (prev.note || '')
    if (own.giveId !== base.id) {
      const dup = await db.select({ id: tradeOffers.id }).from(tradeOffers)
        .where(and(eq(tradeOffers.ownerId, user.id), eq(tradeOffers.giveId, base.id))).limit(1)
      if (dup.length) return Response.json({ error: 'Essa carta já está anunciada.' }, { status: 409 })
    }
    const [row] = await db.update(tradeOffers).set({ giveId: base.id, giveCard: { ...base, price, condition, note } })
      .where(and(eq(tradeOffers.id, id), eq(tradeOffers.ownerId, user.id))).returning()
    return Response.json({ offer: toJson(row, user.id) })
  }

  if (req.method === 'DELETE') {
    const id = Number(new URL(req.url).searchParams.get('id'))
    if (!Number.isInteger(id)) return Response.json({ error: 'Anúncio inválido.' }, { status: 400 })
    const del = await db.delete(tradeOffers).where(and(eq(tradeOffers.id, id), eq(tradeOffers.ownerId, user.id))).returning({ id: tradeOffers.id })
    if (!del.length) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })
    return Response.json({ ok: true })
  }

  return new Response('Method not allowed', { status: 405 })
}

export const config: Config = { path: '/api/trocas' }
