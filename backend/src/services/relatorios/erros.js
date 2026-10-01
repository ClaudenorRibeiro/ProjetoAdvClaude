// ============================================================
// RELATÓRIOS — erro "esperado" (receita inválida, sem permissão, limite...)
// O controller responde com o status e as mensagens; qualquer outro erro vira 500.
// ============================================================
class ErroRelatorio extends Error {
  constructor(mensagens, status = 422) {
    const lista = Array.isArray(mensagens) ? mensagens : [mensagens];
    super(lista[0]);
    this.name = 'ErroRelatorio';
    this.mensagens = lista;
    this.status = status;
  }
}
module.exports = { ErroRelatorio };
