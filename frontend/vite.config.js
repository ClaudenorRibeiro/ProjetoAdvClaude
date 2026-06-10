// ============================================================
// CONFIGURAÇÃO DO VITE — Build tool moderno (substitui CRA)
// Start: ~1-3 segundos | CRA antigo: 30-60 segundos
// ============================================================

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // Permite usar JSX dentro de arquivos .js sem precisar renomear para .jsx
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.js$/,
    exclude: [],
  },

  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },

  server: {
    port: 3000,   // Mesma porta do CRA — sem mudar os bat files
    open: true,   // Abre o browser SÓ depois que compilar (não antes)
    proxy: {
      // Redireciona /api para o backend — substitui o "proxy" do package.json do CRA
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'build', // Mantém pasta 'build' — server.js de produção não muda
  },
});
