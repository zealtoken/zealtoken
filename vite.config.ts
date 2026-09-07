import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api/wrap-status': { target: 'https://7uuuf4b2axfi7spojunedozbei0umsxk.lambda-url.us-east-2.on.aws', changeOrigin: true, rewrite: (p) => p.replace('/api/wrap-status', '/') }, '/api': { target: 'https://zealtoken.com', changeOrigin: true } } },
  build: { target: 'es2020', assetsInlineLimit: 2048, rollupOptions: { input: { main: resolve(__dirname, 'index.html'), docs: resolve(__dirname, 'docs/index.html') } } },
})
