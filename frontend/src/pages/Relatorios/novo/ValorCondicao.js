// ============================================================
// RELATÓRIOS — campo de VALOR de uma condição. O formato muda conforme o tipo do campo e o operador:
// texto, número, data, dois valores ("entre"), vários da lista ("é um destes") ou período pronto.
// ============================================================
import React from 'react';
import Select from 'react-select';

const estiloSelect = {
  control: (base, state) => ({ ...base, minHeight: '38px', borderColor: state.isFocused ? '#2563eb' : '#d1d5db', boxShadow: 'none' }),
  menu: base => ({ ...base, zIndex: 10000 }),
};

function entrada(campo, valor, onChange, rotulo) {
  const tipo = campo.tipo === 'numero' ? 'number' : campo.tipo.startsWith('data') ? 'date' : 'text';
  return (
    <input className="form-control" type={tipo} value={valor ?? ''} aria-label={rotulo}
      step={tipo === 'number' ? 'any' : undefined} onChange={e => onChange(e.target.value)} />
  );
}

export default function ValorCondicao({ campo, operador, valor, onChange, periodos }) {
  switch (operador.aridade) {
    case 'um':
      return entrada(campo, valor, onChange, `Valor de ${campo.rotulo}`);
    case 'dois':
      return (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {entrada(campo, valor?.[0], v => onChange([v, valor?.[1] ?? '']), `${campo.rotulo}: de`)}
          <span style={{ color: '#6b7280' }}>e</span>
          {entrada(campo, valor?.[1], v => onChange([valor?.[0] ?? '', v]), `${campo.rotulo}: até`)}
        </div>
      );
    case 'periodo':
      return (
        <select className="form-control" value={valor || ''} aria-label="Período" onChange={e => onChange(e.target.value)}>
          {periodos.map(p => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
        </select>
      );
    case 'lista': {
      const opcoes = (campo.opcoes || []).map(o => ({ value: String(o.valor), label: o.rotulo }));
      return (
        <Select isMulti closeMenuOnSelect={false} options={opcoes} styles={estiloSelect} aria-label={`Opções de ${campo.rotulo}`}
          placeholder="Escolha uma ou mais…" noOptionsMessage={() => 'Nenhuma opção'}
          value={opcoes.filter(o => (valor || []).includes(o.value))}
          onChange={sel => onChange((sel || []).map(o => o.value))} />
      );
    }
    default:
      return null; // "está vazio", "é sim"... não precisam de valor
  }
}
