// ============================================================
// PÁGINA DE RELATÓRIOS
// Pesquisa flexível por módulo com exportação
// ============================================================

import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { prazosAPI, tarefasAPI, audienciasAPI, processosAPI, financeiroAPI, pessoasAPI, periciasAPI } from '../../services/api';
import { formatarData, formatarNumeroPasta, formatarMoeda, labelStatusPrazo, labelPrioridade } from '../../utils/formatters';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import AcoesAniversariante from '../../components/AcoesAniversariante';
import NumeroProcessoCopiavel from '../../components/NumeroProcessoCopiavel';

const MODULOS = [
  { key: 'prazos',          label: 'Prazos' },
  { key: 'tarefas',         label: 'Tarefas' },
  { key: 'audiencias',      label: 'Audiências' },
  { key: 'pericias',        label: 'Perícias' },
  { key: 'pastas',          label: 'Processos / Pastas' },
  { key: 'processos_parados', label: 'Processos parados (risco de prescrição)' },
  { key: 'aniversariantes', label: 'Aniversariantes (clientes)' },
  { key: 'financeiro',      label: 'Financeiro (admin)' },
];

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const PERIODOS_PERICIA = [
  { chave: 'hoje', label: 'Hoje', dias: 0 },
  { chave: '7', label: '7 dias', dias: 7 },
  { chave: '30', label: '30 dias', dias: 30 },
];

function dataMaisDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dataHojeLocal() {
  return dataMaisDias(0);
}

export default function Relatorios() {
  const { ehAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const relInicial = searchParams.get('rel');
  const [modulo, setModulo]   = useState(MODULOS.some(m => m.key === relInicial) ? relInicial : 'prazos');
  const [filtros, setFiltros] = useState({});
  const [resultado, setResultado] = useState(null);
  const [total, setTotal]     = useState(0);
  const [buscando, setBuscando] = useState(false);

  function setFiltro(k, v) { setFiltros(f => ({...f, [k]: v})); }
  function aplicarPeriodoPericia(dias) {
    const novosFiltros = { ...filtros, data_de: dataHojeLocal(), data_ate: dataMaisDias(dias) };
    setFiltros(novosFiltros);
    buscar(novosFiltros, 'pericias');
  }
  function limparFiltrosPericia() {
    setFiltros({ busca: '', data_de: '', data_ate: '' });
    setResultado(null);
    setTotal(0);
  }
  const periodoPericiaAtivo = modulo === 'pericias' && filtros.data_de === dataHojeLocal()
    ? (PERIODOS_PERICIA.find(p => filtros.data_ate === dataMaisDias(p.dias))?.chave || null)
    : null;

  // Se veio do Dashboard com ?rel=processos_parados, já gera o relatório ao abrir.
  useEffect(() => {
    if (relInicial && MODULOS.some(m => m.key === relInicial)) buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function mudarModulo(m) {
    setModulo(m);
    setFiltros({});
    setResultado(null);
  }

  async function buscar(filtrosBusca = filtros, moduloBusca = modulo) {
    setBuscando(true);
    try {
      let data;
      switch (moduloBusca) {
        case 'prazos':
          ({ data } = await prazosAPI.listar({ ...filtrosBusca, limite: 200 }));
          if (data.ok) { setResultado({ tipo: 'prazos', registros: data.dados.registros }); setTotal(data.dados.total); }
          break;
        case 'tarefas':
          ({ data } = await tarefasAPI.listar({ ...filtrosBusca, limite: 200 }));
          if (data.ok) { setResultado({ tipo: 'tarefas', registros: data.dados.registros }); setTotal(data.dados.total); }
          break;
        case 'audiencias':
          ({ data } = await audienciasAPI.listar({ ...filtrosBusca, limite: 200 }));
          if (data.ok) { setResultado({ tipo: 'audiencias', registros: data.dados.registros }); setTotal(data.dados.total); }
          break;
        case 'pericias':
          ({ data } = await periciasAPI.relatorioPeritos({
            busca: filtrosBusca.busca || '',
            data_de: filtrosBusca.data_de || '',
            data_ate: filtrosBusca.data_ate || '',
          }));
          if (data.ok) {
            setResultado({ tipo: 'pericias', ...data.dados });
            setTotal(data.dados.total_registros || 0);
          }
          break;
        case 'pastas':
          ({ data } = await processosAPI.listarPastas({ ...filtrosBusca, limite: 200 }));
          if (data.ok) { setResultado({ tipo: 'pastas', registros: data.dados.registros }); setTotal(data.dados.total); }
          break;
        case 'processos_parados':
          ({ data } = await processosAPI.processosParados(filtrosBusca.dias));
          if (data.ok) { setResultado({ tipo: 'processos_parados', registros: data.dados.processos, dias: data.dados.dias }); setTotal(data.dados.processos.length); }
          break;
        case 'aniversariantes':
          ({ data } = await pessoasAPI.aniversariantes({ filtro: filtrosBusca.periodo || 'hoje', mes: filtrosBusca.mes }));
          if (data.ok) { setResultado({ tipo: 'aniversariantes', registros: data.dados.registros }); setTotal(data.dados.total); }
          break;
        case 'financeiro':
          if (!ehAdmin) { toast.error('Apenas administradores podem acessar o relatório financeiro'); return; }
          ({ data } = await financeiroAPI.relatorio(filtrosBusca));
          if (data.ok) {
            setResultado({ tipo: 'financeiro', ...data.dados });
            setTotal(data.dados.lancamentos?.length || 0);
          }
          break;
        default:
          break;
      }
    } catch { toast.error('Erro ao gerar relatório'); }
    finally { setBuscando(false); }
  }

  function exportarCSV() {
    if (!resultado) return;
    let linhas = [];
    let cabecalho = [];

    if (resultado.tipo === 'prazos') {
      cabecalho = ['Processo','Pasta','Prazo','Vencimento','Dias','Responsável','Status'];
      linhas = resultado.registros.map(r => [
        r.processo_numero, r.pasta_titulo, r.subtipo_nome||r.descricao,
        r.data_vencimento, r.dias_restantes, r.responsavel_nome||'Escritório', r.status
      ]);
    } else if (resultado.tipo === 'tarefas') {
      cabecalho = ['Título','Prioridade','Vencimento','Atribuída para','Concluída'];
      linhas = resultado.registros.map(r => [
        r.titulo, r.prioridade, r.data_vencimento||'—', r.atribuida_para_nome||'Escritório', r.concluida?'Sim':'Não'
      ]);
    } else if (resultado.tipo === 'audiencias') {
      cabecalho = ['Processo','Pasta','Tipo','Data','Hora','Modalidade','Status'];
      linhas = resultado.registros.map(r => [
        r.processo_numero, r.pasta_titulo, r.tipo_nome, r.data, r.hora?.slice(0,5), r.modalidade, r.ata_resultado||'agendada'
      ]);
    } else if (resultado.tipo === 'pericias') {
      cabecalho = ['Perito(a)','Telefone','E-mail','Pasta','Processo','Tipo perícia','Data','Hora','Status','Origem'];
      linhas = resultado.registros.map(r => [
        r.perito_nome || '— não informado —', r.telefone || '', r.email || '',
        r.pasta_numero ? String(r.pasta_numero).padStart(4, '0') : '',
        r.processo_numero || '', r.tipo_pericia || '', r.data || '',
        r.hora ? String(r.hora).slice(0,5) : '', r.status || '', r.origem || ''
      ]);
    } else if (resultado.tipo === 'pastas') {
      cabecalho = ['Nº Pasta','Título','Cliente','Área','Processos'];
      linhas = resultado.registros.map(r => [
        formatarNumeroPasta(r.numero), r.titulo, r.cliente_nome, r.area_direito, r.total_processos
      ]);
    } else if (resultado.tipo === 'processos_parados') {
      cabecalho = ['Pasta','Processo','Última ação','Dias parado'];
      linhas = resultado.registros.map(r => [
        r.pasta_numero_fmt, r.numero, r.ultima_acao, r.dias_parado
      ]);
    } else if (resultado.tipo === 'aniversariantes') {
      cabecalho = ['Nome','Dia','Idade','Telefone','E-mail','Parabéns'];
      linhas = resultado.registros.map(r => [
        r.nome, r.dia, r.idade != null ? `${r.idade} anos` : '', r.telefone||'', r.email||'',
        r.ja_parabenizado ? 'Já parabenizado' : 'Pendente'
      ]);
    } else if (resultado.tipo === 'financeiro') {
      cabecalho = ['Data','Pasta','Cliente','Descrição','Tipo','Valor'];
      linhas = (resultado.lancamentos||[]).map(r => [
        r.data_lancamento, r.pasta_titulo, r.cliente_nome||'', r.descricao, r.tipo, r.valor
      ]);
    }

    const csv = [cabecalho, ...linhas].map(l => l.map(c => `"${c||''}"`).join(',')).join('\n');
    const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_${modulo}_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  }

  return (
    <div>
      {/* Seleção de módulo e filtros */}
      <div className="card" style={{marginBottom:'16px'}}>
        <div className="form-group">
          <label className="form-label">Módulo</label>
          <select className="form-control" style={{maxWidth:'280px'}} value={modulo}
            onChange={e => mudarModulo(e.target.value)}>
            {MODULOS.filter(m => m.key !== 'financeiro' || ehAdmin).map(m => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Filtros dinâmicos por módulo */}
        <div style={{display:'flex',gap:'12px',flexWrap:'wrap',alignItems:'flex-end',marginTop:'8px'}}>
          {(modulo === 'prazos') && (
            <>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Status</label>
                <select className="form-control" value={filtros.status||''}
                  onChange={e => setFiltro('status', e.target.value)}>
                  <option value="">Todos</option>
                  <option value="aberto">Aberto</option>
                  <option value="fazendo">Fazendo</option>
                  <option value="concluido">Concluído</option>
                  <option value="pendente">Pendente</option>
                </select>
              </div>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Vencimento de</label>
                <input type="date" className="form-control" value={filtros.data_de||''}
                  onChange={e => setFiltro('data_de', e.target.value)} />
              </div>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Até</label>
                <input type="date" className="form-control" value={filtros.data_ate||''}
                  onChange={e => setFiltro('data_ate', e.target.value)} />
              </div>
            </>
          )}

          {(modulo === 'tarefas') && (
            <>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Status</label>
                <select className="form-control" value={filtros.concluida||''}
                  onChange={e => setFiltro('concluida', e.target.value)}>
                  <option value="">Todas</option>
                  <option value="0">Pendentes</option>
                  <option value="1">Concluídas</option>
                </select>
              </div>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Prioridade</label>
                <select className="form-control" value={filtros.prioridade||''}
                  onChange={e => setFiltro('prioridade', e.target.value)}>
                  <option value="">Todas</option>
                  <option value="urgente">Urgente</option>
                  <option value="normal">Normal</option>
                  <option value="baixa">Baixa</option>
                </select>
              </div>
            </>
          )}

          {(modulo === 'audiencias') && (
            <>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Data de</label>
                <input type="date" className="form-control" value={filtros.data_de||''}
                  onChange={e => setFiltro('data_de', e.target.value)} />
              </div>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Até</label>
                <input type="date" className="form-control" value={filtros.data_ate||''}
                  onChange={e => setFiltro('data_ate', e.target.value)} />
              </div>
            </>
          )}

          {(modulo === 'pericias') && (
            <>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Pesquisar</label>
                <input className="form-control" style={{minWidth:'260px'}}
                  placeholder="Digite perito, processo ou pasta..."
                  value={filtros.busca || ''}
                  onChange={e => setFiltro('busca', e.target.value)} />
              </div>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Data de</label>
                <input type="date" className="form-control" value={filtros.data_de || ''}
                  onChange={e => setFiltro('data_de', e.target.value)} />
              </div>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Até</label>
                <input type="date" className="form-control" value={filtros.data_ate || ''}
                  onChange={e => setFiltro('data_ate', e.target.value)} />
              </div>
              <button className="btn btn-secondary" style={{ marginBottom: '1px' }}
                onClick={limparFiltrosPericia}>
                ✕ Limpar filtros
              </button>
            </>
          )}

          {(modulo === 'pastas') && (
            <div className="form-group" style={{margin:0}}>
              <label className="form-label">Buscar</label>
              <input className="form-control" style={{minWidth:'240px'}} placeholder="Título ou número..."
                value={filtros.busca||''}
                onChange={e => setFiltro('busca', e.target.value)} />
            </div>
          )}

          {(modulo === 'processos_parados') && (
            <div className="form-group" style={{margin:0}}>
              <label className="form-label">Parado há mais de (dias)</label>
              <input type="number" min="1" className="form-control" style={{maxWidth:'180px'}}
                placeholder="usar configuração"
                value={filtros.dias||''}
                onChange={e => setFiltro('dias', e.target.value)} />
            </div>
          )}

          {(modulo === 'aniversariantes') && (
            <>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Período</label>
                <select className="form-control" value={filtros.periodo || 'hoje'}
                  onChange={e => setFiltro('periodo', e.target.value)}>
                  <option value="hoje">Hoje</option>
                  <option value="semana">Próximos 7 dias</option>
                  <option value="mes">Mês</option>
                </select>
              </div>
              {(filtros.periodo === 'mes') && (
                <div className="form-group" style={{margin:0}}>
                  <label className="form-label">Mês</label>
                  <select className="form-control" value={filtros.mes || (new Date().getMonth() + 1)}
                    onChange={e => setFiltro('mes', e.target.value)}>
                    {MESES.map((nome, i) => <option key={i + 1} value={i + 1}>{nome}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          {(modulo === 'financeiro') && (
            <>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Período de</label>
                <input type="date" className="form-control" value={filtros.data_de||''}
                  onChange={e => setFiltro('data_de', e.target.value)} />
              </div>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Até</label>
                <input type="date" className="form-control" value={filtros.data_ate||''}
                  onChange={e => setFiltro('data_ate', e.target.value)} />
              </div>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Tipo</label>
                <select className="form-control" value={filtros.tipo||''}
                  onChange={e => setFiltro('tipo', e.target.value)}>
                  <option value="">Todos</option>
                  <option value="credito">Créditos</option>
                  <option value="debito">Débitos</option>
                </select>
              </div>
            </>
          )}

          <button className="btn btn-primary" style={{marginBottom:'1px'}} onClick={() => buscar()} disabled={buscando}>
            {buscando ? 'Buscando...' : 'Gerar Relatório'}
          </button>
        </div>

        {modulo === 'pericias' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Período rápido:</span>
            {PERIODOS_PERICIA.map(p => (
              <button key={p.chave} type="button"
                className={`btn ${periodoPericiaAtivo === p.chave ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 16px', fontSize: '13px' }}
                onClick={() => aplicarPeriodoPericia(p.dias)}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Resultado */}
      {resultado && (
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
            <span style={{fontSize:'13px',color:'#555'}}>
              {total} registro(s) encontrado(s)
            </span>
            <div style={{display:'flex',gap:'8px'}}>
              <button className="btn btn-outline" style={{fontSize:'12px'}} onClick={exportarCSV}>
                Exportar CSV
              </button>
            </div>
          </div>

          {/* Totalizadores financeiros */}
          {resultado.tipo === 'financeiro' && (
            <div style={{display:'flex',gap:'24px',marginBottom:'16px',flexWrap:'wrap'}}>
              <div>
                <div style={{fontSize:'12px',color:'#888'}}>Total créditos</div>
                <strong style={{color:'#059669'}}>{formatarMoeda(resultado.total_creditos||0)}</strong>
              </div>
              <div>
                <div style={{fontSize:'12px',color:'#888'}}>Total débitos</div>
                <strong style={{color:'#dc2626'}}>{formatarMoeda(resultado.total_debitos||0)}</strong>
              </div>
              <div>
                <div style={{fontSize:'12px',color:'#888'}}>Saldo do período</div>
                <strong style={{color:(resultado.saldo_periodo||0)>=0?'#059669':'#dc2626'}}>
                  {formatarMoeda(resultado.saldo_periodo||0)}
                </strong>
              </div>
            </div>
          )}

          {resultado.tipo === 'pericias' && (
            <div style={{display:'flex',gap:'24px',marginBottom:'16px',flexWrap:'wrap'}}>
              <div>
                <div style={{fontSize:'12px',color:'#888'}}>Peritos encontrados</div>
                <strong>{resultado.total_peritos || 0}</strong>
              </div>
              <div>
                <div style={{fontSize:'12px',color:'#888'}}>Processos encontrados</div>
                <strong>{resultado.total_processos || 0}</strong>
              </div>
            </div>
          )}

          <TabelaResultado resultado={resultado} onRecarregar={buscar} />
        </div>
      )}
    </div>
  );
}

// Tabela de resultados de acordo com o tipo
function TabelaResultado({ resultado, onRecarregar }) {
  const { tipo, registros, lancamentos } = resultado;

  if (tipo === 'aniversariantes') {
    return (
      <div className="tabela-wrapper">
        <table className="tabela">
          <thead>
            <tr><th>Nome</th><th>Dia</th><th>Idade</th><th>Telefone / WhatsApp</th><th>E-mail</th><th>Parabéns</th><th></th></tr>
          </thead>
          <tbody>
            {registros.map(r => (
              <tr key={r.id}>
                <td><strong>{r.nome}</strong></td>
                <td>{r.dia}</td>
                <td>{r.idade != null ? `${r.idade} anos` : '—'}</td>
                <td>{r.telefone || '—'}</td>
                <td>{r.email || '—'}</td>
                <td>
                  {r.ja_parabenizado
                    ? <span className="badge badge-verde">Já parabenizado</span>
                    : <span className="badge badge-cinza">Pendente</span>}
                </td>
                <td><AcoesAniversariante pessoa={r} onFeito={onRecarregar} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {registros.length === 0 && <p className="lista-vazia">Nenhum aniversariante no período</p>}
      </div>
    );
  }

  if (tipo === 'prazos') {
    return (
      <div className="tabela-wrapper">
        <table className="tabela">
          <thead>
            <tr><th>Processo</th><th>Pasta</th><th>Prazo</th><th>Vencimento</th><th>Dias</th><th>Responsável</th><th>Status</th></tr>
          </thead>
          <tbody>
            {registros.map(r => (
              <tr key={r.id}>
                <td>{r.processo_numero || '—'}</td>
                <td>{r.pasta_titulo || '—'}</td>
                <td>{r.subtipo_nome || r.descricao || '—'}</td>
                <td>{formatarData(r.data_vencimento)}</td>
                <td>
                  {/* Prazo concluído/cancelado não conta dias/atraso — mostra "—" (igual à tela Prazos). */}
                  {['concluido','cancelado'].includes(r.status)
                    ? <span>—</span>
                    : r.dias_restantes < 0
                      ? <span className="badge badge-vermelho">{Math.abs(r.dias_restantes)}d atraso</span>
                      : <span>{r.dias_restantes}d</span>
                  }
                </td>
                <td>{r.responsavel_nome || 'Escritório'}</td>
                <td><span className="badge badge-cinza">{labelStatusPrazo(r.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {registros.length === 0 && <p className="lista-vazia">Nenhum resultado</p>}
      </div>
    );
  }

  if (tipo === 'tarefas') {
    return (
      <div className="tabela-wrapper">
        <table className="tabela">
          <thead>
            <tr><th>Tarefa</th><th>Prioridade</th><th>Vencimento</th><th>Atribuída para</th><th>Status</th></tr>
          </thead>
          <tbody>
            {registros.map(r => (
              <tr key={r.id}>
                <td><strong>{r.titulo}</strong></td>
                <td>{labelPrioridade(r.prioridade)}</td>
                <td>{r.data_vencimento ? formatarData(r.data_vencimento) : '—'}</td>
                <td>{r.atribuida_para_nome || 'Escritório'}</td>
                <td>
                  <span className={`badge ${r.concluida ? 'badge-verde' : 'badge-laranja'}`}>
                    {r.concluida ? 'Concluída' : 'Pendente'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {registros.length === 0 && <p className="lista-vazia">Nenhum resultado</p>}
      </div>
    );
  }

  if (tipo === 'audiencias') {
    return (
      <div className="tabela-wrapper">
        <table className="tabela">
          <thead>
            <tr><th>Processo</th><th>Pasta</th><th>Tipo</th><th>Data</th><th>Hora</th><th>Modalidade</th></tr>
          </thead>
          <tbody>
            {registros.map(r => (
              <tr key={r.id}>
                <td>{r.processo_numero || '—'}</td>
                <td>{r.pasta_titulo || '—'}</td>
                <td>{r.tipo_nome || '—'}</td>
                <td>{formatarData(r.data)}</td>
                <td>{r.hora?.slice(0,5) || '—'}</td>
                <td>{r.modalidade === 'virtual' ? 'Virtual' : 'Presencial'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {registros.length === 0 && <p className="lista-vazia">Nenhum resultado</p>}
      </div>
    );
  }

  if (tipo === 'pericias') {
    return (
      <div className="tabela-wrapper">
        <table className="tabela">
          <thead>
            <tr>
              <th>Perito(a)</th>
              <th>Contato</th>
              <th>Pasta</th>
              <th>Processo</th>
              <th>Perícia</th>
              <th>Data / Hora</th>
              <th>Status</th>
              <th>Origem</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r, idx) => (
              <tr key={`${r.origem}-${r.perito_tipo}-${r.perito_id}-${r.processo_id}-${r.pericia_id || 'vinculo'}-${idx}`}>
                <td><strong>{r.perito_nome || '— não informado —'}</strong></td>
                <td>
                  <div>{r.telefone || '—'}</div>
                  <small style={{color:'#64748b'}}>{r.email || '—'}</small>
                </td>
                <td>
                  {r.pasta_id
                    ? <Link to={`/processos/pasta/${r.pasta_id}`}>{String(r.pasta_numero || '').padStart(4, '0')}</Link>
                    : '—'}
                </td>
                <td><NumeroProcessoCopiavel numero={r.processo_numero} /></td>
                <td>{r.tipo_pericia || '—'}</td>
                <td>
                  {r.data ? formatarData(r.data) : '—'}
                  {r.hora ? ` às ${String(r.hora).slice(0,5)}` : ''}
                </td>
                <td>{r.status ? <span className="badge badge-cinza">{r.status}</span> : '—'}</td>
                <td>{r.origem || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {registros.length === 0 && <p className="lista-vazia">Nenhum perito encontrado</p>}
      </div>
    );
  }

  if (tipo === 'processos_parados') {
    return (
      <div className="tabela-wrapper">
        <table className="tabela">
          <thead>
            <tr><th>Pasta</th><th>Processo</th><th>Última ação</th><th>Dias parado</th></tr>
          </thead>
          <tbody>
            {registros.map(r => (
              <tr key={r.processo_id}>
                <td><Link to={`/processos/pasta/${r.pasta_id}`}>{r.pasta_numero_fmt}</Link></td>
                <td>{r.numero || '—'}</td>
                <td>{formatarData(r.ultima_acao)}</td>
                <td><span className="badge badge-laranja">{r.dias_parado}d</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {registros.length === 0 && <p className="lista-vazia">Nenhum processo parado no período</p>}
      </div>
    );
  }

  if (tipo === 'pastas') {
    return (
      <div className="tabela-wrapper">
        <table className="tabela">
          <thead>
            <tr><th>Nº Pasta</th><th>Título</th><th>Cliente</th><th>Área</th><th>Processos</th></tr>
          </thead>
          <tbody>
            {registros.map(r => (
              <tr key={r.id}>
                <td><strong>{formatarNumeroPasta(r.numero)}</strong></td>
                <td>{r.titulo}</td>
                <td>{r.cliente_nome || '—'}</td>
                <td>{r.area_direito}</td>
                <td>{r.total_processos}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {registros.length === 0 && <p className="lista-vazia">Nenhum resultado</p>}
      </div>
    );
  }

  if (tipo === 'financeiro') {
    return (
      <div className="tabela-wrapper">
        <table className="tabela">
          <thead>
            <tr><th>Data</th><th>Pasta</th><th>Cliente</th><th>Descrição</th><th>Tipo</th><th style={{textAlign:'right'}}>Valor</th></tr>
          </thead>
          <tbody>
            {(lancamentos||[]).map(r => (
              <tr key={r.id}>
                <td>{formatarData(r.data_lancamento)}</td>
                <td>{r.pasta_titulo || '—'}</td>
                <td>{r.cliente_nome || '—'}</td>
                <td>{r.descricao}</td>
                <td>
                  <span className={`badge ${r.tipo==='credito'?'badge-verde':'badge-vermelho'}`}>
                    {r.tipo === 'credito' ? 'Crédito' : 'Débito'}
                  </span>
                </td>
                <td style={{textAlign:'right'}}
                  className={r.tipo==='credito'?'valor-positivo':'valor-negativo'}>
                  {formatarMoeda(r.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!lancamentos || lancamentos.length === 0) && <p className="lista-vazia">Nenhum resultado</p>}
      </div>
    );
  }

  return null;
}
