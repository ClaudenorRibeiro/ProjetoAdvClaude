// ============================================================
// MODAL "GOOGLE AGENDA" — cada usuário liga/desliga o envio dos seus
// eventos da agenda para o Google Agenda dele e informa o e-mail do Google.
// Self-service (só o próprio usuário). Avisos em faixa interna (nunca toast).
// Fase 1: vale para COMPROMISSOS criados. Demais tipos entram nas próximas fases.
// ============================================================

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import useEscFechar from '../hooks/useEscFechar';

export default function ModalGoogleAgenda({ onFechar }) {
  const { usuario, atualizarGoogleAgenda } = useAuth();
  const [ativo, setAtivo]   = useState(!!usuario?.google_agenda_ativo);
  const [email, setEmail]   = useState(usuario?.google_agenda_email || '');
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso]   = useState('');
  const overlayRef = useEscFechar(onFechar);

  async function salvar() {
    const emailLimpo = email.trim().toLowerCase();
    // Mesmas validações do backend, mostradas na faixa interna antes de enviar.
    if (ativo && !emailLimpo) {
      setAviso('Informe o e-mail do seu Google para ativar o envio para a agenda.');
      return;
    }
    if (emailLimpo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
      setAviso('E-mail do Google inválido. Confira o endereço digitado.');
      return;
    }
    setSalvando(true);
    setAviso('');
    try {
      const resp = await authAPI.salvarGoogleAgenda({ ativo, email: emailLimpo });
      if (resp.data.ok) {
        atualizarGoogleAgenda({ ativo, email: emailLimpo || null });
        onFechar();
      } else {
        setAviso(resp.data.mensagem || 'Não foi possível salvar. Tente novamente.');
      }
    } catch (err) {
      setAviso(err.response?.data?.mensagem || 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" ref={overlayRef}
      onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal-box" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <h3>📅 Google Agenda</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {aviso && (
            <div style={{ background: '#fff4e5', border: '1px solid #ffcf99', color: '#8a5300',
              padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>
              {aviso}
            </div>
          )}

          <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 14px' }}>
            Ao ativar, os seus compromissos da agenda são enviados para o seu Google Agenda
            (por convite no seu Gmail). Vale só para os seus eventos, criados a partir de agora.
          </p>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>
              Enviar meus compromissos para o Google Agenda
            </span>
          </label>

          <div className="form-group">
            <label className="form-label">E-mail do Google</label>
            <input className="form-control" type="email" value={email}
              placeholder="seuemail@gmail.com"
              onChange={e => setEmail(e.target.value)} />
          </div>

          <p style={{ color: '#9ca3af', fontSize: 12, margin: '10px 0 0' }}>
            Dica: se o evento não aparecer sozinho na sua agenda, abra o convite no Gmail e clique em “Sim”.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
