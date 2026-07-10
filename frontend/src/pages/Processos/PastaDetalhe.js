// ============================================================
// PÁGINA DE DETALHE DA PASTA
// Mostra os processos vinculados e suas abas:
// processos, andamentos, prazos, tarefas, audiências, financeiro
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { processosAPI, andamentoAPI, prazosAPI, tarefasAPI, audienciasAPI, periciasAPI, financeiroAPI } from '../../services/api';
import { formatarData, formatarNumeroPasta, formatarMoeda, labelStatusPrazo, corPrazo, toTitleCase } from '../../utils/formatters';
import { ModalNovoProcesso, ModalEditarProcesso } from './Processos';
import { ModalNovoPrazo, ModalCancelarPrazo, ModalEditarPrazo } from '../Prazos/Prazos';
import { ModalTarefa } from '../Tarefas/Tarefas';
import { ModalNovaAudiencia, ModalEditarAudiencia, ModalCancelarAudiencia, ModalRemarcarAudiencia, ModalHistoricoAudiencia, ModalRegistrarAta } from '../Audiencias/Audiencias';
// Modais de perícia reutilizados da tela de Perícias (aba Perícias da pasta)
import { ModalPericia, ModalCancelar as ModalCancelarPericia, ModalRemarcar as ModalRemarcarPericia, ModalHistorico as ModalHistoricoPericia } from '../Pericias/Pericias';
// Componentes financeiros reutilizados da tela Financeiro (aba Financeiro da pasta — por processo)
import { ModalLancamento as ModalLancamentoFin, ModalAcordo as ModalAcordoFin, AcordoBloco, ModalHistoricoLancamento } from '../Financeiro/Financeiro';
import { useAuth } from '../../context/AuthContext';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import NumeroProcessoCopiavel from '../../components/NumeroProcessoCopiavel';

const STATUS_COR_PRAZO = { agendado:'badge-azul', pendente:'badge-laranja', atrasado:'badge-vermelho', concluido:'badge-verde', cancelado:'badge-cinza' };

// Status de audiências — cores e labels (mesmos usados na tela de Audiências)
const STATUS_COR_AUD   = { agendada:'badge-azul', realizada:'badge-verde', adiada:'badge-laranja', cancelada:'badge-vermelho', remarcada:'badge-cinza', acordo:'badge-verde' };
const STATUS_LABEL_AUD = { agendada:'Agendada', realizada:'Realizada', adiada:'Adiada', cancelada:'Cancelada', remarcada:'Remarcada', acordo:'Acordo' };

// Status de perícias — mesmas cores/labels da tela de Perícias (função badgeStatus de lá)
const STATUS_COR_PER   = { agendada:'badge-azul', realizada:'badge-verde', cancelada:'badge-vermelho', remarcada:'badge-amarelo' };
const STATUS_LABEL_PER = { agendada:'Agendada', realizada:'Realizada', cancelada:'Cancelada', remarcada:'Remarcada' };
import { toast } from 'react-toastify';

export default function PastaDetalhe() {
  const { id } = useParams();
  const navigate  = useNavigate();
  const location  = useLocation();
  const { temPermissao, usuario, ehAdmin } = useAuth();

  // Lê parâmetros da URL para abrir aba e processo corretos ao chegar pelo Dashboard
  const urlParams       = new URLSearchParams(location.search);
  const abaInicial      = urlParams.get('aba')      || 'processos';
  const processoInicial = urlParams.get('processo') || 'todos';

  const [pasta, setPasta]           = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [abaAtiva, setAbaAtiva]     = useState(abaInicial);

  // Filtro de processo compartilhado pelas abas — 'todos' ou id (string) do processo
  // Inicializado com o parâmetro ?processo= da URL quando vindo do Dashboard
  const [processoFiltro, setProcessoFiltro] = useState(processoInicial);

  // Dados por aba
  const [andamentos, setAndamentos]       = useState([]);
  const [prazos, setPrazos]               = useState([]);
  const [tarefas, setTarefas]             = useState([]);
  const [audiencias, setAudiencias]       = useState([]);
  const [contaCorrente, setContaCorrente] = useState(null);   // { lancamentos, saldo_total } do processo
  const [acordosFin, setAcordosFin]       = useState([]);     // acordos do processo
  const [lancEditandoFin, setLancEditandoFin]   = useState(null);
  const [modalAcordoFin, setModalAcordoFin]     = useState(false);
  const [acordoEditandoFin, setAcordoEditandoFin] = useState(null);
  const [acordoTipoNovoFin, setAcordoTipoNovoFin] = useState('acordo'); // 'acordo' | 'alvara' ao criar
  const [histLancamentoFin, setHistLancamentoFin] = useState(null);

  // Modais — Prazos
  const [prazoCancelando, setPrazoCancelando] = useState(null);
  const [prazoEditando, setPrazoEditando]     = useState(null);
  const [modalNovoPrazo, setModalNovoPrazo]   = useState(false);
  const [tiposPrazo, setTiposPrazo]           = useState({ tipos: [], subtipos: [] });

  // Modais — Tarefas
  const [modalTarefa, setModalTarefa]         = useState(false);
  const [tarefaEditando, setTarefaEditando]   = useState(null);

  // Modais — Audiências
  const [modalNovaAudiencia, setModalNovaAudiencia] = useState(false); // abrir modal de nova audiência
  const [audienciaEditando, setAudienciaEditando]   = useState(null);  // audiência sendo editada
  const [audienciaCancelando, setAudienciaCancelando] = useState(null); // audiência sendo cancelada
  const [audienciaRemarcando, setAudienciaRemarcando] = useState(null); // audiência sendo remarcada
  const [audienciaHistorico, setAudienciaHistorico]   = useState(null); // audiência com histórico aberto
  const [audienciaAta, setAudienciaAta]               = useState(null); // audiência para registrar ata
  const [tiposAudiencia, setTiposAudiencia]           = useState([]);   // lista de tipos para o modal de edição

  // Modais — Perícias (mesmo fluxo da aba Audiências)
  const [pericias, setPericias]                 = useState([]);   // perícias do processo/pasta filtrada
  const [tiposPericia, setTiposPericia]         = useState([]);   // tipos para o modal de nova/editar
  const [modalNovaPericia, setModalNovaPericia] = useState(false);// abrir modal de nova perícia
  const [periciaEditando, setPericiaEditando]   = useState(null); // perícia sendo editada
  const [periciaCancelando, setPericiaCancelando] = useState(null); // perícia sendo cancelada
  const [periciaRemarcando, setPericiaRemarcando] = useState(null); // perícia sendo remarcada
  const [periciaHistorico, setPericiaHistorico]   = useState(null); // perícia com histórico aberto

  // Modal de confirmação reutilizável (substitui window.confirm)
  const [confirmar, setConfirmar] = useState(null);
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
    if (abaAtiva === 'prazos') {
      carregarPrazos();
      if (!tiposPrazo.tipos.length) prazosAPI.tipos().then(r => { if (r.data.ok) setTiposPrazo(r.data.dados); });
    }
    if (abaAtiva === 'tarefas')    carregarTarefas();
    if (abaAtiva === 'audiencias') carregarAudiencias();
    if (abaAtiva === 'pericias')   carregarPericias();
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

  function concluirPrazo(prazoId) {
    setConfirmar({
      titulo: 'Concluir Prazo',
      mensagem: 'Deseja marcar este prazo como Concluído? O status será atualizado para todos os usuários.',
      textoBotao: '✅ Concluir',
      tipo: 'sucesso',
      acao: async () => {
        await prazosAPI.mudarStatus(prazoId, { status: 'concluido' });
        toast.success('Prazo concluído!');
        carregarPrazos();
      },
    });
  }

  async function fazerPrazo(prazoId) {
    try {
      await prazosAPI.marcarFazendo(prazoId);
      toast.success('Prazo marcado como "Fazendo"');
      carregarPrazos();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao marcar prazo'); }
  }

  async function liberarFazendo(prazoId) {
    try {
      await prazosAPI.liberarFazendo(prazoId);
      toast.success('Prazo liberado');
      carregarPrazos();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao liberar prazo'); }
  }

  function confirmarExcluirPrazo(prazoId) {
    setConfirmar({
      titulo: 'Excluir Prazo',
      mensagem: 'Este prazo será removido permanentemente. Esta ação não pode ser desfeita.',
      textoBotao: '🗑️ Excluir',
      tipo: 'perigo',
      acao: async () => {
        await prazosAPI.excluir(prazoId);
        toast.success('Prazo excluído');
        carregarPrazos();
      },
    });
  }

  async function carregarTarefas() {
    const ids = idsParaBuscar();
    try {
      const resultados = await Promise.all(
        ids.map(pid => tarefasAPI.listar({ processo_id: pid, concluida: '', limite: 100 }))
      );
      const todos = resultados.flatMap(r => r.data.ok ? r.data.dados.registros : []);
      setTarefas(todos);
    } catch {}
  }

  async function toggleConcluirTarefa(t) {
    try {
      if (t.concluida) {
        await tarefasAPI.reabrir(t.id);
        toast.success('Tarefa reaberta');
      } else {
        await tarefasAPI.concluir(t.id);
        toast.success('Tarefa concluída!');
      }
      carregarTarefas();
    } catch { toast.error('Erro ao alterar tarefa'); }
  }

  async function carregarAudiencias() {
    const ids = idsParaBuscar();
    try {
      // Carrega audiências e tipos em paralelo (tipos necessários para o modal de edição)
      const [resultados, tiposResp] = await Promise.all([
        Promise.all(ids.map(pid => audienciasAPI.listar({ processo_id: pid, limite: 50 }))),
        tiposAudiencia.length ? Promise.resolve(null) : audienciasAPI.tipos(),
      ]);
      const todos = resultados.flatMap(r => r.data.ok ? r.data.dados.registros : []);
      // Ordena por data DESC para mostrar a mais recente primeiro
      todos.sort((a, b) => new Date(b.data + 'T' + b.hora) - new Date(a.data + 'T' + a.hora));
      setAudiencias(todos);
      if (tiposResp?.data?.ok) setTiposAudiencia(tiposResp.data.dados);
    } catch {}
  }

  // Mesmas regras da tela de Audiências — editar: não pode se cancelada/remarcada; com ata só admin
  function podeEditarAud(a) {
    if (['cancelada','remarcada'].includes(a.status)) return false;
    if (['realizada','acordo'].includes(a.status) && !ehAdmin) return false;
    return temPermissao('audiencias', 'alterar');
  }

  // Excluir: cancelada e remarcada nunca; com ata só admin
  function podeExcluirAud(a) {
    if (['cancelada','remarcada'].includes(a.status)) return false;
    if (['realizada','acordo'].includes(a.status) && !ehAdmin) return false;
    return temPermissao('audiencias', 'excluir');
  }

  function excluirAudiencia(a) {
    const temAta = ['realizada','acordo','adiada'].includes(a.status);
    setConfirmar({
      titulo: 'Excluir audiência',
      mensagem: temAta
        ? 'Esta audiência possui ata registrada. Tem certeza que deseja excluí-la? Esta ação não pode ser desfeita.'
        : 'Tem certeza que deseja excluir esta audiência? Esta ação não pode ser desfeita.',
      textoBotao: 'Excluir',
      tipo: 'perigo',
      acao: async () => {
        try {
          await audienciasAPI.excluir(a.id);
          toast.success('Audiência excluída com sucesso!');
          carregarAudiencias();
        } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao excluir audiência'); }
      },
    });
  }

  // ---- Perícias (mesmo padrão da aba Audiências: busca por processo do filtro) ----
  async function carregarPericias() {
    const ids = idsParaBuscar();
    try {
      // Perícias dos processos filtrados + tipos (para o modal) em paralelo
      const [resultados, tiposResp] = await Promise.all([
        Promise.all(ids.map(pid => periciasAPI.listar({ processo_id: pid, limite: 50 }))),
        tiposPericia.length ? Promise.resolve(null) : periciasAPI.tipos(),
      ]);
      const todos = resultados.flatMap(r => r.data.ok ? r.data.dados.registros : []);
      // Mais recentes primeiro (mesma ordenação da aba de audiências)
      todos.sort((a, b) => new Date(b.data + 'T' + (b.hora || '00:00')) - new Date(a.data + 'T' + (a.hora || '00:00')));
      setPericias(todos);
      if (tiposResp?.data?.ok) setTiposPericia(tiposResp.data.dados);
    } catch {}
  }

  // Abre o modal de edição com a perícia COMPLETA (a linha da lista não traz
  // endereço estruturado nem o responsável; sem isso o salvar zeraria esses campos).
  async function editarPericia(p) {
    try {
      const { data } = await periciasAPI.buscar(p.id);
      if (data.ok) setPericiaEditando(data.dados);
      else toast.error('Erro ao carregar perícia');
    } catch { toast.error('Erro ao carregar perícia'); }
  }

  // Marca perícia como realizada (com confirmação) — só agendada
  function marcarPericiaRealizada(p) {
    setConfirmar({
      titulo: 'Marcar como realizada',
      mensagem: `Confirma que a perícia do processo ${p.processo_numero || ''} foi realizada?`,
      textoBotao: 'Marcar como realizada',
      tipo: 'aviso',
      acao: async () => {
        try {
          await periciasAPI.marcarRealizada(p.id);
          toast.success('Perícia marcada como realizada');
          carregarPericias();
        } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao atualizar'); }
      },
    });
  }

  // Excluir perícia (com confirmação) — bloqueada em cancelada/remarcada (regra do backend)
  function excluirPericia(p) {
    setConfirmar({
      titulo: 'Excluir perícia',
      mensagem: 'Tem certeza que deseja excluir esta perícia? Esta ação não pode ser desfeita.',
      textoBotao: 'Excluir',
      tipo: 'perigo',
      acao: async () => {
        try {
          await periciasAPI.excluir(p.id);
          toast.success('Perícia excluída');
          carregarPericias();
        } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao excluir'); }
      },
    });
  }

  // Envia/reenvia o comunicado da perícia ao cliente por e-mail
  async function comunicarPericia(id) {
    try {
      const { data } = await periciasAPI.enviarComunicado(id);
      toast.success(data.mensagem || 'Comunicado enviado ao cliente');
      carregarPericias();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao enviar comunicado'); }
  }

  // Financeiro é POR PROCESSO: precisa de um processo específico selecionado no filtro
  async function carregarFinanceiro() {
    const procId = processoFiltro !== 'todos' ? parseInt(processoFiltro) : null;
    if (!procId) { setContaCorrente(null); setAcordosFin([]); return; }
    try {
      const [c, a] = await Promise.all([
        financeiroAPI.buscarConta(procId, {}),
        financeiroAPI.listarAcordos(procId),
      ]);
      if (c.data.ok) setContaCorrente(c.data.dados);
      if (a.data.ok) setAcordosFin(a.data.dados);
    } catch {}
  }

  function excluirLancamentoFin(l) {
    setConfirmar({
      titulo: 'Excluir lançamento',
      mensagem: 'Este lançamento será removido permanentemente. Esta ação não pode ser desfeita.',
      textoBotao: 'Excluir', tipo: 'perigo',
      acao: async () => {
        try { await financeiroAPI.excluirLanc(l.id); toast.success('Lançamento removido'); carregarFinanceiro(); }
        catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao excluir'); }
      },
    });
  }

  function excluirAcordoFin(a) {
    setConfirmar({
      titulo: 'Excluir acordo',
      mensagem: 'O acordo e todas as parcelas serão removidos. Esta ação não pode ser desfeita.',
      textoBotao: 'Excluir', tipo: 'perigo',
      acao: async () => {
        try { await financeiroAPI.excluirAcordo(a.id); toast.success('Acordo excluído'); carregarFinanceiro(); }
        catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao excluir'); }
      },
    });
  }

  function excluirAndamento(andId) {
    setConfirmar({
      titulo: 'Excluir Andamento',
      mensagem: 'Este andamento será removido permanentemente do processo. Esta ação não pode ser desfeita.',
      textoBotao: '🗑️ Excluir',
      tipo: 'perigo',
      acao: async () => {
        await andamentoAPI.excluir(andId);
        toast.success('Andamento excluído');
        carregarAndamentos();
      },
    });
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

  function excluirProcesso(procId) {
    setConfirmar({
      titulo: 'Excluir Processo',
      mensagem: 'Tem certeza que deseja excluir este processo? Todos os dados vinculados serão removidos permanentemente.',
      textoBotao: '🗑️ Excluir Processo',
      tipo: 'perigo',
      acao: async () => {
        await processosAPI.excluirProcesso(procId);
        toast.success('Processo excluído');
        carregarPasta();
      },
    });
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
            { key: 'pericias',   label: 'Perícias' },
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
                        <NumeroProcessoCopiavel numero={pr.numProc} />
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
                <button className="btn btn-primary" onClick={() => setModalNovoPrazo(true)}>
                  + Novo Prazo
                </button>
              )}
            </div>
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Prazo</th><th>Vencimento</th><th>Dias</th>
                    <th>Responsável</th><th>Quem faz</th><th>Status</th><th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {prazos.map(p => {
                    const euFazendo    = p.fazendo_por === usuario?.id;
                    const outroFazendo = p.fazendo_por && !euFazendo;
                    const ativo        = !['concluido','cancelado'].includes(p.status);
                    return (
                      <tr key={p.id} className={ativo ? corPrazo(p.dias_restantes) : ''}>
                        <td>{p.subtipo_nome || p.descricao || '—'}</td>
                        <td>{formatarData(p.data_vencimento)}</td>
                        <td>
                          {p.dias_restantes < 0
                            ? <span className="badge badge-vermelho">{Math.abs(p.dias_restantes)}d atraso</span>
                            : <span>{p.dias_restantes}d</span>
                          }
                        </td>
                        <td>{p.responsavel_nome || 'Escritório'}</td>
                        <td>
                          {euFazendo && (
                            <span style={{background:'#7c3aed',color:'#fff',borderRadius:'4px',padding:'2px 7px',fontSize:'12px',fontWeight:600,whiteSpace:'nowrap'}}>
                              ▶ {p.fazendo_por_nome}
                            </span>
                          )}
                          {outroFazendo && (
                            <span style={{background:'#f59e0b',color:'#fff',borderRadius:'4px',padding:'2px 7px',fontSize:'12px',fontWeight:600,whiteSpace:'nowrap'}}>
                              ▶ {p.fazendo_por_nome}
                            </span>
                          )}
                          {!p.fazendo_por && '—'}
                        </td>
                        <td><span className={`badge ${STATUS_COR_PRAZO[p.status] || 'badge-cinza'}`}>{labelStatusPrazo(p.status)}</span></td>
                        <td>
                          <div style={{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}}>
                            {ativo && (
                              <>
                                {!p.fazendo_por && (
                                  <>
                                    <button onClick={() => fazerPrazo(p.id)}
                                      style={{background:'#7c3aed',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                      ▶ Fazer
                                    </button>
                                    <button onClick={() => concluirPrazo(p.id)}
                                      style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                      ✅ Concluir
                                    </button>
                                    <button onClick={() => setPrazoCancelando(p)}
                                      style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                      ✖ Cancelar
                                    </button>
                                  </>
                                )}
                                {euFazendo && (
                                  <>
                                    <button onClick={() => liberarFazendo(p.id)}
                                      style={{background:'#9ca3af',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                      ◀ Liberar
                                    </button>
                                    <button onClick={() => concluirPrazo(p.id)}
                                      style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                      ✅ Concluir
                                    </button>
                                    <button onClick={() => setPrazoCancelando(p)}
                                      style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                      ✖ Cancelar
                                    </button>
                                  </>
                                )}
                                {outroFazendo && ehAdmin && (
                                  <>
                                    <button onClick={() => liberarFazendo(p.id)}
                                      style={{background:'#9ca3af',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                      ◀ Liberar
                                    </button>
                                    <button onClick={() => concluirPrazo(p.id)}
                                      style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                      ✅ Concluir
                                    </button>
                                    <button onClick={() => setPrazoCancelando(p)}
                                      style={{background:'#6b7280',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'12px',whiteSpace:'nowrap'}}>
                                      ✖ Cancelar
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                            {/* Editar — só para prazos ativos e sem bloqueio de fazendo */}
                            {ativo && temPermissao('prazos','alterar') && (!outroFazendo || ehAdmin) && (
                              <button title="Editar" onClick={() => setPrazoEditando(p)}
                                style={{background:'#3b82f6',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'13px'}}>
                                ✏️
                              </button>
                            )}
                            {/* Excluir — só para prazos ativos e sem bloqueio de fazendo */}
                            {ativo && temPermissao('prazos','excluir') && (!outroFazendo || ehAdmin) && (
                              <button title="Excluir" onClick={() => confirmarExcluirPrazo(p.id)}
                                style={{background:'#ef4444',color:'#fff',border:'none',borderRadius:'5px',padding:'4px 8px',cursor:'pointer',fontSize:'13px'}}>
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {prazos.length === 0 && <p className="lista-vazia">Nenhum prazo encontrado</p>}
            </div>
          </div>
        )}
        {prazoCancelando && (
          <ModalCancelarPrazo prazo={prazoCancelando}
            onFechar={(reload) => { setPrazoCancelando(null); if (reload) carregarPrazos(); }} />
        )}
        {prazoEditando && (
          <ModalEditarPrazo prazo={prazoEditando} tipos={tiposPrazo}
            onFechar={(reload) => { setPrazoEditando(null); if (reload) carregarPrazos(); }} />
        )}
        {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
        {modalTarefa && (
          <ModalTarefa
            tarefa={tarefaEditando}
            preSelecao={!tarefaEditando ? (processoSelecionado ? {
              tipo:            'processo',
              processo_id:     processoSelecionado.id,
              processo_numero: processoSelecionado.numProc || '',
            } : {
              tipo:        'pasta',
              pasta_id:    pasta.id,
              pasta_nome:  `${String(pasta.numPasta).padStart(4,'0')} — ${processoSelecionado?.NomeTituloProc || ''}`,
            }) : undefined}
            onFechar={(reload) => { setModalTarefa(false); setTarefaEditando(null); if (reload) carregarTarefas(); }}
          />
        )}
        {modalNovoPrazo && (
          <ModalNovoPrazo
            tipos={tiposPrazo}
            processoInicial={processoSelecionado ? {
              processo_id: processoSelecionado.id,
              numero:      processoSelecionado.numProc || '',
              titulo:      `${String(pasta.numPasta).padStart(4,'0')} — ${processoSelecionado.NomeTituloProc || ''}`,
            } : null}
            onFechar={(reload) => { setModalNovoPrazo(false); if (reload) carregarPrazos(); }}
          />
        )}

        {/* Modais de audiência — reutilizam os mesmos modais da tela de Audiências */}
        {modalNovaAudiencia && (
          <ModalNovaAudiencia
            tipos={tiposAudiencia}
            onTiposChange={setTiposAudiencia}
            processoInicial={processoSelecionado}
            onFechar={(reload) => { setModalNovaAudiencia(false); if (reload) carregarAudiencias(); }}
          />
        )}
        {audienciaEditando && (
          <ModalEditarAudiencia
            audiencia={audienciaEditando}
            tipos={tiposAudiencia}
            onTiposChange={setTiposAudiencia}
            onFechar={(reload) => { setAudienciaEditando(null); if (reload) carregarAudiencias(); }}
          />
        )}
        {audienciaAta && (
          <ModalRegistrarAta
            audiencia={audienciaAta}
            onFechar={(reload) => { setAudienciaAta(null); if (reload) carregarAudiencias(); }}
          />
        )}
        {audienciaCancelando && (
          <ModalCancelarAudiencia
            audiencia={audienciaCancelando}
            onFechar={(reload) => { setAudienciaCancelando(null); if (reload) carregarAudiencias(); }}
          />
        )}
        {audienciaRemarcando && (
          <ModalRemarcarAudiencia
            audiencia={audienciaRemarcando}
            onFechar={(reload) => { setAudienciaRemarcando(null); if (reload) carregarAudiencias(); }}
          />
        )}
        {audienciaHistorico && (
          <ModalHistoricoAudiencia
            audiencia={audienciaHistorico}
            onFechar={() => setAudienciaHistorico(null)}
          />
        )}

        {/* Modais de perícia — reutilizam os mesmos modais da tela de Perícias */}
        {modalNovaPericia && (
          <ModalPericia
            tipos={tiposPericia}
            onTiposChange={() => periciasAPI.tipos().then(r => { if (r.data.ok) setTiposPericia(r.data.dados); })}
            processoInicial={processoSelecionado ? {
              processo_id:     processoSelecionado.id,
              processo_numero: processoSelecionado.numProc || '',
              pasta_titulo:    `${String(pasta.numPasta).padStart(4, '0')} — ${processoSelecionado.NomeTituloProc || ''}`,
            } : null}
            onFechar={(reload) => { setModalNovaPericia(false); if (reload) carregarPericias(); }}
          />
        )}
        {periciaEditando && (
          <ModalPericia
            tipos={tiposPericia}
            onTiposChange={() => periciasAPI.tipos().then(r => { if (r.data.ok) setTiposPericia(r.data.dados); })}
            pericia={periciaEditando}
            onFechar={(reload) => { setPericiaEditando(null); if (reload) carregarPericias(); }}
          />
        )}
        {periciaCancelando && (
          <ModalCancelarPericia
            pericia={periciaCancelando}
            onFechar={(reload) => { setPericiaCancelando(null); if (reload) carregarPericias(); }}
          />
        )}
        {periciaRemarcando && (
          <ModalRemarcarPericia
            pericia={periciaRemarcando}
            onFechar={(reload) => { setPericiaRemarcando(null); if (reload) carregarPericias(); }}
          />
        )}
        {periciaHistorico && (
          <ModalHistoricoPericia
            pericia={periciaHistorico}
            onFechar={() => setPericiaHistorico(null)}
          />
        )}

        {/* === ABA: TAREFAS === */}
        {abaAtiva === 'tarefas' && (
          <div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
              {selectProcesso}
              <button className="btn btn-primary"
                onClick={() => { setTarefaEditando(null); setModalTarefa(true); }}>
                + Nova Tarefa
              </button>
            </div>
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Tarefa</th><th>Prioridade</th><th>Vencimento</th>
                    <th>Para</th><th>Status</th><th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tarefas.map(t => {
                    const PRIO_COR = { urgente: 'badge-vermelho', normal: 'badge-laranja', baixa: 'badge-verde' };
                    return (
                      <tr key={t.id} style={t.concluida ? { opacity: 0.6 } : {}}>
                        <td>
                          <strong style={t.concluida ? { textDecoration: 'line-through' } : {}}>
                            {t.titulo}
                          </strong>
                          {t.descricao && (
                            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{t.descricao}</div>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${PRIO_COR[t.prioridade] || 'badge-cinza'}`}>
                            {t.prioridade === 'urgente' ? '🔴 Urgente' : t.prioridade === 'baixa' ? '🟢 Baixa' : '🟡 Normal'}
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
                        <td>
                          <span className={`badge ${t.concluida ? 'badge-verde' : 'badge-azul'}`}>
                            {t.concluida ? 'Concluída' : 'Pendente'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className={`btn ${t.concluida ? 'btn-outline' : 'btn-success'}`}
                              style={{ fontSize: '12px', padding: '4px 10px' }}
                              onClick={() => toggleConcluirTarefa(t)}>
                              {t.concluida ? 'Reabrir' : '✓ Concluir'}
                            </button>
                            {!t.concluida && (
                              <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 10px' }}
                                onClick={() => { setTarefaEditando(t); setModalTarefa(true); }}>
                                Editar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {tarefas.length === 0 && <p className="lista-vazia">Nenhuma tarefa encontrada</p>}
            </div>
          </div>
        )}

        {/* === ABA: AUDIÊNCIAS === */}
        {abaAtiva === 'audiencias' && (
          <div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
              {selectProcesso}
              {processoSelecionado && temPermissao('audiencias', 'cadastrar') && (
                <button className="btn btn-primary" onClick={() => setModalNovaAudiencia(true)}>
                  + Nova Audiência
                </button>
              )}
            </div>
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr><th>Status</th><th>Tipo</th><th>Data / Hora</th><th>Modalidade</th><th>Local</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {audiencias.map(a => {
                    const vara      = a.vara_abrev_nome || a.vara_nome;
                    const forum     = a.vara_forum_nome;
                    const varaTexto = vara ? (forum ? `${vara} — ${forum}` : vara) : null;
                    // Edição bloqueada para audiências finalizadas (cancelada/remarcada = somente leitura)
                    return (
                      <tr key={a.id}>
                        <td>
                          <span className={`badge ${STATUS_COR_AUD[a.status] || 'badge-cinza'}`}>
                            {STATUS_LABEL_AUD[a.status] || a.status}
                          </span>
                        </td>
                        <td>{a.tipo_nome || '—'}</td>
                        <td>{formatarData(a.data)} {a.hora?.slice(0, 5)}</td>
                        <td>{a.modalidade === 'virtual' ? 'Virtual' : 'Presencial'}</td>
                        <td>
                          {varaTexto || a.local || '—'}
                          {a.modalidade === 'virtual' && (a.plataforma_virtual || a.link_virtual) && (
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                              {a.plataforma_virtual && <span>{a.plataforma_virtual}</span>}
                              {a.link_virtual && (
                                <a href={a.link_virtual} target="_blank" rel="noreferrer"
                                  style={{ marginLeft: a.plataforma_virtual ? 6 : 0, color: '#3b82f6' }}>
                                  🔗 Link
                                </a>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {/* Registrar Ata — só audiências agendadas ou adiadas sem ata */}
                            {['agendada','adiada'].includes(a.status) && temPermissao('audiencias', 'alterar') && (
                              <button className="btn btn-sm btn-primary"
                                onClick={() => setAudienciaAta(a)}
                                title="Registrar ata">
                                📋 Registrar Ata
                              </button>
                            )}
                            {/* Cancelar — só agendada ou adiada */}
                            {['agendada','adiada'].includes(a.status) && temPermissao('audiencias', 'alterar') && (
                              <button className="btn btn-sm"
                                style={{ background: '#f59e0b', color: '#fff', border: 'none' }}
                                onClick={() => setAudienciaCancelando(a)}
                                title="Cancelar audiência">
                                Cancelar
                              </button>
                            )}
                            {/* Remarcar — só agendada ou adiada */}
                            {['agendada','adiada'].includes(a.status) && temPermissao('audiencias', 'alterar') && (
                              <button className="btn btn-sm"
                                style={{ background: '#7c3aed', color: '#fff', border: 'none' }}
                                onClick={() => setAudienciaRemarcando(a)}
                                title="Remarcar audiência">
                                Remarcar
                              </button>
                            )}
                            {/* Editar */}
                            {podeEditarAud(a) && (
                              <button className="btn btn-sm btn-secondary"
                                onClick={() => setAudienciaEditando(a)}
                                title="Editar audiência">
                                ✏️ Editar
                              </button>
                            )}
                            {/* Excluir */}
                            {podeExcluirAud(a) && (
                              <button className="btn btn-sm btn-danger"
                                onClick={() => excluirAudiencia(a)}
                                title="Excluir audiência">
                                🗑️ Excluir
                              </button>
                            )}
                            {/* Histórico — sempre visível */}
                            <button className="btn btn-sm btn-secondary"
                              onClick={() => setAudienciaHistorico(a)}
                              title="Ver histórico de alterações">
                              📋 Histórico
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {audiencias.length === 0 && <p className="lista-vazia">Nenhuma audiência encontrada</p>}
            </div>
          </div>
        )}

        {/* === ABA: PERÍCIAS === (mesmo filtro de processo da aba Audiências) */}
        {abaAtiva === 'pericias' && (
          <div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
              {selectProcesso}
              {processoSelecionado && temPermissao('pericias', 'cadastrar') && (
                <button className="btn btn-primary" onClick={() => setModalNovaPericia(true)}>
                  + Nova Perícia
                </button>
              )}
            </div>
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr><th>Status</th><th>Tipo</th><th>Data / Hora</th><th>Perito</th><th>Responsável</th><th>Local</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {pericias.map(p => {
                    const agendada  = p.status === 'agendada' || !p.status;      // ações de edição só quando agendada
                    const historico = p.status === 'cancelada' || p.status === 'remarcada'; // não pode excluir
                    return (
                      <tr key={p.id}>
                        <td>
                          <span className={`badge ${STATUS_COR_PER[p.status] || 'badge-azul'}`}>
                            {STATUS_LABEL_PER[p.status] || 'Agendada'}
                          </span>
                        </td>
                        <td>{p.tipo_nome || '—'}</td>
                        <td>{formatarData(p.data)} {p.hora?.slice(0, 5)}</td>
                        <td>{p.perito_nome || '—'}</td>
                        <td>{p.responsavel_nome || '—'}</td>
                        <td>{p.local || '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {/* Editar / Realizada / Cancelar / Remarcar / Comunicar — só quando agendada */}
                            {agendada && temPermissao('pericias', 'alterar') && (
                              <button className="btn btn-sm btn-secondary"
                                onClick={() => editarPericia(p)} title="Editar perícia">
                                ✏️ Editar
                              </button>
                            )}
                            {agendada && temPermissao('pericias', 'alterar') && (
                              <button className="btn btn-sm btn-primary"
                                onClick={() => marcarPericiaRealizada(p)} title="Marcar como realizada">
                                ✓ Realizada
                              </button>
                            )}
                            {agendada && temPermissao('pericias', 'alterar') && (
                              <button className="btn btn-sm"
                                style={{ background: '#f59e0b', color: '#fff', border: 'none' }}
                                onClick={() => setPericiaCancelando(p)} title="Cancelar perícia">
                                Cancelar
                              </button>
                            )}
                            {agendada && temPermissao('pericias', 'alterar') && (
                              <button className="btn btn-sm"
                                style={{ background: '#7c3aed', color: '#fff', border: 'none' }}
                                onClick={() => setPericiaRemarcando(p)} title="Remarcar perícia">
                                Remarcar
                              </button>
                            )}
                            {/* Histórico — sempre visível */}
                            <button className="btn btn-sm btn-secondary"
                              onClick={() => setPericiaHistorico(p)} title="Ver histórico de alterações">
                              📋 Histórico
                            </button>
                            {/* Excluir — nunca em cancelada/remarcada (regra do backend) */}
                            {!historico && temPermissao('pericias', 'excluir') && (
                              <button className="btn btn-sm btn-danger"
                                onClick={() => excluirPericia(p)} title="Excluir perícia">
                                🗑️ Excluir
                              </button>
                            )}
                            {/* Comunicar/Reenviar ao cliente — só quando agendada */}
                            {agendada && temPermissao('pericias', 'alterar') && (
                              <button className="btn btn-sm btn-secondary"
                                onClick={() => comunicarPericia(p.id)}
                                title="Enviar/reenviar comunicado ao cliente por e-mail">
                                ✉ {p.comunicado_enviado ? 'Reenviar' : 'Comunicar'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {pericias.length === 0 && <p className="lista-vazia">Nenhuma perícia encontrada</p>}
            </div>
          </div>
        )}

        {/* === ABA: FINANCEIRO === (por processo) */}
        {abaAtiva === 'financeiro' && (
          <div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
              {selectProcesso}
              {processoSelecionado && temPermissao('financeiro', 'cadastrar') && (
                <>
                  <button className="btn btn-outline" onClick={() => { setLancEditandoFin(null); setModalLancamento(true); }}>
                    + Lançamento
                  </button>
                  <button className="btn btn-primary" onClick={() => { setAcordoEditandoFin(null); setAcordoTipoNovoFin('acordo'); setModalAcordoFin(true); }}>
                    + Novo Acordo
                  </button>
                  <button className="btn btn-primary" onClick={() => { setAcordoEditandoFin(null); setAcordoTipoNovoFin('alvara'); setModalAcordoFin(true); }}>
                    + Novo Alvará
                  </button>
                </>
              )}
            </div>

            {!processoSelecionado && <p className="lista-vazia">Selecione um processo para ver o financeiro</p>}

            {processoSelecionado && contaCorrente && (
              <>
                {acordosFin.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    {acordosFin.map(a => (
                      <AcordoBloco key={a.id} acordo={a}
                        podeAlterar={temPermissao('financeiro', 'alterar')}
                        podeExcluir={temPermissao('financeiro', 'excluir')}
                        onEditar={() => { setAcordoEditandoFin(a.id); setModalAcordoFin(true); }}
                        onExcluir={() => excluirAcordoFin(a)}
                        onMudou={carregarFinanceiro} />
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <strong>Conta corrente</strong>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', color: '#888' }}>Saldo </span>
                    <strong style={{ color: (contaCorrente.saldo_total || 0) >= 0 ? '#059669' : '#dc2626' }}>
                      {formatarMoeda(contaCorrente.saldo_total || 0)}
                    </strong>
                  </div>
                </div>
                <div className="tabela-wrapper">
                  <table className="tabela">
                    <thead>
                      <tr><th>Data</th><th>Descrição</th><th>Tipo</th>
                        <th style={{ textAlign: 'right' }}>Valor</th><th>Ações</th></tr>
                    </thead>
                    <tbody>
                      {(contaCorrente.lancamentos || []).map(l => {
                        const ehAcordo = l.origem === 'acordo';
                        return (
                          <tr key={l.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>{formatarData(l.data)}</td>
                            <td>{l.descricao}</td>
                            <td><span className={`badge ${l.tipo === 'entrada' ? 'badge-verde' : 'badge-vermelho'}`}>{l.tipo === 'entrada' ? 'Entrada' : 'Saída'}</span></td>
                            <td style={{ textAlign: 'right' }} className={l.tipo === 'entrada' ? 'valor-positivo' : 'valor-negativo'}>
                              {l.tipo === 'saida' ? '−' : '+'}{formatarMoeda(l.valor)}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {ehAcordo ? <span style={{ fontSize: 11, color: '#888' }}>(acordo)</span> : (
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  {temPermissao('financeiro', 'alterar') && (
                                    <button className="btn btn-outline" style={{ fontSize: '11px', padding: '3px 8px' }}
                                      onClick={() => { setLancEditandoFin(l); setModalLancamento(true); }}>Editar</button>
                                  )}
                                  <button className="btn btn-outline" style={{ fontSize: '11px', padding: '3px 8px' }}
                                    onClick={() => setHistLancamentoFin(l)}>Histórico</button>
                                  {temPermissao('financeiro', 'excluir') && (
                                    <button className="btn btn-danger" style={{ fontSize: '11px', padding: '3px 8px' }}
                                      onClick={() => excluirLancamentoFin(l)}>✕</button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(!contaCorrente.lancamentos || contaCorrente.lancamentos.length === 0) && (
                    <p className="lista-vazia">Nenhum lançamento neste processo</p>
                  )}
                </div>
              </>
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

      {/* Modais financeiros (por processo) — reutilizados da tela Financeiro */}
      {modalLancamento && processoSelecionado && (
        <ModalLancamentoFin
          processoId={processoSelecionado.id}
          lancamento={lancEditandoFin}
          onFechar={(reload) => { setModalLancamento(false); setLancEditandoFin(null); if (reload) carregarFinanceiro(); }}
        />
      )}
      {modalAcordoFin && processoSelecionado && (
        <ModalAcordoFin
          processoId={processoSelecionado.id}
          acordoId={acordoEditandoFin}
          tipo={acordoTipoNovoFin}
          onFechar={(reload) => { setModalAcordoFin(false); setAcordoEditandoFin(null); if (reload) carregarFinanceiro(); }}
        />
      )}
      {histLancamentoFin && (
        <ModalHistoricoLancamento lancamento={histLancamentoFin} onFechar={() => setHistLancamentoFin(null)} />
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
// (ModalLancamento financeiro agora é reutilizado de ../Financeiro/Financeiro — ModalLancamentoFin)
