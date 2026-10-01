// ============================================================
// RELATÓRIOS AGENDADOS — o envio. Roda a cada minuto (cron) e também no "Testar agora".
// SEGURANÇA, conferida a CADA envio (nada vale só porque foi aprovado na hora de agendar):
//  * dono ativo e com permissão de criar relatórios; relatório ainda visível para ele
//  * relatório roda com as permissões do DONO (validador completo)
//  * destinatários: só usuários ativos, com e-mail, acesso a Relatórios e ao assunto
//  * 3 falhas seguidas pausam o agendamento (e o dono é avisado); sem repetir infinitamente
//  * o corpo do e-mail NÃO tem dados do relatório; eles só vão no anexo
// ============================================================
const { pool } = require('../../../config/database');
const auditoria = require('../../../middleware/auditoria');
const { enviarEmail } = require('../../../utils/email');
const L = require('../limites');
const { ErroRelatorio } = require('../erros');
const { criarContexto, pode } = require('../visibilidade');
const { validarReceita } = require('../validador');
const modelos = require('../modelos');
const { candidatos } = require('./destinatarios');
const { gerarArquivo } = require('./arquivo');
const { agoraBrasilia, proximaExecucao } = require('./proxima');
const { lerJson, obterDoDono } = require('./agendamentos');

const MAX_POR_RODADA = 20;
const NOME_FORMATO = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel' };
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function corpoEmail(nomeRelatorio, dono, agora, formato) {
  const [dia, hora] = [agora.slice(0, 10).split('-').reverse().join('/'), agora.slice(11, 16)];
  return `<p>Olá,</p><p>Segue em anexo o relatório <strong>${esc(nomeRelatorio)}</strong> (${NOME_FORMATO[formato]}), gerado em ${dia} às ${hora}.</p>`
    + `<p style="color:#666;font-size:12px">Envio automático agendado por ${esc(dono.nome)} no Sistema de Advocacia. `
    + 'Este e-mail contém informações do escritório: não encaminhe a quem não deva recebê-las.</p>';
}

// Prepara tudo (dono, relatório, arquivo e destinatários elegíveis) — lança ErroRelatorio com o motivo se algo não vale mais
async function preparar(ag) {
  const [us] = await pool.execute('SELECT id, nome, nivel, ativo FROM usuarios WHERE id = ?', [ag.dono_id]);
  const dono = us[0];
  if (!dono || !dono.ativo) throw new ErroRelatorio('O usuário que agendou está inativo.');
  const ctx = await criarContexto(dono);
  if (!pode(ctx, 'relatorios.criar', 'cadastrar')) throw new ErroRelatorio('O usuário que agendou não tem mais permissão para relatórios.');
  const modelo = await modelos.obterOuErro(pool, ag.modelo_id, dono.id);
  const { assunto, receita } = await validarReceita(modelo.receita, ctx);
  const ids = lerJson(ag.destinatarios);
  const elegiveis = (await candidatos(pool, modelo.assunto)).filter(c => c.pode && ids.includes(c.id));
  return { dono, ctx, modelo, assunto, receita, elegiveis };
}

async function enviar(ag, { agora, apenasDono = false }) {
  const { dono, ctx, modelo, assunto, receita, elegiveis } = await preparar(ag);
  const destinos = apenasDono ? elegiveis.filter(c => c.id === dono.id) : elegiveis;
  if (!destinos.length) throw new ErroRelatorio(apenasDono ? 'Você não está na lista de destinatários (ou não tem e-mail cadastrado).' : 'Nenhum destinatário pode mais receber este relatório.');
  const arquivo = await gerarArquivo({ formato: ag.formato, assunto, receita, ctx, nomeRelatorio: modelo.nome });
  const nomeArquivo = `${modelo.nome.replace(/[^\p{L}\p{N} _().-]/gu, '').trim().slice(0, 80) || 'Relatório'} - ${agora.slice(0, 10)}.${arquivo.extensao}`;
  const html = corpoEmail(modelo.nome, dono, agora, ag.formato);
  let enviados = 0;
  const falhas = [];
  for (const d of destinos) {
    try {
      await enviarEmail({ para: d.email, assunto: `Relatório: ${modelo.nome}`, html, anexos: [{ filename: nomeArquivo, content: arquivo.buffer, contentType: arquivo.tipo }] });
      enviados++;
    } catch (err) { falhas.push(`${d.nome}: ${err.message}`); }
  }
  if (!enviados) throw new ErroRelatorio(`Nenhum e-mail saiu. ${falhas.join('; ')}`.slice(0, 280));
  return { enviados, falhas, total: destinos.length, dono };
}

function resumoFalha(err) { return String(err instanceof ErroRelatorio ? err.mensagens.join(' ') : `Erro inesperado: ${err.message}`).slice(0, 300); }

async function avisarPausa(ag, motivo) {
  try {
    const [[dono]] = await pool.execute('SELECT nome, email FROM usuarios WHERE id = ? AND ativo = 1', [ag.dono_id]);
    const [[m]] = await pool.execute('SELECT nome FROM relatorio_modelo WHERE id = ?', [ag.modelo_id]);
    if (!dono?.email) return;
    await enviarEmail({ para: dono.email, assunto: 'Envio de relatório pausado',
      html: `<p>O envio agendado do relatório <strong>${esc(m?.nome || '')}</strong> foi <strong>pausado</strong> após ${L.FALHAS_PARA_PAUSAR} falhas seguidas.</p><p>Último motivo: ${esc(motivo)}</p><p>Corrija em Relatórios → Envios agendados e retome o envio.</p>` });
  } catch (err) { console.error('Relatórios agendados: não foi possível avisar o dono da pausa:', err.message); }
}

// Executa UM agendamento já "reservado" e registra o resultado
async function executarUm(ag, agora) {
  try {
    const r = await enviar(ag, { agora });
    const obs = r.falhas.length ? `Enviado a ${r.enviados} de ${r.total}. ${r.falhas.join('; ')}`.slice(0, 300) : null;
    await pool.execute("UPDATE relatorio_agendamento SET ultimo_envio = ?, ultimo_status = 'ok', ultimo_erro = ?, falhas_seguidas = 0 WHERE id = ?", [agora, obs, ag.id]);
    await auditoria.registrar(ag.dono_id, 'relatorio_agendamento', 'enviar', ag.id, null, { destinatarios: r.enviados });
  } catch (err) {
    const motivo = resumoFalha(err);
    if (!(err instanceof ErroRelatorio)) console.error('Relatórios agendados: erro no envio:', err);
    const pausar = Number(ag.falhas_seguidas) + 1 >= L.FALHAS_PARA_PAUSAR;
    await pool.execute(
      `UPDATE relatorio_agendamento SET ultimo_status = 'falha', ultimo_erro = ?, falhas_seguidas = falhas_seguidas + 1,
              ativo = IF(?, 0, ativo), proxima_execucao = IF(?, NULL, proxima_execucao) WHERE id = ?`, [motivo, pausar ? 1 : 0, pausar ? 1 : 0, ag.id]);
    if (pausar) await avisarPausa(ag, motivo);
  }
}

let rodando = false;

// Chamado a cada minuto. "Reserva" cada agendamento vencido com um UPDATE condicional (duas instâncias nunca enviam o mesmo)
async function executarVencidos() {
  if (rodando) return;
  rodando = true;
  try {
    const agora = agoraBrasilia();
    const [vencidos] = await pool.execute('SELECT * FROM relatorio_agendamento WHERE ativo = 1 AND proxima_execucao <= ? ORDER BY proxima_execucao LIMIT ' + MAX_POR_RODADA, [agora]);
    for (const ag of vencidos) {
      const [r] = await pool.execute('UPDATE relatorio_agendamento SET proxima_execucao = ? WHERE id = ? AND ativo = 1 AND proxima_execucao <= ?', [proximaExecucao(ag, agora), ag.id, agora]);
      if (r.affectedRows === 1) await executarUm(ag, agora);   // sem catch-up: se o servidor ficou fora do ar, envia uma vez só
    }
  } catch (err) { console.error('Relatórios agendados: erro na rodada:', err.message); }
  finally { rodando = false; }
}

// "Testar agora": manda só para o próprio dono, sem mexer na programação
async function testar(usuario, id) {
  const ag = await obterDoDono(pool, usuario, id);
  const r = await enviar(ag, { agora: agoraBrasilia(), apenasDono: true });
  await auditoria.registrar(usuario.id, 'relatorio_agendamento', 'enviar', id, null, { teste: true });
  return { enviados: r.enviados };
}

module.exports = { executarVencidos, testar };
