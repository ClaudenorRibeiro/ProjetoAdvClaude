// ============================================================
// GRÁFICOS — caixinha de valores ao passar o mouse / focar com o teclado.
// Nomes vêm do banco: sempre texto puro (o React já escapa), nunca HTML.
// ============================================================
import React from 'react';
import { formatarValor } from './formato';
import { TINTA } from './cores';

// Linhas da caixinha para UMA categoria (todas as séries daquele ponto)
export function linhasDaCategoria(prep, c) {
  return prep.series
    .filter(s => s.valores[c] !== null)
    .map(s => ({ cor: s.cor, rotulo: prep.series.length > 1 ? s.rotulo : prep.metrica.rotulo,
      valor: formatarValor(s.valores[c], { formato: prep.metrica.formato, funcao: prep.metrica.funcao }) }));
}

export default function Dica({ dica, largura }) {
  if (!dica) return null;
  const naDireita = dica.x > largura * 0.6;
  return (
    <div role="status" style={{
      position: 'absolute', top: Math.max(0, dica.y - 8), left: dica.x, transform: naDireita ? 'translate(calc(-100% - 12px), 0)' : 'translate(12px, 0)',
      pointerEvents: 'none', background: '#fff', border: `1px solid ${TINTA.grade}`, borderRadius: 6, padding: '8px 10px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)', fontSize: 12, zIndex: 5, maxWidth: 260, color: TINTA.primaria,
    }}>
      <div style={{ color: TINTA.secundaria, marginBottom: 4 }}>{dica.titulo}</div>
      {dica.linhas.map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          <span style={{ width: 12, height: 3, background: l.cor, borderRadius: 2, flex: 'none' }} />
          <strong>{l.valor}</strong><span style={{ color: TINTA.secundaria }}>{l.rotulo}</span>
        </div>
      ))}
    </div>
  );
}
