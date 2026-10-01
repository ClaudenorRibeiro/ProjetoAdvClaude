// ============================================================
// RELATÓRIOS AGENDADOS — cadastro (criar, listar, alterar, excluir). Só o DONO mexe nos seus agendamentos.
// O relatório roda SEMPRE com as permissões do dono, na hora do envio (conferidas de novo a cada vez).
// ============================================================
const { pool } = require('../../../config/database');
const auditoria = require('../../../middleware/auditoria');
const L = require('../limites');
const { ErroRelatorio } = require('../erros');
const { criarContexto } = require('../visibilidade');
const { validarReceita } = require('../validador');
const modelos = require('../modelos');
const { candidatos } = require('./destinatarios');
const { proximaExecucao } = require('./proxima');

const FREQUENCIAS = ['diaria', 'semanal', 'mensal'];
const FORMATOS = ['pdf', 'docx', 'xlsx'];

const lerJson = v => (typeof v === 'string' ? JSON.parse(v) : v);

// Confere e normaliza o que veio da tela
function validarCampos(b) {
  const erros = [];
  const f = b?.frequencia;
  if (!FREQUENCIAS.includes(f)) erros.push('Escolha a frequência: diária, semanal ou mensal.');
  const diaSemana = f === 'semanal' ? Number(b.dia_semana) : null;
  if (f === 'semanal' && !(Number.isInteger(diaSemana) && diaSemana >= 0 && diaSemana <= 6)) erros.push('Escolha o dia da semana.');
  const diaMes = f === 'mensal' ? Number(b.dia_mes) : null;
  if (f === 'mensal' && !(Number.isInteger(diaMes) && diaMes >= 1 && diaMes <= 31)) erros.push('Escolha o dia do mês (1 a 31).');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b?.hora || ''))) erros.push('Informe o horário no formato HH:MM.');
  if (!FORMATOS.includes(b?.formato)) erros.push('Escolha o formato: PDF, Word ou Excel.');
  const ids = Array.isArray(b?.destinatarios) ? [...new Set(b.destinatarios.map(Number))] : [];
  if (!ids.length || ids.some(n => !Number.isInteger(n) || n <= 0)) erros.push('Escolha pelo menos um destinatário.');
  if (ids.length > L.MAX_DESTINATARIOS) erros.push(`Escolha no máximo ${L.MAX_DESTINATARIOS} destinatários.`);
  if (erros.length) throw new ErroRelatorio(erros, 422);
  return { frequencia: f, dia_semana: diaSemana, dia_mes: diaMes, hora: `${b.hora}:00`, formato: b.formato, destinatarios: ids };
}

// O dono precisa enxergar o relatório e poder rodá-lo AGORA (inclui perguntas sem resposta padrão); destinatários só os elegíveis
async function conferirRelatorioEDestinos(usuario, modeloId, ids) {
  const modelo = await modelos.obterOuErro(pool, modeloId, usuario.id);
  await validarReceita(modelo.receita, await criarContexto(usuario));
  const todos = new Map((await candidatos(pool, modelo.assunto)).map(c => [c.id, c]));
  const recusados = ids.filter(n => !todos.get(n) || !todos.get(n).pode);
  if (recusados.length) {
    const nomes = recusados.map(n => (todos.get(n) ? `${todos.get(n).nome} (${todos.get(n).motivo})` : `#${n} (não é um usuário ativo)`));
    throw new ErroRelatorio(`Estes destinatários não podem receber este relatório: ${nomes.join('; ')}.`, 422);
  }
  return modelo;
}

function paraApi(r, nomes) {
  return {
    id: r.id, modelo_id: r.modelo_id, modelo_nome: r.modelo_nome, frequencia: r.frequencia, dia_semana: r.dia_semana, dia_mes: r.dia_mes,
    hora: String(r.hora).slice(0, 5), formato: r.formato, ativo: !!r.ativo, proxima_execucao: r.proxima_execucao,
    ultimo_envio: r.ultimo_envio, ultimo_status: r.ultimo_status, ultimo_erro: r.ultimo_erro,
    destinatarios: lerJson(r.destinatarios).map(id => ({ id, nome: nomes.get(id) || `#${id}` })),
  };
}

async function listar(usuario, modeloId = null) {
  const [rows] = await pool.execute(
    `SELECT a.*, m.nome AS modelo_nome FROM relatorio_agendamento a JOIN relatorio_modelo m ON m.id = a.modelo_id
      WHERE a.dono_id = ? ${modeloId ? 'AND a.modelo_id = ?' : ''} ORDER BY m.nome, a.id`, modeloId ? [usuario.id, modeloId] : [usuario.id]);
  const [us] = await pool.execute('SELECT id, nome FROM usuarios');
  const nomes = new Map(us.map(u => [u.id, u.nome]));
  return { agendamentos: rows.map(r => paraApi(r, nomes)), limite: L.MAX_AGENDAMENTOS };
}

// Quem pode receber este relatório (sem mostrar e-mails na tela)
async function listarCandidatos(usuario, modeloId) {
  const modelo = await modelos.obterOuErro(pool, modeloId, usuario.id);
  return { candidatos: (await candidatos(pool, modelo.assunto)).map(({ id, nome, pode: ok, motivo }) => ({ id, nome, pode: ok, motivo })) };
}

async function obterDoDono(db, usuario, id) {
  const [rows] = await db.execute('SELECT * FROM relatorio_agendamento WHERE id = ? AND dono_id = ?', [id, usuario.id]);
  if (!rows.length) throw new ErroRelatorio('Agendamento não encontrado.', 404);
  return rows[0];
}

async function criar(usuario, body) {
  const modeloId = Number(body?.modelo_id);
  if (!Number.isInteger(modeloId) || modeloId <= 0) throw new ErroRelatorio('Escolha o relatório.', 422);
  const c = validarCampos(body);
  await conferirRelatorioEDestinos(usuario, modeloId, c.destinatarios);
  const id = await modelos.transacao(async (conn) => {
    await conn.execute('SELECT id FROM usuarios WHERE id = ? FOR UPDATE', [usuario.id]);   // 2 criações simultâneas não furam o limite
    const [[{ total }]] = await conn.execute('SELECT COUNT(*) AS total FROM relatorio_agendamento WHERE dono_id = ?', [usuario.id]);
    if (Number(total) >= L.MAX_AGENDAMENTOS) throw new ErroRelatorio(`Você já tem ${total} de ${L.MAX_AGENDAMENTOS} envios agendados. Exclua um para criar outro.`, 409);
    const [r] = await conn.execute(
      `INSERT INTO relatorio_agendamento (modelo_id, dono_id, frequencia, dia_semana, dia_mes, hora, formato, destinatarios, proxima_execucao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [modeloId, usuario.id, c.frequencia, c.dia_semana, c.dia_mes, c.hora, c.formato, JSON.stringify(c.destinatarios), proximaExecucao(c)]);
    await auditoria.registrar(usuario.id, 'relatorio_agendamento', 'criar', r.insertId, null, { modelo_id: modeloId, ...c }, conn);
    return r.insertId;
  });
  return (await listar(usuario)).agendamentos.find(a => a.id === id);
}

// body: os mesmos campos da criação (o relatório não muda) e, opcionalmente, ativo (pausar/retomar)
async function atualizar(usuario, id, body) {
  const atual = await obterDoDono(pool, usuario, id);
  const c = validarCampos({ ...atual, hora: String(atual.hora).slice(0, 5), destinatarios: lerJson(atual.destinatarios), ...body });
  const ativo = body?.ativo === undefined ? !!atual.ativo : body.ativo === true;
  if (ativo) await conferirRelatorioEDestinos(usuario, atual.modelo_id, c.destinatarios);
  await modelos.transacao(async (conn) => {
    await conn.execute(
      `UPDATE relatorio_agendamento SET frequencia = ?, dia_semana = ?, dia_mes = ?, hora = ?, formato = ?, destinatarios = ?, ativo = ?,
              proxima_execucao = ?, falhas_seguidas = IF(? = 1, 0, falhas_seguidas), alterado_em = NOW() WHERE id = ? AND dono_id = ?`,
      [c.frequencia, c.dia_semana, c.dia_mes, c.hora, c.formato, JSON.stringify(c.destinatarios), ativo ? 1 : 0,
        ativo ? proximaExecucao(c) : null, ativo ? 1 : 0, id, usuario.id]);
    await auditoria.registrar(usuario.id, 'relatorio_agendamento', 'editar', id, null, { ...c, ativo }, conn);
  });
  return (await listar(usuario)).agendamentos.find(a => a.id === id);
}

async function excluir(usuario, id) {
  await obterDoDono(pool, usuario, id);
  await modelos.transacao(async (conn) => {
    await conn.execute('DELETE FROM relatorio_agendamento WHERE id = ? AND dono_id = ?', [id, usuario.id]);
    await auditoria.registrar(usuario.id, 'relatorio_agendamento', 'excluir', id, null, null, conn);
  });
}

module.exports = { listar, listarCandidatos, criar, atualizar, excluir, obterDoDono, validarCampos, lerJson };
