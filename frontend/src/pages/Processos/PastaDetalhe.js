// ============================================================
// PÁGINA DE DETALHE DA PASTA
// Mostra todos os processos, andamentos, prazos, tarefas,
// audiências e financeiro vinculados a uma pasta
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { processosAPI, andamentoAPI, prazosAPI, tarefasAPI, audienciasAPI, financeiroAPI } from '../../services/api';
import { formatarData, formatarNumeroPasta, labelAreaDireito, formatarMoeda, labelStatusPrazo, corPrazo, toTitleCase } from '../../utils/formatters';
import { toast } from 'react-toastify';

const AREA_COR = { trabalhista:'badge-azul', previdenciario:'badge-verde', familia:'badge-laranja', outro:'badge-cinza' };

export default function PastaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pasta, setPasta]         = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [abaAtiva, setAbaAtiva]   = useState('processos');

  // Estado por aba
  const [processoAberto, setProcessoAberto] = useState(null);
  const [andamentos, setAndamentos]         = useState([]);
  const [prazos, setPrazos]                 = useState([]);
  const [tarefas, setTarefas]               = useState([]);
  const [audiencias, setAudiencias]         = useState([]);
  const [contaCorrente, setContaCorrente]   = useState(null);

  // Modais
  const [modalProcesso, setModalProcesso] = useState(false);
  const [modalAndamento, setModalAndamento] = useState(false);
  const [andamentoEditando, setAndamentoEditando] = useState(null);
  const [modalLancamento, setModalLancamento] = useState(false);

  const carregarPasta = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await processosAPI.buscarPasta(id);
      if (data.ok) setPasta(data.dados);
    } catch { toast.error('Erro ao carregar pasta'); }
    finally { setCarregando(false); }
  }, [id]);

  useEffect(() => { carregarPasta(); }, [carregarPasta]);

  // Carrega dados da aba ao trocar
  useEffect(() => {
    if (!pasta) return;
    const processoIds = pasta.processos?.map(p => p.id) || [];
    if (abaAtiva === 'andamentos' && processoAberto) {
      carregarAndamentos(processoAberto.id);
    }
    if (abaAtiva === 'prazos' && processoIds.length) carregarPrazos(processoIds[0]);
    if (abaAtiva === 'tarefas') carregarTarefas();
    if (abaAtiva === 'audiencias') carregarAudiencias();
    if (abaAtiva === 'financeiro') carregarFinanceiro();
  }, [abaAtiva, pasta]);

  async function carregarAndamentos(processoId) {
    try {
      const { data } = await andamentoAPI.listar(processoId);
      if (data.ok) setAndamentos(data.dados);
    } catch { toast.error('Erro ao carregar andamentos'); }
  }

  async function carregarPrazos(processoId) {
    try {
      const { data } = await prazosAPI.listar({ processo_id: processoId, limite: 50 });
      if (data.ok) setPrazos(data.dados.registros);
    } catch { toast.error('Erro ao carregar prazos'); }
  }

  async function carregarTarefas() {
    try {
      const { data } = await tarefasAPI.listar({ concluida: '', limite: 50 });
      if (data.ok) setTarefas(data.dados.registros);
    } catch {}
  }

  async function carregarAudiencias() {
    try {
      const processoIds = pasta?.processos?.map(p => p.id) || [];
      if (!processoIds.length) return;
      const { data } = await audienciasAPI.listar({ processo_id: processoIds[0], limite: 50 });
      if (data.ok) setAudiencias(data.dados.registros);
    } catch {}
  }

  async function carregarFinanceiro() {
    try {
      const { data } = await financeiroAPI.buscarConta(id, {});
      if (data.ok) setContaCorrente(data.dados);
    } catch {}
  }

  async function excluirAndamento(andId) {
    if (!window.confirm('Excluir este andamento?')) return;
    try {
      await andamentoAPI.excluir(andId);
      toast.success('Andamento excluído');
      carregarAndamentos(processoAberto.id);
    } catch { toast.error('Erro ao excluir'); }
  }

  function abrirProcesso(processo) {
    setProcessoAberto(processo);
    setAbaAtiva('andamentos');
    carregarAndamentos(processo.id);
  }

  if (carregando) return <div className="card"><div className="loading">Carregando pasta...</div></div>;
  if (!pasta)     return <div className="card"><p className="lista-vazia">Pasta não encontrada</p></div>;

  return (
    <div>
      {/* Cabeçalho da pasta */}
      <div className="card" style={{marginBottom:'16px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
          <button className="btn btn-outline" style={{fontSize:'12px'}} onClick={() => navigate('/processos')}>
            ← Voltar
          </button>
          <div>
            <div style={{fontSize:'11px',color:'#888',marginBottom:'2px'}}>
              Pasta {formatarNumeroPasta(pasta.numero)}
            </div>
            <h2 style={{margin:0,fontSize:'18px',color:'#1e2a3a'}}>{pasta.titulo}</h2>
          </div>
          <div style={{marginLeft:'auto',display:'flex',gap:'12px',alignItems:'center',flexWrap:'wrap'}}>
            <div>
              <span style={{fontSize:'12px',color:'#888'}}>Cliente: </span>
              <strong style={{fontSize:'13px'}}>{pasta.cliente_nome}</strong>
            </div>
            <span className={`badge ${AREA_COR[pasta.area_direito]}`}>
              {labelAreaDireito(pasta.area_direito)}
            </span>
          </div>
        </div>
      </div>

      {/* Abas de navegação */}
      <div className="card">
        <div className="abas-nav">
          {[
            { key:'processos',  label:'Processos' },
            { key:'andamentos', label:'Andamentos' },
            { key:'prazos',     label:'Prazos' },
            { key:'tarefas',    label:'Tarefas' },
            { key:'audiencias', label:'Audiências' },
            { key:'financeiro', label:'Financeiro' },
          ].map(({ key, label }) => (
            <button key={key} className={`aba-btn ${abaAtiva===key?'ativa':''}`}
              onClick={() => setAbaAtiva(key)}>
              {label}
            </button>
          ))}
        </div>

        {/* === ABA: PROCESSOS === */}
        {abaAtiva === 'processos' && (
          <div>
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'12px'}}>
              <button className="btn btn-primary" onClick={() => setModalProcesso(true)}>
                + Novo Processo
              </button>
            </div>
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr><th>Nº Processo</th><th>Vara</th><th>Fórum</th><th>Status</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {pasta.processos?.map(pr => (
                    <tr key={pr.id}>
                      <td><strong>{pr.numero || '(sem número)'}</strong></td>
                      <td>{pr.vara_nome || '—'}</td>
                      <td>{pr.forum_nome || '—'}</td>
                      <td>{pr.status_nome || '—'}</td>
                      <td>
                        <button className="btn btn-outline" style={{fontSize:'12px',padding:'4px 10px'}}
                          onClick={() => abrirProcesso(pr)}>
                          Ver Andamentos
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!pasta.processos || pasta.processos.length === 0) && (
                <p className="lista-vazia">Nenhum processo nesta pasta</p>
              )}
            </div>
          </div>
        )}

        {/* === ABA: ANDAMENTOS === */}
        {abaAtiva === 'andamentos' && (
          <div>
            {/* Selector de processo */}
            <div style={{display:'flex',gap:'12px',alignItems:'center',marginBottom:'16px',flexWrap:'wrap'}}>
              <select className="form-control" style={{maxWidth:'320px'}}
                value={processoAberto?.id || ''}
                onChange={e => {
                  const pr = pasta.processos.find(p => String(p.id) === e.target.value);
                  if (pr) { setProcessoAberto(pr); carregarAndamentos(pr.id); }
                }}>
                <option value="">— Selecione um processo —</option>
                {pasta.processos?.map(pr => (
                  <option key={pr.id} value={pr.id}>{pr.numero || `Processo #${pr.id}`}</option>
                ))}
              </select>
              {processoAberto && (
                <button className="btn btn-primary"
                  onClick={() => { setAndamentoEditando(null); setModalAndamento(true); }}>
                  + Novo Andamento
                </button>
              )}
            </div>
            {processoAberto ? (
              <div className="tabela-wrapper">
                <table className="tabela">
                  <thead>
                    <tr><th>Data</th><th>Descrição</th><th>Registrado por</th><th>Ações</th></tr>
                  </thead>
                  <tbody>
                    {andamentos.map(a => (
                      <tr key={a.id}>
                        <td style={{whiteSpace:'nowrap'}}>{formatarData(a.data_andamento)}</td>
                        <td style={{maxWidth:'400px'}}>{a.descricao}</td>
                        <td>{a.usuario_nome}</td>
                        <td>
                          <div style={{display:'flex',gap:'6px'}}>
                            <button className="btn btn-outline" style={{fontSize:'12px',padding:'4px 8px'}}
                              onClick={() => { setAndamentoEditando(a); setModalAndamento(true); }}>
                              Editar
                            </button>
                            <button className="btn btn-danger" style={{fontSize:'12px',padding:'4px 8px'}}
                              onClick={() => excluirAndamento(a.id)}>
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {andamentos.length === 0 && <p className="lista-vazia">Nenhum andamento registrado</p>}
              </div>
            ) : (
              <p className="lista-vazia">Selecione um processo para ver os andamentos</p>
            )}
          </div>
        )}

        {/* === ABA: PRAZOS === */}
        {abaAtiva === 'prazos' && (
          <div>
            <div style={{display:'flex',gap:'12px',marginBottom:'16px',alignItems:'center',flexWrap:'wrap'}}>
              <select className="form-control" style={{maxWidth:'320px'}}
                onChange={e => { if(e.target.value) carregarPrazos(e.target.value); }}>
                <option value="">— Selecione o processo —</option>
                {pasta.processos?.map(pr => (
                  <option key={pr.id} value={pr.id}>{pr.numero || `Processo #${pr.id}`}</option>
                ))}
              </select>
              <Link to="/prazos" className="btn btn-outline" style={{fontSize:'12px'}}>
                + Novo Prazo (via módulo)
              </Link>
            </div>
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr><th>Prazo</th><th>Vencimento</th><th>Dias</th><th>Responsável</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {prazos.map(p => (
                    <tr key={p.id} className={corPrazo(p.dias_restantes)}>
                      <td>{p.subtipo_nome || p.descricao || '—'}</td>
                      <td>{formatarData(p.data_vencimento)}</td>
                      <td>
                        {p.dias_restantes < 0
                          ? <span className="badge badge-vermelho">{Math.abs(p.dias_restantes)}d atraso</span>
                          : <span>{p.dias_restantes}d</span>
                        }
                      </td>
                      <td>{p.responsavel_nome || 'Escritório'}</td>
                      <td><span className="badge badge-cinza">{labelStatusPrazo(p.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {prazos.length === 0 && <p className="lista-vazia">Selecione um processo para ver os prazos</p>}
            </div>
          </div>
        )}

        {/* === ABA: TAREFAS === */}
        {abaAtiva === 'tarefas' && (
          <div>
            <div style={{marginBottom:'12px',display:'flex',justifyContent:'flex-end'}}>
              <Link to="/tarefas" className="btn btn-outline" style={{fontSize:'12px'}}>
                + Nova Tarefa (via módulo)
              </Link>
            </div>
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr><th>Tarefa</th><th>Prioridade</th><th>Vencimento</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {tarefas.filter(t => !t.concluida).slice(0,20).map(t => (
                    <tr key={t.id}>
                      <td><strong>{t.titulo}</strong></td>
                      <td>{t.prioridade}</td>
                      <td>{t.data_vencimento ? formatarData(t.data_vencimento) : '—'}</td>
                      <td>{t.concluida ? 'Concluída' : 'Pendente'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tarefas.filter(t => !t.concluida).length === 0 && (
                <p className="lista-vazia">Nenhuma tarefa pendente</p>
              )}
            </div>
          </div>
        )}

        {/* === ABA: AUDIÊNCIAS === */}
        {abaAtiva === 'audiencias' && (
          <div>
            <div style={{marginBottom:'12px',display:'flex',justifyContent:'flex-end'}}>
              <Link to="/audiencias" className="btn btn-outline" style={{fontSize:'12px'}}>
                + Nova Audiência (via módulo)
              </Link>
            </div>
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr><th>Tipo</th><th>Data / Hora</th><th>Modalidade</th><th>Local</th></tr>
                </thead>
                <tbody>
                  {audiencias.map(a => (
                    <tr key={a.id}>
                      <td>{a.tipo_nome || '—'}</td>
                      <td>{formatarData(a.data)} {a.hora?.slice(0,5)}</td>
                      <td>{a.modalidade === 'virtual' ? 'Virtual' : 'Presencial'}</td>
                      <td>{a.local || a.link_virtual || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {audiencias.length === 0 && (
                <p className="lista-vazia">Nenhuma audiência encontrada</p>
              )}
            </div>
          </div>
        )}

        {/* === ABA: FINANCEIRO === */}
        {abaAtiva === 'financeiro' && (
          <div>
            {contaCorrente ? (
              <div>
                {/* Honorários */}
                {contaCorrente.honorarios && (
                  <div className="card" style={{background:'#f8fafc',marginBottom:'16px',border:'1px solid #e8ecf0'}}>
                    <div style={{display:'flex',gap:'24px',flexWrap:'wrap'}}>
                      <div>
                        <div style={{fontSize:'12px',color:'#888'}}>Tipo de honorário</div>
                        <strong style={{fontSize:'14px'}}>
                          {contaCorrente.honorarios.tipo === 'percentual'
                            ? `${contaCorrente.honorarios.percentual}%`
                            : contaCorrente.honorarios.tipo === 'fixo'
                              ? `Fixo: ${formatarMoeda(contaCorrente.honorarios.valor_fixo)}`
                              : 'Sem honorários'}
                        </strong>
                      </div>
                      <div>
                        <div style={{fontSize:'12px',color:'#888'}}>Saldo atual</div>
                        <strong style={{fontSize:'14px',color: contaCorrente.saldo >= 0 ? '#059669' : '#dc2626'}}>
                          {formatarMoeda(contaCorrente.saldo)}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
                <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'12px',gap:'8px'}}>
                  <button className="btn btn-primary" onClick={() => setModalLancamento(true)}>
                    + Lançamento
                  </button>
                  <Link to="/financeiro" className="btn btn-outline" style={{fontSize:'12px'}}>
                    Ver completo
                  </Link>
                </div>
                {/* Extrato resumido */}
                <div className="tabela-wrapper">
                  <table className="tabela">
                    <thead>
                      <tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th></tr>
                    </thead>
                    <tbody>
                      {(contaCorrente.lancamentos || []).slice(0, 15).map(l => (
                        <tr key={l.id}>
                          <td>{formatarData(l.data_lancamento)}</td>
                          <td>{l.descricao}</td>
                          <td>
                            <span className={`badge ${l.tipo === 'credito' ? 'badge-verde' : 'badge-vermelho'}`}>
                              {l.tipo === 'credito' ? 'Crédito' : 'Débito'}
                            </span>
                          </td>
                          <td className={l.tipo === 'credito' ? 'valor-positivo' : 'valor-negativo'}>
                            {l.tipo === 'debito' ? '-' : '+'}{formatarMoeda(l.valor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(!contaCorrente.lancamentos || contaCorrente.lancamentos.length === 0) && (
                    <p className="lista-vazia">Nenhum lançamento registrado</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="lista-vazia">Carregando dados financeiros...</p>
            )}
          </div>
        )}
      </div>

      {/* Modal: Novo Processo */}
      {modalProcesso && (
        <ModalNovoProcesso pastaId={id}
          onFechar={(reload) => { setModalProcesso(false); if(reload) carregarPasta(); }}
        />
      )}

      {/* Modal: Andamento */}
      {modalAndamento && processoAberto && (
        <ModalAndamento
          processoId={processoAberto.id}
          andamento={andamentoEditando}
          onFechar={(reload) => {
            setModalAndamento(false);
            if(reload) carregarAndamentos(processoAberto.id);
          }}
        />
      )}

      {/* Modal: Lançamento financeiro */}
      {modalLancamento && (
        <ModalLancamento pastaId={id}
          onFechar={(reload) => { setModalLancamento(false); if(reload) carregarFinanceiro(); }}
        />
      )}
    </div>
  );
}

// Modal para criar novo processo dentro da pasta
function ModalNovoProcesso({ pastaId, onFechar }) {
  const [form, setForm]       = useState({ pasta_id: pastaId });
  const [salvando, setSalvando] = useState(false);
  const [auxiliares, setAux]  = useState({ varas: [], status: [], usuarios: [] });

  useEffect(() => {
    processosAPI.auxiliares().then(r => {
      if (r.data.ok) setAux(r.data.dados);
    });
  }, []);

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    setSalvando(true);
    try {
      await processosAPI.criarProcesso({ ...form, pasta_id: pastaId });
      toast.success('Processo criado!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao criar processo'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" onClick={() => onFechar(false)}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Novo Processo</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Número do processo (CNJ)</label>
            <input className="form-control" value={form.numero||''}
              onChange={e => set('numero', e.target.value)}
              placeholder="0000000-00.0000.0.00.0000" />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Vara</label>
              <select className="form-control" value={form.vara_id||''} onChange={e => set('vara_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {auxiliares.varas?.map(v => <option key={v.id} value={v.id}>{v.nome} — {v.forum_nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status_id||''} onChange={e => set('status_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {auxiliares.status?.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Data de distribuição</label>
            <input type="date" className="form-control" value={form.data_distribuicao||''}
              onChange={e => set('data_distribuicao', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Observações</label>
            <textarea className="form-control" rows={2} value={form.observacoes||''}
              onChange={e => set('observacoes', e.target.value)}
              onBlur={() => set('observacoes', toTitleCase(form.observacoes))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Criar Processo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal para criar/editar andamento
function ModalAndamento({ processoId, andamento, onFechar }) {
  const [form, setForm]       = useState(andamento || { data_andamento: new Date().toISOString().split('T')[0] });
  const [salvando, setSalvando] = useState(false);

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.descricao) return toast.error('Descrição é obrigatória');
    setSalvando(true);
    try {
      if (andamento?.id) {
        await andamentoAPI.editar(andamento.id, form);
        toast.success('Andamento atualizado!');
      } else {
        await andamentoAPI.criar(processoId, form);
        toast.success('Andamento registrado!');
      }
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" onClick={() => onFechar(false)}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{andamento ? 'Editar Andamento' : 'Novo Andamento'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Data *</label>
            <input type="date" className="form-control" value={form.data_andamento||''}
              onChange={e => set('data_andamento', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Descrição *</label>
            <textarea className="form-control" rows={4} value={form.descricao||''}
              onChange={e => set('descricao', e.target.value)}
              onBlur={() => set('descricao', toTitleCase(form.descricao))}
              placeholder="Descreva o andamento processual..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal para novo lançamento financeiro
function ModalLancamento({ pastaId, onFechar }) {
  const [form, setForm]       = useState({ tipo: 'credito', data_lancamento: new Date().toISOString().split('T')[0] });
  const [salvando, setSalvando] = useState(false);

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.descricao || !form.valor) return toast.error('Descrição e valor são obrigatórios');
    setSalvando(true);
    try {
      await financeiroAPI.lancar(pastaId, form);
      toast.success('Lançamento registrado!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao lançar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" onClick={() => onFechar(false)}>
      <div className="modal-box modal-pequeno" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Novo Lançamento</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-control" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                <option value="credito">Crédito (entrada)</option>
                <option value="debito">Débito (saída)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Data</label>
              <input type="date" className="form-control" value={form.data_lancamento}
                onChange={e => set('data_lancamento', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Descrição *</label>
            <input className="form-control" value={form.descricao||''}
              onChange={e => set('descricao', e.target.value)}
              onBlur={() => set('descricao', toTitleCase(form.descricao))} />
          </div>
          <div className="form-group">
            <label className="form-label">Valor (R$) *</label>
            <input type="number" step="0.01" className="form-control" value={form.valor||''}
              onChange={e => set('valor', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Lançar'}
          </button>
        </div>
      </div>
    </div>
  );
}
