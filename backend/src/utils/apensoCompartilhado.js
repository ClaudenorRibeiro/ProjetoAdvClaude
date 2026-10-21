// APENSO EM VÁRIAS PASTAS — O MESMO NÚMERO TEM AS MESMAS INFORMAÇÕES (pedido do usuário, 21/10/2026).
// O apenso é UM processo (ex.: a recuperação judicial) que aparece como uma linha em cada pasta de cliente credor. O que identifica
// o processo no tribunal fica IGUAL em todas as pastas onde o número aparece: vara (e, por ela, o fórum), tipo, instância, assuntos,
// data de distribuição e número de protocolo. As PARTES (autores e réus), observações, status, responsável, cliente do escritório e o
// vínculo com o principal continuam livres em cada pasta (o réu, por exemplo, costuma mudar de pasta para pasta).
// Mudar um desses campos num apenso que está em outras pastas PEDE CONFIRMAÇÃO (409 CONFIRMAR_ALTERACAO_EM_OUTRAS_PASTAS, com as pastas
// e os campos) e, confirmado, grava o mesmo valor em todas. Dados antigos que já estejam diferentes entre pastas NÃO são mexidos: só
// os campos que a pessoa MUDOU são levados às outras pastas (decisão do usuário: "opção A").
const auditoria = require('../middleware/auditoria');
const { conferirRepetidos } = require('./apensoProcesso');

const CAMPOS = [
  { chave: 'vara_id',           rotulo: 'vara e fórum' },
  { chave: 'tipo_id',           rotulo: 'tipo' },
  { chave: 'instancia_id',      rotulo: 'instância' },
  { chave: 'assuntos',          rotulo: 'assuntos' },
  { chave: 'data_distribuicao', rotulo: 'data de distribuição' },
  { chave: 'protocolo',         rotulo: 'número de protocolo' },
];
const CODIGO_CONFIRMAR = 'CONFIRMAR_ALTERACAO_EM_OUTRAS_PASTAS';

const idOuNulo = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

// Deixa os valores no mesmo formato para comparar (o que vem da tela e o que vem do banco).
function normalizar(v) {
  const assuntos = [...new Set((Array.isArray(v.assuntos) ? v.assuntos : []).map(Number).filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  const texto = (x) => { const t = x === undefined || x === null ? '' : String(x).trim(); return t || null; };
  return {
    vara_id: idOuNulo(v.vara_id), tipo_id: idOuNulo(v.tipo_id), instancia_id: idOuNulo(v.instancia_id),
    data_distribuicao: texto(v.data_distribuicao) ? String(v.data_distribuicao).slice(0, 10) : null,
    protocolo: texto(v.protocolo), assuntos,
  };
}
const igual = (chave, a, b) => (chave === 'assuntos' ? a.assuntos.join(',') === b.assuntos.join(',') : a[chave] === b[chave]);

async function assuntosDe(conn, processoId) {
  const [rows] = await conn.execute('SELECT assunto_id FROM processo_assunto WHERE processo_id = ?', [processoId]);
  return rows.map(r => r.assunto_id);
}

// Os valores compartilhados de um processo que já está no banco.
async function lerCompartilhados(conn, processoId) {
  const [[p]] = await conn.execute(
    'SELECT vara_id, tipo_id, instancia_id, data_distribuicao, protocolo FROM tblproc WHERE id = ?', [processoId]);
  return normalizar({ ...p, assuntos: await assuntosDe(conn, processoId) });
}

// Os OUTROS apensos ativos com o mesmo número (da mais recente alteração para a mais antiga). Trava as linhas.
async function irmaosDoApenso(conn, numProc, ignorarId = null) {
  if (!numProc) return [];
  const [rows] = await conn.execute(
    `SELECT p.id, p.pasta_id, pa.numPasta FROM tblproc p JOIN tblpasta pa ON pa.id = p.pasta_id
      WHERE p.numProc = ? AND p.ativo = 1 AND p.apenso_de_id IS NOT NULL${ignorarId !== null ? ' AND p.id <> ?' : ''}
      ORDER BY COALESCE(p.alterado_em, p.criado_em) DESC, p.id DESC FOR UPDATE`,
    ignorarId !== null ? [numProc, ignorarId] : [numProc]);
  for (const r of rows) r.compartilhados = await lerCompartilhados(conn, r.id);
  return rows;
}

// O que mudaria nas outras pastas. `antigos` = valores do próprio processo antes da edição (mesmo número); sem eles (cadastro novo ou
// número trocado) a comparação é com a linha mais recente desse número. Devolve null quando nada precisa mudar nas outras pastas.
async function prepararPropagacao(conn, { numProc, ignorarId = null, novos, antigos = null }) {
  const irmaos = await irmaosDoApenso(conn, numProc, ignorarId);
  if (!irmaos.length) return null;
  const valores = normalizar(novos);
  const base = antigos || irmaos[0].compartilhados;
  // assuntos que a tela não mandou (undefined) = não estão sendo mudados
  const campos = CAMPOS.filter(c => !(c.chave === 'assuntos' && novos.assuntos === undefined) && !igual(c.chave, valores, base));
  const afetados = irmaos.filter(i => campos.some(c => !igual(c.chave, valores, i.compartilhados)));
  return campos.length && afetados.length ? { campos, afetados, valores } : null;
}

// Resposta de aviso (409) com as pastas e os campos.
function avisoDaPropagacao(prep) {
  const pastas = prep.afetados.map(a => ({ id: a.pasta_id, numPasta: a.numPasta }));
  const listaPastas = pastas.map(p => String(p.numPasta).padStart(4, '0')).join(', ');
  const listaCampos = prep.campos.map(c => c.rotulo).join(', ');
  return {
    status: 409,
    mensagem: `Este apenso também está ${pastas.length > 1 ? 'nas pastas' : 'na pasta'} ${listaPastas}. `
      + `Alterar ${listaCampos} vai alterar também ${pastas.length > 1 ? 'esses processos' : 'esse processo'}, porque o mesmo número de apenso tem sempre as mesmas informações.`,
    detalhes: { codigo: CODIGO_CONFIRMAR, pastas, campos: prep.campos.map(c => c.rotulo) },
  };
}

// Grava nas outras pastas só os campos que mudaram. Devolve { erro } (protocolo que já existe na outra pasta) ou {}.
async function aplicarPropagacao(conn, prep, usuarioId) {
  const colunas = prep.campos.filter(c => c.chave !== 'assuntos').map(c => c.chave);
  const mudaAssuntos = prep.campos.some(c => c.chave === 'assuntos');
  for (const i of prep.afetados) {
    if (colunas.includes('protocolo') && prep.valores.protocolo) {
      const repetido = await conferirRepetidos(conn, null, prep.valores.protocolo, { ignorarId: i.id, ficha: 'edicao', apensoNaPasta: i.pasta_id });
      if (repetido) return { erro: `Não foi possível igualar o apenso na pasta ${String(i.numPasta).padStart(4, '0')}: ${repetido}` };
    }
    if (colunas.length) {
      await conn.execute(
        `UPDATE tblproc SET ${colunas.map(c => `${c} = ?`).join(', ')}, alterado_por = ?, alterado_em = NOW() WHERE id = ?`,
        [...colunas.map(c => prep.valores[c]), usuarioId, i.id]);
    }
    if (mudaAssuntos) {
      await conn.execute('DELETE FROM processo_assunto WHERE processo_id = ?', [i.id]);
      for (const a of prep.valores.assuntos) {
        await conn.execute('INSERT INTO processo_assunto (processo_id, assunto_id, criado_por) VALUES (?, ?, ?)', [i.id, a, usuarioId]);
      }
    }
    await auditoria.registrar(usuarioId, 'tblproc', 'editar', i.id,
      { ...i.compartilhados, origem: 'igualado_com_apenso_de_outra_pasta' }, null, conn);
  }
  return {};
}

// Para a tela do "Novo Apenso": o que já se sabe desse número (null se não existe em nenhuma pasta).
async function dadosDoApensoPorNumero(conn, numProc) {
  const numero = String(numProc || '').trim();
  if (!numero) return null;
  const irmaos = await irmaosDoApenso(conn, numero);
  if (!irmaos.length) return null;
  const ref = irmaos[0];
  const [varas] = await conn.execute('SELECT forum_id FROM tblvara WHERE id = ?', [ref.compartilhados.vara_id || 0]);
  const [autores] = await conn.execute(
    `SELECT ta.tipo_pessoa, ta.pessoa_id,
            CASE ta.tipo_pessoa WHEN 'fisica' THEN (SELECT pf.nome FROM pessoas_fisicas pf WHERE pf.id = ta.pessoa_id)
                                WHEN 'juridica' THEN (SELECT pj.razao_social FROM pessoas_juridicas pj WHERE pj.id = ta.pessoa_id) END AS nome
       FROM tbltituloprocautor ta WHERE ta.proc_id = ?`, [ref.id]);
  return {
    ...ref.compartilhados, forum_id: varas[0]?.forum_id || null, autores,
    pastas: irmaos.map(i => ({ id: i.pasta_id, numPasta: i.numPasta })),
  };
}

module.exports = { CODIGO_CONFIRMAR, lerCompartilhados, prepararPropagacao, avisoDaPropagacao, aplicarPropagacao, dadosDoApensoPorNumero };
