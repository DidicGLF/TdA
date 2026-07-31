import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import type { IncomingMessage, ServerResponse } from 'http'

const ALLOWED_FILES = ['descriptions.json', 'traits-magiques.json', 'peuples.json', 'compagnons.json', 'voies.json', 'armes.json', 'armures.json', 'traits-raciaux.json', 'hidden-voies.json', 'hidden-peuples.json', 'hidden-cultures.json', 'hidden-compagnons.json', 'bestiaire.json', 'capacites-bibliotheque.json', 'field-positions.json']

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // WebKitGTK (webview Linux de Tauri) garde un cache HTTP disque PERSISTANT pour l'app, séparé du
      // serveur Vite et de son propre cache (node_modules/.vite) — il survit aux redémarrages de
      // `npm run tauri dev` d'une session à l'autre (~/.local/share/<identifier>/WebKitCache). Résultat :
      // une modif de source peut s'afficher correctement avec `npm run dev` (onglet de navigateur neuf,
      // sans ce cache) mais rester périmée avec `npm run tauri dev` (même profil WebView réutilisé), déjà
      // vu avec l'étape wizard Psychologie et les phrases d'aide objets magiques. Interdire toute mise en
      // cache des réponses du serveur de dev supprime la source du problème à la racine plutôt que de
      // devoir vider le cache disque à la main à chaque fois.
      name: 'no-cache-dev',
      configureServer(server) {
        server.middlewares.use((_req: IncomingMessage, res: ServerResponse, next: () => void) => {
          res.setHeader('Cache-Control', 'no-store')
          next()
        })
      },
    },
    {
      name: 'data-api',
      configureServer(server) {
        server.middlewares.use('/api/load-json', (req: IncomingMessage, res: ServerResponse) => {
          const url = new URL(req.url ?? '', 'http://localhost')
          const file = url.searchParams.get('file') ?? ''
          if (!ALLOWED_FILES.includes(file)) { res.statusCode = 400; res.end('Fichier non autorisé'); return }
          const target = resolve(__dirname, 'src/data', file)
          if (!existsSync(target)) { res.statusCode = 404; res.end('Not found'); return }
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(readFileSync(target, 'utf-8'))
        })

        server.middlewares.use('/api/save-json', (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', () => {
            try {
              const { file, data } = JSON.parse(body) as { file: string; data: unknown }
              if (!ALLOWED_FILES.includes(file)) { res.statusCode = 400; res.end('Fichier non autorisé'); return }
              const target = resolve(__dirname, 'src/data', file)
              writeFileSync(target, JSON.stringify(data, null, 2) + '\n', 'utf-8')
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } catch (e) {
              res.statusCode = 500; res.end(String(e))
            }
          })
        })
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    // Sans ça, Vite n'écoute que sur localhost : injoignable depuis un autre appareil du réseau local
    // (ex. un téléphone Android testant le Mode de jeu/réseau) même une fois le pare-feu ouvert — le
    // serveur de dev lui-même ne reçoit jamais la connexion. host:true l'ouvre à toutes les interfaces.
    host: true,
    watch: {
      ignored: ['**/src/data/**'],
    },
  },
  base: './',
  build: {
    rollupOptions: {
      output: {
        format: 'iife',
      },
    },
  },
})
