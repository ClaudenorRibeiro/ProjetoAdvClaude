// Histórico: os últimos avisos já decididos (enviados, descartados, vencidos), com quem decidiu e quando.
import React from 'react';
import { formatarData, formatarDataHora } from '../../utils/formatters';
import { NOME_MODULO, NOME_TIPO, NOME_STATUS } from './rotulos';

export default function HistoricoAvisos({ itens }) {
  if (!itens.length) return <p style={{ color: '#5b6472' }}>Nenhum aviso decidido ainda.</p>;
  return (
    <div className="table-wrapper" style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead>
          <tr><th>Quando</th><th>Assunto</th><th>Aviso</th><th>Evento</th><th>Situação</th><th>Por quem</th></tr>
        </thead>
        <tbody>
          {itens.map(a => (
            <tr key={a.id}>
              <td>{a.decidido_em ? formatarDataHora(a.decidido_em) : '—'}</td>
              <td>{a.assunto}</td>
              <td>{NOME_MODULO[a.modulo]} · {NOME_TIPO[a.tipo]}</td>
              <td>{formatarData(a.data_evento)}</td>
              <td>{NOME_STATUS[a.status] || a.status}{a.motivo_status ? ` — ${a.motivo_status}` : ''}</td>
              <td>{a.decidido_por_nome || (a.modo === 'automatico' ? 'Automático' : '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
