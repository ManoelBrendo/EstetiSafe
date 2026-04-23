import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
