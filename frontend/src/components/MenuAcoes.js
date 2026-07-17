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

import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { ModalGerar } from './GerarDocumento';

// Um item pode ser uma ação comum { label, onClick } ou "Gerar documento":
//   { label:'Gerar documento', icone:'📄', gerarDoc:{ ancoraTipo, ancoraId, beneficiario? } }
// Nesse caso o próprio menu abre o ModalGerar (sem precisar de estado na tela).
export default function MenuAcoes({ itens = [], titulo = 'Mais ações' }) {
  const visiveis = itens.filter(it => it && !it.oculto);
  const [pos, setPos] = useState(null); // { top, left } quando aberto; null quando fechado
  const [docCtx, setDocCtx] = useState(null); // { ancoraTipo, ancoraId, beneficiario } ao gerar documento
  const [hover, setHover] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

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
    // Posição inicial: abaixo do botão, alinhado à direita (sem sair pela esquerda).
    // O useLayoutEffect abaixo corrige o lado (cima/baixo) antes de a tela pintar.
    setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 200) });
  }

  // Depois de abrir, mede a ALTURA REAL do menu e decide o lado:
  // - cabe para baixo  -> abre para baixo (comportamento normal);
  // - não cabe embaixo mas cabe em cima -> abre para cima;
  // - apertado dos dois lados (tela baixa) -> usa o lado com mais espaço e
  //   encosta na borda, sem cortar.
  // Roda ANTES da tela pintar (useLayoutEffect), então não há "piscada".
  useLayoutEffect(() => {
    if (!pos || pos.pronto || !menuRef.current || !btnRef.current) return;
    const alturaMenu = menuRef.current.getBoundingClientRect().height;
    const rb = btnRef.current.getBoundingClientRect();
    const margem = 8;
    const espacoAbaixo = window.innerHeight - rb.bottom - margem;
    const espacoAcima = rb.top - margem;
    let top;
    if (alturaMenu <= espacoAbaixo) {
      top = rb.bottom + 4;                          // cabe embaixo
    } else if (alturaMenu <= espacoAcima) {
      top = rb.top - alturaMenu - 4;                // não coube embaixo: abre para cima
    } else if (espacoAbaixo >= espacoAcima) {
      top = rb.bottom + 4;                          // não cabe em nenhum: usa o lado maior
    } else {
      top = Math.max(margem, rb.top - alturaMenu - 4);
    }
    setPos(p => ({ ...p, top, pronto: true }));
  }, [pos]);

  if (visiveis.length === 0) return null;

  // Realce sob o mouse; segue realçado enquanto o menu está aberto
  const realce = hover || !!pos;

  return (
    <>
      <button ref={btnRef} type="button" title={titulo} onClick={alternar}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ background: realce ? '#e2e8f0' : '#fff',
          border: `1px solid ${realce ? '#94a3b8' : '#cbd5e1'}`, borderRadius: '5px',
          padding: '4px 9px', cursor: 'pointer', fontSize: '16px', lineHeight: 1,
          color: realce ? '#1e293b' : '#475569',
          transition: 'background-color 0.15s, border-color 0.15s, color 0.15s' }}>
        ⋮
      </button>
      {pos && (
        <div ref={menuRef} onMouseDown={e => e.stopPropagation()}
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
