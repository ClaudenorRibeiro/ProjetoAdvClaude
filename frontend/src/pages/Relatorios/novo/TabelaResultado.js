// ============================================================
// RELATÓRIOS — tabela do resultado. Cada tipo de coluna é mostrado do jeito certo:
// datas em dd/mm/aaaa, sim/não, número do processo com o ⧉ de copiar, pasta clicável.
// ============================================================
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import NumeroProcessoCopiavel from '../../../components/NumeroProcessoCopiavel';
import { formatarData, formatarDataHora } from '../../../utils/formatters';

function Celula({ coluna, linha, navigate }) {
  const v = linha[coluna.chave];
  if (v === null || v === undefined || v === '') return <span style={{ color: '#9ca3af' }}>—</span>;
  const pastaId = linha.__pasta_id;
  if (coluna.formato === 'processo') {
    return <NumeroProcessoCopiavel numero={v} href={pastaId ? `/processos/pasta/${pastaId}` : undefined}
      onAbrir={pastaId ? () => navigate(`/processos/pasta/${pastaId}`) : undefined} />;
  }
  if (coluna.formato === 'pasta') return pastaId ? <Link to={`/processos/pasta/${pastaId}`}>{v}</Link> : v;
  if (coluna.tipo === 'data') return formatarData(v);
  if (coluna.tipo === 'datahora') return formatarDataHora(v);
  if (coluna.tipo === 'booleano') return v ? 'Sim' : 'Não';
  return String(v);
}

export default function TabelaResultado({ colunas, linhas }) {
  const navigate = useNavigate();
  if (!linhas.length) return <p className="lista-vazia">Nenhum registro encontrado com esses filtros.</p>;
  return (
    <div className="tabela-wrapper" style={{ maxHeight: '65vh', overflow: 'auto' }}>
      <table className="tabela tabela-sticky">
        <thead><tr>{colunas.map(c => <th key={c.chave}>{c.rotulo}</th>)}</tr></thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={i}>{colunas.map(c => (
              // número do processo e da pasta nunca quebram em duas linhas
              <td key={c.chave} style={c.formato ? { whiteSpace: 'nowrap' } : undefined}><Celula coluna={c} linha={linha} navigate={navigate} /></td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
