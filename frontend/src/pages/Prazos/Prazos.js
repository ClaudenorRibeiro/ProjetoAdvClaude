// ============================================================
// PÁGINA DE PRAZOS
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { prazosAPI, processosAPI } from '../../services/api';
import { formatarData, labelStatusPrazo, corPrazo, toTitleCase } from '../../utils/formatters';
import { toast } from 'react-toastify';
import { ModalGerar } from '../../components/GerarDocumento';
import { useAuth } from '../../context/AuthContext';
import ModalConfirmar from '../../components/ui/ModalConfirmar';

// Status calculados pela data — concluido/cancelado são os únicos armazenados no banco
// 'fazendo' é filtro auxiliar que mostra prazos ativos com alguém fazendo
const STATUS_OPCOES = ['agendado','pendente','atrasado','fazendo','concluido','cancelado'];
const STATUS_COR = {
  agendado:  'badge-azul',
  pendente:  'badge-laranja',
  atrasado:  'badge-vermelho',
  concluido: 'badge-verde',
  cancelado: 'badge-cinza',
};

// Aplica a máscara CNJ: 0000000-00.0000.0.00.0000
function mascaraCNJ(valor) {
  const n = valor.replace(/\D/g, '').substring(0, 20);
  let r = n.substring(0, 7);
  if (n.length > 7)  r += '-' + n.substring(7, 9);
  if (n.length > 9)  r += '.' + n.substring(9, 13);
  if (n.length > 13) r += '.' + n.substring(13, 14);
  if (n.length > 14) r += '.' + n.substring(14, 16);
  if (n.length > 16) r += '.' + n.substring(16, 20);
  return r;
}

// Retorna o label do status incluindo "Fazendo"
function labelStatus(s) {
  if (s === 'fazendo') return 'Fazendo';
  return labelStatusPrazo(s);
}

export default function Prazos() {
  const { temPermissao, usuario, ehAdmin } = useAuth();
  const [lista, setLista]                   = useState([]);
  const [total, setTotal]                   = useState(0);
  const [filtros, setFiltros]               = useState({ status: '', data_de: '', data_ate: '', pagina: 1 });
  const [tipos, setTipos]                   = useState({ tipos: [], subtipos: [] });
  const [carregando, setCarregando]         = useState(false);
  const [modalAberto, setModalAberto]       = useState(false);
  const [prazoEditando, setPrazoEditando]   = useState(null);
  const [prazoCancelando, setPrazoCancelando]   = useState(null);
  const [prazoHistorico, setPrazoHistorico]     = useState(null); // prazo selecionado para ver histórico
  const [confirmar, setConfirmar]               = useState(null);
  const [gerarDocPrazo, setGerarDocPrazo]       = useState(null); // prazo para gerar documento (via "Fazer")

  const LIMITE = 100;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await prazosAPI.listar({ ...filtros, limite: LIMITE });
      if (data.ok) { setLista(data.dados.registros); setTotal(data.dados.total); }
    } catch { toast.error('Erro ao carregar prazos'); }
    finally { setCarregando(false); }
  }, [filtros]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { prazosAPI.tipos().then(r => setTipos(r.data.dados)); }, []);

  // Marca o prazo como concluído (também libera o "Fazendo" automaticamente no backend)
  function concluirPrazo(id) {
    setConfirmar({
      titulo: 'Concluir Prazo',
      mensagem: 'Deseja marcar este prazo como Concluído? O status será atualizado para todos os usuários.',
      textoBotao: '✅ Concluir',
      tipo: 'sucesso',
      acao: async () => {
        await prazosAPI.mudarStatus(id, { status: 'concluido' });
        toast.success('Prazo concluído!');
        carregar();
      },
    });
  }

  async function fazerPrazo(p) {
    try {
      await prazosAPI.marcarFazendo(p.id);
      toast.success('Prazo marcado como "Fazendo"');
      carregar();
      // Quem assumiu o prazo pode gerar o documento (só se houver modelo para o subtipo).
      // Depois de assumido, o botão "Fazer" some, então esta é a única chance de gerar.
      if (Number(p.tem_modelo_doc) === 1) {
        setConfirmar({
          titulo: 'Gerar documento',
          mensagem: 'Deseja utilizar um modelo do sistema para este prazo?',
          textoBotao: 'Sim, escolher modelo',
          tipo: 'sucesso',
          acao: () => { setGerarDocPrazo(p); },
        });
      }
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao marcar prazo'); }
  }

  async function liberarFazendo(id) {
    try {
      await prazosAPI.liberarFazendo(id);
      toast.success('Prazo liberado');
      carregar();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao liberar prazo'); }
  }

  // Muda filtro e volta para página 1 (exceto quando muda a própria página)
  function setFiltro(k, v) {
    setFiltros(f => ({ ...f, [k]: v, ...(k !== 'pagina' ? { pagina: 1 } : {}) }));
  }

  function confirmarExcluir(id) {
    setConfirmar({
      titulo: 'Excluir Prazo',
      mensagem: 'Este prazo será removido permanentemente. Esta ação não pode ser desfeita.',
      textoBotao: '🗑️ Excluir',
      tipo: 'perigo',
      acao: async () => {
        await prazosAPI.excluir(id);
        toast.success('Prazo excluído');
        carregar();
      },
    });
  }

  return (
    <div>
      {/* Filtros */}
      <div className="card" style={{marginBottom:'16px'}}>
        <div style={{display:'flex',gap:'12px',flexWrap:'wrap',alignItems:'flex-end'}}>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Status</label>
            <select className="form-control" value={filtros.status} onChange={e=>setFiltro('status',e.target.value)}>
              <option value="">Todos</option>
              {STATUS_OPCOES.map(s => <option key={s} value={s}>{labelStatus(s)}</option>)}
            </select>
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Vencimento de</label>
            <input type="date" className="form-control" value={filtros.data_de} onChange={e=>setFiltro('data_de',e.target.value)} />
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Até</label>
            <input type="date" className="form-control" value={filtros.data_ate} onChange={e=>setFiltro('data_ate',e.target.value)} />
          </div>
          <button className="btn btn-secondary" style={{marginBottom:'1px'}}
            onClick={() => setFiltros({ status: '', data_de: '', data_ate: '', pagina: 1 })}>
            ✕ Limpar filtros
          </button>
          <button className="btn btn-primary" style={{marginBottom:'1px'}} onClick={() => setModalAberto(true)}>
            + Novo Prazo
          </button>
          <span style={{marginLeft:'auto',color:'#888',fontSize:'13px',marginBottom:'1px'}}>
            {total} prazo(s)
          </span>
        </div>
      </div>

      <div className="card">
        {carregando ? <div className="loading">Carregando...</div> : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Processo</th><th>Pasta</th><th>Prazo</th><th>Vencimento</th>
                  <th>Dias</th><th>Responsável</th><th>Quem faz</th><th>Status</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(p => {
                  const euFazendo     = p.fazendo_por === usuario?.id;
                  const outroFazendo  = p.fazendo_por && !euFazendo;
                  const ativo         = !['concluido','cancelado'].includes(p.status);
                  return (
                  <tr key={p.id} className={['concluido','cancelado'].includes(p.status) ? '' : corPrazo(p.dias_restantes)}>
                    <td>{p.processo_numero || '—'}</td>
                    <td>{p.pasta_numero_fmt} — {p.pasta_titulo}</td>
                    <td>{p.subtipo_nome || p.descricao || '—'}</td>
                    <td>{formatarData(p.data_vencimento)}</td>
                    <td>
                      {/* Prazo concluído ou cancelado não tem mais contagem de dias/atraso — mostra "—".
                          Só os prazos ativos (aberto/fazendo/pendente/agendado/atrasado) exibem dias restantes ou atraso. */}
                      {['concluido','cancelado'].includes(p.status)
                        ? <span>—</span>
                        : p.dias_restantes < 0
                          ? <span className="badge badge-vermelho">{Math.abs(p.dias_restantes)}d atraso</span>
                          : <span>{p.dias_restantes}d</span>
                      }
                    </td>
                    <td>{p.responsavel_nome || 'Escritório'}</td>
                    {/* Coluna "Quem faz" — mostra quem está fazendo ou vazio */}
                    <td>
                      {euFazendo && (
                        <span style={{
                          background:'#7c3aed',color:'#fff',borderRadius:'4px',
                          padding:'2px 7px',fontSize:'12px',fontWeight:600,whiteSpace:'nowrap'
                        }}>
                          ▶ Fazendo — {p.fazendo_por_nome}
                        </span>
                      )}
                      {outroFazendo && (
                        <span style={{
                          background:'#f59e0b',color:'#fff',borderRadius:'4px',
                          padding:'2px 7px',fontSize:'12px',fontWeight:600,whiteSpace:'nowrap'
                        }}>
                          ▶ {p.fazendo_por_nome}
                        </span>
                      )}
                      {!p.fazendo_por && '—'}
                    </td>
                    <td><span className={`badge ${STATUS_COR[p.status]}`}>{labelStatusPrazo(p.status)}</span></td>
                    <td>
                      <div style={{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}}>
                        {ativo && (
                          <>
                            {/* Ninguém fazendo: qualquer usuário pode Fazer, Concluir, Cancelar */}
                            {!p.fazendo_por && (
                              <>
                                <button title="Marcar como Fazendo" onClick={() => fazerPrazo(p)}
                                  style={{background:'#7c3aed',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                  ▶ Fazer
                                </button>
                                <button title="Concluir prazo" onClick={() => concluirPrazo(p.id)}
                                  style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                  ✅ Concluir
                                </button>
                                <button title="Cancelar prazo" onClick={() => setPrazoCancelando(p)}
                                  style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                  ✖ Cancelar
                                </button>
                              </>
                            )}
                            {/* EU estou fazendo: posso Liberar, Concluir e Cancelar */}
                            {euFazendo && (
                              <>
                                <button title="Liberar prazo (desfazer Fazendo)" onClick={() => liberarFazendo(p.id)}
                                  style={{background:'#9ca3af',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                  ◀ Liberar
                                </button>
                                <button title="Concluir prazo" onClick={() => concluirPrazo(p.id)}
                                  style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                  ✅ Concluir
                                </button>
                                <button title="Cancelar prazo" onClick={() => setPrazoCancelando(p)}
                                  style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                  ✖ Cancelar
                                </button>
                              </>
                            )}
                            {/* OUTRO está fazendo e eu sou admin: posso Liberar, Concluir e Cancelar */}
                            {outroFazendo && ehAdmin && (
                              <>
                                <button title="Liberar prazo (admin)" onClick={() => liberarFazendo(p.id)}
                                  style={{background:'#9ca3af',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                  ◀ Liberar
                                </button>
                                <button title="Concluir prazo" onClick={() => concluirPrazo(p.id)}
                                  style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                  ✅ Concluir
                                </button>
                                <button title="Cancelar prazo" onClick={() => setPrazoCancelando(p)}
                                  style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                  ✖ Cancelar
                                </button>
                              </>
                            )}
                          </>
                        )}
                        {/* Editar — só para prazos ativos e respeitando bloqueio de fazendo */}
                        {ativo && temPermissao('prazos','alterar') && (!outroFazendo || ehAdmin) && (
                          <button title="Editar" onClick={() => setPrazoEditando(p)}
                            style={{background:'#3b82f6',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'13px'}}>
                            ✏️
                          </button>
                        )}
                        {/* Excluir — só para prazos ativos e respeitando bloqueio de fazendo */}
                        {ativo && temPermissao('prazos','excluir') && (!outroFazendo || ehAdmin) && (
                          <button title="Excluir" onClick={() => confirmarExcluir(p.id)}
                            style={{background:'#ef4444',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'13px'}}>
                            🗑️
                          </button>
                        )}
                        {/* Histórico — disponível para qualquer status, se usuário tiver permissão */}
                        {temPermissao('prazos','historico') && (
                          <button title="Ver histórico completo" onClick={() => setPrazoHistorico(p)}
                            style={{background:'#0ea5e9',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                            📋 Histórico
                          </button>
                        )}
                        {/* Geração de documento em Prazos é oferecida ao clicar em "Fazer" (não há botão solto). */}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {lista.length === 0 && <p className="lista-vazia">Nenhum prazo encontrado</p>}
          </div>
        )}

        {/* Barra de paginação */}
        {total > LIMITE && (
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                       padding:'12px 4px 0',marginTop:'8px',borderTop:'1px solid #f1f5f9'}}>
            <button
              className="btn btn-secondary"
              disabled={filtros.pagina <= 1}
              onClick={() => setFiltro('pagina', filtros.pagina - 1)}
              style={{padding:'6px 16px',fontSize:'13px'}}>
              ◀ Anterior
            </button>

            <span style={{color:'#64748b',fontSize:'13px'}}>
              Página <strong>{filtros.pagina}</strong> de <strong>{Math.ceil(total / LIMITE)}</strong>
              &nbsp;·&nbsp;{total} registro(s)
            </span>

            <button
              className="btn btn-secondary"
              disabled={filtros.pagina >= Math.ceil(total / LIMITE)}
              onClick={() => setFiltro('pagina', filtros.pagina + 1)}
              style={{padding:'6px 16px',fontSize:'13px'}}>
              Próximo ▶
            </button>
          </div>
        )}
      </div>

      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
      {modalAberto     && <ModalNovoPrazo tipos={tipos} onFechar={(reload) => { setModalAberto(false);    if(reload) carregar(); }} />}
      {prazoEditando   && <ModalEditarPrazo prazo={prazoEditando} tipos={tipos} onFechar={(reload) => { setPrazoEditando(null);  if(reload) carregar(); }} />}
      {prazoCancelando && <ModalCancelarPrazo prazo={prazoCancelando} onFechar={(reload) => { setPrazoCancelando(null); if(reload) carregar(); }} />}
      {prazoHistorico  && <ModalHistoricoPrazo prazo={prazoHistorico} onFechar={() => setPrazoHistorico(null)} />}
      {/* Geração de documento do prazo (aberta pela pergunta após o "Fazer") */}
      {gerarDocPrazo   && <ModalGerar ancoraTipo="prazo" ancoraId={gerarDocPrazo.id} onFechar={() => setGerarDocPrazo(null)} />}
    </div>
  );
}

// ============================================================
// MODAL DE CANCELAMENTO — Coleta o motivo antes de cancelar
// ============================================================
export function ModalCancelarPrazo({ prazo, onFechar }) {
  const [motivo, setMotivo]     = useState('');
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    if (!motivo.trim()) return toast.error('Informe o motivo do cancelamento');
    setSalvando(true);
    try {
      await prazosAPI.mudarStatus(prazo.id, { status: 'cancelado', motivo_cancelamento: motivo.trim() });
      toast.success('Prazo cancelado');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao cancelar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-pequeno">
        <div className="modal-header">
          <h3>Cancelar Prazo</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{marginBottom:'12px',color:'#555'}}>
            <strong>{prazo.subtipo_nome || prazo.descricao || 'Prazo'}</strong><br/>
            Vencimento: {prazo.data_vencimento}
          </p>
          <div className="form-group">
            <label className="form-label">Motivo do cancelamento *</label>
            <textarea className="form-control" rows={3} value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Descreva o motivo..." style={{resize:'vertical'}} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Voltar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={salvando}
            style={{background:'#6b7280'}}>
            {salvando ? 'Cancelando...' : 'Confirmar Cancelamento'}
          </button>
        </div>
      </div>
    </div>
  );
}

// processoInicial: { processo_id, numero, titulo } — quando vem da PastaDetalhe já preenchido
export function ModalNovoPrazo({ tipos, onFechar, processoInicial }) {
  const [form, setForm]         = useState({
    tipo_dias: 'uteis',
    data_inicio: new Date().toISOString().split('T')[0],
    ...(processoInicial ? { processo_id: processoInicial.processo_id, titulo: processoInicial.titulo } : {}),
  });
  const [salvando, setSalvando] = useState(false);
  const [pastas, setPastas]         = useState([]);
  const [buscaPasta, setBuscaPasta] = useState(processoInicial?.numero || '');
  const [usuarios, setUsuarios]     = useState([]);

  useEffect(() => {
    processosAPI.auxiliares().then(r => setUsuarios(r.data.dados.usuarios || []));
  }, []);

  // Recalcula data final ao mudar data início, quantidade ou tipo de dias.
  // 1) Cálculo local imediato (sem feriados) — resultado na hora
  // 2) Consulta banco — corrige com feriados se disponível
  useEffect(() => {
    if (!form.data_inicio || !form.quantidade || parseInt(form.quantidade) <= 0) return;
    const qtd  = parseInt(form.quantidade);
    const data = new Date(form.data_inicio + 'T12:00:00');
    if (form.tipo_dias === 'corridos') {
      data.setDate(data.getDate() + qtd - 1);
    } else {
      const diaInicio = data.getDay();
      let contados = (diaInicio !== 0 && diaInicio !== 6) ? 1 : 0;
      while (contados < qtd) {
        data.setDate(data.getDate() + 1);
        const d = data.getDay();
        if (d !== 0 && d !== 6) contados++;
      }
    }
    setForm(f => ({ ...f, data_final: data.toISOString().split('T')[0] }));
    prazosAPI.calcularDataFinal(form.data_inicio, form.quantidade, form.tipo_dias)
      .then(r => { if (r.data.ok) setForm(f => ({ ...f, data_final: r.data.dados.data_final })); })
      .catch(() => {});
  }, [form.data_inicio, form.quantidade, form.tipo_dias]);

  async function buscarPastas(termo) {
    if (termo.length < 2) return setPastas([]);
    const { data } = await processosAPI.listarPastas({ busca: termo, limite: 10 });
    if (data.ok) setPastas(data.dados.registros);
  }

  async function selecionarPasta(pasta) {
    const numFmt = String(pasta.numPasta).padStart(4, '0');
    setPastas([]);
    set('titulo', `${numFmt} — ${pasta.titulo_proc || ''}`);
    set('processo_id', '');
    try {
      const { data } = await processosAPI.buscarPasta(pasta.id);
      if (data.ok) {
        const procs = data.dados.processos || [];
        const cnj   = buscaPasta.replace(/\D/g, '');
        const match = procs.find(p => p.numProc?.replace(/\D/g, '') === cnj);
        if (match)               set('processo_id', match.id);
        else if (procs.length === 1) set('processo_id', procs[0].id);
      }
    } catch {}
  }

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.processo_id || !form.data_inicio) return toast.error('Processo e data de início são obrigatórios');
    if (!form.tipo_prazo_id) return toast.error('Tipo de prazo é obrigatório');
    if (!form.subtipo_id)    return toast.error('Subtipo é obrigatório');
    setSalvando(true);
    try {
      await prazosAPI.criar(form);
      toast.success('Prazo criado com sucesso!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao criar prazo'); }
    finally { setSalvando(false); }
  }

  const subtiposFiltrados = form.tipo_prazo_id
    ? tipos.subtipos.filter(s => String(s.tipo_prazo_id) === String(form.tipo_prazo_id))
    : tipos.subtipos;

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>Novo Prazo</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Número do Processo *</label>
            <input className="form-control" placeholder="0000000-00.0000.0.00.0000"
              value={buscaPasta} maxLength={25}
              style={{ maxWidth: '260px', fontFamily: 'monospace', letterSpacing: '0.5px',
                       ...(processoInicial ? { background: '#f8fafc', cursor: 'default' } : {}) }}
              readOnly={!!processoInicial}
              onChange={processoInicial ? undefined : e => { const masked = mascaraCNJ(e.target.value); setBuscaPasta(masked); buscarPastas(masked); }} />
            {pastas.length > 0 && (
              <div style={{border:'1px solid #ddd',borderRadius:'6px',marginTop:'4px',maxHeight:'140px',overflowY:'auto',background:'#fff',zIndex:10,position:'relative'}}>
                {pastas.map(p => (
                  <div key={p.id} style={{padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid #f0f0f0'}}
                    onMouseDown={() => selecionarPasta(p)}>
                    <strong>{String(p.numPasta).padStart(4,'0')}</strong> — {p.titulo_proc || '—'}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Titulo</label>
            <input className="form-control" value={form.titulo||''} readOnly style={{background:'#f8fafc', cursor:'default'}} />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Tipo de prazo *</label>
              <select className="form-control" value={form.tipo_prazo_id||''} onChange={e=>set('tipo_prazo_id',e.target.value)}>
                <option value="">— Todos os tipos —</option>
                {tipos.tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Subtipo *</label>
              <select className="form-control" value={form.subtipo_id||''} onChange={e=>set('subtipo_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {subtiposFiltrados.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <input className="form-control" value={form.descricao||''} onChange={e=>set('descricao',e.target.value)}
              onBlur={()=>set('descricao', toTitleCase(form.descricao))} placeholder="Descrição adicional..." />
          </div>
          <div className="grid-4">
            <div className="form-group">
              <label className="form-label">Data início *</label>
              <input type="date" className="form-control" value={form.data_inicio} onChange={e=>set('data_inicio',e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Quantidade de dias</label>
              <input type="number" className="form-control" value={form.quantidade||''} onChange={e=>set('quantidade',e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de dias</label>
              <select className="form-control" value={form.tipo_dias} onChange={e=>set('tipo_dias',e.target.value)}>
                <option value="uteis">Dias úteis</option>
                <option value="corridos">Dias corridos</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Data final</label>
              <input type="date" className="form-control" value={form.data_final||''} onChange={e=>set('data_final',e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Delegar para</label>
            <select className="form-control" value={form.delegado_para||''} onChange={e=>set('delegado_para',e.target.value)}>
              <option value="">Escritório (sem responsável)</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar Prazo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL DE EDIÇÃO DE PRAZO
// ============================================================
export function ModalEditarPrazo({ prazo, tipos, onFechar }) {
  const [form, setForm] = useState({
    subtipo_id:    String(prazo.subtipo_id   || ''),
    tipo_prazo_id: String(prazo.tipo_prazo_id || ''),
    descricao:     prazo.descricao  || '',
    data_inicio:   prazo.data_inicio ? prazo.data_inicio.split('T')[0] : '',
    quantidade:    prazo.quantidade || '',
    tipo_dias:     prazo.tipo_dias  || 'uteis',
    data_final:    prazo.data_vencimento ? prazo.data_vencimento.split('T')[0] : '',
    delegado_para: String(prazo.delegado_para || ''),
  });
  const [salvando, setSalvando] = useState(false);
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    processosAPI.auxiliares().then(r => setUsuarios(r.data.dados.usuarios || []));
  }, []);

  useEffect(() => {
    if (!form.data_inicio || !form.quantidade || parseInt(form.quantidade) <= 0) return;
    const qtd  = parseInt(form.quantidade);
    const data = new Date(form.data_inicio + 'T12:00:00');
    if (form.tipo_dias === 'corridos') {
      data.setDate(data.getDate() + qtd - 1);
    } else {
      const diaInicio = data.getDay();
      let contados = (diaInicio !== 0 && diaInicio !== 6) ? 1 : 0;
      while (contados < qtd) { data.setDate(data.getDate() + 1); const d = data.getDay(); if (d !== 0 && d !== 6) contados++; }
    }
    setForm(f => ({ ...f, data_final: data.toISOString().split('T')[0] }));
    prazosAPI.calcularDataFinal(form.data_inicio, form.quantidade, form.tipo_dias)
      .then(r => { if (r.data.ok) setForm(f => ({ ...f, data_final: r.data.dados.data_final })); })
      .catch(() => {});
  }, [form.data_inicio, form.quantidade, form.tipo_dias]);

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.data_inicio)   return toast.error('Data de início é obrigatória');
    if (!form.tipo_prazo_id) return toast.error('Tipo de prazo é obrigatório');
    if (!form.subtipo_id)    return toast.error('Subtipo é obrigatório');
    setSalvando(true);
    try {
      await prazosAPI.editar(prazo.id, form);
      toast.success('Prazo atualizado!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  const subtiposFiltrados = form.tipo_prazo_id
    ? tipos.subtipos.filter(s => String(s.tipo_prazo_id) === String(form.tipo_prazo_id))
    : tipos.subtipos;

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>Editar Prazo</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Processo</label>
              <input className="form-control" value={prazo.processo_numero || '—'} readOnly
                style={{background:'#f8fafc', cursor:'default', fontFamily:'monospace'}} />
            </div>
            <div className="form-group">
              <label className="form-label">Pasta</label>
              <input className="form-control" value={`${prazo.pasta_numero_fmt} — ${prazo.pasta_titulo}`} readOnly
                style={{background:'#f8fafc', cursor:'default'}} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Tipo de prazo *</label>
              <select className="form-control" value={form.tipo_prazo_id} onChange={e=>set('tipo_prazo_id',e.target.value)}>
                <option value="">— Selecione —</option>
                {tipos.tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Subtipo *</label>
              <select className="form-control" value={form.subtipo_id} onChange={e=>set('subtipo_id',e.target.value)}>
                <option value="">— Selecione —</option>
                {subtiposFiltrados.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <input className="form-control" value={form.descricao} onChange={e=>set('descricao',e.target.value)}
              onBlur={() => set('descricao', toTitleCase(form.descricao))} placeholder="Descrição adicional..." />
          </div>
          <div className="grid-4">
            <div className="form-group">
              <label className="form-label">Data início *</label>
              <input type="date" className="form-control" value={form.data_inicio} onChange={e=>set('data_inicio',e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Quantidade de dias</label>
              <input type="number" className="form-control" value={form.quantidade} onChange={e=>set('quantidade',e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de dias</label>
              <select className="form-control" value={form.tipo_dias} onChange={e=>set('tipo_dias',e.target.value)}>
                <option value="uteis">Dias úteis</option>
                <option value="corridos">Dias corridos</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Data final</label>
              <input type="date" className="form-control" value={form.data_final||''} onChange={e=>set('data_final',e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Delegar para</label>
            <select className="form-control" value={form.delegado_para} onChange={e=>set('delegado_para',e.target.value)}>
              <option value="">Escritório (sem responsável)</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL DE HISTÓRICO — Linha do tempo completa de um prazo
// Exibe criação, mudanças de status, conclusão e cancelamento
// ============================================================
function ModalHistoricoPrazo({ prazo, onFechar }) {
  const [historico, setHistorico] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    prazosAPI.historico(prazo.id)
      .then(r => { if (r.data.ok) setHistorico(r.data.dados); })
      .catch(() => toast.error('Erro ao carregar histórico'))
      .finally(() => setCarregando(false));
  }, [prazo.id]);

  // Fecha com Escape
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onFechar(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onFechar]);

  // Mapeamento de ícone por tipo de evento para exibição visual
  const corEvento = {
    criacao:  '#0ea5e9',
    status:   '#64748b',
    concluido:'#16a34a',
    cancelado:'#6b7280',
  };

  function corDoEvento(evento) {
    if (evento.descricao?.includes('concluído') || evento.descricao?.includes('Concluído')) return '#16a34a';
    if (evento.descricao?.includes('cancelado') || evento.descricao?.includes('Cancelado')) return '#6b7280';
    if (evento.tipo === 'criacao') return '#0ea5e9';
    return '#64748b';
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>📋 Histórico do Prazo</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {/* Identificação do prazo */}
          <p style={{marginBottom:'20px',color:'#555',fontWeight:600}}>
            {prazo.subtipo_nome || prazo.descricao || `Prazo #${prazo.id}`}
            <span style={{fontWeight:400,color:'#888',marginLeft:'8px'}}>
              — Vencimento: {formatarData(prazo.data_vencimento)}
            </span>
          </p>

          {carregando && <p style={{color:'#888',textAlign:'center',padding:'24px'}}>Carregando...</p>}

          {!carregando && historico && (
            <div style={{position:'relative'}}>
              {/* Linha vertical da timeline */}
              <div style={{
                position:'absolute', left:'19px', top:'8px',
                bottom:'8px', width:'2px', background:'#e2e8f0'
              }} />

              {historico.eventos.map((ev, i) => (
                <div key={i} style={{
                  display:'flex', gap:'16px', alignItems:'flex-start',
                  marginBottom:'20px', position:'relative'
                }}>
                  {/* Bolinha colorida na linha do tempo */}
                  <div style={{
                    width:'40px', height:'40px', borderRadius:'50%', flexShrink:0,
                    background: corDoEvento(ev),
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'16px', zIndex:1, boxShadow:'0 0 0 3px #fff'
                  }}>
                    {ev.icone}
                  </div>

                  {/* Conteúdo do evento */}
                  <div style={{
                    flex:1, background:'#f8fafc', borderRadius:'8px',
                    padding:'10px 14px', border:'1px solid #e2e8f0'
                  }}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'4px'}}>
                      <strong style={{fontSize:'14px', color:'#1e293b'}}>{ev.descricao}</strong>
                      <span style={{fontSize:'15px', color:'#334155', fontWeight:500, whiteSpace:'nowrap'}}>
                        {ev.data ? new Date(ev.data).toLocaleString('pt-BR') : '—'}
                      </span>
                    </div>
                    <div style={{fontSize:'13px', color:'#64748b', marginTop:'2px'}}>
                      👤 {ev.usuario}
                    </div>
                    {ev.observacao && (
                      <div style={{
                        marginTop:'6px', fontSize:'13px', color:'#475569',
                        background:'#fff', borderRadius:'4px', padding:'6px 10px',
                        borderLeft:'3px solid #cbd5e1'
                      }}>
                        {ev.observacao}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {historico.eventos.length === 0 && (
                <p className="lista-vazia">Nenhum evento registrado</p>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
