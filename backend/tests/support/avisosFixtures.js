// Peças comuns dos testes dos AVISOS AOS CLIENTES: poucos dados por situação (um cliente, um evento, um usuário), SMTP falso e SMS falso.
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { conectarBancoTeste } = require('./testDatabase');
const { hojeBrasilia } = require('../../src/utils/helpers');

const HOJE = hojeBrasilia();
const dia = (n) => hojeBrasilia(n);
let SEQ = 0;

async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}

// Calendário em volta de hoje: sábado e domingo não são dias úteis.
async function semearCalendario() {
  const linhas = [];
  for (let n = -15; n <= 90; n += 1) {
    const semana = new Date(Date.parse(`${dia(n)}T12:00:00Z`)).getUTCDay();
    linhas.push([dia(n), semana === 0 || semana === 6 ? 0 : 1]);
  }
  const conn = await conectarBancoTeste();
  try { await conn.query('INSERT INTO calendario (data, dia_util) VALUES ? ON DUPLICATE KEY UPDATE dia_util = VALUES(dia_util)', [linhas]); } finally { await conn.end(); }
}

// Usuário com a lista exata de permissões [[módulo, submódulo, ação], ...].
async function usuario({ nivel = 2, permissoes = [] } = {}) {
  SEQ += 1;
  const login = `av${SEQ}x${crypto.randomBytes(3).toString('hex')}`;
  const sessao = crypto.randomBytes(12).toString('hex');
  const id = (await sql(`INSERT INTO usuarios (nome, login, senha_hash, email, tipo, nivel, ativo, sessao_atual, notif_email) VALUES (?, ?, ?, ?, 'advogado', ?, 1, ?, 0)`,
    [`Pessoa ${login}`, login, bcrypt.hashSync('Senha@Forte1', 4), `${login}@example.invalid`, nivel, sessao])).insertId;
  for (const [m, s, a] of permissoes) await sql('INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, ?, ?, ?, 1)', [id, m, s, a]);
  return { id, nome: `Pessoa ${login}`, token: jwt.sign({ id, nome: `Pessoa ${login}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' }) };
}

// Cliente com os contatos pedidos. O mesmo número pode ser WhatsApp e SMS.
async function cliente({ tipo = 'fisica', email = true, whatsapp = true, sms = true, nome = null, nascimento = null } = {}) {
  SEQ += 1;
  const rotulo = nome || `Cliente Aviso ${SEQ}`;
  const t = tipo === 'fisica' ? { pessoa: 'pessoas_fisicas', col: 'nome', tel: 'telefones_pf', em: 'emails_pf' } : { pessoa: 'pessoas_juridicas', col: 'razao_social', tel: 'telefones_pj', em: 'emails_pj' };
  const id = tipo === 'fisica'
    ? (await sql('INSERT INTO pessoas_fisicas (nome, data_nascimento) VALUES (?, ?)', [rotulo, nascimento])).insertId
    : (await sql(`INSERT INTO ${t.pessoa} (${t.col}) VALUES (?)`, [rotulo])).insertId;
  const endereco = `cliente${SEQ}@example.invalid`;
  const numero = `(19) 98877-${String(1000 + SEQ).slice(-4)}`;
  if (email) await sql(`INSERT INTO ${t.em} (pessoa_id, email, principal) VALUES (?, ?, 1)`, [id, endereco]);
  if (whatsapp || sms) await sql(`INSERT INTO ${t.tel} (pessoa_id, numero, principal, whatsapp, sms) VALUES (?, ?, 1, ?, ?)`, [id, numero, whatsapp ? 1 : 0, sms ? 1 : 0]);
  return { tipo, id, nome: rotulo, email: email ? endereco : null, numero: (whatsapp || sms) ? numero : null };
}

// Liga o cliente ao processo como AUTOR (o processo de teste nº 1 tem o cliente no polo autor).
async function ligarAoProcesso(cl, processoId = 1) {
  await sql('INSERT INTO tbltituloprocautor (proc_id, tipo_pessoa, pessoa_id) VALUES (?, ?, ?)', [processoId, cl.tipo, cl.id]);
}
async function desligarClientes(processoId = 1) {
  await sql('DELETE FROM tbltituloprocautor WHERE proc_id = ?', [processoId]);
}

let tipoPericia = null;
async function criarPericia({ data, hora = '10:00', status = 'agendada', criadoHaDias = 0, processoId = 1 }) {
  if (!tipoPericia) tipoPericia = (await sql("INSERT INTO tipo_pericia (nome, ativo) VALUES ('Médica Avisos', 1)")).insertId;
  return (await sql(`INSERT INTO pericia (processo_id, tipo_pericia_id, data, hora, local, status, criado_em, criado_por) VALUES (?, ?, ?, ?, 'Fórum Central', ?, DATE_SUB(NOW(), INTERVAL ? DAY), 1)`,
    [processoId, tipoPericia, data, hora, status, criadoHaDias])).insertId;
}
async function criarAudiencia({ data, hora = '14:00', modalidade = 'presencial', status = 'agendada', criadoHaDias = 0, processoId = 1 }) {
  return (await sql(`INSERT INTO audiencia (processo_id, tipo_audiencia_id, data, hora, modalidade, local, status, criado_em, criado_por) VALUES (?, 1, ?, ?, ?, 'Vara Central', ?, DATE_SUB(NOW(), INTERVAL ? DAY), 1)`,
    [processoId, data, hora, modalidade, status, criadoHaDias])).insertId;
}

async function configurar(campos) {
  const colunas = Object.keys(campos);
  await sql(`UPDATE configuracoes_escritorio SET ${colunas.map(c => `${c} = ?`).join(', ')}`, colunas.map(c => campos[c]));
}

// A Comtele (SMS): "ativa" só liga a chave; o envio em si é trocado por um boneco que guarda o que recebeu.
async function ligarComtele(ativo) {
  await sql("DELETE FROM configuracoes_integracoes WHERE modulo = 'comtele'");
  await sql("INSERT INTO configuracoes_integracoes (modulo, ativo, configuracoes) VALUES ('comtele', ?, ?)", [ativo ? 1 : 0, JSON.stringify({ api_key: 'chave-de-teste', route: '' })]);
}
function smsFalso() {
  const servico = require('../../src/services/smsService');
  const original = servico.enviarSMS;
  const falso = { enviados: [], falhar: false };
  servico.enviarSMS = async (apiKey, numero, mensagem) => {
    if (falso.falhar) throw new Error('Comtele fora do ar (teste)');
    falso.enviados.push({ numero, mensagem });
    return { id: falso.enviados.length };
  };
  falso.restaurar = () => { servico.enviarSMS = original; };
  return falso;
}

const avisos = (filtro = '', params = []) => sql(`SELECT * FROM avisos_cliente ${filtro} ORDER BY id`, params);
const limparAvisos = async () => { await sql('DELETE FROM log_comunicacoes'); await sql('DELETE FROM avisos_cliente'); };

module.exports = { sql, HOJE, dia, semearCalendario, usuario, cliente, ligarAoProcesso, desligarClientes, criarPericia, criarAudiencia, configurar, ligarComtele, smsFalso, avisos, limparAvisos };
