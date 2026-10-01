// ============================================================
// RELATÓRIOS — janela para dar nome (e descrição) ao relatório ao salvar.
// O administrador também escolhe se o relatório é só dele ou do sistema (todos os usuários veem).
// ============================================================
import React, { useState } from 'react';
import useEscFechar from '../../../hooks/useEscFechar';

export default function ModalSalvar({ nomeInicial = '', descricaoInicial = '', editando = false, podeSistema = false, salvando, onSalvar, onCancelar }) {
  const [nome, setNome] = useState(nomeInicial);
  const [descricao, setDescricao] = useState(descricaoInicial || '');
  const [escopo, setEscopo] = useState('pessoal');
  const overlayRef = useEscFechar(onCancelar);
  const escolheEscopo = podeSistema && !editando;   // depois de criado, o tipo não muda

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
          {escolheEscopo && (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="form-label">Quem vai ver este relatório?</legend>
              <label style={{ display: 'block', cursor: 'pointer' }}>
                <input type="radio" name="escopo" checked={escopo === 'pessoal'} onChange={() => setEscopo('pessoal')} /> Só eu (conta no meu limite de relatórios)
              </label>
              <label style={{ display: 'block', cursor: 'pointer' }}>
                <input type="radio" name="escopo" checked={escopo === 'sistema'} onChange={() => setEscopo('sistema')} /> Relatório do sistema (todos os usuários veem, cada um com as suas permissões)
              </label>
            </fieldset>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-primary" disabled={salvando || !nome.trim()} onClick={() => onSalvar(nome.trim(), descricao.trim(), escolheEscopo ? escopo : undefined)}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
