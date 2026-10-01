// ============================================================
// RELATÓRIOS — grupo de filtros (recursivo): "Todas as condições (E)" ou "Qualquer uma (OU)",
// com condições e sub-grupos. Respeita os limites do servidor (25 condições, 3 níveis).
// ============================================================
import React from 'react';
import LinhaCondicao from './LinhaCondicao';
import { novaCondicao, contarCondicoes } from './receita';

export const MAX_CONDICOES = 25;
export const MAX_PROFUNDIDADE = 3;

export default function GrupoFiltros({ assunto, periodos, grupo, caminho, nivel, totalCondicoes, onAtualizar, onRemoverGrupo }) {
  const podeAdicionar = totalCondicoes < MAX_CONDICOES;
  const atualizarItens = (fn) => onAtualizar(caminho, g => ({ ...g, itens: fn(g.itens) }));

  return (
    <div style={{ borderLeft: nivel > 1 ? '3px solid #cbd5e1' : 'none', paddingLeft: nivel > 1 ? '12px' : 0, marginBottom: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
        <select className="form-control" style={{ width: '260px' }} aria-label="Como combinar as condições" value={grupo.op}
          onChange={e => onAtualizar(caminho, g => ({ ...g, op: e.target.value }))}>
          <option value="E">Todas estas condições (E)</option>
          <option value="OU">Qualquer uma destas (OU)</option>
        </select>
        <button type="button" className="btn btn-secondary" disabled={!podeAdicionar}
          onClick={() => atualizarItens(it => [...it, novaCondicao(assunto, periodos)])}>+ Condição</button>
        <button type="button" className="btn btn-secondary" disabled={!podeAdicionar || nivel >= MAX_PROFUNDIDADE}
          onClick={() => atualizarItens(it => [...it, { op: 'OU', itens: [novaCondicao(assunto, periodos)] }])}>+ Grupo</button>
        {onRemoverGrupo && <button type="button" className="btn btn-secondary" onClick={onRemoverGrupo}>Remover grupo</button>}
      </div>
      {grupo.itens.map((item, i) => (item.itens
        ? <GrupoFiltros key={i} assunto={assunto} periodos={periodos} grupo={item} caminho={[...caminho, i]} nivel={nivel + 1}
            totalCondicoes={totalCondicoes} onAtualizar={onAtualizar}
            onRemoverGrupo={() => atualizarItens(it => it.filter((_, idx) => idx !== i))} />
        : <LinhaCondicao key={i} assunto={assunto} periodos={periodos} condicao={item}
            onChange={nova => atualizarItens(it => it.map((x, idx) => (idx === i ? nova : x)))}
            onRemover={() => atualizarItens(it => it.filter((_, idx) => idx !== i))} />))}
      {!grupo.itens.length && nivel === 1 && <p style={{ color: '#6b7280', margin: 0 }}>Sem filtros: o relatório traz tudo o que você pode ver.</p>}
    </div>
  );
}

export function PassoFiltros({ assunto, periodos, filtros, onChange }) {
  const total = contarCondicoes(filtros);
  const atualizar = (caminho, fn) => {
    const aplicar = (no, c) => (c.length === 0 ? fn(no) : { ...no, itens: no.itens.map((it, idx) => (idx === c[0] ? aplicar(it, c.slice(1)) : it)) });
    onChange(aplicar(filtros, caminho));
  };
  return <GrupoFiltros assunto={assunto} periodos={periodos} grupo={filtros} caminho={[]} nivel={1} totalCondicoes={total} onAtualizar={atualizar} />;
}
