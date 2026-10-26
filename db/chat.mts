import type { Config } from '@netlify/functions'
import { getUser } from '@netlify/identity'
import { getStore } from '@netlify/blobs'
import { and, desc, eq, gt, gte, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { conversations, messages, tradeOffers } from '../../db/schema.js'

// Chat privado entre anunciante e interessado. Todo acesso é validado no servidor:
// só os dois participantes leem mensagens e imagens da conversa.
const MAX_TEXT = 2000
const MAX_IMG = 4 * 1024 * 1024
const MAX_POR_MINUTO = 20
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const fail = (error: string, status: number) => Response.json({ error }, { status })
const NO_STORE = { 'Cache-Control': 'no-store' }

// Confere os primeiros bytes: não confia no Content-Type enviado pelo cliente.
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

const toConv = (c: typeof conversations.$inferSelect, uid: string, unread = 0) => {
  const iAmOwner = c.ownerId === uid
  return {
    id: c.id, offerId: c.offerId, offerActive: c.offerId != null, iAmOwner,
    peerName: iAmOwner ? c.interestedName : c.ownerName,
    cardName: c.cardName, cardImage: c.cardImage,
    lastPreview: c.lastPreview, lastMine: c.lastSenderId === uid, lastAt: c.lastMessageAt, unread,
  }
}
const toMsg = (m: typeof messages.$inferSelect, uid: string) => ({
  id: m.id, mine: m.senderId === uid, body: m.body, image: !!m.imageKey, createdAt: m.createdAt,
})

async function myConversation(id: number, uid: string) {
  if (!Number.isInteger(id)) return null
  const [c] = await db.select().from(conversations)
    .where(and(eq(conversations.id, id), or(eq(conversations.ownerId, uid), eq(conversations.interestedId, uid)))).limit(1)
  return c || null
}

export default async (req: Request) => {
  const user = await getUser()
  if (!user) return fail('Entre com sua conta para continuar.', 401)
  const uid = user.id
  const url = new URL(req.url)
  const [a, b, c] = url.pathname.replace(/^\/api\/chat\/?/, '').split('/').filter(Boolean)
  const store = getStore({ name: 'chat-images', consistency: 'strong' })

  // GET /api/chat/conversations  → minhas conversas + não lidas
  if (a === 'conversations' && !b && req.method === 'GET') {
    const rows = await db.select().from(conversations)
      .where(or(eq(conversations.ownerId, uid), eq(conversations.interestedId, uid)))
      .orderBy(desc(conversations.lastMessageAt)).limit(100)
    const unread = new Map<number, number>()
    if (rows.length) {
      const u = await db.select({ id: messages.conversationId, n: sql<number>`count(*)::int` }).from(messages)
        .where(and(inArray(messages.conversationId, rows.map(r => r.id)), ne(messages.senderId, uid), isNull(messages.readAt)))
        .groupBy(messages.conversationId)
      u.forEach(x => unread.set(x.id, x.n))
    }
    return Response.json({ conversations: rows.map(r => toConv(r, uid, unread.get(r.id) || 0)) }, { headers: NO_STORE })
  }

  // POST /api/chat/conversations  { offerId } → abre (ou reaproveita) a conversa com o anunciante
  if (a === 'conversations' && !b && req.method === 'POST') {
    const body = await req.json().catch(() => null)
    const offerId = Number(body?.offerId)
    if (!Number.isInteger(offerId)) return fail('Anúncio inválido.', 400)
    const [offer] = await db.select().from(tradeOffers).where(eq(tradeOffers.id, offerId)).limit(1)
    if (!offer) return fail('Anúncio não encontrado.', 404)
    if (offer.ownerId === uid) return fail('Você não pode conversar com o seu próprio anúncio.', 400)
    const card = (offer.giveCard || {}) as any
    const email = String(user.email || '').toLowerCase()
    await db.insert(conversations).values({
      offerId, ownerId: offer.ownerId, ownerName: offer.ownerName,
      interestedId: uid, interestedName: str(user.name, 80) || email.split('@')[0] || 'Treinador',
      cardName: str(card.name, 120) || 'Carta', cardImage: str(card.image, 500),
    }).onConflictDoNothing()
    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.offerId, offerId), eq(conversations.interestedId, uid))).limit(1)
    return Response.json({ conversation: toConv(conv, uid) })
  }

  // /api/chat/conversations/:id/messages
  if (a === 'conversations' && b && c === 'messages') {
    const conv = await myConversation(Number(b), uid)
    if (!conv) return fail('Conversa não encontrada.', 404)

    if (req.method === 'GET') {
      const after = Number(url.searchParams.get('after'))
      const rows = Number.isInteger(after) && after > 0
        ? await db.select().from(messages).where(and(eq(messages.conversationId, conv.id), gt(messages.id, after))).orderBy(messages.id).limit(200)
        : (await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(desc(messages.id)).limit(100)).reverse()
      if (rows.some(r => r.senderId !== uid && !r.readAt)) {
        await db.update(messages).set({ readAt: new Date() })
          .where(and(eq(messages.conversationId, conv.id), ne(messages.senderId, uid), isNull(messages.readAt)))
      }
      return Response.json({ messages: rows.map(r => toMsg(r, uid)) }, { headers: NO_STORE })
    }

    if (req.method === 'POST') {
      const form = await req.formData().catch(() => null)
      if (!form) return fail('Mensagem inválida.', 400)
      const text = str(form.get('body'), MAX_TEXT)
      const file = form.get('image') as any
      const hasFile = !!file && typeof file === 'object' && typeof file.arrayBuffer === 'function' && file.size > 0
      if (!text && !hasFile) return fail('Escreva uma mensagem ou anexe uma imagem.', 400)

      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(messages)
        .where(and(eq(messages.senderId, uid), gte(messages.createdAt, new Date(Date.now() - 60_000))))
      if (n >= MAX_POR_MINUTO) return fail('Você está enviando mensagens rápido demais. Aguarde um instante.', 429)

      let imageKey: string | null = null, imageType: string | null = null
      if (hasFile) {
        if (file.size > MAX_IMG) return fail('Imagem muito grande (máximo 4 MB).', 413)
        const buf = await file.arrayBuffer()
        imageType = sniff(new Uint8Array(buf, 0, Math.min(16, buf.byteLength)))
        if (!imageType) return fail('Formato de imagem não suportado. Use JPG, PNG ou WebP.', 415)
        imageKey = `${conv.id}/${crypto.randomUUID()}`
        await store.set(imageKey, buf, { metadata: { type: imageType } })
      }

      const [row] = await db.insert(messages).values({ conversationId: conv.id, senderId: uid, body: text, imageKey, imageType }).returning()
      await db.update(conversations).set({
        lastPreview: (text || '📷 Imagem').slice(0, 80), lastSenderId: uid, lastMessageAt: row.createdAt,
      }).where(eq(conversations.id, conv.id))
      return Response.json({ message: toMsg(row, uid) }, { status: 201 })
    }
  }

  // GET /api/chat/messages/:id/image  → só para os dois participantes
  if (a === 'messages' && b && c === 'image' && req.method === 'GET') {
    const id = Number(b)
    if (!Number.isInteger(id)) return fail('Imagem inválida.', 400)
    const [m] = await db.select().from(messages).where(eq(messages.id, id)).limit(1)
    if (!m || !m.imageKey) return fail('Imagem não encontrada.', 404)
    if (!(await myConversation(m.conversationId, uid))) return fail('Imagem não encontrada.', 404)
    const buf = await store.get(m.imageKey, { type: 'arrayBuffer' })
    if (!buf) return fail('Imagem não encontrada.', 404)
    return new Response(buf, { headers: { 'Content-Type': m.imageType || 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } })
  }

  return new Response('Not found', { status: 404 })
}

export const config: Config = { path: ['/api/chat', '/api/chat/*'] }
