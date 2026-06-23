// ============================================================
// MODAL DE CONFIRMAÇÃO — Substitui window.confirm em todo o sistema
// Nunca usar window.confirm/alert/prompt — sempre este componente
//
// Uso básico:
//   const [confirmar, setConfirmar] = useState(null);
//
//   // Disparar:
//   setConfirmar({
//     titulo:    'Excluir Prazo',
//     mensagem:  'Este prazo será removido permanentemente.',
//     textoBotao: 'Excluir',
//     acao: async () => { await api.excluir(id); carregar(); }
//   });
//
//   // Renderizar (no return do componente):
//   {confirmar && (
//     <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />
//   )}
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';

// tipo: 'perigo' (vermelho) | 'aviso' (amarelo) | 'sucesso' (verde) | 'info' (azul)
export default function ModalConfirmar({
  titulo       = 'Confirmar ação',
  mensagem,
  textoBotao   = 'Confirmar',
  tipo         = 'perigo',
  acao,
  onCancelar,
}) {
  const [executando, setExecutando] = useState(false);
  const btnCancelarRef = useRef(null);

  // Foca o botão Cancelar ao abrir — evita confirmação acidental por Enter
  useEffect(() => {
    btnCancelarRef.current?.focus();
  }, []);

  // Fecha ao pressionar Escape
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onCancelar();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancelar]);

  async function handleConfirmar() {
    setExecutando(true);
    try {
      await acao();
      onCancelar();            // sucesso: fecha o modal
    } catch (err) {
      // Em vez de fechar em silêncio, mostra o MOTIVO da falha (mensagem do backend)
      // e mantém o modal aberto para o usuário ler e poder tentar de novo.
      // Obs.: chamadores que já tratam o próprio erro dentro de `acao` (sem relançar)
      // não caem aqui — portanto não há toast duplicado.
      const msg = err?.response?.data?.mensagem
        || 'Não foi possível concluir a ação. Tente novamente.';
      toast.error(msg);
    } finally {
      setExecutando(false);
    }
  }

  // Cores e ícones por tipo
  const CONFIG = {
    perigo:  { icone: '🗑️', corBotao: '#dc2626', corHover: '#b91c1c', corFaixa: '#fef2f2', corIcone: '#dc2626' },
    aviso:   { icone: '⚠️', corBotao: '#d97706', corHover: '#b45309', corFaixa: '#fffbeb', corIcone: '#d97706' },
    sucesso: { icone: '✅', corBotao: '#16a34a', corHover: '#15803d', corFaixa: '#f0fdf4', corIcone: '#16a34a' },
    info:    { icone: 'ℹ️', corBotao: '#1a56db', corHover: '#1e40af', corFaixa: '#eff6ff', corIcone: '#1a56db' },
  };
  const cfg = CONFIG[tipo] || CONFIG.perigo;

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onCancelar(); }}
    >
      <div className="modal-box" style={{
        maxWidth: '420px',
        padding: 0,
        overflow: 'hidden',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>

        {/* Faixa superior colorida com ícone */}
        <div style={{
          background: cfg.corFaixa,
          padding: '28px 28px 20px',
          textAlign: 'center',
          borderBottom: `3px solid ${cfg.corBotao}`,
        }}>
          <div style={{ fontSize: '48px', lineHeight: 1, marginBottom: '12px' }}>
            {cfg.icone}
          </div>
          <h3 style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 700,
            color: '#111827',
            fontFamily: 'Arial, sans-serif',
          }}>
            {titulo}
          </h3>
        </div>

        {/* Mensagem */}
        <div style={{
          padding: '20px 28px 8px',
          textAlign: 'center',
          background: '#fff',
        }}>
          <p style={{
            margin: 0,
            fontSize: '14px',
            color: '#374151',
            lineHeight: '1.6',
            fontFamily: 'Arial, sans-serif',
          }}>
            {mensagem}
          </p>
        </div>

        {/* Botões */}
        <div style={{
          display: 'flex',
          gap: '12px',
          padding: '20px 28px 24px',
          background: '#fff',
          justifyContent: 'center',
        }}>
          <button
            ref={btnCancelarRef}
            onClick={onCancelar}
            disabled={executando}
            style={{
              flex: 1,
              padding: '10px 20px',
              borderRadius: '7px',
              border: '1.5px solid #d1d5db',
              background: '#fff',
              color: '#374151',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'Arial, sans-serif',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
          >
            Cancelar
          </button>

          <button
            onClick={handleConfirmar}
            disabled={executando}
            style={{
              flex: 1,
              padding: '10px 20px',
              borderRadius: '7px',
              border: 'none',
              background: cfg.corBotao,
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: executando ? 'not-allowed' : 'pointer',
              fontFamily: 'Arial, sans-serif',
              opacity: executando ? 0.7 : 1,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!executando) e.currentTarget.style.background = cfg.corHover; }}
            onMouseLeave={e => { if (!executando) e.currentTarget.style.background = cfg.corBotao; }}
          >
            {executando ? 'Aguarde...' : textoBotao}
          </button>
        </div>
      </div>
    </div>
  );
}
