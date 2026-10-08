// ============================================================
// LINHAS DE CONTATO — telefone e e-mail reutilizáveis
// Usados no cadastro completo de Pessoas (ModalPessoa) e no
// cadastro rápido de partes (ModalCadastroRapidoParte).
// Ficam aqui para NÃO duplicar máscara/validação entre telas.
// ============================================================
import React, { useState } from 'react';
import { limparEspacos, limparEmail } from '../utils/formatters';

// ------------------------------------------------------------
// MARCADORES DE CANAL — "este número é o WhatsApp / o SMS da pessoa"
// Regra do sistema: no máximo UM número com cada marcador (o mesmo número pode ter os dois). O servidor e o banco também conferem.
// ------------------------------------------------------------
const soDigitos = (n) => String(n || '').replace(/\D/g, '');
export const pareceCelular = (n) => { const d = soDigitos(n); return d.length === 11 && d[2] === '9'; };

// Troca a linha `index` por `novo` e garante a regra do "um só": marcar um número desmarca o que estava marcado em outro.
// Conveniência: quando o número digitado passa a ser um celular completo e ninguém na lista tem marcador, ele já vem marcado
// (a pessoa pode desmarcar — só acontece no momento em que o número vira celular).
export function atualizarTelefone(lista, index, novo) {
  const antes = lista[index] || {};
  let atual = { ...novo };
  const alguemMarcado = lista.some((t, j) => j !== index && (t.whatsapp || t.sms)) || antes.whatsapp || antes.sms;
  if (!alguemMarcado && pareceCelular(atual.numero) && !pareceCelular(antes.numero) && atual.whatsapp === undefined && atual.sms === undefined) atual = { ...atual, whatsapp: true, sms: true };
  return lista.map((t, j) => {
    if (j === index) return atual;
    return { ...t, whatsapp: atual.whatsapp ? false : t.whatsapp, sms: atual.sms ? false : t.sms };
  });
}

// ------------------------------------------------------------
// LINHA TELEFONE — número com máscara adaptativa + descrição livre
// `mostrarCanais`: mostra as caixinhas WhatsApp / SMS (usado na ficha da pessoa).
// ------------------------------------------------------------
export function LinhaFone({ tel, index, onChange, onRemove, somenteLeitura = false, refNumero, onAbrirWhatsApp = null, mostrarCanais = false }) {
  // Máscara adaptativa: fixo (xx) xxxx-xxxx ou celular (xx) xxxxx-xxxx
  function mascaraTelefone(value) {
    const limpo = value.replace(/\D/g, '').slice(0, 11);
    if (!limpo) return '';
    if (limpo.length <= 2)  return `(${limpo}`;
    if (limpo.length <= 6)  return `(${limpo.slice(0,2)}) ${limpo.slice(2)}`;
    if (limpo.length <= 10) return `(${limpo.slice(0,2)}) ${limpo.slice(2,6)}-${limpo.slice(6)}`;
    return                         `(${limpo.slice(0,2)}) ${limpo.slice(2,7)}-${limpo.slice(7)}`;
  }

  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
      {/* Número com máscara automática */}
      <input
        ref={refNumero}
        className="form-control"
        style={{ flex: 2 }}
        placeholder="(11) 99999-9999" aria-label={`Telefone ${index + 1}`}
        value={tel.numero}
        maxLength={15}
        disabled={somenteLeitura}
        onChange={e => onChange({ ...tel, numero: mascaraTelefone(e.target.value) })}
      />
      {/* Descrição livre: Celular, Comercial, esposa Edna, recado... */}
      <input
        className="form-control"
        style={{ flex: 1 }}
        placeholder="Descrição do Telefone" aria-label={`Descrição do telefone ${index + 1}`}
        value={tel.tipo || ''}
        disabled={somenteLeitura}
        onChange={e => onChange({ ...tel, tipo: e.target.value })}
        onBlur={() => onChange({ ...tel, tipo: limparEspacos(tel.tipo || '') })}
      />
      {/* Canais dos avisos aos clientes: este número é o WhatsApp e/ou o SMS desta pessoa (no máximo um de cada) */}
      {mostrarCanais && (
        <div style={{ display: 'flex', gap: '10px', flexShrink: 0, fontSize: '12px', color: '#374151' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: somenteLeitura ? 'default' : 'pointer' }}>
            <input type="checkbox" aria-label={`WhatsApp do telefone ${index + 1}`} checked={!!tel.whatsapp} disabled={somenteLeitura}
              onChange={e => onChange({ ...tel, whatsapp: e.target.checked })} />
            WhatsApp
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: somenteLeitura ? 'default' : 'pointer' }}>
            <input type="checkbox" aria-label={`SMS do telefone ${index + 1}`} checked={!!tel.sms} disabled={somenteLeitura}
              onChange={e => onChange({ ...tel, sms: e.target.checked })} />
            SMS
          </label>
        </div>
      )}
      {/* Na ficha em leitura, permite iniciar uma conversa sem liberar a edição. */}
      {somenteLeitura && tel.numero && onAbrirWhatsApp && (
        <button
          type="button"
          onClick={() => onAbrirWhatsApp(tel.numero)}
          title="Enviar WhatsApp para este telefone"
          aria-label="Enviar WhatsApp para este telefone"
          style={{ width: '34px', height: '34px', padding: 0, flexShrink: 0, border: 'none',
            borderRadius: '6px', background: '#25d366', color: '#fff', cursor: 'pointer',
            display: 'grid', placeItems: 'center' }}
        >
          <span aria-hidden="true" style={{ fontSize: '18px', lineHeight: 1 }}>☎</span>
        </button>
      )}
      {/* Botão remover — só aparece a partir da segunda linha */}
      {index > 0 && !somenteLeitura && (
        <button
          type="button"
          className="btn btn-danger"
          style={{ padding: '6px 10px', flexShrink: 0 }}
          onClick={onRemove}
        >✕</button>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// LINHA EMAIL — campo de e-mail com validação de formato no blur
// ------------------------------------------------------------
export function LinhaEmail({ email, index, onChange, onRemove, somenteLeitura = false, refEmail }) {
  const [erroEmail, setErroEmail] = useState('');
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Ao perder o foco: apaga TODOS os espaços e deixa tudo minúsculo — e SÓ DEPOIS
  // confere o formato, para não acusar erro por causa de um espaço que já foi limpo.
  function handleBlur() {
    const limpo = limparEmail(email || '');
    if (limpo !== (email || '')) onChange(limpo);
    if (limpo && !emailRegex.test(limpo)) {
      setErroEmail('E-mail inválido');
    } else {
      setErroEmail('');
    }
  }

  return (
    <div style={{ marginBottom: erroEmail ? '4px' : '8px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          ref={refEmail}
          className={`form-control ${erroEmail ? 'is-invalid' : ''}`}
          style={{ flex: 1 }}
          placeholder="email@exemplo.com" aria-label={`E-mail ${index + 1}`}
          value={email}
          disabled={somenteLeitura}
          onChange={e => { setErroEmail(''); onChange(e.target.value.toLowerCase()); }}
          onBlur={handleBlur}
        />
        {index > 0 && !somenteLeitura && (
          <button
            type="button"
            className="btn btn-danger"
            style={{ padding: '6px 10px', flexShrink: 0 }}
            onClick={onRemove}
          >✕</button>
        )}
      </div>
      {erroEmail && <small style={{ color: '#b91c1c', fontSize: '12px' }}>⚠️ {erroEmail}</small>}
    </div>
  );
}
