// ============================================================
// RELATÓRIOS — janela para dar nome (e descrição) ao relatório ao salvar
// ============================================================
import React, { useState } from 'react';
import useEscFechar from '../../../hooks/useEscFechar';

export default function ModalSalvar({ nomeInicial = '', descricaoInicial = '', editando = false, salvando, onSalvar, onCancelar }) {
  const [nome, setNome] = useState(nomeInicial);
  const [descricao, setDescricao] = useState(descricaoInicial || '');
  const overlayRef = useEscFechar(onCancelar);

  return (
    <div className="modal-overlay" ref={overlayRef}>
      <div className="modal-box modal-pequeno" role="dialog" aria-label="Salvar relatório">
        <div className="modal-header">
          <h3>{editando ? 'Salvar alterações' : 'Salvar relatório'}</h3>
          <button className="modal-fechar" onClick={onCancelar}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label" htmlFor="relatorio-nome">Nome do relatório *</label>
            <input id="relatorio-nome" className="form-control" autoFocus maxLength={100} value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="relatorio-descricao">Descrição (opcional)</label>
            <input id="relatorio-descricao" className="form-control" maxLength={300} value={descricao} onChange={e => setDescricao(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-primary" disabled={salvando || !nome.trim()} onClick={() => onSalvar(nome.trim(), descricao.trim())}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
