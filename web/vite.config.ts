import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths: the site works under any sub-path (e.g. GitHub Pages /klimat-polski/).
  base: './',
  // plotly.js is one lazily loaded ~480 kB (gzip) chunk; that size is expected.
  build: {
    chunkSizeWarningLimit: 1600,
    // Second page: the small embeddable stripes widget (embed.html).
    rollupOptions: { input: { main: 'index.html', embed: 'embed.html' } },
  },
})
