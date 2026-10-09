// ============================================================
// CONTROLLER DE PERÍCIAS
// Agendamento de perícias técnicas vinculadas a processos.
// Fluxo espelhado na audiência: status (agendada/realizada/cancelada/remarcada),
// cancelar, remarcar e histórico (auditoria_pericia). NÃO tem "registrar ata".
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');
const { enviarComunicadoPericia, montarComunicadosPericia } = require('../services/comunicadoService');
const avisos = require('../avisos');
const agendaGoogle = require('../services/agendaGoogleService');
const { paginacao, escaparLike } = require('../utils/helpers');
const { texto, dataIso, inteiroPositivo } = require('../utils/camposTexto');
const { comIdNumerico } = require('../utils/rotasSeguras');
const { lerBuscaFrase, condBuscaFrase } = require('../utils/buscaFrase');

const LIMITE_MOTIVO_PERICIA = 300;           // motivo de cancelar / remarcar (mesmo limite dos prazos e audiências)
const LIMITE_OBS_AUDITORIA = 2000;           // texto da confirmação com senha (dia/horário incomum)
const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const FORMATO_RESPONSAVEL = /^(usuario|freela):\d+$/;
// Tamanho real de cada coluna da tabela pericia (estrutura_banco.sql) — passou disso o banco dá erro.
const TEXTOS_PERICIA = {
  local:       { rotulo: 'O local', max: 300 },
  cep:         { rotulo: 'O CEP', max: 9 },
  logradouro:  { rotulo: 'O logradouro', max: 200 },
  numero:      { rotulo: 'O número do endereço', max: 20 },
  complemento: { rotulo: 'O complemento', max: 100 },
  bairro:      { rotulo: 'O bairro', max: 100 },
  cidade:      { rotulo: 'A cidade', max: 100 },
  estado:      { rotulo: 'O estado', max: 2 },
};

// ===== Integração com o Google Agenda (convite .ics) =====
// Mesma lógica da audiência: o evento vai para o Google do RESPONSÁVEL, só quando
// ele for USUÁRIO do sistema (freelancer não tem login/Google). Título
// "Perícia: <nº do processo>". Data + hora (sem hora = dia inteiro). Melhor esforço:
// 2º plano, nunca derruba a operação (o serviço já engole erros).

// Monta os dados do evento a partir da perícia. Retorna null se não existir.
async function dadosPericiaParaGoogle(periciaId) {
  try {
    const [rows] = await pool.execute(
      `SELECT pe.responsavel_id, pe.data, pe.hora, pe.local,
              pe.cep, pe.logradouro, pe.numero, pe.complemento, pe.bairro, pe.cidade, pe.estado,
              pr.numProc AS num_processo,
              CASE WHEN pe.perito_tipo = 'fisica'   THEN pf.nome
                   WHEN pe.perito_tipo = 'juridica' THEN pj.razao_social END AS perito_nome
         FROM pericia pe
         LEFT JOIN tblproc pr           ON pe.processo_id = pr.id
         LEFT JOIN pessoas_fisicas pf   ON pe.perito_tipo = 'fisica'   AND pe.perito_id = pf.id
         LEFT JOIN pessoas_juridicas pj ON pe.perito_tipo = 'juridica' AND pe.perito_id = pj.id
        WHERE pe.id = ?`, [periciaId]
    );
    const p = rows[0];
    if (!p) return null;
    const partes = [];
    const localTexto = montarEnderecoPartes(p) || p.local;
    if (localTexto)    partes.push(`Local: ${localTexto}`);
    if (p.perito_nome) partes.push(`Perito: ${p.perito_nome}`);
    return {
      responsavel_id: p.responsavel_id,
      resumo: `Perícia: ${p.num_processo || ''}`.trim(),
      descricao: partes.join('\n'),
      data: p.data,
      hora: p.hora, // null = sem hora → evento de dia inteiro
    };
  } catch (e) {
    console.error('[pericia->google] falha ao montar dados:', e.message);
    return null;
  }
}

// Envia (ou cancela) o evento no Google do usuário responsável informado. Ignora
// quando não há usuário (freelancer/sem responsável) ou o usuário não ativou o envio.
async function enviarPericiaParaGoogle(usuarioId, periciaId, dados, cancelar = false, sequence = 0) {
  try {
    if (!usuarioId || !dados) return;
    const [u] = await pool.execute(
      'SELECT nome, google_agenda_ativo, google_agenda_email FROM usuarios WHERE id = ?', [usuarioId]
    );
    const dono = u[0];
    if (!dono || Number(dono.google_agenda_ativo) !== 1 || !dono.google_agenda_email) return;
    await agendaGoogle.enviarConviteEvento({
      tipo: 'pericia', id: periciaId, cancelar, sequence,
      resumo: dados.resumo, descricao: dados.descricao,
      data: dados.data, diaTodo: !dados.hora, horaInicio: dados.hora, horaFim: null,
      destinatarioEmail: dono.google_agenda_email, destinatarioNome: dono.nome,
    });
  } catch (e) {
    console.error('[pericia->google] falha ao enviar:', e.message);
  }
}

// Conveniência para os casos simples (usa o responsável ATUAL da perícia). 2º plano.
function sincronizarPericiaGoogle(periciaId, { cancelar = false, sequence = 0 } = {}) {
  dadosPericiaParaGoogle(periciaId).then(dados =>
    enviarPericiaParaGoogle(dados && dados.responsavel_id, periciaId, dados, cancelar, sequence)
  );
}

// Verifica permissão granular na tabela `permissoes` (admin/super: acesso total)
async function temPermissaoBackend(usuarioId, nivel, modulo, acao) {
  if (nivel <= 1) return true; // admin/super: acesso total
  const [rows] = await pool.execute(
    'SELECT permitido FROM permissoes WHERE usuario_id = ? AND modulo = ? AND submodulo IS NULL AND acao = ?',
    [usuarioId, modulo, acao]
  );
  return rows.length > 0 && rows[0].permitido === 1;
}

// "usuario:X" ou "freela:X" → { responsavel_id, responsavel_freela_id }
function parsarResponsavel(valor) {
  if (!valor) return { responsavel_id: null, responsavel_freela_id: null };
  const [tipo, id] = String(valor).split(':');
  if (tipo === 'usuario') return { responsavel_id: parseInt(id), responsavel_freela_id: null };
  if (tipo === 'freela')  return { responsavel_id: null, responsavel_freela_id: parseInt(id) };
  return { responsavel_id: null, responsavel_freela_id: null };
}

function parsarAssistente(valor) {
  if (!valor) return { assistente_tecnico_id: null, assistente_tecnico_freela_id: null };
  const [tipo, id] = String(valor).split(':');
  if (tipo === 'usuario') return { assistente_tecnico_id: parseInt(id) || null, assistente_tecnico_freela_id: null };
  if (tipo === 'freela') return { assistente_tecnico_id: null, assistente_tecnico_freela_id: parseInt(id) || null };
  return { assistente_tecnico_id: null, assistente_tecnico_freela_id: null };
}

function montarEnderecoPartes(p) {
  const linha1 = [p.logradouro, p.numero].filter(Boolean).join(', ');
  const cidadeUf = [p.cidade, p.estado].filter(Boolean).join('/');
  return [linha1, p.complemento, p.bairro, cidadeUf, p.cep].filter(v => v && String(v).trim()).join(' - ');
}

function enderecoIncompleto(p) {
  return !p.logradouro || !p.numero || !p.bairro || !p.cidade || !p.estado;
}

function normalizarLocaisReus(valor) {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set();
  return valor
    .map(item => ({
      tipo_pessoa: item && item.tipo_pessoa === 'juridica' ? 'juridica' : 'fisica',
      pessoa_id: Number(item && item.pessoa_id),
    }))
    .filter(item => item.pessoa_id > 0)
    .filter(item => {
      const chave = `${item.tipo_pessoa}:${item.pessoa_id}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
}

function temLocalManual(dados) {
  return ['local', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado']
    .some(campo => dados[campo] && String(dados[campo]).trim());
}

async function buscarReusDoProcesso(processoId, conn = pool) {
  const [rows] = await conn.execute(
    `SELECT 'fisica' AS tipo_pessoa, tr.pessoa_id,
            pf.nome AS nome, pf.cep, pf.logradouro, pf.numero, pf.complemento, pf.bairro, pf.cidade, pf.estado,
            (SELECT t.numero FROM telefones_pf t
             WHERE t.pessoa_id = pf.id AND t.ativo = 1
             ORDER BY t.principal DESC, t.id ASC LIMIT 1) AS telefone,
            (SELECT e.email FROM emails_pf e
             WHERE e.pessoa_id = pf.id AND e.ativo = 1
             ORDER BY e.principal DESC, e.id ASC LIMIT 1) AS email
       FROM tbltituloprocreu tr
       JOIN pessoas_fisicas pf ON tr.tipo_pessoa = 'fisica' AND tr.pessoa_id = pf.id
      WHERE tr.proc_id = ?
      UNION ALL
     SELECT 'juridica' AS tipo_pessoa, tr.pessoa_id,
            pj.razao_social AS nome, pj.cep, pj.logradouro, pj.numero, pj.complemento, pj.bairro, pj.cidade, pj.estado,
            (SELECT t.numero FROM telefones_pj t
             WHERE t.pessoa_id = pj.id AND t.ativo = 1
             ORDER BY t.principal DESC, t.id ASC LIMIT 1) AS telefone,
            (SELECT e.email FROM emails_pj e
             WHERE e.pessoa_id = pj.id AND e.ativo = 1
             ORDER BY e.principal DESC, e.id ASC LIMIT 1) AS email
       FROM tbltituloprocreu tr
       JOIN pessoas_juridicas pj ON tr.tipo_pessoa = 'juridica' AND tr.pessoa_id = pj.id
      WHERE tr.proc_id = ?
      ORDER BY nome`,
    [processoId, processoId]
  );

  return rows.map(r => ({
    ...r,
    endereco_completo: montarEnderecoPartes(r),
    endereco_incompleto: enderecoIncompleto(r),
  }));
}

async function validarLocaisPericia({ processo_id, locais_reus, dados }) {
  if (locais_reus.length === 0 && !temLocalManual(dados)) {
    return 'Informe pelo menos um local para a perícia';
  }

  // Uma perícia acontece em UM só lugar: um réu, ou o endereço digitado (que também serve para o endereço do perito).
  if (locais_reus.length > 1 || (locais_reus.length > 0 && temLocalManual(dados))) {
    return 'A perícia só pode ter um local. Escolha apenas um endereço (réu, perito ou endereço digitado).';
  }

  if (locais_reus.length > 0) {
    const reus = await buscarReusDoProcesso(processo_id);
    const mapa = new Map(reus.map(r => [`${r.tipo_pessoa}:${r.pessoa_id}`, r]));
    for (const item of locais_reus) {
      const reu = mapa.get(`${item.tipo_pessoa}:${item.pessoa_id}`);
      if (!reu) return 'Um dos réus selecionados não pertence ao processo informado';
      if (reu.endereco_incompleto) {
        return `O réu "${reu.nome}" está com endereço incompleto. Atualize o cadastro antes de usar como local da perícia.`;
      }
    }
  }

  return null;
}

async function gravarLocaisReus(conn, periciaId, locaisReus) {
  await conn.execute('DELETE FROM pericia_local_reu WHERE pericia_id = ?', [periciaId]);
  for (const item of locaisReus) {
    await conn.execute(
      'INSERT INTO pericia_local_reu (pericia_id, tipo_pessoa, pessoa_id) VALUES (?, ?, ?)',
      [periciaId, item.tipo_pessoa, item.pessoa_id]
    );
  }
}

// Id da rota (":id") como número; null quando não é um inteiro positivo (a perícia "abc" simplesmente não existe).
function lerIdPericia(bruto) {
  const r = inteiroPositivo(bruto, { rotulo: 'Perícia' });
  return r.erro ? null : r.valor;
}

// Motivo de cancelar / remarcar: obrigatório, só texto, até 300 caracteres. Devolve { valor } ou { erro }.
function lerMotivoPericia(bruto, rotulo) {
  return texto(bruto, { rotulo, max: LIMITE_MOTIVO_PERICIA, obrigatorio: true });
}

// "usuario:X" / "freela:X" (responsável ou assistente): formato certo e pessoa existente. Vazio = ninguém. Devolve { valor } ou { erro, status }.
async function lerPessoaPericia(bruto, rotulo) {
  if (bruto === undefined || bruto === null || bruto === '') return { valor: null };
  if (typeof bruto !== 'string' || !FORMATO_RESPONSAVEL.test(bruto.trim())) return { erro: `${rotulo} inválido`, status: 400 };
  const [tipo, id] = bruto.trim().split(':');
  const [achou] = await pool.execute(
    tipo === 'usuario' ? 'SELECT id FROM usuarios WHERE id = ?' : 'SELECT id FROM advogados_freela WHERE id = ?', [Number(id)]
  );
  if (!achou.length) return { erro: `${rotulo} não encontrado`, status: 404 };
  return { valor: `${tipo}:${Number(id)}` };
}

// Confere os campos que vêm da tela (criar e editar) e devolve os valores já limpos: { dados } ou { erro, status }.
// Textos aparados e dentro do tamanho da coluna, data real, hora HH:MM, números inteiros, perito/tipo/responsável existentes.
async function lerCamposPericia(corpo, { exigeProcesso = false } = {}) {
  const c = corpo || {};
  const dados = {};
  if (exigeProcesso) {
    if (!c.processo_id) return { erro: 'Processo é obrigatório', status: 400 };
    const proc = inteiroPositivo(c.processo_id, { rotulo: 'Processo' });
    if (proc.erro) return { erro: proc.erro, status: 400 };
    const [achou] = await pool.execute('SELECT id FROM tblproc WHERE id = ? AND ativo = 1', [proc.valor]);
    if (!achou.length) return { erro: 'Processo não encontrado', status: 404 };
    dados.processo_id = proc.valor;
  }
  if (!c.data) return { erro: 'Data é obrigatória', status: 400 };
  const dia = dataIso(c.data, { rotulo: 'Data da perícia' });
  if (dia.erro) return { erro: dia.erro, status: 400 };
  dados.data = dia.valor;
  if (c.hora === undefined || c.hora === null || c.hora === '') dados.hora = null;
  else if (typeof c.hora !== 'string' || !HORA_VALIDA.test(c.hora.trim())) return { erro: 'Hora inválida (use HH:MM)', status: 400 };
  else dados.hora = c.hora.trim();
  const tipo = inteiroPositivo(c.tipo_pericia_id, { rotulo: 'Tipo de perícia' });
  if (tipo.erro) return { erro: tipo.erro, status: 400 };
  if (tipo.valor) {
    const [achou] = await pool.execute('SELECT id FROM tipo_pericia WHERE id = ?', [tipo.valor]);
    if (!achou.length) return { erro: 'Tipo de perícia não encontrado', status: 404 };
  }
  dados.tipo_pericia_id = tipo.valor;
  for (const [chave, opcoes] of Object.entries(TEXTOS_PERICIA)) {
    const r = texto(c[chave], opcoes);
    if (r.erro) return { erro: r.erro, status: 400 };
    dados[chave] = r.valor;
  }
  const perito = inteiroPositivo(c.perito_id, { rotulo: 'Perito' });
  if (perito.erro) return { erro: perito.erro, status: 400 };
  if (perito.valor) {
    const [achou] = await pool.execute('SELECT id FROM pessoas_fisicas WHERE id = ?', [perito.valor]);
    if (!achou.length) return { erro: 'Perito não encontrado', status: 404 };
  }
  dados.perito_id = perito.valor;
  const resp = await lerPessoaPericia(c.responsavel_id, 'Responsável');
  if (resp.erro) return resp;
  dados.responsavel_id = resp.valor;
  const assist = await lerPessoaPericia(c.assistente_tecnico_id, 'Assistente técnico');
  if (assist.erro) return assist;
  dados.assistente_tecnico_id = assist.valor;
  return { dados };
}

// Nomes legíveis para o histórico (gravados NA HORA da alteração, como nas audiências).
async function nomeTipoPericia(id) {
  if (!id) return '';
  const [r] = await pool.execute('SELECT nome FROM tipo_pericia WHERE id = ?', [id]);
  return r.length ? r[0].nome : String(id);
}
async function nomePeritoPericia(id) {
  if (!id) return '';
  const [r] = await pool.execute('SELECT nome FROM pessoas_fisicas WHERE id = ?', [id]);
  return r.length ? r[0].nome : String(id);
}
async function nomePessoaPericia(valor) {
  if (!valor) return '';
  const [tipo, id] = String(valor).split(':');
  const [r] = await pool.execute(
    tipo === 'usuario' ? 'SELECT nome FROM usuarios WHERE id = ?' : 'SELECT nome FROM advogados_freela WHERE id = ?', [Number(id)]
  );
  if (!r.length) return valor;
  return tipo === 'freela' ? `${r[0].nome} (freelancer)` : r[0].nome;
}
async function nomesLocaisReus(conn, periciaId) {
  const [rows] = await conn.execute(
    `SELECT CASE plr.tipo_pessoa
              WHEN 'fisica'   THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = plr.pessoa_id)
              WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = plr.pessoa_id)
            END AS nome
       FROM pericia_local_reu plr WHERE plr.pericia_id = ? ORDER BY nome`, [periciaId]
  );
  return rows.map(r => r.nome).filter(Boolean).join(', ');
}

// GET /api/pericias — Lista perícias com filtros
async function listar(req, res) {
  try {
    const { processo_id, data_de, data_ate, assistente_id, status } = req.query;
    const { limite: limitInt, offset: offsetInt } = paginacao(req.query, { limitePadrao: 30, limiteMax: 100 });
    const params = [];
    let where = 'WHERE 1=1';

    // Campo "Pesquisar": a frase inteira, em partes do processo, título, nº do processo, pasta, tipo, perito, assistente,
    // responsável e local (peça única em utils/buscaFrase.js, a mesma de Audiências e Prazos).
    const lidaBusca = lerBuscaFrase(req.query.busca);
    if (lidaBusca.erro) return erro(res, lidaBusca.erro);
    if (lidaBusca.valor) {
      const f = condBuscaFrase(lidaBusca.valor, {
        colunas: ['pr.NomeTituloProc', 'pr.numProc', 'tp.nome', 'pf.nome', 'pj.razao_social', 'u.nome', 'af.nome', 'ur.nome', 'rf.nome', 'pe.local'],
        pasta: 'pa', partesDe: 'pr',
      });
      where += f.cond; params.push(...f.params);
    }

    if (processo_id)   { where += ' AND pe.processo_id = ?';           params.push(processo_id); }
    if (data_de)       { where += ' AND pe.data >= ?';                  params.push(data_de); }
    if (data_ate)      { where += ' AND pe.data <= ?';                  params.push(data_ate); }
    if (assistente_id) { where += ' AND pe.assistente_tecnico_id = ?';  params.push(assistente_id); }
    if (status)        { where += ' AND pe.status = ?';                  params.push(status); }

    // Filtro por etiqueta PESSOAL do usuário logado.
    const etqSlot = parseInt(req.query.etiqueta);
    if (etqSlot >= 1 && etqSlot <= 5) {
      where += ' AND EXISTS (SELECT 1 FROM pericias_etiquetas pet WHERE pet.pericia_id = pe.id AND pet.usuario_id = ? AND pet.slot = ?)';
      params.push(req.usuario.id, etqSlot);
    }

    const [registros] = await pool.execute(`
      SELECT
        pe.id, pe.processo_id, pe.data, pe.hora, pe.local, pe.status,
        pe.cep, pe.logradouro, pe.numero, pe.complemento, pe.bairro, pe.cidade, pe.estado,
        pe.perito_tipo, pe.perito_id, pe.assistente_tecnico_id, pe.assistente_tecnico_freela_id,
        pe.responsavel_id, pe.responsavel_freela_id,
        pe.comunicado_enviado, pe.criado_em,
        tp.nome  AS tipo_nome,
        CASE
          WHEN pe.perito_tipo = 'fisica'   THEN pf.nome
          WHEN pe.perito_tipo = 'juridica' THEN pj.razao_social
          ELSE NULL
        END AS perito_nome,
        COALESCE(u.nome, CONCAT(af.nome, ' (freelancer)')) AS assistente_nome,
        -- Responsável pode ser usuário do sistema OU freelancer
        COALESCE(ur.nome, CONCAT(rf.nome, ' (freelancer)')) AS responsavel_nome,
        u2.nome  AS criado_por_nome,
        pr.numProc AS processo_numero,
        pr.NomeTituloProc AS pasta_titulo,
        pa.id     AS pasta_id,
        pa.numPasta AS pasta_numero,
        (SELECT pet.slot FROM pericias_etiquetas pet
          WHERE pet.pericia_id = pe.id AND pet.usuario_id = ?) AS etiqueta_pessoal
      FROM pericia pe
      LEFT JOIN tipo_pericia      tp ON pe.tipo_pericia_id = tp.id
      LEFT JOIN pessoas_fisicas   pf ON pe.perito_tipo = 'fisica'   AND pe.perito_id = pf.id
      LEFT JOIN pessoas_juridicas pj ON pe.perito_tipo = 'juridica' AND pe.perito_id = pj.id
      LEFT JOIN usuarios u  ON pe.assistente_tecnico_id   = u.id
      LEFT JOIN advogados_freela af ON pe.assistente_tecnico_freela_id = af.id
      LEFT JOIN usuarios ur ON pe.responsavel_id          = ur.id
      LEFT JOIN advogados_freela rf ON pe.responsavel_freela_id = rf.id
      LEFT JOIN usuarios u2 ON pe.criado_por = u2.id
      LEFT JOIN tblproc pr ON pe.processo_id = pr.id
      LEFT JOIN tblpasta pa ON pr.pasta_id   = pa.id
      ${where}
      ORDER BY CASE WHEN pe.status = 'aguardando_data' THEN 0 ELSE 1 END, pe.data DESC
      LIMIT ${limitInt} OFFSET ${offsetInt}
    `, [req.usuario.id, ...params]);

    // O COUNT leva as mesmas junções da lista (o "Pesquisar" usa tipo, perito, assistente, responsável, processo e pasta);
    // todas são N:1, então a contagem continua batendo com as linhas.
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total
         FROM pericia pe
         LEFT JOIN tipo_pericia      tp ON pe.tipo_pericia_id = tp.id
         LEFT JOIN pessoas_fisicas   pf ON pe.perito_tipo = 'fisica'   AND pe.perito_id = pf.id
         LEFT JOIN pessoas_juridicas pj ON pe.perito_tipo = 'juridica' AND pe.perito_id = pj.id
         LEFT JOIN usuarios u  ON pe.assistente_tecnico_id   = u.id
         LEFT JOIN advogados_freela af ON pe.assistente_tecnico_freela_id = af.id
         LEFT JOIN usuarios ur ON pe.responsavel_id          = ur.id
         LEFT JOIN advogados_freela rf ON pe.responsavel_freela_id = rf.id
         LEFT JOIN tblproc pr ON pe.processo_id = pr.id
         LEFT JOIN tblpasta pa ON pr.pasta_id   = pa.id
         ${where}`,
      params
    );

    await acrescentarEnderecoDoLocal(registros);
    return sucesso(res, { registros, total: Number(total) });
  } catch (e) {
    return erroInterno(res, e);
  }
}

// Coluna "Local" da lista = só o ENDEREÇO: o digitado (ou o do perito, que é copiado para os mesmos campos) ou o do réu escolhido.
// Sem endereço nenhum, cai no nome de referência antigo (perícia antiga) — nunca fica em branco por isso.
async function acrescentarEnderecoDoLocal(registros) {
  const semManual = registros.filter(r => !montarEnderecoPartes(r));
  const dosReus = new Map();
  if (semManual.length) {
    const ids = semManual.map(r => Number(r.id));
    const [reus] = await pool.query(
      `SELECT plr.pericia_id,
              COALESCE(pf.cep, pj.cep) AS cep, COALESCE(pf.logradouro, pj.logradouro) AS logradouro,
              COALESCE(pf.numero, pj.numero) AS numero, COALESCE(pf.complemento, pj.complemento) AS complemento,
              COALESCE(pf.bairro, pj.bairro) AS bairro, COALESCE(pf.cidade, pj.cidade) AS cidade,
              COALESCE(pf.estado, pj.estado) AS estado
         FROM pericia_local_reu plr
         LEFT JOIN pessoas_fisicas   pf ON plr.tipo_pessoa = 'fisica'   AND pf.id = plr.pessoa_id
         LEFT JOIN pessoas_juridicas pj ON plr.tipo_pessoa = 'juridica' AND pj.id = plr.pessoa_id
        WHERE plr.pericia_id IN (?)
        ORDER BY plr.pericia_id, plr.pessoa_id`, [ids]
    );
    for (const r of reus) {
      const txt = montarEnderecoPartes(r);
      if (!txt) continue;
      dosReus.set(r.pericia_id, [...(dosReus.get(r.pericia_id) || []), txt]);
    }
  }
  for (const r of registros) {
    r.local_endereco = montarEnderecoPartes(r) || (dosReus.get(r.id) || []).join(' | ') || r.local || null;
    for (const c of ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado']) delete r[c];
  }
}

// GET /api/pericias/:id — Busca perícia por ID (inclui endereço e responsável para edição)
async function buscar(req, res) {
  try {
    const periciaId = lerIdPericia(req.params.id);
    if (!periciaId) return naoEncontrado(res, 'Perícia não encontrada');
    const [rows] = await pool.execute(`
      SELECT pe.*,
        tp.nome AS tipo_nome,
        CASE
          WHEN pe.perito_tipo = 'fisica'   THEN pf.nome
          WHEN pe.perito_tipo = 'juridica' THEN pj.razao_social
          ELSE NULL
        END AS perito_nome,
        COALESCE(u.nome, CONCAT(af.nome, ' (freelancer)')) AS assistente_nome,
        CASE WHEN pe.assistente_tecnico_id IS NOT NULL THEN CONCAT('usuario:', pe.assistente_tecnico_id)
             WHEN pe.assistente_tecnico_freela_id IS NOT NULL THEN CONCAT('freela:', pe.assistente_tecnico_freela_id)
             ELSE NULL END AS assistente_tecnico_valor,
        COALESCE(ur.nome, CONCAT(rf.nome, ' (freelancer)')) AS responsavel_nome,
        -- Valor pronto para o select de responsável no formulário de edição
        CASE
          WHEN pe.responsavel_id IS NOT NULL        THEN CONCAT('usuario:', pe.responsavel_id)
          WHEN pe.responsavel_freela_id IS NOT NULL THEN CONCAT('freela:', pe.responsavel_freela_id)
          ELSE NULL
        END AS responsavel_valor,
        pr.numProc AS processo_numero,
        pr.NomeTituloProc AS pasta_titulo
      FROM pericia pe
      LEFT JOIN tipo_pericia      tp ON pe.tipo_pericia_id = tp.id
      LEFT JOIN pessoas_fisicas   pf ON pe.perito_tipo = 'fisica'   AND pe.perito_id = pf.id
      LEFT JOIN pessoas_juridicas pj ON pe.perito_tipo = 'juridica' AND pe.perito_id = pj.id
      LEFT JOIN usuarios u  ON pe.assistente_tecnico_id   = u.id
      LEFT JOIN advogados_freela af ON pe.assistente_tecnico_freela_id = af.id
      LEFT JOIN usuarios ur ON pe.responsavel_id          = ur.id
      LEFT JOIN advogados_freela rf ON pe.responsavel_freela_id = rf.id
      LEFT JOIN tblproc pr ON pe.processo_id = pr.id
      WHERE pe.id = ?
    `, [periciaId]);

    if (!rows.length) return naoEncontrado(res, 'Perícia não encontrada');
    const pericia = rows[0];
    const [locais] = await pool.execute(
      `SELECT plr.tipo_pessoa, plr.pessoa_id,
              CASE plr.tipo_pessoa
                WHEN 'fisica'   THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = plr.pessoa_id)
                WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = plr.pessoa_id)
              END AS nome
         FROM pericia_local_reu plr
        WHERE plr.pericia_id = ?
        ORDER BY nome`,
      [periciaId]
    );
    return sucesso(res, { ...pericia, locais_reus: locais });
  } catch (e) {
    return erroInterno(res, e);
  }
}

// GET /api/pericias/reus-processo?processo_id=X — Réus disponíveis para local da perícia
async function reusDoProcesso(req, res) {
  try {
    const { processo_id } = req.query;
    if (!processo_id) return erro(res, 'processo_id é obrigatório');
    const rows = await buscarReusDoProcesso(processo_id);
    return sucesso(res, rows);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// GET /api/pericias/peritos-processo?processo_id=X — Peritos vinculados ao processo
// Usado para popular o seletor de perito da perícia (escopo: só peritos do processo)
async function peritosDoProcesso(req, res) {
  try {
    const { processo_id } = req.query;
    if (!processo_id) return erro(res, 'processo_id é obrigatório');
    const [rows] = await pool.execute(
      `SELECT pp.tipo_pessoa, pp.pessoa_id, pf.nome, pr.nome AS profissao,
              (SELECT t.numero FROM telefones_pf t
               WHERE t.pessoa_id = pf.id AND t.ativo = 1
               ORDER BY t.principal DESC, t.id ASC LIMIT 1) AS telefone,
              (SELECT e.email FROM emails_pf e
               WHERE e.pessoa_id = pf.id AND e.ativo = 1
               ORDER BY e.principal DESC, e.id ASC LIMIT 1) AS email
       FROM processo_perito pp
       JOIN pessoas_fisicas pf ON pp.tipo_pessoa = 'fisica' AND pp.pessoa_id = pf.id
       JOIN profissao pr ON pf.profissao_id = pr.id AND pr.nome LIKE 'Perícia%'
       WHERE pp.proc_id = ?
       ORDER BY nome`,
      [processo_id]
    );
    return sucesso(res, rows);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// GET /api/pericias/perito-endereco/:id — endereço do perito (pessoa física cuja profissão começa com "Perícia"),
// para a janela da perícia SUGERIR o consultório dele como local. Só leitura; vale para quem vê Perícias (sem exigir a permissão de Pessoas).
async function enderecoDoPerito(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT pf.id, pf.nome, pf.cep, pf.logradouro, pf.numero, pf.complemento, pf.bairro, pf.cidade, pf.estado
         FROM pessoas_fisicas pf
         JOIN profissao pr ON pr.id = pf.profissao_id AND pr.nome LIKE 'Perícia%'
        WHERE pf.id = ? AND pf.ativo = 1`,
      [req.params.id]
    );
    if (!rows.length) return naoEncontrado(res, 'Perito não encontrado');
    const perito = rows[0];
    return sucesso(res, {
      ...perito,
      endereco_completo: montarEnderecoPartes(perito),
      endereco_incompleto: enderecoIncompleto(perito),
    });
  } catch (e) {
    return erroInterno(res, e);
  }
}

// GET /api/pericias/busca-peritos?busca=X — consulta exclusiva da ATA.
// Não reutiliza a busca geral de Pessoas: nela, o modo de seleção procura apenas
// nome/CPF e é usado por vários outros campos do sistema. Aqui a necessidade é
// específica: localizar profissionais cuja profissão começa com "Perícia" por
// nome, telefone ou e-mail.
async function buscarPeritosParaAta(req, res) {
  try {
    const busca = String(req.query.busca || '').trim();
    if (busca.length < 2) return sucesso(res, []);

    const limiteInformado = Number.parseInt(req.query.limite, 10);
    const limite = Number.isInteger(limiteInformado)
      ? Math.min(Math.max(limiteInformado, 1), 20)
      : 10;
    const buscaDigitos = busca.replace(/\D/g, '');
    const porTexto = `%${escaparLike(busca)}%`;                          // "%" e "_" digitados são procurados como texto
    const porTelefone = `%${buscaDigitos || escaparLike(busca)}%`;

    const [rows] = await pool.execute(
      `SELECT pf.id, pf.nome, pr.nome AS profissao,
              (SELECT t.numero FROM telefones_pf t
               WHERE t.pessoa_id = pf.id AND t.ativo = 1
               ORDER BY t.principal DESC, t.id ASC LIMIT 1) AS telefone,
              (SELECT e.email FROM emails_pf e
               WHERE e.pessoa_id = pf.id AND e.ativo = 1
               ORDER BY e.principal DESC, e.id ASC LIMIT 1) AS email
         FROM pessoas_fisicas pf
         JOIN profissao pr ON pr.id = pf.profissao_id AND pr.nome LIKE 'Perícia%'
        WHERE pf.ativo = 1
          AND (
            pf.nome LIKE ?
            OR EXISTS (
              SELECT 1 FROM telefones_pf t
               WHERE t.pessoa_id = pf.id AND t.ativo = 1 AND t.numero LIKE ?
            )
            OR EXISTS (
              SELECT 1 FROM emails_pf e
               WHERE e.pessoa_id = pf.id AND e.ativo = 1 AND e.email LIKE ?
            )
          )
        ORDER BY (pf.nome LIKE ?) DESC, pf.nome ASC
        LIMIT ${limite}`,
      [porTexto, porTelefone, porTexto, `${escaparLike(busca)}%`]
    );
    return sucesso(res, rows);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// GET /api/pericias/relatorio-peritos
// Relatório usado em Relatórios → Perícias.
// modo=perito: lista peritos e os processos/perícias em que atuam.
// modo=processo: dado um processo/pasta, lista os peritos vinculados/atuantes.
async function relatorioPeritos(req, res) {
  try {
    const busca = String(req.query.busca || '').trim();
    const data_de = String(req.query.data_de || '').trim();
    const data_ate = String(req.query.data_ate || '').trim();
    const like = `%${escaparLike(busca)}%`;
    const params = [];
    const filtraPeriodo = !!(data_de || data_ate);

    let filtroBuscaProcesso = '';
    let filtroBuscaPericia = '';
    let filtroPeriodoProcesso = '';
    let filtroPeriodoPericia = '';

    if (busca) {
      filtroBuscaProcesso = ` AND (
        pr.numProc LIKE ? OR pr.NomeTituloProc LIKE ? OR CAST(pa.numPasta AS CHAR) LIKE ? OR
        pf.nome LIKE ? OR pj.razao_social LIKE ? OR
        EXISTS (
          SELECT 1 FROM telefones_pf t
           WHERE pp.tipo_pessoa = 'fisica' AND t.pessoa_id = pf.id AND t.ativo = 1 AND t.numero LIKE ?
        ) OR
        EXISTS (
          SELECT 1 FROM emails_pf e
           WHERE pp.tipo_pessoa = 'fisica' AND e.pessoa_id = pf.id AND e.ativo = 1 AND e.email LIKE ?
        )
      )`;
      filtroBuscaPericia = ` AND (
        pr.numProc LIKE ? OR pr.NomeTituloProc LIKE ? OR CAST(pa.numPasta AS CHAR) LIKE ? OR
        pf.nome LIKE ? OR pj.razao_social LIKE ? OR
        EXISTS (
          SELECT 1 FROM telefones_pf t
           WHERE pe.perito_tipo = 'fisica' AND t.pessoa_id = pf.id AND t.ativo = 1 AND t.numero LIKE ?
        ) OR
        EXISTS (
          SELECT 1 FROM emails_pf e
           WHERE pe.perito_tipo = 'fisica' AND e.pessoa_id = pf.id AND e.ativo = 1 AND e.email LIKE ?
        )
      )`;
    }

    if (filtraPeriodo) {
      // Vínculo direto no processo não possui data de perícia; com período informado,
      // o relatório mostra apenas registros de perícia agendada dentro do intervalo.
      filtroPeriodoProcesso = ' AND 1 = 0';
      if (data_de)  filtroPeriodoPericia += ' AND pe.data >= ?';
      if (data_ate) filtroPeriodoPericia += ' AND pe.data <= ?';
    }

    const query = `
      SELECT *
      FROM (
        SELECT
          pp.tipo_pessoa AS perito_tipo,
          pp.pessoa_id AS perito_id,
          CASE pp.tipo_pessoa
            WHEN 'fisica' THEN pf.nome
            WHEN 'juridica' THEN pj.razao_social
          END AS perito_nome,
          prof.nome AS profissao_nome,
          CASE WHEN pp.tipo_pessoa = 'fisica' THEN (
            SELECT t.numero FROM telefones_pf t
             WHERE t.pessoa_id = pf.id AND t.ativo = 1
             ORDER BY t.principal DESC, t.id ASC LIMIT 1
          ) ELSE (
            SELECT t.numero FROM telefones_pj t
             WHERE t.pessoa_id = pj.id AND t.ativo = 1
             ORDER BY t.principal DESC, t.id ASC LIMIT 1
          ) END AS telefone,
          CASE WHEN pp.tipo_pessoa = 'fisica' THEN (
            SELECT e.email FROM emails_pf e
             WHERE e.pessoa_id = pf.id AND e.ativo = 1
             ORDER BY e.principal DESC, e.id ASC LIMIT 1
          ) ELSE (
            SELECT e.email FROM emails_pj e
             WHERE e.pessoa_id = pj.id AND e.ativo = 1
             ORDER BY e.principal DESC, e.id ASC LIMIT 1
          ) END AS email,
          pr.id AS processo_id,
          pr.numProc AS processo_numero,
          pr.NomeTituloProc AS pasta_titulo,
          pa.id AS pasta_id,
          pa.numPasta AS pasta_numero,
          NULL AS pericia_id,
          NULL AS tipo_pericia,
          NULL AS data,
          NULL AS hora,
          NULL AS status,
          'Vínculo no processo' AS origem
        FROM processo_perito pp
        JOIN tblproc pr ON pr.id = pp.proc_id AND pr.ativo = 1
        JOIN tblpasta pa ON pa.id = pr.pasta_id
        LEFT JOIN pessoas_fisicas pf ON pp.tipo_pessoa = 'fisica' AND pp.pessoa_id = pf.id
        LEFT JOIN pessoas_juridicas pj ON pp.tipo_pessoa = 'juridica' AND pp.pessoa_id = pj.id
        LEFT JOIN profissao prof ON pf.profissao_id = prof.id
        WHERE (
          pp.tipo_pessoa = 'juridica'
          OR prof.nome LIKE 'Perícia%'
        )
        ${filtroBuscaProcesso}
        ${filtroPeriodoProcesso}

        UNION ALL

        SELECT
          pe.perito_tipo AS perito_tipo,
          pe.perito_id AS perito_id,
          CASE pe.perito_tipo
            WHEN 'fisica' THEN pf.nome
            WHEN 'juridica' THEN pj.razao_social
          END AS perito_nome,
          prof.nome AS profissao_nome,
          CASE WHEN pe.perito_tipo = 'fisica' THEN (
            SELECT t.numero FROM telefones_pf t
             WHERE t.pessoa_id = pf.id AND t.ativo = 1
             ORDER BY t.principal DESC, t.id ASC LIMIT 1
          ) ELSE (
            SELECT t.numero FROM telefones_pj t
             WHERE t.pessoa_id = pj.id AND t.ativo = 1
             ORDER BY t.principal DESC, t.id ASC LIMIT 1
          ) END AS telefone,
          CASE WHEN pe.perito_tipo = 'fisica' THEN (
            SELECT e.email FROM emails_pf e
             WHERE e.pessoa_id = pf.id AND e.ativo = 1
             ORDER BY e.principal DESC, e.id ASC LIMIT 1
          ) ELSE (
            SELECT e.email FROM emails_pj e
             WHERE e.pessoa_id = pj.id AND e.ativo = 1
             ORDER BY e.principal DESC, e.id ASC LIMIT 1
          ) END AS email,
          pr.id AS processo_id,
          pr.numProc AS processo_numero,
          pr.NomeTituloProc AS pasta_titulo,
          pa.id AS pasta_id,
          pa.numPasta AS pasta_numero,
          pe.id AS pericia_id,
          tp.nome AS tipo_pericia,
          pe.data,
          pe.hora,
          pe.status,
          'Perícia agendada' AS origem
        FROM pericia pe
        JOIN tblproc pr ON pr.id = pe.processo_id AND pr.ativo = 1
        JOIN tblpasta pa ON pa.id = pr.pasta_id
        LEFT JOIN tipo_pericia tp ON tp.id = pe.tipo_pericia_id
        LEFT JOIN pessoas_fisicas pf ON pe.perito_tipo = 'fisica' AND pe.perito_id = pf.id
        LEFT JOIN pessoas_juridicas pj ON pe.perito_tipo = 'juridica' AND pe.perito_id = pj.id
        LEFT JOIN profissao prof ON pf.profissao_id = prof.id
        WHERE 1 = 1
        ${filtroBuscaPericia}
        ${filtroPeriodoPericia}
      ) x
      ORDER BY x.data IS NULL, x.data, x.hora, x.perito_nome, x.pasta_numero, x.processo_numero
      LIMIT 500
    `;

    if (busca) {
      params.push(like, like, like, like, like, like, like);
      params.push(like, like, like, like, like, like, like);
    }
    if (filtraPeriodo) {
      if (data_de) params.push(data_de);
      if (data_ate) params.push(data_ate);
    }

    const [rows] = await pool.execute(query, params);

    const peritosMap = new Map();
    const processosMap = new Map();
    rows.forEach(r => {
      const peritoKey = `${r.perito_tipo}:${r.perito_id}`;
      if (r.perito_id && r.perito_nome && !peritosMap.has(peritoKey)) {
        peritosMap.set(peritoKey, { tipo: r.perito_tipo, id: r.perito_id, nome: r.perito_nome });
      }
      if (r.processo_id) processosMap.set(String(r.processo_id), true);
    });

    return sucesso(res, {
      modo: 'pericias',
      registros: rows,
      total_registros: rows.length,
      total_peritos: peritosMap.size,
      total_processos: processosMap.size,
    });
  } catch (e) {
    return erroInterno(res, e);
  }
}

// POST /api/pericias — Cria perícia
// Transação: INSERT + auditoria_pericia + log geral (tudo ou nada)
async function criar(req, res) {
  const lido = await lerCamposPericia(req.body, { exigeProcesso: true });
  if (lido.erro) return erro(res, lido.erro, lido.status);
  Object.assign(req.body, lido.dados);   // daqui para frente os campos já estão limpos e conferidos
  const {
    processo_id, tipo_pericia_id, data, hora,
    local, cep, logradouro, numero, complemento, bairro, cidade, estado,
    perito_tipo, perito_id, assistente_tecnico_id: assistenteRaw,
    responsavel_id: responsavelRaw,
    locais_reus: locaisReusRaw = [],
    obs_auditoria,  // texto enviado quando o usuário confirma data/dia incomum com senha
    remarcar_pericia_id,  // (opcional) perícia agendada que esta nova substitui → vira "remarcada"
    motivo_remarcacao,    // motivo obrigatório quando é remarcação
    confirmar_nova        // (opcional) usuário confirmou que NÃO é remarcação, é outra perícia
  } = req.body;

  const obs = texto(obs_auditoria, { rotulo: 'A observação', max: LIMITE_OBS_AUDITORIA });
  if (obs.erro) return erro(res, obs.erro);

  // Remarcação feita direto no cadastro: valida a perícia antiga ANTES de qualquer gravação.
  let periciaRemarcada = null;
  let motivoRemarcacao = null;
  if (remarcar_pericia_id) {
    const permitido = await temPermissaoBackend(req.usuario.id, req.usuario.nivel, 'pericias', 'alterar');
    if (!permitido) return erro(res, 'Sem permissão para remarcar perícias', 403);
    const motivo = lerMotivoPericia(motivo_remarcacao, 'O motivo da remarcação');
    if (motivo.erro) return erro(res, motivo.erro);
    motivoRemarcacao = motivo.valor;
    const idAntiga = inteiroPositivo(remarcar_pericia_id, { rotulo: 'Perícia a remarcar' });
    if (idAntiga.erro) return erro(res, idAntiga.erro);
    const [antiga] = await pool.execute('SELECT id, processo_id, tipo_pericia_id, status FROM pericia WHERE id = ?', [idAntiga.valor]);
    if (!antiga.length) return naoEncontrado(res, 'Perícia a remarcar não encontrada');
    if (antiga[0].status !== 'agendada') return erro(res, `Perícia com status "${antiga[0].status}" não pode ser remarcada`);
    if (String(antiga[0].processo_id) !== String(processo_id)) return erro(res, 'A perícia a remarcar pertence a outro processo');
    periciaRemarcada = antiga[0];
  } else if (tipo_pericia_id && !confirmar_nova) {
    // Aviso: já existe perícia AGENDADA do mesmo tipo neste processo → o front pergunta se é remarcação.
    const [existentes] = await pool.execute(
      `SELECT id, DATE_FORMAT(data, '%Y-%m-%d') AS data, TIME_FORMAT(hora, '%H:%i') AS hora
         FROM pericia
        WHERE processo_id = ? AND tipo_pericia_id = ? AND status = 'agendada'
        ORDER BY data, hora`,
      [processo_id, tipo_pericia_id]
    );
    if (existentes.length) {
      return erro(res, 'Já existe perícia agendada deste tipo neste processo', 409,
        { codigo: 'PERICIA_AGENDADA_EXISTENTE', pericias: existentes });
    }
  }

  const locaisReus = normalizarLocaisReus(locaisReusRaw);
  const erroLocais = await validarLocaisPericia({
    processo_id,
    locais_reus: locaisReus,
    dados: { local, cep, logradouro, numero, complemento, bairro, cidade, estado },
  });
  if (erroLocais) return erro(res, erroLocais);

  const { responsavel_id, responsavel_freela_id } = parsarResponsavel(responsavelRaw);
  const { assistente_tecnico_id, assistente_tecnico_freela_id } = parsarAssistente(assistenteRaw);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [r] = await conn.execute(
      `INSERT INTO pericia
        (processo_id, tipo_pericia_id, data, hora,
         local, cep, logradouro, numero, complemento, bairro, cidade, estado,
         perito_tipo, perito_id, assistente_tecnico_id, assistente_tecnico_freela_id,
         responsavel_id, responsavel_freela_id,
         status, criado_por)
       VALUES (?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?, ?,?, 'agendada', ?)`,
      [
        processo_id, tipo_pericia_id || null, data, hora || null,
        local || null, cep || null, logradouro || null, numero || null,
        complemento || null, bairro || null, cidade || null, estado || null,
        perito_id ? 'fisica' : null, perito_id || null, assistente_tecnico_id, assistente_tecnico_freela_id,
        responsavel_id, responsavel_freela_id,
        req.usuario.id
      ]
    );
    const periciaId = r.insertId;

    await gravarLocaisReus(conn, periciaId, locaisReus);

    // Histórico: registra o cadastro
    await conn.execute(
      `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'cadastrado', null, 'Perícia cadastrada', ?)`,
      [periciaId, req.usuario.id]
    );
    // Registra confirmação de data/dia incomum (com senha), se houver
    if (obs.valor) {
      await conn.execute(
        `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'criacao', null, ?, ?)`,
        [periciaId, obs.valor, req.usuario.id]
      );
    }

    // Remarcação: a antiga vira "remarcada" na MESMA transação (tudo ou nada).
    if (periciaRemarcada) {
      await conn.execute(
        `UPDATE pericia SET status = 'remarcada', motivo_status = ?, alterado_por = ?, alterado_em = NOW()
         WHERE id = ? AND status = 'agendada'`,
        [motivoRemarcacao, req.usuario.id, periciaRemarcada.id]
      );
      await conn.execute(
        `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'status', 'agendada', 'remarcada', ?)`,
        [periciaRemarcada.id, req.usuario.id]
      );
      await conn.execute(
        `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'criacao', null, ?, ?)`,
        [periciaId, `Criada por remarcação da perícia #${periciaRemarcada.id}`, req.usuario.id]
      );
    }

    await auditoria.registrar(req.usuario.id, 'pericia', 'criar', periciaId, null, null, conn);

    await conn.commit();

    // Aviso ao cliente (vai para a tela de conferência ou sai sozinho, conforme a configuração) — nunca derruba o cadastro
    await avisos.registrarEvento({ modulo: 'pericia', tipo: periciaRemarcada ? 'remarcada' : 'agendada', id: periciaId });

    // Remarcação: a antiga sai da agenda do Google; a nova (agendada) entra.
    if (periciaRemarcada) {
      sincronizarPericiaGoogle(periciaRemarcada.id, { cancelar: true, sequence: Math.floor(Date.now() / 1000) });
    }
    // Nova perícia (agendada) → entra na agenda do Google do responsável (se usuário).
    sincronizarPericiaGoogle(periciaId, {});
    return sucesso(res, { id: periciaId }, 'Perícia criada com sucesso', 201);
  } catch (e) {
    await conn.rollback();
    return erroInterno(res, e);
  } finally {
    conn.release();
  }
}

// PUT /api/pericias/:id — Atualiza perícia
// Transação: UPDATE + auditoria_pericia + log geral (tudo ou nada)
async function atualizar(req, res) {
  const periciaId = lerIdPericia(req.params.id);
  if (!periciaId) return naoEncontrado(res, 'Perícia não encontrada');
  const lido = await lerCamposPericia(req.body);
  if (lido.erro) return erro(res, lido.erro, lido.status);
  Object.assign(req.body, lido.dados);   // daqui para frente os campos já estão limpos e conferidos
  const {
    tipo_pericia_id, data, hora,
    local, cep, logradouro, numero, complemento, bairro, cidade, estado,
    perito_tipo, perito_id, assistente_tecnico_id: assistenteRaw,
    responsavel_id: responsavelRaw,
    locais_reus: locaisReusRaw = []
  } = req.body;

  const { responsavel_id, responsavel_freela_id } = parsarResponsavel(responsavelRaw);
  const { assistente_tecnico_id, assistente_tecnico_freela_id } = parsarAssistente(assistenteRaw);
  const locaisReus = normalizarLocaisReus(locaisReusRaw);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existe] = await conn.execute(
      `SELECT id, processo_id, tipo_pericia_id, DATE_FORMAT(data, '%Y-%m-%d') AS data, TIME_FORMAT(hora, '%H:%i') AS hora,
              local, cep, logradouro, numero, complemento, bairro, cidade, estado,
              perito_id, assistente_tecnico_id, assistente_tecnico_freela_id, responsavel_id, responsavel_freela_id, status
         FROM pericia WHERE id = ? FOR UPDATE`, [periciaId]);
    if (!existe.length) {
      await conn.rollback();
      return naoEncontrado(res, 'Perícia não encontrada');
    }
    const antes = existe[0];
    // Cancelada, remarcada e realizada são histórico: não se edita (a tela já esconde o botão; o servidor também recusa).
    if (antes.status !== 'agendada' && antes.status !== 'aguardando_data') {
      await conn.rollback();
      return erro(res, `Perícia com status "${antes.status}" não pode ser editada`);
    }

    const erroLocais = await validarLocaisPericia({
      processo_id: antes.processo_id,
      locais_reus: locaisReus,
      dados: { local, cep, logradouro, numero, complemento, bairro, cidade, estado },
    });
    if (erroLocais) {
      await conn.rollback();
      return erro(res, erroLocais);
    }

    const locaisAntes = await nomesLocaisReus(conn, periciaId);

    await conn.execute(
      `UPDATE pericia SET
        tipo_pericia_id=?, data=?, hora=?,
        local=?, cep=?, logradouro=?, numero=?, complemento=?, bairro=?, cidade=?, estado=?,
        perito_tipo=?, perito_id=?, assistente_tecnico_id=?, assistente_tecnico_freela_id=?,
        responsavel_id=?, responsavel_freela_id=?, status=?,
        alterado_por=?, alterado_em=NOW()
       WHERE id=?`,
      [
        tipo_pericia_id || null, data, hora || null,
        local || null, cep || null, logradouro || null, numero || null,
        complemento || null, bairro || null, cidade || null, estado || null,
        perito_id ? 'fisica' : null, perito_id || null, assistente_tecnico_id, assistente_tecnico_freela_id,
        responsavel_id, responsavel_freela_id,
        antes.status === 'aguardando_data' ? 'agendada' : antes.status,
        req.usuario.id, periciaId
      ]
    );

    await gravarLocaisReus(conn, periciaId, locaisReus);

    // ---- Histórico campo a campo (só o que mudou; nomes legíveis gravados agora) ----
    const registrar = (campo, de, para) => conn.execute(
      `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, ?, ?, ?, ?)`, [periciaId, campo, de, para, req.usuario.id]);
    if (antes.status === 'aguardando_data') await registrar('status', 'aguardando_data', 'agendada');
    for (const [campo, vAntes, vDepois] of [
      ['data', antes.data, data],
      ['hora', antes.hora, hora],
      ['local', antes.local, local],
      ['cep', antes.cep, cep],
      ['logradouro', antes.logradouro, logradouro],
      ['numero', antes.numero, numero],
      ['complemento', antes.complemento, complemento],
      ['bairro', antes.bairro, bairro],
      ['cidade', antes.cidade, cidade],
      ['estado', antes.estado, estado],
    ]) {
      if (String(vAntes ?? '') !== String(vDepois ?? '')) await registrar(campo, String(vAntes ?? ''), String(vDepois ?? ''));
    }
    if (String(antes.tipo_pericia_id ?? '') !== String(tipo_pericia_id ?? '')) {
      await registrar('tipo_pericia_id', await nomeTipoPericia(antes.tipo_pericia_id), await nomeTipoPericia(tipo_pericia_id));
    }
    if (String(antes.perito_id ?? '') !== String(perito_id ?? '')) {
      await registrar('perito_id', await nomePeritoPericia(antes.perito_id), await nomePeritoPericia(perito_id));
    }
    const respAntes = antes.responsavel_id ? `usuario:${antes.responsavel_id}` : antes.responsavel_freela_id ? `freela:${antes.responsavel_freela_id}` : '';
    const respDepois = responsavelRaw || '';
    if (respAntes !== respDepois) await registrar('responsavel_id', await nomePessoaPericia(respAntes), await nomePessoaPericia(respDepois));
    const assistAntes = antes.assistente_tecnico_id ? `usuario:${antes.assistente_tecnico_id}` : antes.assistente_tecnico_freela_id ? `freela:${antes.assistente_tecnico_freela_id}` : '';
    const assistDepois = assistenteRaw || '';
    if (assistAntes !== assistDepois) await registrar('assistente_tecnico_id', await nomePessoaPericia(assistAntes), await nomePessoaPericia(assistDepois));
    const locaisDepois = await nomesLocaisReus(conn, periciaId);
    if (locaisAntes !== locaisDepois) await registrar('locais_reus', locaisAntes, locaisDepois);

    await auditoria.registrar(req.usuario.id, 'pericia', 'atualizar', periciaId, null, null, conn);

    await conn.commit();
    if (antes.status === 'aguardando_data') {
      // A perícia só passa a avisar o cliente quando finalmente ganha uma data.
      await avisos.registrarEvento({ modulo: 'pericia', tipo: 'agendada', id: periciaId });
    } else {
      await avisos.conciliarEvento('pericia');   // mudou data/hora: o aviso pendente de antes deixa de valer
    }
    // Reflete no Google. Se o responsável (usuário) mudou, migra: cancela no antigo e
    // cria no novo. Freelancer/sem responsável = ids nulos e o envio é ignorado.
    const seq = Math.floor(Date.now() / 1000);
    const oldResp = antes.responsavel_id;
    const newResp = responsavel_id;
    dadosPericiaParaGoogle(periciaId).then(dados => {
      if (oldResp === newResp) {
        enviarPericiaParaGoogle(newResp, periciaId, dados, false, seq);
      } else {
        enviarPericiaParaGoogle(oldResp, periciaId, dados, true,  seq); // some da agenda do antigo
        enviarPericiaParaGoogle(newResp, periciaId, dados, false, seq); // entra na do novo
      }
    });
    return sucesso(res, null, 'Perícia atualizada com sucesso');
  } catch (e) {
    await conn.rollback();
    return erroInterno(res, e);
  } finally {
    conn.release();
  }
}

// PUT /api/pericias/:id/realizada — Marca a perícia como realizada (sem ata)
async function marcarRealizada(req, res) {
  try {
    const id = lerIdPericia(req.params.id);
    if (!id) return naoEncontrado(res, 'Perícia não encontrada');
    const [antes] = await pool.execute('SELECT status FROM pericia WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Perícia não encontrada');
    if (antes[0].status !== 'agendada') {
      return erro(res, `Perícia com status "${antes[0].status}" não pode ser marcada como realizada`);
    }

    // Transação: status + auditoria juntos (sem isso, falha no INSERT deixava a
    // perícia "realizada" sem o registro de histórico).
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `UPDATE pericia SET status = 'realizada', alterado_por = ?, alterado_em = NOW() WHERE id = ?`,
        [req.usuario.id, id]
      );
      await conn.execute(
        `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'status', ?, 'realizada', ?)`,
        [id, antes[0].status, req.usuario.id]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    return sucesso(res, null, 'Perícia marcada como realizada');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/pericias/:id/cancelar — Cancela a perícia (registro histórico)
async function cancelar(req, res) {
  try {
    const id = lerIdPericia(req.params.id);
    if (!id) return naoEncontrado(res, 'Perícia não encontrada');

    const permitido = await temPermissaoBackend(req.usuario.id, req.usuario.nivel, 'pericias', 'alterar');
    if (!permitido) return erro(res, 'Sem permissão para cancelar perícias', 403);

    const lidoMotivo = lerMotivoPericia(req.body.motivo, 'O motivo do cancelamento');
    if (lidoMotivo.erro) return erro(res, lidoMotivo.erro);
    const motivo = lidoMotivo.valor;

    const [antes] = await pool.execute('SELECT status FROM pericia WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Perícia não encontrada');
    if (antes[0].status === 'cancelada') return erro(res, 'Perícia já está cancelada');
    if (antes[0].status !== 'agendada') {
      return erro(res, `Perícia com status "${antes[0].status}" não pode ser cancelada`);
    }

    // Transação: status + auditoria juntos.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `UPDATE pericia SET status = 'cancelada', motivo_status = ?, alterado_por = ?, alterado_em = NOW()
         WHERE id = ?`,
        [motivo, req.usuario.id, id]
      );
      await conn.execute(
        `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'status', ?, 'cancelada', ?)`,
        [id, antes[0].status, req.usuario.id]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    // Aviso de cancelamento ao cliente (tela de conferência ou envio sozinho) — nunca derruba o cancelamento
    await avisos.registrarEvento({ modulo: 'pericia', tipo: 'cancelada', id });
    await avisos.conciliarEvento('pericia');   // avisos pendentes de agendada/lembrete desta perícia deixam de valer

    // Cancelada → sai da agenda do Google do responsável.
    sincronizarPericiaGoogle(id, { cancelar: true, sequence: Math.floor(Date.now() / 1000) });
    return sucesso(res, null, 'Perícia cancelada com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/pericias/:id/remarcar — Marca original como remarcada e cria nova perícia
async function remarcar(req, res) {
  const conn = await pool.getConnection();
  try {
    const id = lerIdPericia(req.params.id);
    if (!id) return naoEncontrado(res, 'Perícia não encontrada');
    const { nova_hora } = req.body;

    const permitido = await temPermissaoBackend(req.usuario.id, req.usuario.nivel, 'pericias', 'alterar');
    if (!permitido) return erro(res, 'Sem permissão para remarcar perícias', 403);

    const lidoMotivo = lerMotivoPericia(req.body.motivo, 'O motivo da remarcação');
    if (lidoMotivo.erro) return erro(res, lidoMotivo.erro);
    const motivo = lidoMotivo.valor;
    if (!req.body.nova_data) return erro(res, 'Nova data é obrigatória');
    const lidaData = dataIso(req.body.nova_data, { rotulo: 'Nova data' });
    if (lidaData.erro) return erro(res, lidaData.erro);
    const nova_data = lidaData.valor;
    if (nova_hora !== undefined && nova_hora !== null && nova_hora !== ''
        && (typeof nova_hora !== 'string' || !HORA_VALIDA.test(nova_hora.trim()))) return erro(res, 'Hora inválida (use HH:MM)');

    const [antes] = await pool.execute('SELECT * FROM pericia WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Perícia não encontrada');
    if (antes[0].status !== 'agendada') {
      return erro(res, `Perícia com status "${antes[0].status}" não pode ser remarcada`);
    }

    await conn.beginTransaction();

    // Marca a original como remarcada
    await conn.execute(
      `UPDATE pericia SET status = 'remarcada', motivo_status = ?, alterado_por = ?, alterado_em = NOW()
       WHERE id = ?`,
      [motivo, req.usuario.id, id]
    );
    await conn.execute(
      `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'status', ?, 'remarcada', ?)`,
      [id, antes[0].status, req.usuario.id]
    );

    // Cria nova perícia aproveitando os dados da original (endereço, perito, responsável, etc.)
    const o = antes[0];
    const [result] = await conn.execute(
      `INSERT INTO pericia
        (processo_id, tipo_pericia_id, data, hora,
         local, cep, logradouro, numero, complemento, bairro, cidade, estado,
         perito_tipo, perito_id, assistente_tecnico_id, assistente_tecnico_freela_id,
         responsavel_id, responsavel_freela_id,
         status, criado_por)
       VALUES (?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?, ?,?, 'agendada', ?)`,
      [
        o.processo_id, o.tipo_pericia_id, nova_data, (nova_hora && nova_hora.trim()) || o.hora,
        o.local, o.cep, o.logradouro, o.numero, o.complemento, o.bairro, o.cidade, o.estado,
        o.perito_tipo, o.perito_id, o.assistente_tecnico_id, o.assistente_tecnico_freela_id,
        o.responsavel_id, o.responsavel_freela_id,
        req.usuario.id
      ]
    );
    const novaId = result.insertId;

    await conn.execute(
      `INSERT INTO pericia_local_reu (pericia_id, tipo_pessoa, pessoa_id)
       SELECT ?, tipo_pessoa, pessoa_id
         FROM pericia_local_reu
        WHERE pericia_id = ?`,
      [novaId, id]
    );

    await conn.execute(
      `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
       VALUES (?, 'criacao', null, ?, ?)`,
      [novaId, `Criada por remarcação da perícia #${id}`, req.usuario.id]
    );

    await conn.commit();

    // Aviso de remarcação ao cliente, com a nova data (tela de conferência ou envio sozinho)
    await avisos.registrarEvento({ modulo: 'pericia', tipo: 'remarcada', id: novaId });
    await avisos.conciliarEvento('pericia');   // o aviso pendente da data antiga deixa de valer

    // Remarcação: a antiga sai do Google e a nova (agendada) entra.
    const seqRem = Math.floor(Date.now() / 1000);
    sincronizarPericiaGoogle(id,     { cancelar: true, sequence: seqRem });
    sincronizarPericiaGoogle(novaId, {});
    return sucesso(res, { nova_pericia_id: novaId }, 'Perícia remarcada e nova perícia criada com sucesso');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// PUT /api/pericias/:id/marcar-remarcada — só troca o status da perícia agendada para "remarcada"
// (sem criar perícia nova). Para o caso em que a nova perícia já foi cadastrada à mão.
// Transação: status + auditoria juntos. Body: { motivo }.
async function marcarRemarcada(req, res) {
  try {
    const id = lerIdPericia(req.params.id);
    if (!id) return naoEncontrado(res, 'Perícia não encontrada');

    const permitido = await temPermissaoBackend(req.usuario.id, req.usuario.nivel, 'pericias', 'alterar');
    if (!permitido) return erro(res, 'Sem permissão para alterar perícias', 403);
    const lidoMotivo = lerMotivoPericia(req.body.motivo, 'O motivo da remarcação');
    if (lidoMotivo.erro) return erro(res, lidoMotivo.erro);
    const motivo = lidoMotivo.valor;

    const [antes] = await pool.execute('SELECT status FROM pericia WHERE id = ?', [id]);
    if (!antes.length) return naoEncontrado(res, 'Perícia não encontrada');
    if (antes[0].status !== 'agendada') {
      return erro(res, `Perícia com status "${antes[0].status}" não pode ser marcada como remarcada`);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `UPDATE pericia SET status = 'remarcada', motivo_status = ?, alterado_por = ?, alterado_em = NOW()
         WHERE id = ? AND status = 'agendada'`,
        [motivo, req.usuario.id, id]
      );
      await conn.execute(
        `INSERT INTO auditoria_pericia (pericia_id, campo_alterado, valor_anterior, valor_novo, usuario_id)
         VALUES (?, 'status', 'agendada', 'remarcada', ?)`,
        [id, req.usuario.id]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    // Remarcada → sai da agenda do Google do responsável (a nova perícia já está lá).
    sincronizarPericiaGoogle(id, { cancelar: true, sequence: Math.floor(Date.now() / 1000) });
    return sucesso(res, null, 'Perícia marcada como remarcada');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/pericias/:id — Exclui perícia (canceladas/remarcadas são histórico e não podem)
async function excluir(req, res) {
  const conn = await pool.getConnection();
  try {
    const id = lerIdPericia(req.params.id);
    if (!id) return naoEncontrado(res, 'Perícia não encontrada');

    const permitido = await temPermissaoBackend(req.usuario.id, req.usuario.nivel, 'pericias', 'excluir');
    if (!permitido) return erro(res, 'Sem permissão para excluir perícias', 403);

    const [rows] = await pool.execute('SELECT id, status FROM pericia WHERE id = ?', [id]);
    if (!rows.length) return naoEncontrado(res, 'Perícia não encontrada');
    if (rows[0].status === 'cancelada') return erro(res, 'Perícia cancelada não pode ser excluída — ela faz parte do histórico');
    if (rows[0].status === 'remarcada') return erro(res, 'Perícia remarcada não pode ser excluída — ela faz parte do histórico');

    // Dados para o cancelamento no Google — capturados ANTES do DELETE (depois a linha some).
    const dadosGoogleExcluir = await dadosPericiaParaGoogle(id);

    await conn.beginTransaction();
    await conn.execute('DELETE FROM auditoria_pericia WHERE pericia_id = ?', [id]);
    // Se esta perícia nasceu de uma Ata de audiência, desvincula o item (mantém o
    // histórico da Ata, só remove a referência a um registro que vai deixar de existir).
    await conn.execute(
      "UPDATE ata_audiencia_itens SET registro_id = NULL WHERE tipo = 'pericia' AND registro_id = ?",
      [id]
    );
    await conn.execute('DELETE FROM pericia WHERE id = ?', [id]);
    await conn.commit();
    // Excluída → sai da agenda do Google do responsável (casa pelo mesmo UID).
    enviarPericiaParaGoogle(dadosGoogleExcluir && dadosGoogleExcluir.responsavel_id, id,
      dadosGoogleExcluir, true, Math.floor(Date.now() / 1000));
    return sucesso(res, null, 'Perícia excluída com sucesso');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

// GET /api/pericias/:id/historico — Auditoria campo a campo da perícia
async function buscarHistorico(req, res) {
  try {
    const id = lerIdPericia(req.params.id);
    if (!id) return naoEncontrado(res, 'Perícia não encontrada');
    const [existe] = await pool.execute('SELECT id FROM pericia WHERE id = ?', [id]);
    if (!existe.length) return naoEncontrado(res, 'Perícia não encontrada');
    const [rows] = await pool.execute(
      `SELECT ap.id, ap.campo_alterado, ap.valor_anterior, ap.valor_novo,
              ap.alterado_em, u.nome AS usuario_nome
       FROM auditoria_pericia ap
       LEFT JOIN usuarios u ON ap.usuario_id = u.id
       WHERE ap.pericia_id = ?
       ORDER BY ap.alterado_em ASC, ap.id ASC`,
      [id]
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/pericias/tipos — Lista tipos de perícia para selects
async function tipos(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, nome FROM tipo_pericia WHERE ativo = 1 ORDER BY nome'
    );
    return sucesso(res, rows);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// POST /api/pericias/tipos — Cria um novo tipo de perícia (gerenciamento pelo "...")
// Operação de escrita única (INSERT) — a consulta anterior é só validação de duplicidade.
async function criarTipo(req, res) {
  try {
    const lido = texto(req.body?.nome, { rotulo: 'Nome', max: 100, obrigatorio: true });
    if (lido.erro) return erro(res, lido.erro);
    const nome = lido.valor;
    // Evita nome duplicado entre os tipos ativos
    const [existe] = await pool.execute(
      'SELECT id FROM tipo_pericia WHERE nome = ? AND ativo = 1 LIMIT 1',
      [nome]
    );
    if (existe.length) return erro(res, 'Já existe um tipo com esse nome');
    // ativo tem DEFAULT 1 no banco — o tipo já nasce ativo
    const conn = await pool.getConnection();
    let r;
    try {
      await conn.beginTransaction();
      [r] = await conn.execute('INSERT INTO tipo_pericia (nome) VALUES (?)', [nome]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, { id: r.insertId }, 'Tipo criado com sucesso', 201);
  } catch (e) {
    return erroInterno(res, e);
  }
}

// PUT /api/pericias/tipos/:id — Renomeia um tipo de perícia
async function atualizarTipo(req, res) {
  try {
    const { id } = req.params;
    const lido = texto(req.body?.nome, { rotulo: 'Nome', max: 100, obrigatorio: true });
    if (lido.erro) return erro(res, lido.erro);
    const nome = lido.valor;
    // Duplicidade ignorando o próprio registro
    const [existe] = await pool.execute(
      'SELECT id FROM tipo_pericia WHERE nome = ? AND ativo = 1 AND id <> ? LIMIT 1',
      [nome, id]
    );
    if (existe.length) return erro(res, 'Já existe um tipo com esse nome');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE tipo_pericia SET nome = ? WHERE id = ?', [nome, id]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Tipo atualizado');
  } catch (e) {
    return erroInterno(res, e);
  }
}

// DELETE /api/pericias/tipos/:id — Remove um tipo de perícia (soft-delete: ativo = 0)
// Bloqueia se algum registro de perícia ainda usa o tipo (preserva integridade do histórico).
async function excluirTipo(req, res) {
  try {
    const { id } = req.params;
    const [uso] = await pool.execute('SELECT id FROM pericia WHERE tipo_pericia_id = ? LIMIT 1', [id]);
    if (uso.length) return erro(res, 'Tipo está em uso e não pode ser excluído');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE tipo_pericia SET ativo = 0 WHERE id = ?', [id]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, null, 'Tipo removido');
  } catch (e) {
    return erroInterno(res, e);
  }
}

// POST /api/pericias/:id/comunicado — Envia (ou reenvia) o comunicado ao cliente
// O texto do comunicado reflete o status atual da perícia
function tipoEventoDoComunicado(status) {
  return status === 'cancelada' ? 'cancelada' : status === 'remarcada' ? 'remarcada' : 'agendada';
}

// GET /api/pericias/:id/comunicado/previa — mostra os e-mails do comunicado COMO SERÃO ENVIADOS (destinatário, assunto e corpo),
// sem enviar nada. Usa a mesma montagem do envio (montarComunicadosPericia), então o que a janela de confirmação mostra é o que sai.
async function previaComunicado(req, res) {
  try {
    const id = lerIdPericia(req.params.id);
    if (!id) return naoEncontrado(res, 'Perícia não encontrada');
    const [pe] = await pool.execute('SELECT status FROM pericia WHERE id = ?', [id]);
    if (!pe.length) return naoEncontrado(res, 'Perícia não encontrada');
    const tipoEvento = tipoEventoDoComunicado(pe[0].status);
    const r = await montarComunicadosPericia(id, tipoEvento);
    if (r.semCliente) return erro(res, 'Defina no cadastro do processo qual parte é o cliente (autor ou réu) para enviar o comunicado');
    if (!r.mensagens.length) return erro(res, 'O cliente não possui e-mail cadastrado');
    return sucesso(res, {
      tipoEvento,
      mensagens: r.mensagens.map(m => ({ nome: m.cliente.nome, para: m.cliente.email, assunto: m.assunto, html: m.html })),
      semEmail: r.semEmailNomes,
    });
  } catch (e) {
    return erroInterno(res, e);
  }
}

async function enviarComunicado(req, res) {
  try {
    const id = lerIdPericia(req.params.id);
    if (!id) return naoEncontrado(res, 'Perícia não encontrada');
    const [pe] = await pool.execute('SELECT status FROM pericia WHERE id = ?', [id]);
    if (!pe.length) return naoEncontrado(res, 'Perícia não encontrada');

    const tipoEvento = tipoEventoDoComunicado(pe[0].status);

    const r = await enviarComunicadoPericia(id, tipoEvento, req.usuario.id);
    if (r.enviados > 0) await avisos.marcarEnviadoManual({ modulo: 'pericia', tipo: tipoEvento, id });   // o aviso pendente equivalente não precisa mais sair
    if (r.semCliente) {
      return erro(res, 'Defina no cadastro do processo qual parte é o cliente (autor ou réu) para enviar o comunicado');
    }
    if (r.enviados === 0) {
      return erro(res, r.semEmail
        ? 'O cliente não possui e-mail cadastrado'
        : 'Não foi possível enviar o comunicado (verifique o servidor de e-mail)');
    }
    return sucesso(res, null, `Comunicado enviado ao cliente (${r.enviados} e-mail(s))`);
  } catch (e) {
    return erroInterno(res, e);
  }
}

module.exports = {
  listar, buscar, criar, atualizar, tipos,
  criarTipo,
  atualizarTipo: comIdNumerico(atualizarTipo, 'Tipo de perícia não encontrado'), excluirTipo: comIdNumerico(excluirTipo, 'Tipo de perícia não encontrado'),
  reusDoProcesso, peritosDoProcesso, buscarPeritosParaAta,
  enderecoDoPerito: comIdNumerico(enderecoDoPerito, 'Perito não encontrado'), relatorioPeritos, marcarRealizada, cancelar, remarcar, marcarRemarcada, excluir,
  buscarHistorico, enviarComunicado, previaComunicado,
};
