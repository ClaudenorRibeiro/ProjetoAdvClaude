// ============================================================
// PÁGINA DE AGENDA / CALENDÁRIO
// Exibe prazos, audiências, perícias e tarefas em visualização
// de calendário usando react-big-calendar
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import ptBR from 'date-fns/locale/pt-BR';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import { prazosAPI, audienciasAPI, tarefasAPI, periciasAPI, agendaAPI, configuracaoAPI } from '../../services/api';
import { formatarData } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import { ModalTarefa } from '../Tarefas/Tarefas';
import useEscFechar from '../../hooks/useEscFechar';
import { toast } from 'react-toastify';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import ModalLerPublicacao from '../../components/ModalLerPublicacao';

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
  prazo:       '#e2d3a8', // bege (texto escuro — ver eventPropGetter)
  audiencia:   '#1a56db', // azul
  pericia:     '#7c3aed', // roxo
  tarefa:      '#d97706', // laranja
  compromisso: '#0891b2', // ciano — compromissos pessoais da agenda
  feriado:     '#059669', // verde — feriados (iguais para todos; só leitura na agenda)
};

// Nome do responsável/delegado do item, conforme o tipo. Vazio quando não há (ex.: feriado, ou
// tarefa "do escritório" sem atribuição). Usado no calendário E na janela do dia — sem duplicar.
function responsavelDoEvento(ev) {
  const d = ev.dados || {};
  switch (ev.tipo) {
    case 'prazo':
    case 'audiencia':
    case 'pericia':
      return d.responsavel_nome || '';
    case 'tarefa':
      return d.atribuida_para_nome || '';
    case 'compromisso':
      return d.delegado_nome || d.usuario_nome || '';
    default:
      return ''; // feriado etc.
  }
}

// Item do calendário (react-big-calendar): título à esquerda + responsável/delegado à direita.
// A cor de fundo vem do eventPropGetter; aqui só definimos o conteúdo interno.
function EventoCalendario({ event }) {
  const resp = responsavelDoEvento(event);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', minWidth: 0 }}>
      <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {event.title}
      </span>
      {resp && (
        <span style={{ flex: '0 1 auto', maxWidth: '50%', overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', opacity: 0.85, fontStyle: 'italic' }}>
          {resp}
        </span>
      )}
    </div>
  );
}
// Objeto estável (fora do componente) para o Calendar não remontar os itens a cada render.
const COMPONENTES_CALENDARIO = { event: EventoCalendario };

// Formata 'YYYY-MM-DD HH:MM:SS' (ou ISO) em 'dd/MM/yyyy HH:MM'
function fmtDataHora(v) {
  if (!v) return '';
  const s = String(v).replace('T', ' ');
  return `${formatarData(s.slice(0, 10))} ${s.slice(11, 16)}`;
}

export default function Agenda() {
  const { usuario, temPermissao, ehAdmin } = useAuth();
  const [eventos, setEventos]   = useState([]);
  const [dataAtual, setDataAtual] = useState(new Date());
  const [visao, setVisao]       = useState('month');
  const [carregando, setCarregando] = useState(false);
  const [eventoSelecionado, setEventoSelecionado] = useState(null);
  const [verPubOrigem, setVerPubOrigem] = useState(null); // publicacao_id da ação, p/ ler a publicação de origem
  const [modalCompromisso, setModalCompromisso] = useState(null); // null | {} (novo) | {dataInicial} | {compromisso} (editar)
  const [modalTarefa, setModalTarefa] = useState(null);           // null | {dataInicial} — nova tarefa aberta DENTRO da Agenda
  const [confirmarExcluir, setConfirmarExcluir] = useState(null); // compromisso aguardando confirmação de exclusão
  const [diaSelecionado, setDiaSelecionado] = useState(null);     // dia clicado no calendário (para adicionar)
  const [diaLista, setDiaLista] = useState(null);                 // dia cujos itens são listados na janela central ("+N mais")
  const [filtros, setFiltros]   = useState({
    prazos: true, audiencias: true, pericias: true, tarefas: true, compromissos: true, feriados: true, escritorio: false
  });

  // Pode ver a agenda de todos: admin/super (nível <= 1) OU usuário com a permissão
  // 'agenda.ver_todos > visualizar' (mesma lógica de Prazos/Tarefas). Só quem pode vê o seletor.
  const podeVerAgendaDeTodos = ehAdmin || temPermissao('agenda.ver_todos', 'visualizar');
  const [usuarios, setUsuarios]     = useState([]);                       // usuários ativos (delegar + filtro admin)
  const [verAgendaDe, setVerAgendaDe] = useState(String(usuario?.id || '')); // '' = Todos; senão um id

  // ID do usuário cuja agenda mostrar — null quando modo escritório OU quando escolhe "Todos".
  const usuarioId = filtros.escritorio
    ? null
    : (podeVerAgendaDeTodos ? (verAgendaDe || null) : usuario?.id);

  // Título dinâmico
  const titulo = filtros.escritorio
    ? 'Escritório'
    : (podeVerAgendaDeTodos
        ? (verAgendaDe
            ? (usuarios.find(u => String(u.id) === String(verAgendaDe))?.nome || usuario?.nome || '')
            : 'Todos os usuários')
        : (usuario?.nome || ''));

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
          agendaAPI.listarCompromissos({ de: data_de, ate: data_ate, escritorio: filtros.escritorio ? 1 : 0, ...(usuarioId && { usuario_id: usuarioId }) })
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

      // Feriados: são os MESMOS para todos os usuários (não filtram por usuário nem por
      // Escritório) — só obedecem ao checkbox "Feriados". A API lista por ANO; filtramos aqui
      // para o mês visível (mesma faixa data_de/data_ate das outras categorias). Só leitura na agenda.
      if (filtros.feriados) {
        promises.push(
          configuracaoAPI.listarFeriados({ ano: dataAtual.getFullYear() })
            .then(r => r.data.ok ? (r.data.dados || [])
              .filter(f => {
                const d = String(f.data).slice(0, 10);
                return d >= data_de && d <= data_ate;
              })
              .map(f => ({
                id: `feriado-${f.id}`,
                title: `🎌 ${f.descricao}`,
                start: new Date(String(f.data).slice(0, 10) + 'T00:00:00'),
                end:   new Date(String(f.data).slice(0, 10) + 'T23:59:00'),
                allDay: true,
                tipo: 'feriado',
                dados: f,
              })) : [])
            .catch(() => [])
        );
      }

      const resultados = await Promise.all(promises);
      setEventos(resultados.flat());
    } catch { toast.error('Erro ao carregar eventos'); }
    finally { setCarregando(false); }
  }, [dataAtual, filtros, usuarioId]);

  useEffect(() => { carregarEventos(); }, [carregarEventos]);

  // Carrega os usuários ativos uma vez (para o seletor "Delegar para" e o filtro do admin).
  useEffect(() => {
    agendaAPI.listarUsuarios()
      .then(r => { if (r.data.ok) setUsuarios(r.data.dados || []); })
      .catch(() => { /* silencioso: a agenda funciona mesmo sem a lista */ });
  }, []);

  // Esc fecha o modal "Adicionar em dd/mm/aaaa" (o que abre ao clicar num dia),
  // além do botão Cancelar e do clique fora. Só ativo enquanto o modal existe.
  useEffect(() => {
    if (!diaSelecionado) return;
    function onEscDia(e) { if (e.key === 'Escape') setDiaSelecionado(null); }
    document.addEventListener('keydown', onEscDia);
    return () => document.removeEventListener('keydown', onEscDia);
  }, [diaSelecionado]);

  // Esc fecha a janelinha de detalhe do evento — só quando ela é a janela mais acima
  // (se a "leitura da publicação" estiver por cima, o Esc fecha a de cima primeiro).
  const detalheEventoRef = useEscFechar(() => setEventoSelecionado(null), !!eventoSelecionado);

  // Janela central com TODOS os itens de um dia (aberta pelo "+N mais"). Monto a lista aqui,
  // filtrando os eventos daquele dia — assim é impossível faltar item, e ordeno por horário.
  const diaListaRef = useEscFechar(() => setDiaLista(null), !!diaLista);
  const itensDoDia = diaLista
    ? eventos.filter(ev => isSameDay(ev.start, diaLista)).sort((a, b) => a.start - b.start)
    : [];

  // Estilo customizado por tipo de evento
  function eventPropGetter(evento) {
    // Compromisso concluído (com baixa): fica esmaecido e riscado.
    const concluido = evento.tipo === 'compromisso' && evento.dados?.concluido;
    return {
      style: {
        backgroundColor: COR_EVENTO[evento.tipo] || '#6b7280',
        borderRadius: '4px',
        border: 'none',
        // Prazo usa fundo bege (claro) → texto escuro; os demais tipos seguem com texto branco.
        color: evento.tipo === 'prazo' ? '#5c4a2a' : '#fff',
        fontSize: '11px',
        padding: '1px 4px',
        ...(concluido ? { opacity: 0.55, textDecoration: 'line-through' } : {}),
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
          <span style={{fontSize:'15px',color:'#555',fontWeight:500}}>Mostrar:</span>
          {[
            { key:'prazos',    label:'Prazos',    cor: COR_EVENTO.prazo },
            { key:'audiencias',label:'Audiências',cor: COR_EVENTO.audiencia },
            { key:'pericias',  label:'Perícias',  cor: COR_EVENTO.pericia },
            { key:'tarefas',   label:'Tarefas',   cor: COR_EVENTO.tarefa },
            { key:'compromissos', label:'Compromissos', cor: COR_EVENTO.compromisso },
            { key:'feriados',  label:'Feriados',  cor: COR_EVENTO.feriado },
          ].map(({ key, label, cor }) => (
            <label key={key} style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',fontSize:'15px'}}>
              <input type="checkbox" checked={filtros[key]} onChange={() => toggleFiltro(key)} />
              <span style={{
                display:'inline-block', width:'16px', height:'16px',
                borderRadius:'3px', background: filtros[key] ? cor : '#d1d5db'
              }} />
              {label}
            </label>
          ))}

          {/* Separador */}
          <span style={{borderLeft:'1px solid #e5e7eb',height:'18px'}} />

          {/* Checkbox Escritório */}
          <label style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',fontSize:'15px',color: filtros.escritorio ? '#1a56db' : '#555',fontWeight: filtros.escritorio ? 600 : 400}}>
            <input type="checkbox" checked={filtros.escritorio} onChange={() => toggleFiltro('escritorio')} />
            🏢 Escritório
          </label>

          {/* Quem pode ver a agenda de todos escolhe de qual usuário ver (ou Todos). Não aparece no modo Escritório. */}
          {podeVerAgendaDeTodos && !filtros.escritorio && (
            <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'14px',color:'#555'}}>
              👤 Ver agenda de:
              <select className="form-control" style={{width:'auto',fontSize:'13px',padding:'4px 8px'}}
                value={verAgendaDe} onChange={e => setVerAgendaDe(e.target.value)}>
                <option value="">Todos</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </label>
          )}

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
            components={COMPONENTES_CALENDARIO}
            eventPropGetter={eventPropGetter}
            selectable
            onSelectSlot={({ start }) => setDiaSelecionado(start)}
            onSelectEvent={ev => setEventoSelecionado(ev)}
            onShowMore={(evts, date) => setDiaLista(date)}
            doShowMoreDrillDown={false}
            style={{height:'100%'}}
          />
        </div>
      </div>

      {/* Modal: detalhe do evento clicado */}
      {/* Janela central: todos os itens de um dia (aberta pelo "+N mais"). Rola sozinha quando há muitos. */}
      {diaLista && (
        <div className="modal-overlay" ref={diaListaRef}
          onMouseDown={e => { if (e.target === e.currentTarget) setDiaLista(null); }}>
          <div className="modal-box" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h3>Itens de {format(diaLista, 'dd/MM/yyyy')}</h3>
              <button className="modal-fechar" onClick={() => setDiaLista(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {itensDoDia.length === 0 ? (
                <p style={{ color: '#6b7280', margin: 0 }}>Nenhum item neste dia.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {itensDoDia.map((ev, i) => {
                    const st = eventPropGetter(ev).style;
                    const resp = responsavelDoEvento(ev);
                    return (
                      <button key={i} type="button" onClick={() => setEventoSelecionado(ev)}
                        style={{
                          cursor: 'pointer', border: 'none', width: '100%',
                          borderRadius: '6px', padding: '9px 12px', fontSize: '14px',
                          backgroundColor: st.backgroundColor, color: st.color,
                          opacity: st.opacity, textDecoration: st.textDecoration,
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                        }}>
                        <span style={{ textAlign: 'left', whiteSpace: 'normal', wordBreak: 'break-word' }}>{ev.title}</span>
                        {resp && (
                          <span style={{ flexShrink: 0, fontStyle: 'italic', opacity: 0.9, fontSize: '13px', whiteSpace: 'nowrap' }}>
                            {resp}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {eventoSelecionado && (
        <div className="modal-overlay" ref={detalheEventoRef}>
          <div className="modal-box modal-pequeno">
            <div className="modal-header">
              <h3 style={{textTransform:'capitalize'}}>{eventoSelecionado.tipo}</h3>
              <button className="modal-fechar" onClick={() => setEventoSelecionado(null)}>✕</button>
            </div>
            <div className="modal-body">
              <EventoDetalhe evento={eventoSelecionado} />
            </div>
            <div className="modal-footer">
              {/* Compromisso: quem agendou, quem recebeu (delegado) ou o admin podem editar/excluir/dar baixa */}
              {eventoSelecionado.tipo === 'compromisso' && (
                eventoSelecionado.dados.usuario_id === usuario?.id
                || eventoSelecionado.dados.delegado_para === usuario?.id
                || ehAdmin
              ) && (
                <>
                  <button className="btn btn-danger" style={{ marginRight: 'auto' }}
                    onClick={() => { setConfirmarExcluir(eventoSelecionado.dados); setEventoSelecionado(null); }}>
                    Excluir
                  </button>
                  <button className="btn" style={{ background: eventoSelecionado.dados.concluido ? '#6b7280' : '#059669', color: '#fff' }}
                    onClick={async () => {
                      const estava = eventoSelecionado.dados.concluido;
                      try {
                        await agendaAPI.darBaixaCompromisso(eventoSelecionado.dados.id);
                        toast.success(estava ? 'Compromisso reaberto' : 'Compromisso concluído');
                        setEventoSelecionado(null); carregarEventos();
                      } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao dar baixa'); }
                    }}>
                    {eventoSelecionado.dados.concluido ? '↩ Reabrir' : '✓ Dar baixa'}
                  </button>
                  <button className="btn btn-primary"
                    onClick={() => { setModalCompromisso(eventoSelecionado.dados); setEventoSelecionado(null); }}>
                    Editar
                  </button>
                </>
              )}
              {eventoSelecionado.dados?.publicacao_id && temPermissao('publicacoes','visualizar') && (
                <button className="btn btn-outline"
                  onClick={() => setVerPubOrigem(eventoSelecionado.dados.publicacao_id)}>
                  📄 Ver publicação de origem
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setEventoSelecionado(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: ler a publicação que originou a ação (prazo/tarefa/compromisso) */}
      {verPubOrigem && (
        <ModalLerPublicacao publicacaoId={verPubOrigem} onFechar={() => setVerPubOrigem(null)} />
      )}

      {/* Modal: criar / editar compromisso pessoal */}
      {modalCompromisso && (
        <ModalCompromisso
          compromisso={modalCompromisso.id ? modalCompromisso : null}
          dataInicial={modalCompromisso.dataInicial}
          usuarios={usuarios}
          usuarioLogadoId={usuario?.id}
          ehAdmin={ehAdmin}
          onFechar={(reload) => { setModalCompromisso(null); if (reload) carregarEventos(); }}
        />
      )}

      {/* Modal: nova tarefa criada direto na Agenda — reaproveita o ModalTarefa (sem duplicar formulário).
          Ao salvar (onFechar(true)), fecha e recarrega os eventos para a tarefa nova já aparecer no calendário. */}
      {modalTarefa && (
        <ModalTarefa
          dataInicial={modalTarefa.dataInicial}
          onFechar={(reload) => { setModalTarefa(null); if (reload) carregarEventos(); }}
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
                {/* Nova tarefa: abre o MESMO ModalTarefa da tela de Tarefas, aqui dentro da Agenda (não navega mais
                    para /tarefas — o usuário fica na tela que escolheu). Gated por 'tarefas.cadastrar', igual ao botão
                    "+ Nova tarefa" da tela de Tarefas (o backend também exige essa permissão no POST /tarefas). */}
                {temPermissao('tarefas', 'cadastrar') && (
                  <button className="btn btn-outline"
                    onClick={() => { setModalTarefa({ dataInicial: format(diaSelecionado, 'yyyy-MM-dd') }); setDiaSelecionado(null); }}>
                    ✅ Nova tarefa
                  </button>
                )}
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
    linhas.push(['Vencimento', formatarData(dados.data_vencimento)]);
    linhas.push(['Status', dados.status]);
    if (dados.responsavel_nome) linhas.push(['Responsável', dados.responsavel_nome]);
  } else if (tipo === 'audiencia') {
    if (dados.processo_numero) linhas.push(['Processo', dados.processo_numero]);
    if (dados.pasta_titulo)    linhas.push(['Pasta', dados.pasta_titulo]);
    if (dados.tipo_nome)       linhas.push(['Tipo', dados.tipo_nome]);
    linhas.push(['Data', `${formatarData(String(dados.data).slice(0, 10))}${dados.hora ? ' ' + dados.hora.slice(0, 5) : ''}`]);
    linhas.push(['Modalidade', dados.modalidade]);
    if (dados.local)           linhas.push(['Local', dados.local]);
    if (dados.link_virtual)    linhas.push(['Link', dados.link_virtual]);
  } else if (tipo === 'pericia') {
    if (dados.processo_numero) linhas.push(['Processo', dados.processo_numero]);
    if (dados.tipo_nome)       linhas.push(['Tipo', dados.tipo_nome]);
    linhas.push(['Data', `${formatarData(String(dados.data).slice(0, 10))}${dados.hora ? ' ' + dados.hora.slice(0, 5) : ''}`]);
    if (dados.local)           linhas.push(['Local', dados.local]);
    if (dados.perito_nome)     linhas.push(['Perito', dados.perito_nome]);
    if (dados.assistente_nome) linhas.push(['Assistente', dados.assistente_nome]);
  } else if (tipo === 'tarefa') {
    linhas.push(['Título', dados.titulo]);
    if (dados.processo_numero)       linhas.push(['Processo', dados.processo_numero]);
    if (dados.pasta_do_processo_fmt) linhas.push(['Pasta', dados.pasta_do_processo_fmt]);
    if (dados.descricao)       linhas.push(['Descrição', dados.descricao]);
    linhas.push(['Prioridade', dados.prioridade]);
    if (dados.data_vencimento) linhas.push(['Vencimento', formatarData(dados.data_vencimento)]);
    if (dados.atribuida_para_nome) linhas.push(['Atribuída para', dados.atribuida_para_nome]);
  } else if (tipo === 'compromisso') {
    linhas.push(['Título', dados.titulo]);
    if (dados.descricao) linhas.push(['Descrição', dados.descricao]);
    linhas.push(['Data', formatarData(String(dados.data).slice(0, 10))]);
    if (dados.dia_todo) linhas.push(['Período', 'Dia todo']);
    else if (dados.hora_inicio) linhas.push(['Hora', `${dados.hora_inicio.slice(0, 5)}${dados.hora_fim ? ' às ' + dados.hora_fim.slice(0, 5) : ''}`]);
    if (dados.escritorio) linhas.push(['Visibilidade', 'Escritório (compartilhado)']);
    if (dados.delegado_nome) linhas.push(['Delegado para', dados.delegado_nome]);
    if (dados.usuario_nome) linhas.push(['Agendado por', `${dados.usuario_nome}${dados.criado_em ? ' em ' + fmtDataHora(dados.criado_em) : ''}`]);
    if (Number(dados.concluido) === 1) {
      linhas.push(['Situação', `Concluído${dados.concluido_nome ? ' por ' + dados.concluido_nome : ''}${dados.concluido_em ? ' em ' + fmtDataHora(dados.concluido_em) : ''}`]);
    }
  } else if (tipo === 'feriado') {
    linhas.push(['Feriado', dados.descricao]);
    linhas.push(['Data', formatarData(String(dados.data).slice(0, 10))]);
    if (dados.tipo) linhas.push(['Tipo', dados.tipo]);
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
export function ModalCompromisso({ compromisso, dataInicial, usuarios = [], usuarioLogadoId, ehAdmin, onFechar, publicacaoId }) {
  const editando = !!(compromisso && compromisso.id);
  const [form, setForm] = useState({
    titulo: compromisso?.titulo || '',
    descricao: compromisso?.descricao || '',
    data: compromisso?.data ? String(compromisso.data).slice(0, 10) : (dataInicial || format(new Date(), 'yyyy-MM-dd')),
    dia_todo: compromisso?.dia_todo ? true : false,
    hora_inicio: compromisso?.hora_inicio ? compromisso.hora_inicio.slice(0, 5) : '',
    hora_fim: compromisso?.hora_fim ? compromisso.hora_fim.slice(0, 5) : '',
    escritorio: compromisso?.escritorio ? true : false,
    // Delegar para: por padrão o próprio usuário logado. Ao editar, o delegado atual
    // (ou o criador, se o compromisso não tiver delegado).
    delegado_para: String(
      compromisso
        ? (compromisso.delegado_para || compromisso.usuario_id || usuarioLogadoId || '')
        : (usuarioLogadoId || '')
    ),
  });
  const [salvando, setSalvando] = useState(false);
  const [confirmarData, setConfirmarData] = useState(false); // confirmação do admin p/ data passada
  const [aviso, setAviso] = useState(''); // faixa de aviso DENTRO do modal (nunca toast do canto)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  // Esc fecha o formulário — só quando ele é a janela mais acima (com a confirmação de
  // data passada aberta por cima, o Esc fecha a confirmação primeiro, não o formulário).
  const overlayRef = useEscFechar(() => onFechar(false));

  // Grava de fato (chamado direto ou após a confirmação da data passada)
  async function executarSalvar() {
    setSalvando(true);
    try {
      if (editando) await agendaAPI.atualizarCompromisso(compromisso.id, form);
      else          await agendaAPI.criarCompromisso({ ...form, publicacao_id: publicacaoId || null });
      toast.success(editando ? 'Compromisso atualizado' : 'Compromisso criado');
      onFechar(true);
    } catch (err) {
      setAviso(err.response?.data?.mensagem || 'Não foi possível salvar o compromisso.');
    } finally {
      setSalvando(false);
    }
  }

  function salvar() {
    if (!form.titulo.trim()) return setAviso('Informe o título do compromisso.');
    if (!form.data) return setAviso('Informe a data.');
    // Data anterior a hoje: usuário comum é bloqueado; admin precisa confirmar.
    if (form.data < format(new Date(), 'yyyy-MM-dd')) {
      if (!ehAdmin) return setAviso('Apenas o administrador pode agendar com data anterior a hoje. Escolha uma data a partir de hoje.');
      return setConfirmarData(true);
    }
    setAviso('');
    executarSalvar();
  }

  return (
    <>
    <div className="modal-overlay" style={{ zIndex: 1100 }} ref={overlayRef}>
      <div className="modal-box" style={{ maxWidth: '460px' }}>
        <div className="modal-header">
          <h3>{editando ? 'Editar compromisso' : 'Novo compromisso'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          {aviso && (
            <div style={{ background:'#fff4e5', border:'1px solid #ffcf99', color:'#8a5300',
              padding:'8px 12px', borderRadius:'6px', fontSize:'13px', marginBottom:'12px' }}>
              {aviso}
            </div>
          )}
          <div className="form-group">
            <label className="form-label obrigatorio">Título</label>
            <input className="form-control" value={form.titulo} onChange={e => set('titulo', e.target.value)}
              placeholder="Ex.: Reunião com cliente" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea className="form-control" rows={2} value={form.descricao} onChange={e => set('descricao', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Delegar para</label>
            <select className="form-control" value={form.delegado_para} onChange={e => set('delegado_para', e.target.value)}>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            <small style={{ color: '#6b7280', fontSize: 12 }}>
              O compromisso aparece na agenda de quem for escolhido aqui.
            </small>
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
          {editando && compromisso?.usuario_nome && (
            <p style={{ color: '#6b7280', fontSize: 12, margin: '4px 0 0' }}>
              🗓️ Agendado por: <strong>{compromisso.usuario_nome}</strong>
              {compromisso.criado_em ? ` em ${fmtDataHora(compromisso.criado_em)}` : ''}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
    {confirmarData && (
      // z-index acima do modal (1100): senão a confirmação renderiza ATRÁS dele e fica invisível.
      <div style={{ position: 'relative', zIndex: 2000 }}>
        <ModalConfirmar
          titulo="Data anterior a hoje"
          tipo="aviso"
          mensagem={`A data escolhida (${formatarData(form.data)}) é anterior a hoje. Deseja agendar mesmo assim?`}
          textoBotao="Agendar assim mesmo"
          acao={async () => { await executarSalvar(); }}
          onCancelar={() => setConfirmarData(false)}
        />
      </div>
    )}
    </>
  );
}

