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

import { prazosAPI, audienciasAPI, tarefasAPI, periciasAPI } from '../../services/api';
import { toast } from 'react-toastify';

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
  prazo:     '#dc2626', // vermelho
  audiencia: '#1a56db', // azul
  pericia:   '#7c3aed', // roxo
  tarefa:    '#d97706', // laranja
};

export default function Agenda() {
  const [eventos, setEventos]   = useState([]);
  const [dataAtual, setDataAtual] = useState(new Date());
  const [visao, setVisao]       = useState('month');
  const [carregando, setCarregando] = useState(false);
  const [eventoSelecionado, setEventoSelecionado] = useState(null);
  const [filtros, setFiltros]   = useState({
    prazos: true, audiencias: true, pericias: true, tarefas: true
  });

  // Carrega eventos quando o mês ou filtros mudam
  const carregarEventos = useCallback(async () => {
    setCarregando(true);
    const data_de  = format(startOfMonth(dataAtual), 'yyyy-MM-dd');
    const data_ate = format(endOfMonth(dataAtual), 'yyyy-MM-dd');

    try {
      const promises = [];

      if (filtros.prazos) {
        promises.push(
          prazosAPI.listar({ data_de, data_ate, limite: 200 })
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
          audienciasAPI.listar({ data_de, data_ate, limite: 200 })
            .then(r => r.data.ok ? r.data.dados.registros.map(a => ({
              id: `audiencia-${a.id}`,
              title: `⚖️ ${a.tipo_nome || 'Audiência'} — ${a.processo_numero || ''}`,
              start: new Date(`${a.data}T${a.hora || '00:00'}:00`),
              end:   new Date(`${a.data}T${a.hora || '01:00'}:00`),
              allDay: false,
              tipo: 'audiencia',
              dados: a,
            })) : [])
            .catch(() => [])
        );
      }

      if (filtros.pericias) {
        promises.push(
          periciasAPI.listar({ data_de, data_ate, limite: 200 })
            .then(r => r.data.ok ? r.data.dados.registros.map(p => ({
              id: `pericia-${p.id}`,
              title: `🔬 ${p.tipo_nome || 'Perícia'} — ${p.processo_numero || ''}`,
              start: new Date(`${p.data}T${p.hora || '00:00'}:00`),
              end:   new Date(`${p.data}T${p.hora || '01:00'}:00`),
              allDay: !p.hora,
              tipo: 'pericia',
              dados: p,
            })) : [])
            .catch(() => [])
        );
      }

      if (filtros.tarefas) {
        promises.push(
          tarefasAPI.listar({ concluida: '0', limite: 200 })
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

      const resultados = await Promise.all(promises);
      setEventos(resultados.flat());
    } catch { toast.error('Erro ao carregar eventos'); }
    finally { setCarregando(false); }
  }, [dataAtual, filtros]);

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
      {/* Filtros e legenda */}
      <div className="card" style={{marginBottom:'16px'}}>
        <div style={{display:'flex',gap:'16px',flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:'13px',color:'#555',fontWeight:500}}>Mostrar:</span>
          {[
            { key:'prazos',    label:'Prazos',    cor: COR_EVENTO.prazo },
            { key:'audiencias',label:'Audiências',cor: COR_EVENTO.audiencia },
            { key:'pericias',  label:'Perícias',  cor: COR_EVENTO.pericia },
            { key:'tarefas',   label:'Tarefas',   cor: COR_EVENTO.tarefa },
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
          {carregando && (
            <span style={{marginLeft:'auto',fontSize:'12px',color:'#888'}}>Carregando...</span>
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
            onSelectEvent={ev => setEventoSelecionado(ev)}
            popup
            style={{height:'100%'}}
          />
        </div>
      </div>

      {/* Modal: detalhe do evento clicado */}
      {eventoSelecionado && (
        <div className="modal-overlay" onClick={() => setEventoSelecionado(null)}>
          <div className="modal-box modal-pequeno" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{textTransform:'capitalize'}}>{eventoSelecionado.tipo}</h3>
              <button className="modal-fechar" onClick={() => setEventoSelecionado(null)}>✕</button>
            </div>
            <div className="modal-body">
              <EventoDetalhe evento={eventoSelecionado} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEventoSelecionado(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
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
