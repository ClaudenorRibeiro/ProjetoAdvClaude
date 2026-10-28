import { defineConfig, devices } from '@playwright/test';
import { API_DE_TESTE, PORTA_DO_SERVIDOR_DE_TESTE } from './e2e/portas.js';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  timeout: 90_000,   // máquina lenta (Windows): vários testes longos passavam de 40 s; o limite de cada verificação continua 8 s (expect abaixo)
  expect: { timeout: 8_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/e2e-junit.xml' }],
  ],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  webServer: [
    {
      command: 'node ../backend/tests/support/startTestServer.js',
      env: { TEST_BACKEND_PORT: String(PORTA_DO_SERVIDOR_DE_TESTE) },
      url: `${API_DE_TESTE}/public/info`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run start -- --host 127.0.0.1 --port 4173',
      // a tela de teste fala com o servidor de TESTE (3201), nunca com o do sistema aberto (3001)
      env: { VITE_API_PROXY: `http://127.0.0.1:${PORTA_DO_SERVIDOR_DE_TESTE}` },
      url: 'http://127.0.0.1:4173/login',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'tablet', use: { ...devices['iPad Pro 11'] } },
  ],
});
