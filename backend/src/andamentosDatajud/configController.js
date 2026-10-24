// ============================================================
// CONFIGURAÇÃO DO AVISO DIÁRIO DE ANDAMENTOS (Configurações > Integrações > Andamentos automáticos, só administrador):
// o modo do resumo (todos os andamentos novos ou só os tipos marcados como importantes), o horário, a lista de tipos
// de andamento e, por pessoa, o canal (nenhum, sino, e-mail, ambos) e de quais processos recebe (os meus, todos).
// ============================================================
const { pool } = require('../config/database');
const { sucesso, erro, erroInterno } = require('../utils/response');
const auditoria = require('../middleware/auditoria');

const CANAIS = ['nenhum', 'sino', 'email', 'ambos'];
const ESCOPOS = ['meus', 'todos'];
const MODOS = ['todos', 'importantes'];
const CAMPOS = ['modo', 'horario', 'tipos_importantes', 'usuarios'];

async function lerConfiguracao(exec = pool) {
  const [cfg] = await exec.execute('SELECT datajud_aviso_modo AS modo, datajud_aviso_horario AS horario FROM configuracoes_escritorio LIMIT 1');
  const [tipos] = await exec.execute(
    'SELECT codigo, nome, importante, novo, quantidade FROM datajud_tipos_andamento ORDER BY quantidade DESC, nome'
  );
  const [usuarios] = await exec.execute(
    `SELECT id, nome, login, email, datajud_aviso_canal AS canal, datajud_aviso_escopo AS escopo
       FROM usuarios WHERE ativo = 1 ORDER BY nome`
  );
  return {
    modo: (cfg[0] && cfg[0].modo) || 'todos',
    horario: (cfg[0] && cfg[0].horario) || '07:30',
    tipos: tipos.map((t) => ({ ...t, importante: t.importante === 1, novo: t.novo === 1 })),
    usuarios,
  };
}

// Confere o corpo inteiro ANTES de gravar. Devolve { erro } ou { dados }.
function lerCorpo(corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return { erro: 'Nada para alterar.' };
  const desconhecidos = Object.keys(corpo).filter((k) => !CAMPOS.includes(k));
  if (desconhecidos.length) return { erro: `Campo não reconhecido: ${desconhecidos[0]}` };
  const dados = {};
  if (corpo.modo !== undefined) {
    if (!MODOS.includes(corpo.modo)) return { erro: 'Modo inválido' };
    dados.modo = corpo.modo;
  }
  if (corpo.horario !== undefined) {
    const h = typeof corpo.horario === 'string' ? corpo.horario.trim() : '';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(h)) return { erro: 'Horário inválido (use HH:MM)' };
    dados.horario = h;
  }
  if (corpo.tipos_importantes !== undefined) {
    const t = corpo.tipos_importantes;
    if (!Array.isArray(t) || t.length > 5000 || t.some((c) => !Number.isInteger(c))) return { erro: 'Lista de tipos inválida' };
    dados.tipos_importantes = [...new Set(t)];
  }
  if (corpo.usuarios !== undefined) {
    const u = corpo.usuarios;
    if (!Array.isArray(u) || u.length > 2000) return { erro: 'Lista de pessoas inválida' };
    for (const p of u) {
      if (!p || typeof p !== 'object' || !Number.isInteger(p.id) || p.id <= 0) return { erro: 'Pessoa inválida' };
      if (!CANAIS.includes(p.canal)) return { erro: 'Canal inválido' };
      if (!ESCOPOS.includes(p.escopo)) return { erro: 'Escopo inválido' };
    }
    dados.usuarios = u;
  }
  if (Object.keys(dados).length === 0) return { erro: 'Nada para alterar.' };
  return { dados };
}

// GET /api/configuracoes/datajud-avisos
async function buscar(req, res) {
  try { return sucesso(res, await lerConfiguracao()); } catch (err) { return erroInterno(res, err); }
}

// PUT /api/configuracoes/datajud-avisos — tudo ou nada, numa transação.
async function salvar(req, res) {
  const lido = lerCorpo(req.body);
  if (lido.erro) return erro(res, lido.erro);
  const dados = lido.dados;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (dados.tipos_importantes !== undefined) {
      const [todos] = await conn.execute('SELECT codigo FROM datajud_tipos_andamento');
      const existentes = new Set(todos.map((t) => t.codigo));
      if (dados.tipos_importantes.some((c) => !existentes.has(c))) {
        await conn.rollback();
        return erro(res, 'Há um tipo de andamento que não existe na lista.');
      }
      // a lista toda foi vista: o que estava marcado como "novo" deixa de ser
      const marcados = [...dados.tipos_importantes, -1];
      await conn.execute(
        `UPDATE datajud_tipos_andamento SET importante = IF(codigo IN (${marcados.map(() => '?').join(',')}), 1, 0), novo = 0`,
        marcados
      );
    }
    if (dados.modo !== undefined) await conn.execute('UPDATE configuracoes_escritorio SET datajud_aviso_modo = ?', [dados.modo]);
    if (dados.horario !== undefined) await conn.execute('UPDATE configuracoes_escritorio SET datajud_aviso_horario = ?', [dados.horario]);
    const [fim] = await conn.execute('SELECT id, datajud_aviso_modo AS modo FROM configuracoes_escritorio LIMIT 1');
    if (fim[0] && fim[0].modo === 'importantes') {
      const [n] = await conn.execute('SELECT COUNT(*) AS n FROM datajud_tipos_andamento WHERE importante = 1');
      if (Number(n[0].n) === 0) {
        await conn.rollback();
        return erro(res, 'Marque ao menos um tipo de andamento como importante ou escolha avisar todos os andamentos.');
      }
    }
    for (const p of dados.usuarios || []) {
      const [alvo] = await conn.execute('SELECT email, ativo FROM usuarios WHERE id = ?', [p.id]);
      if (!alvo.length || alvo[0].ativo !== 1) { await conn.rollback(); return erro(res, 'Usuário não encontrado', 404); }
      if ((p.canal === 'email' || p.canal === 'ambos') && !String(alvo[0].email || '').trim()) {
        await conn.rollback();
        return erro(res, 'Para receber por e-mail, a pessoa precisa ter um e-mail cadastrado.');
      }
      await conn.execute('UPDATE usuarios SET datajud_aviso_canal = ?, datajud_aviso_escopo = ? WHERE id = ?', [p.canal, p.escopo, p.id]);
    }
    await auditoria.registrar(req.usuario.id, 'configuracoes_escritorio', 'datajud_avisos', fim[0] ? fim[0].id : null, null, null, conn,
      `campos: ${Object.keys(dados).join(', ')}`);
    await conn.commit();
    return sucesso(res, await lerConfiguracao(), 'Configuração salva');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
  }
}

module.exports = { buscar, salvar };
