// Prepara as cartas do carrossel da página inicial:
// - cria versões leves (.webp, 645x900 já no formato de carta) em assets/cartas/web/ a partir das imagens de assets/cartas/
// - gera assets/cartas/lista.js com os caminhos dessas versões
// Roda sozinho no deploy do Netlify (netlify.toml); localmente: npm run cartas (dentro de m44/)
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../assets/cartas/', import.meta.url))
const webDir = dir + 'web/'
const LARGURA = 645, ALTURA = 900 // formato de carta (63x88), igual ao corte do carrossel

const imagens = readdirSync(dir)
  .filter(f => /\.(png|jpe?g|webp|avif|gif)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))

let sharp = null
try { sharp = (await import('sharp')).default } catch { console.warn('lista-cartas: sharp indisponível, usando as imagens originais') }

let lista = imagens
if (sharp) {
  mkdirSync(webDir, { recursive: true })
  lista = []
  for (const f of imagens) {
    const out = f.replace(/\.[^.]+$/, '') + '.webp'
    const src = dir + f, dst = webDir + out
    try {
      if (!existsSync(dst) || statSync(dst).mtimeMs < statSync(src).mtimeMs) {
        await sharp(src).rotate().resize({ width: LARGURA, height: ALTURA, fit: 'cover' }).webp({ quality: 80 }).toFile(dst)
      }
      lista.push('web/' + out)
    } catch (e) {
      console.warn(`lista-cartas: não consegui converter ${f} (${e.message}), usando o original`)
      lista.push(f)
    }
  }
  // remove versões leves de imagens que saíram da pasta
  const usadas = new Set(lista.filter(f => f.startsWith('web/')).map(f => f.slice(4)))
  for (const f of readdirSync(webDir)) if (!usadas.has(f)) rmSync(webDir + f)
}

// .js (não .json) para funcionar também abrindo o index.html direto do disco, onde o fetch é bloqueado
writeFileSync(dir + 'lista.js', `// Gerado por scripts/lista-cartas.mjs, não edite à mão\nwindow.CARTAS = ${JSON.stringify(lista, null, 2)};\n`)
if (existsSync(dir + 'lista.json')) rmSync(dir + 'lista.json')
console.log(`lista-cartas: ${lista.length} carta(s) em assets/cartas/`)
