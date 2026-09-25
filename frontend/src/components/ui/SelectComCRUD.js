// ============================================================
// SELECT COM CRUD — select pesquisável (SelectPesquisavel) + botão "…"
// para cadastrar um item novo sem sair do formulário, e (quando as props
// onEditar/onExcluir são passadas) ícones para renomear/excluir o item
// selecionado sem precisar ir em outra tela.
//
// Componente único e reutilizável para qualquer campo do sistema que seja
// uma lista de opções cadastráveis (tipo/subtipo de prazo, tipo de
// audiência, tipo de perícia, etc.) — evita duplicar essa lógica em cada
// página. Uma página que não precisa de editar/excluir simplesmente não
// passa onEditar/onExcluir e o campo se comporta como antes (só pesquisa
// e cadastra).
//
// onCriar(nome)          -> Promise<id>   (obrigatório para usar o botão "…")
// onEditar(id, nome)     -> Promise<void> (opcional; ausência oculta o ícone de editar)
// onExcluir(id)          -> Promise<void> (opcional; ausência oculta o ícone de excluir;
//                            deve rejeitar com a mensagem do backend quando o item
//                            estiver em uso — essa mensagem é mostrada ao usuário)
// ============================================================

import React, { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import SelectPesquisavel from './SelectPesquisavel';
import ModalConfirmar from './ModalConfirmar';

export default function SelectComCRUD({
  label, nomeEntidade, value, onChange, opcoes = [],
  placeholder = '— Selecione —', podeAdicionar = true,
  msgBloqueado = '', exemplo = '',
  onCriar, onEditar, onExcluir,
}) {
  const [aberto, setAberto]         = useState(false);
  const [novoNome, setNovoNome]     = useState('');
  const [salvando, setSalvando]     = useState(false);
  const [editando, setEditando]     = useState(false);
  const [nomeEdicao, setNomeEdicao] = useState('');
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const inputEdicaoRef = useRef(null);

  const itemSelecionado = opcoes.find(o => String(o.id) === String(value)) || null;

  function alternarAdicao() {
    if (!podeAdicionar) { if (msgBloqueado) toast.error(msgBloqueado); return; }
    setEditando(false);
    setAberto(v => !v);
  }
  function fecharAdicao() { setAberto(false); setNovoNome(''); }

  async function salvarNovo() {
    if (!novoNome.trim()) return toast.error('Digite um nome para cadastrar');
    setSalvando(true);
    try {
      const novoId = await onCriar(novoNome.trim());
      if (novoId) onChange(String(novoId));
      toast.success('Cadastrado com sucesso!');
      fecharAdicao();
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao cadastrar');
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao() {
    if (!itemSelecionado) return;
    setAberto(false);
    setNomeEdicao(itemSelecionado.nome);
    setEditando(true);
    setTimeout(() => inputEdicaoRef.current?.focus(), 0);
  }
  function fecharEdicao() { setEditando(false); setNomeEdicao(''); }

  async function salvarEdicao() {
    if (!nomeEdicao.trim()) return toast.error('Digite um nome');
    setSalvando(true);
    try {
      await onEditar(itemSelecionado.id, nomeEdicao.trim());
      toast.success('Atualizado com sucesso!');
      fecharEdicao();
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao atualizar');
    } finally {
      setSalvando(false);
    }
  }

  async function excluirSelecionado() {
    await onExcluir(itemSelecionado.id);
    onChange('');
    toast.success('Excluído com sucesso!');
  }

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <SelectPesquisavel
          ariaLabel={label}
          className="form-control"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          opcoes={[{ value: '', label: placeholder }, ...opcoes.map(o => ({ value: o.id, label: o.nome }))]}
        />
        <button type="button" title={`Cadastrar ${nomeEntidade} que não está na lista`}
          className="btn btn-outline"
          style={{ padding: '6px 10px', fontSize: '15px', flexShrink: 0, lineHeight: 1 }}
          onClick={alternarAdicao}>
          …
        </button>
        {onEditar && (
          <button type="button" title={`Renomear ${nomeEntidade} selecionado`}
            className="btn btn-outline"
            disabled={!itemSelecionado}
            style={{ padding: '6px 10px', fontSize: '14px', flexShrink: 0, lineHeight: 1, opacity: itemSelecionado ? 1 : 0.4 }}
            onClick={abrirEdicao}>
            ✎
          </button>
        )}
        {onExcluir && (
          <button type="button" title={`Excluir ${nomeEntidade} selecionado`}
            className="btn btn-outline"
            disabled={!itemSelecionado}
            style={{ padding: '6px 10px', fontSize: '14px', flexShrink: 0, lineHeight: 1, opacity: itemSelecionado ? 1 : 0.4 }}
            onClick={() => setConfirmarExcluir(true)}>
            🗑
          </button>
        )}
      </div>

      {aberto && (
        <div style={{ marginTop: '8px', padding: '10px 12px', background: '#f0f4ff',
                      border: '1px solid #c5d0e6', borderRadius: '4px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#444' }}>
            Novo {nomeEntidade}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input autoFocus className="form-control" placeholder={exemplo ? `Ex.: ${exemplo}` : ''}
              value={novoNome} onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') salvarNovo(); if (e.key === 'Escape') fecharAdicao(); }}
              style={{ flex: 1 }} />
            <button type="button" className="btn btn-primary"
              style={{ fontSize: '12px', padding: '6px 14px', flexShrink: 0 }}
              onClick={salvarNovo} disabled={salvando}>
              {salvando ? '...' : 'Salvar'}
            </button>
            <button type="button" className="btn btn-outline"
              style={{ fontSize: '12px', padding: '6px 10px', flexShrink: 0 }}
              onClick={fecharAdicao} disabled={salvando}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {editando && itemSelecionado && (
        <div style={{ marginTop: '8px', padding: '10px 12px', background: '#f0f4ff',
                      border: '1px solid #c5d0e6', borderRadius: '4px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#444' }}>
            Renomear {nomeEntidade}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input ref={inputEdicaoRef} className="form-control"
              value={nomeEdicao} onChange={e => setNomeEdicao(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') salvarEdicao(); if (e.key === 'Escape') fecharEdicao(); }}
              style={{ flex: 1 }} />
            <button type="button" className="btn btn-primary"
              style={{ fontSize: '12px', padding: '6px 14px', flexShrink: 0 }}
              onClick={salvarEdicao} disabled={salvando}>
              {salvando ? '...' : 'Salvar'}
            </button>
            <button type="button" className="btn btn-outline"
              style={{ fontSize: '12px', padding: '6px 10px', flexShrink: 0 }}
              onClick={fecharEdicao} disabled={salvando}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {confirmarExcluir && itemSelecionado && (
        <ModalConfirmar
          titulo={`Excluir ${nomeEntidade}`}
          mensagem={`Tem certeza que deseja excluir "${itemSelecionado.nome}"? Só é possível excluir se não estiver em uso.`}
          textoBotao="Excluir"
          tipo="perigo"
          acao={excluirSelecionado}
          onCancelar={() => setConfirmarExcluir(false)}
        />
      )}
    </div>
  );
}
