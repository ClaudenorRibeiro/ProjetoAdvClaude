// ============================================================
// PÁGINA DE AUXILIARES (menu Controle)
// Primeiro cadastro disponível: Profissões.
// Acesso restrito a admin/superadmin pela rota.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import { controleAuxiliaresAPI } from '../../services/api';
import { toast } from 'react-toastify';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import MenuAcoes from '../../components/MenuAcoes';
import useEscFechar from '../../hooks/useEscFechar';
import { ModalPessoa } from '../Pessoas/Pessoas';

export default function Auxiliares() {
  const [aba, setAba] = useState('profissoes');

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e2a3a', margin: 0 }}>Auxiliares</h2>
        <p style={{ color: '#666', fontSize: 13, margin: '4px 0 0' }}>
          Cadastros auxiliares usados nas telas do sistema
        </p>
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${aba === 'profissoes' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setAba('profissoes')}
          >
            Profissão
          </button>
        </div>
      </div>

      {aba === 'profissoes' && <CrudProfissoes />}
    </div>
  );
}

function CrudProfissoes() {
  const [profissoes, setProfissoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [nome, setNome] = useState('');
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [modalPessoas, setModalPessoas] = useState(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const { data } = await controleAuxiliaresAPI.listarProfissoes();
      if (data.ok) setProfissoes(data.dados || []);
    } catch {
      toast.error('Erro ao carregar profissões');
    } finally {
      setCarregando(false);
    }
  }

  const profissoesFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return profissoes;
    return profissoes.filter(p => String(p.nome || '').toLowerCase().includes(termo));
  }, [profissoes, busca]);

  function abrirNovo() {
    setEditando(null);
    setNome('');
    setModal(true);
  }

  function abrirEditar(profissao) {
    setEditando(profissao);
    setNome(profissao.nome || '');
    setModal(true);
  }

  function fecharModal() {
    setModal(false);
    setEditando(null);
    setNome('');
  }

  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    setSalvando(true);
    try {
      if (editando) {
        await controleAuxiliaresAPI.atualizarProfissao(editando.id, { nome: nome.trim() });
        toast.success('Profissão atualizada!');
      } else {
        await controleAuxiliaresAPI.criarProfissao({ nome: nome.trim() });
        toast.success('Profissão cadastrada!');
      }
      fecharModal();
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao salvar profissão');
    } finally {
      setSalvando(false);
    }
  }

  function excluir(profissao) {
    const total = Number(profissao.total_pessoas || 0);
    if (total > 0) {
      toast.error(`Não é possível excluir: existem ${total} pessoa(s) usando esta profissão`);
      return;
    }

    setConfirmar({
      titulo: 'Excluir profissão',
      mensagem: `Excluir "${profissao.nome}"? Esta ação só é permitida quando nenhuma pessoa está usando esta profissão.`,
      textoBotao: '🗑️ Excluir',
      tipo: 'perigo',
      acao: async () => {
        try {
          await controleAuxiliaresAPI.excluirProfissao(profissao.id);
          toast.success('Profissão excluída!');
          carregar();
        } catch (err) {
          toast.error(err.response?.data?.mensagem || 'Erro ao excluir profissão');
        }
      },
    });
  }

  function abrirPessoas(profissao) {
    if (Number(profissao.total_pessoas || 0) <= 0) return;
    setModalPessoas(profissao);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e2a3a', margin: 0 }}>Profissão</h3>
          <p style={{ color: '#666', fontSize: 13, margin: '4px 0 0' }}>
            Usada no cadastro de pessoas físicas e na seleção de peritos
          </p>
        </div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Nova profissão</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <input
          className="form-control"
          placeholder="Buscar profissão..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ maxWidth: 420 }}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {carregando ? (
          <div className="loading">Carregando...</div>
        ) : profissoesFiltradas.length === 0 ? (
          <div className="lista-vazia">Nenhuma profissão encontrada.</div>
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th style={{ width: 140 }}>Pessoas usando</th>
                  <th style={{ width: 60 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {profissoesFiltradas.map(p => (
                  <tr key={p.id}>
                    <td>{p.nome}</td>
                    <td>
                      {Number(p.total_pessoas || 0) > 0 ? (
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => abrirPessoas(p)}
                          title="Ver pessoas que usam esta profissão"
                          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, font: 'inherit' }}
                        >
                          {Number(p.total_pessoas || 0)}
                        </button>
                      ) : (
                        0
                      )}
                    </td>
                    <td>
                      <MenuAcoes itens={[
                        { label: 'Editar', icone: '✏️', onClick: () => abrirEditar(p) },
                        {
                          label: 'Excluir',
                          icone: '🗑️',
                          perigo: true,
                          onClick: () => excluir(p),
                        },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <ModalProfissao
          editando={editando}
          nome={nome}
          setNome={setNome}
          salvando={salvando}
          onFechar={fecharModal}
          onSalvar={salvar}
        />
      )}

      {modalPessoas && (
        <ModalPessoasDaProfissao
          profissao={modalPessoas}
          onFechar={() => setModalPessoas(null)}
          onAtualizarProfissoes={carregar}
        />
      )}

      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

function ModalPessoasDaProfissao({ profissao, onFechar, onAtualizarProfissoes }) {
  const overlayRef = useEscFechar(onFechar);
  const [pessoas, setPessoas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [editandoPessoa, setEditandoPessoa] = useState(null);

  useEffect(() => { carregar(); }, []); // eslint-disable-line

  async function carregar() {
    setCarregando(true);
    try {
      const { data } = await controleAuxiliaresAPI.pessoasPorProfissao(profissao.id);
      if (data.ok) setPessoas(data.dados?.pessoas || []);
    } catch {
      toast.error('Erro ao carregar pessoas desta profissão');
    } finally {
      setCarregando(false);
    }
  }

  async function fecharEdicao(recarregar) {
    setEditandoPessoa(null);
    if (recarregar) {
      await carregar();
      await onAtualizarProfissoes();
    }
  }

  return (
    <div className="modal-overlay" ref={overlayRef}>
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>Pessoas usando “{profissao.nome}”</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {carregando ? (
            <div className="loading">Carregando...</div>
          ) : pessoas.length === 0 ? (
            <div className="lista-vazia">Nenhuma pessoa usando esta profissão.</div>
          ) : (
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CPF</th>
                    <th>Telefone</th>
                    <th>E-mail</th>
                    <th style={{ width: 60 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pessoas.map(p => (
                    <tr key={p.id}>
                      <td>{p.nome}</td>
                      <td>{p.cpf || '—'}</td>
                      <td>{p.telefone || '—'}</td>
                      <td>{p.email || '—'}</td>
                      <td>
                        <MenuAcoes itens={[
                          { label: 'Editar pessoa', icone: '✏️', onClick: () => setEditandoPessoa(p) },
                        ]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>

      {editandoPessoa && (
        <ModalPessoa
          tipo="fisicas"
          pessoa={editandoPessoa}
          onFechar={fecharEdicao}
        />
      )}
    </div>
  );
}

function ModalProfissao({ editando, nome, setNome, salvando, onFechar, onSalvar }) {
  const overlayRef = useEscFechar(onFechar);

  return (
    <div className="modal-overlay" ref={overlayRef}>
      <div className="modal-box" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3>{editando ? 'Editar profissão' : 'Nova profissão'}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <form onSubmit={onSalvar}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label obrigatorio">Nome</label>
              <input
                className="form-control"
                placeholder="Ex.: Perícia médica, Advogado, Operador..."
                value={nome}
                onChange={e => setNome(e.target.value)}
                autoFocus
              />
              <small style={{ color: '#64748b', display: 'block', marginTop: 6 }}>
                Para aparecer como perito nas perícias, a profissão deve começar com “Perícia”.
              </small>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
