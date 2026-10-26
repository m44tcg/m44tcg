import type { Config } from '@netlify/functions'
import { getUser } from '@netlify/identity'
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { conversations, tradeOffers } from '../../db/schema.js'

// Anúncios de troca compartilhados: todos veem, só usuários logados publicam e só o dono edita ou remove.
const MAX_POR_USUARIO = 50
const CONDICOES = ['NM', 'SP', 'MP', 'HP', 'D'] as const // Near Mint, Slightly Played, Moderately Played, Heavily Played, Damaged
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const cleanCondition = (v: unknown) => {
  const c = str(v, 4).toUpperCase()
  return (CONDICOES as readonly string[]).includes(c) ? c : null
}

function cleanCard(c: any) {
  if (!c || typeof c !== 'object') return null
  const card = {
    id: str(c.id, 120), name: str(c.name, 120), number: str(c.number, 40),
    image: str(c.image, 500), setName: str(c.setName, 120), tcgId: str(c.tcgId, 80),
  }
  if (!card.id || !card.name || !/^https?:\/\//i.test(card.image)) return null
  return card
}

const toJson = (r: typeof tradeOffers.$inferSelect, userId?: string) => ({
  id: String(r.id), ownerName: r.ownerName, mine: !!userId && r.ownerId === userId,
  give: r.giveId, giveCard: r.giveCard, want: r.wantId, wantCard: r.wantCard,
  condition: r.condition, createdAt: r.createdAt,
})

// Cria a coluna "condition" no primeiro acesso após o deploy (idempotente: se já existir, não faz nada).
// Dispensa rodar o drizzle-kit à mão. Se você passar a usar migrações do drizzle, pode remover isto.
let colunaPronta: Promise<unknown> | null = null
const garantirColuna = () => (colunaPronta ??= db.execute(sql`ALTER TABLE "trade_offers" ADD COLUMN IF NOT EXISTS "condition" text`)
  .catch(e => { colunaPronta = null; throw e }))

export default async (req: Request) => {
  await garantirColuna()
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
    const condition = cleanCondition(body?.condition)
    if (!condition) return Response.json({ error: 'Selecione a condição da carta (NM, SP, MP, HP ou D).' }, { status: 400 })
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(tradeOffers).where(eq(tradeOffers.ownerId, user.id))
    if (n >= MAX_POR_USUARIO) return Response.json({ error: `Limite de ${MAX_POR_USUARIO} anúncios atingido.` }, { status: 400 })
    const dup = await db.select({ id: tradeOffers.id }).from(tradeOffers)
      .where(and(eq(tradeOffers.ownerId, user.id), eq(tradeOffers.giveId, give.id))).limit(1)
    if (dup.length) return Response.json({ error: 'Essa carta já está anunciada.' }, { status: 409 })
    const email = String(user.email || '').toLowerCase()
    const [row] = await db.insert(tradeOffers).values({
      ownerId: user.id, ownerEmail: email,
      ownerName: str(user.name, 80) || email.split('@')[0] || 'Treinador',
      giveId: give.id, giveCard: give, condition,
    }).returning()
    return Response.json({ offer: toJson(row, user.id) }, { status: 201 })
  }

  // PATCH /api/trocas?id=123  { condition?, giveCard? } → só o dono edita o próprio anúncio
  if (req.method === 'PATCH') {
    const id = Number(new URL(req.url).searchParams.get('id'))
    if (!Number.isInteger(id)) return Response.json({ error: 'Anúncio inválido.' }, { status: 400 })
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return Response.json({ error: 'Dados inválidos.' }, { status: 400 })

    const [atual] = await db.select().from(tradeOffers)
      .where(and(eq(tradeOffers.id, id), eq(tradeOffers.ownerId, user.id))).limit(1)
    if (!atual) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })

    const set: Partial<typeof tradeOffers.$inferInsert> = {}
    let novaCarta: ReturnType<typeof cleanCard> = null

    if ('condition' in body) {
      const condition = cleanCondition(body.condition)
      if (!condition) return Response.json({ error: 'Condição inválida. Use NM, SP, MP, HP ou D.' }, { status: 400 })
      set.condition = condition
    }
    if (body.giveCard) {
      novaCarta = cleanCard(body.giveCard)
      if (!novaCarta) return Response.json({ error: 'Carta inválida.' }, { status: 400 })
      if (novaCarta.id !== atual.giveId) {
        const dup = await db.select({ id: tradeOffers.id }).from(tradeOffers)
          .where(and(eq(tradeOffers.ownerId, user.id), eq(tradeOffers.giveId, novaCarta.id), ne(tradeOffers.id, id))).limit(1)
        if (dup.length) return Response.json({ error: 'Essa carta já está anunciada.' }, { status: 409 })
        set.giveId = novaCarta.id
        set.giveCard = novaCarta
      } else novaCarta = null
    }
    if (!Object.keys(set).length) return Response.json({ error: 'Nada para atualizar.' }, { status: 400 })

    const [row] = await db.update(tradeOffers).set(set)
      .where(and(eq(tradeOffers.id, id), eq(tradeOffers.ownerId, user.id))).returning()
    // Mantém as conversas já abertas coerentes com a carta anunciada.
    if (novaCarta) {
      await db.update(conversations)
        .set({ cardName: str(novaCarta.name, 120) || 'Carta', cardImage: str(novaCarta.image, 500) })
        .where(eq(conversations.offerId, id))
    }
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
