// ============================================================
// PÁGINA DE AGENDA / CALENDÁRIO
// Exibe prazos, audiências, perícias e tarefas em visualização
// de calendário usando react-big-calendar
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth } from 'date-fns';
import ptBR from 'date-fns/locale/pt-BR';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import { prazosAPI, audienciasAPI, tarefasAPI, periciasAPI, agendaAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import ModalConfirmar from '../../components/ui/ModalConfirmar';

// Configuração do localizador com pt-BR
const locales = { 'pt-BR': ptBR };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date) => startOfWeek(date, { weekStartsOn: 0 }),
  getDay,
  locales,
});

// Mensagens traduzidas para pt-BR
const mensagens = {
  allDay: 'Dia todo',
  previous: '‹ Anterior',
  next: 'Próximo ›',
  today: 'Hoje',
  month: 'Mês',
  week: 'Semana',
  day: 'Dia',
  agenda: 'Agenda',
  date: 'Data',
  time: 'Hora',
  event: 'Evento',
  noEventsInRange: 'Nenhum evento neste período.',
  showMore: (n) => `+${n} mais`,
};

// Cor por tipo de evento
const COR_EVENTO = {
  prazo:       '#dc2626', // vermelho
  audiencia:   '#1a56db', // azul
  pericia:     '#7c3aed', // roxo
  tarefa:      '#d97706', // laranja
  compromisso: '#0891b2', // ciano — compromissos pessoais da agenda
};

export default function Agenda() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [eventos, setEventos]   = useState([]);
  const [dataAtual, setDataAtual] = useState(new Date());
  const [visao, setVisao]       = useState('month');
  const [carregando, setCarregando] = useState(false);
  const [eventoSelecionado, setEventoSelecionado] = useState(null);
  const [modalCompromisso, setModalCompromisso] = useState(null); // null | {} (novo) | {dataInicial} | {compromisso} (editar)
  const [confirmarExcluir, setConfirmarExcluir] = useState(null); // compromisso aguardando confirmação de exclusão
  const [diaSelecionado, setDiaSelecionado] = useState(null);     // dia clicado no calendário (para adicionar)
  const [filtros, setFiltros]   = useState({
    prazos: true, audiencias: true, pericias: true, tarefas: true, compromissos: true, escritorio: false
  });

  // Título dinâmico
  const titulo = filtros.escritorio ? 'Escritório' : (usuario?.nome || '');

  // ID do usuário logado — null quando modo escritório (sem filtro)
  const usuarioId = filtros.escritorio ? null : usuario?.id;

  // Carrega eventos quando o mês ou filtros mudam
  const carregarEventos = useCallback(async () => {
    setCarregando(true);
    const data_de  = format(startOfMonth(dataAtual), 'yyyy-MM-dd');
    const data_ate = format(endOfMonth(dataAtual), 'yyyy-MM-dd');

    try {
      const promises = [];

      if (filtros.prazos) {
        promises.push(
          prazosAPI.listar({ data_de, data_ate, limite: 200, ...(usuarioId && { usuario_id: usuarioId }) })
            .then(r => r.data.ok ? r.data.dados.registros.map(p => ({
              id: `prazo-${p.id}`,
              title: `📋 ${p.subtipo_nome || p.descricao || 'Prazo'}`,
              start: new Date(p.data_vencimento + 'T00:00:00'),
              end:   new Date(p.data_vencimento + 'T23:59:00'),
              allDay: true,
              tipo: 'prazo',
              dados: p,
            })) : [])
            .catch(() => [])
        );
      }

      if (filtros.audiencias) {
        promises.push(
          audienciasAPI.listar({ data_de, data_ate, limite: 200, ...(usuarioId && { responsavel_id: usuarioId }) })
            .then(r => r.data.ok ? r.data.dados.registros.map(a => ({
              id: `audiencia-${a.id}`,
              title: `⚖️ ${a.tipo_nome || 'Audiência'} — ${a.processo_numero || ''}`,
              // a.hora vem como 'HH:MM:SS' do banco → normaliza p/ 'HH:MM' (senão a data fica inválida)
              start: new Date(`${String(a.data).slice(0, 10)}T${(a.hora || '00:00').slice(0, 5)}:00`),
              end:   new Date(`${String(a.data).slice(0, 10)}T${(a.hora || '01:00').slice(0, 5)}:00`),
              allDay: false,
              tipo: 'audiencia',
              dados: a,
            })) : [])
            .catch(() => [])
        );
      }

      if (filtros.pericias) {
        promises.push(
          periciasAPI.listar({ data_de, data_ate, limite: 200, ...(usuarioId && { assistente_id: usuarioId }) })
            .then(r => r.data.ok ? r.data.dados.registros.map(p => ({
              id: `pericia-${p.id}`,
              title: `🔬 ${p.tipo_nome || 'Perícia'} — ${p.processo_numero || ''}`,
              // p.hora vem como 'HH:MM:SS' do banco → normaliza p/ 'HH:MM' (senão a data fica inválida)
              start: new Date(`${String(p.data).slice(0, 10)}T${(p.hora || '00:00').slice(0, 5)}:00`),
              end:   new Date(`${String(p.data).slice(0, 10)}T${(p.hora || '01:00').slice(0, 5)}:00`),
              allDay: !p.hora,
              tipo: 'pericia',
              dados: p,
            })) : [])
            .catch(() => [])
        );
      }

      if (filtros.tarefas) {
        promises.push(
          tarefasAPI.listar({ concluida: '0', limite: 200, ...(usuarioId && { usuario_id: usuarioId }) })
            .then(r => r.data.ok ? r.data.dados.registros
              .filter(t => t.data_vencimento)
              .map(t => ({
                id: `tarefa-${t.id}`,
                title: `✅ ${t.titulo}`,
                start: new Date(t.data_vencimento + 'T00:00:00'),
                end:   new Date(t.data_vencimento + 'T23:59:00'),
                allDay: true,
                tipo: 'tarefa',
                dados: t,
              })) : [])
            .catch(() => [])
        );
      }

      if (filtros.compromissos) {
        promises.push(
          agendaAPI.listarCompromissos({ de: data_de, ate: data_ate, escritorio: filtros.escritorio ? 1 : 0 })
            .then(r => r.data.ok ? r.data.dados.map(c => {
              const horaIni = (!c.dia_todo && c.hora_inicio) ? c.hora_inicio.slice(0, 5) : '00:00';
              const horaFim = (!c.dia_todo && c.hora_fim) ? c.hora_fim.slice(0, 5)
                            : (!c.dia_todo && c.hora_inicio) ? c.hora_inicio.slice(0, 5) : '23:59';
              return {
                id: `compromisso-${c.id}`,
                title: `📌 ${c.titulo}`,
                start: new Date(`${String(c.data).slice(0, 10)}T${horaIni}:00`),
                end:   new Date(`${String(c.data).slice(0, 10)}T${horaFim}:00`),
                allDay: !!c.dia_todo,
                tipo: 'compromisso',
                dados: c,
              };
            }) : [])
            .catch(() => [])
        );
      }

      const resultados = await Promise.all(promises);
      setEventos(resultados.flat());
    } catch { toast.error('Erro ao carregar eventos'); }
    finally { setCarregando(false); }
  }, [dataAtual, filtros, usuarioId]);

  useEffect(() => { carregarEventos(); }, [carregarEventos]);

  // Estilo customizado por tipo de evento
  function eventPropGetter(evento) {
    return {
      style: {
        backgroundColor: COR_EVENTO[evento.tipo] || '#6b7280',
        borderRadius: '4px',
        border: 'none',
        color: '#fff',
        fontSize: '11px',
        padding: '1px 4px',
      }
    };
  }

  function toggleFiltro(tipo) {
    setFiltros(f => ({...f, [tipo]: !f[tipo]}));
  }

  return (
    <div>
      {/* Título dinâmico */}
      <h2 style={{fontSize:'18px',fontWeight:700,color:'#1e2a3a',marginBottom:'12px'}}>
        {titulo}
      </h2>

      {/* Filtros e legenda */}
      <div className="card" style={{marginBottom:'16px'}}>
        <div style={{display:'flex',gap:'16px',flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:'13px',color:'#555',fontWeight:500}}>Mostrar:</span>
          {[
            { key:'prazos',    label:'Prazos',    cor: COR_EVENTO.prazo },
            { key:'audiencias',label:'Audiências',cor: COR_EVENTO.audiencia },
            { key:'pericias',  label:'Perícias',  cor: COR_EVENTO.pericia },
            { key:'tarefas',   label:'Tarefas',   cor: COR_EVENTO.tarefa },
            { key:'compromissos', label:'Compromissos', cor: COR_EVENTO.compromisso },
          ].map(({ key, label, cor }) => (
            <label key={key} style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',fontSize:'13px'}}>
              <input type="checkbox" checked={filtros[key]} onChange={() => toggleFiltro(key)} />
              <span style={{
                display:'inline-block', width:'10px', height:'10px',
                borderRadius:'2px', background: filtros[key] ? cor : '#d1d5db'
              }} />
              {label}
            </label>
          ))}

          {/* Separador */}
          <span style={{borderLeft:'1px solid #e5e7eb',height:'18px'}} />

          {/* Checkbox Escritório */}
          <label style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',fontSize:'13px',color: filtros.escritorio ? '#1a56db' : '#555',fontWeight: filtros.escritorio ? 600 : 400}}>
            <input type="checkbox" checked={filtros.escritorio} onChange={() => toggleFiltro('escritorio')} />
            🏢 Escritório
          </label>

          <button className="btn btn-primary" style={{marginLeft:'auto',fontSize:'13px',padding:'6px 12px'}}
            onClick={() => setModalCompromisso({})}>
            + Novo compromisso
          </button>
          {carregando && (
            <span style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'12px',color:'#1a56db',fontWeight:600}}>
              <span className="spinner-mini" /> Carregando...
            </span>
          )}
        </div>
      </div>

      {/* Calendário */}
      <div className="card" style={{padding:'0'}}>
        <div style={{height:'75vh', padding:'16px'}}>
          <Calendar
            localizer={localizer}
            events={eventos}
            startAccessor="start"
            endAccessor="end"
            view={visao}
            onView={setVisao}
            date={dataAtual}
            onNavigate={setDataAtual}
            culture="pt-BR"
            messages={mensagens}
            eventPropGetter={eventPropGetter}
            selectable
            onSelectSlot={({ start }) => setDiaSelecionado(start)}
            onSelectEvent={ev => setEventoSelecionado(ev)}
            popup
            style={{height:'100%'}}
          />
        </div>
      </div>

      {/* Modal: detalhe do evento clicado */}
      {eventoSelecionado && (
        <div className="modal-overlay">
          <div className="modal-box modal-pequeno">
            <div className="modal-header">
              <h3 style={{textTransform:'capitalize'}}>{eventoSelecionado.tipo}</h3>
              <button className="modal-fechar" onClick={() => setEventoSelecionado(null)}>✕</button>
            </div>
            <div className="modal-body">
              <EventoDetalhe evento={eventoSelecionado} />
            </div>
            <div className="modal-footer">
              {/* Compromisso próprio: pode editar/excluir direto na agenda */}
              {eventoSelecionado.tipo === 'compromisso' && eventoSelecionado.dados.usuario_id === usuario?.id && (
                <>
                  <button className="btn btn-danger" style={{ marginRight: 'auto' }}
                    onClick={() => { setConfirmarExcluir(eventoSelecionado.dados); setEventoSelecionado(null); }}>
                    Excluir
                  </button>
                  <button className="btn btn-primary"
                    onClick={() => { setModalCompromisso(eventoSelecionado.dados); setEventoSelecionado(null); }}>
                    Editar
                  </button>
                </>
              )}
              <button className="btn btn-secondary" onClick={() => setEventoSelecionado(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: criar / editar compromisso pessoal */}
      {modalCompromisso && (
        <ModalCompromisso
          compromisso={modalCompromisso.id ? modalCompromisso : null}
          dataInicial={modalCompromisso.dataInicial}
          onFechar={(reload) => { setModalCompromisso(null); if (reload) carregarEventos(); }}
        />
      )}

      {/* Clique num dia → escolher o que adicionar */}
      {diaSelecionado && (
        <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setDiaSelecionado(null); }}>
          <div className="modal-box modal-pequeno">
            <div className="modal-header">
              <h3>Adicionar em {format(diaSelecionado, 'dd/MM/yyyy')}</h3>
              <button className="modal-fechar" onClick={() => setDiaSelecionado(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>O que você quer adicionar neste dia?</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-primary"
                  onClick={() => { setModalCompromisso({ dataInicial: format(diaSelecionado, 'yyyy-MM-dd') }); setDiaSelecionado(null); }}>
                  📌 Novo compromisso
                </button>
                <button className="btn btn-outline"
                  onClick={() => { navigate(`/tarefas?nova=1&data=${format(diaSelecionado, 'yyyy-MM-dd')}`); setDiaSelecionado(null); }}>
                  ✅ Nova tarefa
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDiaSelecionado(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}


      {/* Confirmação de exclusão de compromisso */}
      {confirmarExcluir && (
        <ModalConfirmar
          titulo="Excluir compromisso"
          mensagem={`Excluir o compromisso "${confirmarExcluir.titulo}"? Esta ação não pode ser desfeita.`}
          textoBotao="🗑️ Excluir"
          tipo="perigo"
          acao={async () => {
            try { await agendaAPI.excluirCompromisso(confirmarExcluir.id); toast.success('Compromisso excluído'); carregarEventos(); }
            catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao excluir'); }
          }}
          onCancelar={() => setConfirmarExcluir(null)}
        />
      )}
    </div>
  );
}

// Detalhes do evento selecionado no calendário
function EventoDetalhe({ evento }) {
  const { tipo, dados } = evento;
  const linhas = [];

  if (tipo === 'prazo') {
    if (dados.processo_numero) linhas.push(['Processo', dados.processo_numero]);
    if (dados.pasta_titulo)    linhas.push(['Pasta', dados.pasta_titulo]);
    if (dados.subtipo_nome)    linhas.push(['Tipo', dados.subtipo_nome]);
    if (dados.descricao)       linhas.push(['Descrição', dados.descricao]);
    linhas.push(['Vencimento', dados.data_vencimento]);
    linhas.push(['Status', dados.status]);
    if (dados.responsavel_nome) linhas.push(['Responsável', dados.responsavel_nome]);
  } else if (tipo === 'audiencia') {
    if (dados.processo_numero) linhas.push(['Processo', dados.processo_numero]);
    if (dados.pasta_titulo)    linhas.push(['Pasta', dados.pasta_titulo]);
    if (dados.tipo_nome)       linhas.push(['Tipo', dados.tipo_nome]);
    linhas.push(['Data', `${dados.data} ${dados.hora?.slice(0,5) || ''}`]);
    linhas.push(['Modalidade', dados.modalidade]);
    if (dados.local)           linhas.push(['Local', dados.local]);
    if (dados.link_virtual)    linhas.push(['Link', dados.link_virtual]);
  } else if (tipo === 'pericia') {
    if (dados.processo_numero) linhas.push(['Processo', dados.processo_numero]);
    if (dados.tipo_nome)       linhas.push(['Tipo', dados.tipo_nome]);
    linhas.push(['Data', `${dados.data} ${dados.hora?.slice(0,5) || ''}`]);
    if (dados.local)           linhas.push(['Local', dados.local]);
    if (dados.perito_nome)     linhas.push(['Perito', dados.perito_nome]);
    if (dados.assistente_nome) linhas.push(['Assistente', dados.assistente_nome]);
  } else if (tipo === 'tarefa') {
    linhas.push(['Título', dados.titulo]);
    if (dados.descricao)       linhas.push(['Descrição', dados.descricao]);
    linhas.push(['Prioridade', dados.prioridade]);
    if (dados.data_vencimento) linhas.push(['Vencimento', dados.data_vencimento]);
    if (dados.atribuida_para_nome) linhas.push(['Atribuída para', dados.atribuida_para_nome]);
  } else if (tipo === 'compromisso') {
    linhas.push(['Título', dados.titulo]);
    if (dados.descricao) linhas.push(['Descrição', dados.descricao]);
    linhas.push(['Data', String(dados.data).slice(0, 10).split('-').reverse().join('/')]);
    if (dados.dia_todo) linhas.push(['Período', 'Dia todo']);
    else if (dados.hora_inicio) linhas.push(['Hora', `${dados.hora_inicio.slice(0, 5)}${dados.hora_fim ? ' às ' + dados.hora_fim.slice(0, 5) : ''}`]);
    if (dados.escritorio) linhas.push(['Visibilidade', 'Escritório (compartilhado)']);
    if (dados.usuario_nome) linhas.push(['De', dados.usuario_nome]);
  }

  return (
    <table style={{width:'100%',fontSize:'13px',borderCollapse:'collapse'}}>
      <tbody>
        {linhas.map(([label, valor], i) => (
          <tr key={i}>
            <td style={{padding:'5px 0',color:'#888',width:'40%',fontWeight:500}}>{label}</td>
            <td style={{padding:'5px 0',color:'#333'}}>{valor || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ============================================================
// MODAL: criar / editar compromisso pessoal da agenda
// `compromisso` = registro p/ editar (ou null p/ novo). `dataInicial` (opcional) pré-preenche a data.
// ============================================================
function ModalCompromisso({ compromisso, dataInicial, onFechar }) {
  const editando = !!(compromisso && compromisso.id);
  const [form, setForm] = useState({
    titulo: compromisso?.titulo || '',
    descricao: compromisso?.descricao || '',
    data: compromisso?.data ? String(compromisso.data).slice(0, 10) : (dataInicial || format(new Date(), 'yyyy-MM-dd')),
    dia_todo: compromisso?.dia_todo ? true : false,
    hora_inicio: compromisso?.hora_inicio ? compromisso.hora_inicio.slice(0, 5) : '',
    hora_fim: compromisso?.hora_fim ? compromisso.hora_fim.slice(0, 5) : '',
    escritorio: compromisso?.escritorio ? true : false,
  });
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function salvar() {
    if (!form.titulo.trim()) return toast.error('Informe o título');
    if (!form.data) return toast.error('Informe a data');
    setSalvando(true);
    try {
      if (editando) await agendaAPI.atualizarCompromisso(compromisso.id, form);
      else          await agendaAPI.criarCompromisso(form);
      toast.success(editando ? 'Compromisso atualizado' : 'Compromisso criado');
      onFechar(true);
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box" style={{ maxWidth: '460px' }}>
        <div className="modal-header">
          <h3>{editando ? 'Editar compromisso' : 'Novo compromisso'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label obrigatorio">Título</label>
            <input className="form-control" value={form.titulo} onChange={e => set('titulo', e.target.value)}
              placeholder="Ex.: Reunião com cliente" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea className="form-control" rows={2} value={form.descricao} onChange={e => set('descricao', e.target.value)} />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label obrigatorio">Data</label>
              <input type="date" className="form-control" value={form.data} onChange={e => set('data', e.target.value)} />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={form.dia_todo} onChange={e => set('dia_todo', e.target.checked)} />
                Dia todo
              </label>
            </div>
          </div>
          {!form.dia_todo && (
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Hora início</label>
                <input type="time" className="form-control" value={form.hora_inicio} onChange={e => set('hora_inicio', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Hora fim</label>
                <input type="time" className="form-control" value={form.hora_fim} onChange={e => set('hora_fim', e.target.value)} />
              </div>
            </div>
          )}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.escritorio} onChange={e => set('escritorio', e.target.checked)} />
              🏢 Compartilhar com o escritório (aparece para todos no modo Escritório)
            </label>
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

