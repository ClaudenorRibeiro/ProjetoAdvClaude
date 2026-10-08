// Um aviso pendente: quem recebe, o texto, os canais e os botões Enviar / Editar / Descartar.
import React, { useState } from 'react';
import { formatarData } from '../../utils/formatters';
import CanaisDoAviso from './CanaisDoAviso';
import { NOME_MODULO, NOME_TIPO } from './rotulos';

export default function AvisoCartao({ aviso, ocupado, onEnviar, onEditar, onDescartar }) {
  const [marcados, setMarcados] = useState({
    email: aviso.canais.email.disponivel, sms: aviso.canais.sms.disponivel, whatsapp: aviso.canais.whatsapp.disponivel,
  });
  const algum = ['email', 'sms', 'whatsapp'].some(c => aviso.canais[c].disponivel && marcados[c]);
  const enviando = aviso.status === 'enviando';
  const texto = (
    <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, background: '#f8fafc', border: '1px solid #e5eaf1', borderRadius: 6, padding: 10, margin: '8px 0' }}>
      <strong>{aviso.assunto}</strong>{'\n'}{aviso.texto}
    </div>
  );
  return (
    <div className="card" data-testid="aviso-cartao" style={{ padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <strong>{aviso.cliente_nome}</strong>
          <span style={{ color: '#5b6472', fontSize: 12, marginLeft: 8 }}>
            {NOME_MODULO[aviso.modulo]} · {NOME_TIPO[aviso.tipo]} · {formatarData(aviso.data_evento)}
            {aviso.processo_numero ? ` · Processo ${aviso.processo_numero}` : ''}
          </span>
        </div>
        {aviso.texto_editado ? <span style={{ fontSize: 12, color: '#b45309' }}>texto editado</span> : null}
      </div>
      {texto}
      <CanaisDoAviso canais={aviso.canais} marcados={marcados} onMudar={(c, v) => setMarcados(m => ({ ...m, [c]: v }))} />
      {enviando && <p style={{ fontSize: 12, color: '#b45309', margin: '8px 0 0' }}>Sendo enviado por outra pessoa neste momento…</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={!algum || ocupado || enviando} onClick={() => onEnviar(aviso, marcados)}>Enviar</button>
        <button className="btn btn-outline" disabled={ocupado || enviando} onClick={() => onEditar(aviso)}>Editar texto</button>
        <button className="btn btn-secondary" disabled={ocupado || enviando} onClick={() => onDescartar(aviso)}>Descartar</button>
      </div>
    </div>
  );
}
