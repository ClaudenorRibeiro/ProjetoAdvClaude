// ============================================================
// MODAL: LER A PUBLICAÇÃO DE ORIGEM (somente leitura)
// ------------------------------------------------------------
// Aberto a partir de um prazo/tarefa/compromisso que nasceu de uma publicação
// (via o vínculo publicacao_id). Busca a publicação pelo id e mostra o texto.
// Compartilhado por Prazos, Tarefas e Agenda para não duplicar código.
// ============================================================

import React, { useState, useEffect } from 'react';
import { publicacoesAPI } from '../services/api';
import { formatarData, textoLimpo } from '../utils/formatters';

export default function ModalLerPublicacao({ publicacaoId, onFechar }) {
  const [pub, setPub]   = useState(null);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    publicacoesAPI.obter(publicacaoId)
      .then(({ data }) => { if (data.ok) setPub(data.dados); })
      .catch((e) => setAviso(e.response?.data?.mensagem || 'Não foi possível carregar a publicação de origem.'));
  }, [publicacaoId]);

  // Fecha com Escape
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onFechar(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onFechar]);

  return (
    <div className="modal-overlay" style={{ zIndex: 2100 }}>
      <div className="modal-box modal-largo">
        <div className="modal-header">
          <h3>Publicação de origem{pub ? ` — ${formatarData(pub.data_publicacao)}` : ''}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {aviso && (
            <div style={{ background: '#fff4e5', border: '1px solid #ffcf99', color: '#8a5300',
              padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>
              {aviso}
            </div>
          )}
          {!pub && !aviso ? <div className="loading">Carregando...</div> : pub && (
            <>
              <div style={{ marginBottom: '12px', fontSize: '13px', color: '#555' }}>
                {pub.tribunal && <div><strong>Tribunal:</strong> {pub.tribunal}</div>}
                {pub.titulo && <div>{pub.titulo}</div>}
                {pub.numero_processo && <div><strong>Processo:</strong> {pub.numero_processo}</div>}
                {pub.numero_publicacao && <div><strong>Nº da publicação:</strong> {pub.numero_publicacao}</div>}
              </div>
              <div style={{
                background: '#f8fafc', padding: '16px', borderRadius: '8px',
                fontSize: '14px', lineHeight: '1.7', whiteSpace: 'pre-wrap', maxHeight: '420px', overflowY: 'auto',
              }}>
                {textoLimpo(pub.texto)}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
