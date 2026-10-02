// ============================================================
// RELATÓRIOS — escolha e ordem das colunas (as que o usuário pode usar, vindas do catálogo)
// ============================================================
import React from 'react';
import { mover } from './receita';

export default function PassoColunas({ assunto, colunas, onChange }) {
  const alternar = (chave) => onChange(colunas.includes(chave) ? colunas.filter(c => c !== chave) : [...colunas, chave]);
  const rotulo = (chave) => assunto.campos.find(c => c.chave === chave)?.rotulo || chave;

  return (
    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 240px' }}>
        <strong style={{ display: 'block', marginBottom: '6px' }}>Campos disponíveis</strong>
        {assunto.campos.map(c => (
          <label key={c.chave} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '3px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={colunas.includes(c.chave)} onChange={() => alternar(c.chave)} />
            {c.rotulo}
          </label>
        ))}
      </div>
      <div style={{ flex: '1 1 240px', maxWidth: '440px' }}>   {/* largura limitada: os botões ficam colados ao nome da coluna */}
        <strong style={{ display: 'block', marginBottom: '6px' }}>Colunas no relatório (na ordem)</strong>
        {colunas.length > 1 && <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#6b7280' }}>Use ↑ e ↓ para mudar a ordem das colunas e ✕ para tirar uma.</p>}
        {colunas.length === 0 && <p style={{ color: '#b45309', margin: 0 }}>Escolha ao menos uma coluna.</p>}
        {colunas.map((chave, i) => (
          <div key={chave} style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '3px 0' }}>
            <span style={{ flex: 1 }}>{i + 1}. {rotulo(chave)}</span>
            <button type="button" className="btn btn-secondary" aria-label={`Subir ${rotulo(chave)}`} title="Subir esta coluna" disabled={i === 0}
              onClick={() => onChange(mover(colunas, i, i - 1))}>↑</button>
            <button type="button" className="btn btn-secondary" aria-label={`Descer ${rotulo(chave)}`} title="Descer esta coluna" disabled={i === colunas.length - 1}
              onClick={() => onChange(mover(colunas, i, i + 1))}>↓</button>
            <button type="button" className="btn btn-secondary" aria-label={`Remover ${rotulo(chave)}`} title="Tirar esta coluna do relatório" onClick={() => alternar(chave)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
