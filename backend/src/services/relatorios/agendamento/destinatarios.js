// ============================================================
// RELATÓRIOS AGENDADOS — quem PODE receber. Regra de segurança do envio automático:
// só usuários ATIVOS do sistema, com e-mail, com acesso a Relatórios e ao assunto do relatório
// (nunca um endereço digitado livremente). Conferido de novo a CADA envio.
// ============================================================
const { criarContexto, pode } = require('../visibilidade');
const { obterAssunto, assuntoPermitido } = require('../catalogo');

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Todos os usuários ativos, cada um com "pode" e o motivo quando não pode (o dono entra na lista também)
async function candidatos(db, assuntoChave) {
  const [rows] = await db.execute('SELECT id, nome, nivel, email FROM usuarios WHERE ativo = 1 ORDER BY nome');
  const assunto = obterAssunto(assuntoChave);
  const saida = [];
  for (const u of rows) {
    const ctx = await criarContexto(u);
    let motivo = null;
    if (!u.email || !EMAIL_OK.test(String(u.email).trim())) motivo = 'não tem e-mail cadastrado';
    else if (!pode(ctx, 'relatorios', 'visualizar')) motivo = 'não tem acesso a Relatórios';
    else if (!assunto || !assuntoPermitido(ctx, assunto)) motivo = `não tem acesso a ${assunto ? assunto.rotulo : 'este assunto'}`;
    saida.push({ id: u.id, nome: u.nome, email: motivo ? null : String(u.email).trim(), pode: !motivo, motivo });
  }
  return saida;
}

module.exports = { candidatos };
