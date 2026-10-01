// ============================================================
// GRÁFICOS — controles (tipo, total mostrado, empilhar, baixar imagem)
// ============================================================
import React from 'react';
import { TIPOS } from './dadosGrafico';

export default function ControlesGrafico({ tipo, metrica, empilhado, graficaveis, rosca, podeEmpilhar, gerando, aoMudar, aoBaixar }) {
  return (
    <div style={{ display: 'flex', gap: '12px 16px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label" htmlFor="grafico-tipo">Tipo de gráfico</label>
        <select id="grafico-tipo" className="form-control" value={tipo} onChange={e => aoMudar({ tipo: e.target.value })}>
          {TIPOS.map(t => (
            <option key={t.valor} value={t.valor} disabled={t.valor === 'rosca' && !rosca.ok}>
              {t.rotulo}{t.valor === 'rosca' && !rosca.ok ? ' — indisponível' : ''}
            </option>
          ))}
        </select>
      </div>
      {graficaveis.length > 1 && (
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="grafico-metrica">Total mostrado</label>
          <select id="grafico-metrica" className="form-control" value={metrica} onChange={e => aoMudar({ metrica: e.target.value })}>
            {graficaveis.map(m => <option key={m.chave} value={m.chave}>{m.rotulo}</option>)}
          </select>
        </div>
      )}
      {podeEmpilhar && (
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', paddingBottom: 8 }}>
          <input type="checkbox" checked={empilhado} onChange={e => aoMudar({ empilhado: e.target.checked })} /> Empilhar as séries
        </label>
      )}
      <button className="btn btn-secondary" disabled={gerando} onClick={aoBaixar} style={{ marginLeft: 'auto' }}>
        {gerando ? 'Gerando imagem...' : 'Baixar imagem (PNG)'}
      </button>
    </div>
  );
}
