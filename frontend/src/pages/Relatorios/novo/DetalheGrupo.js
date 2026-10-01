// ============================================================
// RELATÓRIOS — janela com os ITENS de um grupo do resultado agrupado
// ============================================================
import React, { useMemo } from 'react';
import useEscFechar from '../../../hooks/useEscFechar';
import ResultadoDetalhado from './ResultadoDetalhado';

export default function DetalheGrupo({ corpoBase, chaves, rotulos, onFechar }) {
  const overlayRef = useEscFechar(onFechar);
  const corpo = useMemo(() => ({ ...corpoBase, grupo: chaves }), [corpoBase, chaves]);
  return (
    <div className="modal-overlay" ref={overlayRef}>
      <div className="modal-box" role="dialog" aria-label="Itens do grupo" style={{ maxWidth: '1100px', width: '95%' }}>
        <div className="modal-header">
          <h3>Itens: {rotulos.join(' / ')}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '75vh', overflow: 'auto' }}>
          <ResultadoDetalhado corpoBase={corpo} />
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onFechar}>Fechar</button></div>
      </div>
    </div>
  );
}
