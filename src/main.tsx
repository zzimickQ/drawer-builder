import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// HashRouter keeps routing working on GitHub Pages (no server-side
// redirect to index.html needed — everything lives after the #).
// Each tool is its own route so views are deep-linkable and the
// browser back/forward buttons switch between them:
//   #/          → Drawer Builder
//   #/cutlist   → Cutlist optimizer
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/cutlist" element={<App />} />
        <Route path="*" element={<App />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
)
