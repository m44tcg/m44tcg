// Repassa imagens de cartas pelo próprio domínio, para que o navegador possa
// desenhá-las no canvas (exportar o catálogo em JPG) mesmo sem CORS na origem.
const PERMITIDOS = ['images.pokemontcg.io'];

export default async (req) => {
  const u = new URL(req.url).searchParams.get('u') || '';
  let alvo;
  try { alvo = new URL(u); } catch { return new Response('URL inválida', { status: 400 }); }
  if (alvo.protocol !== 'https:' || !PERMITIDOS.includes(alvo.hostname)) {
    return new Response('Domínio não permitido', { status: 403 });
  }
  const r = await fetch(alvo);
  if (!r.ok) return new Response('Imagem não encontrada', { status: 404 });
  const tipo = r.headers.get('content-type') || '';
  if (!tipo.startsWith('image/')) return new Response('Tipo inválido', { status: 415 });
  return new Response(r.body, {
    headers: { 'Content-Type': tipo, 'Cache-Control': 'public, max-age=604800, immutable' }
  });
};

export const config = { path: '/img-carta' };
