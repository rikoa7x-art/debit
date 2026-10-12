import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app-v11.js',
        chunkFileNames: 'assets/[name]-v11.js',
        assetFileNames: 'assets/[name]-v11.[ext]'
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
