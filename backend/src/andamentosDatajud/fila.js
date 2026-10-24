// ============================================================
// A FILA DA CONSULTA NOTURNA. O cron só entra na fila e volta: a consulta ao CNJ pode durar horas e não pode segurar
// o relógio do cron. Só uma consulta anda por vez (o CNJ recusa pedidos em paralelo) e ela não entra duas vezes na fila.
// Só pode haver UMA cópia do servidor ligada (o `2_deploy_app.sh` usa `instances: 1`).
// ============================================================
const { consultarDataJud } = require('./consultaNoturna');

let cadeia = Promise.resolve();
let naFila = false;

function enfileirarConsultaNoturna(opcoes = {}) {
  if (naFila) return false;
  naFila = true;
  cadeia = cadeia.then(async () => {
    try {
      const r = await consultarDataJud(opcoes);
      if (r !== null && (r.novos > 0 || r.falhas.length > 0)) {
        console.log(`📚 DataJud noturno: ${r.processos} processo(s) consultados, ${r.novos} andamento(s) novo(s), ${r.naoEncontrados} não encontrado(s), ${r.falhas.length} falha(s)`);
        for (const f of r.falhas.slice(0, 5)) console.error(`[andamentos] ${f}`);
      }
    } catch (erro) {
      console.error('Erro na consulta noturna do DataJud:', erro && erro.message);
    } finally {
      naFila = false;
    }
  });
  return true;
}

// Espera a fila esvaziar (para os testes).
const aguardarFila = () => cadeia;

module.exports = { enfileirarConsultaNoturna, aguardarFila };
