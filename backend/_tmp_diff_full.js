const fs = require('fs');

function parseTables(path) {
  const texto = fs.readFileSync(path, 'utf8');
  const linhas = texto.split(/\r?\n/);
  const tabelas = {};
  let atual = null;
  for (const l of linhas) {
    const mCreate = l.match(/^CREATE TABLE (?:IF NOT EXISTS )?`([^`]+)`/);
    if (mCreate) {
      atual = { nome: mCreate[1], colOrder: [], colDef: new Map(), keys: new Map(), constraints: new Map(), pk: null };
      tabelas[atual.nome] = atual;
      continue;
    }
    if (!atual) continue;
    if (/^\)\s*(ENGINE|;)?/.test(l) && /^\)/.test(l)) { atual = null; continue; }
    let m;
    if ((m = l.match(/^\s*PRIMARY KEY\s*(\(.+?\))/i))) { atual.pk = m[1]; continue; }
    if ((m = l.match(/^\s*(UNIQUE KEY|KEY)\s+`([^`]+)`\s*(\(.+?\)),?\s*$/i))) {
      atual.keys.set(m[2], { unique: /UNIQUE/i.test(m[1]), cols: m[3] });
      continue;
    }
    if ((m = l.match(/^\s*CONSTRAINT\s+`([^`]+)`\s+(.+?),?\s*$/i))) {
      atual.constraints.set(m[1], m[2].replace(/,\s*$/, ''));
      continue;
    }
    if ((m = l.match(/^\s*`([^`]+)`\s+(.+?),?\s*$/))) {
      let def = m[2].replace(/,\s*$/, '');
      atual.colOrder.push(m[1]);
      atual.colDef.set(m[1], def);
    }
  }
  return tabelas;
}

const localT = parseTables("C:/Users/Claudenor/Downloads/local.sql");
const awsT   = parseTables(process.argv[2]);
const label  = process.argv[3];

console.log(`\n########## ${label} ##########`);

// Tabelas novas (existem no local, não no aws)
const novas = Object.keys(localT).filter(t => !awsT[t]);
console.log('\n== TABELAS NOVAS (precisam de CREATE TABLE) ==');
console.log(novas.join(', ') || '(nenhuma)');

// Tabelas em comum: diff de colunas/keys/constraints
const comuns = Object.keys(localT).filter(t => awsT[t]);
for (const t of comuns) {
  const L = localT[t], A = awsT[t];
  const colsFaltando = L.colOrder.filter(c => !A.colDef.has(c));
  const keysFaltando = [...L.keys.keys()].filter(k => !A.keys.has(k));
  const consFaltando = [...L.constraints.keys()].filter(k => !A.constraints.has(k));
  if (colsFaltando.length || keysFaltando.length || consFaltando.length) {
    console.log(`\n-- ${t} --`);
    for (const c of colsFaltando) {
      const idx = L.colOrder.indexOf(c);
      const anterior = idx > 0 ? L.colOrder[idx - 1] : null;
      console.log(`  COLUNA: ${c} ${L.colDef.get(c)}  [AFTER ${anterior}]`);
    }
    for (const k of keysFaltando) {
      const kk = L.keys.get(k);
      console.log(`  ${kk.unique ? 'UNIQUE KEY' : 'KEY'}: ${k} ${kk.cols}`);
    }
    for (const c of consFaltando) {
      console.log(`  CONSTRAINT: ${c} ${L.constraints.get(c)}`);
    }
  }
}
