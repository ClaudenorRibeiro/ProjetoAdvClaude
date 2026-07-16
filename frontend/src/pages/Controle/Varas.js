// ============================================================
// PÁGINA DE CADASTRO DE VARAS
// CRUD completo: listar, criar, editar, excluir
// Cada vara é vinculada a um fórum
// Apenas administradores (rota protegida no Layout)
// ============================================================

import React, { useState, useEffect } from 'react';
import { processosAPI } from '../../services/api';
import { toast } from 'react-toastify';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import MenuAcoes from '../../components/MenuAcoes';

const FORM_VAZIO = {
  forum_id: '', nome: '', abrev_nome: '',
  codVaraNoProc: '', compl_end: '', tel: '', email: '',
};

export default function Varas() {
  const [varas,       setVaras]       = useState([]);
  const [confirmar,   setConfirmar]   = useState(null);
  const [foruns,      setForuns]      = useState([]);
  const [carregando,  setCarregando]  = useState(true);
  const [modal,       setModal]       = useState(false);
  const [editando,    setEditando]    = useState(null);
  const [form,        setForm]        = useState(FORM_VAZIO);
  const [salvando,    setSalvando]    = useState(false);
  const [filtroForum, setFiltroForum] = useState('');
  const [busca,       setBusca]       = useState('');
  const [bloqueio,    setBloqueio]    = useState(null);  // { vara, processos: [] }

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const { data } = await processosAPI.auxiliares();
      setForuns(data.dados.foruns || []);
      setVaras(data.dados.varas   || []);
    } catch {
      toast.error('Erro ao carregar varas');
    } finally {
      setCarregando(false);
    }
  }

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setModal(true);
  }

  function abrirEditar(vara) {
    setEditando(vara);
    setForm({
      forum_id:      String(vara.forum_id),
      nome:          vara.nome           || '',
      abrev_nome:    vara.abrev_nome     || '',
      codVaraNoProc: vara.codVaraNoProc  || '',
      compl_end:     vara.compl_end      || '',
      tel:           vara.tel            || '',
      email:         vara.email          || '',
    });
    setModal(true);
  }

  function fecharModal() {
    setModal(false);
    setEditando(null);
    setForm(FORM_VAZIO);
  }

  function campo(key) {
    return {
      value: form[key],
      onChange: e => setForm(f => ({ ...f, [key]: e.target.value })),
    };
  }

  async function salvar(e) {
    e.preventDefault();
    if (!form.nome.trim())  { toast.error('Nome é obrigatório');  return; }
    if (!form.forum_id)     { toast.error('Fórum é obrigatório'); return; }
    setSalvando(true);
    try {
      const dados = { ...form, forum_id: parseInt(form.forum_id) };
      if (editando) {
        await processosAPI.atualizarVara(editando.id, dados);
        toast.success('Vara atualizada com sucesso!');
      } else {
        await processosAPI.criarVara(dados);
        toast.success('Vara criada com sucesso!');
      }
      fecharModal();
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao salvar vara');
    } finally {
      setSalvando(false);
    }
  }

  function excluir(vara) {
    setConfirmar({
      titulo: 'Excluir Vara',
      mensagem: `Excluir a vara "${vara.nome}"? Esta ação não pode ser desfeita.`,
      textoBotao: '🗑️ Excluir',
      tipo: 'perigo',
      acao: async () => {
        try {
          await processosAPI.excluirVara(vara.id);
          toast.success('Vara excluída!');
          carregar();
        } catch (err) {
          const detalhes = err.response?.data?.detalhes;
          if (detalhes?.processos?.length > 0) {
            // Backend bloqueou — mostra modal com lista de processos
            setBloqueio({ vara, processos: detalhes.processos });
          } else {
            toast.error(err.response?.data?.mensagem || 'Erro ao excluir vara');
          }
        }
      },
    });
  }

  const varasFiltradas = varas.filter(v => {
    if (filtroForum && String(v.forum_id) !== filtroForum) return false;
    if (busca) {
      const b = busca.toLowerCase();
      return (
        v.nome?.toLowerCase().includes(b)          ||
        v.abrev_nome?.toLowerCase().includes(b)    ||
        v.forum_nome?.toLowerCase().includes(b)    ||
        v.codVaraNoProc?.toLowerCase().includes(b)
      );
    }
    return true;
  });

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e2a3a', margin: 0 }}>Varas</h2>
          <p style={{ color: '#666', fontSize: 13, margin: '4px 0 0' }}>
            Cadastro de varas vinculadas aos fóruns
          </p>
        </div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Nova Vara</button>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            className="form-control"
            style={{ maxWidth: 300 }}
            placeholder="Buscar por nome, abreviação, código CNJ..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
          <select
            className="form-control"
            style={{ maxWidth: 280 }}
            value={filtroForum}
            onChange={e => setFiltroForum(e.target.value)}
          >
            <option value="">Todos os fóruns</option>
            {foruns.map(f => (
              <option key={f.id} value={f.id}>{f.abrev_nome || f.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabela de varas */}
      <div className="card" style={{ padding: 0 }}>
        {carregando ? (
          <div className="loading">Carregando...</div>
        ) : varasFiltradas.length === 0 ? (
          <div className="lista-vazia">
            {busca || filtroForum
              ? 'Nenhuma vara encontrada para o filtro.'
              : 'Nenhuma vara cadastrada ainda.'}
          </div>
        ) : (
          <div className="tabela-wrapper" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <table className="tabela tabela-sticky">
              <thead>
                <tr>
                  <th>Fórum</th>
                  <th>Abreviação</th>
                  <th>Nome</th>
                  <th>Cód. CNJ</th>
                  <th>Complemento</th>
                  <th>Contato</th>
                  <th style={{ width: 60 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {varasFiltradas.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontSize: 12, color: '#555', maxWidth: 180 }}>
                      {v.forum_nome}
                    </td>
                    <td>
                      {v.abrev_nome
                        ? <strong style={{ color: '#1a56db' }}>{v.abrev_nome}</strong>
                        : <span style={{ color: '#bbb' }}>—</span>}
                    </td>
                    <td>{v.nome}</td>
                    <td style={{ fontSize: 12, fontFamily: 'monospace' }}>
                      {v.codVaraNoProc || <span style={{ color: '#bbb' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, color: '#666' }}>
                      {v.compl_end || <span style={{ color: '#bbb' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {v.tel   && <div>📞 {v.tel}</div>}
                      {v.email && <div>✉️ {v.email}</div>}
                      {!v.tel && !v.email && <span style={{ color: '#bbb' }}>—</span>}
                    </td>
                    <td>
                      <MenuAcoes itens={[
                        { label: 'Editar',  icone: '✏️', onClick: () => abrirEditar(v) },
                        { label: 'Excluir', icone: '🗑️', perigo: true, onClick: () => excluir(v) },
                      ]} />
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
              <h3>{editando ? 'Editar Vara' : 'Nova Vara'}</h3>
              <button className="modal-fechar" onClick={fecharModal}>✕</button>
            </div>
            <form onSubmit={salvar}>
              <div className="modal-body">

                {/* Fórum */}
                <div className="form-group">
                  <label className="form-label obrigatorio">Fórum</label>
                  <select className="form-control" {...campo('forum_id')} autoFocus>
                    <option value="">Selecione o fórum...</option>
                    {foruns.map(f => (
                      <option key={f.id} value={f.id}>{f.abrev_nome || f.nome}</option>
                    ))}
                  </select>
                </div>

                {/* Nome e Abreviação */}
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label obrigatorio">Nome completo</label>
                    <input
                      className="form-control"
                      placeholder="Ex: 1ª Vara do Trabalho"
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
                      placeholder="Ex: 1ªVT/SP"
                      {...campo('abrev_nome')}
                    />
                  </div>
                </div>

                {/* Código CNJ e Complemento */}
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">
                      Código CNJ{' '}
                      <span style={{ color: '#999', fontWeight: 400 }}>— segmento de vara no nº do processo</span>
                    </label>
                    <input
                      className="form-control"
                      placeholder="Ex: 5.02.0001"
                      maxLength={15}
                      style={{ fontFamily: 'monospace' }}
                      {...campo('codVaraNoProc')}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Complemento de endereço{' '}
                      <span style={{ color: '#999', fontWeight: 400 }}>— mesmo endereço do fórum</span>
                    </label>
                    <input
                      className="form-control"
                      placeholder="Ex: 4º andar, Bloco B, térreo..."
                      {...campo('compl_end')}
                    />
                  </div>
                </div>

                {/* Contato da vara */}
                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 14, marginTop: 4 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                    Contato da vara
                  </p>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Telefone</label>
                      <input
                        className="form-control"
                        placeholder="(11) 0000-0000"
                        {...campo('tel')}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">E-mail</label>
                      <input
                        className="form-control"
                        type="email"
                        placeholder="vara@trt.jus.br"
                        {...campo('email')}
                      />
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

      {/* Modal de bloqueio — vara tem processos vinculados */}
      {bloqueio && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div className="modal-header" style={{ borderBottom: '2px solid #f59e0b' }}>
              <h3 style={{ color: '#b45309' }}>⚠️ Não é possível excluir</h3>
              <button className="modal-fechar" onClick={() => setBloqueio(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12 }}>
                A vara <strong>"{bloqueio.vara.nome}"</strong> não pode ser excluída porque possui{' '}
                {bloqueio.processos.length === 1
                  ? 'o seguinte processo vinculado:'
                  : `os seguintes ${bloqueio.processos.length} processos vinculados:`}
              </p>
              <ul style={{
                margin: '0 0 16px 0',
                padding: '12px 16px',
                background: '#fef9c3',
                border: '1px solid #fde047',
                borderRadius: 6,
                listStyle: 'none',
                maxHeight: 200,
                overflowY: 'auto',
              }}>
                {bloqueio.processos.map((numProc, i) => (
                  <li key={i} style={{ padding: '3px 0', fontSize: 13, color: '#78350f', fontFamily: 'monospace' }}>
                    📄 {numProc}
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: 13, color: '#666' }}>
                Altere a vara desses processos antes de excluir esta vara.
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
