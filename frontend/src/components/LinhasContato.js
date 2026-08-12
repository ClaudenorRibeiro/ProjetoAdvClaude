// ============================================================
// LINHAS DE CONTATO — telefone e e-mail reutilizáveis
// Usados no cadastro completo de Pessoas (ModalPessoa) e no
// cadastro rápido de partes (ModalCadastroRapidoParte).
// Ficam aqui para NÃO duplicar máscara/validação entre telas.
// ============================================================
import React, { useState } from 'react';

// ------------------------------------------------------------
// LINHA TELEFONE — número com máscara adaptativa + descrição livre
// ------------------------------------------------------------
export function LinhaFone({ tel, index, onChange, onRemove, somenteLeitura = false }) {
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
        className="form-control"
        style={{ flex: 2 }}
        placeholder="(11) 99999-9999"
        value={tel.numero}
        maxLength={15}
        disabled={somenteLeitura}
        onChange={e => onChange({ ...tel, numero: mascaraTelefone(e.target.value) })}
      />
      {/* Descrição livre: Celular, Comercial, esposa Edna, recado... */}
      <input
        className="form-control"
        style={{ flex: 1 }}
        placeholder="Descrição do Telefone"
        value={tel.tipo || ''}
        disabled={somenteLeitura}
        onChange={e => onChange({ ...tel, tipo: e.target.value })}
      />
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
export function LinhaEmail({ email, index, onChange, onRemove, somenteLeitura = false }) {
  const [erroEmail, setErroEmail] = useState('');
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function handleBlur() {
    if (email && !emailRegex.test(email.trim())) {
      setErroEmail('E-mail inválido');
    } else {
      setErroEmail('');
    }
  }

  return (
    <div style={{ marginBottom: erroEmail ? '4px' : '8px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          className={`form-control ${erroEmail ? 'is-invalid' : ''}`}
          style={{ flex: 1 }}
          placeholder="email@exemplo.com"
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
      {erroEmail && <small style={{ color: '#e74c3c', fontSize: '12px' }}>⚠️ {erroEmail}</small>}
    </div>
  );
}
