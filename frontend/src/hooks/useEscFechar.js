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
// O parâmetro `ativo` permite ligar/desligar o ESC (padrão: ligado).
// ============================================================
export default function useEscFechar(onFechar, ativo = true) {
  const overlayRef = useRef(null);
  // Guarda sempre a versão mais recente do onFechar sem re-assinar o listener a cada render.
  const fnRef = useRef(onFechar);
  fnRef.current = onFechar;

  useEffect(() => {
    if (!ativo) return undefined;
    function aoTeclar(e) {
      if (e.key !== 'Escape') return;
      const overlays = document.querySelectorAll('.modal-overlay');
      // Só age se ESTA janela for a última (mais acima) do documento.
      if (overlays.length && overlays[overlays.length - 1] === overlayRef.current) {
        fnRef.current();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [ativo]);

  return overlayRef;
}
