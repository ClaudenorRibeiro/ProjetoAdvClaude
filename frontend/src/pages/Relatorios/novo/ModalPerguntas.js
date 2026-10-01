// ============================================================
// RELATÓRIOS — janela com as PERGUNTAS do relatório ("perguntar ao abrir").
// Mostra só as condições marcadas, já com o valor padrão salvo; só roda quando tudo está respondido.
// ============================================================
import React, { useState } from 'react';
import useEscFechar from '../../../hooks/useEscFechar';
import ValorCondicao from './ValorCondicao';
import { campoDe, operadorDe, respostaCompleta } from './receita';

export default function ModalPerguntas({ assunto, periodos, perguntas, respostasIniciais = {}, onConfirmar, onCancelar }) {
  const chave = (p) => p.caminho.join('.');
  const [respostas, setRespostas] = useState(() => Object.fromEntries(perguntas.map(p => [chave(p), respostasIniciais[chave(p)] ?? p.condicao.valor])));
  const overlayRef = useEscFechar(onCancelar);
  const tudo = perguntas.every(p => respostaCompleta(assunto, p.condicao, respostas[chave(p)]));

  return (
    <div className="modal-overlay" ref={overlayRef}>
      <div className="modal-box" role="dialog" aria-label="Perguntas do relatório" style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <h3>Antes de rodar, responda</h3>
          <button className="modal-fechar" onClick={onCancelar}>✕</button>
        </div>
        <div className="modal-body">
          {perguntas.map(p => {
            const campo = campoDe(assunto, p.condicao.campo);
            const operador = operadorDe(campo, p.condicao.operador);
            return (
              <div key={chave(p)} className="form-group">
                <label className="form-label">{campo.rotulo} <em style={{ color: '#6b7280' }}>{operador.rotulo}</em></label>
                <ValorCondicao campo={campo} operador={operador} valor={respostas[chave(p)]} periodos={periodos}
                  onChange={v => setRespostas(r => ({ ...r, [chave(p)]: v }))} />
              </div>
            );
          })}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-primary" disabled={!tudo}
            onClick={() => onConfirmar(perguntas.map(p => ({ caminho: p.caminho, valor: respostas[chave(p)] })), respostas)}>Rodar relatório</button>
        </div>
      </div>
    </div>
  );
}
