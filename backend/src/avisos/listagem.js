// Avisos aos clientes — o que a tela de conferência mostra: avisos pendentes (com os canais de cada cliente) e o histórico.
const { pool } = require('../config/database');
const { contatosDoCliente, smsHabilitado, canaisDisponiveis } = require('./contatos');

const SQL_BASE = `
  SELECT a.id, a.modulo, a.tipo, a.data_evento, a.data_aviso, a.assunto, a.texto, a.texto_editado, a.status, a.modo, a.motivo_status,
         a.cliente_tipo, a.cliente_id, a.processo_id, a.decidido_em, a.criado_em, u.nome AS decidido_por_nome,
         pr.numProc AS processo_numero, pa.numPasta AS pasta_numero
    FROM avisos_cliente a
    LEFT JOIN usuarios u ON u.id = a.decidido_por
    LEFT JOIN tblproc pr ON pr.id = a.processo_id
    LEFT JOIN tblpasta pa ON pa.id = pr.pasta_id`;

const marcadores = (n) => Array(n).fill('?').join(', ');

// Pendentes dos módulos permitidos, já com nome do cliente e os canais que ele tem (e-mail, SMS se a Comtele estiver ativa, WhatsApp).
async function listarPendentes(modulos) {
  if (!modulos.length) return { itens: [], smsAtivo: await smsHabilitado() };
  const [rows] = await pool.execute(`${SQL_BASE} WHERE a.status IN ('pendente', 'enviando') AND a.modulo IN (${marcadores(modulos.length)}) ORDER BY a.data_evento, a.id`, modulos);
  const smsAtivo = await smsHabilitado();
  const itens = [];
  for (const r of rows) {
    const contatos = await contatosDoCliente(r.cliente_tipo, r.cliente_id);
    const disp = canaisDisponiveis(contatos, smsAtivo);
    itens.push({
      ...r,
      cliente_nome: contatos?.nome || '(cliente removido)',
      canais: {
        email:    { disponivel: disp.email,    destino: contatos?.email || null },
        sms:      { disponivel: disp.sms,      destino: disp.sms ? contatos.sms : null },
        whatsapp: { disponivel: disp.whatsapp, destino: contatos?.whatsapp || null },
      },
    });
  }
  return { itens, smsAtivo };
}

async function contarPendentes(modulos) {
  if (!modulos.length) return 0;
  const [[r]] = await pool.execute(`SELECT COUNT(*) AS total FROM avisos_cliente WHERE status = 'pendente' AND modulo IN (${marcadores(modulos.length)})`, modulos);
  return r.total;
}

// Histórico (tudo fica registrado): os últimos avisos já decididos, quem decidiu, quando e como.
async function listarHistorico(modulos, limite = 100) {
  if (!modulos.length) return [];
  const [rows] = await pool.execute(
    `${SQL_BASE} WHERE a.status NOT IN ('pendente', 'enviando') AND a.modulo IN (${marcadores(modulos.length)}) ORDER BY a.decidido_em DESC, a.id DESC LIMIT ${Number(limite) || 100}`, modulos);
  return rows;
}

module.exports = { listarPendentes, contarPendentes, listarHistorico };
