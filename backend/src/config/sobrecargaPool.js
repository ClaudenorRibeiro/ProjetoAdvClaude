// ============================================================
// DETECTOR DE SOBRECARGA DO BANCO (aviso de capacidade na tela, só para admin)
// Antes o aviso acendia na PRIMEIRA vez que uma consulta esperava a vez no pool de conexões —
// o que acontece por alguns milissegundos sempre que duas pessoas abrem o Dashboard juntas
// (alarme falso: tudo terminava em ~20 ms e o aviso ficava ligado por 3 minutos).
// Agora a fila do pool é olhada a cada segundo e só conta como sobrecarga quando ela está
// NÃO VAZIA em várias olhadas SEGUIDAS, isto é, quando há gente esperando conexão por vários
// segundos de verdade.
// ============================================================

function criarDetectorSobrecarga({
  lerFila,                      // () => número de pedidos esperando conexão (ou null se não der para ler)
  agora = Date.now,
  intervaloMs = 1000,           // de quanto em quanto tempo olha a fila
  amostrasSeguidas = 3,         // olhadas seguidas com fila (≈ 2 a 3 segundos de espera contínua)
  janelaMs = 3 * 60 * 1000,     // depois de detectada, o aviso fica ligado por este tempo
} = {}) {
  let seguidas = 0;
  let ultimaSobrecargaEm = 0;   // 0 = nunca houve

  function amostrar() {
    const fila = lerFila();
    seguidas = fila > 0 ? seguidas + 1 : 0;
    if (seguidas >= amostrasSeguidas) ultimaSobrecargaEm = agora();
  }

  function sobrecarregado() {
    return ultimaSobrecargaEm > 0 && (agora() - ultimaSobrecargaEm) < janelaMs;
  }

  function iniciar() {
    const timer = setInterval(amostrar, intervaloMs);
    timer.unref();              // não impede o servidor/teste de encerrar
    return timer;
  }

  return { amostrar, sobrecarregado, iniciar };
}

module.exports = { criarDetectorSobrecarga };
