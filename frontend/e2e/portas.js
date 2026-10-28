// IMPORTANTE — NÃO APAGAR: portas do teste de navegador (Playwright). O servidor de TESTE usa a 3201 e não a 3001, para a bateria
// poder rodar com o sistema aberto (3001/3000) e com o NovoJud SaaS aberto no mesmo PC. Quem usa: playwright.config.js e os testes de e2e.
export const PORTA_DO_SERVIDOR_DE_TESTE = Number(process.env.TEST_BACKEND_PORT || 3201);
export const API_DE_TESTE = `http://127.0.0.1:${PORTA_DO_SERVIDOR_DE_TESTE}/api`;
