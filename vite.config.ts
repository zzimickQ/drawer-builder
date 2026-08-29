import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/ — set VITE_BASE to
  // override, e.g. VITE_BASE=/ if deploying to a user/org site.
  base: process.env.VITE_BASE ?? '/drawer_builder/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
