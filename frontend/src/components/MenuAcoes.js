// ============================================================
// MENU "⋮" DE AÇÕES EXTRAS (overflow menu reutilizável)
// ------------------------------------------------------------
// Mantém as ações principais na linha e agrupa as demais neste menu, para as
// tabelas não ficarem poluídas. Uso:
//   <MenuAcoes itens={[
//     { label: 'Gerar documento', icone: '📄', onClick: () => ... },
//     { label: 'Editar',          icone: '✏️', onClick: () => ... },
//     { label: 'Excluir',         icone: '🗑️', onClick: () => ..., perigo: true },
//   ]} />
// Cada item: { label, onClick, icone?(texto/emoji), perigo?(bool → vermelho), oculto?(bool → não aparece) }.
// Itens `oculto` (ex.: sem permissão) somem; se não sobrar nenhum, o botão "⋮" nem aparece.
//
// Observação técnica: o menu usa position:fixed com coordenadas calculadas na
// abertura — assim NÃO é cortado por tabelas com rolagem (overflow). Fecha ao
// clicar fora, ao rolar a página ou ao redimensionar a janela.
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { ModalGerar } from './GerarDocumento';

// Um item pode ser uma ação comum { label, onClick } ou "Gerar documento":
//   { label:'Gerar documento', icone:'📄', gerarDoc:{ ancoraTipo, ancoraId, beneficiario? } }
// Nesse caso o próprio menu abre o ModalGerar (sem precisar de estado na tela).
export default function MenuAcoes({ itens = [], titulo = 'Mais ações' }) {
  const visiveis = itens.filter(it => it && !it.oculto);
  const [pos, setPos] = useState(null); // { top, left } quando aberto; null quando fechado
  const [docCtx, setDocCtx] = useState(null); // { ancoraTipo, ancoraId, beneficiario } ao gerar documento
  const btnRef = useRef(null);

  useEffect(() => {
    if (!pos) return;
    const fechar = () => setPos(null);
    document.addEventListener('mousedown', fechar);
    document.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
    };
  }, [pos]);

  function alternar(e) {
    e.stopPropagation();
    if (pos) { setPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    // Alinha o menu à direita do botão, sem sair da tela pela esquerda.
    setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 200) });
  }

  if (visiveis.length === 0) return null;

  return (
    <>
      <button ref={btnRef} type="button" title={titulo} onClick={alternar}
        style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '5px',
          padding: '4px 9px', cursor: 'pointer', fontSize: '16px', lineHeight: 1, color: '#475569' }}>
        ⋮
      </button>
      {pos && (
        <div onMouseDown={e => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000, width: '200px',
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '6px' }}>
          {visiveis.map((it, i) => (
            <button key={i} type="button"
              onClick={() => { setPos(null); if (it.gerarDoc) { setDocCtx(it.gerarDoc); } else { it.onClick(); } }}
              style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', textAlign: 'left',
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '8px 10px',
                borderRadius: '6px', color: it.perigo ? '#dc2626' : '#334155', whiteSpace: 'nowrap' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              {it.icone && <span aria-hidden="true">{it.icone}</span>}{it.label}
            </button>
          ))}
        </div>
      )}
      {docCtx && (
        <ModalGerar ancoraTipo={docCtx.ancoraTipo} ancoraId={docCtx.ancoraId}
          beneficiario={docCtx.beneficiario} onFechar={() => setDocCtx(null)} />
      )}
    </>
  );
}
