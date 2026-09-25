const fs = require('fs');

function parseTables(path) {
  const texto = fs.readFileSync(path, 'utf8');
  const linhas = texto.split(/\r?\n/);
  const tabelas = {}; // nome -> { colunas: Map(nome->definicao), pk, keys: [], fks: [] }
  let atual = null;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const mCreate = l.match(/^CREATE TABLE (?:IF NOT EXISTS )?`([^`]+)`/);
    if (mCreate) {
      atual = { nome: mCreate[1], colunas: new Map(), pk: null, keys: [], fks: [] };
      tabelas[atual.nome] = atual;
      continue;
    }
    if (!atual) continue;
    if (/^\)\s*(ENGINE|;)/.test(l) || l.trim() === ');') { atual = null; continue; }
    const mCol = l.match(/^\s*`([^`]+)`\s+(.+?),?\s*$/);
    if (mCol && !/^\s*(PRIMARY KEY|UNIQUE KEY|KEY|CONSTRAINT)/i.test(l)) {
      // Remove vírgula final
      let def = mCol[2].replace(/,\s*$/, '');
      atual.colunas.set(mCol[1], def);
    }
  }
  return tabelas;
}

const [ , , localPath, awsPath, label ] = process.argv;
const local = parseTables(localPath);
const aws = parseTables(awsPath);

const comuns = Object.keys(local).filter(t => aws[t]);
let algumaDiferenca = false;
for (const t of comuns) {
  const colsLocal = local[t].colunas;
  const colsAws = aws[t].colunas;
  const faltamNoAws = [...colsLocal.keys()].filter(c => !colsAws.has(c));
  const sobramNoAws = [...colsAws.keys()].filter(c => !colsLocal.has(c));
  const diferentes = [...colsLocal.keys()].filter(c => colsAws.has(c) && colsAws.get(c) !== colsLocal.get(c));
  if (faltamNoAws.length || sobramNoAws.length || diferentes.length) {
    algumaDiferenca = true;
    console.log(`\n--- ${t} (${label}) ---`);
    if (faltamNoAws.length) console.log('  Faltam no AWS:', faltamNoAws.map(c => `${c} (${colsLocal.get(c)})`).join(' | '));
    if (sobramNoAws.length) console.log('  Só existem no AWS (sobrando):', sobramNoAws.join(', '));
    if (diferentes.length) {
      for (const c of diferentes) {
        console.log(`  Definição diferente em "${c}": LOCAL="${colsLocal.get(c)}" AWS="${colsAws.get(c)}"`);
      }
    }
  }
}
if (!algumaDiferenca) console.log(`Nenhuma diferença de coluna nas tabelas em comum (${label}).`);
