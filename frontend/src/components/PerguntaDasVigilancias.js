// Pergunta que o servidor faz ao cadastrar um prazo num processo com vigilância em andamento: "este prazo é por causa
// da vigilância?". Para cada vigilância, Sim (ela é encerrada) ou Não (continua aguardando). `sugerida` já vem em "Sim"
// (usado pelo botão "A parte contrária recorreu").
import React, { useState } from 'react';

export default function PerguntaDasVigilancias({ vigilancias, sugerida, salvando, onResponder, onVoltar }) {
  const [respostas, setRespostas] = useState(
    sugerida != null && vigilancias.some(v => v.id === sugerida) ? { [sugerida]: true } : {}
  );
  const faltam = vigilancias.some(v => respostas[v.id] === undefined);

  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="titulo-pergunta-vigilancia" style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3 id="titulo-pergunta-vigilancia">Vigilância do processo</h3>
          <button className="modal-fechar" onClick={onVoltar}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0 }}>
            {vigilancias.length === 1
              ? 'Este processo está com uma vigilância. Este prazo é por causa dela? Se sim, a vigilância será encerrada.'
              : 'Este processo está com vigilâncias. Este prazo é por causa de alguma delas? As que você marcar "Sim" serão encerradas.'}
          </p>
          {vigilancias.map(v => (
            <fieldset key={v.id} style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 12px', marginBottom: '10px' }}>
              <legend style={{ fontSize: '13px', padding: '0 4px' }}>{v.tipo_nome}</legend>
              <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px', cursor: 'pointer' }}>
                <input type="radio" name={`vigilancia-${v.id}`} checked={respostas[v.id] === true}
                  onChange={() => setRespostas(r => ({ ...r, [v.id]: true }))} />
                <span>Sim, encerrar a vigilância</span>
              </label>
              <label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}>
                <input type="radio" name={`vigilancia-${v.id}`} checked={respostas[v.id] === false}
                  onChange={() => setRespostas(r => ({ ...r, [v.id]: false }))} />
                <span>Não, manter a vigilância</span>
              </label>
            </fieldset>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onVoltar} disabled={salvando}>Voltar</button>
          <button className="btn btn-primary" disabled={faltam || salvando}
            onClick={() => onResponder(vigilancias.filter(v => respostas[v.id] === true).map(v => v.id))}>
            {salvando ? 'Salvando...' : 'Salvar Prazo'}
          </button>
        </div>
      </div>
    </div>
  );
}
