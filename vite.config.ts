import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2020', assetsInlineLimit: 2048, rollupOptions: { input: { main: resolve(__dirname, 'index.html'), docs: resolve(__dirname, 'docs/index.html') } } },
})
