import type { Config } from '@netlify/functions'
import { getUser } from '@netlify/identity'
import { getStore } from '@netlify/blobs'
import { and, asc, desc, eq, gt, inArray, ne, isNull, or, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../../db/index.js'
import { conversations, messages, tradeOffers } from '../../db/schema.js'

// Chat privado entre anunciante e interessado. Só os dois participantes da conversa leem e escrevem.
// Rotas (todas exigem login):
//   GET  /api/chat/conversations
//   POST /api/chat/conversations                      { offerId }
//   GET  /api/chat/conversations/:id/messages         ?after=<id da última mensagem>
//   POST /api/chat/conversations/:id/messages         multipart: body (texto) e/ou image (arquivo)
//   GET  /api/chat/messages/:id/image
//   DELETE /api/chat/conversations/:id                (só se o anúncio já foi removido)
const MAX_TEXTO = 2000
const MAX_IMAGEM = 4 * 1024 * 1024
const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp']
const MAX_MSGS_POR_CARGA = 200

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const erro = (msg: string, status: number) => Response.json({ error: msg }, { status, headers: { 'Cache-Control': 'no-store' } })
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

type Conv = typeof conversations.$inferSelect
const participa = (c: Conv, uid: string) => c.ownerId === uid || c.interestedId === uid

function conversaJson(c: Conv, uid: string, unread = 0) {
  return {
    id: c.id,
    peerName: uid === c.ownerId ? c.interestedName : c.ownerName,
    cardName: c.cardName,
    cardImage: c.cardImage,
    lastPreview: c.lastPreview,
    lastMine: c.lastSenderId === uid,
    lastAt: c.lastMessageAt,
    unread,
    offerActive: c.offerId !== null,
  }
}

// Bloqueia requisições de escrita vindas de outros sites (defesa extra contra CSRF).
const crossSite = (req: Request) => {
  if (req.method === 'GET' || req.method === 'HEAD') return false
  const o = req.headers.get('origin'); if (!o) return false
  try { return new URL(o).host !== new URL(req.url).host } catch { return true }
}
// Confere o conteúdo real do arquivo (não confia no tipo informado pelo navegador).
function tipoReal(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

export default async (req: Request) => {
  if (crossSite(req)) return erro('Origem não permitida.', 403)
  const user = await getUser()
  if (!user) return erro('Entre com sua conta para continuar.', 401)
  const uid = user.id
  const nome = str(user.name, 80) || String(user.email || '').split('@')[0] || 'Treinador'

  const url = new URL(req.url)
  const partes = url.pathname.replace(/^\/api\/chat\/?/, '').split('/').filter(Boolean)

  /* ---------- /conversations ---------- */
  if (partes.length === 1 && partes[0] === 'conversations') {
    if (req.method === 'GET') {
      const rows = await db.select().from(conversations)
        .where(or(eq(conversations.ownerId, uid), eq(conversations.interestedId, uid)))
        .orderBy(desc(conversations.lastMessageAt)).limit(200)
      const naoLidas = new Map<number, number>()
      if (rows.length) {
        const cont = await db.select({ id: messages.conversationId, n: sql<number>`count(*)::int` }).from(messages)
          .where(and(inArray(messages.conversationId, rows.map(r => r.id)), ne(messages.senderId, uid), isNull(messages.readAt)))
          .groupBy(messages.conversationId)
        for (const c of cont) naoLidas.set(c.id, c.n)
      }
      return json({ conversations: rows.map(r => conversaJson(r, uid, naoLidas.get(r.id) || 0)) })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null)
      const offerId = Number(body?.offerId)
      if (!Number.isInteger(offerId)) return erro('Anúncio inválido.', 400)
      const [oferta] = await db.select().from(tradeOffers).where(eq(tradeOffers.id, offerId)).limit(1)
      if (!oferta) return erro('Esse anúncio não existe mais.', 404)
      if (oferta.ownerId === uid) return erro('Esse anúncio é seu. Aguarde alguém te chamar.', 400)

      const busca = () => db.select().from(conversations)
        .where(and(eq(conversations.offerId, offerId), eq(conversations.interestedId, uid))).limit(1)
      let [conv] = await busca()
      if (!conv) {
        const carta: any = oferta.giveCard || {}
        await db.insert(conversations).values({
          offerId, ownerId: oferta.ownerId, ownerName: oferta.ownerName,
          interestedId: uid, interestedName: nome,
          cardName: str(carta.name, 120) || 'Carta',
          cardImage: str(carta.image, 500),
        }).onConflictDoNothing()
        ;[conv] = await busca()
      }
      if (!conv) return erro('Não foi possível abrir a conversa.', 500)
      return json({ conversation: conversaJson(conv, uid) })
    }
    return new Response('Method not allowed', { status: 405 })
  }

  /* ---------- DELETE /conversations/:id (só conversas de anúncio já removido/finalizado) ---------- */
  if (partes.length === 2 && partes[0] === 'conversations' && req.method === 'DELETE') {
    const convId = Number(partes[1])
    if (!Number.isInteger(convId)) return erro('Conversa inválida.', 400)
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId)).limit(1)
    if (!conv || !participa(conv, uid)) return erro('Conversa não encontrada.', 404)
    if (conv.offerId !== null) return erro('Só é possível excluir conversas de anúncios já finalizados ou removidos.', 409)
    // Apaga as imagens guardadas e depois a conversa (as mensagens saem junto, por ON DELETE CASCADE).
    const comImagem = await db.select({ key: messages.imageKey }).from(messages)
      .where(and(eq(messages.conversationId, convId), sql`${messages.imageKey} is not null`))
    const store = getStore('chat-images')
    await Promise.allSettled(comImagem.map(m => (m.key ? store.delete(m.key) : Promise.resolve())))
    await db.delete(conversations).where(eq(conversations.id, convId))
    return json({ ok: true })
  }

  /* ---------- /conversations/:id/messages ---------- */
  if (partes.length === 3 && partes[0] === 'conversations' && partes[2] === 'messages') {
    const convId = Number(partes[1])
    if (!Number.isInteger(convId)) return erro('Conversa inválida.', 400)
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId)).limit(1)
    if (!conv || !participa(conv, uid)) return erro('Conversa não encontrada.', 404)

    if (req.method === 'GET') {
      const after = Number(url.searchParams.get('after')) || 0
      let rows
      if (after) {
        rows = await db.select().from(messages)
          .where(and(eq(messages.conversationId, convId), gt(messages.id, after)))
          .orderBy(asc(messages.id)).limit(MAX_MSGS_POR_CARGA)
      } else {
        rows = (await db.select().from(messages).where(eq(messages.conversationId, convId))
          .orderBy(desc(messages.id)).limit(MAX_MSGS_POR_CARGA)).reverse()
      }
      // Marca como lidas as mensagens do outro participante.
      await db.update(messages).set({ readAt: new Date() })
        .where(and(eq(messages.conversationId, convId), ne(messages.senderId, uid), isNull(messages.readAt)))
      return json({
        messages: rows.map(m => ({ id: m.id, mine: m.senderId === uid, body: m.body, image: !!m.imageKey, createdAt: m.createdAt })),
      })
    }

    if (req.method === 'POST') {
      let form: FormData
      try { form = await req.formData() } catch { return erro('Mensagem inválida.', 400) }
      const texto = str(form.get('body'), MAX_TEXTO)
      const arquivo = form.get('image')
      const temImagem = arquivo instanceof File && arquivo.size > 0
      if (!texto && !temImagem) return erro('Escreva uma mensagem ou anexe uma imagem.', 400)

      // Limite de envio: no máximo 30 mensagens por minuto por usuário.
      const [{ n: recentes }] = await db.select({ n: sql<number>`count(*)::int` }).from(messages)
        .where(and(eq(messages.senderId, uid), gt(messages.createdAt, new Date(Date.now() - 60_000))))
      if (recentes >= 30) return erro('Você está enviando mensagens rápido demais. Aguarde um instante.', 429)

      let imageKey: string | null = null, imageType: string | null = null
      if (temImagem) {
        const f = arquivo as File
        if (!TIPOS_IMAGEM.includes(f.type)) return erro('Use uma imagem JPG, PNG ou WebP.', 400)
        if (f.size > MAX_IMAGEM) return erro('Imagem muito grande.', 400)
        const dados = await f.arrayBuffer()
        const real = tipoReal(new Uint8Array(dados, 0, Math.min(16, dados.byteLength)))
        if (!real) return erro('Arquivo de imagem inválido.', 400)
        imageKey = `${convId}/${randomUUID()}`
        imageType = real
        await getStore('chat-images').set(imageKey, dados, { metadata: { type: real } })
      }

      const [msg] = await db.insert(messages).values({
        conversationId: convId, senderId: uid, body: texto, imageKey, imageType,
      }).returning()
      await db.update(conversations).set({
        lastPreview: texto ? texto.slice(0, 120) : '📷 Imagem',
        lastSenderId: uid,
        lastMessageAt: msg.createdAt,
      }).where(eq(conversations.id, convId))
      return json({ message: { id: msg.id, mine: true, body: msg.body, image: !!msg.imageKey, createdAt: msg.createdAt } }, 201)
    }
    return new Response('Method not allowed', { status: 405 })
  }

  /* ---------- /messages/:id/image ---------- */
  if (partes.length === 3 && partes[0] === 'messages' && partes[2] === 'image' && req.method === 'GET') {
    const msgId = Number(partes[1])
    if (!Number.isInteger(msgId)) return erro('Imagem inválida.', 400)
    const [msg] = await db.select().from(messages).where(eq(messages.id, msgId)).limit(1)
    if (!msg || !msg.imageKey) return erro('Imagem não encontrada.', 404)
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, msg.conversationId)).limit(1)
    if (!conv || !participa(conv, uid)) return erro('Imagem não encontrada.', 404)
    const dados = await getStore('chat-images').get(msg.imageKey, { type: 'arrayBuffer' })
    if (!dados) return erro('Imagem não encontrada.', 404)
    return new Response(dados, {
      headers: {
        'Content-Type': msg.imageType && TIPOS_IMAGEM.includes(msg.imageType) ? msg.imageType : 'image/jpeg',
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  return erro('Rota não encontrada.', 404)
}

export const config: Config = { path: ['/api/chat', '/api/chat/*'] }
