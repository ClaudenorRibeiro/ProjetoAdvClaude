// ============================================================
// O RESUMO DA MANHÃ: os andamentos novos do DataJud, um aviso por pessoa (sino e/ou e-mail, como cada uma escolheu), só
// dos processos que cada uma acompanha ("meus" = é a responsável ou está nas OABs do processo; "todos") e, se o
// escritório quis, só dos tipos marcados como importantes. Cada andamento entra num resumo UMA vez só: as novidades são
// reservadas de uma vez (avisado_em) junto com os avisos do sino, na MESMA transação; o e-mail sai depois (melhor esforço,
// fica em log_emails).
// ============================================================
const { pool } = require('../config/database');
const email = require('../utils/email');
const { assuntoDoResumo, mensagemDoSino, htmlDoResumo } = require('./resumoHtml');

// Devolve { andamentos, pessoas } (quantos andamentos foram avisados e para quantas pessoas).
async function enviarResumoDeAndamentos() {
  const aEnviar = [];
  const resultado = { andamentos: 0, pessoas: 0 };
  let nomeEscritorio = '';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [reservaveis] = await conn.execute(
      `SELECT a.id, a.processo_id, a.codigo_movimento AS codigo, DATE_FORMAT(a.data, '%Y-%m-%d') AS data, a.descricao,
              pa.numPasta, p.numProc AS numero, p.NomeTituloProc AS titulo, p.responsavel_id
         FROM andamento_processual a
         JOIN tblproc p ON p.id = a.processo_id
         JOIN tblpasta pa ON pa.id = p.pasta_id
        WHERE a.fonte = 'datajud' AND a.novidade_em IS NOT NULL AND a.avisado_em IS NULL
        ORDER BY a.data DESC, a.id DESC
          FOR UPDATE OF a`
    );
    if (reservaveis.length === 0) { await conn.rollback(); return resultado; }
    // reserva de uma vez: nenhum outro resumo pega os mesmos andamentos
    await conn.execute(
      "UPDATE andamento_processual SET avisado_em = NOW() WHERE fonte = 'datajud' AND novidade_em IS NOT NULL AND avisado_em IS NULL"
    );

    const [cfgRows] = await conn.execute('SELECT nome, datajud_aviso_modo FROM configuracoes_escritorio LIMIT 1');
    nomeEscritorio = (cfgRows[0] && cfgRows[0].nome) || '';
    const soImportantes = !!cfgRows[0] && cfgRows[0].datajud_aviso_modo === 'importantes';
    const importantes = new Set();
    if (soImportantes) {
      const [tipos] = await conn.execute('SELECT codigo FROM datajud_tipos_andamento WHERE importante = 1');
      for (const t of tipos) importantes.add(t.codigo);
    }
    const linhas = reservaveis.filter((l) => !soImportantes || (l.codigo !== null && importantes.has(l.codigo)));

    if (linhas.length > 0) {
      const donos = new Map();
      const dono = (processo, usuario) => {
        if (usuario === null || usuario === undefined) return;
        if (!donos.has(processo)) donos.set(processo, new Set());
        donos.get(processo).add(usuario);
      };
      const ids = [...new Set(linhas.map((l) => l.processo_id))];
      for (const l of linhas) dono(l.processo_id, l.responsavel_id);
      for (let i = 0; i < ids.length; i += 1000) {
        const fatia = ids.slice(i, i + 1000);
        const [oabs] = await conn.execute(
          `SELECT processo_id, usuario_id FROM processo_oabs WHERE usuario_id IS NOT NULL AND processo_id IN (${fatia.map(() => '?').join(',')})`,
          fatia
        );
        for (const o of oabs) dono(o.processo_id, o.usuario_id);
      }

      const [pessoas] = await conn.execute(
        `SELECT id, nome, email, datajud_aviso_canal AS canal, datajud_aviso_escopo AS escopo
           FROM usuarios WHERE ativo = 1 AND datajud_aviso_canal <> 'nenhum' ORDER BY id`
      );
      for (const u of pessoas) {
        const minhas = linhas.filter((l) => u.escopo === 'todos' || (donos.get(l.processo_id) && donos.get(l.processo_id).has(u.id)));
        if (minhas.length === 0) continue;
        const porProcesso = new Map();
        for (const l of minhas) {
          const item = { data: l.data, descricao: l.descricao };
          if (porProcesso.has(l.processo_id)) porProcesso.get(l.processo_id).andamentos.push(item);
          else porProcesso.set(l.processo_id, { processoId: l.processo_id, numPasta: l.numPasta, numero: l.numero, titulo: l.titulo, andamentos: [item] });
        }
        const novidades = [...porProcesso.values()];
        if (u.canal === 'sino' || u.canal === 'ambos') {
          await conn.execute(
            "INSERT INTO notificacoes (usuario_id, mensagem, destino) VALUES (?, ?, 'novidades-processos')",
            [u.id, mensagemDoSino(novidades.length)]
          );
        }
        if ((u.canal === 'email' || u.canal === 'ambos') && u.email && u.email.trim() !== '') {
          aEnviar.push({ email: u.email.trim(), nome: u.nome, novidades });
        }
        resultado.andamentos += minhas.length;
        resultado.pessoas += 1;
      }
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  for (const e of aEnviar) {
    try {
      await email.enviarEmail({
        para: e.email,
        destinatarioNome: e.nome,
        assunto: assuntoDoResumo(e.novidades.length),
        html: htmlDoResumo(e.novidades, nomeEscritorio),
      });
    } catch (erro) {
      console.error(`[andamentos] resumo por e-mail para ${e.email} não saiu:`, erro && erro.message);
    }
  }
  return resultado;
}

module.exports = { enviarResumoDeAndamentos };
