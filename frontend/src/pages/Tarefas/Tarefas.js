// ============================================================
// PÁGINA DE TAREFAS
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { tarefasAPI, processosAPI } from '../../services/api';
import { formatarData, labelPrioridade, toTitleCase, mascaraCNJ } from '../../utils/formatters';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import MenuAcoes from '../../components/MenuAcoes';
import ModalLerPublicacao from '../../components/ModalLerPublicacao';

const PRIORIDADE_COR = { urgente: 'badge-vermelho', normal: 'badge-laranja', baixa: 'badge-verde' };
const LIMITE = 100;

// Deduz o tipo da tarefa a partir dos campos de vínculo
function tipoTarefa(t) {
  if (t.processo_id) return 'processo';
  if (t.pasta_id)    return 'pasta';
  return 'rotina';
}

// Data (YYYY-MM-DD) de hoje + N dias, em horário LOCAL — evita o off-by-one do toISOString (UTC).
function dataMaisDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Botões de período rápido: teto de vencimento em hoje + N dias (as atrasadas e as sem data entram junto).
const PERIODOS = [
  { chave: 'hoje', label: 'Hoje',    dias: 0 },
  { chave: '7',    label: '7 dias',  dias: 7 },
  { chave: '30',   label: '30 dias', dias: 30 },
];

// Estado inicial/limpo dos filtros: padrão da tela (Pendentes, Todas, usuário logado) + período "7 dias" aceso.
function filtrosPadrao(usuarioId) {
  return {
    concluida: '0', prioridade: '', atrasadas: '',
    usuario_id: usuarioId || '',
    numero_processo: '',
    data_de: '', data_ate: dataMaisDias(7), incluir_sem_data: '1',
    pagina: 1,
  };
}

export default function Tarefas() {
  const { temPermissao, ehAdmin, usuario } = useAuth();
  // Só admin/super OU quem tem a permissão tarefas.ver_todos enxerga o filtro "Para" (responsável).
  // Os demais ficam sempre restritos às próprias tarefas + as do escritório (regra aplicada no backend).
  const podeVerTodos = ehAdmin || temPermissao('tarefas.ver_todos', 'visualizar');
  const [lista, setLista]             = useState([]);
  const [total, setTotal]             = useState(0);
  // concluida: '0' pendentes | '1' concluídas | '' todas.
  // atrasadas: '1' mostra só as pendentes já vencidas (atalho); quando ativo, concluida fica '' (o backend cuida).
  // usuario_id: filtro "Para" — começa no usuário logado (vê as dele + as do escritório); '' = Todos.
  // numero_processo: trecho do nº do processo (a partir de 3 dígitos). data_de / data_ate: intervalo de vencimento.
  const [filtros, setFiltros]         = useState(() => filtrosPadrao(usuario?.id));
  const [numeroInput, setNumeroInput] = useState(''); // valor cru do campo Número do Processo (debounced p/ filtros)
  const [usuarios, setUsuarios]       = useState([]); // lista para o dropdown "Para" (só carrega p/ quem vê todos)
  const [carregando, setCarregando]   = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando]       = useState(null);
  const [confirmar, setConfirmar]     = useState(null);
  const [tarefaHistorico, setTarefaHistorico] = useState(null);
  const [tarefaVerPub, setTarefaVerPub]       = useState(null); // publicacao_id p/ ler a publicação de origem
  const location = useLocation();
  const [novaData, setNovaData] = useState(''); // data pré-preenchida vinda da Agenda (deep-link)

  // Deep-link da Agenda: /tarefas?nova=1&data=YYYY-MM-DD abre o modal de nova tarefa já com a data
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('nova') === '1') {
      setEditando(null);
      setNovaData(params.get('data') || '');
      setModalAberto(true);
    }
  }, [location.search]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await tarefasAPI.listar({ ...filtros, limite: LIMITE });
      if (data.ok) { setLista(data.dados.registros); setTotal(data.dados.total); }
    } catch { toast.error('Erro ao carregar tarefas'); }
    finally { setCarregando(false); }
  }, [filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  // Lista de usuários do filtro "Para" — só carrega para quem pode ver todos
  useEffect(() => {
    if (podeVerTodos) {
      processosAPI.auxiliares().then(r => setUsuarios(r.data.dados.usuarios || [])).catch(() => {});
    }
  }, [podeVerTodos]);

  // Debounce do campo "Número do Processo": busca 350ms depois de parar de digitar (mesmo padrão de Prazos).
  // Considera só os dígitos: com 3 ou mais aplica o filtro; com menos (ou vazio) limpa e mostra tudo.
  useEffect(() => {
    const t = setTimeout(() => {
      const dig = numeroInput.replace(/\D/g, '');
      setFiltros(f => ({ ...f, numero_processo: dig.length >= 3 ? dig : '', pagina: 1 }));
    }, 350);
    return () => clearTimeout(t);
  }, [numeroInput]);

  async function toggleConcluir(tarefa) {
    try {
      if (tarefa.concluida) {
        await tarefasAPI.reabrir(tarefa.id);
        toast.success('Tarefa reaberta');
      } else {
        await tarefasAPI.concluir(tarefa.id);
        toast.success('Tarefa concluída!');
      }
      carregar();
    } catch { toast.error('Erro ao alterar tarefa'); }
  }

  function confirmarExcluir(tarefa) {
    setConfirmar({
      titulo: 'Excluir Tarefa',
      mensagem: `A tarefa "${tarefa.titulo}" será removida permanentemente. Esta ação não pode ser desfeita.`,
      textoBotao: '🗑️ Excluir',
      tipo: 'perigo',
      acao: async () => {
        try {
          await tarefasAPI.excluir(tarefa.id);
          toast.success('Tarefa excluída');
          carregar();
        } catch { toast.error('Erro ao excluir tarefa'); }
        finally { setConfirmar(null); }
      },
    });
  }

  // Muda filtro e volta para página 1 (exceto quando muda a própria página)
  function setFiltro(k, v) {
    setFiltros(f => ({ ...f, [k]: v, ...(k !== 'pagina' ? { pagina: 1 } : {}) }));
  }

  // Botão de período rápido: teto = hoje + N dias, sem piso (atrasadas entram), e incluir_sem_data liga as sem-data.
  function aplicarPeriodo(dias) {
    setFiltros(f => ({ ...f, data_de: '', data_ate: dataMaisDias(dias), incluir_sem_data: '1', pagina: 1 }));
  }

  // Edição manual dos campos "Vencimento de / Até": vira um intervalo EXATO — desliga o período rápido
  // (nenhum botão fica aceso) e para de incluir as tarefas sem data.
  function setDataManual(k, v) {
    setFiltros(f => ({ ...f, [k]: v, incluir_sem_data: '', pagina: 1 }));
  }

  // Qual botão de período está aceso (derivado do estado — sem estado redundante).
  const periodoAtivo = filtros.incluir_sem_data === '1' && filtros.data_de === ''
    ? (PERIODOS.find(p => filtros.data_ate === dataMaisDias(p.dias))?.chave || null)
    : null;

  // Renderiza o vínculo da tarefa na coluna — com hiperlink se for pasta ou processo
  function renderVinculo(t) {
    const tipo = tipoTarefa(t);
    if (tipo === 'pasta') {
      return (
        <Link to={`/processos/pasta/${t.pasta_id}?aba=tarefas`}
          style={{ fontSize: '13px', fontWeight: 500 }}>
          Pasta {t.pasta_numero_fmt || t.pasta_id}
        </Link>
      );
    }
    if (tipo === 'processo') {
      return (
        <Link to={`/processos/pasta/${t.pasta_do_processo_id}?aba=tarefas&processo=${t.processo_id}`}
          style={{ fontSize: '13px', fontFamily: 'monospace' }}>
          {t.processo_numero || `Processo ${t.processo_id}`}
        </Link>
      );
    }
    return <span style={{ fontSize: '13px', color: '#64748b' }}>Rotina Interna</span>;
  }

  const totalPaginas = Math.ceil(total / LIMITE);

  return (
    <div>
      {/* Filtros */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Mostrar</label>
            {/* Dropdown único. "Atrasadas" é um atalho: mostra só as pendentes já vencidas.
                Quando escolhido, guardamos atrasadas='1' e limpamos concluida (o backend aplica a regra). */}
            <select className="form-control"
              value={filtros.atrasadas === '1' ? 'atrasadas' : filtros.concluida}
              onChange={e => {
                const v = e.target.value;
                if (v === 'atrasadas') setFiltros(f => ({ ...f, concluida: '', atrasadas: '1', pagina: 1 }));
                else                   setFiltros(f => ({ ...f, concluida: v,  atrasadas: '',  pagina: 1 }));
              }}>
              <option value="0">Pendentes</option>
              <option value="1">Concluídas</option>
              <option value="">Todas</option>
              <option value="atrasadas">Atrasadas</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Prioridade</label>
            <select className="form-control" value={filtros.prioridade} onChange={e => setFiltro('prioridade', e.target.value)}>
              <option value="">Todas</option>
              <option value="urgente">🔴 Urgente</option>
              <option value="normal">🟡 Normal</option>
              <option value="baixa">🟢 Baixa</option>
            </select>
          </div>
          {podeVerTodos && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Para</label>
              <select className="form-control" value={filtros.usuario_id} onChange={e => setFiltro('usuario_id', e.target.value)}>
                <option value="">Todos</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          )}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Número do Processo</label>
            {/* Filtra por trecho do número (a partir do 3º caractere), com debounce de 350ms.
                Aceita com ou sem pontuação — o backend ignora pontos e traços na comparação. */}
            <input className="form-control" placeholder="Parte do número..."
              value={numeroInput} maxLength={25}
              style={{ minWidth: '170px', fontFamily: 'monospace', letterSpacing: '0.5px' }}
              onChange={e => setNumeroInput(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Vencimento de</label>
            <input type="date" className="form-control" value={filtros.data_de} onChange={e => setDataManual('data_de', e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Até</label>
            <input type="date" className="form-control" value={filtros.data_ate} onChange={e => setDataManual('data_ate', e.target.value)} />
          </div>
          <button className="btn btn-secondary" style={{ marginBottom: '1px' }}
            onClick={() => { setNumeroInput(''); setFiltros(filtrosPadrao(usuario?.id)); }}>
            ✕ Limpar filtros
          </button>
          {temPermissao('tarefas', 'cadastrar') && (
            <button className="btn btn-primary" style={{ marginBottom: '1px' }}
              onClick={() => { setEditando(null); setNovaData(''); setModalAberto(true); }}>
              + Nova Tarefa
            </button>
          )}
          <span style={{ marginLeft: 'auto', color: '#888', fontSize: '13px', marginBottom: '1px' }}>
            {total} tarefa(s)
          </span>
        </div>

        {/* Período rápido: sempre inclui as atrasadas e as sem data; muda só o teto de vencimento (hoje/hoje+7/hoje+30). */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Período rápido:</span>
          {PERIODOS.map(p => (
            <button key={p.chave} type="button"
              className={`btn ${periodoAtivo === p.chave ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 16px', fontSize: '13px' }}
              onClick={() => aplicarPeriodo(p.dias)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="card">
        {carregando ? <div className="loading">Carregando...</div> : (
          <div className="tabela-wrapper" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <table className="tabela tabela-sticky">
              <thead>
                <tr>
                  <th>Tarefa</th>
                  <th>Prioridade</th>
                  <th>Vencimento</th>
                  <th>Para</th>
                  <th>Vínculo</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(t => (
                  <tr key={t.id} style={t.concluida ? { opacity: 0.6 } : {}}>
                    <td>
                      <strong style={t.concluida ? { textDecoration: 'line-through' } : {}}>
                        {t.titulo}
                      </strong>
                      {t.descricao && (
                        <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                          {t.descricao}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${PRIORIDADE_COR[t.prioridade]}`}>
                        {labelPrioridade(t.prioridade)}
                      </span>
                    </td>
                    <td style={!t.concluida && t.dias_restantes < 0 ? { color: '#dc2626', fontWeight: 600 } : {}}>
                      {t.data_vencimento ? formatarData(t.data_vencimento) : '—'}
                      {!t.concluida && t.dias_restantes < 0 && (
                        <span style={{ fontSize: '11px', display: 'block' }}>
                          ({Math.abs(t.dias_restantes)}d atraso)
                        </span>
                      )}
                    </td>
                    <td>{t.atribuida_para_nome || 'Escritório'}</td>
                    <td>{renderVinculo(t)}</td>
                    <td>
                      <MenuAcoes itens={[
                        { label: t.concluida ? 'Reabrir' : 'Concluir', icone: t.concluida ? '↩️' : '✅',
                          onClick: () => toggleConcluir(t) },
                        { label: 'Editar', icone: '✏️',
                          oculto: !(temPermissao('tarefas','alterar') && !t.concluida),
                          onClick: () => { setEditando(t); setModalAberto(true); } },
                        { label: 'Histórico', icone: '📋',
                          oculto: !temPermissao('tarefas','historico'),
                          onClick: () => setTarefaHistorico(t) },
                        { label: 'Ver publicação de origem', icone: '📄',
                          oculto: !t.publicacao_id || !temPermissao('publicacoes','visualizar'),
                          onClick: () => setTarefaVerPub(t.publicacao_id) },
                        { label: 'Excluir', icone: '🗑️', perigo: true,
                          oculto: !temPermissao('tarefas','excluir'),
                          onClick: () => confirmarExcluir(t) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && <p className="lista-vazia">Nenhuma tarefa encontrada</p>}
          </div>
        )}

        {/* Paginação */}
        {total > LIMITE && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 4px 0', marginTop: '8px', borderTop: '1px solid #f1f5f9' }}>
            <button className="btn btn-secondary" disabled={filtros.pagina <= 1}
              onClick={() => setFiltro('pagina', filtros.pagina - 1)}
              style={{ padding: '6px 16px', fontSize: '13px' }}>
              ◀ Anterior
            </button>
            <span style={{ color: '#64748b', fontSize: '13px' }}>
              Página <strong>{filtros.pagina}</strong> de <strong>{totalPaginas}</strong>
              &nbsp;·&nbsp;{total} registro(s)
            </span>
            <button className="btn btn-secondary" disabled={filtros.pagina >= totalPaginas}
              onClick={() => setFiltro('pagina', filtros.pagina + 1)}
              style={{ padding: '6px 16px', fontSize: '13px' }}>
              Próximo ▶
            </button>
          </div>
        )}
      </div>

      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
      {tarefaHistorico && <ModalHistoricoTarefa tarefa={tarefaHistorico} onFechar={() => setTarefaHistorico(null)} />}
      {tarefaVerPub    && <ModalLerPublicacao publicacaoId={tarefaVerPub} onFechar={() => setTarefaVerPub(null)} />}

      {modalAberto && (
        <ModalTarefa
          tarefa={editando}
          dataInicial={novaData}
          onFechar={(reload) => { setModalAberto(false); setNovaData(''); if (reload) carregar(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// MODAL HISTÓRICO DE TAREFA — Linha do tempo de eventos
// ============================================================
export function ModalHistoricoTarefa({ tarefa, onFechar }) {
  const { temPermissao } = useAuth();
  const [historico, setHistorico] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [verPub, setVerPub] = useState(false); // ler a publicação de origem

  useEffect(() => {
    tarefasAPI.historico(tarefa.id)
      .then(r => { if (r.data.ok) setHistorico(r.data.dados); })
      .catch(() => toast.error('Erro ao carregar histórico'))
      .finally(() => setCarregando(false));
  }, [tarefa.id]);

  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onFechar(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onFechar]);

  function corDoEvento(ev) {
    if (ev.descricao?.includes('concluída')) return '#16a34a';
    if (ev.descricao?.includes('excluída'))  return '#6b7280';
    if (ev.descricao?.includes('reaberta'))  return '#f59e0b';
    if (ev.descricao?.includes('cadastrada')) return '#0ea5e9';
    return '#64748b';
  }

  return (
    <>
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>📋 Histórico da Tarefa</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '20px', color: '#555', fontWeight: 600 }}>
            {tarefa.titulo}
          </p>

          {carregando && <p style={{ color: '#888', textAlign: 'center', padding: '24px' }}>Carregando...</p>}

          {!carregando && historico && (
            <div style={{ position: 'relative' }}>
              {/* Linha vertical da timeline */}
              <div style={{
                position: 'absolute', left: '19px', top: '8px',
                bottom: '8px', width: '2px', background: '#e2e8f0'
              }} />

              {historico.eventos.map((ev, i) => (
                <div key={i} style={{
                  display: 'flex', gap: '16px', alignItems: 'flex-start',
                  marginBottom: '20px', position: 'relative'
                }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                    background: corDoEvento(ev),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', zIndex: 1, boxShadow: '0 0 0 3px #fff'
                  }}>
                    {ev.icone}
                  </div>
                  <div style={{
                    flex: 1, background: '#f8fafc', borderRadius: '8px',
                    padding: '10px 14px', border: '1px solid #e2e8f0'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '4px' }}>
                      <strong style={{ fontSize: '14px', color: '#1e293b' }}>{ev.descricao}</strong>
                      <span style={{ fontSize: '15px', color: '#334155', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {ev.data ? new Date(ev.data).toLocaleString('pt-BR') : '—'}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                      👤 {ev.usuario}
                    </div>
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
          {tarefa.publicacao_id && temPermissao('publicacoes','visualizar') && (
            <button className="btn btn-outline" onClick={() => setVerPub(true)}>📄 Ver publicação de origem</button>
          )}
          <button className="btn btn-secondary" style={{ marginLeft: 'auto' }} onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
    {verPub && <ModalLerPublicacao publicacaoId={tarefa.publicacao_id} onFechar={() => setVerPub(false)} />}
    </>
  );
}

// ============================================================
// MODAL DE TAREFA — Criar / Editar
// preSelecao: { tipo, processo_id, processo_numero }
//   usado quando aberto a partir do PastaDetalhe
// ============================================================
export function ModalTarefa({ tarefa, onFechar, preSelecao, dataInicial, publicacaoId }) {
  // Deduz tipo inicial: tarefa existente → preSelecao → 'rotina'
  // Obs: tipo 'pasta' foi removido da UI — tarefas antigas com pasta_id continuam exibidas
  //      corretamente na listagem, mas não é mais possível criar/editar com esse vínculo
  const tipoInicial = tarefa?.processo_id ? 'processo'
    : preSelecao?.tipo === 'processo' ? 'processo'
    : 'rotina';

  const [tipo, setTipo]         = useState(tipoInicial);
  const [form, setForm]         = useState({
    titulo:          tarefa?.titulo || '',
    descricao:       tarefa?.descricao || '',
    prioridade:      tarefa?.prioridade || 'normal',
    data_vencimento: tarefa?.data_vencimento ? tarefa.data_vencimento.split('T')[0] : (dataInicial || ''),
    atribuida_para:  tarefa?.atribuida_para ? String(tarefa.atribuida_para) : '',
    processo_id:     tarefa?.processo_id || preSelecao?.processo_id || null,
  });
  const [salvando, setSalvando]   = useState(false);
  const [usuarios, setUsuarios]   = useState([]);
  const [confirmarData, setConfirmarData] = useState(false); // confirmação do admin p/ data passada
  const [aviso, setAviso] = useState(''); // faixa de aviso DENTRO do modal (nunca toast do canto)
  const { ehAdmin } = useAuth();

  // Busca de processo (CNJ) — inicializa com pré-seleção se vier do PastaDetalhe
  const [buscaProc, setBuscaProc]             = useState(preSelecao?.processo_numero || '');
  const [sugestoesProc, setSugestoesProc]     = useState([]);
  const [processosDaPasta, setProcessosDaPasta] = useState([]);
  const [pastaSelecionada, setPastaSelecionada] = useState(null);
  const [naoCadastrado, setNaoCadastrado]       = useState(false); // pesquisou o número e não achou pasta

  useEffect(() => {
    processosAPI.auxiliares().then(r => setUsuarios(r.data.dados.usuarios || []));
    // Vindo de uma publicação (número no ar, mas ainda sem processo escolhido): já dispara a
    // busca da pasta para o usuário escolher. Não afeta o uso da PastaDetalhe (que já vem com
    // processo_id) nem o botão "Nova Tarefa" (sem preSelecao).
    if (preSelecao?.processo_numero && !form.processo_id) preselecionarProcesso(preSelecao.processo_numero);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Muda o tipo e limpa os vínculos anteriores. Se voltar para "Processo" trazendo um
  // número da publicação, RESTAURA esse número (fica disponível p/ aceitar ou trocar) e
  // já tenta reselecionar; nos demais casos, limpa (comportamento normal).
  function mudarTipo(novoTipo) {
    setTipo(novoTipo);
    set('processo_id', null);
    setSugestoesProc([]);
    setProcessosDaPasta([]);
    setPastaSelecionada(null);
    setNaoCadastrado(false);
    const seed = preSelecao?.processo_numero || '';
    if (novoTipo === 'processo' && seed) {
      setBuscaProc(seed);
      preselecionarProcesso(seed);
    } else {
      setBuscaProc('');
    }
  }

  // ── Busca de PROCESSO (por CNJ) ───────────────────────────────────────────

  async function buscarProcessos(termo) {
    const semMask = termo.replace(/\D/g, '');
    if (semMask.length < 3 && termo.length < 3) { setSugestoesProc([]); setNaoCadastrado(false); return; }
    try {
      const { data } = await processosAPI.listarPastas({ busca: termo, limite: 8 });
      if (data.ok) { const regs = data.dados.registros || []; setSugestoesProc(regs); setNaoCadastrado(regs.length === 0); }
    } catch {}
  }

  // Vindo de publicação: pesquisa a pasta pelo número; se achar UMA só, já seleciona
  // (resolvendo o processo). Se achar várias, mostra as sugestões para o usuário escolher.
  async function preselecionarProcesso(termo) {
    if (!termo) return;
    try {
      const { data } = await processosAPI.listarPastas({ busca: termo, limite: 8 });
      if (!data.ok) return;
      const regs = data.dados.registros || [];
      if (regs.length === 1) { await selecionarPastaParaProcesso(regs[0], termo); }
      else                   { setSugestoesProc(regs); setNaoCadastrado(regs.length === 0); }
    } catch {}
  }

  async function selecionarPastaParaProcesso(pasta, numeroBusca) {
    setSugestoesProc([]);
    setNaoCadastrado(false);
    setPastaSelecionada(pasta);
    try {
      const { data } = await processosAPI.buscarPasta(pasta.id);
      if (data.ok) {
        const procs = data.dados.processos || [];
        const cnj   = (numeroBusca != null ? numeroBusca : buscaProc).replace(/\D/g, '');
        const match = procs.find(p => p.numProc?.replace(/\D/g, '') === cnj);

        if (match) {
          // CNJ exato encontrado — seleciona automaticamente
          setBuscaProc(match.numProc || '');
          set('processo_id', match.id);
          setProcessosDaPasta([]);
        } else if (procs.length === 1) {
          // Só um processo na pasta — seleciona automaticamente
          setBuscaProc(procs[0].numProc || '');
          set('processo_id', procs[0].id);
          setProcessosDaPasta([]);
        } else {
          // Múltiplos processos — mostra lista para o usuário escolher
          setProcessosDaPasta(procs);
        }
      }
    } catch {}
  }

  function selecionarProcesso(proc) {
    setBuscaProc(proc.numProc || '');
    set('processo_id', proc.id);
    setProcessosDaPasta([]);
    setPastaSelecionada(null);
    setNaoCadastrado(false);
  }

  // ── Salvar ────────────────────────────────────────────────────────────────

  // Grava de fato (chamado direto ou após a confirmação da data passada)
  async function executarSalvar() {
    setSalvando(true);
    try {
      const payload = {
        ...form,
        titulo:      form.titulo.trim(),
        pasta_id:    null,                                            // pasta não é mais tipo suportado
        processo_id: tipo === 'processo' ? form.processo_id : null,
      };

      if (tarefa?.id) {
        await tarefasAPI.atualizar(tarefa.id, payload);
        toast.success('Tarefa atualizada!');
      } else {
        // Vínculo de origem (quando a tarefa nasce de uma publicação). Só na criação.
        await tarefasAPI.criar({ ...payload, publicacao_id: publicacaoId || null });
        toast.success('Tarefa criada!');
      }
      onFechar(true);
    } catch (err) {
      setAviso(err.response?.data?.mensagem || 'Não foi possível salvar a tarefa.');
    } finally {
      setSalvando(false);
    }
  }

  function salvar() {
    if (!form.titulo?.trim())                     return setAviso('Informe o título da tarefa.');
    if (tipo === 'processo' && !form.processo_id) return setAviso('Selecione o processo.');
    // Vencimento anterior a hoje: usuário comum é bloqueado; admin confirma. (Tarefa sem data não entra aqui.)
    const h = new Date();
    const hojeStr = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
    if (form.data_vencimento && form.data_vencimento < hojeStr) {
      if (!ehAdmin) return setAviso('Apenas o administrador pode agendar tarefa com data anterior a hoje. Escolha uma data a partir de hoje.');
      return setConfirmarData(true);
    }
    setAviso('');
    executarSalvar();
  }

  return (
    <>
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>{tarefa ? 'Editar Tarefa' : 'Nova Tarefa'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          {aviso && (
            <div style={{ background:'#fff4e5', border:'1px solid #ffcf99', color:'#8a5300',
              padding:'8px 12px', borderRadius:'6px', fontSize:'13px', marginBottom:'12px' }}>
              {aviso}
            </div>
          )}

          {/* ── Seleção de tipo ── */}
          <div className="form-group">
            <label className="form-label">Tipo da tarefa *</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { valor: 'processo', icone: '⚖️', label: 'Processo' },
                { valor: 'rotina',   icone: '🗂️', label: 'Rotina Interna' },
              ].map(op => (
                <button key={op.valor} type="button"
                  onClick={() => mudarTipo(op.valor)}
                  style={{
                    padding: '8px 18px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
                    border: tipo === op.valor ? '2px solid #1a56db' : '2px solid #e2e8f0',
                    background: tipo === op.valor ? '#dbeafe' : '#f8fafc',
                    color: tipo === op.valor ? '#1d4ed8' : '#374151',
                    fontWeight: tipo === op.valor ? 600 : 400,
                    transition: 'all 0.15s',
                  }}>
                  {op.icone} {op.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Campo de busca conforme tipo ── */}

          {tipo === 'processo' && (
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">Processo *</label>
              {naoCadastrado && !form.processo_id && (
                <span style={{ display: 'inline-block', background: '#fef2f2', border: '1px solid #fecaca',
                  color: '#b91c1c', fontWeight: 700, fontSize: '12px', padding: '4px 10px',
                  borderRadius: '6px', marginBottom: '6px' }}>
                  ⚠️ PROCESSO NÃO CADASTRADO
                </span>
              )}
              <input className="form-control"
                placeholder="0000000-00.0000.0.00.0000"
                value={buscaProc} maxLength={25}
                style={{ fontFamily: 'monospace', letterSpacing: '0.5px',
                         ...(form.processo_id ? { background: '#f0fdf4', borderColor: '#16a34a' } : {}) }}
                onChange={e => {
                  const masked = mascaraCNJ(e.target.value);
                  setBuscaProc(masked);
                  set('processo_id', null);
                  setProcessosDaPasta([]);
                  buscarProcessos(masked);
                }}
              />
              {form.processo_id && (
                <span style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px', display: 'block' }}>
                  ✓ Processo selecionado
                </span>
              )}

              {/* Lista de pastas encontradas */}
              {sugestoesProc.length > 0 && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20,
                              border: '1px solid #ddd', borderRadius: '6px', background: '#fff',
                              maxHeight: '180px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  {sugestoesProc.map(p => (
                    <div key={p.id} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}
                      onMouseDown={() => selecionarPastaParaProcesso(p)}>
                      <strong>{String(p.numPasta).padStart(4, '0')}</strong> — {p.titulo_proc || '—'}
                    </div>
                  ))}
                </div>
              )}

              {/* Se a pasta tem múltiplos processos, mostra seletor */}
              {processosDaPasta.length > 1 && (
                <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '6px',
                              background: '#f8fafc', padding: '8px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
                    Selecione o processo:
                  </div>
                  {processosDaPasta.map(proc => (
                    <div key={proc.id} style={{ padding: '8px 10px', cursor: 'pointer', borderRadius: '4px',
                                               fontSize: '13px', fontFamily: 'monospace' }}
                      onMouseDown={() => selecionarProcesso(proc)}
                      onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      {proc.numProc || `Processo ${proc.id}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Título e Descrição ── */}
          <div className="form-group">
            <label className="form-label">Título *</label>
            <input className="form-control" value={form.titulo}
              onChange={e => set('titulo', e.target.value)}
              onBlur={() => set('titulo', toTitleCase(form.titulo))}
              placeholder="Descreva a tarefa..." />
          </div>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea className="form-control" rows={3} value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              onBlur={() => set('descricao', toTitleCase(form.descricao))}
              placeholder="Detalhes adicionais..." style={{ resize: 'vertical' }} />
          </div>

          {/* ── Prioridade / Vencimento / Atribuir ── */}
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Prioridade</label>
              <select className="form-control" value={form.prioridade} onChange={e => set('prioridade', e.target.value)}>
                <option value="urgente">🔴 Urgente</option>
                <option value="normal">🟡 Normal</option>
                <option value="baixa">🟢 Baixa</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Vencimento</label>
              <input type="date" className="form-control" value={form.data_vencimento}
                onChange={e => set('data_vencimento', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Atribuir para</label>
              <select className="form-control" value={form.atribuida_para} onChange={e => set('atribuida_para', e.target.value)}>
                <option value="">Escritório</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          </div>

        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar Tarefa'}
          </button>
        </div>
      </div>
    </div>
    {confirmarData && (
      // z-index acima do modal: mantém a confirmação sempre à frente (mesmo padrão do compromisso).
      <div style={{ position: 'relative', zIndex: 2000 }}>
      <ModalConfirmar
        titulo="Data anterior a hoje"
        tipo="aviso"
        mensagem={`A data de vencimento (${formatarData(form.data_vencimento)}) é anterior a hoje. Deseja agendar mesmo assim?`}
        textoBotao="Agendar assim mesmo"
        acao={async () => { await executarSalvar(); }}
        onCancelar={() => setConfirmarData(false)}
      />
      </div>
    )}
    </>
  );
}
