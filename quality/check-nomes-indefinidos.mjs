// IMPORTANTE — NÃO APAGAR. Etapa da bateria (quality/run.mjs): acha NOME INDEFINIDO no código
// (função/variável/componente usado sem existir), que só estoura quando alguém clica na tela e
// derruba a página inteira. Foi assim que "impedirAlteracaoDataPorRoda is not defined" ficou
// escondido no cadastro de testemunha da ata. Usa o TypeScript (instalado no frontend) só para
// LER os arquivos .js do frontend e do backend; só os erros "Cannot find name" reprovam.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsc = path.join(raiz, 'frontend', 'node_modules', 'typescript', 'bin', 'tsc');
if (!fs.existsSync(tsc)) { console.error('TypeScript não está instalado no frontend (rode npm install em frontend).'); process.exit(1); }

// 2304/2552: nome não encontrado; 2503: namespace não encontrado; 2686: UMD global usado em módulo
const REPROVA = /error TS(2304|2552|2503|2686):/;
let achados = 0;
for (const [rotulo, pasta] of [['frontend', 'frontend'], ['backend', 'backend']]) {
  const r = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.nomes.json', '--pretty', 'false'], {
    cwd: path.join(raiz, pasta), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) { console.error(`${rotulo}: não consegui rodar o TypeScript: ${r.error.message}`); process.exit(1); }
  const linhas = `${r.stdout}\n${r.stderr}`.split(/\r?\n/);
  if (linhas.some(l => /error TS5\d{3}:/.test(l))) { console.error(`${rotulo}: configuração do TypeScript inválida:\n${linhas.filter(l => /TS5\d{3}/.test(l)).join('\n')}`); process.exit(1); }
  const erros = linhas.filter(l => REPROVA.test(l));
  achados += erros.length;
  console.log(`${rotulo}: ${erros.length ? erros.length + ' nome(s) indefinido(s)' : 'nenhum nome indefinido'}`);
  erros.forEach(l => console.log('  ' + l));
}
process.exit(achados ? 1 : 0);
