// ============================================================
// MODAL INFORMATIVO — popup pequeno com um único botão ("Entendi")
// Para avisos/validações que o usuário só precisa LER e fechar.
// (Diferente do ModalConfirmar, que pede confirmação de uma ação.)
//
// Uso:
//   const [info, setInfo] = useState(null);
//
//   // Disparar:
//   setInfo({ titulo: 'Título obrigatório', mensagem: 'Informe o título da tarefa.' });
//
//   // Renderizar (acima do modal atual — usar zIndex se estiver dentro de outro modal):
//   {info && <ModalInfo {...info} onFechar={() => setInfo(null)} />}
// ============================================================

import React, { useEffect, useRef } from 'react';

// tipo: 'aviso' (amarelo) | 'info' (azul) | 'sucesso' (verde) | 'perigo' (vermelho)
export default function ModalInfo({
  titulo     = 'Aviso',
  mensagem,
  textoBotao = 'Entendi',
  tipo       = 'aviso',
  onFechar,
}) {
  const btnRef = useRef(null);

  // Foca o botão ao abrir (Enter fecha) e fecha no Escape
  useEffect(() => { btnRef.current?.focus(); }, []);
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onFechar(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onFechar]);

  const CONFIG = {
    perigo:  { icone: '🗑️', cor: '#dc2626', corHover: '#b91c1c', corFaixa: '#fef2f2' },
    aviso:   { icone: '⚠️', cor: '#d97706', corHover: '#b45309', corFaixa: '#fffbeb' },
    sucesso: { icone: '✅', cor: '#16a34a', corHover: '#15803d', corFaixa: '#f0fdf4' },
    info:    { icone: 'ℹ️', cor: '#1a56db', corHover: '#1e40af', corFaixa: '#eff6ff' },
  };
  const cfg = CONFIG[tipo] || CONFIG.aviso;

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal-box" style={{
        maxWidth: '420px', padding: 0, overflow: 'hidden',
        borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Faixa superior colorida com ícone */}
        <div style={{
          background: cfg.corFaixa, padding: '28px 28px 20px',
          textAlign: 'center', borderBottom: `3px solid ${cfg.cor}`,
        }}>
          <div style={{ fontSize: '48px', lineHeight: 1, marginBottom: '12px' }}>{cfg.icone}</div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827', fontFamily: 'Arial, sans-serif' }}>
            {titulo}
          </h3>
        </div>

        {/* Mensagem */}
        <div style={{ padding: '20px 28px 8px', textAlign: 'center', background: '#fff' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#374151', lineHeight: '1.6', fontFamily: 'Arial, sans-serif' }}>
            {mensagem}
          </p>
        </div>

        {/* Botão único */}
        <div style={{ display: 'flex', padding: '20px 28px 24px', background: '#fff', justifyContent: 'center' }}>
          <button
            ref={btnRef}
            onClick={onFechar}
            style={{
              minWidth: '140px', padding: '10px 20px', borderRadius: '7px', border: 'none',
              background: cfg.cor, color: '#fff', fontSize: '14px', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'Arial, sans-serif', transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = cfg.corHover}
            onMouseLeave={e => e.currentTarget.style.background = cfg.cor}
          >
            {textoBotao}
          </button>
        </div>
      </div>
    </div>
  );
}
