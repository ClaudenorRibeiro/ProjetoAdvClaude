// ============================================================
// RELATÓRIOS — ordenação por até 5 colunas
// ============================================================
import React from 'react';

export const MAX_ORDENS = 5;

export default function PassoOrdem({ assunto, ordem, onChange }) {
  const usadas = new Set(ordem.map(o => o.campo));
  const livres = assunto.campos.filter(c => !usadas.has(c.chave));
  const atualizar = (i, parcial) => onChange(ordem.map((o, idx) => (idx === i ? { ...o, ...parcial } : o)));

  return (
    <div>
      {ordem.length === 0 && <p style={{ color: '#6b7280', marginTop: 0 }}>Sem ordem escolhida: usa a ordem padrão do assunto.</p>}
      {ordem.map((o, i) => (
        <div key={o.campo} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ width: '90px', whiteSpace: 'nowrap', color: '#6b7280' }}>{i === 0 ? 'Ordenar por' : 'depois por'}</span>
          <select className="form-control" style={{ width: '220px' }} aria-label={`Critério ${i + 1}`} value={o.campo}
            onChange={e => atualizar(i, { campo: e.target.value })}>
            {[assunto.campos.find(c => c.chave === o.campo), ...livres].filter(Boolean).map(c => <option key={c.chave} value={c.chave}>{c.rotulo}</option>)}
          </select>
          <select className="form-control" style={{ width: '150px' }} aria-label={`Direção ${i + 1}`} value={o.direcao}
            onChange={e => atualizar(i, { direcao: e.target.value })}>
            <option value="asc">Crescente (A→Z, antigo→novo)</option>
            <option value="desc">Decrescente (Z→A, novo→antigo)</option>
          </select>
          <button type="button" className="btn btn-secondary" aria-label={`Remover critério ${i + 1}`}
            onClick={() => onChange(ordem.filter((_, idx) => idx !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" disabled={ordem.length >= MAX_ORDENS || !livres.length}
        onClick={() => onChange([...ordem, { campo: livres[0].chave, direcao: 'asc' }])}>+ Critério de ordem</button>
    </div>
  );
}
