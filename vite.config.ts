import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/osnee/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/agent': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/api/companies': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/api/leads': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/api/campaigns': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
