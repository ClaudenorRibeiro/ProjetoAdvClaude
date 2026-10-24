// Aviso diário de andamentos do DataJud — os tipos de andamento que o DataJud já trouxe, com a caixa "Importante".
// Tipo que chegou há pouco (e ninguém olhou ainda) aparece como "novo".
import React, { useState } from 'react';

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function AvisoAndamentosTipos({ tipos, importantes, aoMudar }) {
  const [busca, setBusca] = useState('');
  const termo = semAcento(busca.trim());
  const visiveis = tipos.filter(t => termo === '' || semAcento(t.nome).includes(termo));

  if (tipos.length === 0) {
    return (
      <p style={{ color: '#5b6472' }}>
        Ainda não chegou nenhum andamento do DataJud. Depois da primeira consulta noturna, os tipos aparecem aqui para você marcar quais são importantes.
      </p>
    );
  }
  return (
    <div>
      <div className="form-group">
        <label className="form-label" htmlFor="busca-tipos-andamento">Procurar tipo de andamento</label>
        <input id="busca-tipos-andamento" type="search" className="form-control" value={busca} onChange={e => setBusca(e.target.value)} />
      </div>
      <div role="group" aria-label="Tipos de andamento" style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px' }} tabIndex={0}>
        {visiveis.length === 0 && <p style={{ color: '#5b6472' }}>Nenhum tipo com esse nome.</p>}
        {visiveis.map(t => (
          <label key={t.codigo} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={importantes.has(t.codigo)} onChange={e => aoMudar(t.codigo, e.target.checked)} />
            <span>
              {t.nome}
              {t.novo && <span className="badge badge-laranja" style={{ marginLeft: 6 }}>novo</span>}
              <small style={{ color: '#5b6472' }}> — apareceu {t.quantidade} vez(es)</small>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
