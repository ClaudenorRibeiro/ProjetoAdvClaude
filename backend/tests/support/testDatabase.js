const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { carregarAmbienteTeste } = require('./testEnvironment');

function configuracao() {
  carregarAmbienteTeste();
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
    timezone: '-03:00',
    dateStrings: true,
  };
}

function sqlSomenteEstruturaTeste() {
  const arquivo = path.join(__dirname, '../../../estrutura_banco.sql');
  const original = fs.readFileSync(arquivo, 'utf8');
  const inicio = original.indexOf('DROP TABLE IF EXISTS');
  if (inicio < 0) throw new Error('Não foi possível localizar o início das tabelas em estrutura_banco.sql.');
  const corpo = original.slice(inicio)
    .replace(/^\/\*!\d+ SET [^\r\n]*@OLD_[^\r\n]*\*\/;\s*$/gmi, '');
  const sql = `SET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\n${corpo}\nSET UNIQUE_CHECKS=1;\nSET FOREIGN_KEY_CHECKS=1;`;
  if (/DROP\s+DATABASE|CREATE\s+DATABASE|\bUSE\s+`/i.test(sql)) {
    throw new Error('SEGURANÇA: o trecho de estrutura ainda contém comando de banco; execução cancelada.');
  }
  return sql;
}

async function recriarBancoTeste() {
  const conn = await mysql.createConnection(configuracao());
  try {
    await conn.query(sqlSomenteEstruturaTeste());
    await semearDadosBase(conn);
  } finally {
    await conn.end();
  }
}

async function semearDadosBase(conn) {
  const senhaHash = await bcrypt.hash('TesteSeguro123!', 4);
  await conn.execute(
    `INSERT INTO usuarios (id, nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo)
     VALUES (1, 'Administrador de Testes', 'admteste', ?, 'admteste@example.invalid', 'advogado', 1, 1, 1, 'sessao-admin', 0, 0),
            (2, 'Usuário de Testes', 'usuteste', ?, 'usuteste@example.invalid', 'advogado', 2, 1, 0, 'sessao-usuario', 0, 0),
            (3, 'Usuário sem Permissão', 'sempermissao', ?, 'sempermissao@example.invalid', 'advogado', 2, 1, 0, 'sessao-sem-permissao', 0, 0)`,
    [senhaHash, senhaHash, senhaHash]
  );
  await conn.execute("INSERT INTO configuracoes_escritorio (id, nome, setup_concluido) VALUES (1, 'Escritório Automatizado', 1)");
  await conn.execute("INSERT INTO tblpasta (id, numPasta, area_direito, criado_por) VALUES (1, 99001, 'Testes', 1)");
  await conn.execute("INSERT INTO tblstatusproc (id, nome, ativo, criado_por) VALUES (1, 'Ativo', 1, 1)");
  await conn.execute("INSERT INTO tbltipoproc (id, nome, codTipoProc, ativo, criado_por) VALUES (1, 'Judicial', 'J', 1, 1)");
  await conn.execute(
    `INSERT INTO tblproc (id, pasta_id, numProc, cliente_polo, NomeTituloProc, tipo_id, status_id, ativo, criado_por)
     VALUES (1, 1, '0000001-01.2026.5.15.0001', 'autor', 'PROCESSO AUTOMATIZADO', 1, 1, 1, 1)`
  );
  await conn.execute(
    `INSERT INTO tipo_audiencia (id, nome, ativo) VALUES
      (1, 'Julgamento', 1), (2, 'Controle', 1), (3, 'Encerramento de Instrução', 1), (4, 'Instrução', 1)`
  );
  await conn.execute("INSERT INTO tipo_prazo (id, nome, ativo) VALUES (1, 'Processual', 1)");
  await conn.execute("INSERT INTO prazo_subtipo (id, tipo_prazo_id, nome, ativo) VALUES (1, 1, 'Contestação', 1)");
  await conn.execute("INSERT INTO forma_pagamento (id, nome, ativo) VALUES (1, 'Transferência de teste', 1)");
  await conn.query(
    `INSERT INTO calendario (data, dia_util) VALUES
      ('2026-01-03', 0), ('2026-01-04', 0),
      ('2026-01-05', 1), ('2026-01-06', 1), ('2026-01-07', 1),
      ('2026-01-08', 1), ('2026-01-09', 1), ('2026-01-10', 0), ('2026-01-11', 0),
      ('2026-02-05', 1), ('2026-03-05', 1)`
  );
  const modulos = ['audiencias', 'processos', 'tarefas', 'prazos', 'pericias', 'documentos', 'financeiro', 'pessoas', 'publicacoes', 'pendencias', 'relatorios'];
  const acoes = ['visualizar', 'cadastrar', 'alterar', 'excluir', 'historico'];
  const valores = [];
  for (const modulo of modulos) for (const acao of acoes) valores.push([2, modulo, null, acao, 1]);
  await conn.query('INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES ?', [valores]);
  await conn.query(
    `INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES
      (2, 'audiencias', 'tipos', 'cadastrar', 1),
      (2, 'audiencias', 'tipos', 'alterar', 1),
      (2, 'audiencias', 'tipos', 'excluir', 1),
      (2, 'audiencias', 'ata', 'visualizar', 1)`
  );
}

async function conectarBancoTeste() {
  return mysql.createConnection(configuracao());
}

module.exports = { recriarBancoTeste, conectarBancoTeste, sqlSomenteEstruturaTeste };
