// ============================================================
// PÁGINA DE CADASTRO DE FÓRUNS
// CRUD completo: listar, criar, editar, excluir
// Apenas administradores (rota protegida no Layout)
// ============================================================

import React, { useState, useEffect } from 'react';
import { processosAPI } from '../../services/api';
import { toast } from 'react-toastify';
import ModalConfirmar from '../../components/ui/ModalConfirmar';

const FORM_VAZIO = {
  nome: '', abrev_nome: '', cep: '', logradouro: '',
  num_end: '', compl_end: '', bairro: '', cidade: '', uf: '',
};

export default function Foruns() {
  const [foruns,      setForuns]      = useState([]);
  const [confirmar,   setConfirmar]   = useState(null);
  const [carregando,  setCarregando]  = useState(true);
  const [modal,       setModal]       = useState(false);
  const [editando,    setEditando]    = useState(null);   // null = novo, objeto = editar
  const [form,        setForm]        = useState(FORM_VAZIO);
  const [salvando,    setSalvando]    = useState(false);
  const [busca,       setBusca]       = useState('');
  const [bloqueio,    setBloqueio]    = useState(null);  // { forum, varas: [] }

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const { data } = await processosAPI.auxiliares();
      setForuns(data.dados.foruns || []);
    } catch {
      toast.error('Erro ao carregar fóruns');
    } finally {
      setCarregando(false);
    }
  }

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setModal(true);
  }

  function abrirEditar(forum) {
    setEditando(forum);
    setForm({
      nome:       forum.nome       || '',
      abrev_nome: forum.abrev_nome || '',
      cep:        forum.cep        || '',
      logradouro: forum.logradouro || '',
      num_end:    forum.num_end    || '',
      compl_end:  forum.compl_end  || '',
      bairro:     forum.bairro     || '',
      cidade:     forum.cidade     || '',
      uf:         forum.uf         || '',
    });
    setModal(true);
  }

  function fecharModal() {
    setModal(false);
    setEditando(null);
    setForm(FORM_VAZIO);
  }

  // Helper para vincular campo ao form
  function campo(key) {
    return {
      value: form[key],
      onChange: e => setForm(f => ({ ...f, [key]: e.target.value })),
    };
  }

  async function salvar(e) {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSalvando(true);
    try {
      if (editando) {
        await processosAPI.atualizarForum(editando.id, form);
        toast.success('Fórum atualizado com sucesso!');
      } else {
        await processosAPI.criarForum(form);
        toast.success('Fórum criado com sucesso!');
      }
      fecharModal();
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao salvar fórum');
    } finally {
      setSalvando(false);
    }
  }

  function excluir(forum) {
    setConfirmar({
      titulo: 'Excluir Fórum',
      mensagem: `Excluir o fórum "${forum.nome}"? Esta ação não pode ser desfeita.`,
      textoBotao: '🗑️ Excluir',
      tipo: 'perigo',
      acao: async () => {
        try {
          await processosAPI.excluirForum(forum.id);
          toast.success('Fórum excluído!');
          carregar();
        } catch (err) {
          const detalhes = err.response?.data?.detalhes;
          if (detalhes?.varas?.length > 0) {
            // Backend bloqueou — mostra modal informativo com a lista de varas
            setBloqueio({ forum, varas: detalhes.varas });
          } else {
            toast.error(err.response?.data?.mensagem || 'Erro ao excluir fórum');
          }
        }
      },
    });
  }

  const forumsFiltrados = foruns.filter(f =>
    !busca ||
    f.nome?.toLowerCase().includes(busca.toLowerCase()) ||
    f.abrev_nome?.toLowerCase().includes(busca.toLowerCase()) ||
    f.cidade?.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e2a3a', margin: 0 }}>Fóruns</h2>
          <p style={{ color: '#666', fontSize: 13, margin: '4px 0 0' }}>
            Cadastro de fóruns e seus endereços
          </p>
        </div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Novo Fórum</button>
      </div>

      {/* Barra de busca */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <input
          className="form-control"
          style={{ maxWidth: 360 }}
          placeholder="Buscar por nome, abreviação ou cidade..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      {/* Tabela de fóruns */}
      <div className="card" style={{ padding: 0 }}>
        {carregando ? (
          <div className="loading">Carregando...</div>
        ) : forumsFiltrados.length === 0 ? (
          <div className="lista-vazia">
            {busca ? 'Nenhum fórum encontrado para a busca.' : 'Nenhum fórum cadastrado ainda.'}
          </div>
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Abreviação</th>
                  <th>Nome</th>
                  <th>Cidade / UF</th>
                  <th>Endereço</th>
                  <th style={{ width: 100 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {forumsFiltrados.map(f => (
                  <tr key={f.id}>
                    <td>
                      {f.abrev_nome
                        ? <strong style={{ color: '#1a56db' }}>{f.abrev_nome}</strong>
                        : <span style={{ color: '#bbb' }}>—</span>}
                    </td>
                    <td>{f.nome}</td>
                    <td>
                      {[f.cidade, f.uf].filter(Boolean).join(' / ') ||
                        <span style={{ color: '#bbb' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, color: '#666' }}>
                      {[f.logradouro, f.num_end, f.compl_end, f.bairro]
                        .filter(Boolean).join(', ') || <span style={{ color: '#bbb' }}>—</span>}
                      {f.cep && (
                        <span style={{ marginLeft: 6, color: '#999' }}>
                          CEP {f.cep}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-outline"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          title="Editar"
                          onClick={() => abrirEditar(f)}
                        >✏️</button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          title="Excluir"
                          onClick={() => excluir(f)}
                        >🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- MODAL CRIAR / EDITAR ---- */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box modal-grande">
            <div className="modal-header">
              <h3>{editando ? 'Editar Fórum' : 'Novo Fórum'}</h3>
              <button className="modal-fechar" onClick={fecharModal}>✕</button>
            </div>
            <form onSubmit={salvar}>
              <div className="modal-body">

                {/* Nome e Abreviação */}
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label obrigatorio">Nome completo</label>
                    <input
                      className="form-control"
                      placeholder="Ex: Fórum Trabalhista Barra Funda"
                      autoFocus
                      {...campo('nome')}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Abreviação{' '}
                      <span style={{ color: '#999', fontWeight: 400 }}>— exibida nos dropdowns</span>
                    </label>
                    <input
                      className="form-control"
                      placeholder="Ex: FT/B.Funda"
                      {...campo('abrev_nome')}
                    />
                  </div>
                </div>

                {/* Endereço */}
                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 14, marginTop: 4 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                    Endereço (opcional)
                  </p>

                  <div className="grid-3">
                    <div className="form-group">
                      <label className="form-label">CEP</label>
                      <input className="form-control" placeholder="00000000" maxLength={8} {...campo('cep')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Cidade</label>
                      <input className="form-control" placeholder="São Paulo" {...campo('cidade')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">UF</label>
                      <input
                        className="form-control"
                        placeholder="SP"
                        maxLength={2}
                        {...campo('uf')}
                        onBlur={e => setForm(f => ({ ...f, uf: e.target.value.toUpperCase() }))}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Logradouro</label>
                    <input className="form-control" placeholder="Rua / Avenida e nome" {...campo('logradouro')} />
                  </div>

                  <div className="grid-3">
                    <div className="form-group">
                      <label className="form-label">Número</label>
                      <input className="form-control" placeholder="100" {...campo('num_end')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Complemento</label>
                      <input className="form-control" placeholder="Bloco A" {...campo('compl_end')} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Bairro</label>
                      <input className="form-control" placeholder="Barra Funda" {...campo('bairro')} />
                    </div>
                  </div>
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

      {/* Modal de bloqueio — fórum tem varas vinculadas */}
      {bloqueio && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 460 }}>
            <div className="modal-header" style={{ borderBottom: '2px solid #f59e0b' }}>
              <h3 style={{ color: '#b45309' }}>⚠️ Não é possível excluir</h3>
              <button className="modal-fechar" onClick={() => setBloqueio(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12 }}>
                O fórum <strong>"{bloqueio.forum.nome}"</strong> não pode ser excluído porque possui{' '}
                {bloqueio.varas.length === 1
                  ? 'a seguinte vara vinculada:'
                  : `as seguintes ${bloqueio.varas.length} varas vinculadas:`}
              </p>
              <ul style={{
                margin: '0 0 16px 0',
                padding: '12px 16px',
                background: '#fef9c3',
                border: '1px solid #fde047',
                borderRadius: 6,
                listStyle: 'none',
              }}>
                {bloqueio.varas.map((nome, i) => (
                  <li key={i} style={{ padding: '3px 0', fontSize: 13, color: '#78350f' }}>
                    🏛️ {nome}
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: 13, color: '#666' }}>
                Acesse <strong>Varas</strong> e exclua essas varas antes de excluir o fórum.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setBloqueio(null)}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
