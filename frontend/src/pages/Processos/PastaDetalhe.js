// ============================================================
// PÁGINA DE DETALHE DA PASTA
// Mostra os processos vinculados e suas abas:
// processos, andamentos, prazos, tarefas, audiências, financeiro
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { processosAPI, andamentoAPI, prazosAPI, tarefasAPI, audienciasAPI, financeiroAPI } from '../../services/api';
import { formatarData, formatarNumeroPasta, formatarMoeda, labelStatusPrazo, corPrazo, toTitleCase } from '../../utils/formatters';
import { ModalNovoProcesso, ModalEditarProcesso } from './Processos';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';

export default function PastaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { temPermissao } = useAuth(); // Permissões do usuário logado

  const [pasta, setPasta]           = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [abaAtiva, setAbaAtiva]     = useState('processos');

  // Filtro de processo compartilhado pelas abas — 'todos' ou id (string) do processo
  const [processoFiltro, setProcessoFiltro] = useState('todos');

  // Dados por aba
  const [andamentos, setAndamentos]       = useState([]);
  const [prazos, setPrazos]               = useState([]);
  const [tarefas, setTarefas]             = useState([]);
  const [audiencias, setAudiencias]       = useState([]);
  const [contaCorrente, setContaCorrente] = useState(null);

  // Modais
  const [modalProcesso, setModalProcesso]         = useState(false);
  const [modalEditar, setModalEditar]             = useState(false);
  const [processoEditando, setProcessoEditando]   = useState(null);
  const [modalAndamento, setModalAndamento]       = useState(false);
  const [andamentoEditando, setAndamentoEditando] = useState(null);
  const [modalLancamento, setModalLancamento]     = useState(false);

  // Edição inline do número da pasta
  const [editandoNrPasta, setEditandoNrPasta] = useState(false);
  const [novaNrPasta, setNovaNrPasta]         = useState('');
  const [salvandoNrPasta, setSalvandoNrPasta] = useState(false);

  // ---- Carrega a pasta ----
  const carregarPasta = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await processosAPI.buscarPasta(id);
      if (data.ok) setPasta(data.dados);
    } catch { toast.error('Erro ao carregar pasta'); }
    finally { setCarregando(false); }
  }, [id]);

  useEffect(() => { carregarPasta(); }, [carregarPasta]);

  // ---- Recarrega dados quando muda a aba ou o filtro de processo ----
  useEffect(() => {
    if (!pasta) return;
    if (abaAtiva === 'andamentos') carregarAndamentos();
    if (abaAtiva === 'prazos')     carregarPrazos();
    if (abaAtiva === 'tarefas')    carregarTarefas();
    if (abaAtiva === 'audiencias') carregarAudiencias();
    if (abaAtiva === 'financeiro') carregarFinanceiro();
  }, [abaAtiva, pasta, processoFiltro]); // eslint-disable-line

  // Retorna os IDs dos processos a buscar conforme o filtro atual
  function idsParaBuscar() {
    const procs = pasta?.processos || [];
    if (processoFiltro === 'todos') return procs.map(p => p.id);
    return [parseInt(processoFiltro)];
  }

  // ---- Funções de carga (todas respeitam processoFiltro) ----

  async function carregarAndamentos() {
    const ids = idsParaBuscar();
    try {
      const resultados = await Promise.all(ids.map(pid => andamentoAPI.listar(pid)));
      // Combina todos os andamentos marcando o processo de origem
      const todos = resultados.flatMap((r, i) =>
        (r.data.ok ? r.data.dados : []).map(a => ({ ...a, _procId: ids[i] }))
      );
      // Ordena por data decrescente
      todos.sort((a, b) => new Date(b.data || b.criado_em) - new Date(a.data || a.criado_em));
      setAndamentos(todos);
    } catch { toast.error('Erro ao carregar andamentos'); }
  }

  async function carregarPrazos() {
    const ids = idsParaBuscar();
    try {
      const resultados = await Promise.all(
        ids.map(pid => prazosAPI.listar({ processo_id: pid, limite: 50 }))
      );
      const todos = resultados.flatMap(r => r.data.ok ? r.data.dados.registros : []);
      setPrazos(todos);
    } catch { toast.error('Erro ao carregar prazos'); }
  }

  async function carregarTarefas() {
    const ids = idsParaBuscar();
    try {
      const resultados = await Promise.all(
        ids.map(pid => tarefasAPI.listar({ processo_id: pid, concluida: '', limite: 50 }))
      );
      const todos = resultados.flatMap(r => r.data.ok ? r.data.dados.registros : []);
      setTarefas(todos);
    } catch {}
  }

  async function carregarAudiencias() {
    const ids = idsParaBuscar();
    try {
      const resultados = await Promise.all(
        ids.map(pid => audienciasAPI.listar({ processo_id: pid, limite: 50 }))
      );
      const todos = resultados.flatMap(r => r.data.ok ? r.data.dados.registros : []);
      setAudiencias(todos);
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
      carregarAndamentos();
    } catch { toast.error('Erro ao excluir'); }
  }

  async function salvarNrPasta() {
    const num = parseInt(novaNrPasta);
    if (!num || num < 1) return toast.error('Número de pasta inválido');
    setSalvandoNrPasta(true);
    try {
      await processosAPI.renumerarPasta(pasta.id, { numPasta: num });
      toast.success('Número da pasta atualizado!');
      setPasta(p => ({ ...p, numPasta: num })); // atualiza local sem recarregar tudo
      setEditandoNrPasta(false);
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao renumerar pasta');
    } finally {
      setSalvandoNrPasta(false);
    }
  }

  async function excluirProcesso(procId) {
    if (!window.confirm('Tem certeza que deseja excluir este processo?\nEsta ação não pode ser desfeita.')) return;
    try {
      await processosAPI.excluirProcesso(procId);
      toast.success('Processo excluído');
      carregarPasta(); // Recarrega a pasta para atualizar a listagem
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao excluir processo');
    }
  }

  // ---- Helpers ----

  // Processo atualmente selecionado (null quando 'todos')
  function getProcessoSelecionado(procs) {
    if (processoFiltro === 'todos') return null;
    return procs.find(p => p.id === parseInt(processoFiltro)) || null;
  }

  if (carregando) return <div className="card"><div className="loading">Carregando pasta...</div></div>;
  if (!pasta)     return <div className="card"><p className="lista-vazia">Pasta não encontrada</p></div>;

  const processos        = pasta.processos || [];
  const processoSelecionado = getProcessoSelecionado(processos);

  // Seletor de processo — reutilizado em todas as abas como elemento JSX
  const selectProcesso = (
    <select
      className="form-control"
      style={{ maxWidth: '340px' }}
      value={processoFiltro}
      onChange={e => setProcessoFiltro(e.target.value)}
    >
      <option value="todos">— Todos os processos —</option>
      {processos.map(pr => (
        <option key={pr.id} value={pr.id}>
          {pr.numProc || `Processo #${pr.id}`}
        </option>
      ))}
    </select>
  );

  return (
    <div>
      {/* Cabeçalho */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" style={{ fontSize: '12px' }} onClick={() => navigate('/processos')}>
            ← Voltar
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              {editandoNrPasta ? (
                /* Modo edição inline do número da pasta */
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#555' }}>Pasta</span>
                  <input
                    type="number" min="1"
                    className="form-control"
                    style={{ width: '80px', fontSize: '13px', padding: '2px 8px', height: '28px' }}
                    value={novaNrPasta}
                    onChange={e => setNovaNrPasta(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') salvarNrPasta(); if (e.key === 'Escape') setEditandoNrPasta(false); }}
                    autoFocus
                  />
                  <button className="btn btn-primary"
                    style={{ fontSize: '11px', padding: '2px 10px', height: '28px' }}
                    onClick={salvarNrPasta} disabled={salvandoNrPasta}>
                    {salvandoNrPasta ? '...' : 'OK'}
                  </button>
                  <button className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '2px 8px', height: '28px' }}
                    onClick={() => setEditandoNrPasta(false)}>
                    ✕
                  </button>
                </div>
              ) : (
                /* Modo visualização — badge + botão de edição */
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '13px', fontWeight: '700', color: '#fff',
                    background: '#2d6be4', borderRadius: '6px',
                    padding: '2px 10px', letterSpacing: '0.5px'
                  }}>
                    Pasta {formatarNumeroPasta(pasta.numPasta)}
                  </span>
                  {temPermissao('pastas', 'alterar') && (
                    <button
                      title="Alterar número da pasta"
                      onClick={() => { setNovaNrPasta(String(pasta.numPasta)); setEditandoNrPasta(true); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: '13px', padding: '0', lineHeight: '1' }}
                    >✎</button>
                  )}
                </div>
              )}
            </div>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#1e2a3a' }}>
              {processos[0]?.NomeTituloProc || `Pasta ${formatarNumeroPasta(pasta.numPasta)}`}
            </h2>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {processos[0]?.tipo_nome && (
              <span className="badge badge-azul">{processos[0].tipo_nome}</span>
            )}
            {processos[0]?.status_nome && (
              <span className="badge badge-cinza">{processos[0].status_nome}</span>
            )}
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="card">
        <div className="abas-nav">
          {[
            { key: 'processos',  label: 'Processos' },
            { key: 'andamentos', label: 'Andamentos' },
            { key: 'prazos',     label: 'Prazos' },
            { key: 'tarefas',    label: 'Tarefas' },
            { key: 'audiencias', label: 'Audiências' },
            { key: 'financeiro', label: 'Financeiro' },
          ].map(({ key, label }) => (
            <button key={key} className={`aba-btn ${abaAtiva === key ? 'ativa' : ''}`}
              onClick={() => setAbaAtiva(key)}>
              {label}
            </button>
          ))}
        </div>

        {/* === ABA: PROCESSOS === */}
        {abaAtiva === 'processos' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
              <button className="btn btn-primary" onClick={() => setModalProcesso(true)}>
                + Novo Processo (mesma pasta)
              </button>
            </div>
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Número CNJ</th>
                    <th>Tipo</th>
                    <th>Status</th>
                    <th>Instância</th>
                    <th>Vara / Fórum</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {processos.map(pr => (
                    <tr key={pr.id}>
                      <td>
                        <div style={{ fontWeight: '500' }}>{pr.NomeTituloProc || '—'}</div>
                        {/* Autores em azul, réus em vermelho */}
                        <div style={{ fontSize: '11px', marginTop: '3px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {pr.autores?.map((a, i) => (
                            <span key={i} style={{ background: '#dbeafe', color: '#1e40af', borderRadius: '10px', padding: '1px 7px' }}>{a.nome}</span>
                          ))}
                          {pr.autores?.length > 0 && pr.reus?.length > 0 && (
                            <span style={{ color: '#888', fontWeight: '700' }}>X</span>
                          )}
                          {pr.reus?.map((r, i) => (
                            <span key={i} style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '10px', padding: '1px 7px' }}>{r.nome}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                          {pr.numProc || '—'}
                        </span>
                      </td>
                      <td>{pr.tipo_nome   ? <span className="badge badge-azul">{pr.tipo_nome}</span>  : '—'}</td>
                      <td>{pr.status_nome ? <span className="badge badge-cinza">{pr.status_nome}</span> : '—'}</td>
                      <td>{pr.instancia_nome || '—'}</td>
                      <td>
                        <div style={{ fontSize: '13px' }}>{pr.vara_abrev_nome || pr.vara_nome || '—'}</div>
                        {pr.forum_nome && <div style={{ fontSize: '11px', color: '#888' }}>{pr.forum_abrev_nome || pr.forum_nome}</div>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {/* Editar — requer permissão processos.alterar */}
                          {temPermissao('processos', 'alterar') && (
                            <button
                              className="btn btn-outline"
                              style={{ fontSize: '12px', padding: '4px 10px', color: '#2d6be4', borderColor: '#2d6be4' }}
                              onClick={() => { setProcessoEditando(pr); setModalEditar(true); }}
                            >
                              Editar
                            </button>
                          )}
                          {/* Excluir — requer permissão processos.excluir */}
                          {temPermissao('processos', 'excluir') && (
                            <button
                              className="btn btn-danger"
                              style={{ fontSize: '12px', padding: '4px 10px' }}
                              onClick={() => excluirProcesso(pr.id)}
                            >
                              Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {processos.length === 0 && (
                <p className="lista-vazia">Nenhum processo nesta pasta</p>
              )}
            </div>
          </div>
        )}

        {/* === ABA: ANDAMENTOS === */}
        {abaAtiva === 'andamentos' && (
          <div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
              {selectProcesso}
              {/* Botão de novo andamento só aparece quando um processo específico está selecionado */}
              {processoSelecionado && (
                <button className="btn btn-primary"
                  onClick={() => { setAndamentoEditando(null); setModalAndamento(true); }}>
                  + Novo Andamento
                </button>
              )}
            </div>
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    {/* Coluna extra de processo só quando "Todos" está ativo */}
                    {processoFiltro === 'todos' && <th>Processo</th>}
                    <th>Registrado por</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {andamentos.map(a => (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatarData(a.data)}</td>
                      <td style={{ maxWidth: '400px' }}>{a.descricao}</td>
                      {processoFiltro === 'todos' && (
                        <td style={{ fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap', color: '#555' }}>
                          {processos.find(p => p.id === a._procId)?.numProc || `#${a._procId}`}
                        </td>
                      )}
                      <td>{a.criado_por_nome}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 8px' }}
                            onClick={() => {
                              setAndamentoEditando(a);
                              // Garante que o processo correto esteja selecionado ao editar
                              if (processoFiltro === 'todos') setProcessoFiltro(String(a._procId));
                              setModalAndamento(true);
                            }}>
                            Editar
                          </button>
                          <button className="btn btn-danger" style={{ fontSize: '12px', padding: '4px 8px' }}
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
          </div>
        )}

        {/* === ABA: PRAZOS === */}
        {abaAtiva === 'prazos' && (
          <div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              {selectProcesso}
              {processoSelecionado && (
                <Link to="/prazos" className="btn btn-primary">
                  + Novo Prazo
                </Link>
              )}
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
              {prazos.length === 0 && <p className="lista-vazia">Nenhum prazo encontrado</p>}
            </div>
          </div>
        )}

        {/* === ABA: TAREFAS === */}
        {abaAtiva === 'tarefas' && (
          <div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
              {selectProcesso}
              {processoSelecionado && (
                <Link to="/tarefas" className="btn btn-primary">
                  + Nova Tarefa
                </Link>
              )}
            </div>
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr><th>Tarefa</th><th>Prioridade</th><th>Vencimento</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {tarefas.filter(t => !t.concluida).slice(0, 20).map(t => (
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
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
              {selectProcesso}
              {processoSelecionado && (
                <Link to="/audiencias" className="btn btn-primary">
                  + Nova Audiência
                </Link>
              )}
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
                      <td>{formatarData(a.data)} {a.hora?.slice(0, 5)}</td>
                      <td>{a.modalidade === 'virtual' ? 'Virtual' : 'Presencial'}</td>
                      <td>{a.local || a.link_virtual || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {audiencias.length === 0 && <p className="lista-vazia">Nenhuma audiência encontrada</p>}
            </div>
          </div>
        )}

        {/* === ABA: FINANCEIRO === */}
        {/* Financeiro é por pasta — o seletor de processo é informativo */}
        {abaAtiva === 'financeiro' && (
          <div>
            {contaCorrente ? (
              <div>
                {/* Botões no topo — mesmo padrão das demais abas */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={() => setModalLancamento(true)}>
                    + Lançamento
                  </button>
                  <Link to="/financeiro" className="btn btn-outline" style={{ fontSize: '12px' }}>
                    Ver completo
                  </Link>
                </div>
                {contaCorrente.honorarios && (
                  <div className="card" style={{ background: '#f8fafc', marginBottom: '16px', border: '1px solid #e8ecf0' }}>
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#888' }}>Tipo de honorário</div>
                        <strong style={{ fontSize: '14px' }}>
                          {contaCorrente.honorarios.tipo === 'percentual'
                            ? `${contaCorrente.honorarios.percentual}%`
                            : contaCorrente.honorarios.tipo === 'fixo'
                              ? `Fixo: ${formatarMoeda(contaCorrente.honorarios.valor_fixo)}`
                              : 'Sem honorários'}
                        </strong>
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: '#888' }}>Saldo atual</div>
                        <strong style={{ fontSize: '14px', color: contaCorrente.saldo >= 0 ? '#059669' : '#dc2626' }}>
                          {formatarMoeda(contaCorrente.saldo)}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
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

      {/* Modal: Novo Processo (na mesma pasta)
          processoBase = primeiro processo da pasta, para pré-preencher as partes */}
      {modalProcesso && (
        <ModalNovoProcesso
          pastaId={id}
          processoBase={processos[0] || null}
          onFechar={(reload) => { setModalProcesso(false); if (reload) carregarPasta(); }}
        />
      )}

      {/* Modal: Editar Processo */}
      {modalEditar && processoEditando && (
        <ModalEditarProcesso
          processo={processoEditando}
          onFechar={(reload) => {
            setModalEditar(false);
            setProcessoEditando(null);
            if (reload) carregarPasta();
          }}
        />
      )}

      {/* Modal: Andamento — só abre quando há um processo específico selecionado */}
      {modalAndamento && processoSelecionado && (
        <ModalAndamento
          processoId={processoSelecionado.id}
          andamento={andamentoEditando}
          onFechar={(reload) => {
            setModalAndamento(false);
            setAndamentoEditando(null);
            if (reload) carregarAndamentos();
          }}
        />
      )}

      {/* Modal: Lançamento financeiro */}
      {modalLancamento && (
        <ModalLancamento
          pastaId={id}
          onFechar={(reload) => { setModalLancamento(false); if (reload) carregarFinanceiro(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// Modal de andamento (criar / editar)
// ============================================================
function ModalAndamento({ processoId, andamento, onFechar }) {
  const [form, setForm]         = useState(andamento || { data_andamento: new Date().toISOString().split('T')[0] });
  const [salvando, setSalvando] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

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
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>{andamento ? 'Editar Andamento' : 'Novo Andamento'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Data *</label>
            <input type="date" className="form-control" value={form.data_andamento || ''}
              onChange={e => set('data_andamento', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Descrição *</label>
            <textarea className="form-control" rows={4} value={form.descricao || ''}
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

// ============================================================
// Modal de lançamento financeiro
// ============================================================
function ModalLancamento({ pastaId, onFechar }) {
  const [form, setForm]         = useState({ tipo: 'credito', data_lancamento: new Date().toISOString().split('T')[0] });
  const [salvando, setSalvando] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

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
    <div className="modal-overlay">
      <div className="modal-box modal-pequeno">
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
            <input className="form-control" value={form.descricao || ''}
              onChange={e => set('descricao', e.target.value)}
              onBlur={() => set('descricao', toTitleCase(form.descricao))} />
          </div>
          <div className="form-group">
            <label className="form-label">Valor (R$) *</label>
            <input type="number" step="0.01" className="form-control" value={form.valor || ''}
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
