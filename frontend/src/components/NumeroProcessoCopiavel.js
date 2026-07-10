// ============================================================
// NÚMERO DO PROCESSO CLICÁVEL — componente compartilhado.
// Passa o mouse: mostra "Copiar?"; clica: copia o número para a
// área de transferência (Ctrl+V em outro lugar) e o balãozinho
// vira "Copiado!!" por ~1,5s. Usado na tela da pasta e na janela
// de processos por pessoa.
// ============================================================
import React, { useState } from 'react';

export default function NumeroProcessoCopiavel({ numero }) {
  const [copiado, setCopiado] = useState(false);
  const [hover, setHover]     = useState(false);

  // Sem número: mostra só o traço, sem interação
  if (!numero) return <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>—</span>;

  function copiar() {
    // navigator.clipboard funciona em localhost e em HTTPS (produção)
    navigator.clipboard?.writeText(numero)
      .then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500); // volta ao normal depois de 1,5s
      })
      .catch(() => {});
  }

  const mostrarBalao = hover || copiado;
  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span
        onClick={copiar}
        style={{ fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer',
                 borderBottom: '1px dotted #94a3b8' }}
      >
        {numero}
      </span>
      {mostrarBalao && (
        <span style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: '4px', whiteSpace: 'nowrap',
          background: copiado ? '#16a34a' : '#334155', color: '#fff',
          fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px',
          zIndex: 20, pointerEvents: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
        }}>
          {copiado ? 'Copiado!!' : 'Copiar?'}
        </span>
      )}
    </span>
  );
}
