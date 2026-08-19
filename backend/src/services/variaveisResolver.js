// ============================================================
// SERVIÇO DE RESOLUÇÃO DE VARIÁVEIS DOS DOCUMENTOS
// ------------------------------------------------------------
// A partir de um "registro âncora" (ex.: uma audiência), busca os dados
// e monta o objeto { tag: valor } com TODOS os blocos alcançáveis daquela
// âncora (cliente, processo, parte adversa, audiência, escritório...).
//
// FASE 2a: âncora 'audiencia' implementada. As demais âncoras (pessoa,
// processo, prazo, perícia, pagamento) entram na Fase 3, reaproveitando
// os mesmos helpers de bloco (blocoProcessoECliente, blocoEscritorio...).
// ============================================================

const { pool } = require('../config/database');
const { hojeBrasilia } = require('../utils/helpers');
const { valorPorExtenso } = require('../utils/extenso');

// Número -> "1.234,56" (sem "R$"; o modelo .docx coloca o "R$" onde quiser)
function moedaBR(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// CPF só-números -> "000.000.000-00" (mantém como veio se não tiver 11 dígitos)
function fmtCPF(v) {
  const s = String(v || '').replace(/\D/g, '');
  return s.length === 11 ? s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (v || '');
}

// CNPJ só-números -> "00.000.000/0000-00" (mantém como veio se não tiver 14 dígitos)
function fmtCNPJ(v) {
  const s = String(v || '').replace(/\D/g, '');
  return s.length === 14 ? s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : (v || '');
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Quais blocos cada âncora consegue alcançar (escritório é sempre disponível).
const ALCANCE = {
  pessoa:    ['cliente'],
  processo:  ['cliente', 'processo'],
  prazo:     ['cliente', 'processo'],
  audiencia: ['cliente', 'processo', 'audiencia'],
  pericia:   ['cliente', 'processo', 'pericia'],
  pagamento: ['cliente', 'processo', 'pagamento'],
};

function blocosAlcancados(ancoraTipo) {
  return ALCANCE[ancoraTipo] || [];
}

// Um modelo é compatível com a âncora se TODOS os blocos exigidos por ele
// estiverem entre os blocos que a âncora alcança.
function modeloCompativel(blocosExigidosStr, ancoraTipo) {
  if (!blocosExigidosStr) return true; // só usa dados do escritório -> serve em qualquer âncora
  const alcance = blocosAlcancados(ancoraTipo);
  const exigidos = blocosExigidosStr.split(',').map(s => s.trim()).filter(Boolean);
  return exigidos.every(b => alcance.includes(b));
}

// ---- Helpers de formatação ----
function dataBR(d) {            // 'YYYY-MM-DD'(ou datetime) -> 'DD/MM/YYYY'
  if (!d) return '';
  const [a, m, dia] = String(d).slice(0, 10).split('-');
  return (a && m && dia) ? `${dia}/${m}/${a}` : '';
}
function dataExtenso(d) {       // -> '18 de junho de 2026'
  if (!d) return '';
  const [a, m, dia] = String(d).slice(0, 10).split('-');
  if (!a || !m || !dia) return '';
  return `${parseInt(dia, 10)} de ${MESES[parseInt(m, 10) - 1]} de ${a}`;
}
function hora(t) {              // 'HH:MM:SS' -> 'HH:MM'
  return t ? String(t).slice(0, 5) : '';
}
// Subtrai `minutos` de um horário e devolve 'HH:MM'. minutos<=0 (ou vazio) -> horário real.
// Usado pela opção "minutos antes" do MODELO (ex.: audiência 09:00 com 60 -> 08:00). Trava em 00:00.
function horaAjustada(t, minutos) {
  const base = hora(t);
  const min = Number(minutos) || 0;
  if (!base || min <= 0) return base;
  const [h, m] = base.split(':').map(Number);
  let total = h * 60 + m - min;
  if (total < 0) total = 0;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
// Monta um endereço legível ignorando partes vazias.
function montarEndereco(logradouro, numero, complemento, bairro, cidade, uf, cep) {
  const linha1 = [logradouro, numero].filter(Boolean).join(', ');
  const cidadeUf = [cidade, uf].filter(Boolean).join('/');
  let txt = [linha1, complemento, bairro, cidadeUf].filter(p => p && String(p).trim()).join(' - ');
  if (cep && String(cep).trim()) txt += (txt ? ' - ' : '') + 'CEP ' + cep;
  return txt;
}

// ---- Bloco Escritório (sempre disponível) ----
async function blocoEscritorio(usuario) {
  const [rows] = await pool.execute('SELECT * FROM configuracoes_escritorio LIMIT 1');
  const e = rows[0] || {};
  return {
    nome_escritorio:     e.nome || '',
    cnpj_escritorio:     e.cnpj_cpf || '',
    endereco_escritorio: montarEndereco(e.logradouro, e.numero, null, e.bairro, e.cidade, e.estado, e.cep),
    nome_advogado:       usuario?.nome || '',
    data_hoje:           dataExtenso(hojeBrasilia()), // por extenso (padrão de documento)
    cidade_hoje:         e.cidade || '',
  };
}

// ---- RESPONSÁVEL LEGAL (menor/incapaz) -----------------------------------------
// Carregado à parte, numa consulta só e SÓ quando a pessoa tem responsável — assim
// as consultas de pessoa que já existiam ficam intactas.
async function carregarResponsavel(responsavelId, parentescoId) {
  if (!responsavelId) return null;
  const [r] = await pool.execute(
    `SELECT resp.nome, resp.cpf, resp.rg, resp.rg_orgao,
            resp.logradouro, resp.numero, resp.complemento,
            resp.bairro, resp.cidade, resp.estado, resp.cep,
            ec.nome AS estado_civil_nome, prof.nome AS profissao_nome, nac.nome AS nacionalidade_nome,
            (SELECT pc.nome FROM parentesco pc WHERE pc.id = ?) AS parentesco_nome
       FROM pessoas_fisicas resp
       LEFT JOIN estado_civil  ec   ON resp.estado_civil_id  = ec.id
       LEFT JOIN profissao     prof ON resp.profissao_id     = prof.id
       LEFT JOIN nacionalidade nac  ON resp.nacionalidade_id = nac.id
      WHERE resp.id = ?`,
    [parentescoId || null, responsavelId]
  );
  return r[0] || null;
}

// Campos do responsável + frase pronta da representação, a partir do que
// carregarResponsavel guardou em d._resp. Sem responsável, TODOS voltam vazios —
// assim o modelo pode usar {{representacao}} sempre, sem sobrar texto para quem é maior.
function blocoResponsavel(d) {
  const r = d && d._resp;
  if (!r) {
    return {
      responsavel: '', responsavel_cpf: '', responsavel_rg: '', responsavel_rg_orgao: '',
      responsavel_nacionalidade: '', responsavel_estado_civil: '', responsavel_profissao: '',
      responsavel_endereco: '', parentesco: '', representacao: '',
    };
  }

  const endereco = montarEndereco(r.logradouro, r.numero, r.complemento, r.bairro, r.cidade, r.estado, r.cep);
  const cpf = fmtCPF(r.cpf);
  const qualificacao = [
    r.nacionalidade_nome || '',
    r.estado_civil_nome  || '',
    r.profissao_nome     || '',
    r.rg ? `portador(a) do RG nº ${r.rg}${r.rg_orgao ? ' ' + r.rg_orgao : ''}` : '',
    cpf ? `inscrito(a) no CPF sob o nº ${cpf}` : '',
    endereco ? `residente e domiciliado(a) em ${endereco}` : '',
  ].filter(Boolean).join(', ');

  const papel = r.parentesco_nome ? `, na qualidade de ${String(r.parentesco_nome).toLowerCase()}` : '';

  return {
    responsavel:               r.nome || '',
    responsavel_cpf:           cpf,
    responsavel_rg:            r.rg || '',
    responsavel_rg_orgao:      r.rg_orgao || '',
    responsavel_nacionalidade: r.nacionalidade_nome || '',
    responsavel_estado_civil:  r.estado_civil_nome || '',
    responsavel_profissao:     r.profissao_nome || '',
    responsavel_endereco:      endereco,
    parentesco:                r.parentesco_nome || '',
    representacao:             `neste ato representado(a) por ${r.nome}${papel}${qualificacao ? ', ' + qualificacao : ''}`,
  };
}

// ---- Busca as partes (autor OU réu) de um processo, já com os dados da pessoa ----
async function buscarPartes(processoId, tabela) {
  // tabela é valor interno controlado ('tbltituloprocautor'/'tbltituloprocreu') — sem injeção
  const [vinculos] = await pool.execute(
    `SELECT tipo_pessoa, pessoa_id FROM ${tabela} WHERE proc_id = ? ORDER BY id ASC`, [processoId]
  );
  const partes = [];
  for (const v of vinculos) {
    if (v.tipo_pessoa === 'fisica') {
      const [pf] = await pool.execute(
        `SELECT pf.*, ec.nome AS estado_civil_nome, prof.nome AS profissao_nome, g.nome AS genero_nome, nac.nome AS nacionalidade_nome
         FROM pessoas_fisicas pf
         LEFT JOIN estado_civil ec ON pf.estado_civil_id = ec.id
         LEFT JOIN profissao  prof ON pf.profissao_id   = prof.id
         LEFT JOIN genero     g    ON pf.genero_id      = g.id
         LEFT JOIN nacionalidade nac ON pf.nacionalidade_id = nac.id
         WHERE pf.id = ?`, [v.pessoa_id]
      );
      if (pf.length) {
        pf[0]._resp = await carregarResponsavel(pf[0].responsavel_id, pf[0].parentesco_id);
        partes.push({ tipo: 'fisica', d: pf[0], nome: pf[0].nome, documento: fmtCPF(pf[0].cpf) });
      }
    } else {
      const [pj] = await pool.execute('SELECT * FROM pessoas_juridicas WHERE id = ?', [v.pessoa_id]);
      if (pj.length) partes.push({ tipo: 'juridica', d: pj[0], nome: pj[0].razao_social, documento: fmtCNPJ(pj[0].cnpj) });
    }
  }
  return partes;
}

// ---- Autores/réus COMPLETOS e repetíveis (regiões {{#autores}}/{{#reus}} de um processo) ----
// Reaproveita carregarParte (mesmo formato/campos do "Documento de partes"), já com
// telefones e e-mails. Retorna array na ordem de cadastro (id ASC). `tabela` é valor
// interno controlado ('tbltituloprocautor'/'tbltituloprocreu') — sem injeção.
async function buscarPartesRegiao(processoId, tabela) {
  const [vinculos] = await pool.execute(
    `SELECT tipo_pessoa, pessoa_id FROM ${tabela} WHERE proc_id = ? ORDER BY id ASC`, [processoId]
  );
  const out = [];
  for (const v of vinculos) {
    const parte = await carregarParte(v.tipo_pessoa, v.pessoa_id);
    if (parte) out.push(parte);
  }
  return out;
}

// Monta as variáveis do bloco Cliente a partir de UMA parte (a principal).
function blocoClienteDeParte(parte) {
  if (!parte) return {};
  const d = parte.d;
  const enderecoFull = montarEndereco(d.logradouro, d.numero, d.complemento, d.bairro, d.cidade, d.estado, d.cep);
  const comum = {
    endereco_cliente: enderecoFull,
    cep: d.cep || '', logradouro: d.logradouro || '', numero: d.numero || '',
    complemento: d.complemento || '', bairro: d.bairro || '', cidade: d.cidade || '', estado: d.estado || '',
  };
  if (parte.tipo === 'fisica') {
    return {
      ...comum,
      nome_cliente: d.nome || '',
      documento_cliente: fmtCPF(d.cpf),
      cpf_cliente: fmtCPF(d.cpf),
      rg_cliente: d.rg || '',
      rg_orgao: d.rg_orgao || '',
      pis_cliente: d.pis || '',
      ctps_cliente: [d.ctps_numero, d.ctps_serie].filter(Boolean).join(' / '),
      nome_pai: d.nome_pai || '',
      nome_mae: d.nome_mae || '',
      data_nascimento: dataBR(d.data_nascimento),
      estado_civil: d.estado_civil_nome || '',
      profissao: d.profissao_nome || '',
      genero: d.genero_nome || '',
      nacionalidade_cliente: d.nacionalidade_nome || '',
      ...blocoResponsavel(d),
    };
  }
  return {
    ...comum,
    nome_cliente: d.razao_social || '',
    nome_fantasia: d.nome_fantasia || '',
    documento_cliente: fmtCNPJ(d.cnpj),
    cnpj_cliente: fmtCNPJ(d.cnpj),
    inscricao_estadual: d.inscricao_estadual || '',
    ...blocoResponsavel(null),   // pessoa jurídica não tem responsável legal
  };
}

// ---- Bloco Processo + Cliente + Parte adversa (reaproveitado por toda âncora ligada a processo) ----
async function blocoProcessoECliente(processoId) {
  const [pr] = await pool.execute(
    `SELECT p.id, p.numProc, p.NomeTituloProc, p.data_distribuicao, p.cliente_polo,
            pa.numPasta, pa.area_direito,
            v.nome AS vara_nome,
            f.nome AS forum_nome, f.cep AS forum_cep, f.logradouro AS forum_log, f.num_end AS forum_num,
            f.compl_end AS forum_compl, f.bairro AS forum_bairro, f.cidade AS forum_cidade, f.uf AS forum_uf,
            tp.nome AS tipo_nome, st.nome AS status_nome, ins.nome AS instancia_nome
     FROM tblproc p
     JOIN tblpasta pa ON p.pasta_id = pa.id
     LEFT JOIN tblvara v ON p.vara_id = v.id
     LEFT JOIN tblforum f ON v.forum_id = f.id
     LEFT JOIN tbltipoproc tp ON p.tipo_id = tp.id
     LEFT JOIN tblstatusproc st ON p.status_id = st.id
     LEFT JOIN tblinstanciaproc ins ON p.instancia_id = ins.id
     WHERE p.id = ? LIMIT 1`, [processoId]
  );
  if (!pr.length) return null;
  const p = pr[0];

  // Cliente = polo marcado em cliente_polo; parte adversa = polo oposto.
  // Se cliente_polo não estiver definido, assume 'autor' como cliente (padrão).
  const clienteEhReu = p.cliente_polo === 'reu';
  const tabelaCliente = clienteEhReu ? 'tbltituloprocreu' : 'tbltituloprocautor';
  const tabelaAdversa = clienteEhReu ? 'tbltituloprocautor' : 'tbltituloprocreu';

  const clientes = await buscarPartes(processoId, tabelaCliente);
  const adversos = await buscarPartes(processoId, tabelaAdversa);
  const clientePrincipal = clientes[0] || null;

  // Autores e réus COMPLETOS e repetíveis (por POLO), para modelos com {{#autores}}/{{#reus}}.
  const autores = await buscarPartesRegiao(processoId, 'tbltituloprocautor');
  const reus    = await buscarPartesRegiao(processoId, 'tbltituloprocreu');

  const dados = {
    numero_processo: p.numProc || '',
    titulo_processo: p.NomeTituloProc || '',
    numero_pasta: (p.numPasta != null) ? String(p.numPasta).padStart(4, '0') : '',
    area_direito: p.area_direito || '',
    vara: p.vara_nome || '',
    forum: p.forum_nome || '',
    // Endereço do fórum/vara (endereçamento ao juízo e cartas ao fórum) — vem do cadastro de fórum.
    endereco_forum: montarEndereco(p.forum_log, p.forum_num, p.forum_compl, p.forum_bairro, p.forum_cidade, p.forum_uf, p.forum_cep),
    cep_forum: p.forum_cep || '',
    logradouro_forum: p.forum_log || '',
    numero_forum: p.forum_num || '',
    complemento_forum: p.forum_compl || '',
    bairro_forum: p.forum_bairro || '',
    cidade_forum: p.forum_cidade || '',
    estado_forum: p.forum_uf || '',
    tipo_processo: p.tipo_nome || '',
    status_processo: p.status_nome || '',
    instancia: p.instancia_nome || '',
    data_distribuicao: dataBR(p.data_distribuicao),
    parte_adversa: adversos.map(a => a.nome).join(', '),
    parte_adversa_documento: adversos.map(a => a.documento).filter(Boolean).join(', '),
    ...blocoClienteDeParte(clientePrincipal),
    // Regiões repetíveis de partes (mesmo formato do "Documento de partes").
    autores,
    reus,
  };

  return {
    dados,
    clienteNome: clientePrincipal ? clientePrincipal.nome : '',
    numeroProcesso: p.numProc || '',
    numProcDigitos: (p.numProc || '').replace(/\D/g, ''),
  };
}

// ---- Bloco Audiência ----
function montaBlocoAudiencia(a, minutosAntes = 0) {
  return {
    data_audiencia: dataBR(a.data),
    hora_audiencia: horaAjustada(a.hora, minutosAntes), // respeita "minutos antes" do modelo (0 = horário real)
    hora_audiencia_real: hora(a.hora),                  // horário real, sempre disponível
    tipo_audiencia: a.tipo_nome || '',
    local_audiencia: a.local || '',
    vara_audiencia: a.vara_nome || '',
    forum_audiencia: a.forum_nome || '',
    endereco_audiencia: montarEndereco(a.forum_log, a.forum_num, a.forum_compl, a.forum_bairro, a.forum_cidade, a.forum_uf, a.forum_cep),
    cep_audiencia: a.forum_cep || '',
    logradouro_audiencia: a.forum_log || '',
    numero_audiencia: a.forum_num || '',
    complemento_audiencia: a.forum_compl || '',
    bairro_audiencia: a.forum_bairro || '',
    cidade_audiencia: a.forum_cidade || '',
    estado_audiencia: a.forum_uf || '',
    modalidade_audiencia: a.modalidade || '',
    link_audiencia: a.link_virtual || '',
    plataforma_audiencia: a.plataforma_virtual || '',
  };
}

async function resolverAudiencia(audienciaId, usuario, opcoes = {}) {
  const [aud] = await pool.execute(
    `SELECT a.id, a.data, a.hora, a.local, a.modalidade, a.link_virtual, a.plataforma_virtual, a.processo_id,
            ta.nome AS tipo_nome,
            v.nome AS vara_nome,
            f.nome AS forum_nome, f.cep AS forum_cep, f.logradouro AS forum_log, f.num_end AS forum_num,
            f.compl_end AS forum_compl, f.bairro AS forum_bairro, f.cidade AS forum_cidade, f.uf AS forum_uf
     FROM audiencia a
     LEFT JOIN tipo_audiencia ta ON a.tipo_audiencia_id = ta.id
     LEFT JOIN tblvara v ON a.vara_id = v.id
     LEFT JOIN tblforum f ON v.forum_id = f.id
     WHERE a.id = ? LIMIT 1`, [audienciaId]
  );
  if (!aud.length) return null;
  const a = aud[0];

  const proc = await blocoProcessoECliente(a.processo_id);
  const esc = await blocoEscritorio(usuario);

  const dados = { ...(proc ? proc.dados : {}), ...montaBlocoAudiencia(a, opcoes.minutosAntes), ...esc };

  const refPartes = [];
  if (proc?.numeroProcesso) refPartes.push(`Proc ${proc.numeroProcesso}`);
  if (proc?.clienteNome) refPartes.push(`Cliente ${proc.clienteNome}`);
  refPartes.push(`Audiência ${dataBR(a.data)}`);

  return {
    dados,
    clienteNome: proc ? proc.clienteNome : '',
    numProcDigitos: proc ? proc.numProcDigitos : '',
    referencia: refPartes.join(' · ').slice(0, 300),
  };
}

// ---- Bloco Perícia ----
function montaBlocoPericia(p, minutosAntes = 0) {
  return {
    data_pericia: dataBR(p.data),
    hora_pericia: horaAjustada(p.hora, minutosAntes), // respeita "minutos antes" do modelo (0 = horário real)
    hora_pericia_real: hora(p.hora),                  // horário real, sempre disponível
    local_pericia: p.local || '',
    tipo_pericia: p.tipo_nome || '',
    perito: p.perito_nome || '',
  };
}

async function resolverPericia(periciaId, usuario, opcoes = {}) {
  const [per] = await pool.execute(
    `SELECT pe.id, pe.data, pe.hora, pe.local, pe.processo_id,
            tp.nome AS tipo_nome,
            CASE WHEN pe.perito_tipo = 'fisica'   THEN pf.nome
                 WHEN pe.perito_tipo = 'juridica' THEN pj.razao_social ELSE NULL END AS perito_nome
     FROM pericia pe
     LEFT JOIN tipo_pericia tp ON pe.tipo_pericia_id = tp.id
     LEFT JOIN pessoas_fisicas pf ON pe.perito_tipo = 'fisica' AND pe.perito_id = pf.id
     LEFT JOIN pessoas_juridicas pj ON pe.perito_tipo = 'juridica' AND pe.perito_id = pj.id
     WHERE pe.id = ? LIMIT 1`, [periciaId]
  );
  if (!per.length) return null;
  const p = per[0];

  const proc = await blocoProcessoECliente(p.processo_id);
  const esc = await blocoEscritorio(usuario);
  const dados = { ...(proc ? proc.dados : {}), ...montaBlocoPericia(p, opcoes.minutosAntes), ...esc };

  const refPartes = [];
  if (proc?.numeroProcesso) refPartes.push(`Proc ${proc.numeroProcesso}`);
  if (proc?.clienteNome) refPartes.push(`Cliente ${proc.clienteNome}`);
  refPartes.push(`Perícia ${dataBR(p.data)}`);

  return {
    dados,
    clienteNome: proc ? proc.clienteNome : '',
    numProcDigitos: proc ? proc.numProcDigitos : '',
    referencia: refPartes.join(' · ').slice(0, 300),
  };
}

// ---- Prazo ----
// O documento de prazo (rol de testemunhas, quesitos…) é uma petição do processo,
// usando dados de cliente + processo + escritório (o catálogo não tem bloco "prazo" próprio).
async function resolverPrazo(prazoId, usuario) {
  const [pz] = await pool.execute(
    'SELECT id, processo_id FROM prazos_processo WHERE id = ? LIMIT 1', [prazoId]
  );
  if (!pz.length) return null;

  const proc = await blocoProcessoECliente(pz[0].processo_id);
  const esc = await blocoEscritorio(usuario);
  const dados = { ...(proc ? proc.dados : {}), ...esc };

  const refPartes = [];
  if (proc?.numeroProcesso) refPartes.push(`Proc ${proc.numeroProcesso}`);
  if (proc?.clienteNome) refPartes.push(`Cliente ${proc.clienteNome}`);

  return {
    dados,
    clienteNome: proc ? proc.clienteNome : '',
    numProcDigitos: proc ? proc.numProcDigitos : '',
    referencia: refPartes.join(' · ').slice(0, 300),
  };
}

// ---- Pessoa (modelos "comum" gerados direto do cadastro: procuração, declaração…) ----
// Resolve só o bloco Cliente (a partir da própria pessoa) + Escritório. Sem processo.
async function resolverPessoa(tipo, pessoaId, usuario) {
  let parte = null;
  if (tipo === 'fisica') {
    const [pf] = await pool.execute(
      `SELECT pf.*, ec.nome AS estado_civil_nome, prof.nome AS profissao_nome, g.nome AS genero_nome, nac.nome AS nacionalidade_nome
       FROM pessoas_fisicas pf
       LEFT JOIN estado_civil ec ON pf.estado_civil_id = ec.id
       LEFT JOIN profissao  prof ON pf.profissao_id    = prof.id
       LEFT JOIN genero     g    ON pf.genero_id       = g.id
       LEFT JOIN nacionalidade nac ON pf.nacionalidade_id = nac.id
       WHERE pf.id = ?`, [pessoaId]
    );
    if (pf.length) {
      pf[0]._resp = await carregarResponsavel(pf[0].responsavel_id, pf[0].parentesco_id);
      parte = { tipo: 'fisica', d: pf[0], nome: pf[0].nome };
    }
  } else {
    const [pj] = await pool.execute('SELECT * FROM pessoas_juridicas WHERE id = ?', [pessoaId]);
    if (pj.length) parte = { tipo: 'juridica', d: pj[0], nome: pj[0].razao_social };
  }
  if (!parte) return null;

  const esc = await blocoEscritorio(usuario);
  const dados = { ...blocoClienteDeParte(parte), ...esc };
  return {
    dados,
    clienteNome: parte.nome || '',
    numProcDigitos: '',
    referencia: `Cliente ${parte.nome || ''}`.slice(0, 300),
  };
}

// ---- Pagamento (RECIBO de repasse: escritório -> cliente OU parceiro) ----
// opcoes.tipoRecibo: 'cliente' (valor = líquido) | 'parceiro' (valor = parceria).
// Deriva-se do destino do modelo escolhido (recibo_cliente / recibo_parceria).
async function resolverPagamento(parcelaId, usuario, opcoes = {}) {
  const ehParceiro = opcoes.tipoRecibo === 'parceiro';
  const [rows] = await pool.execute(
    `SELECT ap.*,
            a.processo_id, a.descricao AS acordo_descricao, a.valor_total AS acordo_valor_total,
            (SELECT COUNT(*) FROM acordo_parcela x WHERE x.acordo_id = ap.acordo_id) AS total_parcelas,
            (SELECT nome FROM forma_pagamento WHERE id = ap.recebimento_forma_id)     AS forma_receb,
            (SELECT nome FROM forma_pagamento WHERE id = ap.repasse_cliente_forma_id) AS forma_rep_cli,
            (SELECT nome FROM forma_pagamento WHERE id = ap.repasse_parceiro_forma_id) AS forma_rep_par,
            CASE ap.parceria_pessoa_tipo
              WHEN 'fisica'   THEN (SELECT pf.nome         FROM pessoas_fisicas   pf WHERE pf.id = ap.parceria_pessoa_id)
              WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = ap.parceria_pessoa_id)
              ELSE NULL END AS parceria_nome
     FROM acordo_parcela ap JOIN acordo a ON ap.acordo_id = a.id
     WHERE ap.id = ? LIMIT 1`, [parcelaId]
  );
  if (!rows.length) return null;
  const p = rows[0];

  const proc = await blocoProcessoECliente(p.processo_id);
  const esc = await blocoEscritorio(usuario);

  const valorPago    = ehParceiro ? Number(p.parceria_valor || 0) : Number(p.valor_liquido || 0);
  const formaRepasse = ehParceiro ? (p.forma_rep_par || '') : (p.forma_rep_cli || '');
  const dataRepasse  = ehParceiro ? p.repasse_parceiro_em : p.repasse_cliente_em;

  const blocoPagamento = {
    valor_pago:         moedaBR(valorPago),
    valor_pago_extenso: valorPorExtenso(valorPago),
    valor_bruto:        moedaBR(p.valor_bruto),
    valor_honorario:    moedaBR(p.honor_valor),
    valor_liquido:      moedaBR(p.valor_liquido),
    valor_parceria:     moedaBR(p.parceria_valor || 0),
    forma_pagamento:    formaRepasse,             // ótica do recibo: a forma do repasse
    forma_repasse:      formaRepasse,
    forma_recebimento:  p.forma_receb || '',      // como o réu pagou o escritório
    identificacao_pagamento:   p.recebimento_identificacao || '',
    identificacao_recebimento: p.recebimento_identificacao || '',
    data_pagamento:     dataBR(dataRepasse),      // data em que o beneficiário recebeu (repasse)
    numero_parcela:     String(p.numero),
    total_parcelas:     String(p.total_parcelas),
    vencimento:         dataBR(p.vencimento),
    descricao_acordo:   p.acordo_descricao || '',
    valor_total_acordo: moedaBR(p.acordo_valor_total),
  };

  const dados = { ...(proc ? proc.dados : {}), ...blocoPagamento, ...esc };

  const benef = ehParceiro ? `Parceiro ${p.parceria_nome || ''}`.trim() : 'Cliente';
  const refPartes = [];
  if (proc?.numeroProcesso) refPartes.push(`Proc ${proc.numeroProcesso}`);
  if (proc?.clienteNome) refPartes.push(`Cliente ${proc.clienteNome}`);
  refPartes.push(`Recibo ${benef} parc ${p.numero}/${p.total_parcelas}`);

  return {
    dados,
    clienteNome: proc ? proc.clienteNome : '',
    numProcDigitos: proc ? proc.numProcDigitos : '',
    referencia: refPartes.join(' · ').slice(0, 300),
  };
}

// ============================================================
// MULTIPESSOAS — "Documento de partes" (vários autores × vários réus)
// ------------------------------------------------------------
// Diferente das âncoras acima, aqui NÃO há processo: o documento é montado a
// partir de listas de pessoas (cada uma física ou jurídica) escolhidas na hora.
// Cada pessoa vira um objeto com tags "soltas" (nome, cpf, endereco...) + listas
// de telefones e e-mails, para o .docx repetir com {{#autores}}/{{#reus}} e as
// sub-regiões {{#telefones}}/{{#emails}}.
// ============================================================

// Carrega UMA pessoa (física ou jurídica) já no formato de "parte" do documento:
// campos soltos + telefones[] ({numero,tipo}) + emails[] ({email}). Retorna null se não existir.
async function carregarParte(tipo, pessoaId) {
  let base;
  if (tipo === 'fisica') {
    const [pf] = await pool.execute(
      `SELECT pf.*, ec.nome AS estado_civil_nome, prof.nome AS profissao_nome, g.nome AS genero_nome, nac.nome AS nacionalidade_nome
       FROM pessoas_fisicas pf
       LEFT JOIN estado_civil ec ON pf.estado_civil_id = ec.id
       LEFT JOIN profissao  prof ON pf.profissao_id    = prof.id
       LEFT JOIN genero     g    ON pf.genero_id       = g.id
       LEFT JOIN nacionalidade nac ON pf.nacionalidade_id = nac.id
       WHERE pf.id = ?`, [pessoaId]
    );
    if (!pf.length) return null;
    const d = pf[0];
    d._resp = await carregarResponsavel(d.responsavel_id, d.parentesco_id);
    base = {
      nome: d.nome || '',
      nome_fantasia: '',
      documento: fmtCPF(d.cpf),
      cpf: fmtCPF(d.cpf), cnpj: '',
      rg: d.rg || '', rg_orgao: d.rg_orgao || '', pis: d.pis || '',
      ctps: [d.ctps_numero, d.ctps_serie].filter(Boolean).join(' / '),
      nacionalidade: d.nacionalidade_nome || '',
      estado_civil: d.estado_civil_nome || '',
      profissao: d.profissao_nome || '',
      genero: d.genero_nome || '',
      data_nascimento: dataBR(d.data_nascimento),
      nome_mae: d.nome_mae || '', nome_pai: d.nome_pai || '',
      inscricao_estadual: '',
      ...blocoResponsavel(d),
      endereco: montarEndereco(d.logradouro, d.numero, d.complemento, d.bairro, d.cidade, d.estado, d.cep),
      cep: d.cep || '', logradouro: d.logradouro || '', numero: d.numero || '',
      complemento: d.complemento || '', bairro: d.bairro || '', cidade: d.cidade || '', estado: d.estado || '',
    };
  } else {
    const [pj] = await pool.execute('SELECT * FROM pessoas_juridicas WHERE id = ?', [pessoaId]);
    if (!pj.length) return null;
    const d = pj[0];
    base = {
      nome: d.razao_social || '',
      nome_fantasia: d.nome_fantasia || '',
      documento: fmtCNPJ(d.cnpj),
      cpf: '', cnpj: fmtCNPJ(d.cnpj),
      rg: '', rg_orgao: '', pis: '', ctps: '', nacionalidade: '',
      estado_civil: '', profissao: '', genero: '', data_nascimento: '',
      nome_mae: '', nome_pai: '',
      ...blocoResponsavel(null),   // pessoa jurídica não tem responsável legal
      inscricao_estadual: d.inscricao_estadual || '',
      endereco: montarEndereco(d.logradouro, d.numero, d.complemento, d.bairro, d.cidade, d.estado, d.cep),
      cep: d.cep || '', logradouro: d.logradouro || '', numero: d.numero || '',
      complemento: d.complemento || '', bairro: d.bairro || '', cidade: d.cidade || '', estado: d.estado || '',
    };
  }

  // Telefones e e-mails ATIVOS, com o principal primeiro.
  const tabTel = tipo === 'fisica' ? 'telefones_pf' : 'telefones_pj';
  const tabEml = tipo === 'fisica' ? 'emails_pf' : 'emails_pj';
  const [tels] = await pool.execute(
    `SELECT numero, tipo FROM ${tabTel} WHERE pessoa_id = ? AND ativo = 1 ORDER BY principal DESC, id ASC`, [pessoaId]
  );
  const [emls] = await pool.execute(
    `SELECT email FROM ${tabEml} WHERE pessoa_id = ? AND ativo = 1 ORDER BY principal DESC, id ASC`, [pessoaId]
  );

  base.telefones = tels.map(t => ({ numero: t.numero || '', tipo: t.tipo || '' }));
  base.emails = emls.map(e => ({ email: (e.email || '').toLowerCase() }));
  base.telefone = base.telefones[0] ? base.telefones[0].numero : '';
  base.telefone_tipo = base.telefones[0] ? base.telefones[0].tipo : '';
  base.email = base.emails[0] ? base.emails[0].email : '';
  return base;
}

// Resolve as variáveis de um documento multipessoas a partir das listas escolhidas.
// `autores`/`reus` = arrays de { tipo: 'fisica'|'juridica', id }. Itens inválidos são ignorados.
async function resolverMultipessoas(autores, reus, usuario) {
  async function carregarLista(lista) {
    const out = [];
    for (const p of (Array.isArray(lista) ? lista : [])) {
      const parte = await carregarParte(p.tipo, p.id);
      if (parte) out.push(parte);
    }
    return out;
  }

  const autoresArr = await carregarLista(autores);
  const reusArr = await carregarLista(reus);
  const esc = await blocoEscritorio(usuario);

  // Variáveis de escritório ficam na raiz (acessíveis dentro dos loops também).
  const dados = { autores: autoresArr, reus: reusArr, ...esc };

  const clienteNome = (autoresArr[0] && autoresArr[0].nome) || (reusArr[0] && reusArr[0].nome) || '';
  const refAut = autoresArr.map(a => a.nome).filter(Boolean).join(', ');
  const refReu = reusArr.map(r => r.nome).filter(Boolean).join(', ');
  const referencia = [refAut && `Autores: ${refAut}`, refReu && `Réus: ${refReu}`].filter(Boolean).join(' · ').slice(0, 300);

  // CAIXA ALTA nos nomes de autores/réus, se o escritório ligou a opção.
  if (await escritorioUsaMaiusculas()) aplicarCaixaAltaNomes(dados);

  return { dados, clienteNome, numProcDigitos: '', referencia };
}

// ============================================================
// CAIXA ALTA nos NOMES das partes (opção liga/desliga por escritório)
// ------------------------------------------------------------
// Quando o escritório liga a opção (coluna configuracoes_escritorio.documentos_maiusculas),
// os documentos saem com o NOME do autor e do réu em CAIXA ALTA. Afeta SÓ o nome das partes:
//   - nome_cliente  (o cliente é o autor OU o réu do caso)
//   - parte_adversa (nome da outra parte)
//   - o nome de cada autor/réu nas regiões repetíveis {{#autores}}/{{#reus}}
// NENHUM outro campo é tocado (CPF, RG, endereço, profissão, links, e-mails, escritório...).
// ============================================================
function paraMaiusculas(v) {
  return (v == null || v === '') ? v : String(v).toUpperCase();
}
function aplicarCaixaAltaNomes(dados) {
  if (!dados) return dados;
  if (dados.nome_cliente)  dados.nome_cliente  = paraMaiusculas(dados.nome_cliente);
  if (dados.parte_adversa) dados.parte_adversa = paraMaiusculas(dados.parte_adversa);
  if (Array.isArray(dados.autores)) dados.autores.forEach(p => { if (p && p.nome) p.nome = paraMaiusculas(p.nome); });
  if (Array.isArray(dados.reus))    dados.reus.forEach(p => { if (p && p.nome) p.nome = paraMaiusculas(p.nome); });
  return dados;
}
// Lê a opção do escritório. TOLERANTE: se a coluna ainda não existir no banco
// (schema não atualizado numa instância), assume "desligado" e NÃO quebra a
// geração do documento — apenas não aplica a caixa alta.
async function escritorioUsaMaiusculas() {
  try {
    const [rows] = await pool.execute('SELECT documentos_maiusculas FROM configuracoes_escritorio LIMIT 1');
    return !!(rows[0] && rows[0].documentos_maiusculas);
  } catch (e) {
    return false;
  }
}

// ============================================================
// DESTINATÁRIO SUGERIDO (para "enviar documento por e-mail" a partir do ModalGerar)
// Retorna quem naturalmente recebe o documento: a própria pessoa (âncora pessoa)
// ou o CLIENTE do processo (âncoras audiência/perícia/prazo/recibo). Só sugestão —
// no front o e-mail pode ser conferido/trocado. Não altera nada no banco.
// ============================================================

// Descobre o processo_id de uma âncora ligada a processo (null nas de pessoa).
async function processoIdDaAncora(ancoraTipo, ancoraId) {
  const id = Number(ancoraId);
  if (!id) return null;
  if (ancoraTipo === 'audiencia') { const [r] = await pool.execute('SELECT processo_id FROM audiencia WHERE id = ? LIMIT 1', [id]); return r[0]?.processo_id || null; }
  if (ancoraTipo === 'pericia')   { const [r] = await pool.execute('SELECT processo_id FROM pericia WHERE id = ? LIMIT 1', [id]); return r[0]?.processo_id || null; }
  if (ancoraTipo === 'prazo')     { const [r] = await pool.execute('SELECT processo_id FROM prazos_processo WHERE id = ? LIMIT 1', [id]); return r[0]?.processo_id || null; }
  if (ancoraTipo === 'pagamento') { const [r] = await pool.execute('SELECT a.processo_id FROM acordo_parcela ap JOIN acordo a ON ap.acordo_id = a.id WHERE ap.id = ? LIMIT 1', [id]); return r[0]?.processo_id || null; }
  return null;
}

// Cliente do processo = primeira parte do polo marcado em cliente_polo (padrão 'autor').
async function clienteDoProcesso(processoId) {
  const [pr] = await pool.execute('SELECT cliente_polo FROM tblproc WHERE id = ? LIMIT 1', [processoId]);
  if (!pr.length) return null;
  const tabela = pr[0].cliente_polo === 'reu' ? 'tbltituloprocreu' : 'tbltituloprocautor';
  const [v] = await pool.execute(`SELECT tipo_pessoa, pessoa_id FROM ${tabela} WHERE proc_id = ? ORDER BY id ASC LIMIT 1`, [processoId]);
  if (!v.length) return null;
  return { tipo_pessoa: v[0].tipo_pessoa, pessoa_id: v[0].pessoa_id };
}

// Nome + e-mails ATIVOS de uma pessoa (principal primeiro).
async function nomeEEmailsDaPessoa(tipoPessoa, pessoaId) {
  let nome = '';
  if (tipoPessoa === 'fisica') { const [r] = await pool.execute('SELECT nome FROM pessoas_fisicas WHERE id = ? LIMIT 1', [pessoaId]); nome = r[0]?.nome || ''; }
  else { const [r] = await pool.execute('SELECT razao_social FROM pessoas_juridicas WHERE id = ? LIMIT 1', [pessoaId]); nome = r[0]?.razao_social || ''; }
  const tabEml = tipoPessoa === 'fisica' ? 'emails_pf' : 'emails_pj';
  const [em] = await pool.execute(`SELECT email FROM ${tabEml} WHERE pessoa_id = ? AND ativo = 1 ORDER BY principal DESC, id ASC`, [pessoaId]);
  return { nome, emails: em.map(e => (e.email || '').toLowerCase()).filter(Boolean) };
}

async function resolverDestinatario(ancoraTipo, ancoraId) {
  let tipo_pessoa = null, pessoa_id = null, processo_id = null;
  if (ancoraTipo === 'pessoa_fisica')        { tipo_pessoa = 'fisica';   pessoa_id = Number(ancoraId); }
  else if (ancoraTipo === 'pessoa_juridica') { tipo_pessoa = 'juridica'; pessoa_id = Number(ancoraId); }
  else {
    processo_id = await processoIdDaAncora(ancoraTipo, ancoraId);
    if (processo_id) {
      const cli = await clienteDoProcesso(processo_id);
      if (cli) { tipo_pessoa = cli.tipo_pessoa; pessoa_id = cli.pessoa_id; }
    }
  }
  if (!pessoa_id) return { tipo_pessoa: null, pessoa_id: null, nome: '', emails: [], processo_id };
  const { nome, emails } = await nomeEEmailsDaPessoa(tipo_pessoa, pessoa_id);
  return { tipo_pessoa, pessoa_id, nome, emails, processo_id };
}

// ---- Ponto de entrada: resolve as variáveis conforme o tipo de âncora ----
async function resolver(ancoraTipo, ancoraId, usuario, opcoes = {}) {
  let ctx = null;
  if (ancoraTipo === 'audiencia')             ctx = await resolverAudiencia(ancoraId, usuario, opcoes);
  else if (ancoraTipo === 'pericia')          ctx = await resolverPericia(ancoraId, usuario, opcoes);
  else if (ancoraTipo === 'prazo')            ctx = await resolverPrazo(ancoraId, usuario);
  else if (ancoraTipo === 'pagamento')        ctx = await resolverPagamento(ancoraId, usuario, opcoes);
  else if (ancoraTipo === 'pessoa_fisica')    ctx = await resolverPessoa('fisica', ancoraId, usuario);
  else if (ancoraTipo === 'pessoa_juridica')  ctx = await resolverPessoa('juridica', ancoraId, usuario);
  // CAIXA ALTA nos nomes das partes, se o escritório ligou a opção.
  if (ctx && ctx.dados && await escritorioUsaMaiusculas()) aplicarCaixaAltaNomes(ctx.dados);
  return ctx;
}

module.exports = { resolver, resolverMultipessoas, blocosAlcancados, modeloCompativel, resolverDestinatario };
