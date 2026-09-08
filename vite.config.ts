import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true, secure: false },
      // /logo é servido pelo backend (a pasta está na raiz, não em public)
      '/logo': { target: 'http://localhost:3000', changeOrigin: true, secure: false },
    },
  },
})
