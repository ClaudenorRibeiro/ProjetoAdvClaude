import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { transformWithEsbuild } from 'vite';

const jsComoJsx = {
  name: 'novojud-js-como-jsx-nos-testes',
  enforce: 'pre',
  async transform(codigo, id) {
    if (!/[\\/]src[\\/].*\.js$/.test(id)) return null;
    return transformWithEsbuild(codigo, id, { loader: 'jsx', jsx: 'automatic' });
  },
};

export default defineConfig({
  plugins: [jsComoJsx, react()],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.js$/,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['src/**/*.test.js'],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './test-results/coverage',
      include: ['src/utils/formatters.js', 'src/utils/sugestoesPublicacao.js'],
      thresholds: { lines: 90, functions: 95, statements: 90, branches: 65 },
    },
  },
});
