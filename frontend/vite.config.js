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
    // Prepara TODAS as bibliotecas de uma vez ao ligar o servidor de desenvolvimento. Sem isto, o Vite descobre
    // react-select/date-fns só quando a tela que os usa abre e RECARREGA a página no meio (derrubava testes de tela).
    // Só vale para o servidor de desenvolvimento (testes e uso local); o build de produção não muda.
    include: [
      'react', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client', 'react-router-dom', 'react-toastify', 'axios',
      'react-select', 'react-big-calendar', 'date-fns', 'date-fns/locale', 'date-fns/locale/pt-BR',
    ],
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
