import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

type SpaFallbackRequest = {
  url?: string
  method?: string
  headers: {
    accept?: string | string[]
  }
}

const appRoutePrefixes = [
  '/site',
  '/login',
  '/register',
  '/local-demo-login',
  '/painel',
  '/suporte',
  '/contatar-suporte',
  '/documentos',
  '/auditoria',
  '/produtos-e-equipamentos',
  '/clientes',
  '/intercorrencias',
  '/assinatura',
  '/pagamentos',
  '/agendamentos',
  '/servicos',
  '/profissionais',
]

function spaRouteFallbackPlugin(): Plugin {
  return {
    name: 'lappui-spa-route-fallback',
    enforce: 'pre',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (request, response, next) => {
        const incoming = request as SpaFallbackRequest
        const pathname = (incoming.url || '/').split('?')[0]
        const acceptHeader = incoming.headers.accept
        const acceptsHtml = Array.isArray(acceptHeader)
          ? acceptHeader.some(item => item.includes('text/html'))
          : Boolean(acceptHeader?.includes('text/html'))
        const isAppRoute = appRoutePrefixes.some(route => pathname === route || pathname.startsWith(`${route}/`))

        if (incoming.method !== 'GET' || !acceptsHtml || !isAppRoute) {
          next()
          return
        }

        try {
          const template = await readFile(join(server.config.root, 'index.html'), 'utf8')
          const html = await server.transformIndexHtml(pathname, template)
          response.statusCode = 200
          response.setHeader('Content-Type', 'text/html')
          response.end(html)
        } catch (error) {
          next(error as Error)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [spaRouteFallbackPlugin(), react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) {
            return 'forms'
          }

          if (id.includes('date-fns')) {
            return 'date-utils'
          }

          if (id.includes('axios')) {
            return 'http'
          }

          if (id.includes('react-hot-toast')) {
            return 'feedback'
          }

          return 'vendor'
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
  },
})

