// ============================================================
// GRÁFICOS — legenda (sempre presente com 2+ séries; identidade nunca só pela cor).
// O texto usa a tinta do sistema; a cor aparece só na marca ao lado.
// ============================================================
import React from 'react';
import { TINTA } from './cores';

export default function Legenda({ itens, tipo = 'barra', vertical = false }) {
  return (
    <ul aria-label="Legenda do gráfico" style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexWrap: 'wrap', flexDirection: vertical ? 'column' : 'row', gap: vertical ? '8px' : '6px 18px', fontSize: 12, color: TINTA.primaria }}>
      {itens.map((it, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={tipo === 'linha'
            ? { width: 16, height: 2, background: it.cor, borderRadius: 1 }
            : { width: 10, height: 10, background: it.cor, borderRadius: 2 }} />
          <span>{it.rotulo}</span>
          {it.extra && <span style={{ color: TINTA.secundaria }}>{it.extra}</span>}
        </li>
      ))}
    </ul>
  );
}
