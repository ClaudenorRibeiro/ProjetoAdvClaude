// ============================================================
// Regra do projeto: o módulo de Relatórios NÃO pode virar um arquivo gigante.
// Nenhum arquivo (código ou teste) das pastas de Relatórios passa de MAX linhas.
// Rode: node quality/check-tamanho-relatorios.js   (sai com erro se algum passar)
// ============================================================
const fs = require('node:fs');
const path = require('node:path');

const MAX = 300;
const raiz = path.join(__dirname, '..');
const alvos = [
  'backend/src/services/relatorios',
  'backend/src/controllers/relatoriosController.js',
  'backend/src/routes/relatorios.js',
  'frontend/src/pages/Relatorios/novo',
];

function arquivos(caminho) {
  const completo = path.join(raiz, caminho);
  if (!fs.existsSync(completo)) return [];
  if (fs.statSync(completo).isFile()) return [completo];
  return fs.readdirSync(completo, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? arquivos(path.join(caminho, e.name)) : /\.(js|mjs)$/.test(e.name) ? [path.join(completo, e.name)] : []));
}

const todos = alvos.flatMap(arquivos);
const grandes = todos
  .map(f => ({ f: path.relative(raiz, f), linhas: fs.readFileSync(f, 'utf8').split('\n').length }))
  .filter(x => x.linhas > MAX);

console.log(`Relatórios: ${todos.length} arquivos conferidos (limite ${MAX} linhas cada).`);
if (grandes.length) {
  grandes.forEach(x => console.error(`  PASSOU DO LIMITE: ${x.f} (${x.linhas} linhas) — divida em arquivos menores.`));
  process.exit(1);
}
console.log('OK: nenhum arquivo passou do limite.');
