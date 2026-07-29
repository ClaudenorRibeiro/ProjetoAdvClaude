// ============================================================
// LOG DE COMUNICAÇÃO — grava em log_comunicacoes "quem enviou, por qual canal,
// para quem". Usado ao enviar e-mail (avulso ou com documento) e ao abrir WhatsApp.
// É best-effort: qualquer falha aqui NUNCA derruba a operação principal (só loga no console).
// A tabela log_comunicacoes já existe (nenhum ALTER necessário).
// ============================================================

const { pool } = require('../config/database');

// Registra uma linha em log_comunicacoes.
// Campos: canal ('email'|'whatsapp'), destinatario (e-mail/telefone/nome — obrigatório no schema),
//   assunto, conteudo, enviado (1/0), erro, tipo_pessoa ('fisica'|'juridica'), pessoa_id,
//   processo_id (precisa ser um tblproc válido ou null — tem FK), usuario_id (usuário logado).
async function registrarComunicacao({
  canal, destinatario, assunto = null, conteudo = null, enviado = 1, erro = null,
  tipo_pessoa = null, pessoa_id = null, processo_id = null, usuario_id = null,
}) {
  try {
    await pool.execute(
      `INSERT INTO log_comunicacoes
         (canal, destinatario, assunto, conteudo, enviado, erro_msg, tipo_pessoa, pessoa_id, processo_id, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        canal || null,
        String(destinatario || '').slice(0, 200),
        assunto ? String(assunto).slice(0, 200) : null,
        conteudo || null,
        enviado ? 1 : 0,
        erro || null,
        tipo_pessoa || null,
        pessoa_id || null,
        processo_id || null,
        usuario_id || null,
      ]
    );
  } catch (e) {
    console.error('Erro ao gravar log_comunicacoes:', e.message);
  }
}

module.exports = { registrarComunicacao };
