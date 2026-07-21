// ============================================================
// TELA DO DASHBOARD — Tela principal após o login
// Exibe prazos, tarefas, audiências, perícias e pendências
// ============================================================

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboardAPI, audienciasAPI } from '../../services/api';
import { formatarData, formatarMoeda } from '../../utils/formatters';
import AcoesAniversariante from '../../components/AcoesAniversariante';
import './Dashboard.css';

export default function Dashboard() {
  const [dados, setDados]         = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    try {
      setCarregando(true);
      const { data } = await dashboardAPI.buscarDados();
      if (data.ok) setDados(data.dados);
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err);
    } finally {
      setCarregando(false);
    }
  }

  async function handleAtaImpressa(audienciaId) {
    try {
      await audienciasAPI.marcarAtaImpressa(audienciaId);
      carregarDados(); // Recarrega para remover da lista
    } catch (err) {
      alert('Erro ao registrar ata impressa');
    }
  }

  if (carregando) return <div className="loading">Carregando dashboard...</div>;
  if (!dados) return <div className="lista-vazia">Não foi possível carregar o dashboard.</div>;

  const { contadores } = dados;

  return (
    <div className="dashboard">
      {/* LINHA 1: Contadores rápidos */}
      <div className="dashboard-contadores">
        <CardContador titulo="Prazos Hoje"      valor={contadores.prazos_hoje}       cor="azul"     link="/prazos" />
        <CardContador titulo="Prazos Atrasados" valor={contadores.prazos_atrasados}  cor="vermelho" link="/prazos?status=atrasado" />
        <CardContador titulo="Tarefas"          valor={contadores.tarefas_pendentes} cor="laranja"  link="/tarefas" />
        <CardContador titulo="Tarefas Atrasadas"valor={contadores.tarefas_atrasadas} cor="vermelho" link="/tarefas?atrasadas=1" />
        <CardContador titulo="Audiências Hoje"       valor={contadores.audiencias_hoje}    cor="verde"    link={`/audiencias?data_de=${new Date().toISOString().slice(0,10)}&data_ate=${new Date().toISOString().slice(0,10)}`} />
        <CardContador titulo="Audiências Sem Adv."  valor={contadores.audiencias_sem_adv} cor="laranja"  link="/audiencias" />
        <CardContador titulo="Perícias Hoje"         valor={contadores.pericias_hoje}      cor="roxo"     link="/pericias" />
      </div>

      <div className="dashboard-grid">
        {/* Coluna esquerda */}
        <div>
          {/* Prazos que vencem hoje */}
          <div className="card">
            <div className="card-titulo">⏱️ Prazos vencendo hoje ({dados.prazos_hoje.length})</div>
            {dados.prazos_hoje.length === 0
              ? <p className="lista-vazia">Nenhum prazo para hoje</p>
              : <TabelaPrazos prazos={dados.prazos_hoje} />
            }
          </div>

          {/* Prazos atrasados */}
          {dados.prazos_atrasados.length > 0 && (
            <div className="card">
              <div className="card-titulo">🔴 Prazos atrasados ({dados.prazos_atrasados.length})</div>
              <TabelaPrazos prazos={dados.prazos_atrasados} mostrarAtraso />
            </div>
          )}

          {/* Tarefas pendentes */}
          <div className="card">
            <div className="card-titulo">✅ Tarefas pendentes ({dados.tarefas_pendentes.length})</div>
            {dados.tarefas_pendentes.length === 0
              ? <p className="lista-vazia">Nenhuma tarefa pendente</p>
              : <TabelaTarefas tarefas={dados.tarefas_pendentes} />
            }
          </div>
        </div>

        {/* Coluna direita */}
        <div>
          {/* Aniversariantes de hoje (clientes) — só aparece quando há aniversariantes */}
          {dados.aniversariantes_hoje?.length > 0 && (
            <div className="card">
              <div className="card-titulo">🎂 Aniversariantes de hoje ({dados.aniversariantes_hoje.length})</div>
              <div className="tabela-wrapper">
                <table className="tabela">
                  <thead><tr><th>Nome</th><th>Idade</th><th>Contato</th><th></th></tr></thead>
                  <tbody>
                    {dados.aniversariantes_hoje.map(r => (
                      <tr key={r.id}>
                        <td><strong>{r.nome}</strong></td>
                        <td>{r.idade != null ? `${r.idade} anos` : '—'}</td>
                        <td>{r.telefone || r.email || '—'}</td>
                        <td><AcoesAniversariante pessoa={r} onFeito={carregarDados} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Audiências de hoje e amanhã */}
          <div className="card">
            <div className="card-titulo">⚖️ Audiências</div>
            {dados.audiencias_hoje.length > 0 && (
              <>
                <p className="secao-label">Hoje</p>
                <TabelaAudiencias audiencias={dados.audiencias_hoje} />
              </>
            )}
            {dados.audiencias_amanha.length > 0 && (
              <>
                <p className="secao-label">Amanhã</p>
                <TabelaAudiencias audiencias={dados.audiencias_amanha} />
              </>
            )}
            {dados.audiencias_hoje.length === 0 && dados.audiencias_amanha.length === 0 && (
              <p className="lista-vazia">Nenhuma audiência hoje ou amanhã</p>
            )}
          </div>

          {/* Audiências sem ata */}
          {dados.audiencias_sem_ata.length > 0 && (
            <div className="card">
              <div className="card-titulo">📋 Audiências sem ata ({dados.audiencias_sem_ata.length})</div>
              <div className="lista-sem-ata">
                {dados.audiencias_sem_ata.map(a => (
                  <div key={a.id} className="item-sem-ata">
                    <div>
                      <strong>{a.tipo || 'Audiência'}</strong> — {formatarData(a.data)} {a.hora}
                      <br />
                      <small>{a.pasta_numero_fmt} — {a.pasta_titulo}</small>
                    </div>
                    <div className="item-sem-ata-acoes">
                      <Link to={`/audiencias/${a.id}`} className="btn btn-outline" style={{fontSize:'12px',padding:'4px 10px'}}>
                        Registrar ata
                      </Link>
                      <button
                        className="btn btn-secondary"
                        style={{fontSize:'12px',padding:'4px 10px'}}
                        onClick={() => handleAtaImpressa(a.id)}
                        title="Clique se a ata já foi impressa fisicamente"
                      >
                        Ata impressa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Processos sem movimentação */}
          {dados.processos_sem_movimentacao.length > 0 && (
            <div className="card">
              <div className="card-titulo">⚠️ Processos sem movimentação</div>
              <div className="tabela-wrapper">
                <table className="tabela">
                  <thead>
                    <tr><th>Pasta</th><th>Processo</th><th>Última mov.</th><th>Dias</th></tr>
                  </thead>
                  <tbody>
                    {dados.processos_sem_movimentacao.map(p => (
                      <tr key={p.id}>
                        <td><Link to={`/processos/pastas/${p.pasta_numero_fmt}`}>{p.pasta_numero_fmt}</Link></td>
                        <td>{p.numero || '—'}</td>
                        <td>{formatarData(p.ultima_movimentacao)}</td>
                        <td><span className="badge badge-laranja">{p.dias_sem_movimentacao}d</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Componente: contador resumido no topo
function CardContador({ titulo, valor, cor, link }) {
  return (
    <Link to={link} className={`contador-card contador-${cor}`}>
      <div className="contador-valor">{valor}</div>
      <div className="contador-titulo">{titulo}</div>
    </Link>
  );
}

// Componente: tabela de prazos
function TabelaPrazos({ prazos, mostrarAtraso }) {
  return (
    <div className="tabela-wrapper">
      <table className="tabela">
        <thead>
          <tr>
            <th>Processo</th>
            <th>Prazo</th>
            <th>Vencimento</th>
            {mostrarAtraso && <th>Atraso</th>}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {prazos.map(p => (
            <tr key={p.id}>
              <td>
                <Link to={`/processos/pasta/${p.pasta_id}?aba=prazos&processo=${p.processo_id}`}
                  style={{fontFamily:'monospace',fontSize:'13px'}}>
                  {p.processo_numero || '—'}
                </Link>
              </td>
              <td>{p.descricao || p.subtipo || '—'}</td>
              <td>{formatarData(p.data_vencimento)}</td>
              {mostrarAtraso && <td><span className="badge badge-vermelho">{p.dias_atraso}d</span></td>}
              <td><span className="badge badge-azul">{p.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Componente: tabela de tarefas
function TabelaTarefas({ tarefas }) {
  const PRIORIDADE_BADGE = { urgente: 'badge-vermelho', normal: 'badge-laranja', baixa: 'badge-verde' };
  return (
    <div className="tabela-wrapper">
      <table className="tabela">
        <thead>
          <tr><th>Tarefa</th><th>Prioridade</th><th>Vencimento</th><th>Para</th></tr>
        </thead>
        <tbody>
          {tarefas.map(t => (
            <tr key={t.id}>
              <td>{t.titulo}</td>
              <td><span className={`badge ${PRIORIDADE_BADGE[t.prioridade]}`}>{t.prioridade}</span></td>
              <td>{t.data_vencimento ? formatarData(t.data_vencimento) : '—'}</td>
              <td>{t.atribuida_para_nome || 'Escritório'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Componente: tabela de audiências
function TabelaAudiencias({ audiencias }) {
  return (
    <div className="tabela-wrapper" style={{marginBottom:'12px'}}>
      <table className="tabela">
        <thead>
          <tr><th>Hora</th><th>Tipo</th><th>Processo</th><th>Modalidade</th></tr>
        </thead>
        <tbody>
          {audiencias.map(a => (
            <tr key={a.id}>
              <td>{a.hora}</td>
              <td>{a.tipo || '—'}</td>
              <td><Link to={`/processos/pasta/${a.pasta_id}?aba=audiencias`}>{a.processo_numero || '—'}</Link></td>
              <td><span className={`badge ${a.modalidade === 'virtual' ? 'badge-azul' : 'badge-cinza'}`}>{a.modalidade}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
