// ============================================================
// PENDÊNCIAS DE DOCUMENTOS
// Clientes (PF ou PJ) que fizeram o cadastro mas ainda DEVEM documentos,
// deixando a abertura do processo suspensa. A pendência mora no cliente —
// não depende de existir processo ou pasta.
//
// Quem tem "pendencias/visualizar" vê as pendências de TODOS os clientes.
// Ao marcar o último documento como recebido, a pendência se resolve sozinha.
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { pendenciasDocAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatarData, hojeLocal } from '../../utils/formatters';
import MenuAcoes from '../../components/MenuAcoes';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import useEscFechar from '../../hooks/useEscFechar';

const STATUS_INFO = {
  aberta:    { texto: 'Aberta',    cor: '#b45309', fundo: '#fffbeb', borda: '#fde68a' },
  resolvida: { texto: 'Resolvida', cor: '#15803d', fundo: '#f0fdf4', borda: '#bbf7d0' },
  cancelada: { texto: 'Cancelada', cor: '#6b7280', fundo: '#f3f4f6', borda: '#e5e7eb' },
};

// ============================================================
// PÁGINA
// ============================================================
export default function PendenciasDocumento() {
  const { temPermissao } = useAuth();
  const podeCadastrar = temPermissao('pendencias', 'cadastrar');
  const podeAlterar   = temPermissao('pendencias', 'alterar');
  const podeExcluir   = temPermissao('pendencias', 'excluir');
  const podeGerenciarTipos =
    temPermissao('pendencias.tipos', 'cadastrar') ||
    temPermissao('pendencias.tipos', 'alterar') ||
    temPermissao('pendencias.tipos', 'excluir');

  const [lista, setLista]           = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [usuarios, setUsuarios]     = useState([]);
  const [tipos, setTipos]           = useState([]);
  const [filtros, setFiltros]       = useState({ status: 'aberta', responsavel_id: '', busca: '', aviso: '' });
  const [modal, setModal]           = useState(null);   // null | {} (nova) | { id } (editar)
  const [catalogo, setCatalogo]     = useState(false);
  const [confirmar, setConfirmar]   = useState(null);
  const [aviso, setAviso]           = useState('');     // faixa de erro/informação no topo da lista

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const params = {};
      if (filtros.status)          params.status = filtros.status;
      if (filtros.responsavel_id)  params.responsavel_id = filtros.responsavel_id;
      if (filtros.busca.trim())    params.busca = filtros.busca.trim();
      if (filtros.aviso)           params.aviso = filtros.aviso;
      const { data } = await pendenciasDocAPI.listar(params);
      setLista(data.dados || []);
    } catch {
      setAviso('Não foi possível carregar as pendências. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    pendenciasDocAPI.usuarios().then(r => setUsuarios(r.data.dados || [])).catch(() => {});
    carregarTipos();
  }, []);

  function carregarTipos() {
    pendenciasDocAPI.tipos().then(r => setTipos(r.data.dados || [])).catch(() => {});
  }

  function limparFiltros() {
    setFiltros({ status: 'aberta', responsavel_id: '', busca: '', aviso: '' });
  }

  const filtroAtivo = filtros.status !== 'aberta' || filtros.responsavel_id || filtros.busca.trim() || filtros.aviso;

  function pedirCancelar(p) {
    setConfirmar({
      titulo: 'Cancelar pendência',
      mensagem: `Cancelar a pendência de documentos de "${p.cliente_nome}"? Ela sai da lista de abertas mas continua no histórico.`,
      textoBotao: 'Cancelar pendência',
      tipo: 'aviso',
      acao: async () => {
        try { await pendenciasDocAPI.cancelar(p.id); carregar(); }
        catch (e) { setAviso(e.response?.data?.mensagem || 'Não foi possível cancelar.'); }
      },
    });
  }

  function pedirExcluir(p) {
    setConfirmar({
      titulo: 'Excluir pendência',
      mensagem: `Excluir DEFINITIVAMENTE a pendência de "${p.cliente_nome}" e a lista de documentos dela? Esta ação não pode ser desfeita.`,
      textoBotao: '🗑️ Excluir',
      tipo: 'perigo',
      acao: async () => {
        try { await pendenciasDocAPI.excluir(p.id); carregar(); }
        catch (e) { setAviso(e.response?.data?.mensagem || 'Não foi possível excluir.'); }
      },
    });
  }

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e2a3a', margin: 0 }}>Pendências de Documentos</h2>
          <p style={{ color: '#666', fontSize: 13, margin: '4px 0 0' }}>
            Clientes que devem documentos — o processo fica aguardando a entrega
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {podeGerenciarTipos && (
            <button className="btn btn-outline" onClick={() => setCatalogo(true)}>Gerenciar documentos</button>
          )}
          {podeCadastrar && (
            <button className="btn btn-primary" onClick={() => setModal({})}>+ Nova pendência</button>
          )}
        </div>
      </div>

      {aviso && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
          borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 13,
          display: 'flex', justifyContent: 'space-between', gap: 8,
        }}>
          <span>⚠️ {aviso}</span>
          <button type="button" onClick={() => setAviso('')}
            style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 220, flex: 1 }}>
          <label className="form-label" style={{ fontSize: 12 }}>Buscar cliente</label>
          <input className="form-control" placeholder="Nome do cliente..."
            value={filtros.busca} onChange={e => setFiltros(f => ({ ...f, busca: e.target.value }))} />
        </div>
        <div style={{ minWidth: 150 }}>
          <label className="form-label" style={{ fontSize: 12 }}>Situação</label>
          <select className="form-control" value={filtros.status}
            onChange={e => setFiltros(f => ({ ...f, status: e.target.value }))}>
            <option value="aberta">Abertas</option>
            <option value="resolvida">Resolvidas</option>
            <option value="cancelada">Canceladas</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        <div style={{ minWidth: 180 }}>
          <label className="form-label" style={{ fontSize: 12 }}>Responsável</label>
          <select className="form-control" value={filtros.responsavel_id}
            onChange={e => setFiltros(f => ({ ...f, responsavel_id: e.target.value }))}>
            <option value="">Todos</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 170 }}>
          <label className="form-label" style={{ fontSize: 12 }}>Aviso</label>
          <select className="form-control" value={filtros.aviso}
            onChange={e => setFiltros(f => ({ ...f, aviso: e.target.value }))}>
            <option value="">Qualquer</option>
            <option value="vencido">Aviso vencido (abertas)</option>
          </select>
        </div>
        {filtroAtivo && (
          <button className="btn btn-secondary" onClick={limparFiltros}>Limpar</button>
        )}
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding: 0 }}>
        {carregando ? (
          <div className="loading">Carregando...</div>
        ) : lista.length === 0 ? (
          <div className="lista-vazia">
            {filtroAtivo ? 'Nenhuma pendência encontrada para os filtros.' : 'Nenhuma pendência de documentos registrada.'}
          </div>
        ) : (
          <div className="tabela-wrapper" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <table className="tabela tabela-sticky">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Documentos pendentes</th>
                  <th style={{ width: 90 }}>Recebidos</th>
                  <th style={{ width: 150 }}>Responsável</th>
                  <th style={{ width: 90 }}>Aberta há</th>
                  <th style={{ width: 120 }}>Avisar em</th>
                  <th style={{ width: 100 }}>Situação</th>
                  <th style={{ width: 60 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(p => {
                  const st = STATUS_INFO[p.status] || STATUS_INFO.aberta;
                  const docs = (p.documentos_pendentes || '').split(' | ').filter(Boolean);
                  const avisoVencido = p.status === 'aberta' && p.data_aviso && String(p.data_aviso).slice(0, 10) <= hojeLocal();
                  const acoes = [
                    { label: podeAlterar ? 'Abrir / editar' : 'Abrir', icone: '📂', onClick: () => setModal({ id: p.id }) },
                  ];
                  if (podeAlterar && p.status !== 'cancelada') acoes.push({ label: 'Cancelar pendência', icone: '🚫', onClick: () => pedirCancelar(p) });
                  if (podeExcluir) acoes.push({ label: 'Excluir', icone: '🗑️', perigo: true, onClick: () => pedirExcluir(p) });
                  return (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setModal({ id: p.id })}>
                      <td>
                        <strong style={{ color: '#1e2a3a' }}>{p.cliente_nome || <span style={{ color: '#bbb' }}>—</span>}</strong>
                        <span style={{
                          marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#64748b',
                          background: '#f1f5f9', borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase',
                        }}>{p.tipo_pessoa === 'juridica' ? 'PJ' : 'PF'}</span>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {docs.length === 0
                          ? <span style={{ color: '#15803d' }}>Todos recebidos</span>
                          : (
                            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {docs.map((d, i) => (
                                <span key={i} style={{
                                  background: '#eaf2ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                                  borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 500,
                                }}>{d}</span>
                              ))}
                            </span>
                          )}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 13 }}>{p.itens_recebidos}/{p.total_itens}</td>
                      <td style={{ fontSize: 13 }}>{p.responsavel_nome}</td>
                      <td style={{ textAlign: 'center', fontSize: 13 }}>
                        {p.dias_aberta != null ? `${p.dias_aberta}d` : '—'}
                      </td>
                      <td style={{ fontSize: 13, color: avisoVencido ? '#dc2626' : '#374151', fontWeight: avisoVencido ? 700 : 400 }}>
                        {p.data_aviso ? formatarData(p.data_aviso) : <span style={{ color: '#bbb' }}>—</span>}
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: st.cor, background: st.fundo,
                          border: `1px solid ${st.borda}`, borderRadius: 999, padding: '2px 9px',
                        }}>{st.texto}</span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <MenuAcoes itens={acoes} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <ModalPendencia
          pendenciaId={modal.id || null}
          usuarios={usuarios}
          tipos={tipos}
          podeAlterar={podeAlterar}
          podeGerenciarTipos={podeGerenciarTipos}
          onGerenciarTipos={() => setCatalogo(true)}
          onFechar={(recarregar) => { setModal(null); if (recarregar) carregar(); }}
        />
      )}

      {catalogo && (
        <ModalCatalogoTipos
          onFechar={() => setCatalogo(false)}
          onAtualizado={carregarTipos}
        />
      )}

      {confirmar && (
        <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />
      )}
    </div>
  );
}

// ============================================================
// MODAL — NOVA / EDITAR PENDÊNCIA
// ============================================================
function ModalPendencia({ pendenciaId, usuarios, tipos, podeAlterar, podeGerenciarTipos, onGerenciarTipos, onFechar }) {
  const editando = !!pendenciaId;
  const overlayRef = useEscFechar(() => onFechar(false));

  const [carregando, setCarregando] = useState(editando);
  const [salvando, setSalvando]     = useState(false);
  const [aviso, setAviso]           = useState('');
  const refResponsavel = useRef(null);

  const [cliente, setCliente]   = useState(null); // { tipo_pessoa, pessoa_id, nome }
  const [status, setStatus]     = useState('aberta');
  const [itens, setItens]       = useState([]);   // itens salvos (edição): { id, tipo_documento_id, tipo_nome, recebido, ... }
  const [form, setForm] = useState({
    responsavel_id: '', avisar_sino: true, avisar_email: false, data_aviso: '', observacao: '',
  });
  const [tiposSel, setTiposSel] = useState([]);   // ids de tipo_documento selecionados

  useEffect(() => {
    if (!editando) return;
    setCarregando(true);
    pendenciasDocAPI.buscar(pendenciaId)
      .then(r => {
        const d = r.data.dados;
        setCliente({ tipo_pessoa: d.tipo_pessoa, pessoa_id: d.pessoa_id, nome: d.cliente_nome });
        setStatus(d.status);
        setItens(d.itens || []);
        setTiposSel((d.itens || []).map(i => i.tipo_documento_id));
        setForm({
          responsavel_id: String(d.responsavel_id || ''),
          avisar_sino: !!d.avisar_sino,
          avisar_email: !!d.avisar_email,
          data_aviso: d.data_aviso ? String(d.data_aviso).slice(0, 10) : '',
          observacao: d.observacao || '',
        });
      })
      .catch(() => setAviso('Não foi possível carregar esta pendência.'))
      .finally(() => setCarregando(false));
  }, [editando, pendenciaId]);

  function avisar(msg, campo) {
    setAviso(msg);
    if (campo) setTimeout(() => campo.focus(), 0);
  }

  // Marca/desmarca um documento como recebido (edição) — efeito imediato no servidor.
  async function alternarRecebido(item) {
    const novo = !item.recebido;
    try {
      const { data } = await pendenciasDocAPI.marcarItem(pendenciaId, item.id, novo);
      setItens(prev => prev.map(i => i.id === item.id
        ? { ...i, recebido: novo ? 1 : 0, data_recebimento: novo ? hojeLocal() : null }
        : i));
      if (data.dados?.status) setStatus(data.dados.status);
    } catch (e) {
      setAviso(e.response?.data?.mensagem || 'Não foi possível atualizar o documento.');
    }
  }

  async function salvar() {
    setAviso('');
    if (!editando && !cliente) return avisar('Selecione o cliente.');
    if (!form.responsavel_id)  return avisar('Selecione o usuário responsável.', refResponsavel.current);
    if (!tiposSel.length)      return avisar('Selecione pelo menos um documento pendente.');

    setSalvando(true);
    try {
      const payload = {
        responsavel_id: Number(form.responsavel_id),
        avisar_sino: form.avisar_sino,
        avisar_email: form.avisar_email,
        data_aviso: form.data_aviso || null,
        observacao: form.observacao,
        tipos: tiposSel,
      };
      if (editando) {
        await pendenciasDocAPI.atualizar(pendenciaId, payload);
      } else {
        await pendenciasDocAPI.criar({ ...payload, tipo_pessoa: cliente.tipo_pessoa, pessoa_id: cliente.pessoa_id });
      }
      onFechar(true);
    } catch (e) {
      avisar(e.response?.data?.mensagem || 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  const somenteLeitura = editando && !podeAlterar;
  // Itens salvos que continuam selecionados — são os que exibem o checkbox "recebido"
  const itensVisiveis = itens.filter(i => tiposSel.includes(i.tipo_documento_id));

  return (
    <div className="modal-overlay" ref={overlayRef}>
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>{editando ? 'Pendência de documentos' : 'Nova pendência de documentos'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>

        <div className="modal-body">
          {aviso && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
              borderRadius: 6, padding: '8px 10px', marginBottom: 12, fontSize: 13,
              display: 'flex', justifyContent: 'space-between', gap: 8,
              position: 'sticky', top: 0, zIndex: 5,
            }}>
              <span>⚠️ {aviso}</span>
              <button type="button" onClick={() => setAviso('')}
                style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>✕</button>
            </div>
          )}

          {carregando ? (
            <div className="loading">Carregando...</div>
          ) : (
            <>
              {/* Cliente */}
              <div className="form-group">
                <label className="form-label obrigatorio">Cliente</label>
                {editando ? (
                  <input className="form-control" value={cliente?.nome || ''} disabled
                    style={{ background: '#f8fafc' }} />
                ) : (
                  <SeletorCliente onSelecionar={setCliente} selecionado={cliente} />
                )}
                {editando && (
                  <small style={{ color: '#94a3b8', fontSize: 12 }}>
                    O cliente não muda depois de criada — para outro cliente, abra uma nova pendência.
                  </small>
                )}
              </div>

              {/* Documentos pendentes (a lista de tipos) */}
              <div className="form-group">
                <label className="form-label obrigatorio">Documentos que faltam</label>
                <SeletorDocumentos
                  tipos={tipos}
                  selecionados={tiposSel}
                  onChange={setTiposSel}
                  somenteLeitura={somenteLeitura}
                  podeGerenciar={podeGerenciarTipos}
                  onGerenciar={onGerenciarTipos}
                />
              </div>

              {/* Recebimento (edição) */}
              {editando && itensVisiveis.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Recebimento</label>
                  <div style={{ border: '1px solid #edf2f7', borderRadius: 8, overflow: 'hidden' }}>
                    {itensVisiveis.map((i, idx) => (
                      <label key={i.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                        borderBottom: idx < itensVisiveis.length - 1 ? '1px solid #f1f5f9' : 'none',
                        background: i.recebido ? '#f0fdf4' : '#fff', cursor: somenteLeitura ? 'default' : 'pointer', fontSize: 13,
                      }}>
                        <input type="checkbox" checked={!!i.recebido} disabled={somenteLeitura}
                          onChange={() => alternarRecebido(i)} style={{ accentColor: '#16a34a' }} />
                        <span style={{ flex: 1 }}>{i.tipo_nome}</span>
                        {i.recebido
                          ? <span style={{ color: '#15803d', fontSize: 12 }}>recebido {i.data_recebimento ? `em ${formatarData(i.data_recebimento)}` : ''}</span>
                          : <span style={{ color: '#b45309', fontSize: 12 }}>pendente</span>}
                      </label>
                    ))}
                  </div>
                  {status === 'resolvida' && (
                    <small style={{ color: '#15803d', fontSize: 12 }}>
                      ✅ Todos os documentos foram recebidos — pendência resolvida.
                    </small>
                  )}
                </div>
              )}

              {/* Responsável + aviso */}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label obrigatorio">Responsável pela cobrança</label>
                  <select className="form-control" ref={refResponsavel} disabled={somenteLeitura}
                    value={form.responsavel_id}
                    onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}>
                    <option value="">— Selecione —</option>
                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Avisar o responsável em</label>
                  <input type="date" className="form-control" disabled={somenteLeitura}
                    value={form.data_aviso}
                    onChange={e => setForm(f => ({ ...f, data_aviso: e.target.value }))} />
                  <small style={{ color: '#94a3b8', fontSize: 12 }}>Opcional. Deixe vazio para não agendar aviso.</small>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Como avisar</label>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: somenteLeitura ? 'default' : 'pointer' }}>
                    <input type="checkbox" disabled={somenteLeitura} checked={form.avisar_sino}
                      onChange={e => setForm(f => ({ ...f, avisar_sino: e.target.checked }))} />
                    Sino do sistema
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: somenteLeitura ? 'default' : 'pointer' }}>
                    <input type="checkbox" disabled={somenteLeitura} checked={form.avisar_email}
                      onChange={e => setForm(f => ({ ...f, avisar_email: e.target.checked }))} />
                    E-mail
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Observações</label>
                <textarea className="form-control" rows={3} maxLength={1000} disabled={somenteLeitura}
                  placeholder="Ex.: cliente vai trazer na próxima semana; falta reconhecer firma..."
                  value={form.observacao}
                  onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} />
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={() => onFechar(false)}>
            {somenteLeitura ? 'Fechar' : 'Cancelar'}
          </button>
          {!somenteLeitura && (
            <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando || carregando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SELETOR DE CLIENTE (PF ou PJ) — busca no servidor
// ============================================================
function SeletorCliente({ onSelecionar, selecionado }) {
  const [busca, setBusca]       = useState('');
  const [resultados, setResultados] = useState([]);
  const [aberto, setAberto]     = useState(false);
  const [buscando, setBuscando] = useState(false);
  const boxRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (selecionado) return; // já escolhido — não busca
    clearTimeout(timerRef.current);
    const termo = busca.trim();
    if (termo.length < 2) { setResultados([]); return; }
    timerRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const { data } = await pendenciasDocAPI.buscarClientes(termo);
        setResultados(data.dados || []);
        setAberto(true);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [busca, selecionado]);

  if (selecionado) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input className="form-control" value={selecionado.nome} disabled style={{ background: '#f8fafc' }} />
        <button type="button" className="btn btn-outline" onClick={() => { onSelecionar(null); setBusca(''); }}>
          Trocar
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}
      onBlur={e => { if (!boxRef.current?.contains(e.relatedTarget)) setAberto(false); }}>
      <input className="form-control" placeholder="Digite o nome, CPF ou CNPJ do cliente..."
        value={busca} onChange={e => setBusca(e.target.value)} onFocus={() => resultados.length && setAberto(true)} />
      {buscando && <small style={{ color: '#888', fontSize: 12 }}>🔍 Buscando...</small>}
      {aberto && resultados.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40,
          background: '#fff', border: '1px solid #d9e1ec', borderRadius: 8,
          boxShadow: '0 12px 30px rgba(15,23,42,0.14)', maxHeight: 240, overflowY: 'auto',
        }}>
          {resultados.map(r => (
            <button key={`${r.tipo_pessoa}-${r.pessoa_id}`} type="button"
              onClick={() => { onSelecionar({ tipo_pessoa: r.tipo_pessoa, pessoa_id: r.pessoa_id, nome: r.nome }); setAberto(false); }}
              style={{
                display: 'flex', width: '100%', alignItems: 'center', gap: 8, textAlign: 'left',
                padding: '9px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 13,
              }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#64748b', background: '#f1f5f9',
                borderRadius: 4, padding: '1px 5px',
              }}>{r.tipo_pessoa === 'juridica' ? 'PJ' : 'PF'}</span>
              <span style={{ flex: 1 }}>{r.nome}</span>
              {r.documento && <span style={{ color: '#94a3b8', fontSize: 12 }}>{r.documento}</span>}
            </button>
          ))}
        </div>
      )}
      {aberto && !buscando && busca.trim().length >= 2 && resultados.length === 0 && (
        <div style={{ padding: '8px 4px', color: '#94a3b8', fontSize: 13 }}>Nenhum cliente encontrado.</div>
      )}
    </div>
  );
}

// ============================================================
// SELETOR DE DOCUMENTOS (chips + checklist) — mesma linguagem do seletor de assuntos
// ============================================================
function SeletorDocumentos({ tipos = [], selecionados = [], onChange, somenteLeitura = false, podeGerenciar, onGerenciar }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca]   = useState('');
  const boxRef = useRef(null);

  const selSet = new Set(selecionados);
  const escolhidos = tipos.filter(t => selSet.has(t.id));
  const norm = s => (s || '').normalize('NFD').replace(/[^\x00-\x7F]/g, '').toLowerCase();
  const buscaNorm = norm(busca.trim());
  const filtrados = !buscaNorm ? tipos : tipos.filter(t => norm(t.nome).includes(buscaNorm));

  function alternar(id) {
    if (somenteLeitura) return;
    onChange(selSet.has(id) ? selecionados.filter(x => x !== id) : [...selecionados, id]);
  }

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
      <div ref={boxRef} onBlur={e => { if (!boxRef.current?.contains(e.relatedTarget)) setAberto(false); }}
        style={{ flex: 1, position: 'relative' }}>
        <button type="button" className="form-control" disabled={somenteLeitura}
          onClick={() => { if (!somenteLeitura) setAberto(a => !a); }}
          style={{
            minHeight: 40, height: 'auto', display: 'grid', gridTemplateColumns: '1fr auto',
            alignItems: 'start', columnGap: 8, textAlign: 'left', padding: '7px 10px',
            cursor: somenteLeitura ? 'default' : 'pointer',
            background: somenteLeitura ? '#f8fafc' : '#fff',
            borderColor: aberto ? '#2d6be4' : '#d9e1ec',
          }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', maxHeight: 90, overflowY: 'auto' }}>
            {escolhidos.length === 0 && <span style={{ color: '#94a3b8' }}>Selecionar documentos...</span>}
            {escolhidos.map(t => (
              <span key={t.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#eaf2ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                borderRadius: 999, padding: '3px 9px', fontSize: 12, fontWeight: 500,
              }}>
                {t.nome}
                {!somenteLeitura && (
                  <span role="button" tabIndex={0}
                    onClick={e => { e.stopPropagation(); alternar(t.id); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); alternar(t.id); } }}
                    style={{ fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>×</span>
                )}
              </span>
            ))}
          </span>
          {!somenteLeitura && <span style={{ color: '#64748b', fontSize: 12, paddingTop: 5 }}>{aberto ? '▲' : '▼'}</span>}
        </button>

        {!somenteLeitura && aberto && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40,
            background: '#fff', border: '1px solid #d9e1ec', borderRadius: 8,
            boxShadow: '0 12px 30px rgba(15,23,42,0.14)', padding: 8,
          }}>
            <input className="form-control" autoFocus placeholder="Buscar documento..."
              value={busca} onChange={e => setBusca(e.target.value)}
              style={{ fontSize: 13, marginBottom: 8 }} />
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #edf2f7', borderRadius: 6 }}>
              {filtrados.length ? filtrados.map((t, idx) => (
                <label key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', fontSize: 13,
                  borderBottom: idx < filtrados.length - 1 ? '1px solid #f1f5f9' : 'none',
                  background: selSet.has(t.id) ? '#f0f7ff' : '#fff',
                }}>
                  <input type="checkbox" checked={selSet.has(t.id)} onChange={() => alternar(t.id)} style={{ accentColor: '#2d6be4' }} />
                  <span>{t.nome}</span>
                </label>
              )) : (
                <div style={{ padding: 10, color: '#94a3b8', fontSize: 13 }}>
                  Nenhum documento na lista. Use o botão “…” para cadastrar.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {!somenteLeitura && podeGerenciar && (
        <button type="button" className="btn btn-outline"
          style={{ minHeight: 40, padding: '0 10px', fontSize: 13, flexShrink: 0 }}
          onClick={onGerenciar}>…</button>
      )}
    </div>
  );
}

// ============================================================
// MODAL — CATÁLOGO DE TIPOS DE DOCUMENTO
// ============================================================
function ModalCatalogoTipos({ onFechar, onAtualizado }) {
  const { temPermissao } = useAuth();
  const overlayRef = useEscFechar(onFechar);
  const podeCadastrar = temPermissao('pendencias.tipos', 'cadastrar');
  const podeAlterar   = temPermissao('pendencias.tipos', 'alterar');
  const podeExcluir   = temPermissao('pendencias.tipos', 'excluir');

  const [lista, setLista]     = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo]       = useState('');
  const [editando, setEditando] = useState(null); // { id, nome }
  const [aviso, setAviso]     = useState('');
  const [confirmar, setConfirmar] = useState(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    pendenciasDocAPI.tipos()
      .then(r => setLista(r.data.dados || []))
      .catch(() => setAviso('Não foi possível carregar a lista.'))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function fechar() { onAtualizado?.(); onFechar(); }

  async function adicionar() {
    const nome = novo.trim();
    if (!nome) return setAviso('Digite o nome do documento.');
    try {
      await pendenciasDocAPI.criarTipo({ nome });
      setNovo(''); setAviso(''); carregar();
    } catch (e) { setAviso(e.response?.data?.mensagem || 'Não foi possível cadastrar.'); }
  }

  async function salvarEdicao() {
    const nome = (editando.nome || '').trim();
    if (!nome) return setAviso('O nome não pode ficar vazio.');
    try {
      await pendenciasDocAPI.atualizarTipo(editando.id, { nome });
      setEditando(null); setAviso(''); carregar();
    } catch (e) { setAviso(e.response?.data?.mensagem || 'Não foi possível salvar.'); }
  }

  function pedirExcluir(t) {
    setConfirmar({
      titulo: 'Remover documento da lista',
      mensagem: `Remover "${t.nome}" da lista de documentos? Se ele já estiver em uso em alguma pendência, será apenas desativado.`,
      textoBotao: 'Remover',
      tipo: 'aviso',
      acao: async () => {
        try { await pendenciasDocAPI.excluirTipo(t.id); setAviso(''); carregar(); }
        catch (e) { setAviso(e.response?.data?.mensagem || 'Não foi possível remover.'); }
      },
    });
  }

  return (
    <div className="modal-overlay" ref={overlayRef}>
      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
      <div className="modal-box" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3>Documentos (lista)</h3>
          <button className="modal-fechar" onClick={fechar}>✕</button>
        </div>
        <div className="modal-body">
          {aviso && (
            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
              borderRadius: 6, padding: '8px 10px', marginBottom: 12, fontSize: 13,
              display: 'flex', justifyContent: 'space-between', gap: 8,
            }}>
              <span>⚠️ {aviso}</span>
              <button type="button" onClick={() => setAviso('')}
                style={{ background: 'none', border: 'none', color: '#92400e', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>✕</button>
            </div>
          )}

          {podeCadastrar && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input className="form-control" placeholder="Novo documento — ex.: Certidão de casamento"
                value={novo} onChange={e => setNovo(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }} />
              <button className="btn btn-primary" onClick={adicionar}>Adicionar</button>
            </div>
          )}

          {carregando ? (
            <div className="loading">Carregando...</div>
          ) : lista.length === 0 ? (
            <div className="lista-vazia">Nenhum documento cadastrado.</div>
          ) : (
            <div style={{ border: '1px solid #edf2f7', borderRadius: 8, overflow: 'hidden' }}>
              {lista.map((t, idx) => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 13,
                  borderBottom: idx < lista.length - 1 ? '1px solid #f1f5f9' : 'none',
                }}>
                  {editando?.id === t.id ? (
                    <>
                      <input className="form-control" style={{ flex: 1 }} autoFocus
                        value={editando.nome}
                        onChange={e => setEditando(ed => ({ ...ed, nome: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); salvarEdicao(); } }} />
                      <button className="btn btn-primary btn-sm" onClick={salvarEdicao}>OK</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditando(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1 }}>{t.nome}</span>
                      {podeAlterar && (
                        <button className="btn btn-outline btn-sm" onClick={() => setEditando({ id: t.id, nome: t.nome })}>✏️</button>
                      )}
                      {podeExcluir && (
                        <button className="btn btn-outline btn-sm" onClick={() => pedirExcluir(t)}>🗑️</button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={fechar}>Concluído</button>
        </div>
      </div>
    </div>
  );
}
