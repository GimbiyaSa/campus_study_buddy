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
      '/courses': { target: 'http://localhost:5000', changeOrigin: true },
      '/users': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
});
