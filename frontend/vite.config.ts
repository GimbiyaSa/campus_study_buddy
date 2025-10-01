import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Use relative path directly; no URL needed
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src', // relative to project root
    },
  },
  server: {
    proxy: {
      // Point to backend on port 3000 (was incorrectly 5000 causing  proxy failures)
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/users': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
