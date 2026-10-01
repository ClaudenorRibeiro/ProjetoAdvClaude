// ============================================================
// TABELA CRUZADA — matriz de 2 níveis (linhas × colunas). Clicar numa célula abre os itens dela.
// ============================================================
import React, { useMemo, useState } from 'react';
import { montarCruzada } from './cruzada';
import { formatarTotal } from './formatoTotal';

const direita = { textAlign: 'right', whiteSpace: 'nowrap' };

export default function TabelaCruzada({ dados, metricaInicial, aoMudarMetrica, onAbrirGrupo }) {
  const [metrica, setMetrica] = useState(metricaInicial || 'm1');
  const c = useMemo(() => montarCruzada(dados, metrica), [dados, metrica]);
  if (c.vazio) return <div className="card"><p style={{ margin: 0 }}>{c.motivo}</p></div>;

  return (
    <div className="card">
      {c.metricas.length > 1 && (
        <div className="form-group" style={{ maxWidth: 360 }}>
          <label className="form-label" htmlFor="cruzada-metrica">Total no cruzamento</label>
          <select id="cruzada-metrica" className="form-control" value={c.metrica.chave}
            onChange={e => { setMetrica(e.target.value); if (aoMudarMetrica) aoMudarMetrica(e.target.value); }}>
            {c.metricas.map(m => <option key={m.chave} value={m.chave}>{m.rotulo}</option>)}
          </select>
        </div>
      )}
      {c.totalColunas > c.colunas.length && (
        <p role="note" style={{ color: '#92400e', marginTop: 0 }}>Mostrando as primeiras {c.colunas.length} de {c.totalColunas} colunas. Os totais das linhas incluem todas.</p>
      )}
      <div className="tabela-wrapper" style={{ maxHeight: '65vh', overflow: 'auto' }}>
        <table className="tabela tabela-sticky">
          <thead>
            <tr>
              <th>{c.cabecalhos[0]} \ {c.cabecalhos[1]}</th>
              {c.colunas.map(col => <th key={col.k} style={direita}>{col.rotulo}</th>)}
              <th style={direita}>Total</th>
            </tr>
          </thead>
          <tbody>
            {c.linhas.map((l, i) => (
              <tr key={i}>
                <td><strong>{l.rotulo}</strong></td>
                {l.celulas.map((cel, j) => (
                  <td key={j} style={{ ...direita, cursor: cel && onAbrirGrupo ? 'pointer' : 'default' }}
                    title={cel && onAbrirGrupo ? 'Ver os itens desta célula' : undefined}
                    onClick={cel && onAbrirGrupo ? () => onAbrirGrupo(cel.chaves, cel.rotulos) : undefined}>
                    {cel ? formatarTotal(c.metrica, cel.valor) : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                ))}
                <td style={{ ...direita, fontWeight: 700 }}>{formatarTotal(c.metrica, l.total)}</td>
              </tr>
            ))}
            <tr style={{ background: '#dbeafe', fontWeight: 700 }}>
              <td>TOTAL GERAL</td>
              {c.colunas.map((col, j) => <td key={col.k} style={direita}>{c.totaisColuna ? formatarTotal(c.metrica, c.totaisColuna[j]) : '—'}</td>)}
              <td style={direita}>{formatarTotal(c.metrica, c.totalGeral)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {!c.somavel && <p style={{ color: '#6b7280', fontSize: 12, marginBottom: 0 }}>Este total (média, mínimo ou máximo) não pode ser somado por coluna; por isso a linha de totais das colunas fica em branco.</p>}
    </div>
  );
}
