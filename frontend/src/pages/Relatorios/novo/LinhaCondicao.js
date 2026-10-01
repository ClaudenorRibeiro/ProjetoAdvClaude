// ============================================================
// RELATÓRIOS — UMA condição de filtro: [campo] [operador] [valor] [remover].
// Só oferece operadores que fazem sentido para o tipo do campo (o servidor confere de novo).
// ============================================================
import React from 'react';
import ValorCondicao from './ValorCondicao';
import { campoDe, operadorDe, trocarCampo, trocarOperador, condicaoCompleta } from './receita';

export default function LinhaCondicao({ assunto, periodos, condicao, onChange, onRemover }) {
  const campo = campoDe(assunto, condicao.campo);
  const operador = operadorDe(campo, condicao.operador);
  if (!campo || !operador) return null;
  const incompleta = !condicaoCompleta(assunto, condicao);

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '8px' }}>
      <select className="form-control" style={{ width: '190px' }} aria-label="Campo do filtro" value={condicao.campo}
        onChange={e => onChange(trocarCampo(assunto, condicao, e.target.value, periodos))}>
        {assunto.campos.map(c => <option key={c.chave} value={c.chave}>{c.rotulo}</option>)}
      </select>
      <select className="form-control" style={{ width: '190px' }} aria-label="Condição do filtro" value={condicao.operador}
        onChange={e => onChange(trocarOperador(campo, condicao, e.target.value, periodos))}>
        {campo.operadores.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
      <div style={{ flex: '1 1 240px', minWidth: '200px' }}>
        <ValorCondicao campo={campo} operador={operador} valor={condicao.valor} periodos={periodos}
          onChange={valor => onChange({ ...condicao, valor })} />
        {incompleta && <small style={{ color: '#b45309' }}>Preencha o valor</small>}
      </div>
      <button type="button" className="btn btn-secondary" title="Remover filtro" aria-label="Remover filtro" onClick={onRemover}>✕</button>
    </div>
  );
}
