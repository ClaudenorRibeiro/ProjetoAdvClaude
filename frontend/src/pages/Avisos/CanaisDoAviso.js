// Caixinhas dos canais do aviso (e-mail, SMS, WhatsApp). Canal que o cliente não tem fica desabilitado, com o motivo.
import React from 'react';
import { NOME_CANAL } from './rotulos';

const MOTIVO_AUSENTE = {
  email: 'cliente sem e-mail',
  sms: 'cliente sem celular marcado para SMS, ou SMS desligado',
  whatsapp: 'cliente sem celular marcado para WhatsApp',
};

export default function CanaisDoAviso({ canais, marcados, onMudar }) {
  return (
    <div role="group" aria-label="Canais de envio" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {['email', 'sms', 'whatsapp'].map(c => {
        const info = canais[c];
        return (
          <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, opacity: info.disponivel ? 1 : 0.7 }}>
            <input type="checkbox" checked={info.disponivel && !!marcados[c]} disabled={!info.disponivel}
              aria-label={`Enviar por ${NOME_CANAL[c]}`} onChange={e => onMudar(c, e.target.checked)} />
            <span>
              {NOME_CANAL[c]}
              <small style={{ color: '#5b6472', display: 'block', fontSize: 11 }}>
                {info.disponivel ? info.destino : MOTIVO_AUSENTE[c]}
              </small>
            </span>
          </label>
        );
      })}
    </div>
  );
}
