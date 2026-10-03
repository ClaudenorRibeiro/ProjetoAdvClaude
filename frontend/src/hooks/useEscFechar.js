import { useEffect, useRef } from 'react';

// ============================================================
// useEscFechar — fecha uma janela (modal) com a tecla ESC, mas SOMENTE
// quando ela é a janela mais ACIMA. Assim, com duas janelas empilhadas,
// o ESC fecha apenas a de cima — nunca as duas de uma vez.
//
// A "mais acima" é a última `.modal-overlay` presente no documento (todos
// os modais do sistema usam essa classe no elemento externo).
//
// Uso:
//   const overlayRef = useEscFechar(() => onFechar(false));
//   return <div className="modal-overlay" ref={overlayRef}> ... </div>;
//
// Se o foco está num campo com lista aberta (react-select com `aria-expanded="true"`, ou dentro de uma lista marcada
// com `data-esc-lista-aberta`), o ESC fica só para fechar a LISTA — a janela não fecha (senão perde o que foi digitado).
// Por isso o ouvinte roda na fase de captura: olha o estado ANTES de o campo fechar a própria lista.
//
// O parâmetro `ativo` permite ligar/desligar o ESC (padrão: ligado).
// ============================================================
// true quando o ESC foi apertado com o foco num campo de lista aberta: nesse caso o ESC é só da lista.
export function escEhDeListaAberta(e) {
  return e.target instanceof Element && Boolean(e.target.closest('[aria-expanded="true"], [data-esc-lista-aberta]'));
}

export default function useEscFechar(onFechar, ativo = true) {
  const overlayRef = useRef(null);
  // Guarda sempre a versão mais recente do onFechar sem re-assinar o listener a cada render.
  const fnRef = useRef(onFechar);
  fnRef.current = onFechar;

  useEffect(() => {
    if (!ativo) return undefined;
    function aoTeclar(e) {
      if (e.key !== 'Escape') return;
      if (escEhDeListaAberta(e)) return;
      const overlays = document.querySelectorAll('.modal-overlay');
      // Só age se ESTA janela for a última (mais acima) do documento.
      if (overlays.length && overlays[overlays.length - 1] === overlayRef.current) {
        fnRef.current();
      }
    }
    document.addEventListener('keydown', aoTeclar, true);
    return () => document.removeEventListener('keydown', aoTeclar, true);
  }, [ativo]);

  return overlayRef;
}
