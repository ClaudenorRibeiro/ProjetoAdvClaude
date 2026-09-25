// ============================================================
// PÁGINA DE AUDIÊNCIAS
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { audienciasAPI, processosAPI, pessoasAPI, authAPI, calendarioAPI, configuracaoAPI, periciasAPI } from '../../services/api';
import { formatarData, formatarDataHora, hojeLocal, audienciaJaPassou, toTitleCase, validarCPF, mascaraCPF, formatarCPF } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import ModalGerarLote from '../../components/GerarLote';
import MenuAcoes from '../../components/MenuAcoes';
import NumeroProcessoCopiavel from '../../components/NumeroProcessoCopiavel';
import SeletorData from '../../components/ui/SeletorData';
import { ModalAcordo } from '../Financeiro/Financeiro';
import { ModalNovoPrazo } from '../Prazos/Prazos';
import { ModalTarefa } from '../Tarefas/Tarefas';
import ModalPericiaAta from './ModalPericiaAta';
import { EtiquetaCelula, LegendaEtiquetasPessoais, itemEtiquetasSubmenu, useEtiquetasPessoais } from '../../components/Etiquetas';

const STATUS_COR = {
  agendada: 'badge-azul',
  realizada: 'badge-verde',
  adiada: 'badge-laranja',
  cancelada: 'badge-vermelho',
  remarcada: 'badge-cinza',
  acordo: 'badge-verde',
};

// Ordem lógica (também usada para montar o filtro de Status — fonte única, sem duplicar).
const STATUS_LABEL = {
  agendada: 'Agendada',
  adiada: 'Adiada',
  realizada: 'Realizada',
  acordo: 'Acordo',
  remarcada: 'Remarcada',
  cancelada: 'Cancelada',
};
// Status APOSENTADOS: continuam no STATUS_LABEL só para EXIBIR registros antigos que porventura
// os tenham, mas NÃO são oferecidos no filtro (não nascem mais). "adiada" e "acordo" foram
// aposentados como status da audiência (o acordo agora é registrado no Financeiro).
const STATUS_APOSENTADOS = ['adiada', 'acordo'];

function rotuloModalidade(modalidade) {
  if (modalidade === 'virtual') return 'Virtual';
  if (modalidade === 'sem_comparecimento') return 'Sem comparecimento';
  return 'Presencial';
}

// Alerta de data/hora no passado, respeitando o HORÁRIO e o fuso de Brasília.
// data: 'YYYY-MM-DD', hora: 'HH:MM'. Retorna null quando está ok (futuro/agora) ou
// { alerta, obs } quando o momento já passou. Diferencia data retroativa (dia anterior)
// de horário já vencido no próprio dia de hoje. Usado pelos modais de Criar e Editar.
function alertaMomentoPassado(data, hora, sufixoObs = '') {
  if (!data) return null;
  const hojeBr = hojeLocal();                                                                                // YYYY-MM-DD
  const agoraHoraBr = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour12: false }).slice(0, 5); // HH:MM
  const dataFmt = formatarData(data);
  if (data < hojeBr) {
    return {
      alerta: `• Data retroativa: ${dataFmt}`,
      obs: `data retroativa confirmada pelo usuário${sufixoObs} (${dataFmt})`,
    };
  }
  if (data === hojeBr && hora && hora.slice(0, 5) < agoraHoraBr) {
    return {
      alerta: `• Horário já passou: ${dataFmt} às ${hora.slice(0, 5)}`,
      obs: `horário já passado confirmado pelo usuário${sufixoObs} (${dataFmt} às ${hora.slice(0, 5)})`,
    };
  }
  return null;
}

// Inputs nativos de data permitem mudar o dia com a roda do mouse quando têm foco.
// Ao tirar o foco, preservamos a data escolhida e mantemos a rolagem normal da página.
export default function Audiencias() {
  const { temPermissao, ehAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [lista, setLista] = useState([]);
  const { defs: etqDefs, marcar: marcarEtq } = useEtiquetasPessoais('audiencias', lista, setLista);
  const [total, setTotal] = useState(0);

  // Inicializa filtros a partir de query params da URL (ex: vindo do dashboard)
  const params = new URLSearchParams(location.search);
  const [filtros, setFiltros] = useState({
    status: params.get('status') || '',
    data_de: params.get('data_de') || '',
    data_ate: params.get('data_ate') || '',
    pagina: 1,
  });
  const [tipos, setTipos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [modalNova, setModalNova] = useState(false);
  const [modalEditar, setModalEditar] = useState(null); // audiência selecionada para editar
  const [modalEditarLeitura, setModalEditarLeitura] = useState(false); // true = abre em modo somente leitura
  const [modalAta, setModalAta] = useState(null);    // audiência selecionada para registrar ata
  const [modalReverter, setModalReverter] = useState(null); // audiência (Realizada) p/ reverter status — só admin
  const [confirmarExcluir, setConfirmarExcluir] = useState(null); // audiência selecionada para excluir
  const [modalHistorico, setModalHistorico] = useState(null); // audiência selecionada para ver histórico
  const [modalDetalhesAta, setModalDetalhesAta] = useState(null); // consulta operacional da ATA
  const [modalCancelar, setModalCancelar] = useState(null); // audiência selecionada para cancelar
  const [modalRemarcar, setModalRemarcar] = useState(null); // audiência selecionada para remarcar
  const [remarcacaoEmCadastro, setRemarcacaoEmCadastro] = useState(null);
  const [atalhoAtivo, setAtalhoAtivo] = useState('');
  const [ordenacao, setOrdenacao] = useState({ campo: '', direcao: '' });
  // Seleção para geração em lote (IDs das audiências marcadas) + modal do lote
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [loteAberto, setLoteAberto] = useState(false);
  const podeLote = temPermissao('documentos', 'cadastrar'); // quem pode gerar documentos

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await audienciasAPI.listar({ ...filtros, limite: 30, ordenar: ordenacao.campo, direcao: ordenacao.direcao });
      if (data.ok) { setLista(data.dados.registros); setTotal(data.dados.total); }
      setSelecionados(new Set()); // troca de página/filtro zera a seleção (evita IDs de outra página)
    } catch { toast.error('Erro ao carregar audiências'); }
    finally { setCarregando(false); }
  }, [filtros, ordenacao]);

  function alternarOrdenacao(campo) {
    setOrdenacao(atual => atual.campo !== campo
      ? { campo, direcao: 'ASC' }
      : atual.direcao === 'ASC' ? { campo, direcao: 'DESC' }
        : { campo: '', direcao: '' });
  }

  function CabecalhoOrdenavel({ campo, children }) {
    const ativo = ordenacao.campo === campo;
    const indicacao = ativo ? (ordenacao.direcao === 'ASC' ? ' ▲' : ' ▼') : '';
    return <th onClick={() => alternarOrdenacao(campo)} title="Clique para ordenar: crescente, decrescente e ordem padrão"
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', fontSize: '14px' }}>{children}{indicacao}</th>;
  }

  // Só audiências que ainda vão acontecer (agendada/adiada) entram no lote — mesma regra do botão individual.
  const elegivelLote = (a) => a.status === 'agendada' || a.status === 'adiada';
  const idsElegiveis = lista.filter(elegivelLote).map(a => a.id);
  const todosSelecionados = idsElegiveis.length > 0 && idsElegiveis.every(id => selecionados.has(id));

  function alternarSelecao(id) {
    setSelecionados(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function alternarTodos() {
    setSelecionados(s => {
      const n = new Set(s);
      if (todosSelecionados) idsElegiveis.forEach(id => n.delete(id));
      else idsElegiveis.forEach(id => n.add(id));
      return n;
    });
  }

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    audienciasAPI.tipos().then(r => { if (r.data.ok) setTipos(r.data.dados); });
  }, []);

  async function marcarAtaImpressa(id) {
    try {
      await audienciasAPI.marcarAtaImpressa(id);
      toast.success('Ata marcada como impressa!');
      carregar();
    } catch { toast.error('Erro ao atualizar'); }
  }

  async function excluirAudiencia(id) {
    try {
      await audienciasAPI.excluir(id);
      toast.success('Audiência excluída com sucesso!');
      carregar();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao excluir audiência'); }
  }

  // Editar: só audiências agendadas ou adiadas; realizadas/acordo só admin
  function podeEditar(a) {
    if (['cancelada', 'remarcada'].includes(a.status)) return false;
    if (['realizada', 'acordo'].includes(a.status) && !ehAdmin) return false;
    return temPermissao('audiencias', 'alterar');
  }

  // Excluir: cancelada/remarcada só ADMIN e só quando NÃO tem amarração (ata/testemunha);
  // realizadas/acordo só admin; demais exigem a permissão de excluir.
  function podeExcluir(a) {
    if (['cancelada', 'remarcada'].includes(a.status)) {
      return ehAdmin && !a.tem_ata && !a.tem_testemunha;
    }
    if (['realizada', 'acordo'].includes(a.status) && !ehAdmin) return false;
    return temPermissao('audiencias', 'excluir');
  }

  function setFiltro(k, v) { setAtalhoAtivo(''); setFiltros(f => ({ ...f, [k]: v, pagina: 1 })); }

  function setDataInicialFiltro(data) {
    setAtalhoAtivo(''); setFiltros(f => ({ ...f, data_de: data, data_ate: data, pagina: 1 }));
  }

  function limparFiltros() {
    setAtalhoAtivo(''); setFiltros({ status: '', data_de: '', data_ate: '', etiqueta: '', pagina: 1 });
  }

  function filtrarHoje() {
    const data = hojeLocal();
    setAtalhoAtivo('hoje');
    setFiltros(f => ({ ...f, data_de: data, data_ate: data, pagina: 1 }));
  }

  async function filtrarProximosDiasUteis(quantidade) {
    try {
      const { data } = await calendarioAPI.calcularPeriodoUtil(hojeLocal(), quantidade);
      if (data.ok) {
        setAtalhoAtivo(`${quantidade}uteis`);
        setFiltros(f => ({ ...f, data_de: data.dados.data_inicial, data_ate: data.dados.data_final, pagina: 1 }));
      }
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Não foi possível calcular o período de dias úteis');
    }
  }

  return (
    <div>
      {/* Filtros */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Status</label>
            <select className="form-control" value={filtros.status} onChange={e => setFiltro('status', e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(STATUS_LABEL)
                .filter(([valor]) => !STATUS_APOSENTADOS.includes(valor))
                .map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>{rotulo}</option>
                ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Data de</label>
            <SeletorData value={filtros.data_de} onChange={setDataInicialFiltro} ariaLabel="Data inicial" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Até</label>
            <SeletorData value={filtros.data_ate} onChange={v => setFiltro('data_ate', v)} ariaLabel="Data final" />
          </div>
          <button className="btn btn-outline" style={{ marginBottom: '1px' }} onClick={limparFiltros}>Limpar filtros</button>
          <button className={`btn ${atalhoAtivo === 'hoje' ? 'btn-primary' : 'btn-outline'}`} style={{ marginBottom: '1px' }} onClick={filtrarHoje}>Hoje</button>
          <button className={`btn ${atalhoAtivo === '7uteis' ? 'btn-primary' : 'btn-outline'}`} style={{ marginBottom: '1px' }} onClick={() => filtrarProximosDiasUteis(7)}>7 dias úteis</button>
          <button className={`btn ${atalhoAtivo === '30uteis' ? 'btn-primary' : 'btn-outline'}`} style={{ marginBottom: '1px' }} onClick={() => filtrarProximosDiasUteis(30)}>30 dias úteis</button>
          <button className="btn btn-primary" style={{ marginBottom: '1px' }}
            onClick={() => setModalNova(true)}>
            + Nova Audiência
          </button>
          {/* Geração em lote — só para quem pode gerar documentos; habilita ao marcar audiências */}
          {podeLote && (
            <button className="btn btn-outline" style={{ marginBottom: '1px' }}
              disabled={selecionados.size === 0}
              onClick={() => setLoteAberto(true)}>
              📄 Gerar em lote{selecionados.size ? ` (${selecionados.size})` : ''}
            </button>
          )}
          <span style={{ marginLeft: 'auto', color: '#888', fontSize: '13px', marginBottom: '1px' }}>
            {total} audiência(s)
          </span>
        </div>
      </div>

      <div className="card">
        <LegendaEtiquetasPessoais definicoes={etqDefs} filtroAtivo={filtros.etiqueta}
          onFiltrar={(slot) => setFiltro('etiqueta', slot)} />
        {carregando ? <div className="loading">Carregando...</div> : (
          <div className="tabela-wrapper" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <table className="tabela tabela-sticky">
              <thead>
                <tr>
                  {podeLote && (
                    <th style={{ width: '32px' }}>
                      {/* Marca/desmarca todas as audiências elegíveis da página */}
                      <input type="checkbox" checked={todosSelecionados}
                        onChange={alternarTodos} disabled={idsElegiveis.length === 0}
                        title="Selecionar todas (agendadas/adiadas)" />
                    </th>
                  )}
                  <CabecalhoOrdenavel campo="processo">Processo</CabecalhoOrdenavel>
                  <CabecalhoOrdenavel campo="pasta">Pasta</CabecalhoOrdenavel>
                  <CabecalhoOrdenavel campo="titulo">Título do Processo</CabecalhoOrdenavel>
                  <CabecalhoOrdenavel campo="tipo">Tipo</CabecalhoOrdenavel>
                  <CabecalhoOrdenavel campo="data_hora">Data / Hora</CabecalhoOrdenavel>
                  <CabecalhoOrdenavel campo="modalidade">Modalidade</CabecalhoOrdenavel>
                  <CabecalhoOrdenavel campo="responsavel">Responsável</CabecalhoOrdenavel>
                  <CabecalhoOrdenavel campo="status">Status</CabecalhoOrdenavel>
                  <th style={{ textAlign: 'center', fontSize: '14px' }}>Etiq. Pessoal</th><th style={{ fontSize: '14px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(a => (
                  <tr key={a.id} style={{ fontSize: '14px' }}>
                    {podeLote && (
                      <td>
                        {/* Caixinha só nas audiências elegíveis (agendada/adiada) */}
                        {elegivelLote(a) && (
                          <input type="checkbox" checked={selecionados.has(a.id)}
                            onChange={() => alternarSelecao(a.id)} />
                        )}
                      </td>
                    )}
                    <td>
                      {a.processo_numero && a.pasta_id
                        ? <NumeroProcessoCopiavel numero={a.processo_numero}
                          href={`/processos/pasta/${a.pasta_id}`}
                          onAbrir={() => navigate(`/processos/pasta/${a.pasta_id}`)} />
                        : (a.processo_numero || '—')
                      }
                    </td>
                    <td style={{ fontSize: '14px' }}>{a.pasta_numero_fmt || '—'}</td>
                    <td style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.pasta_titulo
                        ? <span
                          style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', fontSize: '14px' }}
                          title="Ver detalhes da audiência"
                          onClick={() => { setModalEditar(a); setModalEditarLeitura(true); }}>
                          {a.pasta_titulo}
                        </span>
                        : '—'}
                    </td>
                    <td>{a.tipo_nome || '—'}</td>
                    <td>
                      {/*  <strong>{formatarData(a.data)}</strong> */}
                      <strong style={{ fontSize: '17px', color: '#333' }}>{formatarData(a.data)}</strong>
                      <div style={{ fontSize: '17px', color: '#333', fontWeight: 700 }}>{a.hora?.slice(0, 5)}</div>
                    </td>
                    <td>
                      <span className={`badge ${a.modalidade === 'virtual' ? 'badge-azul' : 'badge-cinza'}`}>
                        {rotuloModalidade(a.modalidade)}
                      </span>
                    </td>
                    <td style={{ fontSize: '14px' }}>{a.responsavel_nome || '—'}</td>
                    <td>
                      <span className={`badge ${STATUS_COR[a.status] || 'badge-cinza'}`}>
                        {STATUS_LABEL[a.status] || a.status}
                      </span>
                      {a.ata_impressa === 1 && (
                        <span className="badge badge-verde" style={{ marginLeft: '4px', fontSize: '10px' }}>
                          Impressa
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <EtiquetaCelula slot={a.etiqueta_pessoal} definicoes={etqDefs} />
                    </td>
                    <td>
                      <MenuAcoes itens={[
                        itemEtiquetasSubmenu({
                          definicoes: etqDefs, slotAtual: a.etiqueta_pessoal,
                          onMarcar: (slot) => marcarEtq(a.id, slot)
                        }),
                        // Registrar o resultado/ata só após o horário, em status pendente e com a permissão de ATA.
                        { label: a.modalidade === 'sem_comparecimento' ? 'Registrar resultado' : 'Registrar ata', icone: '📝', oculto: !((a.status === 'agendada' || a.status === 'adiada') && audienciaJaPassou(a.data, a.hora) && temPermissao('audiencias.ata', 'visualizar')), onClick: () => setModalAta(a) },
                        { label: 'Gerar documento', icone: '📄', oculto: !temPermissao('documentos', 'cadastrar') || ['remarcada', 'cancelada'].includes(a.status), gerarDoc: { ancoraTipo: 'audiencia', ancoraId: a.id } },
                        { label: 'Cancelar', icone: '✖', oculto: !((a.status === 'agendada' || a.status === 'adiada') && temPermissao('audiencias', 'alterar')), onClick: () => setModalCancelar(a) },
                        { label: 'Remarcar', icone: '🔁', oculto: !((a.status === 'agendada' || a.status === 'adiada') && temPermissao('audiencias', 'alterar')), onClick: () => setModalRemarcar(a) },
                        { label: 'Marcar impressa', icone: '🖨️', oculto: !(['realizada', 'adiada', 'acordo', 'cancelada'].includes(a.status) && !a.ata_impressa && temPermissao('audiencias.ata', 'visualizar')), onClick: () => marcarAtaImpressa(a.id) },
                        { label: 'Reverter status', icone: '↩️', oculto: !(a.status === 'realizada' && ehAdmin), onClick: () => setModalReverter(a) },
                        { label: 'Editar', icone: '✏️', oculto: !podeEditar(a), onClick: () => { setModalEditar(a); setModalEditarLeitura(false); } },
                        { label: 'Histórico', icone: '📋', onClick: () => setModalHistorico(a) },
                        { label: a.modalidade === 'sem_comparecimento' ? 'Detalhes do resultado' : 'Detalhes da ATA', icone: '📝', oculto: !a.tem_ata, onClick: () => setModalDetalhesAta(a) },
                        { label: 'Excluir', icone: '🗑️', perigo: true, oculto: !podeExcluir(a), onClick: () => setConfirmarExcluir(a) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && <p className="lista-vazia">Nenhuma audiência encontrada</p>}
          </div>
        )}

        {/* Paginação */}
        {Math.ceil(total / 30) > 1 && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'center' }}>
            <button className="btn btn-outline" disabled={filtros.pagina === 1}
              onClick={() => setFiltros(f => ({ ...f, pagina: f.pagina - 1 }))}>← Anterior</button>
            <span style={{ padding: '8px 12px', fontSize: '13px' }}>Página {filtros.pagina}</span>
            <button className="btn btn-outline"
              onClick={() => setFiltros(f => ({ ...f, pagina: f.pagina + 1 }))}>Próxima →</button>
          </div>
        )}
      </div>

      {/* Modal nova audiência */}
      {(modalNova || remarcacaoEmCadastro) && (
        <ModalNovaAudiencia tipos={tipos}
          remarcacao={remarcacaoEmCadastro}
          onTiposChange={() => audienciasAPI.tipos().then(r => { if (r.data.ok) setTipos(r.data.dados); })}
          onFechar={(reload) => { setModalNova(false); setRemarcacaoEmCadastro(null); if (reload) carregar(); }} />
      )}

      {/* Modal editar audiência (também abre em modo somente leitura ao clicar no título do processo) */}
      {modalEditar && (
        <ModalEditarAudiencia
          audiencia={modalEditar}
          tipos={tipos}
          somenteLeitura={modalEditarLeitura}
          podeEditar={podeEditar(modalEditar)}
          onTiposChange={() => audienciasAPI.tipos().then(r => { if (r.data.ok) setTipos(r.data.dados); })}
          onFechar={(reload) => { setModalEditar(null); setModalEditarLeitura(false); if (reload) carregar(); }}
        />
      )}

      {/* Modal registrar ata */}
      {modalAta && (
        <ModalRegistrarAta audiencia={modalAta}
          tipos={tipos}
          onTiposChange={() => audienciasAPI.tipos().then(r => { if (r.data.ok) setTipos(r.data.dados); })}
          onFechar={(reload) => { setModalAta(null); if (reload) carregar(); }} />
      )}

      {/* Modal reverter status (só admin) */}
      {modalReverter && (
        <ModalReverterStatus audiencia={modalReverter}
          onFechar={(reload) => { setModalReverter(null); if (reload) carregar(); }} />
      )}

      {/* Modal cancelar audiência */}
      {modalCancelar && (
        <ModalCancelarAudiencia
          audiencia={modalCancelar}
          onFechar={(reload) => { setModalCancelar(null); if (reload) carregar(); }}
        />
      )}

      {/* Modal remarcar audiência */}
      {modalRemarcar && (
        <ModalRemarcarAudiencia
          audiencia={modalRemarcar}
          onContinuar={(audiencia, motivo) => { setModalRemarcar(null); setRemarcacaoEmCadastro({ audiencia, motivo }); }}
          onFechar={(reload) => { setModalRemarcar(null); if (reload) carregar(); }}
        />
      )}

      {/* Modal histórico de alterações */}
      {modalHistorico && (
        <ModalHistoricoAudiencia
          audiencia={modalHistorico}
          onFechar={() => setModalHistorico(null)}
        />
      )}

      {modalDetalhesAta && (
        <ModalDetalhesAta audiencia={modalDetalhesAta} onFechar={() => setModalDetalhesAta(null)} />
      )}

      {/* Confirmação de exclusão */}
      {confirmarExcluir && (
        <ModalConfirmar
          titulo="Excluir Audiência"
          mensagem={
            ['realizada', 'adiada', 'acordo'].includes(confirmarExcluir.status)
              ? `Esta audiência possui ata registrada (${STATUS_LABEL[confirmarExcluir.status]}).\n\nComo administrador, você pode excluí-la permanentemente. Esta ação não pode ser desfeita.`
              : `A audiência de ${formatarData(confirmarExcluir.data)} às ${confirmarExcluir.hora?.slice(0, 5)} será excluída permanentemente. Esta ação não pode ser desfeita.`
          }
          textoBotao="Excluir"
          tipo="perigo"
          acao={async () => { await excluirAudiencia(confirmarExcluir.id); }}
          onCancelar={() => setConfirmarExcluir(null)}
        />
      )}

      {/* Geração de documentos em lote (audiências marcadas) */}
      {loteAberto && (
        <ModalGerarLote ancoraTipo="audiencia" ancoraIds={[...selecionados]}
          onFechar={() => setLoteAberto(false)} />
      )}
    </div>
  );
}

// ============================================================
// Modal para CANCELAR audiência — solicita motivo obrigatório
// ============================================================
export function ModalCancelarAudiencia({ audiencia, onFechar }) {
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!motivo.trim()) return toast.error('Motivo do cancelamento é obrigatório');
    setSalvando(true);
    try {
      await audienciasAPI.cancelar(audiencia.id, { motivo });
      toast.success('Audiência cancelada com sucesso!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao cancelar audiência'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Cancelar Audiência</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
            Audiência de <strong>{formatarData(audiencia.data)}</strong> às <strong>{audiencia.hora?.slice(0, 5)}</strong>.
            <br />Esta ação não pode ser desfeita — a audiência ficará no histórico como cancelada.
          </p>
          <div className="form-group">
            <label className="form-label">Motivo do cancelamento *</label>
            <textarea className="form-control" rows={3} value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Descreva o motivo do cancelamento..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Voltar</button>
          <button className="btn btn-danger" onClick={salvar} disabled={salvando}>
            {salvando ? 'Cancelando...' : 'Confirmar Cancelamento'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Modal para REMARCAR audiência — coleta o motivo antes de abrir o cadastro
// pré-preenchido. A mudança de status só acontece junto com o salvamento final.
// ============================================================
export function ModalRemarcarAudiencia({ audiencia, onFechar, onContinuar }) {
  const [form, setForm] = useState({ motivo: '' });
  const [salvando, setSalvando] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function salvar() {
    if (!form.motivo.trim()) return toast.error('Motivo é obrigatório');
    setSalvando(true);
    try {
      const { data } = await audienciasAPI.buscar(audiencia.id);
      if (!data.ok) throw new Error('Não foi possível carregar a audiência');
      onContinuar?.(data.dados, form.motivo);
    } catch (err) { toast.error(err.response?.data?.mensagem || err.message || 'Erro ao preparar a remarcação'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Remarcar Audiência</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
            Informe o motivo e confirme os dados da nova audiência. A audiência atual só será marcada como
            <strong> Remarcada</strong> quando a nova for salva com sucesso.
          </p>
          <div className="form-group">
            <label className="form-label">Motivo da remarcação *</label>
            <textarea className="form-control" rows={2} value={form.motivo}
              onChange={e => set('motivo', e.target.value)}
              placeholder="Ex: Pedido de adiamento pela parte contrária..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Voltar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Remarcando...' : 'Confirmar Remarcação'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Modal de histórico de alterações de uma audiência
// Exibe todos os registros da tabela auditoria_audiencia
// ============================================================
function ModalDetalhesAta({ audiencia, onFechar }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const ehSemComparecimento = audiencia.modalidade === 'sem_comparecimento';

  useEffect(() => {
    audienciasAPI.detalhesAta(audiencia.id)
      .then(({ data }) => { if (data.ok) setDados(data.dados); })
      .catch(() => toast.error(ehSemComparecimento ? 'Não foi possível carregar os detalhes do resultado.' : 'Não foi possível carregar os detalhes da ATA.'))
      .finally(() => setCarregando(false));
  }, [audiencia.id]);

  const ROTULO = {
    prazo: 'Prazo', pericia: 'Perícia', nova_audiencia: 'Nova audiência', acordo: 'Acordo',
    tarefa_alvara: 'Tarefa de alvará', tarefa_desistencia: 'Tarefa de desistência',
    desistencia: 'Desistência da ação', retorno_autos: 'Retorno aos autos', testemunha: 'Testemunha',
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande" style={{ maxWidth: 820 }}>
        <div className="modal-header">
          <h3>{ehSemComparecimento ? 'Detalhes do resultado' : 'Detalhes da ATA'} — {formatarData(audiencia.data)} {audiencia.hora?.slice(0, 5)}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {carregando ? <div className="loading">Carregando...</div> : !dados ? (
            <p className="lista-vazia">{ehSemComparecimento ? 'Não há resultado disponível para este ato.' : 'Não há detalhes disponíveis para esta ATA.'}</p>
          ) : <>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13 }}>
              <div><strong>Processo:</strong> {dados.ata.processo_numero} &nbsp; <strong>Pasta:</strong> {String(dados.ata.pasta_numero || '').padStart(4, '0')}</div>
              <div style={{ marginTop: 5 }}><strong>Registrada por:</strong> {dados.ata.criado_por_nome || '—'} em {formatarDataHora(dados.ata.criado_em)}</div>
              <div style={{ marginTop: 5 }}><strong>{ehSemComparecimento ? 'Responsável pelo acompanhamento:' : 'Advogado(a) acompanhante:'}</strong> {dados.ata.advogado_nome || 'Não informado'}</div>
              {dados.ata.resultado && dados.ata.resultado !== 'realizada' && <div style={{ marginTop: 8 }}><strong>{ehSemComparecimento ? 'O que aconteceu no ato processual:' : 'Resumo / termos:'}</strong><br />{dados.ata.resultado}</div>}
              {dados.ata.observacoes && <div style={{ marginTop: 8 }}><strong>Observações:</strong><br />{dados.ata.observacoes}</div>}
            </div>
            <h4 style={{ fontSize: 14, margin: '0 0 8px' }}>{ehSemComparecimento ? 'Providências geradas por este ato' : 'Registros e providências desta ATA'}</h4>
            {dados.itens.length === 0 ? <p className="lista-vazia">{ehSemComparecimento ? 'Este ato não gerou providências vinculadas.' : 'Esta ATA não gerou registros vinculados.'}</p> : (
              <div style={{ display: 'grid', gap: 8 }}>
                {dados.itens.map(item => <div key={item.id} style={{ border: '1px solid #dbeafe', background: '#eff6ff', borderRadius: 6, padding: '9px 11px' }}>
                  <strong style={{ color: '#1d4ed8', fontSize: 13 }}>{ROTULO[item.tipo] || item.tipo}</strong>
                  <div style={{ marginTop: 3, fontSize: 14 }}>{item.titulo}</div>
                  {item.descricao && <div style={{ marginTop: 3, fontSize: 13, color: '#475569', whiteSpace: 'pre-wrap' }}>{item.descricao}</div>}
                  {item.data_referencia && <div style={{ marginTop: 3, fontSize: 12, color: '#64748b' }}>Data: {formatarData(item.data_referencia)}</div>}
                </div>)}
              </div>
            )}
          </>}
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onFechar}>Fechar</button></div>
      </div>
    </div>
  );
}

export function ModalHistoricoAudiencia({ audiencia, onFechar }) {
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        const { data } = await audienciasAPI.historico(audiencia.id);
        if (data.ok) setRegistros(data.dados);
      } catch { /* silencioso */ }
      finally { setCarregando(false); }
    }
    carregar();
  }, [audiencia.id]);

  // Mapa de nomes legíveis para os campos técnicos
  const CAMPO_LABEL = {
    cadastrado: 'Cadastrado',
    criacao: 'Criação',
    tipo_audiencia_id: 'Tipo de audiência',
    data: 'Data',
    hora: 'Hora',
    modalidade: 'Modalidade',
    vara_id: 'Local (vara)',
    plataforma_virtual: 'Plataforma virtual',
    link_virtual: 'Link virtual',
    responsavel_id: 'Responsável',
    motivo_status: 'Motivo da remarcação',
    cancelada: 'Cancelamento',
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>Histórico — {audiencia.processo_numero || 'Audiência'}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {carregando ? (
            <div className="loading">Carregando...</div>
          ) : registros.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
              Nenhuma alteração registrada para esta audiência.
            </p>
          ) : (
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Data / Hora</th>
                    <th>Usuário</th>
                    <th>Campo</th>
                    <th>Valor anterior</th>
                    <th>Valor novo</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map(r => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                        {r.alterado_em
                          ? formatarDataHora(r.alterado_em)
                          : '—'}
                      </td>
                      <td style={{ fontSize: '13px' }}>{r.usuario_nome || '—'}</td>
                      <td style={{ fontSize: '13px', fontWeight: 500 }}>
                        {CAMPO_LABEL[r.campo_alterado] || r.campo_alterado}
                      </td>
                      <td style={{ fontSize: '12px', color: '#dc2626', maxWidth: '200px', wordBreak: 'break-word' }}>
                        {r.valor_anterior || <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                      <td style={{ fontSize: '12px', color: '#16a34a', maxWidth: '200px', wordBreak: 'break-word' }}>
                        {r.valor_novo || <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

// Modal para criar nova audiência
// ============================================================
// MODAL CADASTRO RÁPIDO DE PESSOA — abre a partir do campo de testemunhas
// Cria registro em pessoas_fisicas com os campos principais
// Campos trabalhistas (PIS/CTPS) e filiação ficam para completar depois em Pessoas
// ============================================================
function ModalCadastroRapidoPessoa({ onFechar, onSalvo }) {
  const [form, setForm] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [auxiliares, setAux] = useState({ generos: [], estados_civis: [], profissoes: [] });
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [confirmar, setConfirmar] = useState(null); // aviso "campos sem informação" (igual ao cadastro de Pessoas)

  useEffect(() => {
    pessoasAPI.auxiliares().then(r => { if (r.data.ok) setAux(r.data.dados); }).catch(() => { });
  }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Busca CEP via ViaCEP e preenche endereço automaticamente
  async function buscarCep(cep) {
    const limpo = cep.replace(/\D/g, '');
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const dados = await resp.json();
      if (!dados.erro) {
        setForm(f => ({
          ...f,
          logradouro: dados.logradouro || '',
          bairro: dados.bairro || '',
          cidade: dados.localidade || '',
          estado: dados.uf || '',
        }));
      }
    } catch { /* silencioso */ }
    finally { setBuscandoCep(false); }
  }

  // Gravação efetiva (chamada direto ou após o usuário confirmar o aviso de dados faltando).
  async function executarSalvar() {
    setSalvando(true);
    try {
      const { data } = await pessoasAPI.criarFisica(form);
      if (data.ok) {
        toast.success('Pessoa cadastrada com sucesso!');
        onSalvo({ id: data.dados.id, nome: form.nome, telefone: '' });
      }
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao cadastrar pessoa'); }
    finally { setSalvando(false); }
  }

  function salvar() {
    // ── Obrigatórios (mesma regra do cadastro de Pessoas): nome completo + CPF ──
    if (!form.nome?.trim()) return toast.error('Nome é obrigatório');
    const partes = form.nome.trim().split(/\s+/).filter(Boolean);
    if (partes.length < 2) return toast.error('Informe o nome completo (nome e sobrenome)');
    const cpfLimpo = form.cpf?.replace(/\D/g, '') || '';
    if (!cpfLimpo) return toast.error('CPF é obrigatório');
    if (!validarCPF(cpfLimpo)) return toast.error('CPF inválido');

    // ── Validação de formato (só se preenchido): data de nascimento não pode ser futura ──
    const hoje = hojeLocal();
    if (form.data_nascimento && form.data_nascimento > hoje)
      return toast.error('Data de nascimento não pode ser uma data futura');

    // ── Campos opcionais vazios → aviso antes de salvar (idêntico ao cadastro de Pessoas) ──
    const vazios = [];
    if (!form.data_nascimento) vazios.push('Data de nascimento');
    if (!form.genero_id) vazios.push('Gênero');
    if (!form.estado_civil_id) vazios.push('Estado civil');
    if (!form.profissao_id) vazios.push('Profissão');

    if (vazios.length) {
      setConfirmar({
        titulo: 'Campos sem informação',
        mensagem: `Os campos ${vazios.join(', ')} ficarão sem informação. Deseja salvar assim mesmo?`,
        textoBotao: 'Salvar assim',
        tipo: 'aviso',
        acao: executarSalvar,
      });
      return;
    }
    return executarSalvar();
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>Cadastrar Pessoa (Testemunha)</h3>
          <button className="modal-fechar" onClick={() => onFechar()}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
            Campos trabalhistas e filiação podem ser completados depois em <strong>Pessoas</strong>.
          </p>

          {/* Nome */}
          <div className="form-group">
            <label className="form-label">Nome completo *</label>
            <input className="form-control" value={form.nome || ''} onChange={e => set('nome', e.target.value)} />
          </div>

          {/* CPF + RG + Órgão + Data Nasc + Gênero */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">CPF</label>
              <input className="form-control" value={form.cpf || ''} placeholder="000.000.000-00"
                onChange={e => set('cpf', mascaraCPF(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Data de nascimento</label>
              <input type="date" className="form-control" value={form.data_nascimento || ''}
                onChange={e => set('data_nascimento', e.target.value)} onWheel={impedirAlteracaoDataPorRoda} />
            </div>
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">RG</label>
              <input className="form-control" value={form.rg || ''} onChange={e => set('rg', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Órgão Expedidor</label>
              <input className="form-control" value={form.rg_orgao || ''} placeholder="SSP/SP"
                onChange={e => set('rg_orgao', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Gênero</label>
              <select className="form-control" value={form.genero_id || ''} onChange={e => set('genero_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {auxiliares.generos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Estado Civil + Profissão */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Estado civil</label>
              <select className="form-control" value={form.estado_civil_id || ''} onChange={e => set('estado_civil_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {auxiliares.estados_civis.map(ec => <option key={ec.id} value={ec.id}>{ec.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Profissão</label>
              <select className="form-control" value={form.profissao_id || ''} onChange={e => set('profissao_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {auxiliares.profissoes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Endereço — autoComplete="off" evita o navegador oferecer "salvar endereço" */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">CEP {buscandoCep && <small style={{ color: '#3b82f6' }}>(buscando...)</small>}</label>
              <input className="form-control" autoComplete="off" value={form.cep || ''} placeholder="00000-000"
                onChange={e => set('cep', e.target.value)}
                onBlur={e => buscarCep(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Logradouro</label>
              <input className="form-control" autoComplete="off" value={form.logradouro || ''} onChange={e => set('logradouro', e.target.value)} />
            </div>
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Número</label>
              <input className="form-control" autoComplete="off" value={form.numero || ''} onChange={e => set('numero', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Complemento</label>
              <input className="form-control" autoComplete="off" value={form.complemento || ''} placeholder="Apto, sala..."
                onChange={e => set('complemento', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Bairro</label>
              <input className="form-control" autoComplete="off" value={form.bairro || ''} onChange={e => set('bairro', e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Cidade</label>
              <input className="form-control" autoComplete="off" value={form.cidade || ''} onChange={e => set('cidade', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <input className="form-control" autoComplete="off" value={form.estado || ''} placeholder="SP" maxLength={2}
                onChange={e => set('estado', e.target.value.toUpperCase())} />
            </div>
          </div>

          {/* Observações */}
          <div className="form-group">
            <label className="form-label">Observações</label>
            <textarea className="form-control" rows={2} value={form.observacoes || ''}
              onChange={e => set('observacoes', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar()}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Cadastrando...' : 'Cadastrar e Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SEÇÃO DE TESTEMUNHAS — reutilizada em ModalNovaAudiencia e ModalEditarAudiencia
// processoId: ID do processo para filtrar partes (autor/réu não podem ser testemunhas)
// testemunhas: [{ id, nome, telefone, polo }]
// onChange: função chamada quando a lista muda
// ============================================================
function SecaoTestemunhas({ processoId, testemunhas, onChange, somenteLeitura = false, onPendenteChange }) {
  const [busca, setBusca] = useState('');
  const [sugestoes, setSugestoes] = useState([]);
  const [partes, setPartes] = useState([]);
  const [pendente, setPendente] = useState(null); // pessoa selecionada aguardando a parte específica
  const [modalCadastro, setModalCadastro] = useState(false);
  const campoRef = useRef(null); // caixa do campo de busca
  const listaRef = useRef(null); // lista de sugestões (para saber a altura real)

  // As Testemunhas ficam no FIM do formulário, então a lista de sugestões nascia embaixo
  // do rodapé do modal e o usuário não via os nomes. Assim que a lista abre, o modal rola
  // só o necessário para ela caber. O espaçador (renderizado junto com a lista, logo
  // abaixo) garante que exista espaço para rolar — sem ele não há para onde descer.
  useEffect(() => {
    if (!sugestoes.length) return;
    const caixa = campoRef.current;
    const corpo = caixa && caixa.closest('.modal-body'); // a área que rola dentro do modal
    if (!caixa || !corpo) return;
    const alturaLista = listaRef.current ? listaRef.current.offsetHeight : 150;
    const folga = 12;
    const excedente = (caixa.getBoundingClientRect().bottom + alturaLista + folga)
      - corpo.getBoundingClientRect().bottom;
    if (excedente > 0) corpo.scrollBy({ top: excedente, behavior: 'smooth' });
  }, [sugestoes]);

  // Avisa o modal quando há (ou deixou de haver) uma testemunha aguardando qualificação de polo,
  // para o "Salvar" poder bloquear e pedir que o usuário escolha Autor/Réu (ou cancele) antes.
  useEffect(() => { onPendenteChange?.(!!pendente); }, [pendente]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega partes do processo para bloquear na busca e remover da lista existente
  useEffect(() => {
    if (!processoId) { setPartes([]); return; }
    audienciasAPI.partesProcesso(processoId)
      .then(r => {
        if (r.data.ok) {
          const partesProcesso = r.data.dados || [];
          const ids = partesProcesso.map(p => Number(p.pessoa_id));
          setPartes(partesProcesso);
          // Remove da lista qualquer testemunha que seja parte do processo
          const filtradas = testemunhas.filter(t => !ids.includes(Number(t.id)));
          if (filtradas.length !== testemunhas.length) onChange(filtradas);
        }
      })
      .catch(() => { });
  }, [processoId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function buscarPessoas(termo) {
    if (termo.length < 2) { setSugestoes([]); return; }
    try {
      // selecao: 1 → procura só por nome/CPF (sem endereço) e traz quem começa pelo termo primeiro.
      const { data } = await pessoasAPI.listarFisicas({ busca: termo, limite: 15, selecao: 1 });
      if (data.ok) {
        const idsJaAdicionados = testemunhas.map(t => t.id);
        // Filtra: remove partes do processo e já adicionadas
        setSugestoes(
          (data.dados.registros || []).filter(p =>
            !partes.some(parte => Number(parte.pessoa_id) === Number(p.id)) && !idsJaAdicionados.includes(p.id)
          )
        );
      }
    } catch { /* silencioso */ }
  }

  function selecionarPessoa(p) {
    setSugestoes([]);
    setBusca('');
    // Abre mini-seletor de polo antes de adicionar
    setPendente({ id: p.id, nome: p.nome, telefone: p.telefone || '' });
  }

  function confirmarParte(parte) {
    onChange([...testemunhas, { ...pendente, parte_pessoa_id: parte.pessoa_id, parte_nome: parte.nome, polo: parte.polo }]);
    setPendente(null);
  }

  function remover(id) {
    onChange(testemunhas.filter(t => t.id !== id));
  }

  return (
    <div className="form-group">
      <label className="form-label">Testemunhas</label>

      {/* Busca + botão cadastrar nova pessoa (escondido no modo somente leitura) */}
      {!somenteLeitura && (
        <>
          <div style={{ display: 'flex', gap: '6px' }}>
            <div style={{ position: 'relative', flex: 1 }} ref={campoRef}>
              <input className="form-control"
                placeholder="Buscar pessoa cadastrada para adicionar como testemunha..."
                value={busca}
                onChange={e => { setBusca(e.target.value); buscarPessoas(e.target.value); }} />
              {sugestoes.length > 0 && (
                <div ref={listaRef} style={{ position: 'absolute', zIndex: 100, width: '100%', border: '1px solid #ddd', borderRadius: '6px', marginTop: '2px', maxHeight: '150px', overflowY: 'auto', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  {sugestoes.map(p => (
                    <div key={p.id}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #f0f0f0' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                      onClick={() => selecionarPessoa(p)}>
                      {p.nome}
                      {/* Sem CPF é comum na base — deixa claro que falta o dado, em vez de
                      mostrar só o nome (que parece "o sistema não achou o CPF"). */}
                      {p.cpf
                        ? <span style={{ color: '#64748b' }}> — CPF {formatarCPF(p.cpf)}</span>
                        : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}> — sem CPF</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Botão para cadastrar nova pessoa que ainda não está no sistema */}
            <button type="button" title="Cadastrar nova pessoa"
              style={{ padding: '0 12px', border: '1px solid #ddd', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer', fontSize: '16px', whiteSpace: 'nowrap' }}
              onClick={() => setModalCadastro(true)}>…</button>
          </div>
          {/* Espaço temporário só enquanto a lista está aberta: dá ao modal o quanto rolar
          para mostrar as sugestões. Some junto com a lista, sem deixar buraco na tela. */}
          {sugestoes.length > 0 && <div style={{ height: '170px' }} aria-hidden="true" />}
        </>
      )}

      {/* Sem testemunhas no modo leitura — deixa claro que não há */}
      {somenteLeitura && testemunhas.length === 0 && (
        <div style={{ fontSize: '13px', color: '#94a3b8' }}>Nenhuma testemunha cadastrada.</div>
      )}

      {/* A parte é específica: nunca se deduz pelo polo. */}
      {pendente && (
        <div style={{ margin: '8px 0', padding: '12px', background: '#f0f7ff', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
            {pendente.nome} — Testemunha de quem?
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {partes.map(parte => <button key={parte.pessoa_id} type="button" className="btn btn-sm btn-primary" onClick={() => confirmarParte(parte)}>
              {parte.nome} ({parte.polo === 'autor' ? 'Autor' : 'Réu'})
            </button>)}
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setPendente(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de testemunhas adicionadas */}
      {testemunhas.length > 0 && (
        <div style={{ marginTop: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
          {testemunhas.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{t.nome}</span>
                <span style={{ color: '#64748b' }}>de {t.parte_nome || 'pessoa não identificada (cadastro antigo)'}</span>
                <span className={`badge ${t.polo === 'autor' ? 'badge-azul' : 'badge-roxo'}`}
                  style={t.polo !== 'autor' ? { background: '#7c3aed', color: '#fff' } : {}}>
                  {t.polo === 'autor' ? 'Testem. Autor' : 'Testem. Réu'}
                </span>
              </div>
              {!somenteLeitura && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button type="button" onClick={() => remover(t.id)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal de cadastro rápido de nova pessoa */}
      {modalCadastro && (
        <ModalCadastroRapidoPessoa
          onFechar={() => setModalCadastro(false)}
          onSalvo={(novaPessoa) => { setModalCadastro(false); selecionarPessoa(novaPessoa); }}
        />
      )}
    </div>
  );
}

// Modal de confirmação de senha para agendamento em dia não útil
function ModalConfirmarSenhaDiaUtil({ descricao, onCancelar, onConfirmar }) {
  const [senha, setSenha] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  async function confirmar() {
    if (!senha) return toast.error('Digite sua senha para confirmar');
    setConfirmando(true);
    try {
      const { data } = await authAPI.verificarSenha({ senha });
      if (data.ok) {
        await onConfirmar();
      }
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Senha incorreta');
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box" style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <h3>⚠️ Data não é dia útil</h3>
          <button className="modal-fechar" onClick={onCancelar}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '16px', color: '#555', fontSize: '14px' }}>
            <strong>{descricao}</strong>. Não há expediente forense nesta data.
          </p>
          <p style={{ marginBottom: '16px', color: '#555', fontSize: '14px' }}>
            Para agendar mesmo assim, confirme sua identidade digitando sua senha:
          </p>
          <div className="form-group">
            <label className="form-label">Sua senha *</label>
            <input type="password" className="form-control" value={senha}
              onChange={e => setSenha(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmar()}
              autoFocus autoComplete="current-password" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-danger" onClick={confirmar} disabled={confirmando}>
            {confirmando ? 'Verificando...' : 'Confirmar e Agendar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CampoResponsaveis({ advogados, valores, onChange, disabled = false, onNovoFreela }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const seletorRef = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    function fecharAoClicarFora(event) {
      if (!seletorRef.current?.contains(event.target)) setAberto(false);
    }
    document.addEventListener('mousedown', fecharAoClicarFora);
    return () => document.removeEventListener('mousedown', fecharAoClicarFora);
  }, [aberto]);

  function alternar(valor) {
    onChange(valores.includes(valor) ? valores.filter(v => v !== valor) : [...valores, valor]);
  }
  const grupos = [
    ['Advogados do escritório', advogados.filter(a => a.origem === 'usuario' && a.nome?.toLowerCase().includes(busca.toLowerCase())), 'usuario'],
    ['Freelancers', advogados.filter(a => a.origem === 'freela' && a.nome?.toLowerCase().includes(busca.toLowerCase())), 'freela'],
  ];
  const selecionados = advogados.filter(a => valores.includes(`${a.origem}:${a.id}`));
  const resumo = selecionados.length
    ? selecionados.map(a => a.nome).join(', ')
    : valores.length ? `${valores.length} responsável(is) selecionado(s)` : 'Escritório (sem advogado definido)';

  return <div ref={seletorRef} style={{ position: 'relative' }}>
    <button type="button" disabled={disabled} onClick={() => setAberto(a => !a)}
      aria-expanded={aberto} aria-haspopup="listbox"
      title={selecionados.length ? resumo : 'Selecionar responsável pela condução'}
      style={{ width: '100%', minHeight: '38px', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: '6px',
        background: disabled ? '#f3f4f6' : '#fff', color: selecionados.length ? '#334155' : '#64748b',
        cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '8px', textAlign: 'left', fontFamily: 'inherit', fontSize: '12px' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumo}</span>
      {!disabled && <span aria-hidden="true" style={{ color: '#64748b', fontSize: '14px' }}>{aberto ? '▴' : '▾'}</span>}
    </button>

    {!disabled && aberto && (
      <div role="listbox" aria-label="Responsáveis pela condução"
        style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
          maxHeight: '260px', overflowY: 'auto', padding: '8px 9px', border: '1px solid #bfdbfe',
          borderRadius: '6px', background: '#fff', boxShadow: '0 5px 14px rgba(15,23,42,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>{valores.length ? `${valores.length} responsável(is) selecionado(s)` : 'Nenhum responsável selecionado'}</span>
          {onNovoFreela && <button type="button" onClick={() => { setAberto(false); onNovoFreela(); }} title="Cadastrar advogado freelancer" style={{ border: 0, background: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '12px' }}>+ Freelancer</button>}
        </div>
        <input className="form-control" aria-label="Pesquisar responsáveis pela condução"
          value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Pesquisar por nome..." style={{ marginBottom: '7px', fontSize: '13px' }} />
        {grupos.map(([titulo, lista, origem]) => lista.length > 0 && <div key={origem} style={{ marginTop: '7px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>{titulo}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 12px' }}>
            {lista.map(a => {
              const valor = `${origem}:${a.id}`; return <label key={valor} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={valores.includes(valor)} onChange={() => alternar(valor)} />{a.nome}
              </label>;
            })}
          </div>
        </div>)}
      </div>
    )}
  </div>;
}

// publicacaoId (opcional): vínculo de origem — audiência criada a partir de uma SUGESTÃO de
// publicação (ver Publicacoes.js). Sem publicação de origem, fica de fora normalmente.
export function ModalNovaAudiencia({ tipos, onTiposChange, onFechar, processoInicial, valoresIniciais, publicacaoId, remarcacao, bloquearProcesso = false, onSalvarRascunho }) {
  const { temPermissao } = useAuth();
  const origem = remarcacao?.audiencia;
  // Remarcação e nova audiência criada a partir da ata precisam permanecer no
  // processo de origem; nos demais acessos a troca continua permitida.
  const processoBloqueado = Boolean(remarcacao || bloquearProcesso);
  const processoEfetivo = processoInicial || (origem ? { id: origem.processo_id, numProc: origem.processo_numero, NomeTituloProc: origem.processo_titulo || '', numPasta: origem.pasta_numero, vara_id: origem.vara_id } : null);
  const valoresEfetivos = valoresIniciais || (origem ? { modalidade: origem.modalidade, hora: String(origem.hora || '').slice(0, 5), data: String(origem.data || '').slice(0, 10), tipo_audiencia_id: origem.tipo_audiencia_id, observacoes: origem.observacoes || '', vara_id: origem.vara_id, plataforma_virtual: origem.plataforma_virtual || '', link_virtual: origem.link_virtual || '' } : {});
  const [modalSenhaDiaUtil, setModalSenhaDiaUtil] = useState(null); // { descricao, obs, onConfirm }
  // valoresIniciais (opcional): pré-preenche tipo/modalidade/vara — usado quando a
  // audiência é designada a partir do "Registrar Ata" (copia os dados da audiência realizada)
  // ou a partir de uma SUGESTÃO de publicação (também traz data/hora).
  const [form, setForm] = useState({
    modalidade: valoresEfetivos.modalidade || 'presencial', hora: valoresEfetivos.hora || '', data: valoresEfetivos.data || '', tipo_audiencia_id: valoresEfetivos.tipo_audiencia_id || '', responsaveis: [], observacoes: valoresEfetivos.observacoes || '', plataforma_virtual: valoresEfetivos.plataforma_virtual || '', link_virtual: valoresEfetivos.link_virtual || '', ...(processoEfetivo ? { processo_id: processoEfetivo.id } : {})
  });
  const [salvando, setSalvando] = useState(false);
  // Avisos inline nos campos (aparecem no onBlur)
  const [avisos, setAvisos] = useState({ data: '', hora: '' });
  // Modal de confirmação para dados incomuns
  const [confirmar, setConfirmar] = useState(null);
  // Busca processo — pré-preenchida quando processoInicial é passado
  const [buscaProc, setBuscaProc] = useState(
    processoEfetivo ? `${processoEfetivo.numProc || '(sem nº)'} — ${processoEfetivo.NomeTituloProc || ''}` : ''
  );
  const [sugestoes, setSugestoes] = useState([]);
  const [procSelecionado, setProcSelecionado] = useState(processoEfetivo || null);
  // Advogados (usuários tipo advogado + freelas) para o responsável
  const [advogados, setAdvogados] = useState([]);
  // Testemunhas — [{id, nome, telefone, polo}]
  const [testemunhas, setTestemunhas] = useState([]);
  const [testemunhaPendente, setTestemunhaPendente] = useState(false); // testemunha selecionada sem polo definido
  // Local — vara selecionada. Começa com a vara do próprio processo (quando aberto de um
  // processo), já mostrando o endereço; o usuário pode trocar por outra vara à vontade.
  const [varas, setVaras] = useState([]);
  const [foruns, setForuns] = useState([]);
  const [varaId, setVaraId] = useState(valoresEfetivos.vara_id ?? processoEfetivo?.vara_id ?? null);
  // Modais internos
  const [modalTipos, setModalTipos] = useState(false);
  const [modalNovoFreela, setModalNovoFreela] = useState(false);

  useEffect(() => { carregarAdvogados(); carregarVaras(); }, []);
  useEffect(() => {
    if (origem?.testemunhas?.length) {
      setTestemunhas(origem.testemunhas.map(t => ({ id: t.pessoa_id, nome: t.nome, telefone: t.telefone_principal || '', polo: t.polo || 'autor', parte_pessoa_id: t.parte_pessoa_id || null, parte_nome: t.parte_nome || null })));
    }
  }, [origem]);

  async function carregarAdvogados() {
    const { data } = await audienciasAPI.advogados();
    if (data.ok) setAdvogados(data.dados);
  }

  async function carregarVaras() {
    try {
      const { data } = await processosAPI.auxiliares();
      if (data.ok) {
        setVaras(data.dados.varas || []);
        setForuns(data.dados.foruns || []);
      }
    } catch { /* silencioso — varas são opcionais */ }
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function alterarModalidade(modalidade) {
    set('modalidade', modalidade);
    if (modalidade === 'sem_comparecimento') {
      set('plataforma_virtual', '');
      set('link_virtual', '');
      setVaraId(null);
      setTestemunhas([]);
      setTestemunhaPendente(false);
    }
  }

  // Busca processos por CNJ
  async function buscarProcessos(termo) {
    if (termo.length < 2) { setSugestoes([]); return; }
    const { data } = await processosAPI.buscarPorNumero(termo);
    if (data.ok) setSugestoes(data.dados);
  }
  function selecionarProcesso(proc) {
    const mudouDeProcesso = procSelecionado && Number(procSelecionado.id) !== Number(proc.id);
    setBuscaProc(`${proc.numProc || '(sem nº)'} — ${proc.NomeTituloProc || ''}`);
    setSugestoes([]);
    setProcSelecionado(proc);
    set('processo_id', proc.id);
    // Preenche o "Local da audiência" com a vara do processo (se tiver); o usuário pode trocar.
    setVaraId(proc.vara_id || null);
    // Testemunhas pertencem ao processo anterior e não podem atravessar a troca.
    if (mudouDeProcesso) {
      setTestemunhas([]);
      setTestemunhaPendente(false);
    }
  }

  function alterarBuscaProcesso(valor) {
    // Assim que o usuário altera um processo já selecionado, desfaz todos os vínculos
    // dependentes dele. A nova vara será preenchida ao escolher o processo correto.
    if (procSelecionado) {
      setProcSelecionado(null);
      set('processo_id', null);
      setVaraId(null);
      setTestemunhas([]);
      setTestemunhaPendente(false);
    }
    setBuscaProc(valor);
    buscarProcessos(valor);
  }

  function trocarProcesso() {
    alterarBuscaProcesso('');
    setSugestoes([]);
  }

  // Valida data no blur — exibe aviso inline abaixo do campo
  function validarDataBlur() {
    const passou = alertaMomentoPassado(form.data, form.hora);
    setAvisos(a => ({ ...a, data: passou ? passou.alerta.replace('• ', '') : '' }));
  }

  // Valida hora no blur — exibe aviso inline abaixo do campo
  function validarHoraBlur() {
    if (!form.hora) { setAvisos(a => ({ ...a, hora: '' })); return; }
    const h = parseInt(form.hora.split(':')[0], 10);
    if (h < 8 || h >= 18) {
      setAvisos(a => ({ ...a, hora: `Horário incomum (${form.hora}) — fóruns geralmente atendem das 08h às 18h` }));
    } else {
      setAvisos(a => ({ ...a, hora: '' }));
    }
  }

  // Executa o salvamento efetivo (chamado direto ou após confirmação do usuário)
  async function executarSalvar(obs) {
    setSalvando(true);
    try {
      const dadosSalvar = {
        ...form,
        vara_id: varaId || null,
        testemunhas: testemunhas.map(t => ({ pessoa_id: t.id, parte_pessoa_id: t.parte_pessoa_id || null, polo: t.polo })),
        obs_auditoria: obs.length ? obs.join('; ') : undefined,
        publicacao_id: publicacaoId || null,
      };
      if (onSalvarRascunho) {
        onSalvarRascunho(dadosSalvar);
        onFechar(false);
        return;
      }
      if (remarcacao) await audienciasAPI.remarcar(remarcacao.audiencia.id, { ...dadosSalvar, motivo: remarcacao.motivo });
      else await audienciasAPI.criar(dadosSalvar);
      toast.success(remarcacao ? 'Audiência remarcada com sucesso!' : 'Audiência criada com sucesso!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao criar audiência'); }
    finally { setSalvando(false); }
  }

  async function salvar() {
    if (!form.processo_id) return toast.error('Processo é obrigatório');
    if (!form.tipo_audiencia_id) return toast.error('Tipo de audiência é obrigatório');
    if (!form.data) return toast.error('Data é obrigatória');
    if (!form.hora) return toast.error('Hora é obrigatória');
    if (testemunhaPendente) {
      setConfirmar({
        titulo: 'Testemunha sem qualificação',
        mensagem: 'Há uma testemunha selecionada que ainda não foi qualificada como Autor ou Réu. Escolha o polo dela (ou cancele) antes de salvar.',
        textoBotao: 'Entendi',
        tipo: 'aviso',
        acao: () => { },
      });
      return;
    }

    const h = parseInt(form.hora.split(':')[0], 10);

    const alertas = [];
    const obs = [];

    const passou = alertaMomentoPassado(form.data, form.hora);
    if (passou) { alertas.push(passou.alerta); obs.push(passou.obs); }
    if (h < 8 || h >= 18) {
      alertas.push(`• Horário incomum: ${form.hora} (fóruns geralmente atendem das 08h às 18h)`);
      obs.push(`horário incomum confirmado pelo usuário (${form.hora})`);
    }

    // Verifica se a data é dia útil no calendário do sistema
    try {
      const { data: cal } = await calendarioAPI.verificarDiaUtil(form.data);
      if (cal.ok && !cal.dados.dia_util) {
        const dataFmt = formatarData(form.data);
        const desc = cal.dados.descricao || 'dia não útil';
        // Abre modal de confirmação + senha antes de prosseguir
        setModalSenhaDiaUtil({
          descricao: `${dataFmt} é ${desc}`,
          obs: [...obs, `dia não útil (${desc}) confirmado pelo usuário com senha`],
          alertas,
        });
        return;
      }
    } catch { /* se falhar a verificação, continua normalmente */ }

    // Se houver outros alertas (data retroativa, hora incomum)
    if (alertas.length > 0) {
      setConfirmar({
        titulo: 'Atenção — dados incomuns',
        mensagem: `Foram identificados os seguintes alertas:\n\n${alertas.join('\n')}\n\nDeseja confirmar mesmo assim ou voltar para corrigir?`,
        textoBotao: 'Confirmar mesmo assim',
        tipo: 'aviso',
        acao: async () => { await executarSalvar(obs); }
      });
      return;
    }

    await executarSalvar([]);
  }

  // `temPermissao` só aceita (módulo, ação) — submódulo usa chave composta 'audiencias.tipos'
  // (ver AuthContext.js/backend/middleware/permissoes.js). A chamada com 3 argumentos nunca
  // batia, então quem tinha só a permissão de "Tipos de audiência" (sem ser admin) não via
  // o botão de gerenciar tipos (auditoria 02/09, item 14).
  const podeTipos = temPermissao('audiencias.tipos', 'cadastrar') || temPermissao('audiencias.tipos', 'alterar');
  const ehSemComparecimento = form.modalidade === 'sem_comparecimento';

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande audiencia-detalhe">
        <div className="modal-header">
          <h3>{remarcacao ? 'Remarcar Audiência' : 'Nova Audiência'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">

          {/* Informativo da pasta — só quando veio o número (não vem quando aberto de uma publicação) */}
          {procSelecionado && procSelecionado.numPasta != null && procSelecionado.numPasta !== '' && (
            <div style={{ marginBottom: '10px', fontSize: '17px', color: '#1e2a3a', fontWeight: 700 }}>
              Pasta: {String(procSelecionado.numPasta).padStart(4, '0')}
            </div>
          )}

          {/* Processo pré-selecionado pode ser trocado, exceto em remarcação ou quando a
              nova audiência nasceu do registro da ata da própria audiência. */}
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">Processo *</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input className="form-control" placeholder="Digite o número CNJ ou parte do título..."
                value={buscaProc}
                readOnly={processoBloqueado}
                onChange={e => { if (!processoBloqueado) alterarBuscaProcesso(e.target.value); }} />
              {procSelecionado && !processoBloqueado && (
                <button type="button" className="btn btn-outline" onClick={trocarProcesso}
                  style={{ whiteSpace: 'nowrap' }} title="Limpar e escolher outro processo">
                  Trocar processo
                </button>
              )}
            </div>
            {!processoBloqueado && sugestoes.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 100, width: '100%', border: '1px solid #ddd', borderRadius: '6px', marginTop: '2px', maxHeight: '180px', overflowY: 'auto', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                {sugestoes.map(p => (
                  <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    onClick={() => selecionarProcesso(p)}>
                    <strong>{p.numProc || '(sem nº)'}</strong> — {p.NomeTituloProc}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tipo + Data + Hora */}
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Tipo de audiência *</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <select className="form-control" value={form.tipo_audiencia_id || ''}
                  onChange={e => set('tipo_audiencia_id', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
                {podeTipos && (
                  <button type="button" title="Gerenciar tipos"
                    style={{ padding: '0 10px', border: '1px solid #ddd', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer', fontSize: '16px', whiteSpace: 'nowrap' }}
                    onClick={() => setModalTipos(true)}>…</button>
                )}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Data *</label>
              <SeletorData value={form.data || ''} onChange={v => { set('data', v); setAvisos(a => ({ ...a, data: '' })); }} ariaLabel="Data da audiência" destaque />
              {avisos.data && (
                <small style={{ color: '#d97706', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  ⚠️ {avisos.data}
                </small>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Hora *</label>
              <input type="time" className="form-control" value={form.hora}
                onChange={e => { set('hora', e.target.value); setAvisos(a => ({ ...a, hora: '' })); }}
                onBlur={validarHoraBlur} />
              {avisos.hora && (
                <small style={{ color: '#d97706', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  ⚠️ {avisos.hora}
                </small>
              )}
            </div>
          </div>

          {/* Modalidade + Responsável */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Modalidade</label>
              <select className="form-control" value={form.modalidade}
                onChange={e => alterarModalidade(e.target.value)}>
                <option value="presencial">Presencial</option>
                <option value="virtual">Virtual (online)</option>
                <option value="sem_comparecimento">Sem comparecimento</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{ehSemComparecimento ? 'Responsável pelo acompanhamento' : 'Responsável pela condução'}</label>
              <CampoResponsaveis advogados={advogados} valores={form.responsaveis || []}
                onChange={v => set('responsaveis', v)} onNovoFreela={() => setModalNovoFreela(true)} />
            </div>
          </div>

          {!ehSemComparecimento && (
            <CampoLocalVara
              varas={varas}
              foruns={foruns}
              varaId={varaId}
              onChange={setVaraId}
              onRecarregarVaras={carregarVaras}
            />
          )}

          {/* Plataforma e Link — somente para audiências virtuais */}
          {form.modalidade === 'virtual' && (
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Plataforma</label>
                <input className="form-control" value={form.plataforma_virtual || ''}
                  onChange={e => set('plataforma_virtual', e.target.value)}
                  placeholder="Zoom, Teams, Meet..." />
              </div>
              <div className="form-group">
                <label className="form-label">Link</label>
                <input className="form-control" value={form.link_virtual || ''}
                  onChange={e => set('link_virtual', e.target.value)}
                  placeholder="https://..." />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Obs.</label>
            <textarea className="form-control" rows={3} value={form.observacoes || ''}
              onChange={e => set('observacoes', e.target.value)}
              placeholder="Anotações da audiência (livre). Quando criada de uma publicação, já vem com o texto da sugestão." />
          </div>

          {/* Testemunhas — componente reutilizável com polo e cadastro rápido */}
          {!ehSemComparecimento && (
            <SecaoTestemunhas
              processoId={form.processo_id}
              testemunhas={testemunhas}
              onChange={setTestemunhas}
              onPendenteChange={setTestemunhaPendente}
            />
          )}

        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : remarcacao ? 'Confirmar Remarcação' : 'Criar Audiência'}
          </button>
        </div>
      </div>

      {/* Modal de gerenciamento de tipos — abre por cima */}
      {modalTipos && (
        <ModalGerenciarTipos
          onFechar={() => setModalTipos(false)}
          onAtualizar={onTiposChange}
        />
      )}

      {/* Modal cadastro rápido de freelancer */}
      {modalNovoFreela && (
        <ModalNovoFreela
          onFechar={() => setModalNovoFreela(false)}
          onSalvo={async (novoId) => {
            await carregarAdvogados();
            set('responsaveis', [...(form.responsaveis || []), `freela:${novoId}`]);
            setModalNovoFreela(false);
          }}
        />
      )}

      {/* Modal de confirmação para dados incomuns (data retroativa / hora fora do expediente) */}
      {confirmar && (
        <ModalConfirmar
          {...confirmar}
          onCancelar={() => setConfirmar(null)}
        />
      )}
      {modalSenhaDiaUtil && (
        <ModalConfirmarSenhaDiaUtil
          descricao={modalSenhaDiaUtil.descricao}
          onCancelar={() => setModalSenhaDiaUtil(null)}
          onConfirmar={async () => {
            const obs = modalSenhaDiaUtil.obs;
            const alertas = modalSenhaDiaUtil.alertas;
            setModalSenhaDiaUtil(null);
            if (alertas.length > 0) {
              setConfirmar({
                titulo: 'Atenção — dados incomuns',
                mensagem: `Foram identificados os seguintes alertas:\n\n${alertas.join('\n')}\n\nDeseja confirmar mesmo assim ou voltar para corrigir?`,
                textoBotao: 'Confirmar mesmo assim',
                tipo: 'aviso',
                acao: async () => { await executarSalvar(obs); }
              });
            } else {
              await executarSalvar(obs);
            }
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Modal para EDITAR audiência existente
// Processo é somente leitura — para trocar processo: excluir + criar nova
// Mesmas validações de blur (data retroativa / hora incomum) do modal de criação
// ============================================================
export function ModalEditarAudiencia({ audiencia, tipos, onTiposChange, onFechar, somenteLeitura = false, podeEditar = true }) {
  const { temPermissao, ehAdmin } = useAuth();
  // leitura = true → todos os campos travados e rodapé só com "Editar"/"Fechar".
  // Ao clicar em "Editar" (quando permitido), destrava para o modo de edição normal.
  const [leitura, setLeitura] = useState(somenteLeitura);
  const [form, setForm] = useState({ modalidade: 'presencial' });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [avisos, setAvisos] = useState({ data: '', hora: '' });
  const [confirmar, setConfirmar] = useState(null);
  const [modalSenhaDiaUtil, setModalSenhaDiaUtil] = useState(null);
  // Advogados (usuários + freelas)
  const [advogados, setAdvogados] = useState([]);
  // Testemunhas — formato {id, nome, polo, telefone}
  const [testemunhas, setTestemunhas] = useState([]);
  const [testemunhaPendente, setTestemunhaPendente] = useState(false); // testemunha selecionada sem polo definido
  // Local — vara selecionada
  const [varas, setVaras] = useState([]);
  const [foruns, setForuns] = useState([]);
  const [varaId, setVaraId] = useState(null);
  // Modais internos
  const [modalTipos, setModalTipos] = useState(false);
  const [modalNovoFreela, setModalNovoFreela] = useState(false);

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    setCarregando(true);
    try {
      const [rAdv, rAud, rAux] = await Promise.all([
        audienciasAPI.advogados(),
        audienciasAPI.buscar(audiencia.id),
        processosAPI.auxiliares(),
      ]);
      if (rAdv.data.ok) setAdvogados(rAdv.data.dados);
      if (rAux.data.ok) {
        setVaras(rAux.data.dados.varas || []);
        setForuns(rAux.data.dados.foruns || []);
      }

      if (rAud.data.ok) {
        const d = rAud.data.dados;
        const responsaveis = (d.responsaveis?.length ? d.responsaveis : [d]).map(r =>
          r.responsavel_id ? `usuario:${r.responsavel_id}` : r.responsavel_freela_id ? `freela:${r.responsavel_freela_id}` : ''
        ).filter(Boolean);

        setForm({
          tipo_audiencia_id: d.tipo_audiencia_id || '',
          data: d.data?.split('T')[0] || '',
          hora: d.hora?.slice(0, 5) || '',
          modalidade: d.modalidade || 'presencial',
          plataforma_virtual: d.plataforma_virtual || '',
          link_virtual: d.link_virtual || '',
          observacoes: d.observacoes || '',
          responsaveis,
          pasta_numero: d.pasta_numero || '',
        });

        // Pré-popula a vara selecionada
        if (d.vara_id) setVaraId(d.vara_id);

        // Pré-carrega testemunhas no formato esperado pelo SecaoTestemunhas
        if (d.testemunhas?.length) {
          setTestemunhas(d.testemunhas.map(t => ({
            id: t.pessoa_id,
            nome: t.nome,
            polo: t.polo || 'autor',
            telefone: t.telefone_principal || '',
            parte_pessoa_id: t.parte_pessoa_id || null,
            parte_nome: t.parte_nome || null,
          })));
        }
      }
    } catch { toast.error('Erro ao carregar dados da audiência'); }
    finally { setCarregando(false); }
  }

  async function recarregarVaras() {
    try {
      const { data } = await processosAPI.auxiliares();
      if (data.ok) {
        setVaras(data.dados.varas || []);
        setForuns(data.dados.foruns || []);
      }
    } catch { /* silencioso */ }
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function alterarModalidade(modalidade) {
    set('modalidade', modalidade);
    if (modalidade === 'sem_comparecimento') {
      set('plataforma_virtual', '');
      set('link_virtual', '');
      setVaraId(null);
    }
  }

  // ---- Validações de blur (iguais ao modal de criação) ----
  function validarDataBlur() {
    const passou = alertaMomentoPassado(form.data, form.hora);
    setAvisos(a => ({ ...a, data: passou ? passou.alerta.replace('• ', '') : '' }));
  }

  function validarHoraBlur() {
    if (!form.hora) { setAvisos(a => ({ ...a, hora: '' })); return; }
    const h = parseInt(form.hora.split(':')[0], 10);
    if (h < 8 || h >= 18) {
      setAvisos(a => ({ ...a, hora: `Horário incomum (${form.hora}) — fóruns geralmente atendem das 08h às 18h` }));
    } else {
      setAvisos(a => ({ ...a, hora: '' }));
    }
  }

  // ---- Salvamento ----
  async function executarSalvar(obs) {
    setSalvando(true);
    try {
      await audienciasAPI.atualizar(audiencia.id, {
        ...form,
        vara_id: varaId || null,
        testemunhas: testemunhas.map(t => ({ pessoa_id: t.id, parte_pessoa_id: t.parte_pessoa_id || null, polo: t.polo || 'autor' })),
        obs_auditoria: obs.length ? obs.join('; ') : undefined,
      });
      toast.success('Audiência atualizada com sucesso!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao atualizar audiência'); }
    finally { setSalvando(false); }
  }

  async function salvar() {
    if (!form.tipo_audiencia_id) return toast.error('Tipo de audiência é obrigatório');
    if (!form.data) return toast.error('Data é obrigatória');
    if (!form.hora) return toast.error('Hora é obrigatória');
    if (testemunhaPendente) {
      setConfirmar({
        titulo: 'Testemunha sem qualificação',
        mensagem: 'Há uma testemunha selecionada que ainda não foi qualificada como Autor ou Réu. Escolha o polo dela (ou cancele) antes de salvar.',
        textoBotao: 'Entendi',
        tipo: 'aviso',
        acao: () => { },
      });
      return;
    }

    const h = parseInt(form.hora.split(':')[0], 10);

    const alertas = [];
    const obs = [];

    const passou = alertaMomentoPassado(form.data, form.hora, ' na edição');
    if (passou) { alertas.push(passou.alerta); obs.push(passou.obs); }
    if (h < 8 || h >= 18) {
      alertas.push(`• Horário incomum: ${form.hora} (fóruns geralmente atendem das 08h às 18h)`);
      obs.push(`horário incomum confirmado pelo usuário na edição (${form.hora})`);
    }

    // Verifica se a data é dia útil no calendário do sistema
    try {
      const { data: cal } = await calendarioAPI.verificarDiaUtil(form.data);
      if (cal.ok && !cal.dados.dia_util) {
        const dataFmt = formatarData(form.data);
        const desc = cal.dados.descricao || 'dia não útil';
        setModalSenhaDiaUtil({
          descricao: `${dataFmt} é ${desc}`,
          obs: [...obs, `dia não útil (${desc}) confirmado pelo usuário com senha na edição`],
          alertas,
        });
        return;
      }
    } catch { /* se falhar a verificação, continua normalmente */ }

    if (alertas.length > 0) {
      setConfirmar({
        titulo: 'Atenção — dados incomuns',
        mensagem: `Foram identificados os seguintes alertas:\n\n${alertas.join('\n')}\n\nDeseja confirmar mesmo assim ou voltar para corrigir?`,
        textoBotao: 'Confirmar mesmo assim',
        tipo: 'aviso',
        acao: async () => { await executarSalvar(obs); },
      });
      return;
    }

    await executarSalvar([]);
  }

  // `temPermissao` só aceita (módulo, ação) — submódulo usa chave composta 'audiencias.tipos'
  // (ver AuthContext.js/backend/middleware/permissoes.js). A chamada com 3 argumentos nunca
  // batia, então quem tinha só a permissão de "Tipos de audiência" (sem ser admin) não via
  // o botão de gerenciar tipos (auditoria 02/09, item 14).
  const podeTipos = temPermissao('audiencias.tipos', 'cadastrar') || temPermissao('audiencias.tipos', 'alterar');

  if (carregando) {
    return (
      <div className="modal-overlay">
        <div className="modal-box modal-grande">
          <div className="modal-body" style={{ textAlign: 'center', padding: '40px' }}>
            Carregando dados...
          </div>
        </div>
      </div>
    );
  }

  const ehSemComparecimento = form.modalidade === 'sem_comparecimento';

  return (
    <div className="modal-overlay">
      <div className={`modal-box modal-grande audiencia-detalhe ${leitura ? 'audiencia-leitura' : ''}`}>
        <div className="modal-header">
          <h3>{leitura ? 'Detalhes da Audiência' : 'Editar Audiência'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">

          {/* Aviso se audiência tem ata e é admin editando */}
          {audiencia.ata_resultado && ehAdmin && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#92400e' }}>
              ⚠️ Esta audiência possui ata registrada. Alterações são permitidas apenas para administradores e ficam registradas no histórico.
            </div>
          )}

          {/* Processo — somente leitura */}
          {(form.pasta_numero || audiencia.pasta_numero_fmt) && (
            <div style={{ marginBottom: '10px', fontSize: '17px', color: '#1e2a3a', fontWeight: 700 }}>
              Pasta: {String(form.pasta_numero || audiencia.pasta_numero_fmt).padStart(4, '0')}
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Processo</label>
            <div style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', color: '#111827', fontWeight: 600 }}>
              {audiencia.processo_numero || '(sem número)'} — {audiencia.pasta_titulo || ''}
            </div>
            <small style={{ color: '#94a3b8', fontSize: '12px' }}>
              Para alterar o processo, exclua esta audiência e crie uma nova.
            </small>
          </div>

          {/* Tipo + Data + Hora */}
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Tipo de audiência *</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <select className="form-control" value={form.tipo_audiencia_id || ''} disabled={leitura}
                  onChange={e => set('tipo_audiencia_id', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
                {podeTipos && !leitura && (
                  <button type="button" title="Gerenciar tipos"
                    style={{ padding: '0 10px', border: '1px solid #ddd', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer', fontSize: '16px', whiteSpace: 'nowrap' }}
                    onClick={() => setModalTipos(true)}>…</button>
                )}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Data *</label>
              <SeletorData value={form.data || ''} disabled={leitura} ariaLabel="Data da audiência" destaque
                onChange={v => { set('data', v); setAvisos(a => ({ ...a, data: '' })); }} />
              {avisos.data && (
                <small style={{ color: '#d97706', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  ⚠️ {avisos.data}
                </small>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Hora *</label>
              <input type="time" className="form-control" value={form.hora || ''} disabled={leitura}
                onChange={e => { set('hora', e.target.value); setAvisos(a => ({ ...a, hora: '' })); }}
                onBlur={validarHoraBlur} />
              {avisos.hora && (
                <small style={{ color: '#d97706', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  ⚠️ {avisos.hora}
                </small>
              )}
            </div>
          </div>

          {/* Modalidade + Responsável */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Modalidade</label>
              <select className="form-control" value={form.modalidade} disabled={leitura}
                onChange={e => alterarModalidade(e.target.value)}>
                <option value="presencial">Presencial</option>
                <option value="virtual">Virtual (online)</option>
                <option value="sem_comparecimento">Sem comparecimento</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{ehSemComparecimento ? 'Responsável pelo acompanhamento' : 'Responsável pela condução'}</label>
              <CampoResponsaveis advogados={advogados} valores={form.responsaveis || []} disabled={leitura}
                onChange={v => set('responsaveis', v)} onNovoFreela={() => setModalNovoFreela(true)} />
            </div>
          </div>

          {!ehSemComparecimento && (
            <CampoLocalVara
              varas={varas}
              foruns={foruns}
              varaId={varaId}
              onChange={setVaraId}
              onRecarregarVaras={recarregarVaras}
              somenteLeitura={leitura}
            />
          )}

          {/* Plataforma e Link — somente para audiências virtuais */}
          {form.modalidade === 'virtual' && (
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Plataforma</label>
                <input className="form-control" value={form.plataforma_virtual || ''} disabled={leitura}
                  onChange={e => set('plataforma_virtual', e.target.value)}
                  placeholder="Zoom, Teams, Meet..." />
              </div>
              <div className="form-group">
                <label className="form-label">Link</label>
                <input className="form-control" value={form.link_virtual || ''} disabled={leitura}
                  onChange={e => set('link_virtual', e.target.value)}
                  placeholder="https://..." />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Obs.</label>
            <textarea className="form-control" rows={3} value={form.observacoes || ''} disabled={leitura}
              onChange={e => set('observacoes', e.target.value)}
              placeholder="Anotações da audiência (livre)." />
          </div>

          {ehSemComparecimento && testemunhas.length > 0 ? (
            <div style={{ background: '#fff4e5', border: '1px solid #ffcf99', color: '#8a5300', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}>
              Esta audiência possui testemunhas vinculadas. Para usar a modalidade sem comparecimento, volte para presencial ou virtual, remova as testemunhas e salve antes de alterar a modalidade.
            </div>
          ) : !ehSemComparecimento && (
            <SecaoTestemunhas
              processoId={audiencia.processo_id}
              testemunhas={testemunhas}
              onChange={setTestemunhas}
              somenteLeitura={leitura}
              onPendenteChange={setTestemunhaPendente}
            />
          )}

        </div>
        <div className="modal-footer">
          {leitura ? (
            <>
              <button className="btn btn-secondary" onClick={() => onFechar(false)}>Fechar</button>
              {podeEditar && (
                <button className="btn btn-primary" onClick={() => setLeitura(false)}>Editar</button>
              )}
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Modais internos */}
      {modalTipos && (
        <ModalGerenciarTipos
          onFechar={() => setModalTipos(false)}
          onAtualizar={onTiposChange}
        />
      )}
      {modalNovoFreela && (
        <ModalNovoFreela
          onFechar={() => setModalNovoFreela(false)}
          onSalvo={async (novoId) => {
            const { data } = await audienciasAPI.advogados();
            if (data.ok) setAdvogados(data.dados);
            set('responsaveis', [...(form.responsaveis || []), `freela:${novoId}`]);
            setModalNovoFreela(false);
          }}
        />
      )}
      {confirmar && (
        <ModalConfirmar
          {...confirmar}
          onCancelar={() => setConfirmar(null)}
        />
      )}
      {modalSenhaDiaUtil && (
        <ModalConfirmarSenhaDiaUtil
          descricao={modalSenhaDiaUtil.descricao}
          onCancelar={() => setModalSenhaDiaUtil(null)}
          onConfirmar={async () => {
            const obs = modalSenhaDiaUtil.obs;
            const alertas = modalSenhaDiaUtil.alertas;
            setModalSenhaDiaUtil(null);
            if (alertas.length > 0) {
              setConfirmar({
                titulo: 'Atenção — dados incomuns',
                mensagem: `Foram identificados os seguintes alertas:\n\n${alertas.join('\n')}\n\nDeseja confirmar mesmo assim ou voltar para corrigir?`,
                textoBotao: 'Confirmar mesmo assim',
                tipo: 'aviso',
                acao: async () => { await executarSalvar(obs); },
              });
            } else {
              await executarSalvar(obs);
            }
          }}
        />
      )}
    </div>
  );
}

// Modal para cadastrar freelancer rapidamente
export function ModalNovoFreela({ onFechar, onSalvo, profissoes = [], exigirProfissao = false, titulo = 'Novo Freelancer' }) {
  const [form, setForm] = useState({ nome: '', oab: '', profissao_id: '', email: '', telefone: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' });
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState('');
  const [aviso, setAviso] = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Máscara de telefone (99) 99999-9999
  function mascaraTel(v) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
    return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
  }

  // Máscara CEP e busca ViaCEP
  function mascaraCEP(v) {
    const d = v.replace(/\D/g, '').slice(0, 8);
    return d.replace(/(\d{5})(\d)/, '$1-$2');
  }
  async function buscarCep(cep) {
    const limpo = cep.replace(/\D/g, '');
    if (limpo.length < 8) { setErroCep('CEP incompleto'); return; }
    setBuscandoCep(true); setErroCep('');
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const dados = await resp.json();
      if (dados.erro) { setErroCep('CEP não encontrado'); return; }
      setForm(f => ({ ...f, logradouro: dados.logradouro || '', bairro: dados.bairro || '', cidade: dados.localidade || '', estado: dados.uf || '' }));
    } catch { setErroCep('Erro ao consultar CEP'); }
    finally { setBuscandoCep(false); }
  }

  async function salvar() {
    if (!form.nome.trim()) { setAviso('Informe o nome do freelancer.'); return; }
    if (exigirProfissao && !form.profissao_id) { setAviso('Selecione a profissão do freelancer.'); return; }
    if (!form.email.trim()) { setAviso('Informe o e-mail do freelancer.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setAviso('Informe um e-mail válido.'); return; }
    setSalvando(true);
    try {
      const { data } = await audienciasAPI.criarFreela(form);
      toast.success('Freelancer cadastrado');
      onSalvo(data.dados.id);
    } catch (err) { setAviso(err.response?.data?.mensagem || 'Não foi possível cadastrar. Tente novamente.'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3>{titulo}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {aviso && (
            <div style={{
              background: '#fff4e5', border: '1px solid #ffcf99', color: '#8a5300',
              padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px'
            }}>
              {aviso}
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Nome *</label>
            <input className="form-control" value={form.nome}
              onChange={e => set('nome', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">E-mail *</label>
            <input className="form-control" type="email" placeholder="nome@exemplo.com"
              value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Profissão{exigirProfissao ? ' *' : ''}</label>
            <select className="form-control" value={form.profissao_id} onChange={e => set('profissao_id', e.target.value)}>
              <option value="">— Não informada —</option>
              {profissoes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">OAB</label>
              <input className="form-control" placeholder="Ex: SP 123456"
                value={form.oab} onChange={e => set('oab', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefone</label>
              <input className="form-control" placeholder="(00) 00000-0000"
                value={form.telefone}
                onChange={e => set('telefone', mascaraTel(e.target.value))} />
            </div>
          </div>

          {/* Endereço com CEP + busca automática — autoComplete="off" evita "salvar endereço" */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">CEP</label>
              <input className="form-control" autoComplete="off" placeholder="00000-000" maxLength={9}
                value={form.cep}
                onChange={e => { setErroCep(''); set('cep', mascaraCEP(e.target.value)); }}
                onBlur={e => buscarCep(e.target.value)} />
              {buscandoCep && <small style={{ color: '#888', fontSize: '12px' }}>🔍 Buscando...</small>}
              {erroCep && <small style={{ color: '#e74c3c', fontSize: '12px' }}>⚠️ {erroCep}</small>}
            </div>
            <div className="form-group">
              <label className="form-label">Logradouro</label>
              <input className="form-control" autoComplete="off" value={form.logradouro}
                onChange={e => set('logradouro', e.target.value)} />
            </div>
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Número</label>
              <input className="form-control" autoComplete="off" value={form.numero}
                onChange={e => set('numero', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Complemento</label>
              <input className="form-control" autoComplete="off" value={form.complemento}
                onChange={e => set('complemento', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Bairro</label>
              <input className="form-control" autoComplete="off" value={form.bairro}
                onChange={e => set('bairro', e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Cidade</label>
              <input className="form-control" autoComplete="off" value={form.cidade}
                onChange={e => set('cidade', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <input className="form-control" autoComplete="off" maxLength={2} value={form.estado}
                onChange={e => set('estado', e.target.value.toUpperCase())} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal para gerenciar tipos de audiência
function ModalGerenciarTipos({ onFechar, onAtualizar }) {
  const [tipos, setTipos] = useState([]);
  const [novoNome, setNovoNome] = useState('');
  const [editando, setEditando] = useState(null); // { id, nome }
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    const { data } = await audienciasAPI.tipos();
    if (data.ok) setTipos(data.dados);
  }

  async function adicionar() {
    if (!novoNome.trim()) return toast.error('Digite o nome do tipo');
    setSalvando(true);
    try {
      await audienciasAPI.criarTipo({ nome: novoNome.trim() });
      setNovoNome('');
      await carregar();
      onAtualizar && onAtualizar();
      toast.success('Tipo adicionado');
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao adicionar'); }
    finally { setSalvando(false); }
  }

  async function salvarEdicao() {
    if (!editando?.nome.trim()) return toast.error('Nome não pode ser vazio');
    setSalvando(true);
    try {
      await audienciasAPI.atualizarTipo(editando.id, { nome: editando.nome.trim() });
      setEditando(null);
      await carregar();
      onAtualizar && onAtualizar();
      toast.success('Tipo atualizado');
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao atualizar'); }
    finally { setSalvando(false); }
  }

  async function excluir(id) {
    setSalvando(true);
    try {
      await audienciasAPI.excluirTipo(id);
      await carregar();
      onAtualizar && onAtualizar();
      toast.success('Tipo removido');
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Tipo em uso — não pode ser removido'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <h3>Tipos de Audiência</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {/* Adicionar novo tipo */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input className="form-control" placeholder="Novo tipo..."
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && adicionar()} />
            <button className="btn btn-primary" onClick={adicionar} disabled={salvando}
              style={{ whiteSpace: 'nowrap' }}>+ Adicionar</button>
          </div>

          {/* Lista de tipos */}
          {tipos.length === 0
            ? <p className="lista-vazia">Nenhum tipo cadastrado</p>
            : tipos.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: '1px solid #f0f0f0' }}>
                {editando?.id === t.id ? (
                  <>
                    <input className="form-control" value={editando.nome}
                      onChange={e => setEditando(ed => ({ ...ed, nome: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && salvarEdicao()}
                      autoFocus style={{ flex: 1 }} />
                    <button className="btn btn-primary" onClick={salvarEdicao} disabled={salvando}
                      style={{ padding: '4px 10px', fontSize: '12px' }}>✓</button>
                    <button className="btn btn-secondary" onClick={() => setEditando(null)}
                      style={{ padding: '4px 10px', fontSize: '12px' }}>✕</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: '14px' }}>{t.nome}</span>
                    <button onClick={() => setEditando({ id: t.id, nome: t.nome })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', color: '#3b82f6' }}
                      title="Editar">✏️</button>
                    <button onClick={() => excluir(t.id)} disabled={salvando}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', color: '#ef4444' }}
                      title="Remover">🗑️</button>
                  </>
                )}
              </div>
            ))
          }
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Faixa amigável para os recursos da ata ainda em implementação (revelados pelo checkbox,
// codados um a um). Não é o toast do canto — é a faixa interna do sistema.
function FaixaEmBreve({ rotulo }) {
  return (
    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', fontSize: '13px', color: '#1e40af', marginBottom: '6px' }}>
      🔧 <strong>{rotulo}</strong> — recurso em implementação, será liberado em breve.
    </div>
  );
}

// Modal para registrar ata da audiência
export function ModalRegistrarAta({ audiencia, onFechar, tipos, onTiposChange }) {
  // "Registrar Ata" pressupõe que a audiência ACONTECEU → status Realizada. Cancelar/Remarcar são
  // ações à parte; o acordo é registrado pelo modal completo do Financeiro (botão abaixo).
  const [form, setForm] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [modalNovaAud, setModalNovaAud] = useState(null); // dados p/ abrir a Nova Audiência pré-preenchida
  const [novaAudienciaRascunho, setNovaAudienciaRascunho] = useState(null);
  const [modalPrazoAta, setModalPrazoAta] = useState(null);
  const [prazosAta, setPrazosAta] = useState([]);
  const [modalPericiaAta, setModalPericiaAta] = useState(null);
  const [periciasAta, setPericiasAta] = useState([]);
  const [modalTarefaAta, setModalTarefaAta] = useState(null);
  const [tarefasAlvara, setTarefasAlvara] = useState([]);
  const [testemunhasAta, setTestemunhasAta] = useState([]);
  const [processoTestemunhasAta, setProcessoTestemunhasAta] = useState(null);
  const [cadastroTestemunhasAberto, setCadastroTestemunhasAberto] = useState(false);
  const [tarefasDesistencia, setTarefasDesistencia] = useState([]);
  const [motivoDesistencia, setMotivoDesistencia] = useState('');
  const [registrarComentarioRetorno, setRegistrarComentarioRetorno] = useState(false);
  const [comentarioRetorno, setComentarioRetorno] = useState('');
  const [tiposPericia, setTiposPericia] = useState([]);
  const [modelosEmailPerito, setModelosEmailPerito] = useState([]);
  const [abrindoNova, setAbrindoNova] = useState(false);
  const [modalAcordo, setModalAcordo] = useState(null); // { processoId, descricaoInicial }
  const [abrindoAcordo, setAbrindoAcordo] = useState(false);
  const [acordoRegistrado, setAcordoRegistrado] = useState(false); // marca que houve acordo (registro na ata)
  const [confirmarNovoAcordo, setConfirmarNovoAcordo] = useState(false);
  const ehSemComparecimento = audiencia.modalidade === 'sem_comparecimento';
  // "O que teve nessa audiência?" — cada checkbox revela um recurso (antes oculto) e é gravado na ata.
  const [itens, setItens] = useState({
    prazo: false, pericia: false, acordo: false, nova_audiencia: false,
    alvara: false, desistencia: false, retorno_autos: false, testemunha: false,
  });
  // Ao desmarcar um item, apaga o rascunho correspondente — ele só existe em memória
  // até a ata ser registrada, então desmarcar precisa desfazer o que foi preenchido.
  // "Acordo" fica de fora: ele é gravado de verdade no Financeiro na hora do cadastro
  // (não é rascunho), então a caixinha só decide se entra na descrição da ata.
  function limparDadosItem(chave) {
    if (chave === 'prazo') setPrazosAta([]);
    else if (chave === 'pericia') setPericiasAta([]);
    else if (chave === 'alvara') setTarefasAlvara([]);
    else if (chave === 'desistencia') { setTarefasDesistencia([]); setMotivoDesistencia(''); }
    else if (chave === 'retorno_autos') { setRegistrarComentarioRetorno(false); setComentarioRetorno(''); }
    else if (chave === 'nova_audiencia') setNovaAudienciaRascunho(null);
    else if (chave === 'testemunha') { setTestemunhasAta([]); setCadastroTestemunhasAberto(false); }
  }
  function toggleItem(k) {
    setItens(i => {
      const ativo = !i[k];
      if (!ativo) limparDadosItem(k);
      return { ...i, [k]: ativo };
    });
  }

  // Advogado(a) que acompanhou a audiência — reusa a fonte unificada (usuários advogados + freelas, com OAB).
  const [advogados, setAdvogados] = useState([]);
  const [advogadoSel, setAdvogadoSel] = useState(''); // '' | 'ninguem' | 'usuario:X' | 'freela:X'
  const [modalNovoFreela, setModalNovoFreela] = useState(false);
  const [aviso, setAviso] = useState(''); // faixa interna de validação

  // Carrega advogados + dados da audiência (pré-preenche com o Responsável pela condução).
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [av, aud] = await Promise.all([
          audienciasAPI.advogados(),
          audienciasAPI.buscar(audiencia.id),
        ]);
        if (!vivo) return;
        if (av.data.ok) setAdvogados(av.data.dados || []);
        if (aud.data.ok) {
          const d = aud.data.dados;
          setProcessoTestemunhasAta(d.processo_id || null);
          if (d.responsavel_id) setAdvogadoSel(`usuario:${d.responsavel_id}`);
          else if (d.responsavel_freela_id) setAdvogadoSel(`freela:${d.responsavel_freela_id}`);
        }
      } catch { /* silencioso: se falhar, o campo apenas começa vazio */ }
    })();
    return () => { vivo = false; };
  }, [audiencia.id]);

  useEffect(() => {
    let vivo = true;
    periciasAPI.tipos()
      .then(({ data }) => { if (vivo && data.ok) setTiposPericia(data.dados || []); })
      .catch(() => { if (vivo) toast.error('Não foi possível carregar os tipos de perícia.'); });
    configuracaoAPI.modelosEmailPerito()
      .then(({ data }) => { if (vivo && data.ok) setModelosEmailPerito(data.dados || []); })
      .catch(() => { if (vivo) setModelosEmailPerito([]); });
    return () => { vivo = false; };
  }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // "Registrar acordo": abre o modal COMPLETO de Acordo (Financeiro) no processo desta audiência,
  // com a descrição já indicando a origem ("Acordo em audiência de dd/mm/aaaa"). Criação independente.
  async function abrirAcordo(confirmadoParaOutro = false) {
    // Acordo é criado no Financeiro, fora da transação da ATA. Depois do primeiro,
    // exige confirmação explícita antes de abrir outro cadastro e evitar duplicidade.
    if (acordoRegistrado && !confirmadoParaOutro) {
      setConfirmarNovoAcordo(true);
      return;
    }
    setAbrindoAcordo(true);
    try {
      const { data } = await audienciasAPI.buscar(audiencia.id);
      if (!data.ok) throw new Error();
      setModalAcordo({
        processoId: data.dados.processo_id,
        descricaoInicial: `Acordo em audiência de ${formatarData(audiencia.data)}`,
      });
    } catch { toast.error('Não foi possível carregar os dados para o acordo'); }
    finally { setAbrindoAcordo(false); }
  }

  // "Designar nova audiência": abre o modal COMPLETO de Nova Audiência já pré-preenchido com os
  // dados desta audiência (processo, tipo, local, modalidade, responsável). A criação é independente
  // (feita pelo próprio modal), como combinado.
  async function abrirNovaAudiencia() {
    setAbrindoNova(true);
    try {
      const { data } = await audienciasAPI.buscar(audiencia.id);
      if (!data.ok) throw new Error();
      const d = data.dados;
      setModalNovaAud({
        processoInicial: {
          id: d.processo_id,
          numProc: d.processo_numero || audiencia.processo_numero || '',
          NomeTituloProc: audiencia.pasta_titulo || '',
          numPasta: audiencia.pasta_numero_fmt || '',
          vara_id: d.vara_id || null,
        },
        valoresIniciais: novaAudienciaRascunho || {
          tipo_audiencia_id: d.tipo_audiencia_id || '',
          modalidade: d.modalidade || 'presencial',
          vara_id: d.vara_id || null,
        },
      });
    } catch { toast.error('Não foi possível carregar os dados para a nova audiência'); }
    finally { setAbrindoNova(false); }
  }

  // O item da lista de audiências não contém todos os identificadores necessários ao prazo.
  // Busca-se o detalhe somente aqui, para o prazo da ATA receber o processo e a pasta corretos.
  async function abrirPrazoAta() {
    try {
      const { data } = await audienciasAPI.buscar(audiencia.id);
      if (!data.ok) throw new Error();
      const d = data.dados;
      setModalPrazoAta({
        processo_id: d.processo_id,
        numero: d.processo_numero || audiencia.processo_numero || '',
        titulo: d.processo_titulo || audiencia.pasta_titulo || '',
        pasta: d.pasta_numero != null && d.pasta_numero !== ''
          ? `Pasta: ${String(d.pasta_numero).padStart(4, '0')}`
          : '',
      });
    } catch {
      toast.error('Não foi possível carregar os dados do processo para o prazo.');
    }
  }

  async function abrirPericiaAta() {
    try {
      const { data } = await audienciasAPI.buscar(audiencia.id);
      if (!data.ok) throw new Error();
      const d = data.dados;
      setModalPericiaAta({
        processo_id: d.processo_id,
        numero: d.processo_numero || audiencia.processo_numero || '',
        titulo: d.processo_titulo || audiencia.pasta_titulo || '',
        pasta: d.pasta_numero != null && d.pasta_numero !== '' ? `Pasta: ${String(d.pasta_numero).padStart(4, '0')}` : '',
      });
    } catch {
      toast.error('Não foi possível carregar os dados do processo para a perícia.');
    }
  }

  // A tarefa do alvará só recebe o processo desta audiência. Os dados ficam em
  // rascunho até o botão final "Registrar ATA", tal como prazos e perícias.
  async function abrirTarefaAta(origem) {
    try {
      const { data } = await audienciasAPI.buscar(audiencia.id);
      if (!data.ok) throw new Error();
      const d = data.dados;
      setModalTarefaAta({
        processo_id: d.processo_id,
        numero: d.processo_numero || audiencia.processo_numero || '',
        pasta: d.pasta_numero != null && d.pasta_numero !== ''
          ? `Pasta: ${String(d.pasta_numero).padStart(4, '0')}` : '',
        origem,
        titulo: origem === 'desistencia' ? 'ATA com Desistência da Ação, tomar providências' : 'ATA com Alvará, tomar providências',
      });
    } catch {
      toast.error('Não foi possível carregar os dados do processo para a tarefa da ATA.');
    }
  }

  async function salvar() {
    setAviso('');
    if (ehSemComparecimento && !String(form.resultado_texto || '').trim()) {
      setAviso('Descreva o que aconteceu no ato processual antes de registrar o resultado.');
      return;
    }
    // Testemunha(s) é complementar: não basta sozinha para concluir a ATA.
    if (!ehSemComparecimento && !['prazo', 'pericia', 'acordo', 'nova_audiencia', 'alvara', 'desistencia', 'retorno_autos'].some(k => itens[k])) {
      setAviso('Selecione ao menos um item da audiência além de testemunha(s) antes de registrar a ata.');
      return;
    }
    // "Ninguém" já é uma escolha válida, mas a ATA sempre exige uma escolha explícita.
    if (!advogadoSel) {
      setAviso(ehSemComparecimento
        ? 'Informe o responsável pelo acompanhamento (ou selecione "Não informado").'
        : 'Informe o advogado que acompanhou a audiência (ou selecione "Ninguém").');
      return;
    }
    if (itens.nova_audiencia && !novaAudienciaRascunho) {
      setAviso('Cadastre os dados da nova audiência ou desmarque essa opção antes de registrar a ata.');
      return;
    }
    if (itens.acordo && !acordoRegistrado) {
      setAviso('Registre o acordo no Financeiro ou desmarque essa opção antes de registrar a ata.');
      return;
    }
    if (itens.prazo && prazosAta.length === 0) {
      setAviso('Cadastre ao menos um prazo ou desmarque essa opção antes de registrar a ata.');
      return;
    }
    if (itens.pericia && periciasAta.length === 0) {
      setAviso('Cadastre ao menos uma perícia ou desmarque essa opção antes de registrar a ata.');
      return;
    }
    if (itens.testemunha && testemunhasAta.length === 0) {
      setAviso('Cadastre ao menos uma testemunha ou desmarque essa opção antes de registrar a ata.');
      return;
    }
    if (itens.alvara && tarefasAlvara.length === 0) {
      setAviso('Cadastre ao menos uma tarefa do alvará ou desmarque essa opção antes de registrar a ata.');
      return;
    }
    if (itens.desistencia && !motivoDesistencia.trim()) {
      setAviso('Informe o motivo da desistência da ação antes de registrar a ata.');
      return;
    }
    if (itens.retorno_autos && registrarComentarioRetorno && !comentarioRetorno.trim()) {
      setAviso('Informe o comentário sobre o retorno aos autos ou escolha não registrá-lo.');
      return;
    }
    setSalvando(true);
    // O acordo (se houve) já foi criado no Financeiro pelo modal próprio; aqui só marcamos na ata
    // que esta audiência teve acordo. O status da audiência é sempre "Realizada".
    const payload = {
      ...form,
      advogado_acompanhante: advogadoSel || '',
      houve_acordo: itens.acordo ? 1 : 0,
      nova_audiencia: itens.nova_audiencia ? 1 : 0,
      teve_prazo: itens.prazo ? 1 : 0,
      teve_pericia: itens.pericia ? 1 : 0,
      teve_alvara: itens.alvara ? 1 : 0,
      teve_desistencia: itens.desistencia ? 1 : 0,
      teve_retorno_autos: itens.retorno_autos ? 1 : 0,
      teve_testemunha: itens.testemunha ? 1 : 0,
      testemunhas: itens.testemunha ? testemunhasAta.map(t => ({ pessoa_id: t.id, parte_pessoa_id: t.parte_pessoa_id, polo: t.polo })) : [],
      prazos: itens.prazo ? prazosAta : [],
      pericias: itens.pericia ? periciasAta : [],
      tarefas: [
        ...(itens.alvara ? tarefasAlvara.map(t => ({ ...t, origem_ata: 'alvara' })) : []),
        ...(itens.desistencia ? tarefasDesistencia.map(t => ({ ...t, origem_ata: 'desistencia' })) : []),
      ],
      nova_audiencia_dados: itens.nova_audiencia ? novaAudienciaRascunho : null,
      motivo_desistencia: itens.desistencia ? motivoDesistencia.trim() : null,
      comentario_retorno_autos: itens.retorno_autos && registrarComentarioRetorno ? comentarioRetorno.trim() : null,
    };
    try {
      await audienciasAPI.registrarAta(audiencia.id, payload);
      toast.success(ehSemComparecimento ? 'Resultado registrado com sucesso!' : 'Ata registrada com sucesso!');
      onFechar(true);
    } catch (err) { setAviso(err.response?.data?.mensagem || 'Não foi possível registrar o resultado. Tente novamente.'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>{ehSemComparecimento ? 'Registrar resultado' : 'Registrar Ata'} — {formatarData(audiencia.data)} {audiencia.hora?.slice(0, 5)}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          {aviso && (
            <div style={{ background: '#fff4e5', border: '1px solid #ffcf99', color: '#8a5300', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
              {aviso}
            </div>
          )}

          {/* Advogado(a) que acompanhou a audiência — usuários advogados + freelas (com OAB); "(…)" cadastra novo */}
          <div className="form-group">
            <label className="form-label obrigatorio">{ehSemComparecimento ? 'Responsável pelo acompanhamento' : 'Advogado(a) que acompanhou a audiência'}</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <select className="form-control" value={advogadoSel}
                onChange={e => { setAdvogadoSel(e.target.value); setAviso(''); }}>
                <option value="">— Selecione —</option>
                <option value="ninguem">{ehSemComparecimento ? 'Não informado' : 'Ninguém (a parte compareceu sozinha)'}</option>
                {advogados.filter(a => a.origem === 'usuario').length > 0 && (
                  <optgroup label="Advogados do escritório">
                    {advogados.filter(a => a.origem === 'usuario').map(a =>
                      <option key={`u-${a.id}`} value={`usuario:${a.id}`}>{a.nome}{a.oab ? ` — ${a.oab}` : ''}</option>
                    )}
                  </optgroup>
                )}
                {advogados.filter(a => a.origem === 'freela').length > 0 && (
                  <optgroup label="Freelancers">
                    {advogados.filter(a => a.origem === 'freela').map(a =>
                      <option key={`f-${a.id}`} value={`freela:${a.id}`}>{a.nome}{a.oab ? ` — ${a.oab}` : ''}</option>
                    )}
                  </optgroup>
                )}
              </select>
              <button type="button" title="Cadastrar novo advogado"
                style={{ padding: '0 10px', border: '1px solid #ddd', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer', fontSize: '16px', whiteSpace: 'nowrap' }}
                onClick={() => setModalNovoFreela(true)}>…</button>
            </div>
          </div>

          <div className="form-group">
            <label className={`form-label ${ehSemComparecimento ? 'obrigatorio' : ''}`}>{ehSemComparecimento ? 'O que aconteceu no ato processual?' : 'Resumo / Termos'}</label>
            <textarea className="form-control" rows={4} value={form.resultado_texto || ''}
              onChange={e => set('resultado_texto', e.target.value)}
              onBlur={() => { if (!ehSemComparecimento) set('resultado_texto', toTitleCase(form.resultado_texto)); }}
              placeholder={ehSemComparecimento ? 'Descreva o resultado disponibilizado ou a baixa realizada...' : 'Descreva os principais pontos da audiência...'} />
          </div>

          {/* "O que teve nessa audiência?" — cada checkbox revela um recurso antes oculto e é gravado na ata */}
          <div className="form-group" style={{ marginTop: '12px' }}>
            <label className="form-label">{ehSemComparecimento ? 'Providências geradas por este ato' : 'O que teve nessa audiência?'}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc' }}>
              {[
                ['prazo', 'Prazo'], ['pericia', 'Perícia'], ['acordo', 'Acordo'],
                ['nova_audiencia', 'Nova audiência'], ['alvara', 'Alvará'],
                ['testemunha', 'Testemunha(s)'], ['desistencia', 'Desistência da Ação'], ['retorno_autos', 'Retornem aos autos'],
              ].filter(([k]) => !ehSemComparecimento || k !== 'testemunha').map(([k, rotulo]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={itens[k]} onChange={() => toggleItem(k)} />
                  {rotulo}
                </label>
              ))}
            </div>
          </div>

          {/* Acordo — botão revelado ao marcar o checkbox (abre o modal completo do Financeiro) */}
          {itens.acordo && (
            <div className="form-group" style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline" onClick={abrirAcordo} disabled={abrindoAcordo}>
                {abrindoAcordo ? 'Abrindo...' : '💰 Registrar acordo'}
              </button>
              {acordoRegistrado && (
                <span style={{ color: '#16a34a', fontSize: '13px', fontWeight: 600 }}>✓ Acordo registrado no Financeiro</span>
              )}
            </div>
          )}

          {/* Nova audiência — botão revelado ao marcar o checkbox (Nova Audiência pré-preenchida) */}
          {itens.nova_audiencia && (
            <div className="form-group" style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline" onClick={abrirNovaAudiencia} disabled={abrindoNova}>
                {abrindoNova ? 'Abrindo...' : (novaAudienciaRascunho ? '📅 Editar nova audiência' : '📅 Designar nova audiência')}
              </button>
              {novaAudienciaRascunho && (
                <>
                  <span style={{ color: '#16a34a', fontSize: '13px', fontWeight: 600 }}>✓ Nova audiência pronta para ser registrada com a ata</span>
                  <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setNovaAudienciaRascunho(null)}>Remover</button>
                </>
              )}
            </div>
          )}

          {itens.testemunha && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <strong style={{ fontSize: 13, color: '#1e40af' }}>Testemunhas da ATA</strong>
                <button type="button" className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setCadastroTestemunhasAberto(v => !v)}>
                  {cadastroTestemunhasAberto ? 'Fechar cadastro' : '+ Testemunhas'}
                </button>
                {testemunhasAta.length > 0 && <span style={{ color: '#16a34a', fontSize: 13 }}>{testemunhasAta.length} cadastrada(s) para a ATA</span>}
              </div>
              {cadastroTestemunhasAberto && (processoTestemunhasAta ? <SecaoTestemunhas processoId={processoTestemunhasAta} testemunhas={testemunhasAta} onChange={setTestemunhasAta} /> : <span style={{ fontSize: 13 }}>Carregando processo...</span>)}
            </div>
          )}

          {/* Recursos ainda em implementação — revelados pelo checkbox, codados um a um */}
          {(itens.prazo || itens.pericia || itens.alvara || itens.desistencia || itens.retorno_autos) && (
            <div className="form-group" style={{ marginTop: '8px' }}>
              {itens.prazo && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', fontSize: '13px', color: '#1e40af', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <strong>Prazo</strong>
                    <button type="button" className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 12 }} onClick={abrirPrazoAta}>+ Cadastrar prazo</button>
                  </div>
                  {prazosAta.length > 0 && (
                    <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
                      {prazosAta.map((prazo, indice) => (
                        <div key={indice} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#fff', borderRadius: 4, padding: '6px 8px' }}>
                          <span>{prazo.descricao || 'Prazo'} — {formatarData(prazo.data_inicio)} até {formatarData(prazo.data_final)}</span>
                          <button type="button" className="btn btn-secondary" style={{ padding: '3px 7px', fontSize: 11 }} onClick={() => setPrazosAta(lista => lista.filter((_, i) => i !== indice))}>Remover</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {itens.pericia && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', fontSize: '13px', color: '#1e40af', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <strong>Perícia</strong>
                    <button type="button" className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 12 }} onClick={abrirPericiaAta}>+ Cadastrar perícia</button>
                  </div>
                  {periciasAta.length > 0 && <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
                    {periciasAta.map((pericia, indice) => {
                      const tipo = tiposPericia.find(t => String(t.id) === String(pericia.tipo_pericia_id));
                      return <div key={indice} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#fff', borderRadius: 4, padding: '6px 8px' }}>
                        <span>{tipo?.nome || 'Perícia'} — {pericia.data ? formatarData(pericia.data) : 'Aguardando data'}{pericia.perito_nome ? ` · ${pericia.perito_nome}` : ''}</span>
                        <button type="button" className="btn btn-secondary" style={{ padding: '3px 7px', fontSize: 11 }} onClick={() => setPericiasAta(lista => lista.filter((_, i) => i !== indice))}>Remover</button>
                      </div>;
                    })}
                  </div>}
                </div>
              )}
              {itens.alvara && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', fontSize: '13px', color: '#1e40af', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <strong>Alvará</strong>
                    <button type="button" className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => abrirTarefaAta('alvara')}>+ Cadastrar tarefa do alvará</button>
                  </div>
                  {tarefasAlvara.length > 0 && <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
                    {tarefasAlvara.map((tarefa, indice) => <div key={indice} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#fff', borderRadius: 4, padding: '6px 8px' }}>
                      <span>{tarefa.titulo} — vencimento {formatarData(tarefa.data_vencimento)}</span>
                      <button type="button" className="btn btn-secondary" style={{ padding: '3px 7px', fontSize: 11 }} onClick={() => setTarefasAlvara(lista => lista.filter((_, i) => i !== indice))}>Remover</button>
                    </div>)}
                  </div>}
                </div>
              )}
              {itens.desistencia && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '10px 12px', marginBottom: 6 }}>
                  <strong style={{ fontSize: 13, color: '#9a3412' }}>Desistência da ação</strong>
                  <div className="form-group" style={{ margin: '8px 0' }}>
                    <label className="form-label obrigatorio">Motivo da desistência</label>
                    <textarea className="form-control" rows={2} value={motivoDesistencia}
                      onChange={e => setMotivoDesistencia(e.target.value)}
                      onBlur={() => setMotivoDesistencia(toTitleCase(motivoDesistencia))}
                      placeholder="Descreva o motivo da desistência..." />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13 }}>Deseja cadastrar uma tarefa?</span>
                    <button type="button" className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => abrirTarefaAta('desistencia')}>+ Cadastrar tarefa</button>
                  </div>
                  {tarefasDesistencia.length > 0 && <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
                    {tarefasDesistencia.map((tarefa, indice) => <div key={indice} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#fff', borderRadius: 4, padding: '6px 8px', fontSize: 13 }}>
                      <span>{tarefa.titulo} — vencimento {formatarData(tarefa.data_vencimento)}</span>
                      <button type="button" className="btn btn-secondary" style={{ padding: '3px 7px', fontSize: 11 }} onClick={() => setTarefasDesistencia(lista => lista.filter((_, i) => i !== indice))}>Remover</button>
                    </div>)}
                  </div>}
                </div>
              )}
              {itens.retorno_autos && (
                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 12px', marginBottom: 6 }}>
                  <strong style={{ fontSize: 13, color: '#334155' }}>Retornem aos autos</strong>
                  <div style={{ marginTop: 8, fontSize: 13 }}>Deseja registrar algum comentário?</div>
                  <label style={{ fontSize: 13, marginRight: 14 }}><input type="radio" checked={registrarComentarioRetorno} onChange={() => setRegistrarComentarioRetorno(true)} /> Sim</label>
                  <label style={{ fontSize: 13 }}><input type="radio" checked={!registrarComentarioRetorno} onChange={() => { setRegistrarComentarioRetorno(false); setComentarioRetorno(''); }} /> Não</label>
                  {registrarComentarioRetorno && <textarea className="form-control" rows={2} style={{ marginTop: 8 }} value={comentarioRetorno}
                    onChange={e => setComentarioRetorno(e.target.value)} onBlur={() => setComentarioRetorno(toTitleCase(comentarioRetorno))}
                    placeholder="Registre o comentário para consulta nos Detalhes da ATA..." />}
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Observações</label>
            <textarea className="form-control" rows={2} value={form.observacoes || ''}
              onChange={e => set('observacoes', e.target.value)}
              onBlur={() => set('observacoes', toTitleCase(form.observacoes))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : ehSemComparecimento ? 'Registrar resultado' : 'Registrar Ata'}
          </button>
        </div>
      </div>

      {/* Nova Audiência (pré-preenchida) aberta pelo botão "Designar nova audiência" */}
      {modalNovaAud && (
        <ModalNovaAudiencia
          tipos={tipos}
          onTiposChange={onTiposChange}
          processoInicial={modalNovaAud.processoInicial}
          valoresIniciais={modalNovaAud.valoresIniciais}
          bloquearProcesso
          onSalvarRascunho={(dados) => { setNovaAudienciaRascunho(dados); toast.success('Nova audiência adicionada à ata. Ela será salva somente ao registrar a ata.'); }}
          onFechar={() => setModalNovaAud(null)}
        />
      )}

      {modalPrazoAta && (
        <ModalNovoPrazo
          tipos={{ tipos: [], subtipos: [] }}
          processoInicial={{ processo_id: modalPrazoAta.processo_id, numero: modalPrazoAta.numero, titulo: modalPrazoAta.titulo }}
          pastaInicial={modalPrazoAta.pasta}
          dataInicioInicial={String(audiencia.data || '').slice(0, 10)}
          onSalvarRascunho={(prazo) => {
            setPrazosAta(lista => [...lista, prazo]);
            toast.success('Prazo adicionado à ata. Ele será salvo somente ao registrar a ata.');
          }}
          onFechar={() => setModalPrazoAta(false)}
        />
      )}

      {modalTarefaAta && (
        <ModalTarefa
          preSelecao={{ tipo: 'processo', processo_id: modalTarefaAta.processo_id, processo_numero: modalTarefaAta.numero }}
          pastaInicial={modalTarefaAta.pasta}
          bloquearProcesso
          tituloInicial={modalTarefaAta.titulo}
          onSalvarRascunho={tarefa => {
            if (modalTarefaAta.origem === 'desistencia') setTarefasDesistencia(lista => [...lista, tarefa]);
            else setTarefasAlvara(lista => [...lista, tarefa]);
          }}
          onFechar={() => setModalTarefaAta(null)}
        />
      )}
      {modalPericiaAta && (
        <ModalPericiaAta processo={modalPericiaAta} tipos={tiposPericia} modelosEmailPerito={modelosEmailPerito}
          onSalvar={(pericia) => {
            const tipo = tiposPericia.find(t => String(t.id) === String(pericia.tipo_pericia_id));
            setPericiasAta(lista => [...lista, { ...pericia, tipo_pericia_nome: tipo?.nome || 'Perícia' }]);
            setModalPericiaAta(null);
          }}
          onFechar={() => setModalPericiaAta(null)} />
      )}

      {/* Acordo (modal completo do Financeiro) aberto pelo botão "Registrar acordo" */}
      {modalAcordo && (
        <ModalAcordo
          processoId={modalAcordo.processoId}
          acordoId={null}
          tipo="acordo"
          descricaoInicial={modalAcordo.descricaoInicial}
          onFechar={(reload) => { setModalAcordo(null); if (reload) { setAcordoRegistrado(true); toast.success('Acordo registrado no Financeiro.'); } }}
        />
      )}
      {confirmarNovoAcordo && (
        <ModalConfirmar
          titulo="Registrar outro acordo?"
          tipo="aviso"
          mensagem="Você já registrou um acordo desta ATA. Deseja registrar outro acordo? Lembre-se de que poderá haver mais de um acordo no Financeiro."
          textoBotao="Registrar outro acordo"
          acao={() => { setConfirmarNovoAcordo(false); abrirAcordo(true); }}
          onCancelar={() => setConfirmarNovoAcordo(false)}
        />
      )}

      {/* Cadastro de novo advogado (freela) aberto pelo "(…)" do campo de advogado acompanhante */}
      {modalNovoFreela && (
        <ModalNovoFreela
          onFechar={() => setModalNovoFreela(false)}
          onSalvo={async (novoId) => {
            const { data } = await audienciasAPI.advogados();
            if (data.ok) setAdvogados(data.dados || []);
            setAdvogadoSel(`freela:${novoId}`);
            setModalNovoFreela(false);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Modal para REVERTER o status de uma audiência Realizada -> Agendada (SOMENTE admin).
// Apaga a ata (para poder retrabalhar) e exige motivo. Prazos/tarefas/acordo permanecem.
// ============================================================
function ModalReverterStatus({ audiencia, onFechar }) {
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    if (!motivo.trim()) return toast.error('Informe o motivo da reversão');
    setSalvando(true);
    try {
      await audienciasAPI.reverterStatus(audiencia.id, { motivo: motivo.trim() });
      toast.success('Status revertido para Agendada.');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao reverter o status'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h3>Reverter status</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e' }}>
            ⚠️ A audiência voltará para <strong>Agendada</strong> e a <strong>ata registrada será apagada</strong>.
            Os prazos, tarefas e o acordo que a ata tenha gerado <strong>permanecem</strong> — trate-os manualmente se necessário.
          </div>
          <div className="form-group">
            <label className="form-label">Motivo *</label>
            <textarea className="form-control" rows={3} value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Descreva o motivo da reversão (fica registrado no histórico)" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)} disabled={salvando}>Cancelar</button>
          <button className="btn btn-danger" onClick={confirmar} disabled={salvando}>
            {salvando ? 'Revertendo...' : 'Reverter para Agendada'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Campo de busca de vara para o Local da audiência
// Usado nos modais Nova e Editar — busca por nome, abrev, fórum, cidade
// ============================================================
function CampoLocalVara({ varas, foruns, varaId, onChange, onRecarregarVaras, somenteLeitura = false }) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [modalNova, setModalNova] = useState(false);

  const varaSelecionada = varas.find(v => v.id === varaId) || null;

  const varasFiltradas = busca.length >= 1
    ? varas.filter(v =>
      v.nome?.toLowerCase().includes(busca.toLowerCase()) ||
      v.abrev_nome?.toLowerCase().includes(busca.toLowerCase()) ||
      v.forum_nome?.toLowerCase().includes(busca.toLowerCase()) ||
      v.forum_cidade?.toLowerCase().includes(busca.toLowerCase())
    ).sort((a, b) => {
      const aa = (a.abrev_nome || a.nome || '').toLowerCase();
      const bb = (b.abrev_nome || b.nome || '').toLowerCase();
      return aa.localeCompare(bb, 'pt-BR', { numeric: true });
    }).slice(0, 20)
    : [];

  function montarEndereco(v) {
    if (!v) return '';
    const linha1 = [v.forum_logradouro, v.forum_num_end, v.compl_end]
      .filter(Boolean).join(', ');
    const linha2 = [v.forum_bairro, v.forum_cidade, v.forum_uf]
      .filter(Boolean).join(v.forum_cidade && v.forum_uf ? ' — ' : ', ');
    const cep = v.forum_cep ? `CEP ${v.forum_cep}` : '';
    return [linha1, linha2, cep].filter(Boolean).join(' · ');
  }

  const endereco = montarEndereco(varaSelecionada);

  return (
    <div className="form-group">
      <label className="form-label">Local da audiência</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          {varaSelecionada ? (
            /* Vara selecionada — exibe chip (com botão × só quando NÃO é somente leitura) */
            <div style={{ display: 'flex', alignItems: 'center', padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', minHeight: 38 }}>
              <span style={{ flex: 1, fontSize: 14 }}>
                <strong>{varaSelecionada.abrev_nome || varaSelecionada.nome}</strong>
                {' — '}{varaSelecionada.forum_nome}
              </span>
              {!somenteLeitura && (
                <button type="button"
                  onClick={() => { onChange(null); setBusca(''); }}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 0 0 8px' }}
                  title="Limpar seleção">×</button>
              )}
            </div>
          ) : somenteLeitura ? (
            /* Somente leitura sem vara: mostra aviso, sem campo de busca */
            <div style={{ padding: '7px 12px', fontSize: 13, color: '#94a3b8' }}>Local não informado</div>
          ) : (
            /* Campo de busca */
            <input className="form-control"
              value={busca}
              onChange={e => { setBusca(e.target.value); setAberto(true); }}
              onFocus={() => setAberto(true)}
              onBlur={() => setTimeout(() => setAberto(false), 200)}
              placeholder="Digite para buscar vara (nome, fórum, cidade)..." />
          )}

          {/* Dropdown de resultados */}
          {aberto && varasFiltradas.length > 0 && !varaSelecionada && (
            <div style={{ position: 'absolute', zIndex: 150, width: '100%', border: '1px solid #ddd', borderRadius: 6, marginTop: 2, maxHeight: 200, overflowY: 'auto', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {varasFiltradas.map(v => (
                <div key={v.id}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  onClick={() => { onChange(v.id); setBusca(''); setAberto(false); }}>
                  <strong>{v.abrev_nome || v.nome}</strong>
                  {' — '}{v.forum_nome}
                  {v.forum_cidade && (
                    <span style={{ color: '#888', fontSize: 12 }}>
                      {' · '}{v.forum_cidade}{v.forum_uf ? `/${v.forum_uf}` : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Hint quando nenhum resultado */}
          {aberto && busca.length >= 1 && varasFiltradas.length === 0 && !varaSelecionada && (
            <div style={{ position: 'absolute', zIndex: 150, width: '100%', border: '1px solid #ddd', borderRadius: 6, marginTop: 2, background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: '10px 12px', fontSize: 13, color: '#888' }}>
              Nenhuma vara encontrada. Use o botão <strong>…</strong> para cadastrar.
            </div>
          )}
        </div>

        {/* Botão para cadastrar nova vara (escondido no modo somente leitura) */}
        {!somenteLeitura && (
          <button type="button" title="Cadastrar nova vara"
            style={{ padding: '0 10px', border: '1px solid #ddd', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', fontSize: 16, whiteSpace: 'nowrap' }}
            onClick={() => setModalNova(true)}>…</button>
        )}
      </div>

      {/* Endereço informativo abaixo */}
      {varaSelecionada && endereco && (
        <div style={{ marginTop: 6, padding: '7px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 14, fontWeight: 600, color: '#1e40af' }}>
          📍 {endereco}
        </div>
      )}
      {varaSelecionada && !endereco && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>
          📍 Endereço não cadastrado para este fórum
        </div>
      )}

      {/* Mini-modal cadastro rápido de vara */}
      {modalNova && (
        <ModalNovaVara
          foruns={foruns}
          onFechar={() => setModalNova(false)}
          onSalvo={async (novoId) => {
            await onRecarregarVaras();
            onChange(novoId);
            setModalNova(false);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Mini-modal para cadastro rápido de vara (dentro do modal de audiência)
// ============================================================
function ModalNovaVara({ foruns, onFechar, onSalvo }) {
  const [form, setForm] = useState({ forum_id: '', nome: '', abrev_nome: '', codVaraNoProc: '', compl_end: '' });
  const [salvando, setSalvando] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function salvar() {
    if (!form.forum_id) return toast.error('Fórum é obrigatório');
    if (!form.nome.trim()) return toast.error('Nome é obrigatório');
    setSalvando(true);
    try {
      const { data } = await processosAPI.criarVara({ ...form, forum_id: parseInt(form.forum_id) });
      toast.success('Vara cadastrada!');
      onSalvo(data.dados.id);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao cadastrar vara'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3>Nova Vara</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label obrigatorio">Fórum</label>
            <select className="form-control" value={form.forum_id}
              onChange={e => set('forum_id', e.target.value)} autoFocus>
              <option value="">Selecione o fórum...</option>
              {foruns.map(f => (
                <option key={f.id} value={f.id}>{f.abrev_nome || f.nome}</option>
              ))}
            </select>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label obrigatorio">Nome completo</label>
              <input className="form-control" placeholder="Ex: 1ª Vara do Trabalho"
                value={form.nome} onChange={e => set('nome', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Abreviação</label>
              <input className="form-control" placeholder="Ex: 1ªVT/SP"
                value={form.abrev_nome} onChange={e => set('abrev_nome', e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Código CNJ</label>
              <input className="form-control" placeholder="Ex: 5020001" maxLength={15}
                style={{ fontFamily: 'monospace' }}
                value={form.codVaraNoProc} onChange={e => set('codVaraNoProc', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Complemento de endereço</label>
              <input className="form-control" placeholder="Ex: 3º andar, Bloco A"
                value={form.compl_end} onChange={e => set('compl_end', e.target.value)} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
            Para editar mais detalhes desta vara (tel, e-mail), acesse Controle → Varas.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Cadastrar Vara'}
          </button>
        </div>
      </div>
    </div>
  );
}
