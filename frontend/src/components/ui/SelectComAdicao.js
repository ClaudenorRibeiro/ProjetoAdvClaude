// ============================================================
// SELECT COM ADIÇÃO — select normal + botão "..." para cadastrar
// novo item diretamente na tela, sem abrir outra página.
// tipo: qualquer chave aceita por POST /pessoas/auxiliares/:tipo
// (hoje: generos, estados_civis, profissoes, nacionalidades,
// parentescos, instituicoes_financeiras).
// onNovoItem: callback chamado com { id, nome } após salvar.
// Extraído de Pessoas.js em 17/09/2026 para ser reaproveitado também
// no cadastro de contas bancárias (LinhaContaBancaria.js) — mesmo
// componente, sem duplicar o mini formulário de "adicionar novo".
// ============================================================
import React, { useState } from 'react';
import { pessoasAPI } from '../../services/api';
import { toast } from 'react-toastify';

export function SelectComAdicao({ label, value, onChange, opcoes = [], tipo, onNovoItem, somenteLeitura = false, placeholderNovo }) {
  const [miniFormAberto, setMiniFormAberto] = useState(false);
  const [novoNome, setNovoNome]             = useState('');
  const [salvando, setSalvando]             = useState(false);
  const [erroMini, setErroMini]             = useState(''); // aviso DENTRO do mini formulário

  // Fecha o mini form e limpa o estado — sem sujeira
  function fecharMiniForm() {
    setMiniFormAberto(false);
    setNovoNome('');
    setErroMini('');
  }

  async function salvarNovo() {
    setErroMini('');
    if (!novoNome.trim()) { setErroMini('Digite um nome para cadastrar.'); return; }
    setSalvando(true);
    try {
      const { data } = await pessoasAPI.criarAuxiliar(tipo, { nome: novoNome.trim() });
      if (data.ok) {
        toast.success(`"${data.dados.nome}" cadastrado com sucesso!`);
        onNovoItem(data.dados); // atualiza lista e auto-seleciona no form pai
        fecharMiniForm();
      }
    } catch (err) {
      setErroMini(err.response?.data?.mensagem || 'Não foi possível cadastrar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <select
          className="form-control"
          value={value}
          disabled={somenteLeitura}
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1 }}
        >
          <option value="">— Selecione —</option>
          {opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        {/* Botão "..." abre mini formulário para cadastrar novo item */}
        {!somenteLeitura && (
          <button
            type="button"
            title={`Cadastrar novo(a) ${label || 'item'} que não está na lista`}
            className="btn btn-outline"
            style={{ padding: '6px 10px', fontSize: '15px', flexShrink: 0, lineHeight: 1 }}
            onClick={() => setMiniFormAberto(v => !v)}
          >
            …
          </button>
        )}
      </div>

      {/* Mini formulário inline — aparece abaixo do select quando "..." é clicado */}
      {miniFormAberto && (
        <div style={{
          marginTop: '8px', padding: '10px 12px',
          background: '#f0f4ff', border: '1px solid #c5d0e6',
          borderRadius: '4px'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#444' }}>
            Novo(a) {label || 'item'}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              autoFocus
              className="form-control"
              placeholder={placeholderNovo || (label === 'Profissão' ? 'Ex.: Pedreiro' : label === 'Gênero' ? 'Ex.: Não binário' : 'Ex.: Viúvo(a)')}
              value={novoNome}
              onChange={e => { setErroMini(''); setNovoNome(e.target.value); }}
              onKeyDown={e => { if (e.key === 'Enter') salvarNovo(); if (e.key === 'Escape') fecharMiniForm(); }}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: '12px', padding: '6px 14px', flexShrink: 0 }}
              onClick={salvarNovo}
              disabled={salvando}
            >
              {salvando ? '...' : 'Salvar'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ fontSize: '12px', padding: '6px 10px', flexShrink: 0 }}
              onClick={fecharMiniForm}
            >
              ✕
            </button>
          </div>
          {erroMini && (
            <div style={{ marginTop: '6px', color: '#b91c1c', fontSize: '12px' }}>⚠️ {erroMini}</div>
          )}
        </div>
      )}
    </div>
  );
}
