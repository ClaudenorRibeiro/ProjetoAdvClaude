// ============================================================
// SERVIÇO DE COMUNICADO AO CLIENTE (Perícias)
// Envia e-mail ao cliente do processo (autor ou réu, conforme tblproc.cliente_polo).
// NÃO envia nada ao perito. Registra em log_comunicacoes.
//
// ESTRUTURA PREPARADA PARA O FUTURO: hoje o conteúdo é um texto simples montado
// em montarComunicadoPericia(). Quando os modelos de documento entrarem, basta
// trocar essa função para gerar o conteúdo (e o PDF) a partir do modelo cadastrado.
// ============================================================

const { pool } = require('../config/database');
const { enviarEmail } = require('../utils/email');
const variaveisResolver = require('./variaveisResolver');

function escaparHtml(valor) {
  return String(valor || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]);
}

// Aceita qualquer variável do mesmo catálogo usado em "Gerar documento" (cliente,
// processo, parte adversa, perícia, escritório...). Variável sem valor ou que não
// existe no catálogo vira string vazia — nunca quebra o envio nem sobra "{{tag}}".
function preencherModeloPerito(texto, dados) {
  return String(texto || '').replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, chave) => {
    const valor = dados ? dados[String(chave).toLowerCase()] : undefined;
    if (valor == null || typeof valor === 'object') return '';
    return escaparHtml(valor);
  });
}

// Busca os clientes do processo (autor OU réu, conforme cliente_polo) com e-mail principal.
// Retorna { polo, clientes: [{ tipo_pessoa, pessoa_id, nome, email }] }
async function buscarClientesDoProcesso(processoId) {
  const [proc] = await pool.execute('SELECT cliente_polo FROM tblproc WHERE id = ?', [processoId]);
  if (!proc.length || !proc[0].cliente_polo) return { polo: null, clientes: [] };

  const polo   = proc[0].cliente_polo;
  const tabela = polo === 'reu' ? 'tbltituloprocreu' : 'tbltituloprocautor';

  const [partes] = await pool.execute(
    `SELECT tipo_pessoa, pessoa_id FROM ${tabela} WHERE proc_id = ?`, [processoId]
  );

  const clientes = [];
  for (const p of partes) {
    let nome = null, email = null;
    if (p.tipo_pessoa === 'fisica') {
      const [pf] = await pool.execute('SELECT nome FROM pessoas_fisicas WHERE id = ?', [p.pessoa_id]);
      nome = pf.length ? pf[0].nome : null;
      const [em] = await pool.execute(
        'SELECT email FROM emails_pf WHERE pessoa_id = ? AND ativo = 1 ORDER BY principal DESC, id ASC LIMIT 1',
        [p.pessoa_id]
      );
      email = em.length ? em[0].email : null;
    } else {
      const [pj] = await pool.execute('SELECT razao_social FROM pessoas_juridicas WHERE id = ?', [p.pessoa_id]);
      nome = pj.length ? pj[0].razao_social : null;
      const [em] = await pool.execute(
        'SELECT email FROM emails_pj WHERE pessoa_id = ? AND ativo = 1 ORDER BY principal DESC, id ASC LIMIT 1',
        [p.pessoa_id]
      );
      email = em.length ? em[0].email : null;
    }
    clientes.push({ tipo_pessoa: p.tipo_pessoa, pessoa_id: p.pessoa_id, nome, email });
  }
  return { polo, clientes };
}

// Monta o conteúdo do comunicado. tipoEvento: 'agendada' | 'remarcada' | 'cancelada'
// (no futuro, substituir por geração a partir de um modelo de documento + PDF)
function montarComunicadoPericia(tipoEvento, pe, nomeCliente, escritorio) {
  const dataFmt = pe.data ? String(pe.data).slice(0, 10).split('-').reverse().join('/') : '';
  const horaFmt = pe.hora ? String(pe.hora).slice(0, 5) : '';
  const endereco = [
    pe.logradouro, pe.numero, pe.complemento, pe.bairro,
    [pe.cidade, pe.estado].filter(Boolean).join('-')
  ].filter(Boolean).join(', ');
  const local = pe.local ? `${pe.local}${endereco ? ' — ' + endereco : ''}` : endereco;

  let titulo, intro, cor;
  if (tipoEvento === 'cancelada') {
    titulo = 'Perícia CANCELADA';
    intro  = 'Informamos que a perícia que estava agendada foi <strong>cancelada</strong>.';
    cor    = '#dc2626';
  } else if (tipoEvento === 'remarcada') {
    titulo = 'Perícia REMARCADA';
    intro  = 'Informamos que sua perícia foi <strong>remarcada</strong> para a data abaixo.';
    cor    = '#1a56db';
  } else {
    titulo = 'Comunicado de Perícia';
    intro  = 'Informamos que foi <strong>agendada uma perícia</strong> referente ao seu processo.';
    cor    = '#1a56db';
  }

  const assunto = `${titulo}${pe.processo_numero ? ' — Proc. ' + pe.processo_numero : ''}`;
  const detalhes = tipoEvento === 'cancelada' ? '' : `
      <table style="width:100%;border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:6px;background:#f3f4f6;font-weight:bold;width:35%">Processo</td><td style="padding:6px">${escaparHtml(pe.processo_numero || '—')}</td></tr>
        <tr><td style="padding:6px;background:#f3f4f6;font-weight:bold">Tipo</td><td style="padding:6px">${escaparHtml(pe.tipo_nome || 'Perícia')}</td></tr>
        <tr><td style="padding:6px;background:#f3f4f6;font-weight:bold">Data</td><td style="padding:6px">${dataFmt}${horaFmt ? ' às ' + horaFmt : ''}</td></tr>
        <tr><td style="padding:6px;background:#f3f4f6;font-weight:bold">Local</td><td style="padding:6px">${escaparHtml(local || '—')}</td></tr>
        ${pe.perito_nome ? `<tr><td style="padding:6px;background:#f3f4f6;font-weight:bold">Perito</td><td style="padding:6px">${escaparHtml(pe.perito_nome)}</td></tr>` : ''}
      </table>
      <p>Por favor, compareça no dia e horário indicados. Em caso de dúvidas, entre em contato com o escritório.</p>`;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <div style="background:${cor};padding:18px;text-align:center">
      <h2 style="color:#fff;margin:0;font-size:18px">${escaparHtml(escritorio || 'Escritório de Advocacia')}</h2>
    </div>
    <div style="padding:24px;color:#333">
      <p>Prezado(a) <strong>${escaparHtml(nomeCliente || 'cliente')}</strong>,</p>
      <p>${intro}</p>
      ${detalhes}
      <p style="margin-top:20px;color:#888;font-size:12px">Mensagem automática enviada por ${escaparHtml(escritorio || 'seu escritório de advocacia')}.</p>
    </div>
  </div>`;

  return { assunto, html };
}

// Envia o comunicado ao(s) cliente(s) do processo da perícia.
// Best-effort: registra cada tentativa em log_comunicacoes; marca comunicado_enviado
// se ao menos 1 e-mail saiu (exceto no cancelamento, que não muda esse flag).
// Retorna { enviados, semCliente, semEmail, polo }
async function enviarComunicadoPericia(periciaId, tipoEvento, usuarioId) {
  // Dados da perícia + nomes legíveis (tipo, perito, número do processo)
  const [rows] = await pool.execute(`
    SELECT pe.*, tp.nome AS tipo_nome,
      CASE WHEN pe.perito_tipo='fisica' THEN pf.nome
           WHEN pe.perito_tipo='juridica' THEN pj.razao_social END AS perito_nome,
      pr.numProc AS processo_numero
    FROM pericia pe
    LEFT JOIN tipo_pericia tp ON pe.tipo_pericia_id = tp.id
    LEFT JOIN pessoas_fisicas pf ON pe.perito_tipo='fisica' AND pe.perito_id=pf.id
    LEFT JOIN pessoas_juridicas pj ON pe.perito_tipo='juridica' AND pe.perito_id=pj.id
    LEFT JOIN tblproc pr ON pe.processo_id = pr.id
    WHERE pe.id = ?`, [periciaId]);
  if (!rows.length) return { enviados: 0, semCliente: true, semEmail: false, polo: null };
  const pe = rows[0];

  const [cfg] = await pool.execute('SELECT nome FROM configuracoes_escritorio LIMIT 1');
  const escritorio = cfg.length ? cfg[0].nome : 'Escritório de Advocacia';

  const { polo, clientes } = await buscarClientesDoProcesso(pe.processo_id);
  if (!polo || clientes.length === 0) {
    return { enviados: 0, semCliente: true, semEmail: false, polo };
  }

  let enviados = 0, semEmailCount = 0;
  for (const c of clientes) {
    if (!c.email) { semEmailCount++; continue; }
    const { assunto, html } = montarComunicadoPericia(tipoEvento, pe, c.nome, escritorio);
    let ok = false, erroMsg = null;
    try {
      await enviarEmail({ para: c.email, assunto, html });
      ok = true; enviados++;
    } catch (err) {
      erroMsg = err.message;
    }
    // Registro de negócio (sempre, mesmo em falha)
    try {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute(
          `INSERT INTO log_comunicacoes
             (canal, destinatario, assunto, conteudo, enviado, erro_msg, tipo_pessoa, pessoa_id, processo_id, usuario_id)
           VALUES ('email', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.email, assunto, html, ok ? 1 : 0, erroMsg, c.tipo_pessoa, c.pessoa_id, pe.processo_id, usuarioId || null]
        );
        await conn.commit();
      } catch (err) { await conn.rollback(); throw err; }
      finally { conn.release(); }
    } catch (e) {
      console.error('Erro ao gravar log_comunicacoes:', e.message);
    }
  }

  // Marca o comunicado como enviado (agendamento/remarcação). Cancelamento não altera o flag.
  if (enviados > 0 && tipoEvento !== 'cancelada') {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE pericia SET comunicado_enviado = 1 WHERE id = ?', [periciaId]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
  }

  return { enviados, semCliente: false, semEmail: semEmailCount > 0, polo };
}

// Dispara o modelo escolhido para o perito indicado na perícia. É chamado depois
// do commit da ATA: falha de SMTP é registrada, mas nunca desfaz a ATA já salva.
async function enviarEmailPeritoPericia(periciaId, modeloId, usuarioId) {
  const [rows] = await pool.execute(`
    SELECT pe.id, pe.processo_id, pf.id AS perito_id, pf.nome AS perito_nome, tp.nome AS tipo_nome,
           pr.numProc AS processo_numero,
           (SELECT email FROM emails_pf WHERE pessoa_id = pf.id AND ativo = 1 ORDER BY principal DESC, id ASC LIMIT 1) AS perito_email
      FROM pericia pe
      JOIN pessoas_fisicas pf ON pe.perito_tipo = 'fisica' AND pe.perito_id = pf.id
      LEFT JOIN tipo_pericia tp ON tp.id = pe.tipo_pericia_id
      JOIN tblproc pr ON pr.id = pe.processo_id
     WHERE pe.id = ?`, [periciaId]);
  const pericia = rows[0];
  if (!pericia || !pericia.perito_email) return { enviado: false, semEmail: true };

  const [cfgRows] = await pool.execute('SELECT nome, modelos_email_perito FROM configuracoes_escritorio LIMIT 1');
  const cfg = cfgRows[0] || {};
  let modelos = [];
  try { modelos = Array.isArray(cfg.modelos_email_perito) ? cfg.modelos_email_perito : JSON.parse(cfg.modelos_email_perito || '[]'); } catch (_) { modelos = []; }
  const modelo = modelos.find(m => String(m.id) === String(modeloId));
  if (!modelo || !modelo.assunto || !modelo.corpo) return { enviado: false, semModelo: true };

  // Mesmo catálogo de variáveis do "Gerar documento" (cliente, processo, parte
  // adversa, perícia, escritório...), reaproveitado aqui em vez de duplicado.
  const [usuarioRows] = await pool.execute('SELECT id, nome FROM usuarios WHERE id = ?', [usuarioId]);
  const ctx = await variaveisResolver.resolver('pericia', periciaId, usuarioRows[0] || null, {});
  const valores = { ...(ctx?.dados || {}) };
  // Compatibilidade com modelos salvos antes desta mudança (nomes antigos das 4 variáveis).
  if (!valores.nome_perito) valores.nome_perito = valores.perito || pericia.perito_nome || '';
  if (!valores.escritorio)  valores.escritorio  = valores.nome_escritorio || cfg.nome || '';
  if (!valores.processo)    valores.processo    = valores.numero_processo || pericia.processo_numero || '';
  if (!valores.tipo_pericia) valores.tipo_pericia = pericia.tipo_nome || '';

  const assunto = preencherModeloPerito(modelo.assunto, valores);
  const corpo = preencherModeloPerito(modelo.corpo, valores).replace(/\n/g, '<br>');
  const html = `<div style="font-family:Arial,sans-serif;color:#333;line-height:1.5">${corpo}</div>`;
  let enviado = false, erroMsg = null;
  try { await enviarEmail({ para: pericia.perito_email, assunto, html, destinatarioNome: pericia.perito_nome, mensagem: modelo.corpo }); enviado = true; }
  catch (err) { erroMsg = err.message; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(`INSERT INTO log_comunicacoes
        (canal, destinatario, assunto, conteudo, enviado, erro_msg, tipo_pessoa, pessoa_id, processo_id, usuario_id)
        VALUES ('email', ?, ?, ?, ?, ?, 'fisica', ?, ?, ?)`,
        [pericia.perito_email, assunto, html, enviado ? 1 : 0, erroMsg, pericia.perito_id, pericia.processo_id, usuarioId || null]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
  } catch (e) { console.error('Erro ao registrar e-mail do perito:', e.message); }
  if (enviado) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE pericia SET email_perito_enviado = 1 WHERE id = ?', [periciaId]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
  }
  return { enviado, semEmail: false, semModelo: false };
}

module.exports = { enviarComunicadoPericia, enviarEmailPeritoPericia, buscarClientesDoProcesso, montarComunicadoPericia };
