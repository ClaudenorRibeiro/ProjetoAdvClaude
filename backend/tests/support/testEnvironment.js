const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const NOMES_PROIBIDOS = new Set(['sistema_advocacia', 'erick_adv', 'novojud', 'production', 'producao']);
const HOSTS_LOCAIS = new Set(['127.0.0.1', 'localhost', '::1']);

function carregarAmbienteTeste() {
  const arquivoLocal = path.join(__dirname, '../../.env.test');
  if (fs.existsSync(arquivoLocal)) dotenv.config({ path: arquivoLocal, override: true });

  const nome = String(process.env.TEST_DB_NAME || '').trim().toLowerCase();
  const usuario = String(process.env.TEST_DB_USER || '').trim().toLowerCase();
  const host = String(process.env.TEST_DB_HOST || '127.0.0.1').trim().toLowerCase();

  if (!nome.endsWith('_test') || NOMES_PROIBIDOS.has(nome)) {
    throw new Error('SEGURANÇA: TEST_DB_NAME deve terminar em _test e nunca pode ser um banco real.');
  }
  if (!usuario || usuario === 'root' || usuario === 'admin') {
    throw new Error('SEGURANÇA: use um usuário MySQL exclusivo de testes; root/admin são recusados.');
  }
  const hostPermitido = HOSTS_LOCAIS.has(host) || (host === 'mysql' && process.env.CI === 'true');
  if (!hostPermitido) {
    throw new Error('SEGURANÇA: a bateria só aceita MySQL local ou o serviço isolado mysql da CI.');
  }
  if (!process.env.TEST_DB_PASSWORD) throw new Error('TEST_DB_PASSWORD não foi informado.');

  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = host;
  process.env.DB_PORT = process.env.TEST_DB_PORT || '3306';
  process.env.DB_USER = process.env.TEST_DB_USER;
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD;
  process.env.DB_NAME = nome;
  process.env.JWT_SECRET = process.env.TEST_JWT_SECRET || 'chave-exclusiva-dos-testes-com-mais-de-32-caracteres';
  process.env.FRONTEND_URL = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:4173';

  return { nome, usuario, host };
}

module.exports = { carregarAmbienteTeste, NOMES_PROIBIDOS, HOSTS_LOCAIS };
