import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/osnee/',
  plugins: [react(), tailwindcss()],
  server: {
    // The Node backend (server/*.mjs) writes its JSON "databases" into
    // data/*.json on every mutation. Without this, Vite's dev-server file
    // watcher treats those writes as source changes and force-reloads the
    // page — wiping in-progress client state (e.g. the cartographer run
    // screen) the instant a backend call persists anything.
    watch: {
      ignored: ['**/data/**'],
    },
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
      '/api/radar': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/api/cartographer': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
