import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // React-only build (Vue fully removed). All app code lives in src-* dirs;
    // shared plain-JS libs stay in src/ (api/utils/icons/charts/store/composables).
    react({ include: '{src-site,src-home,src-task,src-alarm,src-report,src-rack,src-db,src-shell,src-ui}/**/*.{js,jsx}' })
  ],
  server: {
    port: 6107,
    proxy: {
      '/api': { target: 'http://localhost:6007', changeOrigin: true },
      '/health': { target: 'http://localhost:6007', changeOrigin: true }
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
})
