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
      if (pf.length) partes.push({ tipo: 'fisica', d: pf[0], nome: pf[0].nome, documento: pf[0].cpf || '' });
    } else {
      const [pj] = await pool.execute('SELECT * FROM pessoas_juridicas WHERE id = ?', [v.pessoa_id]);
      if (pj.length) partes.push({ tipo: 'juridica', d: pj[0], nome: pj[0].razao_social, documento: pj[0].cnpj || '' });
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
      documento_cliente: d.cpf || '',
      cpf_cliente: d.cpf || '',
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
    };
  }
  return {
    ...comum,
    nome_cliente: d.razao_social || '',
    nome_fantasia: d.nome_fantasia || '',
    documento_cliente: d.cnpj || '',
    cnpj_cliente: d.cnpj || '',
    inscricao_estadual: d.inscricao_estadual || '',
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
    if (pf.length) parte = { tipo: 'fisica', d: pf[0], nome: pf[0].nome };
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
    base = {
      nome: d.nome || '',
      nome_fantasia: '',
      documento: d.cpf || '',
      cpf: d.cpf || '', cnpj: '',
      rg: d.rg || '', rg_orgao: d.rg_orgao || '', pis: d.pis || '',
      ctps: [d.ctps_numero, d.ctps_serie].filter(Boolean).join(' / '),
      nacionalidade: d.nacionalidade_nome || '',
      estado_civil: d.estado_civil_nome || '',
      profissao: d.profissao_nome || '',
      genero: d.genero_nome || '',
      data_nascimento: dataBR(d.data_nascimento),
      nome_mae: d.nome_mae || '', nome_pai: d.nome_pai || '',
      inscricao_estadual: '',
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
      documento: d.cnpj || '',
      cpf: '', cnpj: d.cnpj || '',
      rg: '', rg_orgao: '', pis: '', ctps: '', nacionalidade: '',
      estado_civil: '', profissao: '', genero: '', data_nascimento: '',
      nome_mae: '', nome_pai: '',
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
  base.emails = emls.map(e => ({ email: e.email || '' }));
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

  return { dados, clienteNome, numProcDigitos: '', referencia };
}

// ---- Ponto de entrada: resolve as variáveis conforme o tipo de âncora ----
async function resolver(ancoraTipo, ancoraId, usuario, opcoes = {}) {
  if (ancoraTipo === 'audiencia')        return resolverAudiencia(ancoraId, usuario, opcoes);
  if (ancoraTipo === 'pericia')          return resolverPericia(ancoraId, usuario, opcoes);
  if (ancoraTipo === 'prazo')            return resolverPrazo(ancoraId, usuario);
  if (ancoraTipo === 'pagamento')        return resolverPagamento(ancoraId, usuario, opcoes);
  if (ancoraTipo === 'pessoa_fisica')    return resolverPessoa('fisica', ancoraId, usuario);
  if (ancoraTipo === 'pessoa_juridica')  return resolverPessoa('juridica', ancoraId, usuario);
  return null;
}

module.exports = { resolver, resolverMultipessoas, blocosAlcancados, modeloCompativel };
