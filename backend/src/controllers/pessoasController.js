// ============================================================
// CONTROLLER DE PESSOAS (físicas e jurídicas)
// CRUD completo com telefones, e-mails e histórico
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');
const { hojeBrasilia } = require('../utils/helpers');
const { enviarEmail } = require('../utils/email');
const { registrarComunicacao } = require('../utils/logComunicacao');
const smsService = require('../services/smsService');
const multer = require('multer');
const { criarBancoNoCatalogo } = require('./instituicaoFinanceiraController');

// ---- Rede de segurança: sem telefone/e-mail repetido no MESMO cadastro ----
// O front já bloqueia e avisa; aqui é a proteção do servidor (qualquer caminho).
// Mantém a 1ª ocorrência; telefone compara só os dígitos, e-mail em minúsculas.
// Itens vazios passam direto (os laços de INSERT já ignoram vazio).
function semRepetidos(lista, chaveFn) {
  const vistos = new Set();
  const saida = [];
  for (const item of (lista || [])) {
    const chave = chaveFn(item);
    if (!chave) { saida.push(item); continue; }
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(item);
  }
  return saida;
}

// Conta os documentos ainda pendentes (não recebidos) das pendências ABERTAS de um cliente.
// Usado só para a faixa informativa na ficha da Pessoa. Tolerante: se o banco ainda não
// tem as tabelas do módulo (script não rodado), devolve 0 sem quebrar a ficha.
async function contarDocumentosPendentes(tipo_pessoa, pessoaId) {
  try {
    const [[row]] = await pool.execute(
      `SELECT COUNT(*) AS total
         FROM pendencia_documento_item i
         JOIN pendencia_documento pd ON i.pendencia_id = pd.id
        WHERE pd.status = 'aberta' AND i.recebido = 0
          AND pd.tipo_pessoa = ? AND pd.pessoa_id = ?`,
      [tipo_pessoa, pessoaId]
    );
    return Number(row.total) || 0;
  } catch (e) {
    console.error('Pendências de documentos indisponíveis (banco sem o script?):', e.message);
    return 0;
  }
}
const chaveTelefone = (t) => String(t?.numero || '').replace(/\D/g, '');
const chaveEmail    = (e) => String(e?.email  || '').trim().toLowerCase();
// Chave de deduplicação: só considera duas linhas "a mesma conta" se baterem banco, tipo,
// agência, número/dígito e chave PIX — TUDO igual. Precisa ser rica porque, ao contrário de
// telefone/e-mail, uma conta bancária pode legitimamente não ter agência/número preenchido
// (ex.: conta só com PIX) e duas contas assim seriam confundidas com uma chave mais simples.
const chaveConta    = (c) => c?.instituicao_financeira_id
  ? `${c.instituicao_financeira_id}|${c.tipo || ''}|${String(c.agencia || '').replace(/\D/g, '')}|${String(c.numero || '').replace(/\D/g, '')}|${String(c.digito || '').replace(/\D/g, '')}|${String(c.chave_pix || '').trim().toLowerCase()}`
  : '';
function erroContaBancaria(mensagem) { const e = new Error(mensagem); e.codigoContaBancaria = true; return e; }
function normalizarDigitoConta(valor) {
  const digito = String(valor ?? '').trim();
  if (digito.length > 4) throw erroContaBancaria('O dígito da conta pode ter no máximo 4 caracteres.');
  return digito || null;
}

// Sincroniza as contas bancárias/PIX de uma pessoa sem trocar os seus IDs. Diferente de
// telefones/e-mails, contas passam a ser referência de acordo, parcela e comprovante; por
// isso nunca podem ser apagadas e recriadas numa edição comum.
// "Própria" (conta_terceiro=0) SEMPRE usa nome/documento da PRÓPRIA pessoa — o servidor não
// confia no que o formulário mandou para esses dois campos nesse caso.
async function gravarContasBancarias(conn, tabela, pessoaId, contas, nomeProprio, documentoProprio) {
  if (!Array.isArray(contas)) return;
  try {
    await conn.execute(`SELECT 1 FROM ${tabela} LIMIT 1`);
  } catch (e) {
    console.error(`Contas bancárias não gravadas (banco sem o script S3? ${tabela}):`, e.message);
    return;
  }

  const normalizadas = semRepetidos(contas, chaveConta);
  const principais = normalizadas.filter(c => c?.instituicao_financeira_id && c.principal);
  if (principais.length > 1) throw erroContaBancaria('Escolha apenas uma conta principal.');
  const idsRecebidos = [];

  for (const c of normalizadas) {
    if (!c?.instituicao_financeira_id) {
      if (c && Object.values(c).some(v => v !== '' && v !== false && v !== null && v !== undefined)) {
        throw erroContaBancaria('Escolha a instituição financeira de cada conta informada.');
      }
      continue;
    }
    const terceiro = c.conta_terceiro ? 1 : 0;
    const titular = terceiro ? String(c.titular || '').trim() : (nomeProprio || '');
    const documentoTitular = terceiro
      ? String(c.documento_titular || '').replace(/\D/g, '')
      : (documentoProprio || '');
    if (!titular || !documentoTitular) throw erroContaBancaria('Informe CPF/CNPJ da pessoa ou marque a conta como de terceiro e informe seu titular.');
    const digito = normalizarDigitoConta(c.digito);
    const valores = [
      c.instituicao_financeira_id, c.tipo === 'poupanca' ? 'poupanca' : 'corrente',
      c.agencia || null, c.numero || null, digito, c.chave_pix || null,
      terceiro, titular, documentoTitular, c.observacao ? String(c.observacao).trim() : null, c.principal ? 1 : 0
    ];
    if (c.id) {
      const [r] = await conn.execute(
        `UPDATE ${tabela} SET instituicao_financeira_id=?, tipo=?, agencia=?, numero=?, digito=?, chave_pix=?,
           conta_terceiro=?, titular=?, documento_titular=?, observacao=?, principal=?, ativo=1
         WHERE id=? AND pessoa_id=?`, [...valores, c.id, pessoaId]
      );
      if (!r.affectedRows) throw erroContaBancaria('Uma das contas informadas não pertence a esta pessoa.');
      idsRecebidos.push(Number(c.id));
    } else {
      const [r] = await conn.execute(
        `INSERT INTO ${tabela}
          (pessoa_id, instituicao_financeira_id, tipo, agencia, numero, digito, chave_pix,
           conta_terceiro, titular, documento_titular, observacao, principal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [pessoaId, ...valores]
      );
      idsRecebidos.push(r.insertId);
    }
  }
  // Remover da ficha não apaga histórico: desativa apenas as contas que não voltaram.
  if (idsRecebidos.length) {
    const marks = idsRecebidos.map(() => '?').join(',');
    await conn.execute(`UPDATE ${tabela} SET ativo=0, principal=0 WHERE pessoa_id=? AND id NOT IN (${marks})`, [pessoaId, ...idsRecebidos]);
  } else {
    await conn.execute(`UPDATE ${tabela} SET ativo=0, principal=0 WHERE pessoa_id=?`, [pessoaId]);
  }
}

// ---- Anexos do "Enviar e-mail" avulso (Pessoas) ----
// Upload em memória: os arquivos são anexados ao e-mail e DESCARTADOS (nada vai para
// disco, S3 ou banco). O total é limitado a 20 MB para respeitar o teto do Gmail (25 MB
// por mensagem, com folga para a codificação do anexo).
const LIMITE_TOTAL_ANEXOS = 20 * 1024 * 1024; // 20 MB somando todos os anexos
const MAX_ANEXOS = 20;                          // no máximo 20 arquivos por e-mail
const uploadAnexosMemoria = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITE_TOTAL_ANEXOS, files: MAX_ANEXOS }, // por-arquivo <= 20MB; até 20 arquivos
});
// Middleware de upload com erro em JSON (em vez do erro genérico do multer).
function uploadAnexosEmail(req, res, next) {
  uploadAnexosMemoria.array('anexos', MAX_ANEXOS)(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Cada arquivo deve ter no máximo 20 MB'
        : err.code === 'LIMIT_FILE_COUNT'
          ? `Máximo de ${MAX_ANEXOS} arquivos por e-mail`
          : (err.message || 'Falha ao anexar o(s) arquivo(s)');
      return erro(res, msg);
    }
    next();
  });
}

// ---- Filtros de busca reutilizáveis (listagem E exportação) — evita duplicar a mesma condição ----

// Condição de busca de PESSOA FÍSICA (nome, CPF, RG, PIS, endereço, telefone). Retorna { cond, params }.
function condBuscaFisica(busca, selecao = false) {
  const buscaDigitos = busca.replace(/\D/g, '');
  const b  = `%${busca}%`;
  const bD = `%${buscaDigitos || busca}%`;

  // MODO "ESCOLHER PESSOA" (autocompletar de testemunha, autor/réu/perito e responsável
  // legal): procura SÓ em nome e CPF. Com a busca ampla, digitar "maria" trazia também
  // quem mora na "Rua Antonio Maria Bessa" — e, como essas listas mostram poucas linhas
  // em ordem alfabética, as Marias de verdade ficavam de fora. A tela de Pessoas continua
  // usando a busca ampla (o campo dela promete endereço, RG e PIS).
  if (selecao) {
    return { cond: ' AND (pf.nome LIKE ? OR pf.cpf LIKE ?)', params: [b, bD] };
  }

  const cond = ` AND (
        pf.nome       LIKE ? OR
        pf.cpf        LIKE ? OR
        pf.rg         LIKE ? OR
        pf.pis        LIKE ? OR
        pf.logradouro LIKE ? OR
        pf.bairro     LIKE ? OR
        pf.cidade     LIKE ? OR
        EXISTS (
          SELECT 1 FROM telefones_pf t
          WHERE t.pessoa_id = pf.id AND t.ativo = 1 AND t.numero LIKE ?
        )
      )`;
  return { cond, params: [b, bD, b, b, b, b, b, b] };
}

// Condição de busca de PESSOA JURÍDICA (razão social, CNPJ, fantasia, endereço, telefone).
function condBuscaJuridica(busca, selecao = false) {
  const buscaDigitos = busca.replace(/\D/g, '');
  const b  = `%${busca}%`;
  const bD = `%${buscaDigitos || busca}%`;

  // Modo "escolher empresa" — ver o comentário em condBuscaFisica.
  if (selecao) {
    return {
      cond: ' AND (pj.razao_social LIKE ? OR pj.nome_fantasia LIKE ? OR pj.cnpj LIKE ?)',
      params: [b, b, bD],
    };
  }

  const cond = ` AND (
        pj.razao_social        LIKE ? OR
        pj.cnpj                LIKE ? OR
        pj.nome_fantasia       LIKE ? OR
        pj.logradouro          LIKE ? OR
        pj.bairro              LIKE ? OR
        pj.cidade              LIKE ? OR
        EXISTS (
          SELECT 1 FROM telefones_pj t
          WHERE t.pessoa_id = pj.id AND t.ativo = 1 AND t.numero LIKE ?
        )
      )`;
  return { cond, params: [b, bD, b, b, b, b, b] };
}

// ---- PESSOAS FÍSICAS ----

// GET /api/pessoas/fisicas — Lista todas as pessoas físicas
async function listarFisicas(req, res) {
  try {
    const { busca, pagina = 1, limite = 20, somente_advogados, somente_peritos, selecao } = req.query;
    // selecao=1: chamada de um campo de ESCOLHER pessoa, não da tela de Pessoas.
    const modoSelecao = selecao === '1' || selecao === 'true' || selecao === true;
    // parseInt garante valores inteiros seguros para uso direto na query
    const limitInt  = Math.min(parseInt(limite) || 20, 100);
    const offsetInt = parseInt((pagina - 1) * limitInt) || 0;
    const params = [];
    let where = 'WHERE pf.ativo = 1';

    // Filtra apenas pessoas com profissão de advogado (para campos de advogado em audiências)
    if (somente_advogados) {
      where += ` AND EXISTS (
        SELECT 1 FROM profissao pr
        WHERE pr.id = pf.profissao_id AND pr.nome LIKE '%dvogado%'
      )`;
    }

    // Filtra apenas pessoas físicas cuja profissão começa com "Perícia" (para perícias)
    if (somente_peritos) {
      where += ` AND EXISTS (
        SELECT 1 FROM profissao pr
        WHERE pr.id = pf.profissao_id AND pr.nome LIKE 'Perícia%'
      )`;
    }

    // Filtro de busca abrangente (mesma condição reutilizada na exportação — ver condBuscaFisica)
    if (busca) {
      const f = condBuscaFisica(busca, modoSelecao);
      where += f.cond;
      params.push(...f.params);
    }

    // Filtro pela etiqueta DO ESCRITÓRIO (compartilhada).
    const etqEscSlot = parseInt(req.query.etiquetaEscritorio);
    if (etqEscSlot >= 1 && etqEscSlot <= 5) {
      where += ' AND EXISTS (SELECT 1 FROM pessoas_fisicas_etiquetas_escritorio ee WHERE ee.pessoa_id = pf.id AND ee.slot = ?)';
      params.push(etqEscSlot);
    }

    // No modo "escolher pessoa", quem COMEÇA pelo que foi digitado vem primeiro: digitando
    // "maria" as "Maria ..." aparecem antes de "Ana Maria ...". Fora desse modo, nada muda.
    // O parâmetro extra entra SÓ nesta consulta (o COUNT abaixo não tem ORDER BY).
    const ordem = (modoSelecao && busca) ? 'ORDER BY (pf.nome LIKE ?) DESC, pf.nome ASC'
                                         : 'ORDER BY pf.nome ASC';
    const paramsOrdem = (modoSelecao && busca) ? [`${busca}%`] : [];

    // Nota: LIMIT e OFFSET são inseridos diretamente na query (já sanitizados com parseInt)
    // pois o MySQL 8 tem incompatibilidade com parâmetros ? em LIMIT/OFFSET via prepared statements
    const [rows] = await pool.execute(
      `SELECT pf.id, pf.nome, pf.cpf, pf.data_nascimento,
              ec.nome AS estado_civil, g.nome AS genero,
              -- Pega o telefone principal
              (SELECT t.numero FROM telefones_pf t
               WHERE t.pessoa_id = pf.id AND t.ativo = 1
               ORDER BY t.principal DESC, t.id ASC LIMIT 1) AS telefone,
              -- Pega o e-mail principal
              (SELECT e.email FROM emails_pf e
               WHERE e.pessoa_id = pf.id AND e.ativo = 1
               ORDER BY e.principal DESC, e.id ASC LIMIT 1) AS email,
              -- Total de processos como autor ou réu (sem duplicatas)
              (SELECT COUNT(*) FROM (
                SELECT proc_id FROM tbltituloprocautor WHERE tipo_pessoa = 'fisica' AND pessoa_id = pf.id
                UNION
                SELECT proc_id FROM tbltituloprocreu   WHERE tipo_pessoa = 'fisica' AND pessoa_id = pf.id
              ) AS t) AS qtde_proc,
              -- Etiqueta DO ESCRITÓRIO (compartilhada) desta pessoa
              (SELECT ee.slot FROM pessoas_fisicas_etiquetas_escritorio ee
                WHERE ee.pessoa_id = pf.id) AS etiqueta_escritorio,
              -- Responsável legal (menor/incapaz), para a tela mostrar "representado(a) por"
              resp.nome AS responsavel_nome,
              pc.nome   AS parentesco_nome
       FROM pessoas_fisicas pf
       LEFT JOIN estado_civil ec ON pf.estado_civil_id = ec.id
       LEFT JOIN genero g ON pf.genero_id = g.id
       LEFT JOIN pessoas_fisicas resp ON pf.responsavel_id = resp.id
       LEFT JOIN parentesco       pc  ON pf.parentesco_id  = pc.id
       ${where}
       ${ordem}
       LIMIT ${limitInt} OFFSET ${offsetInt}`,
      [...params, ...paramsOrdem]
    );

    // Conta total para paginação
    const [total] = await pool.execute(
      `SELECT COUNT(*) as total FROM pessoas_fisicas pf ${where}`,
      params
    );

    return sucesso(res, { registros: rows, total: total[0].total, pagina: parseInt(pagina), limite: parseInt(limite) });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/pessoas/fisicas/:id — Busca uma pessoa física completa
async function buscarFisica(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      `SELECT pf.*, ec.nome AS estado_civil_nome, g.nome AS genero_nome, pr.nome AS profissao_nome,
              resp.nome AS responsavel_nome, resp.cpf AS responsavel_cpf, pc.nome AS parentesco_nome
       FROM pessoas_fisicas pf
       LEFT JOIN estado_civil ec ON pf.estado_civil_id = ec.id
       LEFT JOIN genero g ON pf.genero_id = g.id
       LEFT JOIN profissao pr ON pf.profissao_id = pr.id
       LEFT JOIN pessoas_fisicas resp ON pf.responsavel_id = resp.id
       LEFT JOIN parentesco pc ON pf.parentesco_id = pc.id
       WHERE pf.id = ?`,
      [id]
    );

    if (!rows.length) return naoEncontrado(res, 'Pessoa não encontrada');

    const pessoa = rows[0];

    // Busca telefones
    const [telefones] = await pool.execute(
      'SELECT * FROM telefones_pf WHERE pessoa_id = ? ORDER BY principal DESC, id ASC',
      [id]
    );

    // Busca e-mails
    const [emails] = await pool.execute(
      'SELECT * FROM emails_pf WHERE pessoa_id = ? ORDER BY principal DESC, id ASC',
      [id]
    );

    // Busca histórico de atendimento
    const [historico] = await pool.execute(
      `SELECT h.*, u.nome AS usuario_nome
       FROM historico_atendimento h
       JOIN usuarios u ON h.usuario_id = u.id
       WHERE h.tipo_pessoa = 'fisica' AND h.pessoa_id = ?
       ORDER BY h.criado_em DESC`,
      [id]
    );

    // Quem esta pessoa representa (a lista de "dependentes" da tela) — sai do próprio
    // vínculo guardado no representado, por isso as duas pontas nunca discordam
    const [representados] = await pool.execute(
      `SELECT r.id, r.nome, r.data_nascimento, pc.nome AS parentesco_nome
         FROM pessoas_fisicas r
         LEFT JOIN parentesco pc ON r.parentesco_id = pc.id
        WHERE r.responsavel_id = ?
        ORDER BY r.nome`,
      [id]
    );

    // Avisos de idade configurados para esta pessoa.
    // TOLERANTE: se a tabela ainda não existe nesta instância (código novo, banco
    // sem o script), devolve lista vazia em vez de quebrar a tela de Pessoas.
    let avisos_idade = [];
    try {
      const [rowsAvisos] = await pool.execute(
        'SELECT id, idade, avisado_em FROM pessoas_avisos_idade WHERE pessoa_id = ? ORDER BY idade',
        [id]
      );
      avisos_idade = rowsAvisos;
    } catch (e) {
      console.error('Avisos de idade indisponíveis (banco sem o script?):', e.message);
    }

    // Quantos documentos ainda faltam neste cliente (pendências abertas) — para a faixa na ficha
    const pendencias_documento_abertas = await contarDocumentosPendentes('fisica', id);

    // Contas bancárias/PIX cadastradas. TOLERANTE: se a tabela ainda não existe nesta
    // instância (banco sem o script S3), devolve lista vazia em vez de quebrar a ficha.
    let contas_bancarias = [];
    try {
      const [rowsContas] = await pool.execute(
        `SELECT cb.*, ifin.nome AS instituicao_nome
           FROM contas_bancarias_pf cb
           JOIN instituicao_financeira ifin ON ifin.id = cb.instituicao_financeira_id
          WHERE cb.pessoa_id = ? AND cb.ativo = 1
          ORDER BY cb.principal DESC, cb.id ASC`,
        [id]
      );
      contas_bancarias = rowsContas;
    } catch (e) {
      console.error('Contas bancárias indisponíveis (banco sem o script S3?):', e.message);
    }

    return sucesso(res, { ...pessoa, telefones, emails, historico, representados, avisos_idade, pendencias_documento_abertas, contas_bancarias });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/pessoas/fisicas — Cadastra nova pessoa física
// ============================================================
// AVISOS DE IDADE — "me avise quando esta pessoa completar X anos"
// Vários por pessoa (16 e 18 têm efeitos jurídicos diferentes). Guardados em
// pessoas_avisos_idade, com UNIQUE (pessoa_id, idade) para não duplicar.
// Devolve a mensagem de erro (texto) ou null quando está tudo certo.
// ============================================================
function validarAvisosIdade(avisos) {
  if (!Array.isArray(avisos)) return null;
  const vistos = new Set();
  for (const a of avisos) {
    const idade = Number(a?.idade ?? a);
    if (!Number.isInteger(idade) || idade < 0 || idade > 120)
      return 'Idade de aviso inválida — informe um número inteiro de 0 a 120';
    if (vistos.has(idade)) return `A idade ${idade} está repetida nos avisos`;
    vistos.add(idade);
  }
  return null;
}

// Regrava a lista de avisos da pessoa DENTRO da transação. Mantém o "já avisei"
// das idades que continuam na lista — senão editar o cadastro faria o sistema
// avisar tudo de novo.
async function gravarAvisosIdade(conn, pessoaId, avisos, usuarioId) {
  if (!Array.isArray(avisos)) return;
  // TOLERANTE: numa instância cujo banco ainda não recebeu o script, gravar o
  // cadastro da pessoa não pode falhar por causa dos avisos.
  try {
    await conn.execute('SELECT 1 FROM pessoas_avisos_idade LIMIT 1');
  } catch (e) {
    console.error('Avisos de idade não gravados (banco sem o script?):', e.message);
    return;
  }
  const idades = [...new Set(avisos.map(a => Number(a?.idade ?? a)).filter(n => Number.isInteger(n)))];

  if (idades.length === 0) {
    await conn.execute('DELETE FROM pessoas_avisos_idade WHERE pessoa_id = ?', [pessoaId]);
    return;
  }

  const ph = idades.map(() => '?').join(',');
  await conn.execute(
    `DELETE FROM pessoas_avisos_idade WHERE pessoa_id = ? AND idade NOT IN (${ph})`,
    [pessoaId, ...idades]
  );
  for (const idade of idades) {
    // Se a idade já existe, não mexe (preserva o avisado_em)
    await conn.execute(
      `INSERT INTO pessoas_avisos_idade (pessoa_id, idade, criado_por)
         SELECT ?, ?, ? FROM DUAL
          WHERE NOT EXISTS (SELECT 1 FROM pessoas_avisos_idade x WHERE x.pessoa_id = ? AND x.idade = ?)`,
      [pessoaId, idade, usuarioId, pessoaId, idade]
    );
  }
}

// ============================================================
// RESPONSÁVEL LEGAL (quem representa o menor/incapaz no processo)
// Regra fechada com o usuário: SEMPRE UM responsável, guardado no cadastro
// do REPRESENTADO (colunas responsavel_id + parentesco_id). Guardar aqui, e
// não numa lista, faz o próprio banco impedir dois responsáveis.
// Devolve a mensagem de erro (texto) ou null quando está tudo certo.
// ============================================================
async function validarResponsavel(db, { pessoaId, responsavel_id, parentesco_id }) {
  if (!responsavel_id) return null;                    // sem responsável: nada a validar
  if (!parentesco_id)  return 'Informe o parentesco do responsável legal';
  if (pessoaId && Number(responsavel_id) === Number(pessoaId))
    return 'Uma pessoa não pode ser responsável legal por ela mesma';

  const [resp] = await db.execute(
    'SELECT id, nome, ativo, responsavel_id FROM pessoas_fisicas WHERE id = ?', [responsavel_id]
  );
  if (!resp.length)   return 'Responsável legal não encontrado no cadastro';
  if (!resp[0].ativo) return 'O responsável legal escolhido está inativo';
  // Quem é representado não representa ninguém: corta corrente (A→B→C) e ciclo (A→B→A)
  if (resp[0].responsavel_id)
    return `${resp[0].nome} é representado(a) por outra pessoa e por isso não pode ser responsável legal`;

  // O caminho inverso: quem já representa alguém não pode passar a ser representado
  if (pessoaId) {
    const [dep] = await db.execute(
      'SELECT COUNT(*) AS total FROM pessoas_fisicas WHERE responsavel_id = ?', [pessoaId]
    );
    if (dep[0].total > 0)
      return 'Esta pessoa é responsável legal de outra(s) e por isso não pode ter um responsável legal';
  }

  const [pc] = await db.execute('SELECT id FROM parentesco WHERE id = ?', [parentesco_id]);
  if (!pc.length) return 'Parentesco do responsável legal inválido';
  return null;
}

async function criarFisica(req, res) {
  const {
    nome, cpf, rg, rg_orgao, pis, ctps_numero, ctps_serie,
    data_nascimento, estado_civil_id, profissao_id,
    genero_id, nacionalidade_id, nome_pai, nome_mae,
    cep, logradouro, numero, complemento, bairro, cidade, estado,
    observacoes, telefones = [], emails = [], contasBancarias = [],
    responsavel_id, parentesco_id, avisos_idade = []
  } = req.body;

  if (!nome) return erro(res, 'O nome é obrigatório');

  const erroAvisos = validarAvisosIdade(avisos_idade);
  if (erroAvisos) return erro(res, erroAvisos);

  // Responsável legal: confere ANTES de abrir a transação (só leitura)
  try {
    const erroResp = await validarResponsavel(pool, { pessoaId: null, responsavel_id, parentesco_id });
    if (erroResp) return erro(res, erroResp);
  } catch (err) {
    return erroInterno(res, err);
  }

  // Verifica CPF duplicado antes de iniciar a transação (leitura simples, sem lock)
  if (cpf) {
    try {
      const cpfLimpo = cpf.replace(/\D/g, '');
      const [dup] = await pool.execute(
        'SELECT id FROM pessoas_fisicas WHERE cpf = ?', [cpfLimpo]
      );
      if (dup.length > 0) return erro(res, 'CPF já cadastrado no sistema');
    } catch (err) {
      return erroInterno(res, err);
    }
  }

  // Transação: garante que pessoa, telefones e e-mails são gravados juntos ou nenhum é
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO pessoas_fisicas
         (nome, cpf, rg, rg_orgao, pis, ctps_numero, ctps_serie,
          data_nascimento, estado_civil_id, profissao_id, genero_id, nacionalidade_id,
          nome_pai, nome_mae,
          cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes,
          responsavel_id, parentesco_id, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome.trim(), cpf?.replace(/\D/g, '') || null, rg || null, rg_orgao || null,
        pis || null, ctps_numero || null, ctps_serie || null,
        data_nascimento || null, estado_civil_id || null, profissao_id || null,
        genero_id || null, nacionalidade_id || null, nome_pai || null, nome_mae || null,
        cep || null, logradouro || null, numero || null,
        complemento || null, bairro || null, cidade || null, estado || null,
        observacoes || null,
        responsavel_id || null, parentesco_id || null,
        req.usuario.id
      ]
    );

    const pessoaId = result.insertId;

    // Insere telefones vinculados à pessoa
    for (const tel of semRepetidos(telefones, chaveTelefone)) {
      if (tel.numero) {
        await conn.execute(
          'INSERT INTO telefones_pf (pessoa_id, numero, tipo, principal) VALUES (?, ?, ?, ?)',
          [pessoaId, tel.numero, tel.tipo || 'celular', tel.principal ? 1 : 0]
        );
      }
    }

    // Insere e-mails vinculados à pessoa
    for (const em of semRepetidos(emails, chaveEmail)) {
      const emailNorm = em.email ? em.email.trim().toLowerCase() : '';
      if (emailNorm) {
        await conn.execute(
          'INSERT INTO emails_pf (pessoa_id, email, principal) VALUES (?, ?, ?)',
          [pessoaId, emailNorm, em.principal ? 1 : 0]
        );
      }
    }

    // Contas bancárias/PIX (conta própria usa nome/CPF da própria pessoa, gravado agora)
    await gravarContasBancarias(conn, 'contas_bancarias_pf', pessoaId, contasBancarias,
      nome.trim(), cpf?.replace(/\D/g, '') || null);

    // Avisos de idade ("me avise quando completar X anos")
    await gravarAvisosIdade(conn, pessoaId, avisos_idade, req.usuario.id);

    // Auditoria participa da MESMA transação (tudo ou nada): grava antes do commit, com conn
    await auditoria.registrar(req.usuario.id, 'pessoas_fisicas', 'criar', pessoaId, null, null, conn);
    await conn.commit();         // Grava tudo de uma vez — pessoa + telefones + e-mails + auditoria
    return sucesso(res, { id: pessoaId }, 'Pessoa cadastrada com sucesso', 201);
  } catch (err) {
    await conn.rollback();       // Desfaz tudo se qualquer INSERT falhou
    // Rede de segurança da trava de unicidade do banco: se dois cadastros do mesmo CPF
    // chegarem ao mesmo tempo, o segundo é barrado aqui com mensagem amigável (não erro 500).
    if (err.code === 'ER_DUP_ENTRY') return erro(res, 'CPF já cadastrado no sistema');
    if (err.codigoContaBancaria) return erro(res, err.message, 422);
    return erroInterno(res, err);
  } finally {
    conn.release();              // SEMPRE devolve a conexão ao pool
  }
}

// PUT /api/pessoas/fisicas/:id — Atualiza pessoa física
async function atualizarFisica(req, res) {
  const { id } = req.params;
  const {
    nome, cpf, rg, rg_orgao, pis, ctps_numero, ctps_serie,
    data_nascimento, estado_civil_id, profissao_id,
    genero_id, nacionalidade_id, nome_pai, nome_mae,
    cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes,
    telefones = [], emails = [], contasBancarias = [],
    responsavel_id, parentesco_id, avisos_idade
  } = req.body;

  const erroAvisos = validarAvisosIdade(avisos_idade);
  if (erroAvisos) return erro(res, erroAvisos);

  // Transação: dados principais + telefones + e-mails + auditoria gravam juntos ou nada
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Busca dados atuais para auditoria
    const [antes] = await conn.execute('SELECT * FROM pessoas_fisicas WHERE id = ?', [id]);
    if (!antes.length) { await conn.rollback(); return naoEncontrado(res, 'Pessoa não encontrada'); }

    // Responsável legal: mesma validação da criação, agora sabendo quem é a pessoa editada
    const erroResp = await validarResponsavel(conn, { pessoaId: id, responsavel_id, parentesco_id });
    if (erroResp) { await conn.rollback(); return erro(res, erroResp); }

    await conn.execute(
      `UPDATE pessoas_fisicas SET
         nome=?, cpf=?, rg=?, rg_orgao=?, pis=?, ctps_numero=?, ctps_serie=?,
         data_nascimento=?, estado_civil_id=?, profissao_id=?,
         genero_id=?, nacionalidade_id=?, nome_pai=?, nome_mae=?,
         cep=?, logradouro=?, numero=?, complemento=?, bairro=?,
         cidade=?, estado=?, observacoes=?,
         responsavel_id=?, parentesco_id=?,
         alterado_por=?, alterado_em=NOW()
       WHERE id = ?`,
      [
        nome?.trim(), cpf?.replace(/\D/g, '') || null, rg || null, rg_orgao || null,
        pis || null, ctps_numero || null, ctps_serie || null,
        // Garante formato YYYY-MM-DD — frontend pode enviar ISO com horário (ex: 1972-03-27T03:00:00.000Z)
        data_nascimento ? data_nascimento.toString().slice(0, 10) : null,
        estado_civil_id || null, profissao_id || null,
        genero_id || null, nacionalidade_id || null, nome_pai || null, nome_mae || null,
        cep || null, logradouro || null, numero || null,
        complemento || null, bairro || null, cidade || null, estado || null,
        observacoes || null,
        responsavel_id || null, parentesco_id || null,
        req.usuario.id,   // alterado_por — id de quem fez o update
        id
      ]
    );

    // Telefones e e-mails: a tela de edição carrega a lista COMPLETA (via buscarFisica),
    // então regrava exatamente o que está no formulário — o que o usuário vê é o que fica salvo.
    await conn.execute('DELETE FROM telefones_pf WHERE pessoa_id = ?', [id]);
    for (const tel of semRepetidos(telefones, chaveTelefone)) {
      if (tel.numero) {
        await conn.execute(
          'INSERT INTO telefones_pf (pessoa_id, numero, tipo, principal) VALUES (?, ?, ?, ?)',
          [id, tel.numero, tel.tipo || 'celular', tel.principal ? 1 : 0]
        );
      }
    }
    await conn.execute('DELETE FROM emails_pf WHERE pessoa_id = ?', [id]);
    for (const em of semRepetidos(emails, chaveEmail)) {
      const emailNorm = em.email ? em.email.trim().toLowerCase() : '';
      if (emailNorm) {
        await conn.execute(
          'INSERT INTO emails_pf (pessoa_id, email, principal) VALUES (?, ?, ?)',
          [id, emailNorm, em.principal ? 1 : 0]
        );
      }
    }

    // Contas bancárias/PIX: mesma regra de telefones/e-mails — regrava a lista completa
    // (conta própria sempre usa nome/CPF atuais, mesmo que o formulário mande outra coisa)
    await gravarContasBancarias(conn, 'contas_bancarias_pf', id, contasBancarias,
      nome?.trim(), cpf?.replace(/\D/g, '') || null);

    // Avisos de idade — só mexe se a tela mandou a lista (undefined = não alterar)
    await gravarAvisosIdade(conn, id, avisos_idade, req.usuario.id);

    await auditoria.registrar(req.usuario.id, 'pessoas_fisicas', 'editar', id, antes[0], null, conn);
    await conn.commit();
    return sucesso(res, null, 'Pessoa atualizada com sucesso');
  } catch (err) {
    await conn.rollback();
    // Trava de unicidade: editar o CPF para um que já existe em outra pessoa cai aqui.
    if (err.code === 'ER_DUP_ENTRY') return erro(res, 'Este CPF já está cadastrado em outra pessoa');
    if (err.codigoContaBancaria) return erro(res, err.message, 422);
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// DELETE /api/pessoas/fisicas/:id — Exclui pessoa física SEM vínculos
// Antes de excluir, verifica em paralelo todas as tabelas relacionadas.
// Se houver qualquer vínculo, bloqueia e informa o motivo.
// Telefones e e-mails são removidos automaticamente via CASCADE do banco.
async function excluirFisica(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT nome FROM pessoas_fisicas WHERE id = ? AND ativo = 1', [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Pessoa não encontrada');

    // Verifica todos os vínculos em paralelo antes de permitir exclusão
    const [[autoresTbl], [reusTbl], [historico], [comunicacoes], [testemunhas], [peritos], [representados],
           [peritoPericia], [localPericia], [parceriaAcordo], [pendenciaDoc], [beneficiarioAcordo], [beneficiarioRepasse]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM tbltituloprocautor WHERE tipo_pessoa = ? AND pessoa_id = ?',      ['fisica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM tbltituloprocreu WHERE tipo_pessoa = ? AND pessoa_id = ?',        ['fisica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM historico_atendimento WHERE tipo_pessoa = ? AND pessoa_id = ?',   ['fisica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM log_comunicacoes WHERE tipo_pessoa = ? AND pessoa_id = ?',        ['fisica', id]),
      // Testemunha é sempre pessoa física (FK em audiencia_testemunhas com ON DELETE RESTRICT). Sem esta
      // checagem, excluir uma testemunha caía no erro genérico do banco em vez de avisar o motivo ao usuário.
      pool.execute('SELECT COUNT(*) AS total FROM audiencia_testemunhas WHERE pessoa_id = ?',                       [id]),
      // Perito do processo (processo_perito) é ligação polimórfica SEM chave estrangeira em pessoa_id.
      // Sem esta checagem, apagar uma pessoa que é perito deixaria um registro órfão em processo_perito.
      pool.execute('SELECT COUNT(*) AS total FROM processo_perito WHERE tipo_pessoa = ? AND pessoa_id = ?',         ['fisica', id]),
      // Responsável legal: apagar quem representa alguém deixaria o representado apontando
      // para o vazio (o banco também barraria pela chave estrangeira, com erro feio)
      pool.execute('SELECT COUNT(*) AS total FROM pessoas_fisicas WHERE responsavel_id = ?',                        [id]),
      // Perito DA PERÍCIA (pericia.perito_tipo/perito_id) e local da perícia (pericia_local_reu) e
      // sócio/parceria de honorários (acordo_parcela) — vínculos polimórficos SEM chave estrangeira.
      // A rotina de unificação já trata esses 3 campos (confirmando que são vínculos reais); sem
      // esta checagem, excluir a pessoa deixava órfão neles (auditoria 02/09, item 8).
      pool.execute('SELECT COUNT(*) AS total FROM pericia WHERE perito_tipo = ? AND perito_id = ?',                 ['fisica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM pericia_local_reu WHERE tipo_pessoa = ? AND pessoa_id = ?',       ['fisica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM acordo_parcela WHERE parceria_pessoa_tipo = ? AND parceria_pessoa_id = ?', ['fisica', id]),
      // Pendência de documentos (tipo_pessoa/pessoa_id polimórfico, SEM chave estrangeira):
      // sem esta checagem, apagar o cliente deixaria a cobrança sem cadastro correspondente.
      pool.execute('SELECT COUNT(*) AS total FROM pendencia_documento WHERE tipo_pessoa = ? AND pessoa_id = ?',     ['fisica', id]),
      // Beneficiário do acordo/alvará e destino do repasse por parcela (colunas polimórficas SEM
      // chave estrangeira, iguais em espírito a parceria_pessoa_id) — sem esta checagem, excluir o
      // beneficiário deixava acordo/parcela órfão (auditoria 23/09).
      pool.execute('SELECT COUNT(*) AS total FROM acordo WHERE beneficiario_cliente_tipo = ? AND beneficiario_cliente_id = ?', ['fisica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM acordo_parcela WHERE repasse_cliente_tipo = ? AND repasse_cliente_pessoa_id = ?', ['fisica', id]),
    ]);

    // Multa da parcela (acordo_parcela_multa) — mesmos 2 campos polimórficos SEM chave
    // estrangeira da parcela (parceria/repasse), mas em tabela própria: a multa GRAVA UMA
    // CÓPIA da pessoa no momento em que é lançada, então pode divergir da parcela se a
    // pessoa da parcela mudou depois (auditoria 24/09, item 2).
    const [[multaParceria], [multaRepasse]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM acordo_parcela_multa WHERE parceria_pessoa_tipo = ? AND parceria_pessoa_id = ?', ['fisica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM acordo_parcela_multa WHERE repasse_cliente_tipo = ? AND repasse_cliente_pessoa_id = ?', ['fisica', id]),
    ]);

    // Monta lista de vínculos encontrados para informar o usuário
    const vinculos = [];
    if (autoresTbl[0].total > 0)   vinculos.push(`${autoresTbl[0].total} processo(s) como autor`);
    if (reusTbl[0].total > 0)      vinculos.push(`${reusTbl[0].total} processo(s) como réu`);
    if (historico[0].total > 0)    vinculos.push(`${historico[0].total} registro(s) de histórico`);
    if (comunicacoes[0].total > 0) vinculos.push(`${comunicacoes[0].total} comunicação(ões)`);
    if (testemunhas[0].total > 0)  vinculos.push(`${testemunhas[0].total} audiência(s) como testemunha`);
    if (peritos[0].total > 0)      vinculos.push(`${peritos[0].total} perícia(s) como perito`);
    if (representados[0].total > 0) vinculos.push(`${representados[0].total} pessoa(s) que representa como responsável legal`);
    if (peritoPericia[0].total > 0) vinculos.push(`${peritoPericia[0].total} perícia(s) como perito designado`);
    if (localPericia[0].total > 0)  vinculos.push(`${localPericia[0].total} perícia(s) usando seu endereço como local`);
    if (parceriaAcordo[0].total > 0) vinculos.push(`${parceriaAcordo[0].total} parcela(s) de acordo com parceria de honorários`);
    if (pendenciaDoc[0].total > 0)  vinculos.push(`${pendenciaDoc[0].total} pendência(s) de documentos`);
    if (beneficiarioAcordo[0].total > 0) vinculos.push(`${beneficiarioAcordo[0].total} acordo(s)/alvará(s) tendo esta pessoa como beneficiária do repasse`);
    if (beneficiarioRepasse[0].total > 0) vinculos.push(`${beneficiarioRepasse[0].total} parcela(s) com repasse configurado para esta pessoa`);
    if (multaParceria[0].total > 0) vinculos.push(`${multaParceria[0].total} multa(s) de parcela com parceria de honorários`);
    if (multaRepasse[0].total > 0)  vinculos.push(`${multaRepasse[0].total} multa(s) de parcela com repasse configurado para esta pessoa`);

    if (vinculos.length > 0) {
      return erro(res, `Pessoa não pode ser excluída pois possui: ${vinculos.join(', ')}`);
    }

    // Sem vínculos — DELETE real (telefones, e-mails e contas bancárias apagam via CASCADE do banco)
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM pessoas_fisicas WHERE id = ?', [id]);
      await auditoria.registrar(req.usuario.id, 'pessoas_fisicas', 'excluir', id, null, null, conn);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Pessoa excluída com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/pessoas/juridicas/:id — Exclui pessoa jurídica SEM vínculos
// Mesma lógica da física: verifica vínculos em paralelo antes de excluir.
async function excluirJuridica(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT razao_social FROM pessoas_juridicas WHERE id = ? AND ativo = 1', [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Pessoa jurídica não encontrada');

    // Verifica todos os vínculos em paralelo antes de permitir exclusão
    const [[autoresTbl], [reusTbl], [historico], [comunicacoes], [peritos],
           [peritoPericia], [localPericia], [parceriaAcordo], [pendenciaDoc], [beneficiarioAcordo], [beneficiarioRepasse]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM tbltituloprocautor WHERE tipo_pessoa = ? AND pessoa_id = ?',      ['juridica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM tbltituloprocreu WHERE tipo_pessoa = ? AND pessoa_id = ?',        ['juridica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM historico_atendimento WHERE tipo_pessoa = ? AND pessoa_id = ?',   ['juridica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM log_comunicacoes WHERE tipo_pessoa = ? AND pessoa_id = ?',        ['juridica', id]),
      // Perito polimórfico SEM chave estrangeira — sem esta checagem, apagar a empresa deixaria órfão em processo_perito.
      pool.execute('SELECT COUNT(*) AS total FROM processo_perito WHERE tipo_pessoa = ? AND pessoa_id = ?',         ['juridica', id]),
      // Mesmos 3 vínculos polimórficos SEM chave estrangeira verificados em excluirFisica
      // (auditoria 02/09, item 8) — aqui do lado jurídico (empresa perito/local/parceira).
      pool.execute('SELECT COUNT(*) AS total FROM pericia WHERE perito_tipo = ? AND perito_id = ?',                 ['juridica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM pericia_local_reu WHERE tipo_pessoa = ? AND pessoa_id = ?',       ['juridica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM acordo_parcela WHERE parceria_pessoa_tipo = ? AND parceria_pessoa_id = ?', ['juridica', id]),
      // Pendência de documentos (polimórfica, sem chave estrangeira) — mesma lógica da física.
      pool.execute('SELECT COUNT(*) AS total FROM pendencia_documento WHERE tipo_pessoa = ? AND pessoa_id = ?',     ['juridica', id]),
      // Beneficiário do acordo/alvará e destino do repasse por parcela — mesma lógica da física
      // (auditoria 23/09).
      pool.execute('SELECT COUNT(*) AS total FROM acordo WHERE beneficiario_cliente_tipo = ? AND beneficiario_cliente_id = ?', ['juridica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM acordo_parcela WHERE repasse_cliente_tipo = ? AND repasse_cliente_pessoa_id = ?', ['juridica', id]),
    ]);

    // Multa da parcela (acordo_parcela_multa) — mesma lógica da física: campos polimórficos
    // SEM chave estrangeira que gravam uma CÓPIA da pessoa ao lançar a multa, podendo
    // divergir da parcela (auditoria 24/09, item 2).
    const [[multaParceria], [multaRepasse]] = await Promise.all([
      pool.execute('SELECT COUNT(*) AS total FROM acordo_parcela_multa WHERE parceria_pessoa_tipo = ? AND parceria_pessoa_id = ?', ['juridica', id]),
      pool.execute('SELECT COUNT(*) AS total FROM acordo_parcela_multa WHERE repasse_cliente_tipo = ? AND repasse_cliente_pessoa_id = ?', ['juridica', id]),
    ]);

    // Monta lista de vínculos encontrados para informar o usuário
    const vinculos = [];
    if (autoresTbl[0].total > 0)   vinculos.push(`${autoresTbl[0].total} processo(s) como autor`);
    if (reusTbl[0].total > 0)      vinculos.push(`${reusTbl[0].total} processo(s) como réu`);
    if (historico[0].total > 0)    vinculos.push(`${historico[0].total} registro(s) de histórico`);
    if (comunicacoes[0].total > 0) vinculos.push(`${comunicacoes[0].total} comunicação(ões)`);
    if (peritos[0].total > 0)      vinculos.push(`${peritos[0].total} perícia(s) como perito`);
    if (peritoPericia[0].total > 0) vinculos.push(`${peritoPericia[0].total} perícia(s) como perito designado`);
    if (localPericia[0].total > 0)  vinculos.push(`${localPericia[0].total} perícia(s) usando seu endereço como local`);
    if (parceriaAcordo[0].total > 0) vinculos.push(`${parceriaAcordo[0].total} parcela(s) de acordo com parceria de honorários`);
    if (pendenciaDoc[0].total > 0)  vinculos.push(`${pendenciaDoc[0].total} pendência(s) de documentos`);
    if (beneficiarioAcordo[0].total > 0) vinculos.push(`${beneficiarioAcordo[0].total} acordo(s)/alvará(s) tendo esta pessoa como beneficiária do repasse`);
    if (beneficiarioRepasse[0].total > 0) vinculos.push(`${beneficiarioRepasse[0].total} parcela(s) com repasse configurado para esta pessoa`);
    if (multaParceria[0].total > 0) vinculos.push(`${multaParceria[0].total} multa(s) de parcela com parceria de honorários`);
    if (multaRepasse[0].total > 0)  vinculos.push(`${multaRepasse[0].total} multa(s) de parcela com repasse configurado para esta pessoa`);

    if (vinculos.length > 0) {
      return erro(res, `Pessoa não pode ser excluída pois possui: ${vinculos.join(', ')}`);
    }

    // Sem vínculos — DELETE real (telefones, e-mails e contas bancárias apagam via CASCADE do banco)
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM pessoas_juridicas WHERE id = ?', [id]);
      await auditoria.registrar(req.usuario.id, 'pessoas_juridicas', 'excluir', id, null, null, conn);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Pessoa jurídica excluída com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/pessoas/juridicas/unificar — Une cadastros DUPLICADOS de uma empresa
// em um único (o "principal"): move TODOS os vínculos dos duplicados para o
// principal e depois apaga os duplicados. Tudo dentro de UMA transação.
//
// Vínculos de uma empresa (conferidos na estrutura do banco — mover TODOS p/ não deixar órfão):
//   - Por (tipo_pessoa='juridica', pessoa_id): tbltituloprocautor, tbltituloprocreu,
//     historico_atendimento, log_comunicacoes, processo_perito.
//   - Por coluna própria (tipo+id): pericia (perito_tipo/perito_id), acordo_parcela
//     (parceria_pessoa_tipo/parceria_pessoa_id).
//   - Beneficiário do repasse (tipo+id): acordo (beneficiario_cliente_tipo/id), acordo_parcela
//     (repasse_cliente_tipo/pessoa_id).
//   - "Filhos" do cadastro (por pessoa_id): telefones_pj, emails_pj.
async function unificarJuridicas(req, res) {
  const principalId = parseInt(req.body.principal_id);
  // Remove repetidos, valores inválidos e o próprio principal da lista de duplicados
  let duplicados = Array.isArray(req.body.duplicados_ids) ? req.body.duplicados_ids.map(Number) : [];
  duplicados = [...new Set(duplicados.filter(x => x && x !== principalId))];

  if (!principalId)          return erro(res, 'Cadastro principal é obrigatório');
  if (duplicados.length === 0) return erro(res, 'Selecione ao menos um cadastro duplicado diferente do principal');

  // Confere que TODOS os cadastros (principal + duplicados) existem em pessoas_juridicas
  const idsTodos = [principalId, ...duplicados];
  const phTodos  = idsTodos.map(() => '?').join(',');
  const [existentes] = await pool.execute(
    `SELECT id FROM pessoas_juridicas WHERE id IN (${phTodos})`, idsTodos
  );
  if (existentes.length !== idsTodos.length) {
    return erro(res, 'Algum cadastro selecionado não foi encontrado');
  }

  const dupPh = duplicados.map(() => '?').join(','); // placeholders para os duplicados

  // A unificação NÃO migra "local de perícia" nem "pendência de documentos" (vínculos
  // polimórficos SEM chave estrangeira). Se um DUPLICADO — que será apagado — estiver
  // em uso nesses vínculos, BLOQUEIA (decisão do usuário 10/09), para não deixar
  // registro apontando para um id apagado. Tolerante a banco sem as tabelas.
  try {
    const [[locPer], [pendDoc]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total FROM pericia_local_reu WHERE tipo_pessoa = 'juridica' AND pessoa_id IN (${dupPh})`, duplicados),
      pool.execute(`SELECT COUNT(*) AS total FROM pendencia_documento  WHERE tipo_pessoa = 'juridica' AND pessoa_id IN (${dupPh})`, duplicados),
    ]);
    if (locPer[0].total > 0) {
      return erro(res, 'Não é possível unificar: um dos cadastros selecionados é usado como local de perícia. Ajuste a perícia, unifique e refaça o vínculo.');
    }
    if (pendDoc[0].total > 0) {
      return erro(res, 'Não é possível unificar: um dos cadastros selecionados tem pendência(s) de documentos. Resolva ou cancele a pendência, unifique e refaça.');
    }
  } catch (e) {
    console.error('Checagem de local de perícia / pendência de documentos indisponível:', e.message);
  }

  // Se algum DUPLICADO tiver acordo, alvará ou qualquer lançamento no Financeiro, a
  // unificação fica PROIBIDA (decisão do usuário 24/09) — em vez de mover o vínculo.
  // O principal não entra nesta checagem: ele continua existindo, seus lançamentos ficam intactos.
  try {
    const [[acordoBenef], [parcelaParceria], [parcelaRepasse], [multaParceria], [multaRepasse]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total FROM acordo WHERE beneficiario_cliente_tipo = 'juridica' AND beneficiario_cliente_id IN (${dupPh})`, duplicados),
      pool.execute(`SELECT COUNT(*) AS total FROM acordo_parcela WHERE parceria_pessoa_tipo = 'juridica' AND parceria_pessoa_id IN (${dupPh})`, duplicados),
      pool.execute(`SELECT COUNT(*) AS total FROM acordo_parcela WHERE repasse_cliente_tipo = 'juridica' AND repasse_cliente_pessoa_id IN (${dupPh})`, duplicados),
      pool.execute(`SELECT COUNT(*) AS total FROM acordo_parcela_multa WHERE parceria_pessoa_tipo = 'juridica' AND parceria_pessoa_id IN (${dupPh})`, duplicados),
      pool.execute(`SELECT COUNT(*) AS total FROM acordo_parcela_multa WHERE repasse_cliente_tipo = 'juridica' AND repasse_cliente_pessoa_id IN (${dupPh})`, duplicados),
    ]);
    const totalFinanceiro = acordoBenef[0].total + parcelaParceria[0].total + parcelaRepasse[0].total
      + multaParceria[0].total + multaRepasse[0].total;
    if (totalFinanceiro > 0) {
      return erro(res, 'Não é possível unificar: um dos cadastros selecionados tem acordo, alvará ou lançamento no Financeiro (parceria, repasse ou multa). Resolva/finalize no Financeiro antes de unificar.');
    }
  } catch (err) {
    return erroInterno(res, err);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) PARTES do processo (autor e réu): move os duplicados para o principal e,
    //    em seguida, remove partes repetidas que a fusão possa ter gerado no MESMO
    //    processo (mantém o registro de menor id).
    for (const tabela of ['tbltituloprocautor', 'tbltituloprocreu']) {
      await conn.execute(
        `UPDATE ${tabela} SET pessoa_id = ?
          WHERE tipo_pessoa = 'juridica' AND pessoa_id IN (${dupPh})`,
        [principalId, ...duplicados]
      );
      await conn.execute(
        `DELETE t FROM ${tabela} t
           JOIN ${tabela} t2
             ON t.proc_id = t2.proc_id AND t.tipo_pessoa = t2.tipo_pessoa
            AND t.pessoa_id = t2.pessoa_id AND t.id > t2.id
          WHERE t.tipo_pessoa = 'juridica' AND t.pessoa_id = ?`,
        [principalId]
      );
    }

    // 2) PERITO do processo (processo_perito, por tipo+id): move e remove repetição no
    //    MESMO processo (a fusão pode deixar o mesmo perito 2x no processo).
    await conn.execute(
      `UPDATE processo_perito SET pessoa_id = ?
        WHERE tipo_pessoa = 'juridica' AND pessoa_id IN (${dupPh})`,
      [principalId, ...duplicados]
    );
    await conn.execute(
      `DELETE t FROM processo_perito t
         JOIN processo_perito t2
           ON t.proc_id = t2.proc_id AND t.tipo_pessoa = t2.tipo_pessoa
          AND t.pessoa_id = t2.pessoa_id AND t.id > t2.id
        WHERE t.tipo_pessoa = 'juridica' AND t.pessoa_id = ?`,
      [principalId]
    );

    // 3) Vínculos por (tipo+id) sem repetição a tratar: histórico e comunicações — só mover.
    for (const tabela of ['historico_atendimento', 'log_comunicacoes']) {
      await conn.execute(
        `UPDATE ${tabela} SET pessoa_id = ?
          WHERE tipo_pessoa = 'juridica' AND pessoa_id IN (${dupPh})`,
        [principalId, ...duplicados]
      );
    }

    // 4) Perito de PERÍCIA (coluna própria; 1 por linha — só mover). Parceria/beneficiário/repasse
    // do Financeiro NÃO são movidos: a checagem acima já garante que nenhum duplicado os tem.
    await conn.execute(
      `UPDATE pericia SET perito_id = ?
        WHERE perito_tipo = 'juridica' AND perito_id IN (${dupPh})`,
      [principalId, ...duplicados]
    );

    // 5) "Filhos" do cadastro (telefones, e-mails e contas bancárias): move para o principal
    //    p/ não perder contatos (esses não têm tipo_pessoa; pertencem só à empresa).
    // contas_bancarias_pj é TOLERANTE (banco sem o script S3 ainda) — as demais são fixas.
    for (const tabela of ['telefones_pj', 'emails_pj']) {
      await conn.execute(
        `UPDATE ${tabela} SET pessoa_id = ? WHERE pessoa_id IN (${dupPh})`,
        [principalId, ...duplicados]
      );
    }
    try {
      await conn.execute(
        `UPDATE contas_bancarias_pj SET pessoa_id = ? WHERE pessoa_id IN (${dupPh})`,
        [principalId, ...duplicados]
      );
    } catch (e) {
      console.error('Contas bancárias não movidas na unificação (banco sem o script S3?):', e.message);
    }

    // 5.1) Marca "Em Recuperação Judicial": se QUALQUER um dos cadastros unidos estiver
    //      marcado, o principal fica marcado. Sem isto a informação sumiria calada quando
    //      a marca estivesse só no duplicado (a unificação preserva os dados do principal).
    await conn.execute(
      `UPDATE pessoas_juridicas SET em_recuperacao_judicial = 1
        WHERE id = ? AND EXISTS (SELECT 1 FROM (
                SELECT 1 FROM pessoas_juridicas d
                 WHERE d.id IN (${dupPh}) AND d.em_recuperacao_judicial = 1
              ) AS m)`,
      [principalId, ...duplicados]
    );

    // 6) Apaga os cadastros duplicados (agora sem nenhum vínculo)
    await conn.execute(`DELETE FROM pessoas_juridicas WHERE id IN (${dupPh})`, duplicados);

    // 7) Auditoria dentro da MESMA transação (falha aqui desfaz tudo)
    await auditoria.registrar(
      req.usuario.id, 'pessoas_juridicas', 'unificar', principalId, null,
      { unificados: duplicados }, conn
    );

    await conn.commit();
    return sucesso(res, { principal_id: principalId, unificados: duplicados.length },
      `${duplicados.length} cadastro(s) unificado(s) no principal com sucesso`);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// ---- UNIFICAR PESSOAS FÍSICAS DUPLICADAS (só admin/superadmin) ----
// Move TODOS os vínculos dos duplicados para o principal e apaga os duplicados, em 1 transação.
// Vínculos da pessoa física (conferidos no banco — mover todos p/ NÃO deixar órfão):
//   - Por (tipo_pessoa='fisica', pessoa_id): tbltituloprocautor, tbltituloprocreu,
//     historico_atendimento, log_comunicacoes, processo_perito.
//   - Por coluna própria (tipo+id): pericia (perito_tipo/perito_id), acordo_parcela
//     (parceria_pessoa_tipo/parceria_pessoa_id).
//   - Beneficiário do repasse (tipo+id): acordo (beneficiario_cliente_tipo/id), acordo_parcela
//     (repasse_cliente_tipo/pessoa_id).
//   - FK diretas (por pessoa_id): audiencia_testemunhas, telefones_pf, emails_pf.
// TRAVA DE CPF: CPFs diferentes = pessoas diferentes -> bloqueia. O principal HERDA o CPF
// se estiver sem (só um dos selecionados pode ter CPF, pois cpf é UNIQUE no banco).
async function unificarFisicas(req, res) {
  const principalId = parseInt(req.body.principal_id);
  let duplicados = Array.isArray(req.body.duplicados_ids) ? req.body.duplicados_ids.map(Number) : [];
  duplicados = [...new Set(duplicados.filter(x => x && x !== principalId))];

  if (!principalId)            return erro(res, 'Cadastro principal é obrigatório');
  if (duplicados.length === 0) return erro(res, 'Selecione ao menos um cadastro duplicado diferente do principal');

  // Carrega id + cpf de todos os selecionados (confere existência e alimenta a trava de CPF).
  const idsTodos = [principalId, ...duplicados];
  const phTodos  = idsTodos.map(() => '?').join(',');
  const [regs] = await pool.execute(
    `SELECT id, cpf FROM pessoas_fisicas WHERE id IN (${phTodos})`, idsTodos
  );
  if (regs.length !== idsTodos.length) {
    return erro(res, 'Algum cadastro selecionado não foi encontrado');
  }

  // TRAVA DE CPF: dois ou mais CPFs diferentes preenchidos = pessoas diferentes.
  const cpfsDistintos = [...new Set(regs.map(r => (r.cpf || '').trim()).filter(Boolean))];
  if (cpfsDistintos.length > 1) {
    return erro(res, 'Estes cadastros têm CPFs diferentes e não podem ser unificados — CPFs diferentes indicam pessoas diferentes.');
  }
  // RESPONSÁVEL LEGAL: a unificação NÃO mexe nesse vínculo — bloqueia e avisa (decisão do usuário).
  // Vale nas DUAS pontas: quem representa alguém e quem é representado. Sem isso, unificar
  // apagaria o vínculo em silêncio (ou esbarraria na chave estrangeira, com erro de banco).
  try {
    const [[repDe], [temResp]] = await Promise.all([
      pool.execute(
        `SELECT COUNT(*) AS total FROM pessoas_fisicas WHERE responsavel_id IN (${phTodos})`, idsTodos
      ),
      pool.execute(
        `SELECT COUNT(*) AS total FROM pessoas_fisicas WHERE id IN (${phTodos}) AND responsavel_id IS NOT NULL`, idsTodos
      ),
    ]);
    if (repDe[0].total > 0) {
      return erro(res, 'Não é possível unificar: um dos cadastros selecionados é responsável legal de outra(s) pessoa(s). Desfaça o vínculo de responsável legal, unifique e depois refaça o vínculo.');
    }
    if (temResp[0].total > 0) {
      return erro(res, 'Não é possível unificar: um dos cadastros selecionados tem responsável legal. Desfaça o vínculo de responsável legal, unifique e depois refaça o vínculo.');
    }
    // Mesma decisão: a unificação NÃO migra avisos de idade — bloqueia para não
    // apagá-los em silêncio junto com o cadastro duplicado.
    // TOLERANTE ao banco sem o script: sem a tabela, não há avisos a proteger.
    try {
      const [avisos] = await pool.execute(
        `SELECT COUNT(*) AS total FROM pessoas_avisos_idade WHERE pessoa_id IN (${phTodos})`, idsTodos
      );
      if (avisos[0].total > 0) {
        return erro(res, 'Não é possível unificar: um dos cadastros selecionados tem aviso de idade configurado. Remova os avisos, unifique e configure de novo.');
      }
    } catch (e) {
      console.error('Checagem de avisos de idade indisponível:', e.message);
    }
  } catch (err) {
    return erroInterno(res, err);
  }

  const cpfGrupo     = cpfsDistintos[0] || null;                                       // único CPF do grupo (se houver)
  const cpfPrincipal = (regs.find(r => r.id === principalId)?.cpf || '').trim() || null; // CPF atual do principal

  const dupPh = duplicados.map(() => '?').join(',');

  // A unificação NÃO migra "local de perícia" nem "pendência de documentos" (vínculos
  // polimórficos SEM chave estrangeira). Se um DUPLICADO estiver em uso neles, BLOQUEIA
  // (decisão do usuário 10/09). Tolerante a banco sem as tabelas.
  try {
    const [[locPer], [pendDoc]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total FROM pericia_local_reu WHERE tipo_pessoa = 'fisica' AND pessoa_id IN (${dupPh})`, duplicados),
      pool.execute(`SELECT COUNT(*) AS total FROM pendencia_documento  WHERE tipo_pessoa = 'fisica' AND pessoa_id IN (${dupPh})`, duplicados),
    ]);
    if (locPer[0].total > 0) {
      return erro(res, 'Não é possível unificar: um dos cadastros selecionados é usado como local de perícia. Ajuste a perícia, unifique e refaça o vínculo.');
    }
    if (pendDoc[0].total > 0) {
      return erro(res, 'Não é possível unificar: um dos cadastros selecionados tem pendência(s) de documentos. Resolva ou cancele a pendência, unifique e refaça.');
    }
  } catch (e) {
    console.error('Checagem de local de perícia / pendência de documentos indisponível:', e.message);
  }

  // Se algum DUPLICADO tiver acordo, alvará ou qualquer lançamento no Financeiro, a
  // unificação fica PROIBIDA (decisão do usuário 24/09) — em vez de mover o vínculo.
  // O principal não entra nesta checagem: ele continua existindo, seus lançamentos ficam intactos.
  try {
    const [[acordoBenef], [parcelaParceria], [parcelaRepasse], [multaParceria], [multaRepasse]] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total FROM acordo WHERE beneficiario_cliente_tipo = 'fisica' AND beneficiario_cliente_id IN (${dupPh})`, duplicados),
      pool.execute(`SELECT COUNT(*) AS total FROM acordo_parcela WHERE parceria_pessoa_tipo = 'fisica' AND parceria_pessoa_id IN (${dupPh})`, duplicados),
      pool.execute(`SELECT COUNT(*) AS total FROM acordo_parcela WHERE repasse_cliente_tipo = 'fisica' AND repasse_cliente_pessoa_id IN (${dupPh})`, duplicados),
      pool.execute(`SELECT COUNT(*) AS total FROM acordo_parcela_multa WHERE parceria_pessoa_tipo = 'fisica' AND parceria_pessoa_id IN (${dupPh})`, duplicados),
      pool.execute(`SELECT COUNT(*) AS total FROM acordo_parcela_multa WHERE repasse_cliente_tipo = 'fisica' AND repasse_cliente_pessoa_id IN (${dupPh})`, duplicados),
    ]);
    const totalFinanceiro = acordoBenef[0].total + parcelaParceria[0].total + parcelaRepasse[0].total
      + multaParceria[0].total + multaRepasse[0].total;
    if (totalFinanceiro > 0) {
      return erro(res, 'Não é possível unificar: um dos cadastros selecionados tem acordo, alvará ou lançamento no Financeiro (parceria, repasse ou multa). Resolva/finalize no Financeiro antes de unificar.');
    }
  } catch (err) {
    return erroInterno(res, err);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) PARTES (autor e réu): move + remove repetição no MESMO processo (mantém menor id).
    for (const tabela of ['tbltituloprocautor', 'tbltituloprocreu']) {
      await conn.execute(
        `UPDATE ${tabela} SET pessoa_id = ? WHERE tipo_pessoa = 'fisica' AND pessoa_id IN (${dupPh})`,
        [principalId, ...duplicados]
      );
      await conn.execute(
        `DELETE t FROM ${tabela} t
           JOIN ${tabela} t2 ON t.proc_id = t2.proc_id AND t.tipo_pessoa = t2.tipo_pessoa
             AND t.pessoa_id = t2.pessoa_id AND t.id > t2.id
          WHERE t.tipo_pessoa = 'fisica' AND t.pessoa_id = ?`,
        [principalId]
      );
    }

    // 2) PERITO do processo (processo_perito): move + remove repetição no mesmo processo.
    await conn.execute(
      `UPDATE processo_perito SET pessoa_id = ? WHERE tipo_pessoa = 'fisica' AND pessoa_id IN (${dupPh})`,
      [principalId, ...duplicados]
    );
    await conn.execute(
      `DELETE t FROM processo_perito t
         JOIN processo_perito t2 ON t.proc_id = t2.proc_id AND t.tipo_pessoa = t2.tipo_pessoa
           AND t.pessoa_id = t2.pessoa_id AND t.id > t2.id
        WHERE t.tipo_pessoa = 'fisica' AND t.pessoa_id = ?`,
      [principalId]
    );

    // 3) TESTEMUNHA (audiencia_testemunhas, FK direta): move + remove repetição na mesma audiência.
    await conn.execute(
      `UPDATE audiencia_testemunhas SET pessoa_id = ? WHERE pessoa_id IN (${dupPh})`,
      [principalId, ...duplicados]
    );
    await conn.execute(
      `DELETE t FROM audiencia_testemunhas t
         JOIN audiencia_testemunhas t2 ON t.audiencia_id = t2.audiencia_id
           AND t.pessoa_id = t2.pessoa_id AND t.id > t2.id
        WHERE t.pessoa_id = ?`,
      [principalId]
    );

    // 4) Vínculos por (tipo+id) sem repetição a tratar: histórico e comunicações — só mover.
    for (const tabela of ['historico_atendimento', 'log_comunicacoes']) {
      await conn.execute(
        `UPDATE ${tabela} SET pessoa_id = ? WHERE tipo_pessoa = 'fisica' AND pessoa_id IN (${dupPh})`,
        [principalId, ...duplicados]
      );
    }

    // 5) Perito de PERÍCIA (coluna própria; 1 por linha — só mover). Parceria/beneficiário/repasse
    // do Financeiro NÃO são movidos: a checagem acima já garante que nenhum duplicado os tem.
    await conn.execute(
      `UPDATE pericia SET perito_id = ? WHERE perito_tipo = 'fisica' AND perito_id IN (${dupPh})`,
      [principalId, ...duplicados]
    );

    // 6) Telefones, e-mails e contas bancárias (FK por pessoa_id): move para o principal.
    // contas_bancarias_pf é TOLERANTE (banco sem o script S3 ainda) — as demais são fixas.
    for (const tabela of ['telefones_pf', 'emails_pf']) {
      await conn.execute(
        `UPDATE ${tabela} SET pessoa_id = ? WHERE pessoa_id IN (${dupPh})`,
        [principalId, ...duplicados]
      );
    }
    try {
      await conn.execute(
        `UPDATE contas_bancarias_pf SET pessoa_id = ? WHERE pessoa_id IN (${dupPh})`,
        [principalId, ...duplicados]
      );
    } catch (e) {
      console.error('Contas bancárias não movidas na unificação (banco sem o script S3?):', e.message);
    }

    // 7) Apaga os cadastros duplicados (agora sem nenhum vínculo). Isso LIBERA o CPF único.
    await conn.execute(`DELETE FROM pessoas_fisicas WHERE id IN (${dupPh})`, duplicados);

    // 8) HERANÇA DE CPF: se o principal estava sem CPF e o grupo tinha um, grava agora
    //    (só é possível depois do delete acima, que libera o índice UNIQUE do CPF).
    if (!cpfPrincipal && cpfGrupo) {
      await conn.execute(`UPDATE pessoas_fisicas SET cpf = ? WHERE id = ?`, [cpfGrupo, principalId]);
    }

    // 9) Auditoria dentro da MESMA transação (falha aqui desfaz tudo).
    await auditoria.registrar(
      req.usuario.id, 'pessoas_fisicas', 'unificar', principalId, null,
      { unificados: duplicados, cpf_herdado: (!cpfPrincipal && cpfGrupo) ? cpfGrupo : null }, conn
    );

    await conn.commit();
    return sucesso(res, { principal_id: principalId, unificados: duplicados.length },
      `${duplicados.length} cadastro(s) unificado(s) no principal com sucesso`);
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// POST /api/pessoas/(fisicas|juridicas)/:id/historico — Adiciona uma anotação de atendimento.
// tipo_pessoa vem no corpo, mas é sempre normalizado para 'fisica' ou 'juridica' (nunca confia no
// valor cru do cliente). Qualquer usuário logado pode registrar — quem atende, anota.
async function adicionarHistorico(req, res) {
  try {
    const { id } = req.params;
    const { descricao } = req.body;
    const tipoPessoa = req.body.tipo_pessoa === 'juridica' ? 'juridica' : 'fisica';

    if (!descricao || !descricao.trim()) return erro(res, 'A anotação não pode ficar em branco');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `INSERT INTO historico_atendimento (tipo_pessoa, pessoa_id, descricao, usuario_id)
         VALUES (?, ?, ?, ?)`,
        [tipoPessoa, id, descricao.trim(), req.usuario.id]
      );
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }

    return sucesso(res, null, 'Anotação registrada com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// Regra de permissão das anotações (usada por editar e excluir):
//   - Admin (nível <= 1): pode tudo, em qualquer data e de qualquer usuário.
//   - Demais: só a PRÓPRIA anotação E somente no dia de hoje (a data de "hoje" é a do
//     servidor — DATE(criado_em) = CURDATE() —, para não depender do relógio do navegador).
// Retorna { ok, motivo } onde motivo é null (permitido) ou uma mensagem amigável.
async function podeAlterarAnotacao(histId, usuario) {
  const [rows] = await pool.execute(
    `SELECT usuario_id, (DATE(criado_em) = CURDATE()) AS hoje
       FROM historico_atendimento WHERE id = ?`,
    [histId]
  );
  if (!rows.length) return { ok: false, naoEncontrado: true };
  const anotacao = rows[0];
  const ehAdmin = Number(usuario.nivel) <= 1;
  if (ehAdmin) return { ok: true };
  const ehDono = Number(anotacao.usuario_id) === Number(usuario.id);
  const ehHoje = Number(anotacao.hoje) === 1;
  if (ehDono && ehHoje) return { ok: true };
  return { ok: false, motivo: 'Você só pode editar ou excluir as anotações que você escreveu hoje.' };
}

// PUT /api/pessoas/historico/:histId — Edita o texto de uma anotação (respeitando a regra acima).
async function editarHistorico(req, res) {
  try {
    const { histId } = req.params;
    const { descricao } = req.body;
    if (!descricao || !descricao.trim()) return erro(res, 'A anotação não pode ficar em branco');

    const permissao = await podeAlterarAnotacao(histId, req.usuario);
    if (permissao.naoEncontrado) return naoEncontrado(res, 'Anotação não encontrada');
    if (!permissao.ok)           return erro(res, permissao.motivo, 403);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        'UPDATE historico_atendimento SET descricao = ? WHERE id = ?',
        [descricao.trim(), histId]
      );
      await auditoria.registrar(req.usuario.id, 'historico_atendimento', 'alterar', histId, null, null, conn);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Anotação atualizada com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/pessoas/historico/:histId — Exclui uma anotação (respeitando a regra acima).
async function excluirHistorico(req, res) {
  try {
    const { histId } = req.params;

    const permissao = await podeAlterarAnotacao(histId, req.usuario);
    if (permissao.naoEncontrado) return naoEncontrado(res, 'Anotação não encontrada');
    if (!permissao.ok)           return erro(res, permissao.motivo, 403);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM historico_atendimento WHERE id = ?', [histId]);
      await auditoria.registrar(req.usuario.id, 'historico_atendimento', 'excluir', histId, null, null, conn);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Anotação excluída com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ---- PESSOAS JURÍDICAS ----

// GET /api/pessoas/juridicas — Lista todas as pessoas jurídicas
async function listarJuridicas(req, res) {
  try {
    const { busca, pagina = 1, limite = 20, selecao } = req.query;
    const modoSelecao = selecao === '1' || selecao === 'true' || selecao === true; // ver listarFisicas
    // parseInt garante valores inteiros seguros para uso direto na query
    const limitInt  = Math.min(parseInt(limite) || 20, 100);
    const offsetInt = parseInt((pagina - 1) * limitInt) || 0;
    const params = [];
    let where = 'WHERE pj.ativo = 1';

    // Filtro de busca abrangente (mesma condição reutilizada na exportação — ver condBuscaJuridica)
    if (busca) {
      const f = condBuscaJuridica(busca, modoSelecao);
      where += f.cond;
      params.push(...f.params);
    }

    // Filtro pela etiqueta DO ESCRITÓRIO (compartilhada).
    const etqEscSlot = parseInt(req.query.etiquetaEscritorio);
    if (etqEscSlot >= 1 && etqEscSlot <= 5) {
      where += ' AND EXISTS (SELECT 1 FROM pessoas_juridicas_etiquetas_escritorio ee WHERE ee.pessoa_id = pj.id AND ee.slot = ?)';
      params.push(etqEscSlot);
    }

    // Quem COMEÇA pelo termo primeiro, só no modo "escolher empresa" — ver listarFisicas.
    const ordem = (modoSelecao && busca) ? 'ORDER BY (pj.razao_social LIKE ?) DESC, pj.razao_social ASC'
                                         : 'ORDER BY pj.razao_social ASC';
    const paramsOrdem = (modoSelecao && busca) ? [`${busca}%`] : [];

    // Nota: LIMIT e OFFSET inseridos diretamente (sanitizados com parseInt — MySQL 8 não aceita ? em LIMIT/OFFSET)
    const [rows] = await pool.execute(
      `SELECT pj.id, pj.razao_social, pj.nome_fantasia, pj.cnpj,
              (SELECT t.numero FROM telefones_pj t WHERE t.pessoa_id = pj.id AND t.ativo = 1
               ORDER BY t.principal DESC LIMIT 1) AS telefone,
              (SELECT e.email FROM emails_pj e WHERE e.pessoa_id = pj.id AND e.ativo = 1
               ORDER BY e.principal DESC LIMIT 1) AS email,
              -- Total de processos como autor ou réu (sem duplicatas)
              (SELECT COUNT(*) FROM (
                SELECT proc_id FROM tbltituloprocautor WHERE tipo_pessoa = 'juridica' AND pessoa_id = pj.id
                UNION
                SELECT proc_id FROM tbltituloprocreu   WHERE tipo_pessoa = 'juridica' AND pessoa_id = pj.id
              ) AS t) AS qtde_proc,
              (SELECT ee.slot FROM pessoas_juridicas_etiquetas_escritorio ee
                WHERE ee.pessoa_id = pj.id) AS etiqueta_escritorio
       FROM pessoas_juridicas pj ${where}
       ${ordem}
       LIMIT ${limitInt} OFFSET ${offsetInt}`,
      [...params, ...paramsOrdem]
    );

    const [total] = await pool.execute(
      `SELECT COUNT(*) as total FROM pessoas_juridicas pj ${where}`, params
    );

    return sucesso(res, { registros: rows, total: total[0].total });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/pessoas/juridicas — Cadastra pessoa jurídica
async function criarJuridica(req, res) {
  const {
    razao_social, nome_fantasia, cnpj, inscricao_estadual,
    cep, logradouro, numero, complemento, bairro, cidade, estado,
    observacoes, telefones = [], emails = [], contasBancarias = [],
    // Marca "Em Recuperação Judicial": fica no cadastro da EMPRESA. É dela que nasce
    // o aviso vermelho na pasta de todo processo em que ela é parte.
    em_recuperacao_judicial
  } = req.body;

  if (!razao_social) return erro(res, 'A razão social é obrigatória');

  // Transação: garante que empresa, telefones e e-mails são gravados juntos ou nenhum é
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO pessoas_juridicas
         (razao_social, nome_fantasia, cnpj, inscricao_estadual,
          cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes,
          em_recuperacao_judicial, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        razao_social.trim(), nome_fantasia || null,
        cnpj?.replace(/\D/g, '') || null, inscricao_estadual || null,
        cep || null, logradouro || null,
        numero || null, complemento || null, bairro || null,
        cidade || null, estado || null, observacoes || null,
        em_recuperacao_judicial ? 1 : 0, req.usuario.id
      ]
    );

    const pessoaId = result.insertId;

    // Insere telefones vinculados à empresa
    for (const tel of semRepetidos(telefones, chaveTelefone)) {
      if (tel.numero) {
        await conn.execute(
          'INSERT INTO telefones_pj (pessoa_id, numero, tipo, principal) VALUES (?, ?, ?, ?)',
          [pessoaId, tel.numero, tel.tipo || 'comercial', tel.principal ? 1 : 0]
        );
      }
    }

    // Insere e-mails vinculados à empresa
    for (const em of semRepetidos(emails, chaveEmail)) {
      const emailNorm = em.email ? em.email.trim().toLowerCase() : '';
      if (emailNorm) {
        await conn.execute(
          'INSERT INTO emails_pj (pessoa_id, email, principal) VALUES (?, ?, ?)',
          [pessoaId, emailNorm, em.principal ? 1 : 0]
        );
      }
    }

    // Contas bancárias/PIX (conta própria usa razão social/CNPJ da própria empresa)
    await gravarContasBancarias(conn, 'contas_bancarias_pj', pessoaId, contasBancarias,
      razao_social.trim(), cnpj?.replace(/\D/g, '') || null);

    // Auditoria participa da MESMA transação (tudo ou nada): grava antes do commit, com conn
    await auditoria.registrar(req.usuario.id, 'pessoas_juridicas', 'criar', pessoaId, null, null, conn);
    await conn.commit();         // Grava tudo de uma vez — empresa + telefones + e-mails + auditoria
    return sucesso(res, { id: pessoaId }, 'Pessoa jurídica cadastrada com sucesso', 201);
  } catch (err) {
    await conn.rollback();       // Desfaz tudo se qualquer INSERT falhou
    // Trava de unicidade do banco (uq_pj_cnpj): sem isto o CNPJ repetido virava
    // "Erro interno no servidor" e o usuário não descobria o motivo.
    if (err.code === 'ER_DUP_ENTRY') return erro(res, 'CNPJ já cadastrado no sistema');
    if (err.codigoContaBancaria) return erro(res, err.message, 422);
    return erroInterno(res, err);
  } finally {
    conn.release();              // SEMPRE devolve a conexão ao pool
  }
}

// GET /api/pessoas/juridicas/:id — Busca uma empresa com telefones e e-mails (para a tela de edição)
async function buscarJuridica(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM pessoas_juridicas WHERE id = ?', [id]);
    if (!rows.length) return naoEncontrado(res, 'Pessoa jurídica não encontrada');
    const pessoa = rows[0];

    const [telefones] = await pool.execute(
      'SELECT * FROM telefones_pj WHERE pessoa_id = ? ORDER BY principal DESC, id ASC', [id]
    );
    const [emails] = await pool.execute(
      'SELECT * FROM emails_pj WHERE pessoa_id = ? ORDER BY principal DESC, id ASC', [id]
    );

    // Anotações de atendimento (mesma tabela da física, filtrando pelo tipo jurídica).
    const [historico] = await pool.execute(
      `SELECT h.*, u.nome AS usuario_nome
       FROM historico_atendimento h
       JOIN usuarios u ON h.usuario_id = u.id
       WHERE h.tipo_pessoa = 'juridica' AND h.pessoa_id = ?
       ORDER BY h.criado_em DESC`,
      [id]
    );

    const pendencias_documento_abertas = await contarDocumentosPendentes('juridica', id);

    // Contas bancárias/PIX cadastradas. TOLERANTE: se a tabela ainda não existe nesta
    // instância (banco sem o script S3), devolve lista vazia em vez de quebrar a ficha.
    let contas_bancarias = [];
    try {
      const [rowsContas] = await pool.execute(
        `SELECT cb.*, ifin.nome AS instituicao_nome
           FROM contas_bancarias_pj cb
           JOIN instituicao_financeira ifin ON ifin.id = cb.instituicao_financeira_id
          WHERE cb.pessoa_id = ? AND cb.ativo = 1
          ORDER BY cb.principal DESC, cb.id ASC`,
        [id]
      );
      contas_bancarias = rowsContas;
    } catch (e) {
      console.error('Contas bancárias indisponíveis (banco sem o script S3?):', e.message);
    }

    return sucesso(res, { ...pessoa, telefones, emails, historico, pendencias_documento_abertas, contas_bancarias });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/pessoas/juridicas/:id — Atualiza uma pessoa jurídica.
// (Esta função FALTAVA: a edição de empresa caía por engano na atualização de PF e dava erro.)
// A tela de edição agora carrega a lista COMPLETA de telefones/e-mails (via buscarJuridica),
// então aqui regravamos exatamente o que está no formulário. NÃO mexe em inscrição estadual
// (não há campo na tela para ela — gravá-la apagaria o valor existente).
async function atualizarJuridica(req, res) {
  const { id } = req.params;
  const {
    razao_social, nome_fantasia, cnpj,
    cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes,
    telefones = [], emails = [], contasBancarias = [],
    em_recuperacao_judicial   // ver comentário em criarJuridica
  } = req.body;

  if (!razao_social) return erro(res, 'A razão social é obrigatória');

  // Transação: dados principais + telefones + e-mails + auditoria gravam juntos ou nada
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [antes] = await conn.execute('SELECT * FROM pessoas_juridicas WHERE id = ?', [id]);
    if (!antes.length) { await conn.rollback(); return naoEncontrado(res, 'Pessoa jurídica não encontrada'); }

    await conn.execute(
      `UPDATE pessoas_juridicas SET
         razao_social=?, nome_fantasia=?, cnpj=?,
         cep=?, logradouro=?, numero=?, complemento=?, bairro=?,
         cidade=?, estado=?, observacoes=?, em_recuperacao_judicial=?,
         alterado_por=?, alterado_em=NOW()
       WHERE id = ?`,
      [
        razao_social.trim(), nome_fantasia || null, cnpj?.replace(/\D/g, '') || null,
        cep || null, logradouro || null, numero || null, complemento || null, bairro || null,
        cidade || null, estado || null, observacoes || null,
        em_recuperacao_judicial ? 1 : 0,
        req.usuario.id, id
      ]
    );

    // Regrava telefones e e-mails conforme o formulário (que carregou a lista completa)
    await conn.execute('DELETE FROM telefones_pj WHERE pessoa_id = ?', [id]);
    for (const tel of semRepetidos(telefones, chaveTelefone)) {
      if (tel.numero) {
        await conn.execute(
          'INSERT INTO telefones_pj (pessoa_id, numero, tipo, principal) VALUES (?, ?, ?, ?)',
          [id, tel.numero, tel.tipo || 'comercial', tel.principal ? 1 : 0]
        );
      }
    }
    await conn.execute('DELETE FROM emails_pj WHERE pessoa_id = ?', [id]);
    for (const em of semRepetidos(emails, chaveEmail)) {
      const emailNorm = em.email ? em.email.trim().toLowerCase() : '';
      if (emailNorm) {
        await conn.execute(
          'INSERT INTO emails_pj (pessoa_id, email, principal) VALUES (?, ?, ?)',
          [id, emailNorm, em.principal ? 1 : 0]
        );
      }
    }

    // Contas bancárias/PIX: regrava a lista completa (conta própria usa razão social/CNPJ atuais)
    await gravarContasBancarias(conn, 'contas_bancarias_pj', id, contasBancarias,
      razao_social?.trim(), cnpj?.replace(/\D/g, '') || null);

    await auditoria.registrar(req.usuario.id, 'pessoas_juridicas', 'editar', id, antes[0], null, conn);
    await conn.commit();
    return sucesso(res, null, 'Pessoa jurídica atualizada com sucesso');
  } catch (err) {
    await conn.rollback();
    // Trava de unicidade: editar o CNPJ para um que já existe em outra empresa cai aqui.
    if (err.code === 'ER_DUP_ENTRY') return erro(res, 'Este CNPJ já está cadastrado em outra empresa');
    if (err.codigoContaBancaria) return erro(res, err.message, 422);
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// POST /api/pessoas/auxiliares/:tipo — Cadastra novo item em genero, estado_civil ou profissao
// tipo aceito: "generos" | "estados_civis" | "profissoes"
async function criarAuxiliar(req, res) {
  try {
    const { tipo } = req.params;
    const { nome } = req.body;

    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');

    // Whitelist de tabelas — evita SQL injection via parâmetro de rota
    const tabelas = {
      generos:                  'genero',
      estados_civis:            'estado_civil',
      profissoes:               'profissao',
      nacionalidades:           'nacionalidade',
      parentescos:              'parentesco',
      instituicoes_financeiras: 'instituicao_financeira',
    };

    const tabela = tabelas[tipo];
    if (!tabela) return erro(res, 'Tipo inválido. Use: generos, estados_civis, profissoes, nacionalidades, parentescos ou instituicoes_financeiras');

    // Banco (instituicao_financeira) tem regra própria — mesma usada pela tela dedicada de
    // Controle (preserva a grafia digitada e só compara contra bancos ATIVOS), em vez da
    // normalização genérica abaixo (auditoria 23/09: os dois caminhos divergiam).
    if (tabela === 'instituicao_financeira') {
      try {
        const banco = await criarBancoNoCatalogo(nome, req.usuario.id);
        return sucesso(res, banco, 'Cadastrado com sucesso', 201);
      } catch (e) {
        if (e.codigoValidacaoAuxiliar) return erro(res, e.message);
        if (e.code === 'ER_DUP_ENTRY') return erro(res, 'Já existe um banco com esse nome');
        return erroInterno(res, e);
      }
    }

    // Normaliza: primeira letra maiúscula, demais minúsculas
    const nomeTrimmed = nome.trim();
    const nomeNormalizado = nomeTrimmed.charAt(0).toUpperCase() + nomeTrimmed.slice(1).toLowerCase();

    // Verifica se já existe o mesmo nome (case-insensitive)
    const [dup] = await pool.execute(
      `SELECT id FROM ${tabela} WHERE LOWER(nome) = LOWER(?)`, [nomeNormalizado]
    );
    if (dup.length > 0) return erro(res, `"${nomeNormalizado}" já está cadastrado na lista`);

    const conn = await pool.getConnection();
    let result;
    try {
      await conn.beginTransaction();
      [result] = await conn.execute(
        `INSERT INTO ${tabela} (nome) VALUES (?)`, [nomeNormalizado]
      );
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }

    return sucesso(res, { id: result.insertId, nome: nomeNormalizado }, 'Cadastrado com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

function normalizarNomeAuxiliar(nome) {
  const nomeTrimmed = String(nome || '').trim();
  return nomeTrimmed.charAt(0).toUpperCase() + nomeTrimmed.slice(1).toLowerCase();
}

async function listarProfissoes(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT p.id, p.nome, COUNT(pf.id) AS total_pessoas
       FROM profissao p
       LEFT JOIN pessoas_fisicas pf ON pf.profissao_id = p.id
       GROUP BY p.id, p.nome
       ORDER BY p.nome`
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

async function listarPessoasPorProfissao(req, res) {
  try {
    const { id } = req.params;
    const [prof] = await pool.execute('SELECT id, nome FROM profissao WHERE id = ?', [id]);
    if (!prof.length) return erro(res, 'Profissão não encontrada', 404);

    const [rows] = await pool.execute(
      `SELECT pf.id, pf.nome, pf.cpf,
              (SELECT t.numero FROM telefones_pf t
               WHERE t.pessoa_id = pf.id AND t.ativo = 1
               ORDER BY t.principal DESC, t.id ASC LIMIT 1) AS telefone,
              (SELECT e.email FROM emails_pf e
               WHERE e.pessoa_id = pf.id AND e.ativo = 1
               ORDER BY e.principal DESC, e.id ASC LIMIT 1) AS email
       FROM pessoas_fisicas pf
       WHERE pf.ativo = 1 AND pf.profissao_id = ?
       ORDER BY pf.nome`,
      [id]
    );

    return sucesso(res, { profissao: prof[0], pessoas: rows });
  } catch (err) {
    return erroInterno(res, err);
  }
}

async function criarProfissao(req, res) {
  try {
    const { nome } = req.body;
    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');

    const nomeNormalizado = normalizarNomeAuxiliar(nome);
    const [dup] = await pool.execute(
      'SELECT id FROM profissao WHERE LOWER(nome) = LOWER(?) LIMIT 1',
      [nomeNormalizado]
    );
    if (dup.length > 0) return erro(res, `"${nomeNormalizado}" já está cadastrada na lista`);

    const conn = await pool.getConnection();
    let result;
    try {
      await conn.beginTransaction();
      [result] = await conn.execute(
        'INSERT INTO profissao (nome) VALUES (?)',
        [nomeNormalizado]
      );
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }

    return sucesso(res, { id: result.insertId, nome: nomeNormalizado }, 'Profissão cadastrada com sucesso', 201);
  } catch (err) {
    return erroInterno(res, err);
  }
}

async function atualizarProfissao(req, res) {
  try {
    const { id } = req.params;
    const { nome } = req.body;
    if (!nome?.trim()) return erro(res, 'Nome é obrigatório');

    const nomeNormalizado = normalizarNomeAuxiliar(nome);
    const [atual] = await pool.execute('SELECT id FROM profissao WHERE id = ?', [id]);
    if (!atual.length) return erro(res, 'Profissão não encontrada', 404);

    const [dup] = await pool.execute(
      'SELECT id FROM profissao WHERE LOWER(nome) = LOWER(?) AND id <> ? LIMIT 1',
      [nomeNormalizado, id]
    );
    if (dup.length > 0) return erro(res, `"${nomeNormalizado}" já está cadastrada na lista`);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE profissao SET nome = ? WHERE id = ?', [nomeNormalizado, id]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Profissão atualizada com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

async function excluirProfissao(req, res) {
  try {
    const { id } = req.params;
    const [atual] = await pool.execute('SELECT id, nome FROM profissao WHERE id = ?', [id]);
    if (!atual.length) return erro(res, 'Profissão não encontrada', 404);

    const [uso] = await pool.execute(
      'SELECT COUNT(*) AS total FROM pessoas_fisicas WHERE profissao_id = ?',
      [id]
    );
    const total = Number(uso[0]?.total || 0);
    if (total > 0) {
      return erro(res, `Não é possível excluir "${atual[0].nome}" porque existem ${total} pessoa(s) usando esta profissão`);
    }

    // Freelancers também usam profissão (advogados_freela.profissao_id, FK SET NULL) — sem
    // esta checagem, excluir apagava a profissão do freelancer em silêncio (auditoria 24/09).
    const [usoFreela] = await pool.execute(
      'SELECT COUNT(*) AS total FROM advogados_freela WHERE profissao_id = ?',
      [id]
    );
    const totalFreela = Number(usoFreela[0]?.total || 0);
    if (totalFreela > 0) {
      return erro(res, `Não é possível excluir "${atual[0].nome}" porque existem ${totalFreela} freelancer(s) usando esta profissão`);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM profissao WHERE id = ?', [id]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Profissão excluída com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/pessoas/fisicas/cpf/:cpf — Verifica se CPF já existe no banco
async function buscarPorCPF(req, res) {
  try {
    const cpf = req.params.cpf.replace(/\D/g, '');
    if (cpf.length !== 11) return erro(res, 'CPF inválido');

    const [rows] = await pool.execute(
      'SELECT id, nome, cpf FROM pessoas_fisicas WHERE cpf = ? AND ativo = 1',
      [cpf]
    );

    if (!rows.length) return sucesso(res, { existe: false });

    // Retorna que existe e dados básicos para o frontend decidir o que fazer
    return sucesso(res, { existe: true, pessoa: rows[0] });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/pessoas/auxiliares — Retorna listas para preencher selects
async function buscarAuxiliares(req, res) {
  try {
    const [estados_civis]  = await pool.execute('SELECT * FROM estado_civil ORDER BY nome');
    const [generos]        = await pool.execute('SELECT * FROM genero ORDER BY nome');
    const [profissoes]     = await pool.execute('SELECT * FROM profissao ORDER BY nome');
    const [nacionalidades] = await pool.execute('SELECT * FROM nacionalidade ORDER BY nome');
    const [parentescos]    = await pool.execute('SELECT * FROM parentesco ORDER BY nome');
    // Catálogo de bancos para o cadastro de contas bancárias (aba "Financeiro" da Pessoa).
    // TOLERANTE: se a tabela ainda não existe nesta instância (script do banco pendente),
    // devolve lista vazia em vez de quebrar TODOS os auxiliares da tela de Pessoas.
    let instituicoes_financeiras = [];
    try {
      const [rowsInst] = await pool.execute('SELECT id, nome FROM instituicao_financeira WHERE ativo = 1 ORDER BY nome');
      instituicoes_financeiras = rowsInst;
    } catch (e) {
      console.error('Catálogo de bancos indisponível (banco sem o script S2?):', e.message);
    }

    return sucesso(res, { estados_civis, generos, profissoes, nacionalidades, parentescos, instituicoes_financeiras });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ============================================================
// EXPORTAÇÃO PARA EXCEL (.xlsx) — Pessoas Físicas e Jurídicas
// Exporta a MESMA busca da listagem (sem paginação). Os campos vêm
// da tela (checkboxes) e são validados contra uma LISTA BRANCA: nome de
// coluna NUNCA é montado a partir de texto cru do request (segurança).
// ============================================================

// Lista branca de campos exportáveis de PESSOA FÍSICA (ordem = ordem das colunas no Excel).
const CAMPOS_PF = {
  nome:            { header: 'Nome',               width: 32, sql: 'pf.nome' },
  cpf:             { header: 'CPF',                width: 16, sql: 'pf.cpf' },
  rg:              { header: 'RG',                 width: 14, sql: 'pf.rg' },
  rg_orgao:        { header: 'Órgão RG',           width: 12, sql: 'pf.rg_orgao' },
  pis:             { header: 'PIS',                width: 16, sql: 'pf.pis' },
  ctps_numero:     { header: 'CTPS Nº',            width: 14, sql: 'pf.ctps_numero' },
  ctps_serie:      { header: 'CTPS Série',         width: 12, sql: 'pf.ctps_serie' },
  nome_pai:        { header: 'Nome do pai',        width: 28, sql: 'pf.nome_pai' },
  nome_mae:        { header: 'Nome da mãe',        width: 28, sql: 'pf.nome_mae' },
  data_nascimento: { header: 'Data de nascimento', width: 16, sql: 'pf.data_nascimento', data: true },
  estado_civil:    { header: 'Estado civil',       width: 16, sql: 'ec.nome', join: 'LEFT JOIN estado_civil ec ON pf.estado_civil_id = ec.id' },
  profissao:       { header: 'Profissão',          width: 22, sql: 'pr.nome', join: 'LEFT JOIN profissao pr ON pf.profissao_id = pr.id' },
  genero:          { header: 'Gênero',             width: 12, sql: 'g.nome',   join: 'LEFT JOIN genero g ON pf.genero_id = g.id' },
  nacionalidade:   { header: 'Nacionalidade',      width: 16, sql: 'nac.nome', join: 'LEFT JOIN nacionalidade nac ON pf.nacionalidade_id = nac.id' },
  cep:             { header: 'CEP',                width: 10, sql: 'pf.cep' },
  logradouro:      { header: 'Logradouro',         width: 30, sql: 'pf.logradouro' },
  numero:          { header: 'Número',             width: 8,  sql: 'pf.numero' },
  complemento:     { header: 'Complemento',        width: 18, sql: 'pf.complemento' },
  bairro:          { header: 'Bairro',             width: 18, sql: 'pf.bairro' },
  cidade:          { header: 'Cidade',             width: 18, sql: 'pf.cidade' },
  estado:          { header: 'UF',                 width: 6,  sql: 'pf.estado' },
  telefone:        { header: 'Telefone',           width: 16, sql: '(SELECT t.numero FROM telefones_pf t WHERE t.pessoa_id = pf.id AND t.ativo = 1 ORDER BY t.principal DESC, t.id ASC LIMIT 1)' },
  email:           { header: 'E-mail',             width: 28, sql: '(SELECT e.email FROM emails_pf e WHERE e.pessoa_id = pf.id AND e.ativo = 1 ORDER BY e.principal DESC, e.id ASC LIMIT 1)' },
  observacoes:     { header: 'Observações',        width: 40, sql: 'pf.observacoes' },
};

// Lista branca de campos exportáveis de PESSOA JURÍDICA.
const CAMPOS_PJ = {
  razao_social:        { header: 'Razão social',       width: 32, sql: 'pj.razao_social' },
  nome_fantasia:       { header: 'Nome fantasia',      width: 28, sql: 'pj.nome_fantasia' },
  cnpj:                { header: 'CNPJ',               width: 20, sql: 'pj.cnpj' },
  inscricao_estadual:  { header: 'Inscrição estadual', width: 18, sql: 'pj.inscricao_estadual' },
  cep:                 { header: 'CEP',                width: 10, sql: 'pj.cep' },
  logradouro:          { header: 'Logradouro',         width: 30, sql: 'pj.logradouro' },
  numero:              { header: 'Número',             width: 8,  sql: 'pj.numero' },
  complemento:         { header: 'Complemento',        width: 18, sql: 'pj.complemento' },
  bairro:              { header: 'Bairro',             width: 18, sql: 'pj.bairro' },
  cidade:              { header: 'Cidade',             width: 18, sql: 'pj.cidade' },
  estado:              { header: 'UF',                 width: 6,  sql: 'pj.estado' },
  telefone:            { header: 'Telefone',           width: 16, sql: '(SELECT t.numero FROM telefones_pj t WHERE t.pessoa_id = pj.id AND t.ativo = 1 ORDER BY t.principal DESC, t.id ASC LIMIT 1)' },
  email:               { header: 'E-mail',             width: 28, sql: '(SELECT e.email FROM emails_pj e WHERE e.pessoa_id = pj.id AND e.ativo = 1 ORDER BY e.principal DESC, e.id ASC LIMIT 1)' },
  observacoes:         { header: 'Observações',        width: 40, sql: 'pj.observacoes' },
};

// Monta o arquivo .xlsx a partir das linhas + a lista branca de campos escolhidos.
async function gerarExcelPessoas(res, { rows, ordem, mapa, aba, nomeArquivo }) {
  const ExcelJS = require('exceljs');               // require lazy: não derruba o boot se faltar a lib
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(aba);
  ws.columns = ordem.map(k => ({ header: mapa[k].header, key: k, width: mapa[k].width }));
  ws.getRow(1).font = { bold: true };
  const fmtData = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
  for (const r of rows) {
    const linha = {};
    for (const k of ordem) linha[k] = mapa[k].data ? fmtData(r[k]) : (r[k] == null ? '' : r[k]);
    ws.addRow(linha);
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
  await wb.xlsx.write(res);
  res.end();
}

// GET /api/pessoas/fisicas/exportar — exporta a busca atual (ou tudo) em Excel
async function exportarFisicas(req, res) {
  try {
    const { busca, campos } = req.query;
    // valida os campos pedidos contra a lista branca; mantém a ordem canônica do mapa
    const pedidos = (campos ? String(campos).split(',') : []);
    let ordem = Object.keys(CAMPOS_PF).filter(k => pedidos.includes(k));
    if (!ordem.length) ordem = ['nome'];

    const selectParts = ordem.map(k => `${CAMPOS_PF[k].sql} AS ${k}`);
    const joins = [...new Set(ordem.map(k => CAMPOS_PF[k].join).filter(Boolean))].join(' ');

    let where = 'WHERE pf.ativo = 1';
    const params = [];
    if (busca) { const f = condBuscaFisica(busca); where += f.cond; params.push(...f.params); }

    const [rows] = await pool.execute(
      `SELECT ${selectParts.join(', ')} FROM pessoas_fisicas pf ${joins} ${where} ORDER BY pf.nome ASC LIMIT 50000`,
      params
    );

    const [y, m, d] = hojeBrasilia().split('-');
    await gerarExcelPessoas(res, { rows, ordem, mapa: CAMPOS_PF, aba: 'Pessoas Físicas', nomeArquivo: `Pessoas Físicas - ${d}-${m}-${y}.xlsx` });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/pessoas/juridicas/exportar — exporta a busca atual (ou tudo) em Excel
async function exportarJuridicas(req, res) {
  try {
    const { busca, campos } = req.query;
    const pedidos = (campos ? String(campos).split(',') : []);
    let ordem = Object.keys(CAMPOS_PJ).filter(k => pedidos.includes(k));
    if (!ordem.length) ordem = ['razao_social'];

    const selectParts = ordem.map(k => `${CAMPOS_PJ[k].sql} AS ${k}`);
    const joins = [...new Set(ordem.map(k => CAMPOS_PJ[k].join).filter(Boolean))].join(' ');

    let where = 'WHERE pj.ativo = 1';
    const params = [];
    if (busca) { const f = condBuscaJuridica(busca); where += f.cond; params.push(...f.params); }

    const [rows] = await pool.execute(
      `SELECT ${selectParts.join(', ')} FROM pessoas_juridicas pj ${joins} ${where} ORDER BY pj.razao_social ASC LIMIT 50000`,
      params
    );

    const [y, m, d] = hojeBrasilia().split('-');
    await gerarExcelPessoas(res, { rows, ordem, mapa: CAMPOS_PJ, aba: 'Pessoas Jurídicas', nomeArquivo: `Pessoas Jurídicas - ${d}-${m}-${y}.xlsx` });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/pessoas/:tipo/:id/processos — Lista os processos de uma pessoa (física ou jurídica)
// Junta os papéis de AUTOR e RÉU sem repetir o mesmo processo. Usado ao clicar na "Qtde Proc".
// NÃO filtra por processo ativo, para bater exatamente com a contagem mostrada na coluna.
async function processosDaPessoa(req, res) {
  try {
    const { tipo: tipoParam, id } = req.params;
    // O parâmetro da rota é 'fisicas'/'juridicas'; nas tabelas de partes é 'fisica'/'juridica'
    const tipo = tipoParam === 'juridicas' ? 'juridica'
               : tipoParam === 'fisicas'   ? 'fisica'
               : null;
    if (!tipo) return erro(res, 'Tipo de pessoa inválido');

    const [rows] = await pool.execute(
      `SELECT
         pr.id, pr.numProc,
         pr.NomeTituloProc                       AS titulo,
         LPAD(pa.numPasta, 4, '0')               AS pasta_numero_fmt,
         sp.nome                                 AS status_nome,
         tp.nome                                 AS tipo_nome,
         v.abrev_nome                            AS vara_abrev_nome,
         v.nome                                  AS vara_nome,
         f.abrev_nome                            AS forum_abrev_nome,
         f.nome                                  AS forum_nome
       FROM tblproc pr
       JOIN tblpasta pa            ON pr.pasta_id   = pa.id
       LEFT JOIN tblvara v         ON pr.vara_id    = v.id
       LEFT JOIN tblforum f        ON v.forum_id    = f.id
       LEFT JOIN tbltipoproc tp    ON pr.tipo_id    = tp.id
       LEFT JOIN tblstatusproc sp  ON pr.status_id  = sp.id
       WHERE pr.id IN (
               SELECT proc_id FROM tbltituloprocautor WHERE tipo_pessoa = ? AND pessoa_id = ?
               UNION
               SELECT proc_id FROM tbltituloprocreu   WHERE tipo_pessoa = ? AND pessoa_id = ?
             )
       ORDER BY pa.numPasta DESC, pr.id DESC`,
      [tipo, id, tipo, id]
    );

    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ============================================================
// ANIVERSARIANTES (somente CLIENTES pessoa física)
// "Cliente" = PF que é a parte do cliente_polo (autor OU réu) de >=1 processo ativo.
// ============================================================

// Subconsulta reutilizável: ids das PF que são a parte-cliente de algum processo ativo.
const SUB_CLIENTES_PF = `
  SELECT a.pessoa_id FROM tbltituloprocautor a
    JOIN tblproc p ON a.proc_id = p.id
   WHERE p.cliente_polo = 'autor' AND a.tipo_pessoa = 'fisica' AND p.ativo = 1
  UNION
  SELECT r.pessoa_id FROM tbltituloprocreu r
    JOIN tblproc p ON r.proc_id = p.id
   WHERE p.cliente_polo = 'reu' AND r.tipo_pessoa = 'fisica' AND p.ativo = 1`;

// Próxima ocorrência do aniversário (este ano se ainda não passou; senão, ano que vem).
const PROX_ANIV = `
  DATE_ADD(pf.data_nascimento,
    INTERVAL (YEAR(CURDATE()) - YEAR(pf.data_nascimento)
      + IF(DATE_FORMAT(pf.data_nascimento,'%m%d') < DATE_FORMAT(CURDATE(),'%m%d'), 1, 0)) YEAR)`;

// Lê nome do escritório + template da mensagem. Tolerante à coluna mensagem_aniversario
// ainda não existir (se o ALTER não tiver sido rodado, usa o texto padrão).
// Aceita 'pool' ou uma conexão de transação (ambos têm .execute).
async function lerConfigEscritorio(exec) {
  try {
    const [r] = await exec.execute('SELECT nome, mensagem_aniversario FROM configuracoes_escritorio LIMIT 1');
    return { nome: r[0]?.nome || '', template: r[0]?.mensagem_aniversario || '' };
  } catch (_) {
    const [r] = await exec.execute('SELECT nome FROM configuracoes_escritorio LIMIT 1');
    return { nome: r[0]?.nome || '', template: '' };
  }
}

// Monta a mensagem resolvendo {{nome}} (1º nome do cliente) e {{escritorio}}.
function montarMensagemParabens(template, nomeCliente, nomeEscritorio) {
  const primeiroNome = String(nomeCliente || '').trim().split(/\s+/)[0] || String(nomeCliente || '');
  const padrao = 'Olá, {{nome}}! O escritório {{escritorio}} deseja a você um feliz aniversário! 🎂';
  const txt = (template && template.trim()) ? template : padrao;
  return txt
    .replace(/\{\{\s*nome\s*\}\}/gi, primeiroNome)
    .replace(/\{\{\s*escritorio\s*\}\}/gi, nomeEscritorio || '');
}

// Busca a lista de clientes aniversariantes conforme o filtro (usada pelo relatório e pelo dashboard).
// Retorna registros já com a mensagem resolvida e o status "já parabenizado neste ano".
async function buscarAniversariantes({ filtro = 'hoje', mes } = {}) {
  let filtroData = '';
  const params = [];
  if (filtro === 'semana') {
    filtroData = `AND ${PROX_ANIV} BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 6 DAY)`;
  } else if (filtro === 'mes') {
    filtroData = `AND MONTH(pf.data_nascimento) = ?`;
    params.push(parseInt(mes) || (new Date().getMonth() + 1));
  } else { // hoje (padrão)
    filtroData = `AND ${PROX_ANIV} = CURDATE()`;
  }

  const [rows] = await pool.execute(
    `SELECT pf.id, pf.nome,
            DATE_FORMAT(pf.data_nascimento, '%d/%m') AS dia,
            (YEAR(${PROX_ANIV}) - YEAR(pf.data_nascimento)) AS idade,
            YEAR(${PROX_ANIV}) AS ano_aniversario,
            (SELECT t.numero FROM telefones_pf t WHERE t.pessoa_id = pf.id AND t.ativo = 1
               ORDER BY t.principal DESC, t.id ASC LIMIT 1) AS telefone,
            (SELECT e.email FROM emails_pf e WHERE e.pessoa_id = pf.id AND e.ativo = 1
               ORDER BY e.principal DESC, e.id ASC LIMIT 1) AS email
       FROM pessoas_fisicas pf
      WHERE pf.ativo = 1
        AND pf.data_nascimento IS NOT NULL
        AND pf.id IN (${SUB_CLIENTES_PF})
        ${filtroData}
      ORDER BY MONTH(pf.data_nascimento), DAY(pf.data_nascimento), pf.nome`,
    params
  );

  // Mensagem configurada do escritório (nome + template).
  const cfg = await lerConfigEscritorio(pool);

  // "Já parabenizado" neste ano: busca os registros dos clientes retornados.
  const ids = rows.map(r => r.id);
  const mapa = {};
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const [pbs] = await pool.execute(
      `SELECT pe.pessoa_id, pe.ano, pe.canal, pe.enviado_em, u.nome AS usuario_nome
         FROM parabens_enviados pe
         JOIN usuarios u ON u.id = pe.usuario_id
        WHERE pe.pessoa_id IN (${ph})
        ORDER BY pe.enviado_em ASC`,
      ids
    );
    for (const p of pbs) {
      const chave = `${p.pessoa_id}_${p.ano}`;
      if (!mapa[chave]) mapa[chave] = [];
      mapa[chave].push({ canal: p.canal, usuario_nome: p.usuario_nome, enviado_em: p.enviado_em });
    }
  }

  return rows.map(r => {
    const jaEnviados = mapa[`${r.id}_${r.ano_aniversario}`] || [];
    return {
      ...r,
      mensagem: montarMensagemParabens(cfg.template, r.nome, cfg.nome),
      ja_parabenizado: jaEnviados.length > 0,
      parabens: jaEnviados,
    };
  });
}

// GET /api/pessoas/aniversariantes?filtro=hoje|semana|mes&mes=MM
async function listarAniversariantes(req, res) {
  try {
    const registros = await buscarAniversariantes(req.query);
    return sucesso(res, { registros, total: registros.length });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/pessoas/:id/parabens — Body { canal: 'whatsapp' | 'email' }
// E-mail: envia de fato e registra. WhatsApp: só registra (o link wa.me é aberto no navegador).
async function registrarParabens(req, res) {
  const { id } = req.params;
  const { canal } = req.body;
  if (!['whatsapp', 'email'].includes(canal)) {
    return erro(res, 'Canal inválido (use whatsapp ou email)');
  }

  const conn = await pool.getConnection();
  try {
    const [pRows] = await conn.execute(
      `SELECT pf.id, pf.nome, YEAR(${PROX_ANIV}) AS ano_aniversario,
              (SELECT e.email FROM emails_pf e WHERE e.pessoa_id = pf.id AND e.ativo = 1
                 ORDER BY e.principal DESC, e.id ASC LIMIT 1) AS email
         FROM pessoas_fisicas pf
        WHERE pf.id = ? AND pf.data_nascimento IS NOT NULL`,
      [id]
    );
    if (!pRows.length) {
      return naoEncontrado(res, 'Cliente não encontrado ou sem data de nascimento');
    }
    const pessoa = pRows[0];

    // E-mail: envia ANTES de registrar (só registra se o envio deu certo).
    if (canal === 'email') {
      if (!pessoa.email) {
        return erro(res, 'Este cliente não tem e-mail cadastrado');
      }
      const cfg = await lerConfigEscritorio(conn);
      const texto = montarMensagemParabens(cfg.template, pessoa.nome, cfg.nome);
      try {
        await enviarEmail({
          para: pessoa.email,
          assunto: 'Feliz Aniversário! 🎂',
          html: `<p>${texto.replace(/\n/g, '<br>')}</p>`,
        });
      } catch (e) {
        return erro(res, 'Não foi possível enviar o e-mail. Verifique a configuração de e-mail (SMTP).');
      }
    }

    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO parabens_enviados (pessoa_id, ano, canal, usuario_id) VALUES (?, ?, ?, ?)`,
      [pessoa.id, pessoa.ano_aniversario, canal, req.usuario.id]
    );
    await conn.commit();

    return sucesso(res, null, canal === 'email' ? 'Parabéns enviado por e-mail!' : 'Parabéns registrado!');
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* nada a desfazer */ }
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// ============================================================
// ENVIAR E-MAIL AVULSO (recurso "Enviar Email" do menu de Pessoas).
// Recebe { para, assunto, mensagem } + anexos opcionais (arquivos do PC, campo 'anexos')
// e envia pelo SMTP do escritório (utils/email), que já registra o resultado em log_emails.
// Os anexos vêm em memória (multer) e são DESCARTADOS após o envio — nada é salvo em disco,
// S3 ou banco; o e-mail em si e os anexos não ficam arquivados (só o log da comunicação).
// Não abre transação: o único INSERT (log_emails) acontece dentro de enviarEmail.
// ============================================================
async function enviarEmailAvulso(req, res) {
  const para     = String(req.body.para || '').trim();
  const assunto  = String(req.body.assunto || '').trim();
  const mensagem = String(req.body.mensagem || '').trim();
  // Pessoa destinatária (opcional) — só para registrar no log "quem enviou p/ quem".
  const tipoPessoa = (req.body.tipo_pessoa === 'fisica' || req.body.tipo_pessoa === 'juridica') ? req.body.tipo_pessoa : null;
  const pessoaId   = Number(req.body.pessoa_id) || null;

  // Validações básicas
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para);
  if (!emailValido) return erro(res, 'Informe um e-mail de destino válido');
  if (!assunto)     return erro(res, 'Informe o assunto do e-mail');
  if (!mensagem)    return erro(res, 'Escreva a mensagem do e-mail');

  // Anexos (arquivos do PC). Confere o total mesmo com o limite do multer, pois o
  // multer só valida o TAMANHO de cada arquivo — a soma precisa ser checada aqui.
  const arquivos = Array.isArray(req.files) ? req.files : [];
  // Lista branca de tipos (mesma do front): o Gmail bloqueia executáveis. Reforço no
  // servidor para o caso de a validação do front ser burlada.
  const permitidas = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
  const extInvalida = arquivos.some(f => !permitidas.includes(String(f.originalname || '').split('.').pop().toLowerCase()));
  if (extInvalida) {
    return erro(res, 'Tipo de arquivo não permitido. Aceita somente PDF, DOC, DOCX, JPG, JPEG ou PNG.');
  }
  const totalBytes = arquivos.reduce((s, f) => s + (f.size || 0), 0);
  if (totalBytes > LIMITE_TOTAL_ANEXOS) {
    return erro(res, 'Os anexos somam mais de 20 MB (limite do e-mail). Remova algum arquivo.');
  }
  const anexos = arquivos.map(f => ({ filename: f.originalname, content: f.buffer, contentType: f.mimetype }));

  // Monta o corpo HTML a partir do texto digitado: escapa os caracteres de HTML
  // (para o texto do usuário nunca quebrar/alterar o layout) e troca quebras de linha por <br>.
  const escaparHtml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const corpo = escaparHtml(mensagem).replace(/\r?\n/g, '<br>');
  const html  = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.5;">${corpo}</div>`;

  // Conteúdo do log: a mensagem + os NOMES dos anexos (não o arquivo em si).
  const nomesAnexos = arquivos.map(f => f.originalname).filter(Boolean).join(', ');
  const conteudoLog = nomesAnexos ? `${mensagem}\n\n[Anexos: ${nomesAnexos}]` : mensagem;

  try {
    await enviarEmail({ para, assunto, html, anexos });
  } catch (err) {
    // enviarEmail já gravou a falha em log_emails; registra a comunicação como falha e avisa.
    await registrarComunicacao({ canal: 'email', destinatario: para, assunto, conteudo: conteudoLog, enviado: 0, erro: err.message, tipo_pessoa: tipoPessoa, pessoa_id: pessoaId, usuario_id: req.usuario.id });
    return erro(res, 'Não foi possível enviar o e-mail. Verifique a configuração de e-mail (SMTP).');
  }
  await registrarComunicacao({ canal: 'email', destinatario: para, assunto, conteudo: conteudoLog, enviado: 1, erro: null, tipo_pessoa: tipoPessoa, pessoa_id: pessoaId, usuario_id: req.usuario.id });
  return sucesso(res, null, 'E-mail enviado com sucesso');
}

// Registra no log que o usuário abriu o WhatsApp (wa.me) de uma pessoa. Não envia nada —
// o envio é manual no WhatsApp; aqui só fica o registro "usuário X abriu zap p/ pessoa Y".
async function registrarEnvioZap(req, res) {
  const telefone   = String(req.body.telefone || '').trim();
  const tipoPessoa = (req.body.tipo_pessoa === 'fisica' || req.body.tipo_pessoa === 'juridica') ? req.body.tipo_pessoa : null;
  const pessoaId   = Number(req.body.pessoa_id) || null;
  if (!telefone) return erro(res, 'Telefone é obrigatório');
  await registrarComunicacao({ canal: 'whatsapp', destinatario: telefone, enviado: 1, tipo_pessoa: tipoPessoa, pessoa_id: pessoaId, usuario_id: req.usuario.id });
  return sucesso(res, null, 'Registrado');
}

// Lê a config da Comtele (configuracoes_integracoes, modulo='comtele'). Retorna
// { apiKey, route } — apiKey vazio quando a integração não está ativa/configurada.
async function lerConfigComtele() {
  const [rows] = await pool.execute(
    "SELECT ativo, configuracoes FROM configuracoes_integracoes WHERE modulo = 'comtele' LIMIT 1"
  );
  if (!rows.length || !rows[0].ativo) return { apiKey: '', route: '' };
  const cfg = rows[0].configuracoes
    ? (typeof rows[0].configuracoes === 'string' ? JSON.parse(rows[0].configuracoes) : rows[0].configuracoes)
    : {};
  return { apiKey: cfg.api_key || '', route: cfg.route || '' };
}

// POST /pessoas/enviar-sms — envia 1 SMS pela Comtele e registra em log_comunicacoes.
// Protegida por verificarPermissao('sms','cadastrar'). O número é normalizado (DDD, sem 55)
// dentro do smsService, que bloqueia telefone sem DDD.
async function enviarSMS(req, res) {
  const numero     = String(req.body.numero || '').trim();
  const mensagem   = String(req.body.mensagem || '').trim();
  const tipoPessoa = (req.body.tipo_pessoa === 'fisica' || req.body.tipo_pessoa === 'juridica') ? req.body.tipo_pessoa : null;
  const pessoaId   = Number(req.body.pessoa_id) || null;

  if (!numero)   return erro(res, 'Telefone é obrigatório');
  if (!mensagem) return erro(res, 'A mensagem do SMS é obrigatória');

  let apiKey, route;
  try {
    ({ apiKey, route } = await lerConfigComtele());
  } catch (e) {
    return erroInterno(res, e);
  }
  if (!apiKey) return erro(res, 'O envio de SMS não está configurado/ativo. Configure em Configurações → Integrações.');

  try {
    const r = await smsService.enviarSMS(apiKey, numero, mensagem, route);
    await registrarComunicacao({ canal: 'sms', destinatario: numero, conteudo: mensagem, enviado: 1, tipo_pessoa: tipoPessoa, pessoa_id: pessoaId, usuario_id: req.usuario.id });
    return sucesso(res, { id: r.id }, 'SMS enviado com sucesso');
  } catch (err) {
    await registrarComunicacao({ canal: 'sms', destinatario: numero, conteudo: mensagem, enviado: 0, erro: err.message, tipo_pessoa: tipoPessoa, pessoa_id: pessoaId, usuario_id: req.usuario.id });
    return erro(res, err.message || 'Não foi possível enviar o SMS');
  }
}

// GET /pessoas/sms-ativo — informa se o envio de SMS está ativo (para mostrar/ocultar
// o botão "Enviar SMS" no menu). Acessível a qualquer usuário logado.
async function smsAtivo(req, res) {
  try {
    const { apiKey } = await lerConfigComtele();
    return sucesso(res, { ativo: !!apiKey });
  } catch (e) {
    return erroInterno(res, e);
  }
}

module.exports = {
  listarFisicas, buscarFisica, criarFisica, atualizarFisica, excluirFisica, unificarFisicas, adicionarHistorico, editarHistorico, excluirHistorico,
  listarJuridicas, buscarJuridica, criarJuridica, atualizarJuridica, excluirJuridica, unificarJuridicas, buscarAuxiliares, buscarPorCPF, criarAuxiliar,
  listarProfissoes, listarPessoasPorProfissao, criarProfissao, atualizarProfissao, excluirProfissao,
  processosDaPessoa, exportarFisicas, exportarJuridicas,
  listarAniversariantes, registrarParabens, buscarAniversariantes, uploadAnexosEmail, enviarEmailAvulso, registrarEnvioZap,
  enviarSMS, smsAtivo
};
