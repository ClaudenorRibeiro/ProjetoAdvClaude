// Aviso diário de andamentos do DataJud — "Quem recebe": uma linha por pessoa ativa com o canal (sino/e-mail) e o escopo.
import React from 'react';

export const CANAIS = [
  { valor: 'nenhum', rotulo: 'Não avisar' },
  { valor: 'ambos',  rotulo: 'Sino e e-mail' },
  { valor: 'sino',   rotulo: 'Só sino' },
  { valor: 'email',  rotulo: 'Só e-mail' },
];
export const ESCOPOS = [
  { valor: 'meus',  rotulo: 'Só os meus processos' },
  { valor: 'todos', rotulo: 'Todos os processos' },
];

export default function AvisoAndamentosPessoas({ pessoas, aoMudar }) {
  return (
    <div className="tabela-wrapper">
      <table className="tabela">
        <thead>
          <tr><th>Pessoa</th><th>Como recebe o resumo</th><th>De quais processos</th></tr>
        </thead>
        <tbody>
          {pessoas.map(p => {
            const semEmail = !String(p.email || '').trim();
            return (
              <tr key={p.id}>
                <td>
                  {p.nome} <small style={{ color: '#5b6472' }}>({p.login})</small>
                  {semEmail && <small style={{ color: '#5b6472' }}> — sem e-mail cadastrado</small>}
                </td>
                <td>
                  <select aria-label={`Como ${p.nome} recebe o resumo`} className="form-control" value={p.canal}
                    onChange={e => aoMudar(p.id, { canal: e.target.value })}>
                    {CANAIS.map(c => (
                      <option key={c.valor} value={c.valor} disabled={semEmail && (c.valor === 'email' || c.valor === 'ambos')}>{c.rotulo}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select aria-label={`De quais processos ${p.nome} recebe`} className="form-control" value={p.escopo}
                    disabled={p.canal === 'nenhum'} onChange={e => aoMudar(p.id, { escopo: e.target.value })}>
                    {ESCOPOS.map(c => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
