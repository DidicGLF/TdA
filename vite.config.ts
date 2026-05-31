import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync } from 'fs'
import { resolve } from 'path'
import type { IncomingMessage, ServerResponse } from 'http'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'save-json',
      configureServer(server) {
        server.middlewares.use('/api/save-json', (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', () => {
            try {
              const { file, data } = JSON.parse(body) as { file: string; data: unknown }
              const allowed = ['descriptions.json', 'traits-magiques.json', 'peuples.json', 'compagnons.json', 'voies.json', 'armes.json', 'armures.json', 'traits-raciaux.json']
              if (!allowed.includes(file)) { res.statusCode = 400; res.end('Fichier non autorisé'); return }
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
  base: './',
  build: {
    rollupOptions: {
      output: {
        format: 'iife',
      },
    },
  },
})
