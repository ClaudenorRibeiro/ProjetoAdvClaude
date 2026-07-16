// ============================================================
// PÁGINA DE CADASTRO DE FORMAS DE PAGAMENTO (menu Controle)
// CRUD simples: listar, criar, renomear, excluir (soft-delete).
// Usadas no financeiro: recebimento do réu e repasses ao cliente/parceiro.
// Apenas administradores (rota no menu é apenasAdmin).
// ============================================================

import React, { useState, useEffect } from 'react';
import { financeiroAPI } from '../../services/api';
import { toast } from 'react-toastify';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import MenuAcoes from '../../components/MenuAcoes';

export default function FormasPagamento() {
  const [formas,     setFormas]     = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modal,      setModal]      = useState(false);
  const [editando,   setEditando]   = useState(null);  // forma em edição (ou null = nova)
  const [nome,       setNome]       = useState('');
  const [salvando,   setSalvando]   = useState(false);
  const [confirmar,  setConfirmar]  = useState(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const { data } = await financeiroAPI.formasPagamento();
      if (data.ok) setFormas(data.dados);
    } catch {
      toast.error('Erro ao carregar formas de pagamento');
    } finally {
      setCarregando(false);
    }
  }

  function abrirNovo()        { setEditando(null); setNome(''); setModal(true); }
  function abrirEditar(f)     { setEditando(f); setNome(f.nome || ''); setModal(true); }
  function fecharModal()      { setModal(false); setEditando(null); setNome(''); }

  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSalvando(true);
    try {
      if (editando) {
        await financeiroAPI.atualizarFormaPagamento(editando.id, { nome: nome.trim() });
        toast.success('Forma de pagamento atualizada!');
      } else {
        await financeiroAPI.criarFormaPagamento({ nome: nome.trim() });
        toast.success('Forma de pagamento criada!');
      }
      fecharModal();
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  function excluir(f) {
    setConfirmar({
      titulo: 'Excluir forma de pagamento',
      mensagem: `Excluir "${f.nome}"? Ela deixará de aparecer nas listas, mas os lançamentos e recibos antigos continuam exibindo o nome.`,
      textoBotao: '🗑️ Excluir',
      tipo: 'perigo',
      acao: async () => {
        try {
          await financeiroAPI.excluirFormaPagamento(f.id);
          toast.success('Forma de pagamento removida!');
          carregar();
        } catch (err) {
          toast.error(err.response?.data?.mensagem || 'Erro ao excluir');
        }
      },
    });
  }

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e2a3a', margin: 0 }}>Formas de pagamento</h2>
          <p style={{ color: '#666', fontSize: 13, margin: '4px 0 0' }}>
            Usadas no recebimento do réu e nos repasses ao cliente/parceiro
          </p>
        </div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Nova forma</button>
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding: 0 }}>
        {carregando ? (
          <div className="loading">Carregando...</div>
        ) : formas.length === 0 ? (
          <div className="lista-vazia">Nenhuma forma de pagamento cadastrada ainda.</div>
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th style={{ width: 60 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {formas.map(f => (
                  <tr key={f.id}>
                    <td>{f.nome}</td>
                    <td>
                      <MenuAcoes itens={[
                        { label: 'Editar',  icone: '✏️', onClick: () => abrirEditar(f) },
                        { label: 'Excluir', icone: '🗑️', perigo: true, onClick: () => excluir(f) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal criar / editar */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>{editando ? 'Editar forma de pagamento' : 'Nova forma de pagamento'}</h3>
              <button className="modal-fechar" onClick={fecharModal}>✕</button>
            </div>
            <form onSubmit={salvar}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label obrigatorio">Nome</label>
                  <input className="form-control" placeholder="Ex.: PIX, TED, Dinheiro, Cheque, Cartão..."
                    value={nome} onChange={e => setNome(e.target.value)} autoFocus />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={fecharModal}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}
