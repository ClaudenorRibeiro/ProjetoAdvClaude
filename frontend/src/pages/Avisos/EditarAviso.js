// Janela para ajustar o assunto e o texto de um aviso antes de enviar.
import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { avisosAPI } from '../../services/api';
import useEscFechar from '../../hooks/useEscFechar';

export default function EditarAviso({ aviso, onFechar, onSalvo, onConflito }) {
  const [assunto, setAssunto] = useState(aviso.assunto);
  const [texto, setTexto] = useState(aviso.texto);
  const [salvando, setSalvando] = useState(false);
  const overlayRef = useEscFechar(onFechar);

  async function salvar() {
    setSalvando(true);
    try {
      await avisosAPI.editar(aviso.id, { assunto, texto });
      toast.success('Aviso atualizado');
      onSalvo();
    } catch (err) {
      const d = err?.response?.data;
      toast.error(d?.mensagem || 'Não foi possível salvar o aviso');
      if (err?.response?.status === 409) onConflito();
    } finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" ref={overlayRef}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-label="Editar aviso" style={{ maxWidth: 560 }}>
        <div className="modal-header"><h3>Editar aviso — {aviso.cliente_nome}</h3></div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label" htmlFor="aviso-assunto">Assunto</label>
            <input id="aviso-assunto" className="form-control" maxLength={200} value={assunto} onChange={e => setAssunto(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="aviso-texto">Mensagem</label>
            <textarea id="aviso-texto" className="form-control" rows={8} maxLength={2000} value={texto} onChange={e => setTexto(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}
