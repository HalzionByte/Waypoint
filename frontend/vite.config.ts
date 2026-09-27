import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The API and uploaded photos are proxied in dev so the browser sees a single
// origin. That keeps relative photo URLs (/uploads/...) and CORS simple.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/uploads': 'http://127.0.0.1:8000',
    },
  },
})
