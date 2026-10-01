// ============================================================
// RELATÓRIOS — passo "Agrupar e totalizar".
// Só oferece o que faz sentido: campos agrupáveis, passos de data (dia/semana/mês/ano) e totais
// compatíveis com o tipo do campo (soma/média só de números; mínimo/máximo de números e datas).
// ============================================================
import React from 'react';
import { campoDe, funcoesDisponiveis, camposDaFuncao, rotuloMetrica } from './receita';

export const MAX_AGRUPAR = 2;
export const MAX_METRICAS = 6;

function SeletorGrupo({ assunto, indice, grupo, excluir, onChange }) {
  const campo = campoDe(assunto, grupo?.campo);
  const opcoes = assunto.campos.filter(c => c.agrupavel && c.chave !== excluir);
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
      <span style={{ width: '90px', whiteSpace: 'nowrap', color: '#6b7280' }}>{indice === 0 ? 'Agrupar por' : 'e depois por'}</span>
      <select className="form-control" style={{ width: '220px' }} aria-label={`Agrupar por (${indice + 1})`} value={grupo?.campo || ''}
        onChange={e => onChange(e.target.value ? { campo: e.target.value, ...(campoDe(assunto, e.target.value).passos ? { passo: 'mes' } : {}) } : null)}>
        <option value="">— nenhum —</option>
        {opcoes.map(c => <option key={c.chave} value={c.chave}>{c.rotulo}</option>)}
      </select>
      {campo?.passos && (
        <select className="form-control" style={{ width: '130px' }} aria-label={`Agrupar ${campo.rotulo} por`} value={grupo.passo}
          onChange={e => onChange({ ...grupo, passo: e.target.value })}>
          {campo.passos.map(p => <option key={p.valor} value={p.valor}>por {p.rotulo.toLowerCase()}</option>)}
        </select>
      )}
    </div>
  );
}

function LinhaTotal({ assunto, metrica, indice, onChange, onRemover }) {
  const funcoes = funcoesDisponiveis(assunto);
  const campos = metrica.funcao === 'contagem' ? [] : camposDaFuncao(assunto, metrica.funcao);
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
      <select className="form-control" style={{ width: '170px' }} aria-label={`Total ${indice + 1}`} value={metrica.funcao}
        onChange={e => {
          const funcao = e.target.value;
          onChange(funcao === 'contagem' ? { funcao } : { funcao, campo: camposDaFuncao(assunto, funcao)[0].chave });
        }}>
        {funcoes.map(f => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
      </select>
      {metrica.funcao !== 'contagem' && (
        <>
          <span style={{ color: '#6b7280' }}>de</span>
          <select className="form-control" style={{ width: '220px' }} aria-label={`Campo do total ${indice + 1}`} value={metrica.campo}
            onChange={e => onChange({ ...metrica, campo: e.target.value })}>
            {campos.map(c => <option key={c.chave} value={c.chave}>{c.rotulo}</option>)}
          </select>
        </>
      )}
      <button type="button" className="btn btn-secondary" aria-label={`Remover total ${indice + 1}`} onClick={onRemover}>✕</button>
    </div>
  );
}

export default function PassoAgrupar({ assunto, agrupar, metricas, ordemGrupo, onChange }) {
  const set = (parcial) => onChange({ agrupar, metricas, ordemGrupo, ...parcial });

  function trocarGrupo(i, novo) {
    let lista = agrupar.slice(0, i);
    if (novo) lista = [...lista, novo, ...agrupar.slice(i + 1)];     // limpar o 1º também limpa o 2º
    // ao começar a agrupar, a contagem entra sozinha; sem grupos, a ordem dos grupos não faz sentido
    set({ agrupar: lista, metricas: lista.length && !metricas.length ? [{ funcao: 'contagem' }] : metricas, ordemGrupo: lista.length ? ordemGrupo : null });
  }

  const opcoesOrdem = [
    ...agrupar.map((g, i) => ({ valor: `g${i + 1}`, rotulo: campoDe(assunto, g.campo)?.rotulo })),
    ...metricas.map((m, i) => ({ valor: `m${i + 1}`, rotulo: rotuloMetrica(assunto, m) })),
  ];

  return (
    <div>
      <p style={{ marginTop: 0, color: '#6b7280' }}>Opcional. Agrupar mostra um resumo (por exemplo, prazos por responsável) em vez de uma linha por registro. Clique em um grupo para ver os itens dele.</p>
      <SeletorGrupo assunto={assunto} indice={0} grupo={agrupar[0]} excluir={agrupar[1]?.campo} onChange={g => trocarGrupo(0, g)} />
      {agrupar[0] && (
        <SeletorGrupo assunto={assunto} indice={1} grupo={agrupar[1]} excluir={agrupar[0].campo} onChange={g => trocarGrupo(1, g)} />
      )}

      {(agrupar.length > 0 || metricas.length > 0) && (
        <div style={{ marginTop: '12px' }}>
          <strong style={{ display: 'block', marginBottom: '6px' }}>Totais</strong>
          {metricas.map((m, i) => (
            <LinhaTotal key={i} assunto={assunto} metrica={m} indice={i}
              onChange={nova => set({ metricas: metricas.map((x, idx) => (idx === i ? nova : x)) })}
              onRemover={() => set({ metricas: metricas.filter((_, idx) => idx !== i) })} />
          ))}
          <button type="button" className="btn btn-secondary" disabled={metricas.length >= MAX_METRICAS}
            onClick={() => set({ metricas: [...metricas, { funcao: 'contagem' }] })}>+ Total</button>
        </div>
      )}
      {agrupar.length === 0 && metricas.length === 0 && (
        <button type="button" className="btn btn-secondary" style={{ marginTop: '4px' }}
          onClick={() => set({ metricas: [{ funcao: 'contagem' }] })}>Só o total geral (sem agrupar)</button>
      )}

      {agrupar.length > 0 && metricas.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
          <span style={{ width: '90px', whiteSpace: 'nowrap', color: '#6b7280' }}>Ordenar por</span>
          <select className="form-control" style={{ width: '260px' }} aria-label="Ordenar os grupos por" value={ordemGrupo?.por || ''}
            onChange={e => set({ ordemGrupo: e.target.value ? { por: e.target.value, direcao: ordemGrupo?.direcao || 'asc' } : null })}>
            <option value="">Nome do grupo (A→Z, antigo→novo)</option>
            {opcoesOrdem.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select>
          {ordemGrupo && (
            <select className="form-control" style={{ width: '150px' }} aria-label="Direção da ordem dos grupos" value={ordemGrupo.direcao}
              onChange={e => set({ ordemGrupo: { ...ordemGrupo, direcao: e.target.value } })}>
              <option value="asc">Crescente</option>
              <option value="desc">Decrescente</option>
            </select>
          )}
        </div>
      )}
    </div>
  );
}
