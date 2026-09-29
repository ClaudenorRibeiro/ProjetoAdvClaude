// Testes (banco SIMULADO, nenhum MySQL é acessado):
//  - processo com status "Arquivado" fica fora das estatísticas de processos parados;
//  - status só pode ser renomeado/excluído quando NÃO está em uso.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { pool } = require('../../src/config/database');
const ctrl = require('../../src/controllers/processosController');

let sqls, regras;
function preparar(r = []) {
  sqls = []; regras = r;
  pool.execute = async (sql, params = []) => {
    sqls.push({ sql, params });
    for (const x of regras) if (x.casa.test(sql)) return [x.retorna];
    return [[]];
  };
  pool.getConnection = async () => ({
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql, params = []) => { sqls.push({ sql, params, conn: true }); return [{ affectedRows: 1 }]; },
  });
}
function resposta() {
  return { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
const usuario = { id: 1, nivel: 1 };
const houveUpdateStatus = () => sqls.some(q => /UPDATE tblstatusproc SET nome/i.test(q.sql));
const houveExclusaoStatus = () => sqls.some(q => /UPDATE tblstatusproc SET ativo=0/i.test(q.sql));

// SQL: aparece o filtro do arquivado
function assertFiltraArquivado(sql) {
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM tblstatusproc/);
  assert.match(sql, /sp_arq\.id = pr\.status_id/);
  assert.match(sql, /sp_arq\.nome = 'Arquivado'/);
  assert.match(sql, /pr\.ativo = 1/, 'continua exigindo processo ativo');
}

test('cartão "Processos parados" não conta processos Arquivados', async () => {
  preparar([{ casa: /COUNT\(\*\) AS total\s+FROM tblproc pr/i, retorna: [{ total: 3 }] }]);
  assert.equal(await ctrl.contarProcessosParados(), 3);
  assertFiltraArquivado(sqls[0].sql);
});

test('relatório de processos parados não lista processos Arquivados', async () => {
  preparar();
  const res = resposta();
  await ctrl.listarProcessosParados({ query: { dias: '365' }, usuario }, res);
  assert.equal(res.code, 200);
  assertFiltraArquivado(sqls[0].sql);
});

test('quadro "Processos sem movimentação" do Dashboard usa o MESMO filtro do cartão', () => {
  const codigo = fs.readFileSync(path.join(__dirname, '../../src/controllers/dashboardController.js'), 'utf8');
  assert.match(codigo, /FILTRO_NAO_ARQUIVADO \} = require\('\.\/processosController'\)/);
  const trecho = codigo.slice(codigo.indexOf('AS dias_sem_movimentacao'));
  assert.match(trecho.slice(0, 700), /\$\{FILTRO_NAO_ARQUIVADO\}/);
  assert.match(ctrl.FILTRO_NAO_ARQUIVADO, /sp_arq\.nome = 'Arquivado'/);
});

test('processo sem status continua contando (o filtro só exclui quem TEM status Arquivado)', () => {
  // NOT EXISTS sobre pr.status_id: com status_id NULL nenhuma linha casa, então o processo permanece.
  assert.match(ctrl.FILTRO_NAO_ARQUIVADO, /AND NOT EXISTS/);
  assert.doesNotMatch(ctrl.FILTRO_NAO_ARQUIVADO, /status_id IS NOT NULL|INNER JOIN/);
});

// ---------- renomear status ----------
const statusAtual = (nome = 'Em andamento') => ({ casa: /SELECT nome FROM tblstatusproc WHERE id/i, retorna: [{ nome }] });
const usoProc = (n) => ({ casa: /FROM tblproc WHERE status_id\s*=\s*\?\s+AND ativo\s*=\s*1/i, retorna: [{ total: n }] });
const usoEtq  = (n) => ({ casa: /FROM etiquetas_escritorio_catalogo WHERE status_id/i, retorna: [{ total: n }] });

test('renomear status EM USO por processo ativo é recusado', async () => {
  preparar([statusAtual('Arquivado'), usoProc(4), usoEtq(0)]);
  const res = resposta();
  await ctrl.atualizarStatusProc({ params: { id: 7 }, body: { nome: 'Encerrado' }, usuario }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.mensagem, /em uso por 4 processo\(s\) ativo\(s\)/);
  assert.equal(houveUpdateStatus(), false);
});

test('renomear status ligado a etiqueta do escritório é recusado', async () => {
  preparar([statusAtual(), usoProc(0), usoEtq(2)]);
  const res = resposta();
  await ctrl.atualizarStatusProc({ params: { id: 7 }, body: { nome: 'Outro' }, usuario }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.mensagem, /2 etiqueta\(s\) do escritório/);
  assert.equal(houveUpdateStatus(), false);
});

test('renomear status SEM uso é aceito', async () => {
  preparar([statusAtual(), usoProc(0), usoEtq(0)]);
  const res = resposta();
  await ctrl.atualizarStatusProc({ params: { id: 7 }, body: { nome: '  Suspenso  ' }, usuario }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.dados.nome, 'Suspenso');
  assert.equal(houveUpdateStatus(), true);
});

test('salvar com o mesmo nome (sem mudança) não é bloqueado nem grava', async () => {
  preparar([statusAtual('Arquivado'), usoProc(9), usoEtq(1)]);
  const res = resposta();
  await ctrl.atualizarStatusProc({ params: { id: 7 }, body: { nome: 'Arquivado' }, usuario }, res);
  assert.equal(res.code, 200);
  assert.equal(houveUpdateStatus(), false);
});

test('renomear exige nome e status existente', async () => {
  preparar();
  let res = resposta();
  await ctrl.atualizarStatusProc({ params: { id: 7 }, body: { nome: '   ' }, usuario }, res);
  assert.equal(res.code, 400);
  preparar([{ casa: /SELECT nome FROM tblstatusproc WHERE id/i, retorna: [] }]);
  res = resposta();
  await ctrl.atualizarStatusProc({ params: { id: 99 }, body: { nome: 'X' }, usuario }, res);
  assert.equal(res.code, 404);
});

// ---------- excluir status ----------
test('excluir status ligado a etiqueta é recusado', async () => {
  preparar([usoProc(0), usoEtq(1)]);
  const res = resposta();
  await ctrl.excluirStatusProc({ params: { id: 7 }, usuario }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.mensagem, /etiqueta/);
  assert.equal(houveExclusaoStatus(), false);
});

test('excluir status usado por processo ativo continua recusado', async () => {
  preparar([usoProc(2), usoEtq(0)]);
  const res = resposta();
  await ctrl.excluirStatusProc({ params: { id: 7 }, usuario }, res);
  assert.equal(res.code, 400);
  assert.equal(houveExclusaoStatus(), false);
});

test('excluir status sem uso continua funcionando', async () => {
  preparar([usoProc(0), usoEtq(0)]);
  const res = resposta();
  await ctrl.excluirStatusProc({ params: { id: 7 }, usuario }, res);
  assert.equal(res.code, 200);
  assert.equal(houveExclusaoStatus(), true);
});

test('Tipo e Instância continuam renomeando SEM a trava de uso', async () => {
  for (const [fn, tabela] of [['atualizarTipo', 'tbltipoproc'], ['atualizarInstancia', 'tblinstanciaproc']]) {
    preparar();
    const res = resposta();
    await ctrl[fn]({ params: { id: 3 }, body: { nome: 'Novo Nome' }, usuario }, res);
    assert.equal(res.code, 200, fn);
    assert.ok(sqls.some(q => new RegExp(`UPDATE ${tabela} SET nome`, 'i').test(q.sql)), fn);
    assert.equal(sqls.some(q => /FROM tblproc WHERE/i.test(q.sql)), false, `${fn} não consulta uso`);
  }
});
