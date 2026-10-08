// Avisos aos clientes — tudo o que lê e grava na tabela avisos_cliente.
// A regra de ouro: "reservar" é uma troca de situação feita pelo banco numa única instrução (pendente -> enviando).
// Só uma pessoa (ou o envio automático) consegue; quem chegar depois recebe "já foi decidido". Assim nenhum aviso sai duas vezes.
const { pool } = require('../config/database');
const { COLUNA_REF } = require('./constantes');

const CHAVE = `modulo = ? AND referencia_id = ? AND data_evento = ? AND tipo = ? AND cliente_tipo = ? AND cliente_id = ?`;

// Cria o aviso se ainda não existir (a chave única do banco impede repetir). Devolve { id, novo, status }.
async function inserir(exec, a) {
  const coluna = COLUNA_REF[a.modulo];
  const [r] = await exec.execute(
    `INSERT IGNORE INTO avisos_cliente
       (modulo, tipo, ${coluna}, cliente_tipo, cliente_id, processo_id, data_evento, data_aviso, assunto, texto)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [a.modulo, a.tipo, a.referenciaId, a.clienteTipo, a.clienteId, a.processoId || null, a.dataEvento, a.dataAviso, String(a.assunto).slice(0, 200), a.texto]
  );
  if (r.affectedRows === 1) return { id: r.insertId, novo: true, status: 'pendente' };
  const [[ja]] = await exec.execute(`SELECT id, status FROM avisos_cliente WHERE ${CHAVE}`, [a.modulo, a.referenciaId, a.dataEvento, a.tipo, a.clienteTipo, a.clienteId]);
  return { id: ja.id, novo: false, status: ja.status };
}

// Quando o texto do evento mudou (hora, local...) e ninguém editou na tela, mantém o aviso pendente em dia.
async function atualizarSeNaoEditado(id, { assunto, texto, dataAviso }) {
  await pool.execute(
    `UPDATE avisos_cliente SET assunto = ?, texto = ?, data_aviso = ?
      WHERE id = ? AND status = 'pendente' AND texto_editado = 0 AND (assunto <> ? OR texto <> ? OR data_aviso <> ?)`,
    [String(assunto).slice(0, 200), texto, dataAviso, id, String(assunto).slice(0, 200), texto, dataAviso]
  );
}

async function buscar(id, exec = pool) {
  const [rows] = await exec.execute(
    `SELECT a.*, u.nome AS decidido_por_nome FROM avisos_cliente a LEFT JOIN usuarios u ON u.id = a.decidido_por WHERE a.id = ?`, [id]);
  return rows[0] || null;
}

// Tenta ficar com o aviso. true = conseguiu (e ninguém mais consegue); false = alguém decidiu antes.
async function reservar(id, usuarioId) {
  const [r] = await pool.execute(
    `UPDATE avisos_cliente SET status = 'enviando', decidido_por = ?, decidido_em = NOW(), motivo_status = NULL WHERE id = ? AND status = 'pendente'`,
    [usuarioId || null, id]
  );
  return r.affectedRows === 1;
}

// Deu errado: devolve para a lista, com o motivo.
async function liberar(id, motivo) {
  await pool.execute(
    `UPDATE avisos_cliente SET status = 'pendente', decidido_por = NULL, decidido_em = NULL, motivo_status = ? WHERE id = ? AND status = 'enviando'`,
    [motivo ? String(motivo).slice(0, 300) : null, id]
  );
}

// Fecha o aviso: status enviado/descartado, e como foi decidido (tela | automatico | manual).
async function finalizar(id, { status, modo, motivo }) {
  await pool.execute(
    `UPDATE avisos_cliente SET status = ?, modo = ?, motivo_status = ?, decidido_em = NOW() WHERE id = ? AND status = 'enviando'`,
    [status, modo, motivo ? String(motivo).slice(0, 300) : null, id]
  );
}

async function gravarTexto(id, assunto, texto) {
  const [r] = await pool.execute(
    `UPDATE avisos_cliente SET assunto = ?, texto = ?, texto_editado = 1 WHERE id = ? AND status IN ('pendente', 'enviando')`,
    [String(assunto).slice(0, 200), texto, id]
  );
  return r.affectedRows === 1;
}

// Faxina diária: reservas esquecidas (servidor caiu no meio do envio) voltam para a lista; avisos de eventos que já passaram expiram.
async function liberarPresos() {
  await pool.execute(
    `UPDATE avisos_cliente SET status = 'pendente', decidido_por = NULL, decidido_em = NULL, motivo_status = 'O envio foi interrompido; o aviso voltou para a lista'
      WHERE status = 'enviando' AND decidido_em < DATE_SUB(NOW(), INTERVAL 10 MINUTE)`);
}
async function expirarPassados(hoje) {
  await pool.execute(
    `UPDATE avisos_cliente SET status = 'expirado', modo = 'automatico', motivo_status = 'A data do evento já passou', decidido_em = NOW()
      WHERE status = 'pendente' AND data_evento < ?`, [hoje]);
}

// Pendentes de um módulo cujo evento mudou ou deixou de valer (remarcado, cancelado, status diferente): o aviso antigo é cancelado.
async function cancelarObsoletos(modulo, { tabela, statusValidos }) {
  const coluna = COLUNA_REF[modulo];
  const lista = statusValidos.map(s => `'${s}'`).join(', ');
  await pool.execute(
    `UPDATE avisos_cliente av JOIN ${tabela} x ON x.id = av.${coluna}
        SET av.status = 'cancelado', av.modo = 'automatico', av.motivo_status = 'O evento foi alterado ou cancelado; este aviso não vale mais', av.decidido_em = NOW()
      WHERE av.modulo = ? AND av.status = 'pendente' AND av.tipo IN ('lembrete', 'agendada', 'remarcada')
        AND (x.status NOT IN (${lista}) OR x.data IS NULL OR x.data <> av.data_evento)`, [modulo]);
}

module.exports = { inserir, atualizarSeNaoEditado, buscar, reservar, liberar, finalizar, gravarTexto, liberarPresos, expirarPassados, cancelarObsoletos };
