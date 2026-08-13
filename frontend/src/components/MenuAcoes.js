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
  const [sub, setSub] = useState(null); // { idx, top, left } do submenu aberto (item com .submenu)
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  // Fecha o submenu sempre que o menu principal fecha.
  useEffect(() => { if (!pos) setSub(null); }, [pos]);

  // Abre o submenu de um item ao LADO do seu botão. Vira para a esquerda se não
  // couber à direita (borda da tela) e sobe se estourar embaixo. Funciona no
  // hover (PC) e no clique/toque (celular/tablet), pois é chamado por ambos.
  function abrirSub(idx, el, qtd) {
    const r = el.getBoundingClientRect();
    const largura = 210;
    let left = r.right - 2;
    if (left + largura > window.innerWidth - 8) left = r.left - largura + 2;
    if (left < 8) left = 8;
    const estAltura = qtd * 36 + 12;
    let top = Math.min(r.top, window.innerHeight - estAltura - 8);
    top = Math.max(8, top);
    setSub({ idx, top, left });
  }

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
          {visiveis.map((it, i) => {
            // Item com SUBMENU (ex.: "Etiquetas"): abre um painel ao lado.
            if (it.submenu) {
              const subVis = it.submenu.filter(s => s && !s.oculto);
              if (subVis.length === 0) return null;
              const aberto = sub && sub.idx === i;
              return (
                <div key={i} onMouseLeave={() => setSub(null)}>
                  <button type="button"
                    onMouseEnter={e => abrirSub(i, e.currentTarget, subVis.length)}
                    onClick={e => { e.stopPropagation(); abrirSub(i, e.currentTarget, subVis.length); }}
                    style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', textAlign: 'left',
                      background: aberto ? '#dbeafe' : 'none', border: 'none', cursor: 'pointer', fontSize: '13px',
                      padding: '8px 10px', borderRadius: '6px', color: '#334155', whiteSpace: 'nowrap' }}>
                    {it.icone && <span aria-hidden="true">{it.icone}</span>}
                    <span style={{ flex: 1 }}>{it.label}</span>
                    <span aria-hidden="true" style={{ color: '#94a3b8' }}>▸</span>
                  </button>
                  {aberto && (
                    <div onMouseDown={e => e.stopPropagation()}
                      style={{ position: 'fixed', top: sub.top, left: sub.left, zIndex: 1001, width: '210px',
                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '6px' }}>
                      {subVis.map((s, j) => (
                        <button key={j} type="button"
                          onClick={() => { setPos(null); s.onClick(); }}
                          style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', textAlign: 'left',
                            background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '8px 10px',
                            borderRadius: '6px', color: s.perigo ? '#dc2626' : '#334155', whiteSpace: 'nowrap' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#dbeafe')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          {s.icone && <span aria-hidden="true">{s.icone}</span>}{s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            // Item normal (comportamento original).
            return (
              <button key={i} type="button"
                onClick={() => { setPos(null); if (it.gerarDoc) { setDocCtx(it.gerarDoc); } else { it.onClick(); } }}
                onMouseEnter={e => { setSub(null); e.currentTarget.style.background = '#dbeafe'; }}
                style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', textAlign: 'left',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '8px 10px',
                  borderRadius: '6px', color: it.perigo ? '#dc2626' : '#334155', whiteSpace: 'nowrap' }}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                {it.icone && <span aria-hidden="true">{it.icone}</span>}{it.label}
              </button>
            );
          })}
        </div>
      )}
      {docCtx && (
        <ModalGerar ancoraTipo={docCtx.ancoraTipo} ancoraId={docCtx.ancoraId}
          beneficiario={docCtx.beneficiario} onFechar={() => setDocCtx(null)} />
      )}
    </>
  );
}
