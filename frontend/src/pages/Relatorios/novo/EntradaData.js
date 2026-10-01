// ============================================================
// RELATÓRIOS — entrada de DATA: fixa (dd/mm/aaaa) ou relativa a hoje ("hoje − 30 dias").
// A relativa vale sempre em relação ao dia em que o relatório roda.
// ============================================================
import React from 'react';

const ehRelativa = (v) => v !== null && typeof v === 'object' && v.rel === 'hoje';

export default function EntradaData({ valor, onChange, rotulo }) {
  const relativa = ehRelativa(valor);
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
      <select className="form-control" style={{ width: '120px' }} aria-label={`${rotulo}: tipo de data`} value={relativa ? 'relativa' : 'fixa'}
        onChange={e => onChange(e.target.value === 'relativa' ? { rel: 'hoje', dias: 0 } : '')}>
        <option value="fixa">Data fixa</option>
        <option value="relativa">Relativa a hoje</option>
      </select>
      {relativa ? (
        <>
          <span style={{ color: '#374151' }}>hoje</span>
          <input className="form-control" style={{ width: '90px' }} type="number" step="1" aria-label={`${rotulo}: dias a somar (negativo = passado)`}
            value={valor.dias ?? 0} onChange={e => onChange({ rel: 'hoje', dias: e.target.value === '' ? '' : Number(e.target.value) })} />
          <span style={{ color: '#6b7280' }}>dias (use − para o passado)</span>
        </>
      ) : (
        <input className="form-control" style={{ width: '160px' }} type="date" aria-label={rotulo} value={valor ?? ''} onChange={e => onChange(e.target.value)} />
      )}
    </div>
  );
}
