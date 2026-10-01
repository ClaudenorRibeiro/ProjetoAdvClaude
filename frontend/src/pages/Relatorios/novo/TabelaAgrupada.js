// ============================================================
// RELATÓRIOS — tabela do resultado AGRUPADO: grupos, subtotais e total geral.
// Clicar em um grupo abre os itens dele.
// ============================================================
import React from 'react';
import { formatarTotal } from './formatoTotal';

const FUNDO = { subtotal: '#f3f4f6', total: '#dbeafe' };

export default function TabelaAgrupada({ dados, onAbrirGrupo }) {
  const { grupos, metricas } = dados.colunas;
  const nGrupos = grupos.length;
  return (
    <div className="card">
      <p style={{ marginTop: 0 }}>
        {nGrupos ? `${dados.totalGrupos.toLocaleString('pt-BR')} grupo(s). Clique em um grupo para ver os itens dele.` : 'Total geral.'}
      </p>
      <div className="tabela-wrapper" style={{ maxHeight: '65vh', overflow: 'auto' }}>
        <table className="tabela tabela-sticky">
          <thead><tr>
            {grupos.map(g => <th key={g.chave}>{g.rotulo}</th>)}
            {metricas.map(m => <th key={m.chave} style={{ textAlign: 'right' }}>{m.rotulo}</th>)}
          </tr></thead>
          <tbody>
            {dados.linhas.map((l, i) => {
              const clicavel = l.tipo === 'grupo';
              const total = l.tipo === 'total';
              const celulasGrupo = total
                ? <td colSpan={Math.max(nGrupos, 1)}><strong>TOTAL GERAL</strong></td>
                : grupos.map((g, gi) => (
                  <td key={g.chave}>{l.tipo === 'subtotal' && gi === 1 ? <strong>Subtotal de {l.rotulos[0]}</strong> : (l.tipo === 'subtotal' ? l.rotulos[0] : l.rotulos[gi])}</td>));
              return (
                <tr key={i} style={{ background: FUNDO[l.tipo], fontWeight: l.tipo === 'grupo' ? 400 : 700, cursor: clicavel ? 'pointer' : 'default' }}
                  title={clicavel ? 'Ver os itens deste grupo' : undefined}
                  onClick={clicavel ? () => onAbrirGrupo(l.chaves, l.rotulos) : undefined}>
                  {celulasGrupo}
                  {metricas.map((m, mi) => <td key={m.chave} style={{ textAlign: 'right' }}>{formatarTotal(m, l.valores[mi])}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
