// Avisos aos clientes — como falar com o cliente: e-mail principal, o número marcado como WhatsApp e o marcado como SMS.
const { pool } = require('../config/database');
const { lerConfigComtele } = require('../utils/configComtele');

// Nomes de tabela fixos (nunca vêm do usuário).
const TABELAS = {
  fisica:   { pessoa: 'pessoas_fisicas',   nome: 'nome',         telefone: 'telefones_pf', email: 'emails_pf' },
  juridica: { pessoa: 'pessoas_juridicas', nome: 'razao_social', telefone: 'telefones_pj', email: 'emails_pj' },
};

// { nome, email, whatsapp, sms } — o que não existe vem null. Telefone: só o número ATIVO marcado (no máximo um de cada).
async function contatosDoCliente(tipo, id, exec = pool) {
  const t = TABELAS[tipo];
  if (!t) return null;
  const [[p]] = await exec.execute(`SELECT ${t.nome} AS nome FROM ${t.pessoa} WHERE id = ?`, [id]);
  if (!p) return null;
  const [em] = await exec.execute(`SELECT email FROM ${t.email} WHERE pessoa_id = ? AND ativo = 1 ORDER BY principal DESC, id ASC LIMIT 1`, [id]);
  const [zap] = await exec.execute(`SELECT numero FROM ${t.telefone} WHERE pessoa_id = ? AND ativo = 1 AND whatsapp = 1 LIMIT 1`, [id]);
  const [sms] = await exec.execute(`SELECT numero FROM ${t.telefone} WHERE pessoa_id = ? AND ativo = 1 AND sms = 1 LIMIT 1`, [id]);
  return { nome: p.nome, email: em[0]?.email || null, whatsapp: zap[0]?.numero || null, sms: sms[0]?.numero || null };
}

// O escritório contratou e ativou a Comtele? Sem isso o SMS nem aparece como opção.
async function smsHabilitado() {
  const { apiKey } = await lerConfigComtele();
  return !!apiKey;
}

// Quais canais existem para este cliente: { email, sms, whatsapp } (verdadeiro/falso).
function canaisDisponiveis(contatos, smsLigado) {
  return { email: !!contatos?.email, sms: !!smsLigado && !!contatos?.sms, whatsapp: !!contatos?.whatsapp };
}

module.exports = { contatosDoCliente, smsHabilitado, canaisDisponiveis };
