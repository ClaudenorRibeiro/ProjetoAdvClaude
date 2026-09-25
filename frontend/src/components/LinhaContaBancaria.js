// ============================================================
// LINHA CONTA BANCÁRIA — cadastro de contas bancárias/PIX de Pessoas (PF/PJ)
// Usado só no ModalPessoa (Pessoas.js) por enquanto — campos demais para caber
// no padrão de linha única de telefone/e-mail (ver LinhasContato.js).
// "Própria" preenche titular/documento automaticamente com os dados da PRÓPRIA
// pessoa (nomeProprio/documentoProprio, vindos do formulário); "de outra pessoa"
// libera os dois campos para digitação livre (pode não ser cliente cadastrado).
// ============================================================
import React from 'react';
import { mascaraDocumento } from '../utils/formatters';
import { SelectComAdicao } from './ui/SelectComAdicao';

export function LinhaContaBancaria({
  conta, index, instituicoes = [], somenteLeitura = false,
  nomeProprio = '', documentoProprio = '',
  onChange, onRemove, onDefinirPrincipal, onNovoBanco,
}) {
  function alterar(campo, valor) { onChange({ ...conta, [campo]: valor }); }

  function alternarTerceiro(marcado) {
    // Ao voltar para "própria", limpa o que foi digitado — o nome/documento
    // certos são os da própria pessoa, preenchidos na hora de salvar.
    onChange({ ...conta, conta_terceiro: marcado, titular: marcado ? (conta.titular || '') : '', documento_titular: marcado ? (conta.documento_titular || '') : '' });
  }

  const semDocumentoProprio = !documentoProprio;

  return (
    <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '12px', marginBottom: '10px', background: somenteLeitura ? '#fafafa' : '#fff' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: 2, minWidth: '200px' }}>
          <SelectComAdicao
            label="Banco"
            value={conta.instituicao_financeira_id || ''}
            onChange={v => alterar('instituicao_financeira_id', v ? Number(v) : '')}
            opcoes={instituicoes}
            tipo="instituicoes_financeiras"
            onNovoItem={onNovoBanco}
            somenteLeitura={somenteLeitura}
            placeholderNovo="Ex.: Nubank"
          />
        </div>
        <select className="form-control" style={{ flex: 1, minWidth: '110px' }}
          value={conta.tipo || 'corrente'} disabled={somenteLeitura}
          onChange={e => alterar('tipo', e.target.value)}>
          <option value="corrente">Conta corrente</option>
          <option value="poupanca">Poupança</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <input className="form-control" style={{ flex: 1, minWidth: '90px' }} placeholder="Agência"
          value={conta.agencia || ''} disabled={somenteLeitura}
          onChange={e => alterar('agencia', e.target.value)} />
        <input className="form-control" style={{ flex: 1, minWidth: '110px' }} placeholder="Conta"
          value={conta.numero || ''} disabled={somenteLeitura}
          onChange={e => alterar('numero', e.target.value)} />
        <input className="form-control" style={{ flex: '0 0 70px' }} placeholder="Dígito"
          maxLength={4} value={conta.digito || ''} disabled={somenteLeitura}
          onChange={e => alterar('digito', e.target.value)} />
        <input className="form-control" style={{ flex: 2, minWidth: '150px' }} placeholder="Chave PIX"
          value={conta.chave_pix || ''} disabled={somenteLeitura}
          onChange={e => alterar('chave_pix', e.target.value)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <input type="checkbox" id={`conta-terceiro-${index}`} checked={!!conta.conta_terceiro}
          disabled={somenteLeitura} onChange={e => alternarTerceiro(e.target.checked)} />
        <label htmlFor={`conta-terceiro-${index}`} style={{ fontSize: '13px', cursor: somenteLeitura ? 'default' : 'pointer' }}>
          Conta de outra pessoa (autorização)
        </label>
      </div>

      {conta.conta_terceiro ? (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <input className="form-control" style={{ flex: 2, minWidth: '160px' }} placeholder="Nome do titular"
            value={conta.titular || ''} disabled={somenteLeitura}
            onChange={e => alterar('titular', e.target.value)} />
          <input className="form-control" style={{ flex: 1, minWidth: '140px' }} placeholder="CPF ou CNPJ do titular"
            value={conta.documento_titular || ''} disabled={somenteLeitura}
            onChange={e => alterar('documento_titular', mascaraDocumento(e.target.value))} />
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: '#777', marginBottom: '8px' }}>
          {semDocumentoProprio
            ? '⚠️ Esta pessoa não tem CPF/CNPJ cadastrado — cadastre antes ou marque "conta de outra pessoa".'
            : `Titular: ${nomeProprio}${documentoProprio ? ` — ${documentoProprio}` : ''}`}
        </div>
      )}

      <div style={{ marginBottom: '8px' }}>
        <textarea className="form-control" rows={2} placeholder="Observação / autorização da conta"
          value={conta.observacao || ''} disabled={somenteLeitura}
          onChange={e => alterar('observacao', e.target.value)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: somenteLeitura ? 'default' : 'pointer' }}>
          <input type="radio" name="conta-principal" checked={!!conta.principal}
            disabled={somenteLeitura} onChange={() => onDefinirPrincipal()} />
          Conta principal
        </label>
        {!somenteLeitura && (
          <button type="button" className="btn btn-danger" style={{ padding: '4px 10px' }} onClick={onRemove}>✕ Remover</button>
        )}
      </div>
    </div>
  );
}
