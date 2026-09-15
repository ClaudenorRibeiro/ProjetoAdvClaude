// ============================================================
// NÚMERO DO PROCESSO CLICÁVEL — componente compartilhado.
// Sem ação de abertura, clicar copia o número. Com onAbrir, clicar abre o
// processo e o balão exibido ao passar o mouse permite copiá-lo. O balão vira
// "Copiado!!" por ~1,5s. Usado na tela da pasta e em listas do sistema.
// ============================================================
import React, { useEffect, useRef, useState } from 'react';

export default function NumeroProcessoCopiavel({ numero, onAbrir, href }) {
  const [copiado, setCopiado] = useState(false);
  const [falhou, setFalhou]   = useState(false);
  const [hover, setHover]     = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Sem número: mostra só o traço, sem interação
  if (!numero) return <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>—</span>;

  async function copiar() {
    try {
      let copiou = false;
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        try { await navigator.clipboard.writeText(numero); copiou = true; } catch { /* tenta o método compatível abaixo */ }
      }
      if (!copiou) {
        const campo = document.createElement('textarea');
        campo.value = numero;
        campo.setAttribute('readonly', '');
        campo.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
        document.body.appendChild(campo);
        campo.select();
        copiou = document.execCommand('copy');
        document.body.removeChild(campo);
      }
      if (!copiou) throw new Error('Não foi possível copiar');
      clearTimeout(timerRef.current); setFalhou(false); setCopiado(true);
      timerRef.current = setTimeout(() => setCopiado(false), 1500);
    } catch {
      clearTimeout(timerRef.current); setCopiado(false); setFalhou(true);
      timerRef.current = setTimeout(() => setFalhou(false), 2200);
    }
  }

  function acionarNumero(event) {
    if (!onAbrir) { copiar(); return; }
    // Ctrl/clique, roda, Shift etc. precisam manter o comportamento nativo do
    // link, para que o navegador possa abrir uma nova guia ou janela.
    if (event?.ctrlKey || event?.metaKey || event?.shiftKey || event?.altKey || event?.button === 1) return;
    event?.preventDefault();
    onAbrir();
  }

  const mostrarBalao = hover || copiado || falhou;
  const abreProcesso = Boolean(onAbrir || href);
  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {href ? (
        <a href={href} onClick={onAbrir ? acionarNumero : undefined}
          style={{ fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer',
            color: '#2563eb', textDecoration: 'underline' }}>
          {numero}
        </a>
      ) : (
        <span
          onClick={acionarNumero}
          style={{ fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer',
                   color: abreProcesso ? '#2563eb' : undefined,
                   textDecoration: abreProcesso ? 'underline' : undefined,
                   borderBottom: abreProcesso ? undefined : '1px dotted #94a3b8' }}
        >
          {numero}
        </span>
      )}
      {abreProcesso && <button type="button" onClick={(event) => { event.stopPropagation(); copiar(); }}
        aria-label={`Copiar número ${numero}`} title="Copiar número"
        style={{ marginLeft:'5px', border:0, background:'transparent', padding:0, color:'#475569', cursor:'pointer', fontSize:'13px', lineHeight:1 }}>⧉</button>}
      {mostrarBalao && (
        <span style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: '4px', whiteSpace: 'nowrap',
          background: copiado ? '#16a34a' : '#334155', color: '#fff',
          fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px',
          zIndex: 20, pointerEvents: onAbrir ? 'none' : 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
          border: 0, cursor: 'default'
        }}>
          {falhou ? 'Não foi possível copiar' : copiado ? 'Copiado!' : abreProcesso ? 'Use o ícone para copiar' : 'Copiar'}
        </span>
      )}
    </span>
  );
}
