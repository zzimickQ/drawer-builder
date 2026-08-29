import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/ — this repo is
  // `drawer-builder`. Set VITE_BASE to override, e.g. VITE_BASE=/ for a
  // user/org site.
  base: process.env.VITE_BASE ?? '/drawer-builder/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
