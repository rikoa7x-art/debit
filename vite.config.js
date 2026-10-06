import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/debit/' : '/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app-v9.js',
        chunkFileNames: 'assets/[name]-v9.js',
        assetFileNames: 'assets/[name]-v9.[ext]'
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
