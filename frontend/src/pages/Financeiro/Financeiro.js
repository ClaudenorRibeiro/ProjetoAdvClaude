// ============================================================
// PÁGINA FINANCEIRA (reescrita 15/06/2026 — POR PROCESSO)
// Fluxo: busca pasta -> escolhe processo -> conta corrente (entradas/saídas com saldo)
//        + acordos parcelados (modal-tabela editável) + baixa de parcela (vira entrada).
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { financeiroAPI, processosAPI, pessoasAPI } from '../../services/api';
import { formatarData, formatarDataHora, formatarMoeda, formatarNumeroPasta, toTitleCase, mascaraMoeda, numeroParaMascaraMoeda, parseMoeda, hojeLocal, mascaraDocumento } from '../../utils/formatters';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import ModalInfo from '../../components/ui/ModalInfo';
import MenuAcoes from '../../components/MenuAcoes';
import { ModalGerar } from '../../components/GerarDocumento';

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Helpers de cálculo da parcela. Os campos de moeda (valor_bruto, honor_valor fixo, parceria_valor fixo)
// ficam no state como STRING mascarada ("1.000,00"); por isso lemos sempre via parseMoeda.
// Os valores calculados (honorário em %, líquido, parceria em %) são derivados na renderização — não
// são guardados no state, evitando conflito com os campos editáveis.
function honorDaParcela(p) {
  const bruto = parseMoeda(p.valor_bruto);
  if (p.honor_tipo === 'sem') return 0;
  if (p.honor_tipo === 'fixo') return Math.min(parseMoeda(p.honor_valor), bruto);
  return round2(Math.min(bruto * (Number(p.honor_percentual) || 0) / 100, bruto));
}
function liquidoDaParcela(p) {
  return round2(parseMoeda(p.valor_bruto) - honorDaParcela(p));
}
function parceriaDaParcela(p) {
  if (!p.parceria_pessoa_id) return null;
  if (p.parceria_tipo === 'fixo') return parseMoeda(p.parceria_valor);
  return round2(honorDaParcela(p) * (Number(p.parceria_percentual) || 0) / 100);
}

// Agrupamento do "Saldo" do extrato (coluna que só aparece na última linha de cada grupo).
// Datas são comparadas pelo prefixo YYYY-MM-DD (sem hora/fuso) para não variar por timezone.
function dataIsoDia(valor) {
  const m = String(valor || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
}
function diasDesdeEpoca(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(ano, mes - 1, dia) / 86400000);
}
// 'diario': cada data é seu próprio grupo. 'semanal'/'mensal': blocos fixos de 7/30 dias
// corridos, contados a partir da data do PRIMEIRO lançamento do extrato (não é semana/mês
// de calendário, e o bloco não muda dependendo de quando a tela é aberta).
function grupoSaldo(dataLancamento, dataAncora, periodo) {
  const iso = dataIsoDia(dataLancamento);
  if (!iso) return null;
  if (periodo === 'diario') return iso;
  const isoAncora = dataIsoDia(dataAncora);
  if (!isoAncora) return iso;
  const tamanhoBloco = periodo === 'semanal' ? 7 : 30;
  return Math.floor((diasDesdeEpoca(iso) - diasDesdeEpoca(isoAncora)) / tamanhoBloco);
}

export default function Financeiro() {
  const { temPermissao } = useAuth();
  const podeCadastrar = temPermissao('financeiro', 'cadastrar');
  const podeAlterar   = temPermissao('financeiro', 'alterar');
  const podeExcluir   = temPermissao('financeiro', 'excluir');

  const [pastas, setPastas]         = useState([]);
  const [buscaPasta, setBuscaPasta] = useState('');
  const [pastaSel, setPastaSel]     = useState(null);
  const [processos, setProcessos]   = useState([]);
  const [processoId, setProcessoId] = useState('');

  const [conta, setConta]           = useState(null);   // { lancamentos, saldo_total }
  const [acordos, setAcordos]       = useState([]);
  const [carregando, setCarregando] = useState(false);

  const [modalLancamento, setModalLancamento] = useState(false);
  const [lancEditando, setLancEditando]       = useState(null);
  const [histLancamento, setHistLancamento]   = useState(null); // lançamento c/ histórico aberto
  const [modalAcordo, setModalAcordo]         = useState(false);
  const [acordoEditando, setAcordoEditando]   = useState(null);
  const [confirmar, setConfirmar]             = useState(null);
  const [aba, setAba] = useState('processo');   // 'processo' (por processo) | 'repasses' (worklist global)
  const [acordoTipoNovo, setAcordoTipoNovo] = useState('acordo'); // tipo ao criar: 'acordo' | 'alvara'
  const [periodoSaldo, setPeriodoSaldo] = useState('diario'); // agrupamento da coluna Saldo do extrato: 'diario' | 'semanal' | 'mensal'
  // Guarda contra resposta desatualizada: trocar de processo rápido pode fazer a busca do
  // processo anterior responder DEPOIS da do processo novo e sobrescrever a tela com o
  // saldo/acordos errados (auditoria 23/09).
  const carregarSeqRef = useRef(0);

  async function buscarPastas(termo) {
    if (termo.length < 2) return setPastas([]);
    // apenasComFinanceiro: só o Financeiro liga esse filtro — traz só pastas com algum
    // processo que já teve lançamento/acordo/alvará. As outras telas que reaproveitam esta
    // mesma busca (Perícias, Prazos, Processos, Relatórios, Tarefas) não mandam este
    // parâmetro e continuam vendo todas as pastas, normalmente.
    const { data } = await processosAPI.listarPastas({ busca: termo, limite: 10, apenasComFinanceiro: 1 });
    if (data.ok) setPastas(data.dados.registros);
  }

  async function selecionarPasta(p) {
    setPastas([]);
    setBuscaPasta(`${formatarNumeroPasta(p.numPasta)} — ${p.titulo_proc || ''}`);
    setPastaSel(p);
    setProcessoId('');
    setConta(null);
    setAcordos([]);
    try {
      const { data } = await processosAPI.buscarPasta(p.id);
      if (data.ok) setProcessos(data.dados.processos || []);
    } catch { setProcessos([]); }
  }

  const carregar = useCallback(async () => {
    if (!processoId) return;
    const minhaSeq = ++carregarSeqRef.current;
    setCarregando(true);
    try {
      const [c, a] = await Promise.all([
        financeiroAPI.buscarConta(processoId, {}),
        financeiroAPI.listarAcordos(processoId),
      ]);
      if (minhaSeq !== carregarSeqRef.current) return; // já saiu outra busca depois desta (trocou de processo)
      if (c.data.ok) setConta(c.data.dados);
      if (a.data.ok) setAcordos(a.data.dados);
    } catch { toast.error('Erro ao carregar financeiro'); }
    finally { if (minhaSeq === carregarSeqRef.current) setCarregando(false); }
  }, [processoId]);

  useEffect(() => { carregar(); }, [carregar]);

  function excluirLancamento(l) {
    setConfirmar({
      titulo: 'Excluir lançamento',
      mensagem: 'Este lançamento será removido permanentemente. Esta ação não pode ser desfeita.',
      textoBotao: 'Excluir', tipo: 'perigo',
      acao: async () => {
        try { await financeiroAPI.excluirLanc(l.id); toast.success('Lançamento removido'); carregar(); }
        catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao excluir'); }
      },
    });
  }

  function excluirAcordo(a) {
    setConfirmar({
      titulo: 'Excluir acordo',
      mensagem: 'O acordo e todas as parcelas serão removidos. Esta ação não pode ser desfeita.',
      textoBotao: 'Excluir', tipo: 'perigo',
      acao: async () => {
        try { await financeiroAPI.excluirAcordo(a.id); toast.success('Acordo excluído'); carregar(); }
        catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao excluir'); }
      },
    });
  }

  const processoSel = processos.find(p => String(p.id) === String(processoId)) || null;

  return (
    <div>
      {/* Abas: financeiro por processo | repasses pendentes (worklist global) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn ${aba === 'processo' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setAba('processo')}>
          Por processo
        </button>
        <button className={`btn ${aba === 'repasses' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setAba('repasses')}>
          Repasses pendentes
        </button>
        <button className={`btn ${aba === 'consulta' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setAba('consulta')}>
          Consulta
        </button>
      </div>

      {aba === 'repasses' && <RepassesView podeAlterar={podeAlterar} onMudou={carregar} />}
      {aba === 'consulta' && <ConsultaFinanceiro />}

      {aba === 'processo' && (<>
      {/* Seleção pasta -> processo */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '260px', maxWidth: '420px', position: 'relative' }}>
            <label className="form-label">Pasta</label>
            <input className="form-control" placeholder="Buscar pasta pelo título ou número..."
              value={buscaPasta}
              onChange={e => { setBuscaPasta(e.target.value); buscarPastas(e.target.value); }} />
            {pastas.length > 0 && (
              <div style={{ border: '1px solid #ddd', borderRadius: '6px', marginTop: '4px', maxHeight: '160px', overflowY: 'auto', background: '#fff', position: 'absolute', zIndex: 10, left: 0, right: 0 }}>
                {pastas.map(p => (
                  <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                    onMouseDown={() => selecionarPasta(p)}>
                    <strong>{formatarNumeroPasta(p.numPasta)}</strong> — {p.titulo_proc || '—'}
                  </div>
                ))}
              </div>
            )}
          </div>
          {pastaSel && (
            <div className="form-group" style={{ margin: 0, minWidth: '240px' }}>
              <label className="form-label">Processo</label>
              <select className="form-control" value={processoId} onChange={e => setProcessoId(e.target.value)}>
                <option value="">— Selecione o processo —</option>
                {processos.map(p => <option key={p.id} value={p.id}>{p.numProc || `#${p.id}`}</option>)}
              </select>
            </div>
          )}
          {processoId && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {podeCadastrar && (
                <button className="btn btn-outline" onClick={() => { setLancEditando(null); setModalLancamento(true); }}>
                  + Lançamento
                </button>
              )}
              {podeCadastrar && (
                <button className="btn btn-primary" onClick={() => { setAcordoEditando(null); setAcordoTipoNovo('acordo'); setModalAcordo(true); }}>
                  + Novo Acordo
                </button>
              )}
              {podeCadastrar && (
                <button className="btn btn-primary" onClick={() => { setAcordoEditando(null); setAcordoTipoNovo('alvara'); setModalAcordo(true); }}>
                  + Novo Alvará
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!processoId && (
        <div className="card"><p className="lista-vazia">Selecione uma pasta e um processo para ver o financeiro</p></div>
      )}

      {processoId && carregando && <div className="card"><div className="loading">Carregando...</div></div>}

      {processoId && !carregando && conta && (
        <>
          {/* ===== ACORDOS ===== */}
          {acordos.length > 0 && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <h3 style={{ marginTop: 0 }}>Acordos e Alvarás</h3>
              {acordos.map(a => (
                <AcordoBloco key={a.id} acordo={a}
                  podeAlterar={podeAlterar} podeExcluir={podeExcluir}
                  onEditar={() => { setAcordoEditando(a.id); setModalAcordo(true); }}
                  onExcluir={() => excluirAcordo(a)}
                  onMudou={carregar} />
              ))}
            </div>
          )}

          {/* ===== EXTRATO (conta corrente) ===== */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Conta corrente {processoSel ? `— ${processoSel.numProc || ''}` : ''}</h3>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: '#888' }}>Saldo</div>
                <strong style={{ fontSize: '20px', color: (conta.saldo_total || 0) >= 0 ? '#059669' : '#dc2626' }}>
                  {formatarMoeda(conta.saldo_total || 0)}
                </strong>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className={`btn ${periodoSaldo === 'diario' ? 'btn-primary' : 'btn-outline'}`} style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => setPeriodoSaldo('diario')}>Diário</button>
              <button className={`btn ${periodoSaldo === 'semanal' ? 'btn-primary' : 'btn-outline'}`} style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => setPeriodoSaldo('semanal')}>Semanal</button>
              <button className={`btn ${periodoSaldo === 'mensal' ? 'btn-primary' : 'btn-outline'}`} style={{ fontSize: 12, padding: '4px 10px' }}
                onClick={() => setPeriodoSaldo('mensal')}>Mensal</button>
            </div>
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Data</th><th>Descrição</th><th>Tipo</th>
                    <th style={{ textAlign: 'right' }}>Entrada</th>
                    <th style={{ textAlign: 'right' }}>Saída</th>
                    <th style={{ textAlign: 'right' }}>Saldo</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const lista = conta.lancamentos || [];
                    const dataAncora = lista[0]?.data;
                    return lista.map((l, i) => {
                      const ehAcordo = l.origem !== 'manual';
                      const grupoAtual = grupoSaldo(l.data, dataAncora, periodoSaldo);
                      const grupoProximo = i + 1 < lista.length ? grupoSaldo(lista[i + 1].data, dataAncora, periodoSaldo) : null;
                      const ultimoDoGrupo = grupoProximo === null || grupoProximo !== grupoAtual;
                      return (
                      <tr key={l.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatarData(l.data)}</td>
                        <td>{l.descricao}</td>
                        <td>
                          <span className={`badge ${l.tipo === 'entrada' ? 'badge-verde' : 'badge-vermelho'}`}>
                            {l.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }} className="valor-positivo">
                          {l.tipo === 'entrada' ? `+${formatarMoeda(l.valor)}` : ''}
                        </td>
                        <td style={{ textAlign: 'right' }} className="valor-negativo">
                          {l.tipo === 'saida' ? `−${formatarMoeda(l.valor)}` : ''}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: ultimoDoGrupo ? 600 : 400 }}>
                          {ultimoDoGrupo && (
                            <span style={{ color: (l.saldo_acumulado || 0) >= 0 ? '#059669' : '#dc2626' }}>
                              {formatarMoeda(l.saldo_acumulado)}
                            </span>
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {ehAcordo ? (
                            <span style={{ fontSize: '11px', color: '#888' }}>(parcela de acordo)</span>
                          ) : (
                            <MenuAcoes itens={[
                              { label: 'Editar', icone: '✏️',
                                oculto: !podeAlterar,
                                onClick: () => { setLancEditando(l); setModalLancamento(true); } },
                              { label: 'Histórico', icone: '📋',
                                onClick: () => setHistLancamento(l) },
                              { label: 'Excluir', icone: '🗑️', perigo: true,
                                oculto: !podeExcluir,
                                onClick: () => excluirLancamento(l) },
                            ]} />
                          )}
                        </td>
                      </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
              {(!conta.lancamentos || conta.lancamentos.length === 0) && (
                <p className="lista-vazia">Nenhum lançamento neste processo</p>
              )}
            </div>
          </div>
        </>
      )}
      </>)}

      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
      {modalLancamento && processoId && (
        <ModalLancamento processoId={processoId} lancamento={lancEditando}
          onFechar={(reload) => { setModalLancamento(false); setLancEditando(null); if (reload) carregar(); }} />
      )}
      {modalAcordo && processoId && (
        <ModalAcordo processoId={processoId} acordoId={acordoEditando} tipo={acordoTipoNovo}
          onFechar={(reload) => { setModalAcordo(false); setAcordoEditando(null); if (reload) carregar(); }} />
      )}
      {histLancamento && (
        <ModalHistoricoLancamento lancamento={histLancamento} onFechar={() => setHistLancamento(null)} />
      )}
    </div>
  );
}

// ============================================================
// REPASSES PENDENTES — worklist global (parcelas recebidas do réu que
// ainda falta repassar ao cliente e/ou ao parceiro). Cada pendência vira
// uma linha (uma parcela com cliente E parceiro pendentes gera 2 linhas).
// ============================================================
function RepassesView({ podeAlterar, onMudou }) {
  const { temPermissao } = useAuth();
  const [sub, setSub] = useState('pendentes');         // 'pendentes' | 'concluidos'
  const [pendentes, setPendentes] = useState(null);
  const [concluidos, setConcluidos] = useState(null);
  const [repassando, setRepassando] = useState(null);   // linha aguardando o modal de repasse
  const [historicoDe, setHistoricoDe] = useState(null); // parcela com histórico aberto

  // Pendentes: uma linha por repasse que ainda FALTA (cliente e/ou parceiro), da parcela OU da
  // multa dela. Prefixa a key com a origem: parcela e multa podem ter o MESMO id (id da multa
  // devolvido pelo backend é o id da própria parcela — é 1 multa por parcela).
  function montarPendentes(parcelas) {
    const out = [];
    for (const p of parcelas) {
      const origem = p.origem || 'parcela';
      if (Number(p.valor_liquido) > 0 && !p.repasse_cliente_em)
        out.push({ key: `c${origem}${p.id}`, parcela: p, tipo: 'cliente', beneficiario: 'Cliente', valor: p.valor_liquido, origem });
      if (p.parceria_pessoa_id && Number(p.parceria_valor) > 0 && !p.repasse_parceiro_em)
        out.push({ key: `p${origem}${p.id}`, parcela: p, tipo: 'parceiro', beneficiario: p.parceria_nome || 'Parceiro', valor: p.parceria_valor, origem });
    }
    return out;
  }

  // Concluídos: uma linha por repasse JÁ FEITO (com data, forma e quem fez), da parcela OU da multa.
  function montarConcluidos(parcelas) {
    const out = [];
    for (const p of parcelas) {
      const origem = p.origem || 'parcela';
      if (p.repasse_cliente_em)
        out.push({ key: `c${origem}${p.id}`, parcela: p, tipo: 'cliente', beneficiario: 'Cliente', valor: p.valor_liquido,
                   data: p.repasse_cliente_em, forma: p.repasse_cliente_forma_nome, quem: p.repasse_cliente_por_nome,
                   observacao: p.repasse_cliente_observacao, origem });
      if (p.repasse_parceiro_em)
        out.push({ key: `p${origem}${p.id}`, parcela: p, tipo: 'parceiro', beneficiario: p.parceria_nome || 'Parceiro', valor: p.parceria_valor,
                   data: p.repasse_parceiro_em, forma: p.repasse_parceiro_forma_nome, quem: p.repasse_parceiro_por_nome,
                   observacao: p.repasse_parceiro_observacao, origem });
    }
    return out;
  }

  const carregar = useCallback(async () => {
    try {
      const [pend, conc] = await Promise.all([financeiroAPI.repassesPendentes(), financeiroAPI.repassesConcluidos()]);
      if (pend.data.ok) setPendentes(montarPendentes(pend.data.dados));
      if (conc.data.ok) setConcluidos(montarConcluidos(conc.data.dados));
    } catch { toast.error('Erro ao carregar repasses'); setPendentes([]); setConcluidos([]); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function confirmarRepasse(dados) {
    try {
      if (repassando.origem === 'multa') await financeiroAPI.registrarRepasseMulta(repassando.parcela.id, { tipo: repassando.tipo, ...dados });
      else await financeiroAPI.registrarRepasse(repassando.parcela.id, { tipo: repassando.tipo, ...dados });
      toast.success('Repasse registrado'); setRepassando(null);
      await Promise.all([carregar(), onMudou?.()]);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao repassar'); }
  }
  async function desfazerRepasse(l) {
    try {
      if (l.origem === 'multa') await financeiroAPI.desfazerRepasseMulta(l.parcela.id, l.tipo);
      else await financeiroAPI.desfazerRepasse(l.parcela.id, l.tipo);
      toast.success('Repasse desfeito');
      await Promise.all([carregar(), onMudou?.()]);
    }
    catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao desfazer repasse'); }
  }

  // Células comuns de identificação do processo/pasta/parcela
  const colProc = (p) => (
    <>
      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.numProc || '—'}</td>
      <td style={{ fontSize: 12, color: '#555', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.NomeTituloProc || ''}>
        {formatarNumeroPasta(p.numPasta)} — {p.NomeTituloProc || '—'}
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>{p.acordo_tipo === 'alvara' ? 'Alvará' : 'Acordo'} {p.numero_acordo} · parc {p.numero}/{p.total_parcelas}</td>
    </>
  );

  if (pendentes === null || concluidos === null)
    return <div className="card"><div className="loading">Carregando...</div></div>;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Repasses</h3>
      {/* Sub-abas: pendentes (falta repassar) | concluídos (já repassados) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={`btn ${sub === 'pendentes' ? 'btn-primary' : 'btn-outline'}`} style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => setSub('pendentes')}>Pendentes ({pendentes.length})</button>
        <button className={`btn ${sub === 'concluidos' ? 'btn-primary' : 'btn-outline'}`} style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => setSub('concluidos')}>Concluídos ({concluidos.length})</button>
      </div>

      {/* ----- PENDENTES ----- */}
      {sub === 'pendentes' && (
        pendentes.length === 0 ? <p className="lista-vazia">Nenhum repasse pendente. 🎉</p> : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Recebido em</th><th>Processo</th><th>Pasta</th><th>Parcela</th>
                  <th>Repassar para</th><th style={{ textAlign: 'right' }}>Valor</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map(l => (
                  <tr key={l.key}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatarData(l.parcela.recebido_em)}</td>
                    {colProc(l.parcela)}
                    <td>
                      <span className={`badge ${l.tipo === 'cliente' ? 'badge-azul' : 'badge-roxo'}`}>
                        {l.tipo === 'cliente' ? 'Cliente' : `Parceiro: ${l.beneficiario}`}{l.origem === 'multa' ? ' (multa)' : ''}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatarMoeda(l.valor)}</td>
                    <td>
                      <MenuAcoes itens={[
                        { label: 'Repassar', icone: '💸',
                          oculto: !podeAlterar,
                          onClick: () => setRepassando(l) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ----- CONCLUÍDOS ----- */}
      {sub === 'concluidos' && (
        concluidos.length === 0 ? <p className="lista-vazia">Nenhum repasse concluído ainda.</p> : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Repassado em</th><th>Processo</th><th>Pasta</th><th>Parcela</th>
                  <th>Beneficiário</th><th style={{ textAlign: 'right' }}>Valor</th>
                  <th>Forma</th><th>Observação</th><th>Quem fez</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {concluidos.map(l => (
                  <tr key={l.key}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatarData(l.data)}</td>
                    {colProc(l.parcela)}
                    <td>
                      <span className={`badge ${l.tipo === 'cliente' ? 'badge-azul' : 'badge-roxo'}`}>
                        {l.tipo === 'cliente' ? 'Cliente' : `Parceiro: ${l.beneficiario}`}{l.origem === 'multa' ? ' (multa)' : ''}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatarMoeda(l.valor)}</td>
                    <td>{l.forma || '—'}</td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.observacao || ''}>{l.observacao || '—'}</td>
                    <td>{l.quem || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <MenuAcoes itens={[
                        // Recibo de multa fica fora por enquanto (o modelo de recibo usa os valores
                        // da parcela, não os da multa — geraria um recibo com o valor errado).
                        { label: 'Recibo', icone: '📄',
                          oculto: l.origem === 'multa' || !temPermissao('documentos','cadastrar'),
                          gerarDoc: { ancoraTipo: 'pagamento', ancoraId: l.parcela.id, beneficiario: l.tipo } },
                        { label: 'Histórico', icone: '📋',
                          onClick: () => setHistoricoDe(l.parcela) },
                        { label: 'Desfazer', icone: '↩️',
                          oculto: !podeAlterar,
                          onClick: () => desfazerRepasse(l) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {repassando && (
        <ModalRepasse linha={repassando} onCancelar={() => setRepassando(null)} onConfirmar={confirmarRepasse} />
      )}
      {historicoDe && (
        <ModalHistoricoParcela parcela={historicoDe} onFechar={() => setHistoricoDe(null)} />
      )}
    </div>
  );
}

// ============================================================
// MODAL: registrar repasse (data + forma de pagamento) ao cliente ou parceiro
// ============================================================
function ModalRepasse({ linha, onCancelar, onConfirmar }) {
  const [data, setData] = useState(hojeLocal());
  const [formaId, setFormaId] = useState('');
  const [formas, setFormas] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [contasEscritorio, setContasEscritorio] = useState([]);
  const [contaEscritorioId, setContaEscritorioId] = useState('');
  const p = linha.parcela;
  const inicialTipo = linha.tipo === 'parceiro' ? p.parceria_pessoa_tipo : p.repasse_cliente_tipo;
  const inicialPessoa = linha.tipo === 'parceiro' ? p.parceria_pessoa_id : p.repasse_cliente_pessoa_id;
  const [beneficiarios, setBeneficiarios] = useState([]);
  const [destinoTipo, setDestinoTipo] = useState(inicialTipo || '');
  const [destinoPessoa, setDestinoPessoa] = useState(inicialPessoa || '');
  const [contasDestino, setContasDestino] = useState([]);
  const [contaDestinoId, setContaDestinoId] = useState(linha.tipo === 'cliente' ? (p.repasse_cliente_conta_id || '') : '');
  const [tipoDestino, setTipoDestino] = useState('bancaria');
  const [observacao, setObservacao] = useState('');
  const [modalNovaConta, setModalNovaConta] = useState(false);
  const [info, setInfo] = useState(null);
  const { temPermissao } = useAuth();
  const formasCompativeis = formas.filter(f => f.uso_permitido === 'ambos' || f.uso_permitido === (tipoDestino === 'em_maos' ? 'especie' : 'financeira'));
  // Guarda contra resposta desatualizada: trocar de beneficiário rápido pode fazer a lista de
  // contas de um beneficiário anterior chegar DEPOIS e ficar exibida como se fosse do atual
  // — risco real de escolher a conta bancária da pessoa errada num repasse (auditoria 23/09).
  const contasDestinoSeqRef = useRef(0);
  const dataRef = useRef(null);
  const contaEscritorioRef = useRef(null);
  const beneficiarioRef = useRef(null);
  const contaDestinoRef = useRef(null);
  const formaRef = useRef(null);

  useEffect(() => {
    financeiroAPI.formasPagamento()
      .then(({ data }) => { if (data.ok) setFormas(data.dados); })
      .catch(() => toast.error('Erro ao carregar formas de pagamento'));
  }, []);

  useEffect(() => {
    financeiroAPI.contasEscritorio().then(({ data }) => {
      if (data.ok) {
        setContasEscritorio(data.dados);
        // Pré-seleciona a conta principal do escritório (mesmo padrão já usado abaixo p/
        // "Conta do beneficiário") — evita o usuário esquecer de escolher a cada repasse.
        setContaEscritorioId(atual => atual || (data.dados.find(c => c.principal)?.id || ''));
      }
    }).catch(() => toast.error('Erro ao carregar contas do escritório'));
    if (linha.tipo === 'cliente' && !inicialPessoa) {
      financeiroAPI.beneficiariosProcesso(p.processo_id).then(({ data }) => { if (data.ok) setBeneficiarios(data.dados); })
        .catch(() => toast.error('Erro ao carregar beneficiários do processo'));
    }
  }, []);
  useEffect(() => {
    const minhaSeq = ++contasDestinoSeqRef.current;
    if (!destinoTipo || !destinoPessoa) { setContasDestino([]); return; }
    financeiroAPI.contasBeneficiario(destinoTipo, destinoPessoa)
      .then(({ data }) => {
        if (minhaSeq !== contasDestinoSeqRef.current) return; // já trocou de beneficiário depois desta busca
        if (data.ok) { setContasDestino(data.dados); if (!contaDestinoId) setContaDestinoId(data.dados.find(c => c.principal)?.id || ''); }
      })
      .catch(() => toast.error('Erro ao carregar contas do beneficiário'));
  }, [destinoTipo, destinoPessoa]);

  async function confirmar() {
    if (!data) return setInfo({ titulo: 'Data obrigatória', mensagem: 'Informe a data do repasse.', focar: () => dataRef.current?.focus() });
    if (!contaEscritorioId) return setInfo({ titulo: 'Conta de saída obrigatória', mensagem: 'Selecione de qual conta ou caixa do escritório o dinheiro vai sair.', focar: () => contaEscritorioRef.current?.focus() });
    if (!destinoTipo || !destinoPessoa) return setInfo({ titulo: 'Beneficiário obrigatório', mensagem: 'Selecione o beneficiário do repasse.', focar: () => beneficiarioRef.current?.focus() });
    if (tipoDestino === 'bancaria' && !contaDestinoId) return setInfo({ titulo: 'Conta do beneficiário obrigatória', mensagem: 'Selecione a conta bancária do beneficiário, ou cadastre uma nova.', focar: () => contaDestinoRef.current?.focus() });
    if (!formaId) return setInfo({ titulo: 'Forma de pagamento obrigatória', mensagem: 'Informe a forma do repasse.', focar: () => formaRef.current?.focus() });
    setSalvando(true);
    await onConfirmar({ data, forma_id: parseInt(formaId, 10), conta_financeira_id: Number(contaEscritorioId),
      beneficiario_tipo: destinoTipo, beneficiario_id: Number(destinoPessoa),
      conta_bancaria_id: tipoDestino === 'bancaria' ? Number(contaDestinoId) : null, destino_tipo: tipoDestino, observacao });
    setSalvando(false);
  }

  const destino = linha.tipo === 'cliente' ? 'cliente' : `parceiro (${linha.beneficiario})`;
  const podeCadastrarConta = temPermissao('financeiro', 'alterar') && temPermissao('pessoas', 'alterar');

  async function aoCadastrarConta(contaId) {
    try {
      const { data } = await financeiroAPI.contasBeneficiario(destinoTipo, destinoPessoa);
      if (data.ok) {
        setContasDestino(data.dados);
        setContaDestinoId(String(contaId));
      }
      setModalNovaConta(false);
      toast.success('Conta cadastrada e selecionada para este repasse.');
    } catch { toast.error('A conta foi cadastrada, mas não foi possível recarregar a lista.'); }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box" style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <h3>Repassar ao {destino}</h3>
          <button className="modal-fechar" onClick={onCancelar}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Data do repasse *</label>
            <input ref={dataRef} type="date" className="form-control" value={data}
              onChange={e => setData(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Conta ou caixa de saída *</label>
            <select ref={contaEscritorioRef} className="form-control" value={contaEscritorioId} onChange={e => { setContaEscritorioId(e.target.value); setFormaId(''); }}>
              <option value="">Selecione a conta ou caixa...</option>
              {contasEscritorio.map(c => <option key={c.id} value={c.id}>{c.instituicao_nome ? `${c.instituicao_nome} — ${c.nome}` : c.nome}</option>)}
            </select>
          </div>
          {linha.tipo === 'cliente' && !inicialPessoa && (
            <div className="form-group"><label className="form-label">Beneficiário *</label>
              <select ref={beneficiarioRef} className="form-control" value={destinoPessoa ? `${destinoTipo}:${destinoPessoa}` : ''} onChange={e => { const [t, id] = e.target.value.split(':'); setDestinoTipo(t || ''); setDestinoPessoa(id || ''); setContaDestinoId(''); }}>
                <option value="">Selecione...</option>{beneficiarios.map(b => <option key={`${b.tipo}:${b.id}`} value={`${b.tipo}:${b.id}`}>{b.nome}</option>)}
              </select></div>
          )}
          <div className="form-group"><label className="form-label">Destino do repasse *</label>
            <select className="form-control" value={tipoDestino} onChange={e => { setTipoDestino(e.target.value); setFormaId(''); }}>
              <option value="bancaria">Conta bancária</option>
              <option value="em_maos">Dinheiro em espécie — em mãos</option>
            </select>
          </div>
          {tipoDestino === 'bancaria' ? (
            <div className="form-group"><label className="form-label">Conta do beneficiário *</label>
              <select ref={contaDestinoRef} className="form-control" value={contaDestinoId} onChange={e => setContaDestinoId(e.target.value)}>
                <option value="">Selecione...</option>{contasDestino.map(c => <option key={c.id} value={c.id}>{c.instituicao_nome} — {c.agencia ? `Ag. ${c.agencia} · ` : ''}{c.numero || c.chave_pix || c.titular}</option>)}
              </select>
              {podeCadastrarConta && destinoTipo && destinoPessoa && (
                <button type="button" className="btn btn-outline" style={{ marginTop: 8, fontSize: 12, padding: '4px 8px' }} onClick={() => setModalNovaConta(true)}>
                  + Cadastrar conta do beneficiário
                </button>
              )}
            </div>
          ) : (
            <p style={{ marginTop: 0, color: '#6b7280', fontSize: 13 }}>
              O valor será entregue pessoalmente ao beneficiário. Não será usada nenhuma instituição financeira ou conta bancária de destino.
            </p>
          )}
          <div className="form-group">
            <label className="form-label">Forma do repasse *</label>
            <select ref={formaRef} className="form-control" value={formaId} onChange={e => setFormaId(e.target.value)}>
              <option value="">Selecione...</option>
              {formasCompativeis.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
            {formas.length === 0 && (
              <small style={{ color: '#b45309' }}>
                Nenhuma forma cadastrada. Cadastre em Controle → Formas de pagamento.
              </small>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Observação do repasse (opcional)</label>
            <textarea className="form-control" rows="3" maxLength={1000} value={observacao}
              onChange={e => setObservacao(e.target.value)} placeholder="Anotações gerais sobre este repasse" />
          </div>
          <p style={{ color: '#6b7280', fontSize: '13px' }}>
            Valor: <strong>{formatarMoeda(linha.valor)}</strong>
          </p>
        </div>
      <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Confirmar repasse'}
          </button>
        </div>
      </div>
      {modalNovaConta && (
        <ModalNovaContaBeneficiario tipo={destinoTipo} pessoaId={destinoPessoa} nome={linha.beneficiario || 'beneficiário'}
          onFechar={() => setModalNovaConta(false)} onSalva={aoCadastrarConta} />
      )}
      {info && (
        <ModalInfo {...info} zIndex={1200}
          onFechar={() => { const f = info.focar; setInfo(null); if (f) setTimeout(f, 50); }} />
      )}
    </div>
  );
}

// Cadastro concentrado no fluxo de repasse: cria somente uma conta, sem tocar em
// telefones, e-mails ou demais dados da ficha do beneficiário.
function ModalNovaContaBeneficiario({ tipo, pessoaId, nome, onFechar, onSalva }) {
  const [instituicoes, setInstituicoes] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ instituicao_financeira_id: '', tipo_conta: 'corrente', agencia: '', numero: '', digito: '', chave_pix: '', conta_terceiro: false, titular: '', documento_titular: '', observacao: '', principal: false });
  const [confirmarDigito, setConfirmarDigito] = useState(null);
  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  useEffect(() => {
    financeiroAPI.instituicoesFinanceiras().then(({ data }) => { if (data.ok) setInstituicoes(data.dados); })
      .catch(() => toast.error('Erro ao carregar instituições financeiras'));
  }, []);

  async function salvar(digitoConfirmado = false) {
    if (!form.instituicao_financeira_id) return toast.error('Escolha a instituição financeira.');
    if (form.conta_terceiro && (!form.titular.trim() || !form.documento_titular.replace(/\D/g, ''))) {
      return toast.error('Informe o titular e o CPF/CNPJ da conta de terceiro.');
    }
    const digito = form.digito.trim();
    if (digito.length > 2 && !digitoConfirmado) {
      setConfirmarDigito({
        titulo: 'Confirmar dígito da conta',
        mensagem: `O dígito informado (${digito}) tem ${digito.length} caracteres. Normalmente ele possui até 2. Deseja cadastrar mesmo assim?`,
        textoBotao: 'Cadastrar mesmo assim',
        tipo: 'aviso',
        acao: () => salvar(true),
      });
      return;
    }
    setSalvando(true);
    try {
      const { data } = await financeiroAPI.criarContaBeneficiario(tipo, pessoaId, { ...form, instituicao_financeira_id: Number(form.instituicao_financeira_id) });
      if (data.ok) onSalva(data.dados.id);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao cadastrar a conta.'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1200 }}>
      <div className="modal-box" style={{ maxWidth: 560 }}>
        <div className="modal-header"><h3>Nova conta de {nome}</h3><button className="modal-fechar" onClick={onFechar}>✕</button></div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 2, minWidth: 220 }}><label className="form-label">Instituição financeira *</label>
              <select className="form-control" value={form.instituicao_financeira_id} onChange={e => set('instituicao_financeira_id', e.target.value)}><option value="">Selecione...</option>{instituicoes.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}</select></div>
            <div className="form-group" style={{ flex: 1, minWidth: 130 }}><label className="form-label">Tipo</label>
              <select className="form-control" value={form.tipo_conta} onChange={e => set('tipo_conta', e.target.value)}><option value="corrente">Corrente</option><option value="poupanca">Poupança</option></select></div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: 100 }}><label className="form-label">Agência</label><input className="form-control" value={form.agencia} onChange={e => set('agencia', e.target.value)} /></div>
            <div className="form-group" style={{ flex: 2, minWidth: 130 }}><label className="form-label">Conta</label><input className="form-control" value={form.numero} onChange={e => set('numero', e.target.value)} /></div>
            <div className="form-group" style={{ width: 80 }}><label className="form-label">Dígito</label><input className="form-control" maxLength={4} value={form.digito} onChange={e => set('digito', e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Chave PIX</label><input className="form-control" value={form.chave_pix} onChange={e => set('chave_pix', e.target.value)} /></div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginBottom: 10 }}><input type="checkbox" checked={form.conta_terceiro} onChange={e => set('conta_terceiro', e.target.checked)} />Conta de outra pessoa (autorização)</label>
          {form.conta_terceiro && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 2, minWidth: 210 }}><label className="form-label">Titular *</label><input className="form-control" value={form.titular} onChange={e => set('titular', e.target.value)} /></div>
            <div className="form-group" style={{ flex: 1, minWidth: 150 }}><label className="form-label">CPF/CNPJ *</label><input className="form-control" value={form.documento_titular} onChange={e => set('documento_titular', mascaraDocumento(e.target.value))} /></div>
          </div>}
          <div className="form-group"><label className="form-label">Observação da conta (opcional)</label><textarea className="form-control" rows="2" maxLength={1000} value={form.observacao} onChange={e => set('observacao', e.target.value)} /></div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={form.principal} onChange={e => set('principal', e.target.checked)} />Definir como conta principal</label>
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onFechar}>Cancelar</button><button className="btn btn-primary" disabled={salvando} onClick={() => salvar()}>{salvando ? 'Salvando...' : 'Cadastrar conta'}</button></div>
      </div>
      {confirmarDigito && <ModalConfirmar {...confirmarDigito} onCancelar={() => setConfirmarDigito(null)} />}
    </div>
  );
}

// ============================================================
// CONSULTA / RELATÓRIO do financeiro — busca de parcelas por múltiplos filtros + totais + Excel
// ============================================================
const CONSULTA_POR_PAGINA = 50;
const FILTRO_CONSULTA_VAZIO = {
  venc_de: '', venc_ate: '', valor_campo: 'liquido', valor_de: '', valor_ate: '',
  autor: '', reu: '', num_processo: '', pasta: '', parceiro: '', status: '',
};

function ConsultaFinanceiro() {
  const [filtros, setFiltros]     = useState(FILTRO_CONSULTA_VAZIO);   // formulário
  const [aplicados, setAplicados] = useState(FILTRO_CONSULTA_VAZIO);   // o que está de fato aplicado na busca
  const [pagina, setPagina]       = useState(1);
  const [dados, setDados]         = useState(null);                    // { registros, total, totais }
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / CONSULTA_POR_PAGINA)) : 1;
  const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }));

  // Converte os filtros do formulário em params do backend (moeda mascarada -> número; vazios viram undefined)
  const paramsBackend = useCallback((f) => ({
    venc_de: f.venc_de || undefined, venc_ate: f.venc_ate || undefined,
    valor_campo: (f.valor_de || f.valor_ate) ? f.valor_campo : undefined,
    valor_de: f.valor_de ? parseMoeda(f.valor_de) : undefined,
    valor_ate: f.valor_ate ? parseMoeda(f.valor_ate) : undefined,
    autor: f.autor || undefined, reu: f.reu || undefined,
    num_processo: f.num_processo || undefined, pasta: f.pasta || undefined,
    parceiro: f.parceiro || undefined, status: f.status || undefined,
  }), []);

  const carregar = useCallback(() => {
    setCarregando(true);
    financeiroAPI.consultaFinanceiro({ ...paramsBackend(aplicados), pagina, limite: CONSULTA_POR_PAGINA })
      .then(({ data }) => { if (data.ok) setDados(data.dados); })
      .catch(() => toast.error('Erro ao consultar'))
      .finally(() => setCarregando(false));
  }, [aplicados, pagina, paramsBackend]);
  useEffect(() => { carregar(); }, [carregar]);

  function pesquisar() { setAplicados(filtros); setPagina(1); }
  function limpar() { setFiltros(FILTRO_CONSULTA_VAZIO); setAplicados(FILTRO_CONSULTA_VAZIO); setPagina(1); }

  // Atalhos de período (preenchem as datas e já aplicam a busca)
  const fmtISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function aplicarPeriodo(de, ate) {
    const novos = { ...filtros, venc_de: de, venc_ate: ate };
    setFiltros(novos); setAplicados(novos); setPagina(1);
  }
  function periodoHoje() { const h = hojeLocal(); aplicarPeriodo(h, h); }
  function periodoSemana() {
    const h = new Date(); const dia = h.getDay(); const diff = dia === 0 ? -6 : 1 - dia; // segunda-feira
    const seg = new Date(h); seg.setDate(h.getDate() + diff);
    const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
    aplicarPeriodo(fmtISO(seg), fmtISO(dom));
  }
  function periodoMes() {
    const h = new Date();
    aplicarPeriodo(fmtISO(new Date(h.getFullYear(), h.getMonth(), 1)), fmtISO(new Date(h.getFullYear(), h.getMonth() + 1, 0)));
  }

  async function exportar() {
    setExportando(true);
    try {
      const resp = await financeiroAPI.exportarConsulta(paramsBackend(aplicados));
      const url = URL.createObjectURL(new Blob([resp.data], { type: resp.headers['content-type'] }));
      const cd = resp.headers['content-disposition'] || '';
      const m = cd.match(/filename="(.+?)"/);
      const link = document.createElement('a');
      link.href = url; link.download = m ? m[1] : 'Consulta financeira.xlsx'; link.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Erro ao exportar'); }
    finally { setExportando(false); }
  }

  const totais = dados?.totais;
  const labelStatus = s => s === 'pago' ? 'Recebida' : s === 'cancelada' ? 'Cancelada' : 'Pendente';

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Consulta do financeiro</h3>

      {/* Atalhos de período */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <button className="btn btn-outline" style={{ fontSize: 12, padding: '4px 10px' }} onClick={periodoHoje}>Hoje</button>
        <button className="btn btn-outline" style={{ fontSize: 12, padding: '4px 10px' }} onClick={periodoSemana}>Esta semana</button>
        <button className="btn btn-outline" style={{ fontSize: 12, padding: '4px 10px' }} onClick={periodoMes}>Este mês</button>
      </div>

      {/* Filtros */}
      <div className="grid-3" style={{ gap: 10, marginBottom: 10 }}>
        <div className="form-group"><label className="form-label">Vencimento de</label>
          <input type="date" className="form-control" value={filtros.venc_de} onChange={e => setF('venc_de', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Vencimento até</label>
          <input type="date" className="form-control" value={filtros.venc_ate} onChange={e => setF('venc_ate', e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Status</label>
          <select className="form-control" value={filtros.status} onChange={e => setF('status', e.target.value)}>
            <option value="">Todos</option><option value="pendente">Pendente</option>
            <option value="pago">Recebida</option><option value="cancelada">Cancelada</option>
          </select></div>
        <div className="form-group"><label className="form-label">Valor — campo</label>
          <select className="form-control" value={filtros.valor_campo} onChange={e => setF('valor_campo', e.target.value)}>
            <option value="bruto">Bruto</option><option value="liquido">Líquido</option><option value="honorario">Honorário</option>
          </select></div>
        <div className="form-group"><label className="form-label">Valor de</label>
          <input className="form-control" value={filtros.valor_de} onChange={e => setF('valor_de', mascaraMoeda(e.target.value))} placeholder="0,00" /></div>
        <div className="form-group"><label className="form-label">Valor até</label>
          <input className="form-control" value={filtros.valor_ate} onChange={e => setF('valor_ate', mascaraMoeda(e.target.value))} placeholder="0,00" /></div>
        <div className="form-group"><label className="form-label">Autor</label>
          <input className="form-control" value={filtros.autor} onChange={e => setF('autor', e.target.value)} placeholder="Nome do autor" /></div>
        <div className="form-group"><label className="form-label">Réu</label>
          <input className="form-control" value={filtros.reu} onChange={e => setF('reu', e.target.value)} placeholder="Nome do réu" /></div>
        <div className="form-group"><label className="form-label">Parceiro</label>
          <input className="form-control" value={filtros.parceiro} onChange={e => setF('parceiro', e.target.value)} placeholder="Nome do parceiro" /></div>
        <div className="form-group"><label className="form-label">Nº do processo</label>
          <input className="form-control" value={filtros.num_processo} onChange={e => setF('num_processo', e.target.value)} placeholder="Parte do número" /></div>
        <div className="form-group"><label className="form-label">Pasta (número)</label>
          <input className="form-control" value={filtros.pasta} onChange={e => setF('pasta', e.target.value)} placeholder="Ex.: 6" /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={pesquisar}>Pesquisar</button>
        <button className="btn btn-secondary" onClick={limpar}>Limpar</button>
        <button className="btn btn-outline" onClick={exportar} disabled={exportando || !dados || dados.total === 0} style={{ marginLeft: 'auto' }}>
          {exportando ? 'Exportando...' : '⬇ Exportar Excel'}
        </button>
      </div>

      {/* Totais (sobre todo o conjunto filtrado) */}
      {totais && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 12px', background: '#f8fafc', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          <span>Bruto: <strong>{formatarMoeda(totais.bruto)}</strong></span>
          <span>Honorário: <strong>{formatarMoeda(totais.honorario)}</strong></span>
          <span>Líquido: <strong>{formatarMoeda(totais.liquido)}</strong></span>
          <span>Parceria: <strong>{formatarMoeda(totais.parceria)}</strong></span>
          <span style={{ marginLeft: 'auto', color: '#6b7280' }}>{dados.total} parcela(s)</span>
        </div>
      )}

      {/* Resultado */}
      {carregando ? <div className="loading">Carregando...</div> : !dados ? null : (
        dados.registros.length === 0 ? <p className="lista-vazia">Nenhuma parcela encontrada para os filtros.</p> : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Pasta</th><th>Processo</th><th>Partes</th><th>Origem</th><th>Parc</th><th>Vencimento</th>
                  <th style={{ textAlign: 'right' }}>Bruto</th><th style={{ textAlign: 'right' }}>Honorário</th>
                  <th style={{ textAlign: 'right' }}>Líquido</th><th>Parceria</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dados.registros.map(r => (
                  <tr key={r.id}>
                    <td>{formatarNumeroPasta(r.numPasta)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.numProc || '—'}</td>
                    <td style={{ fontSize: 12, color: '#555', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.NomeTituloProc || ''}>{r.NomeTituloProc || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{r.acordo_tipo === 'alvara' ? 'Alvará' : 'Acordo'} {r.numero_acordo}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.numero}/{r.total_parcelas}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatarData(r.vencimento)}</td>
                    <td style={{ textAlign: 'right' }}>{formatarMoeda(r.valor_bruto)}</td>
                    <td style={{ textAlign: 'right' }}>{formatarMoeda(r.honor_valor)}</td>
                    <td style={{ textAlign: 'right' }}>{formatarMoeda(r.valor_liquido)}</td>
                    <td style={{ fontSize: 12 }}>{r.parceria_nome ? `${r.parceria_nome}${r.parceria_valor ? ' · ' + formatarMoeda(r.parceria_valor) : ''}` : '—'}</td>
                    <td><span className={`badge ${r.status === 'pago' ? 'badge-verde' : r.status === 'cancelada' ? 'badge-vermelho' : 'badge-azul'}`}>{labelStatus(r.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Paginação */}
      {dados && dados.total > CONSULTA_POR_PAGINA && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center', alignItems: 'center' }}>
          <button className="btn btn-outline" disabled={pagina === 1 || carregando} onClick={() => setPagina(p => p - 1)}>← Anterior</button>
          <span style={{ padding: '8px 12px', fontSize: 13 }}>Página {pagina} de {totalPaginas} · {dados.total} registros</span>
          <button className="btn btn-outline" disabled={pagina >= totalPaginas || carregando} onClick={() => setPagina(p => p + 1)}>Próxima →</button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MODAL: histórico de um lançamento da conta corrente (criado / editado)
// ============================================================
export function ModalHistoricoLancamento({ lancamento, onFechar }) {
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    financeiroAPI.historicoLancamento(lancamento.id)
      .then(r => { if (r.data.ok) setRegistros(r.data.dados); })
      .catch(() => toast.error('Erro ao carregar histórico'))
      .finally(() => setCarregando(false));
  }, [lancamento.id]);

  const LABEL_ACAO = { 'criado': 'Criado', 'editado': 'Editado' };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box" style={{ maxWidth: '620px' }}>
        <div className="modal-header">
          <h3>Histórico do lançamento</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ color: '#6b7280', fontSize: '13px', marginTop: 0 }}>{lancamento.descricao}</p>
          {carregando ? <div className="loading">Carregando...</div> : (
            registros.length === 0 ? <p className="lista-vazia">Nenhum registro</p> : (
              <div className="tabela-wrapper">
                <table className="tabela">
                  <thead><tr><th>Quando</th><th>Evento</th><th>Campo</th><th>De</th><th>Para</th><th>Usuário</th></tr></thead>
                  <tbody>
                    {registros.map(r => (
                      <tr key={r.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatarDataHora(r.criado_em)}</td>
                        <td>{LABEL_ACAO[r.acao] || r.acao}</td>
                        <td>{r.campo_alterado || '—'}</td>
                        <td>{r.acao === 'editado' ? (r.valor_anterior || '—') : '—'}</td>
                        <td>{r.valor_novo || '—'}</td>
                        <td>{r.usuario_nome || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// BLOCO DE UM ACORDO (resumo + parcelas, com baixa)
// ============================================================
export function AcordoBloco({ acordo, podeAlterar, podeExcluir, onEditar, onExcluir, onMudou }) {
  const { temPermissao } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [parcelas, setParcelas] = useState(null);
  const [recebendo, setRecebendo] = useState(null); // parcela aguardando a data do recebimento
  const [historicoDe, setHistoricoDe] = useState(null); // parcela com histórico aberto
  const [cancelando, setCancelando] = useState(false); // modal de cancelar acordo (pede motivo)
  const [recibosAcordo, setRecibosAcordo] = useState(false);
  const [multaEditando, setMultaEditando] = useState(null); // parcela lançando/editando a multa
  const [recebendoMulta, setRecebendoMulta] = useState(null); // parcela aguardando a data do recebimento da multa
  const [confirmar, setConfirmar] = useState(null); // confirmação genérica (ex.: remover multa)
  const cancelado = acordo.status === 'cancelado';
  const tipoLabel = acordo.tipo === 'alvara' ? 'Alvará' : 'Acordo';

  function cicloDaParcela(p) {
    if (p.status !== 'pago') return null;
    const pendencias = [];
    if (Number(p.valor_liquido) > 0 && !p.repasse_cliente_em) pendencias.push('cliente');
    if (p.parceria_pessoa_id && Number(p.parceria_valor) > 0 && !p.repasse_parceiro_em) pendencias.push('parceiro');
    return pendencias;
  }

  async function abrir() {
    if (!aberto && !parcelas) {
      try { const { data } = await financeiroAPI.buscarAcordo(acordo.id); if (data.ok) setParcelas(data.dados.parcelas); }
      catch { toast.error('Erro ao carregar parcelas'); }
    }
    setAberto(a => !a);
  }

  // Registra o recebimento do réu (data + forma de pagamento + identificação no extrato).
  // `dados` = { recebido_em, recebimento_forma_id, recebimento_identificacao }
  async function pagar(p, dados) {
    try {
      await financeiroAPI.pagarParcela(p.id, dados);
      toast.success('Recebimento registrado'); setRecebendo(null); setParcelas(null); setAberto(false); onMudou();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao receber'); }
  }
  async function desfazer(p) {
    try { await financeiroAPI.desfazerParcela(p.id); toast.success('Recebimento desfeito'); setParcelas(null); setAberto(false); onMudou(); }
    catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao desfazer'); }
  }
  // (O desfazer de repasse fica na aba Repasses → Concluídos, não na linha da parcela.)

  // Multa por atraso desta parcela: lançar/editar (mesmo modal), remover, receber, desfazer.
  // Ainda não recebida: fica "lançada" e não mexe na conta corrente. "Receber multa" é o
  // único passo que gera lançamento — só então o "Receber" da parcela principal libera.
  async function salvarMulta(p, dados) {
    try {
      if (p.multa) await financeiroAPI.editarMulta(p.id, dados);
      else await financeiroAPI.lancarMulta(p.id, dados);
      toast.success(p.multa ? 'Multa atualizada' : 'Multa lançada'); setMultaEditando(null); setParcelas(null); setAberto(false); onMudou();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao salvar a multa'); }
  }
  async function removerMultaDaParcela(p) {
    try { await financeiroAPI.removerMulta(p.id); toast.success('Multa removida'); setParcelas(null); setAberto(false); onMudou(); }
    catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao remover a multa'); }
  }
  async function receberMulta(p, dados) {
    try {
      await financeiroAPI.receberMulta(p.id, dados);
      toast.success('Multa recebida'); setRecebendoMulta(null); setParcelas(null); setAberto(false); onMudou();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao receber a multa'); }
  }
  async function desfazerMulta(p) {
    try { await financeiroAPI.desfazerMulta(p.id); toast.success('Recebimento da multa desfeito'); setParcelas(null); setAberto(false); onMudou(); }
    catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao desfazer o recebimento da multa'); }
  }
  // Cancela o acordo (parcelas pendentes viram canceladas; pagas permanecem). Definitivo.
  async function cancelar(motivo) {
    try {
      await financeiroAPI.cancelarAcordo(acordo.id, { motivo });
      toast.success(`${tipoLabel} cancelado`); setCancelando(false); setParcelas(null); setAberto(false); onMudou();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao cancelar'); }
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={abrir}>
          {aberto ? '▼' : '▶'} Parcelas
        </button>
        <strong>{formatarMoeda(acordo.valor_total)}</strong>
        {cancelado && <span className="badge badge-vermelho">Cancelado</span>}
        <span style={{ color: '#6b7280', fontSize: '13px' }}>
          {acordo.parcelas_pagas}/{acordo.total_parcelas_real} parcelas pagas · recebido {formatarMoeda(acordo.total_recebido || 0)}
          {acordo.numero_acordo != null && ` - ${tipoLabel} ${acordo.numero_acordo}`}
        </span>
        {acordo.descricao && <span style={{ color: '#6b7280', fontSize: '13px' }}>· {acordo.descricao}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {/* Acordo cancelado vira registro permanente: sem Editar/Excluir/Cancelar */}
          {!cancelado && podeAlterar && <button className="btn btn-outline" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={onEditar}>Editar</button>}
          {!cancelado && podeAlterar && (
            <button className="btn btn-outline" style={{ fontSize: '11px', padding: '3px 8px', color: '#d97706', borderColor: '#d97706' }}
              onClick={() => setCancelando(true)}>Cancelar</button>
          )}
          {!cancelado && podeExcluir && <button className="btn btn-danger" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={onExcluir}>Excluir</button>}
          {temPermissao('documentos', 'cadastrar') && <button className="btn btn-outline" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={() => setRecibosAcordo(true)}>Recibos</button>}
        </div>
      </div>

      {aberto && parcelas && (
        <div className="tabela-wrapper" style={{ marginTop: '10px' }}>
          <table className="tabela">
            <thead>
              <tr>
                <th>#</th><th>Vencimento</th>
                <th style={{ textAlign: 'right' }}>Bruto</th>
                <th style={{ textAlign: 'right' }}>Honorário</th>
                <th style={{ textAlign: 'right' }}>Líquido</th>
                <th>Parceria</th><th>Obs</th><th>Status</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {parcelas.map(p => (
                <React.Fragment key={p.id}>
                <tr>
                  <td>{p.numero}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatarData(p.vencimento)}</td>
                  <td style={{ textAlign: 'right' }}>{formatarMoeda(p.valor_bruto)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {p.honor_tipo === 'sem' ? '—' : formatarMoeda(p.honor_valor)}
                    {p.honor_tipo === 'percent' && p.honor_percentual != null && <span style={{ color: '#888', fontSize: 11 }}> ({p.honor_percentual}%)</span>}
                    {p.honor_tipo === 'fixo' && <span style={{ color: '#888', fontSize: 11 }}> (Fixo)</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatarMoeda(p.valor_liquido)}</td>
                  <td>{p.parceria_nome ? `${p.parceria_nome}${p.parceria_valor ? ' · ' + formatarMoeda(p.parceria_valor) : ''}` : '—'}</td>
                  <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.observacao || ''}>
                    {p.observacao || '—'}
                  </td>
                  <td>
                    <span className={`badge ${p.status === 'pago' ? 'badge-verde' : p.status === 'cancelada' ? 'badge-vermelho' : 'badge-azul'}`}
                      title={p.status === 'pago' && p.recebimento_forma_nome ? `Forma: ${p.recebimento_forma_nome}${p.recebimento_identificacao ? ' · ' + p.recebimento_identificacao : ''}` : ''}>
                      {p.status === 'pago' ? `Recebida ${p.recebido_em ? formatarData(p.recebido_em) : ''}`
                        : p.status === 'cancelada' ? 'Cancelada' : 'Pendente'}
                    </span>
                    {p.status === 'pago' && (
                      <div style={{ fontSize: 10, color: '#059669', marginTop: 2 }}>
                        {p.repasse_cliente_em ? <div>✓ Cliente {formatarData(p.repasse_cliente_em)}</div>
                          : Number(p.valor_liquido) > 0 && <div style={{ color: '#b45309' }}>○ Falta repassar ao cliente</div>}
                        {p.parceria_pessoa_id && (p.repasse_parceiro_em ? <div>✓ Parceiro {formatarData(p.repasse_parceiro_em)}</div>
                          : Number(p.parceria_valor) > 0 && <div style={{ color: '#b45309' }}>○ Falta repassar ao parceiro</div>)}
                        {cicloDaParcela(p)?.length === 0 && <div style={{ color: '#059669', fontWeight: 600 }}>✓ Ciclo concluído</div>}
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <MenuAcoes itens={[
                      // Pendente recebe; recebida desfaz (bloqueado se houver repasse); cancelada não tem ação
                      { label: 'Receber', icone: '💰',
                        oculto: !(podeAlterar && p.status === 'pendente'),
                        onClick: () => {
                          if (p.multa && p.multa.status === 'pendente') {
                            toast.info('Existe uma multa lançada nesta parcela. Receba (ou remova) a multa antes de receber a parcela.');
                            return;
                          }
                          setRecebendo(p);
                        } },
                      { label: 'Desfazer recebimento', icone: '↩️',
                        oculto: !(podeAlterar && p.status === 'pago'),
                        // Continua visível com repasse/multa pendente para poder explicar o porquê do bloqueio
                        onClick: () => {
                          if (p.multa && p.multa.status === 'pago') {
                            toast.info('Desfaça o recebimento da multa antes de desfazer o recebimento da parcela.');
                            return;
                          }
                          if (p.repasse_cliente_em || p.repasse_parceiro_em) {
                            toast.info("Desfaça os repasses na aba 'Repasses' antes de desfazer o recebimento.");
                            return;
                          }
                          desfazer(p);
                        } },
                      // Multa por atraso: só pode ser LANÇADA enquanto a parcela ainda não foi recebida.
                      // Uma vez lançada, o restante do ciclo (editar/receber/remover/desfazer) não
                      // depende mais do status da parcela em si — a parcela pode até já ter sido
                      // recebida depois (ela só destrava quando a multa é recebida).
                      { label: 'Lançar multa', icone: '⚠️',
                        oculto: !(podeAlterar && p.status === 'pendente' && !p.multa),
                        onClick: () => setMultaEditando(p) },
                      { label: 'Multa', icone: '⚠️',
                        oculto: !(podeAlterar && p.multa && p.multa.status === 'pendente'),
                        submenu: [
                          { label: 'Editar multa', icone: '✏️', onClick: () => setMultaEditando(p) },
                          { label: 'Receber multa', icone: '💰', onClick: () => setRecebendoMulta(p) },
                          { label: 'Remover multa', icone: '🗑️', perigo: true,
                            onClick: () => setConfirmar({
                              titulo: 'Remover multa', mensagem: 'A multa lançada nesta parcela será removida. Esta ação não pode ser desfeita.',
                              textoBotao: 'Remover', tipo: 'perigo', acao: () => removerMultaDaParcela(p),
                            }) },
                        ] },
                      { label: 'Desfazer recebimento da multa', icone: '↩️',
                        oculto: !(podeAlterar && p.multa && p.multa.status === 'pago'),
                        onClick: () => {
                          if (p.multa.repasse_cliente_em || p.multa.repasse_parceiro_em) {
                            toast.info("Desfaça os repasses da multa na aba 'Repasses' antes de desfazer o recebimento dela.");
                            return;
                          }
                          desfazerMulta(p);
                        } },
                      { label: 'Histórico', icone: '📋', onClick: () => setHistoricoDe(p) },
                      { label: 'Recibo', icone: '📄',
                        submenu: [
                          { label: 'Recibo — Cliente', icone: '📄',
                            oculto: !(temPermissao('documentos','cadastrar') && p.repasse_cliente_em),
                            gerarDoc: { ancoraTipo: 'pagamento', ancoraId: p.id, beneficiario: 'cliente' } },
                          { label: `Recibo — Parceiro${p.parceria_nome ? `: ${p.parceria_nome}` : ''}`, icone: '📄',
                            oculto: !(temPermissao('documentos','cadastrar') && p.repasse_parceiro_em),
                            gerarDoc: { ancoraTipo: 'pagamento', ancoraId: p.id, beneficiario: 'parceiro' } },
                        ] },
                    ]} />
                  </td>
                </tr>
                {p.multa && (
                  <tr style={{ background: '#fffbeb' }}>
                    <td style={{ textAlign: 'center' }} title="Multa por atraso desta parcela">⚠️</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e' }}>Multa ·</span>{' '}
                      {formatarData(p.multa.vencimento)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatarMoeda(p.multa.valor_bruto)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {p.multa.honor_tipo === 'sem' ? '—' : formatarMoeda(p.multa.honor_valor)}
                      {p.multa.honor_tipo === 'percent' && p.multa.honor_percentual != null && <span style={{ color: '#888', fontSize: 11 }}> ({p.multa.honor_percentual}%)</span>}
                      {p.multa.honor_tipo === 'fixo' && <span style={{ color: '#888', fontSize: 11 }}> (Fixo)</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatarMoeda(p.multa.valor_liquido)}</td>
                    <td>{p.multa.parceria_nome ? `${p.multa.parceria_nome}${p.multa.parceria_valor ? ' · ' + formatarMoeda(p.multa.parceria_valor) : ''}` : '—'}</td>
                    <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={p.multa.percentual_juiz != null ? `Percentual fixado pelo juiz: ${p.multa.percentual_juiz}%` : ''}>
                      {p.multa.percentual_juiz != null ? `${p.multa.percentual_juiz}% (juiz)` : '—'}
                    </td>
                    <td>
                      <span className={`badge ${p.multa.status === 'pago' ? 'badge-verde' : 'badge-laranja'}`}
                        title={p.multa.status === 'pago' && p.multa.recebimento_forma_nome ? `Forma: ${p.multa.recebimento_forma_nome}${p.multa.recebimento_identificacao ? ' · ' + p.multa.recebimento_identificacao : ''}` : ''}>
                        {p.multa.status === 'pago' ? `Multa recebida ${p.multa.recebido_em ? formatarData(p.multa.recebido_em) : ''}` : 'Multa pendente'}
                      </span>
                      {p.multa.status === 'pago' && (
                        <div style={{ fontSize: 10, color: '#059669', marginTop: 2 }}>
                          {p.multa.repasse_cliente_habilitado ? (p.multa.repasse_cliente_em ? <div>✓ Cliente {formatarData(p.multa.repasse_cliente_em)}</div>
                            : <div style={{ color: '#b45309' }}>○ Falta repassar ao cliente</div>) : null}
                          {p.multa.repasse_parceiro_habilitado ? (p.multa.repasse_parceiro_em ? <div>✓ Parceiro {formatarData(p.multa.repasse_parceiro_em)}</div>
                            : <div style={{ color: '#b45309' }}>○ Falta repassar ao parceiro</div>) : null}
                        </div>
                      )}
                    </td>
                    <td></td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 'bold', borderTop: '2px solid #e5e7eb' }}>
                <td colSpan={2} style={{ textAlign: 'right' }}>Total</td>
                <td style={{ textAlign: 'right' }}>{formatarMoeda(round2(parcelas.reduce((s, p) => s + Number(p.valor_bruto || 0), 0)))}</td>
                <td style={{ textAlign: 'right' }}>{formatarMoeda(round2(parcelas.reduce((s, p) => s + Number(p.honor_valor || 0), 0)))}</td>
                <td style={{ textAlign: 'right' }}>{formatarMoeda(round2(parcelas.reduce((s, p) => s + Number(p.valor_liquido || 0), 0)))}</td>
                <td>{formatarMoeda(round2(parcelas.reduce((s, p) => s + Number(p.parceria_valor || 0), 0)))}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Pergunta a data do recebimento antes de dar a baixa (default hoje) */}
      {recebendo && (
        <ModalReceberParcela parcela={recebendo}
          onCancelar={() => setRecebendo(null)}
          onConfirmar={(dados) => pagar(recebendo, dados)} />
      )}
      {historicoDe && (
        <ModalHistoricoParcela parcela={historicoDe} onFechar={() => setHistoricoDe(null)} />
      )}
      {cancelando && (
        <ModalCancelarAcordo onCancelar={() => setCancelando(false)} onConfirmar={cancelar} />
      )}
      {recibosAcordo && <ModalRecibosAcordo acordoId={acordo.id} onFechar={() => setRecibosAcordo(false)} />}
      {multaEditando && (
        <ModalMulta parcela={multaEditando}
          onCancelar={() => setMultaEditando(null)}
          onConfirmar={(dados) => salvarMulta(multaEditando, dados)} />
      )}
      {recebendoMulta && (
        <ModalReceberParcela parcela={recebendoMulta} titulo={`Receber multa da parcela ${recebendoMulta.numero}`} valorExibido={recebendoMulta.multa?.valor_bruto}
          onCancelar={() => setRecebendoMulta(null)}
          onConfirmar={(dados) => receberMulta(recebendoMulta, dados)} />
      )}
      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

// Recibos consolidados nunca misturam destinatários: cada opção reúne somente os
// repasses concluídos da mesma pessoa dentro deste acordo.
function ModalRecibosAcordo({ acordoId, onFechar }) {
  const [parcelas, setParcelas] = useState(null);
  const [escolhido, setEscolhido] = useState(null);

  useEffect(() => {
    financeiroAPI.buscarAcordo(acordoId)
      .then(({ data }) => { if (data.ok) setParcelas(data.dados.parcelas || []); })
      .catch(() => { toast.error('Erro ao carregar os repasses do acordo'); setParcelas([]); });
  }, [acordoId]);

  function nomeDoSnapshot(texto, fallback) {
    try { return JSON.parse(texto || '{}').titular || fallback; } catch { return fallback; }
  }

  const destinatarios = (() => {
    const mapa = new Map();
    for (const p of parcelas || []) {
      const adicionar = (tipoRecibo, pessoaTipo, pessoaId, nome) => {
        if (!pessoaTipo || !pessoaId) return;
        const chave = `${tipoRecibo}:${pessoaTipo}:${pessoaId}`;
        const atual = mapa.get(chave) || { tipoRecibo, pessoaTipo, pessoaId, nome: nome || (tipoRecibo === 'cliente' ? 'Cliente' : 'Parceiro'), quantidade: 0 };
        atual.quantidade += 1;
        mapa.set(chave, atual);
      };
      if (p.repasse_cliente_em) adicionar('cliente', p.repasse_cliente_tipo, p.repasse_cliente_pessoa_id,
        nomeDoSnapshot(p.repasse_cliente_destino_snapshot, 'Cliente'));
      if (p.repasse_parceiro_em) adicionar('parceiro', p.parceria_pessoa_tipo, p.parceria_pessoa_id, p.parceria_nome);
    }
    return [...mapa.values()];
  })();

  if (escolhido) return <ModalGerar ancoraTipo="acordo" ancoraId={acordoId}
    beneficiario={escolhido.tipoRecibo} destinatarioTipo={escolhido.pessoaTipo} destinatarioId={escolhido.pessoaId}
    onFechar={() => setEscolhido(null)} />;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-header"><h3>Recibos do acordo</h3><button className="modal-fechar" onClick={onFechar}>✕</button></div>
        <div className="modal-body">
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>Escolha o destinatário. O recibo reunirá somente os repasses já concluídos para essa pessoa.</p>
          {parcelas === null ? <div className="loading">Carregando...</div>
            : destinatarios.length === 0 ? <p className="lista-vazia">Ainda não há repasses concluídos neste acordo.</p>
            : destinatarios.map(d => <button key={`${d.tipoRecibo}:${d.pessoaTipo}:${d.pessoaId}`} className="btn btn-outline"
              style={{ width: '100%', marginBottom: 8, textAlign: 'left' }} onClick={() => setEscolhido(d)}>
              📄 Recibo consolidado — {d.tipoRecibo === 'cliente' ? 'Cliente' : 'Parceiro'}: {d.nome} ({d.quantidade} parcela{d.quantidade === 1 ? '' : 's'})
            </button>)}
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onFechar}>Fechar</button></div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL: cancelar acordo (pede o motivo). Definitivo — só as parcelas pendentes são canceladas.
// ============================================================
function ModalCancelarAcordo({ onCancelar, onConfirmar }) {
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    if (!motivo.trim()) return toast.error('Informe o motivo do cancelamento');
    setSalvando(true);
    await onConfirmar(motivo.trim());
    setSalvando(false);
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h3>Cancelar acordo</h3>
          <button className="modal-fechar" onClick={onCancelar}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ color: '#6b7280', fontSize: '13px', marginTop: 0 }}>
            As parcelas <strong>pendentes</strong> serão canceladas (as já recebidas permanecem). O acordo vira
            um registro permanente. Esta ação não pode ser desfeita.
          </p>
          <div className="form-group">
            <label className="form-label">Motivo do cancelamento *</label>
            <textarea className="form-control" rows={3} value={motivo}
              onChange={e => setMotivo(e.target.value)} autoFocus
              placeholder="Ex: cliente refez o acordo / réu renegociou..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancelar}>Voltar</button>
          <button className="btn btn-danger" onClick={confirmar} disabled={salvando}>
            {salvando ? 'Cancelando...' : 'Cancelar acordo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL: histórico de uma parcela (criada / editada / recebida / desfeita)
// ============================================================
function ModalHistoricoParcela({ parcela, onFechar }) {
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    financeiroAPI.historicoParcela(parcela.id)
      .then(r => { if (r.data.ok) setRegistros(r.data.dados); })
      .catch(() => toast.error('Erro ao carregar histórico'))
      .finally(() => setCarregando(false));
  }, [parcela.id]);

  const LABEL_ACAO = {
    'criada': 'Criada', 'editada': 'Editada', 'recebida': 'Recebida', 'recebimento-desfeito': 'Recebimento desfeito', 'cancelada': 'Cancelada',
    'repasse-cliente': 'Repasse ao cliente', 'repasse-parceiro': 'Repasse ao parceiro',
    'repasse-cliente-desfeito': 'Repasse ao cliente desfeito', 'repasse-parceiro-desfeito': 'Repasse ao parceiro desfeito',
    'multa-lancada': 'Multa lançada', 'multa-editada': 'Multa editada', 'multa-removida': 'Multa removida',
    'multa-recebida': 'Multa recebida', 'multa-recebimento-desfeito': 'Recebimento da multa desfeito',
    'multa-rep-cliente': 'Repasse da multa ao cliente', 'multa-rep-parceiro': 'Repasse da multa ao parceiro',
    'multa-rep-cliente-desfeito': 'Repasse da multa ao cliente desfeito', 'multa-rep-parceiro-desfeito': 'Repasse da multa ao parceiro desfeito',
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box" style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <h3>Histórico da parcela {parcela.numero}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {carregando ? <div className="loading">Carregando...</div> : (
            registros.length === 0 ? <p className="lista-vazia">Nenhum registro</p> : (
              <div className="tabela-wrapper">
                <table className="tabela">
                  <thead><tr><th>Quando</th><th>Evento</th><th>Campo</th><th>De</th><th>Para</th><th>Usuário</th></tr></thead>
                  <tbody>
                    {registros.map(r => (
                      <tr key={r.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatarDataHora(r.criado_em)}</td>
                        <td>{LABEL_ACAO[r.acao] || r.acao}</td>
                        <td>{r.campo_alterado || '—'}</td>
                        <td>{r.acao === 'editada' ? (r.valor_anterior || '—') : '—'}</td>
                        <td>{r.valor_novo || '—'}</td>
                        <td>{r.usuario_nome || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL: data do recebimento de uma parcela
// ============================================================
function ModalReceberParcela({ parcela, onCancelar, onConfirmar, titulo, valorExibido }) {
  const [data, setData] = useState(hojeLocal());          // data em que o réu pagou (default hoje)
  const [formaId, setFormaId] = useState('');             // forma de pagamento do recebimento
  const [identificacao, setIdentificacao] = useState(''); // identificação no extrato bancário
  const [formas, setFormas] = useState([]);               // formas cadastradas (Controle)
  const [salvando, setSalvando] = useState(false);
  const [contasEscritorio, setContasEscritorio] = useState([]);
  const [contaEscritorioId, setContaEscritorioId] = useState('');
  const contaRecebimento = contasEscritorio.find(c => Number(c.id) === Number(contaEscritorioId));
  const formasCompativeis = formas.filter(f => !contaRecebimento || f.uso_permitido === 'ambos' || f.uso_permitido === (contaRecebimento.tipo === 'especie' ? 'especie' : 'financeira'));

  // Carrega as formas de pagamento ativas para o select
  useEffect(() => {
    financeiroAPI.formasPagamento()
      .then(({ data }) => { if (data.ok) setFormas(data.dados); })
      .catch(() => toast.error('Erro ao carregar formas de pagamento'));
  }, []);
  useEffect(() => {
    financeiroAPI.contasEscritorio().then(({ data }) => { if (data.ok) setContasEscritorio(data.dados); })
      .catch(() => toast.error('Erro ao carregar contas do escritório'));
  }, []);

  async function confirmar() {
    if (!data) return toast.error('Informe a data do recebimento');
    if (!contaEscritorioId) return toast.error('Informe a conta ou caixa de recebimento');
    if (!formaId) return toast.error('Informe a forma de recebimento');
    setSalvando(true);
    await onConfirmar({
      recebido_em: data,
      recebimento_forma_id: parseInt(formaId, 10),
      recebimento_identificacao: identificacao.trim() || null,
      recebimento_conta_financeira_id: Number(contaEscritorioId),
    });
    setSalvando(false);
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box" style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <h3>{titulo || `Receber parcela ${parcela.numero}`}</h3>
          <button className="modal-fechar" onClick={onCancelar}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Data do recebimento *</label>
            <input type="date" className="form-control" value={data}
              onChange={e => setData(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Conta ou caixa de recebimento *</label>
            <select className="form-control" value={contaEscritorioId} onChange={e => { setContaEscritorioId(e.target.value); setFormaId(''); }}>
              <option value="">Selecione a conta ou caixa...</option>
              {contasEscritorio.map(c => <option key={c.id} value={c.id}>{c.instituicao_nome ? `${c.instituicao_nome} — ${c.nome}` : c.nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Forma de recebimento *</label>
            <select className="form-control" value={formaId} onChange={e => setFormaId(e.target.value)}>
              <option value="">Selecione...</option>
              {formasCompativeis.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
            {formas.length === 0 && (
              <small style={{ color: '#b45309' }}>
                Nenhuma forma cadastrada. Cadastre em Controle → Formas de pagamento.
              </small>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Identificação no extrato</label>
            <input type="text" className="form-control" value={identificacao}
              placeholder="Ex.: PIX, nº do depósito/cheque, TED..."
              onChange={e => setIdentificacao(e.target.value)} />
          </div>
          <p style={{ color: '#6b7280', fontSize: '13px' }}>
            Valor: <strong>{formatarMoeda(valorExibido ?? parcela.valor_bruto)}</strong>
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Confirmar recebimento'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL: lançar/editar a multa por atraso de uma parcela.
// O percentual e os checkboxes de repasse vêm pré-preenchidos (do cadastro do acordo, na
// 1ª vez; da própria multa, ao editar) mas continuam editáveis. Honorário/parceria da multa
// são calculados pelo backend com o MESMO honor_tipo/percentual e parceria já desta parcela.
// ============================================================
function ModalMulta({ parcela, onCancelar, onConfirmar }) {
  const multa = parcela.multa;
  const [percentualJuiz, setPercentualJuiz] = useState(multa?.percentual_juiz ?? parcela.multa_percentual ?? '');
  // Sem multa existente mas com percentual padrão do acordo: já calcula o valor (mesma
  // fórmula do onChangePercentual), pra não nascer com o % preenchido e o valor em branco.
  const [valorBruto, setValorBruto] = useState(() => {
    if (multa) return numeroParaMascaraMoeda(multa.valor_bruto);
    const pct = Number(parcela.multa_percentual);
    if (pct > 0) return numeroParaMascaraMoeda(Number(parcela.valor_bruto) * pct / 100);
    return '';
  });
  const [vencimento, setVencimento] = useState(multa ? String(multa.vencimento).slice(0, 10) : hojeLocal());
  const [repasseCliente, setRepasseCliente] = useState(!!multa?.repasse_cliente_habilitado);
  const [repasseParceiro, setRepasseParceiro] = useState(!!multa?.repasse_parceiro_habilitado);
  const [salvando, setSalvando] = useState(false);
  const temParceiro = !!parcela.parceria_pessoa_id;

  // % preenche o valor automaticamente (base = valor bruto da própria parcela); editar o
  // valor na mão zera o % e o valor digitado passa a prevalecer.
  function onChangePercentual(e) {
    const texto = e.target.value;
    setPercentualJuiz(texto);
    const pct = parseFloat(texto.replace(',', '.'));
    if (texto !== '' && !isNaN(pct) && pct > 0) {
      setValorBruto(numeroParaMascaraMoeda(Number(parcela.valor_bruto) * pct / 100));
    }
  }
  function onChangeValor(e) {
    setValorBruto(mascaraMoeda(e.target.value));
    setPercentualJuiz('');
  }

  async function confirmar() {
    if (parseMoeda(valorBruto) <= 0) return toast.error('Informe o valor da multa');
    if (!vencimento) return toast.error('Informe a data em que a multa deve ser paga');
    setSalvando(true);
    await onConfirmar({
      percentual_juiz: percentualJuiz === '' ? null : Number(percentualJuiz),
      valor_bruto: parseMoeda(valorBruto), vencimento,
      repasse_cliente_habilitado: repasseCliente,
      repasse_parceiro_habilitado: temParceiro ? repasseParceiro : false,
    });
    setSalvando(false);
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <h3>{multa ? 'Editar multa' : 'Lançar multa'} — parcela {parcela.numero}</h3>
          <button className="modal-fechar" onClick={onCancelar}>✕</button>
        </div>
        <div className="modal-body">
          <div className="grid-2" style={{ gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Percentual da multa (%)</label>
              <input type="number" step="0.01" min="0" className="form-control" value={percentualJuiz}
                onChange={onChangePercentual} placeholder="Ex: 10" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Valor da multa (R$) *</label>
              <input type="text" inputMode="numeric" className="form-control" value={valorBruto}
                onChange={onChangeValor} placeholder="0,00" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Data em que a multa deve ser paga *</label>
            <input type="date" className="form-control" value={vencimento} onChange={e => setVencimento(e.target.value)} />
          </div>
          <p style={{ color: '#6b7280', fontSize: '13px', marginTop: 0 }}>
            O escritório sempre fica com o honorário desta multa. Marque abaixo só se parte dela também for repassada.
          </p>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" id="multaRepCliente" checked={repasseCliente} onChange={e => setRepasseCliente(e.target.checked)} />
            <label htmlFor="multaRepCliente" style={{ margin: 0 }}>Repasse ao cliente</label>
          </div>
          {temParceiro && (
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" id="multaRepParceiro" checked={repasseParceiro} onChange={e => setRepasseParceiro(e.target.checked)} />
              <label htmlFor="multaRepParceiro" style={{ margin: 0 }}>Repasse ao parceiro{parcela.parceria_nome ? ` (${parcela.parceria_nome})` : ''}</label>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar multa'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL: LANÇAMENTO (entrada / saída) — manual
// ============================================================
export function ModalLancamento({ processoId, lancamento, onFechar }) {
  const [form, setForm] = useState(lancamento
    ? { tipo: lancamento.tipo, data: String(lancamento.data).slice(0, 10), descricao: lancamento.descricao, valor: numeroParaMascaraMoeda(lancamento.valor) }
    : { tipo: 'saida', data: hojeLocal(), valor: '' });
  const [salvando, setSalvando] = useState(false);
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function salvar() {
    if (!form.descricao || !String(form.descricao).trim()) return toast.error('Descrição é obrigatória');
    const valorNum = parseMoeda(form.valor);
    if (valorNum <= 0) return toast.error('Valor deve ser maior que zero');
    setSalvando(true);
    const payload = { ...form, valor: valorNum };
    try {
      if (lancamento) await financeiroAPI.editarLanc(lancamento.id, payload);
      else await financeiroAPI.lancar(processoId, payload);
      toast.success(lancamento ? 'Lançamento atualizado!' : 'Lançamento registrado!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-pequeno">
        <div className="modal-header">
          <h3>{lancamento ? 'Editar Lançamento' : 'Novo Lançamento'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-control" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Data *</label>
              <input type="date" className="form-control" value={form.data} onChange={e => set('data', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Descrição *</label>
            <input className="form-control" autoComplete="off" value={form.descricao || ''}
              onChange={e => set('descricao', e.target.value)}
              onBlur={() => set('descricao', toTitleCase(form.descricao))}
              placeholder="Ex: Cartório, gasolina, adiantamento ao cliente..." />
          </div>
          <div className="form-group">
            <label className="form-label">Valor (R$) *</label>
            <input type="text" inputMode="numeric" className="form-control" value={form.valor || ''}
              onChange={e => set('valor', mascaraMoeda(e.target.value))} placeholder="0,00" />
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
// MODAL: ACORDO — gera a tabela de parcelas, edita linha a linha, salva
// ============================================================
export function ModalAcordo({ processoId, acordoId, tipo, onFechar, descricaoInicial }) {
  const { temPermissao } = useAuth();
  const podeCadastrarContaBeneficiario = temPermissao('financeiro', 'alterar') && temPermissao('pessoas', 'alterar');
  const [tipoAcordo, setTipoAcordo] = useState(tipo || 'acordo'); // 'acordo' | 'alvara'
  const tipoLabel = tipoAcordo === 'alvara' ? 'Alvará' : 'Acordo';
  // descricaoInicial: pré-preenche a descrição (usado quando o acordo é aberto a partir do "Registrar Ata")
  const [cab, setCab] = useState({ descricao: descricaoInicial || '', valor_total: '', qtd_parcelas: '', data_primeira: '', honor_percentual: 30, multa_percentual: '' });
  const [parcelas, setParcelas] = useState([]);
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [parceriaRow, setParceriaRow] = useState(null); // índice da parcela editando parceria
  const [parceriaAcordo, setParceriaAcordo] = useState(null); // parceria aplicada a TODAS as parcelas
  const [modalParcAcordo, setModalParcAcordo] = useState(false);
  const [confirmar, setConfirmar] = useState(null); // confirmação (ex.: total do acordo mudou)
  const [beneficiarios, setBeneficiarios] = useState([]);
  const [beneficiarioTipo, setBeneficiarioTipo] = useState('');
  const [beneficiarioId, setBeneficiarioId] = useState('');
  const [contasBeneficiario, setContasBeneficiario] = useState([]);
  const [contaBeneficiarioId, setContaBeneficiarioId] = useState('');
  const [modalNovaContaBeneficiario, setModalNovaContaBeneficiario] = useState(false);
  // Mesma guarda contra resposta desatualizada usada em ModalRepasse: trocar de beneficiário
  // rápido não pode deixar a conta bancária de outra pessoa selecionada (auditoria 23/09).
  const contasBeneficiarioSeqRef = useRef(0);

  const beneficiarioSelecionado = beneficiarios.find(b => b.tipo === beneficiarioTipo && String(b.id) === String(beneficiarioId));

  useEffect(() => {
    financeiroAPI.beneficiariosProcesso(processoId).then(({ data }) => { if (data.ok) setBeneficiarios(data.dados); })
      .catch(() => toast.error('Erro ao carregar pessoas vinculadas ao processo'));
  }, [processoId]);
  useEffect(() => {
    const minhaSeq = ++contasBeneficiarioSeqRef.current;
    if (!beneficiarioTipo || !beneficiarioId) { setContasBeneficiario([]); return; }
    financeiroAPI.contasBeneficiario(beneficiarioTipo, beneficiarioId).then(({ data }) => {
      if (minhaSeq !== contasBeneficiarioSeqRef.current) return; // já trocou de beneficiário depois desta busca
      if (data.ok) { setContasBeneficiario(data.dados); if (!contaBeneficiarioId) setContaBeneficiarioId(data.dados.find(c => c.principal)?.id || ''); }
    }).catch(() => toast.error('Erro ao carregar contas do beneficiário'));
  }, [beneficiarioTipo, beneficiarioId]);

  async function aoCadastrarContaBeneficiario(novaContaId) {
    try {
      const { data } = await financeiroAPI.contasBeneficiario(beneficiarioTipo, beneficiarioId);
      if (data.ok) {
        setContasBeneficiario(data.dados);
        setContaBeneficiarioId(String(novaContaId));
      }
      setModalNovaContaBeneficiario(false);
      toast.success('Conta cadastrada e definida como padrão do acordo.');
    } catch {
      toast.error('A conta foi cadastrada, mas não foi possível atualizar a lista agora.');
    }
  }

  // Edição: carrega o acordo existente
  useEffect(() => {
    if (!acordoId) return;
    financeiroAPI.buscarAcordo(acordoId).then(({ data }) => {
      if (data.ok) {
        setTipoAcordo(data.dados.tipo || 'acordo');
        setBeneficiarioTipo(data.dados.beneficiario_cliente_tipo || '');
        setBeneficiarioId(data.dados.beneficiario_cliente_id || '');
        setContaBeneficiarioId(data.dados.beneficiario_cliente_conta_id || '');
        setCab({
          descricao: data.dados.descricao || '', valor_total: numeroParaMascaraMoeda(data.dados.valor_total),
          qtd_parcelas: data.dados.qtd_parcelas, data_primeira: String(data.dados.data_primeira).slice(0, 10),
          honor_percentual: 30, multa_percentual: '',
        });
        setParcelas(data.dados.parcelas.map(p => ({
          ...p,
          vencimento: String(p.vencimento).slice(0, 10),
          valor_bruto: numeroParaMascaraMoeda(p.valor_bruto),
          honor_valor: p.honor_tipo === 'fixo' ? numeroParaMascaraMoeda(p.honor_valor) : '',
          parceria_valor: p.parceria_tipo === 'fixo' ? numeroParaMascaraMoeda(p.parceria_valor) : '',
        })));
      }
    }).catch(() => toast.error('Erro ao carregar acordo'));
  }, [acordoId]);

  function setC(k, v) { setCab(c => ({ ...c, [k]: v })); }

  function gerar() {
    if (parseMoeda(cab.valor_total) <= 0) return toast.error('Informe o valor total');
    if (!cab.qtd_parcelas || Number(cab.qtd_parcelas) < 1) return toast.error('Informe a quantidade de parcelas');
    if (!cab.data_primeira) return toast.error('Informe a data da primeira parcela');

    // Avisa se a 1ª parcela está com data retroativa (antes de hoje)
    const hoje = hojeLocal();
    if (cab.data_primeira < hoje) {
      setConfirmar({
        titulo: 'Data retroativa',
        mensagem: `A 1ª parcela está com data anterior a hoje (${formatarData(cab.data_primeira)}). Deseja gerar as parcelas mesmo assim?`,
        textoBotao: 'Sim, gerar',
        tipo: 'aviso',
        acao: executarGerar,
      });
      return;
    }
    executarGerar();
  }

  async function executarGerar() {
    setGerando(true);
    try {
      const { data } = await financeiroAPI.previaParcelas({
        valor_total: parseMoeda(cab.valor_total), qtd_parcelas: cab.qtd_parcelas,
        data_primeira: cab.data_primeira, honor_percentual: cab.honor_percentual, multa_percentual: cab.multa_percentual,
      });
      // backend devolve números → converte campos de moeda p/ string mascarada nos inputs
      if (data.ok) setParcelas(data.dados.parcelas.map(p => ({
        ...p,
        valor_bruto: numeroParaMascaraMoeda(p.valor_bruto),
        honor_valor: p.honor_tipo === 'fixo' ? numeroParaMascaraMoeda(p.honor_valor) : '',
        parceria_valor: '',
        ...(parceriaAcordo || {}),   // se houver parceria do acordo, já aplica em todas
      })));
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao gerar parcelas'); }
    finally { setGerando(false); }
  }

  // Atualiza um campo da parcela (sem recálculo: os valores derivados são computados na renderização)
  function setParc(i, campo, valor) {
    setParcelas(arr => arr.map((p, idx) => idx === i ? { ...p, [campo]: valor } : p));
  }

  function aplicarParceria(i, dados) {
    setParcelas(arr => arr.map((p, idx) => idx === i ? { ...p, ...dados } : p));
    setParceriaRow(null);
  }

  // Parceria do ACORDO INTEIRO: aplica (ou limpa) a mesma parceria em todas as parcelas
  function aplicarParceriaAcordo(dados) {
    setParceriaAcordo(dados.parceria_pessoa_id ? dados : null);
    setParcelas(arr => arr.map(p => ({ ...p, ...dados })));
    setModalParcAcordo(false);
  }

  const somaBruto = parcelas.reduce((s, p) => s + parseMoeda(p.valor_bruto), 0);
  const temParcelasRecebidas = parcelas.some(p => p.status === 'pago');

  function salvar() {
    if (!parcelas.length) return toast.error('Gere as parcelas primeiro');
    // Trava (A): honorário fixo não pode passar do bruto da parcela
    const excede = parcelas.find(p => p.honor_tipo === 'fixo' && parseMoeda(p.honor_valor) > parseMoeda(p.valor_bruto));
    if (excede) return toast.error(`Parcela ${excede.numero}: o honorário (${formatarMoeda(parseMoeda(excede.honor_valor))}) não pode ser maior que o bruto (${formatarMoeda(parseMoeda(excede.valor_bruto))}).`);

    // Se a soma das parcelas ficou diferente do valor total informado, confirma antes de salvar
    const totalInformado = round2(parseMoeda(cab.valor_total));
    const totalParcelas = round2(somaBruto);
    if (totalInformado !== totalParcelas) {
      setConfirmar({
        titulo: 'Total do acordo alterado',
        mensagem: `Esta alteração muda o valor total do acordo: de ${formatarMoeda(totalInformado)} passará a ${formatarMoeda(totalParcelas)}. Confirma?`,
        textoBotao: 'Sim, salvar',
        tipo: 'aviso',
        acao: executarSalvar,
      });
      return;
    }
    executarSalvar();
  }

  async function executarSalvar() {
    setSalvando(true);
    // Converte os campos de moeda mascarados de volta p/ número (o backend recalcula honor/líquido/parceria)
    const parcelasNum = parcelas.map(p => ({
      ...p,
      valor_bruto: parseMoeda(p.valor_bruto),
      honor_percentual: p.honor_tipo === 'percent' ? (Number(p.honor_percentual) || 0) : null,
      honor_valor: p.honor_tipo === 'fixo' ? parseMoeda(p.honor_valor) : 0,
      parceria_percentual: p.parceria_tipo === 'percent' ? (Number(p.parceria_percentual) || 0) : null,
      parceria_valor: p.parceria_tipo === 'fixo' ? parseMoeda(p.parceria_valor) : null,
    }));
    const payload = {
      tipo: tipoAcordo,
      descricao: cab.descricao || null, valor_total: round2(somaBruto),
      qtd_parcelas: parcelasNum.length, data_primeira: parcelasNum[0].vencimento, parcelas: parcelasNum,
      beneficiario_cliente_tipo: beneficiarioTipo || null, beneficiario_cliente_id: beneficiarioId || null,
      beneficiario_cliente_conta_id: contaBeneficiarioId || null,
    };
    try {
      if (acordoId) await financeiroAPI.atualizarAcordo(acordoId, payload);
      else await financeiroAPI.criarAcordo(processoId, payload);
      toast.success(acordoId ? `${tipoLabel} atualizado!` : `${tipoLabel} criado!`);
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao salvar acordo'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande" style={{ maxWidth: '1100px' }}>
        <div className="modal-header">
          <h3>{acordoId ? `Editar ${tipoLabel}` : `Novo ${tipoLabel}`}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          {/* Cabeçalho: dados do acordo + gerar */}
          <div className="grid-4" style={{ gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Valor total (R$) *</label>
              <input type="text" inputMode="numeric" className="form-control" value={cab.valor_total}
                onChange={e => setC('valor_total', mascaraMoeda(e.target.value))} placeholder="0,00" />
            </div>
            <div className="form-group">
              <label className="form-label">Nº de parcelas *</label>
              <input type="number" min="1" className="form-control" value={cab.qtd_parcelas}
                onChange={e => setC('qtd_parcelas', e.target.value)} placeholder="Ex: 25" />
            </div>
            <div className="form-group">
              <label className="form-label">1ª parcela *</label>
              <input type="date" className="form-control" value={cab.data_primeira}
                onChange={e => setC('data_primeira', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Honorário padrão (%)</label>
              <input type="number" step="0.01" min="0" max="100" className="form-control" value={cab.honor_percentual}
                onChange={e => setC('honor_percentual', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Multa por atraso (%)</label>
              <input type="number" step="0.01" min="0" className="form-control" value={cab.multa_percentual}
                onChange={e => setC('multa_percentual', e.target.value)} placeholder="Ex: 10 (opcional)" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Descrição (opcional)</label>
            <input className="form-control" autoComplete="off" value={cab.descricao}
              onChange={e => setC('descricao', e.target.value)} placeholder="Ex: Acordo trabalhista homologado" />
          </div>
          <div className="grid-2" style={{ gap: '12px' }}>
            <div className="form-group"><label className="form-label">Beneficiário padrão das parcelas</label>
              <select className="form-control" value={beneficiarioId ? `${beneficiarioTipo}:${beneficiarioId}` : ''}
                onChange={e => { const [t, id] = e.target.value.split(':'); setBeneficiarioTipo(t || ''); setBeneficiarioId(id || ''); setContaBeneficiarioId(''); }}>
                <option value="">Definir depois, no repasse</option>
                {beneficiarios.map(b => <option key={`${b.tipo}:${b.id}`} value={`${b.tipo}:${b.id}`}>{b.nome}</option>)}
              </select></div>
            <div className="form-group"><label className="form-label">Conta padrão do beneficiário</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select className="form-control" value={contaBeneficiarioId} disabled={!beneficiarioId} onChange={e => setContaBeneficiarioId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {contasBeneficiario.map(c => <option key={c.id} value={c.id}>{c.instituicao_nome} — {c.numero || c.chave_pix || c.titular}</option>)}
                </select>
                {podeCadastrarContaBeneficiario && <button type="button" className="btn btn-outline" title={beneficiarioId ? 'Cadastrar conta do beneficiário' : 'Selecione primeiro o beneficiário'}
                  disabled={!beneficiarioId} onClick={() => setModalNovaContaBeneficiario(true)} style={{ minWidth: '42px', padding: '0 10px' }}>...</button>}
              </div></div>
          </div>
          <button className="btn btn-outline" onClick={gerar} disabled={gerando || temParcelasRecebidas}
            title={temParcelasRecebidas ? 'Não é possível regenerar parcelas após um recebimento.' : ''} style={{ marginBottom: '12px' }}>
            {gerando ? 'Gerando...' : (parcelas.length ? '↻ Regerar parcelas' : 'Gerar parcelas')}
          </button>
          {/* Parceria de TODO o acordo — aplica a mesma parceria em todas as parcelas */}
          <button type="button" className="btn btn-outline" style={{ marginBottom: '12px', marginLeft: '8px' }}
            onClick={() => setModalParcAcordo(true)} disabled={temParcelasRecebidas}
            title={temParcelasRecebidas ? 'Não é possível alterar todas as parcelas após um recebimento.' : ''}>
            {parceriaAcordo?.parceria_pessoa_id ? `👥 Parceria do acordo: ${parceriaAcordo.parceria_nome}` : '+ Parceria do acordo (todas as parcelas)'}
          </button>
          {parcelas.length > 0 && (
            <span style={{ marginLeft: '12px', color: '#6b7280', fontSize: '13px' }}>
              Soma bruta: <strong>{formatarMoeda(somaBruto)}</strong>
            </span>
          )}

          {/* Tabela editável */}
          {parcelas.length > 0 && (
            <div className="tabela-wrapper" style={{ marginTop: '8px' }}>
              <table className="tabela" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>#</th><th>Vencimento</th><th>Bruto</th><th>Honor.</th>
                    <th>%/Valor</th><th>Líquido</th><th>Parceria</th><th>Obs</th>
                  </tr>
                </thead>
                <tbody>
                  {parcelas.map((p, i) => {
                    const parcelaRecebida = p.status === 'pago';
                    return (
                    <tr key={i} style={parcelaRecebida ? { background: '#eff6ff' } : undefined}>
                      <td>{p.numero || i + 1}{parcelaRecebida && <span title="Parcela recebida: não pode ser alterada" style={{ marginLeft: 5 }}>🔒</span>}</td>
                      <td>
                        <input type="date" className="form-control" style={{ minWidth: '140px', padding: '4px 6px' }}
                          value={p.vencimento} disabled={parcelaRecebida} onChange={e => setParc(i, 'vencimento', e.target.value)} />
                      </td>
                      <td>
                        <input type="text" inputMode="numeric" className="form-control" style={{ width: '110px', padding: '4px 6px' }}
                          value={p.valor_bruto} disabled={parcelaRecebida} onChange={e => setParc(i, 'valor_bruto', mascaraMoeda(e.target.value))} />
                      </td>
                      <td>
                        <select className="form-control" style={{ width: '90px', padding: '4px 6px' }}
                          value={p.honor_tipo} disabled={parcelaRecebida} onChange={e => setParc(i, 'honor_tipo', e.target.value)}>
                          <option value="percent">%</option>
                          <option value="fixo">Fixo</option>
                          <option value="sem">Sem</option>
                        </select>
                      </td>
                      <td>
                        {p.honor_tipo === 'percent' && (
                          <input type="number" step="0.01" className="form-control" style={{ width: '70px', padding: '4px 6px' }}
                            value={p.honor_percentual ?? ''} disabled={parcelaRecebida} onChange={e => setParc(i, 'honor_percentual', e.target.value)} />
                        )}
                        {p.honor_tipo === 'fixo' && (
                          <>
                            <input type="text" inputMode="numeric"
                              className={`form-control ${parseMoeda(p.honor_valor) > parseMoeda(p.valor_bruto) ? 'is-invalid' : ''}`}
                              style={{ width: '100px', padding: '4px 6px' }}
                              value={p.honor_valor ?? ''} disabled={parcelaRecebida} onChange={e => setParc(i, 'honor_valor', mascaraMoeda(e.target.value))} />
                            {parseMoeda(p.honor_valor) > parseMoeda(p.valor_bruto) && (
                              <div style={{ color: '#dc2626', fontSize: 10, marginTop: 2 }}>
                                Máx. {formatarMoeda(parseMoeda(p.valor_bruto))} (não passa do bruto)
                              </div>
                            )}
                          </>
                        )}
                        {p.honor_tipo === 'sem' && <span style={{ color: '#888' }}>—</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatarMoeda(liquidoDaParcela(p))}</td>
                      <td>
                        {p.parceria_pessoa_id
                          ? <button className="btn btn-outline" title={`${p.parceria_nome || 'Parceiro'}${parceriaDaParcela(p) ? ' · ' + formatarMoeda(parceriaDaParcela(p)) : ''}`}
                              style={{ fontSize: '11px', padding: '2px 6px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' }}
                              disabled={parcelaRecebida} onClick={() => setParceriaRow(i)}>{p.parceria_nome || 'Parceiro'}{parceriaDaParcela(p) ? ` · ${formatarMoeda(parceriaDaParcela(p))}` : ''}</button>
                          : <button className="btn btn-outline" style={{ fontSize: '11px', padding: '2px 6px', whiteSpace: 'nowrap' }}
                              disabled={parcelaRecebida} onClick={() => setParceriaRow(i)}>+ parceria</button>}
                      </td>
                      <td>
                        <input className="form-control" style={{ width: '120px', padding: '4px 6px' }}
                          value={p.observacao || ''} disabled={parcelaRecebida} onChange={e => setParc(i, 'observacao', e.target.value)} />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando || !parcelas.length}>
            {salvando ? 'Salvando...' : (acordoId ? 'Salvar alterações' : `Salvar ${tipoLabel.toLowerCase()}`)}
          </button>
        </div>
      </div>

      {/* Sub-modal: definir parceria de uma parcela */}
      {parceriaRow !== null && (
        <ModalParceriaParcela parcela={parcelas[parceriaRow]}
          onCancelar={() => setParceriaRow(null)}
          onAplicar={(dados) => aplicarParceria(parceriaRow, dados)} />
      )}
      {modalParcAcordo && (
        <ModalParceriaParcela parcela={parceriaAcordo || {}} titulo="Parceria do acordo (todas as parcelas)"
          onCancelar={() => setModalParcAcordo(false)}
          onAplicar={aplicarParceriaAcordo} />
      )}
      {modalNovaContaBeneficiario && beneficiarioId && (
        <ModalNovaContaBeneficiario tipo={beneficiarioTipo} pessoaId={beneficiarioId} nome={beneficiarioSelecionado?.nome || 'beneficiário'}
          onFechar={() => setModalNovaContaBeneficiario(false)} onSalva={aoCadastrarContaBeneficiario} />
      )}
      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

// ============================================================
// SUB-MODAL: parceria de uma parcela (pessoa + % do honorário ou valor fixo)
// ============================================================
function ModalParceriaParcela({ parcela, onCancelar, onAplicar, titulo = 'Parceria da parcela' }) {
  const [tipoPessoa, setTipoPessoa] = useState(parcela.parceria_pessoa_tipo || 'fisica');
  const [busca, setBusca] = useState(parcela.parceria_nome || '');
  const [resultados, setResultados] = useState([]);
  const [sel, setSel] = useState(parcela.parceria_pessoa_id
    ? { id: parcela.parceria_pessoa_id, tipo: parcela.parceria_pessoa_tipo, nome: parcela.parceria_nome } : null);
  const [tipo, setTipo] = useState(parcela.parceria_tipo || 'percent');
  const [percentual, setPercentual] = useState(parcela.parceria_percentual ?? 50);
  const [valorFixo, setValorFixo] = useState(parcela.parceria_valor ?? '');

  async function buscar(termo) {
    if (termo.length < 2) { setResultados([]); return; }
    const fn = tipoPessoa === 'fisica' ? pessoasAPI.listarFisicas : pessoasAPI.listarJuridicas;
    const { data } = await fn({ busca: termo, limite: 8 });
    if (data.ok) setResultados(data.dados.registros);
  }

  function aplicar() {
    if (!sel) return toast.error('Selecione o parceiro');
    onAplicar({
      parceria_pessoa_tipo: sel.tipo, parceria_pessoa_id: sel.id, parceria_nome: sel.nome,
      parceria_tipo: tipo,
      parceria_percentual: tipo === 'percent' ? Number(percentual) || 0 : null,
      parceria_valor: tipo === 'fixo' ? valorFixo : null,   // string mascarada; parse no cálculo/salvar
    });
  }
  function remover() {
    onAplicar({ parceria_pessoa_tipo: null, parceria_pessoa_id: null, parceria_nome: null, parceria_tipo: null, parceria_percentual: null, parceria_valor: null });
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box" style={{ maxWidth: '460px' }}>
        <div className="modal-header">
          <h3>{titulo}</h3>
          <button className="modal-fechar" onClick={onCancelar}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ color: '#6b7280', fontSize: '13px', marginTop: 0 }}>A parceria incide sobre o <strong>honorário</strong> desta parcela.</p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <select className="form-control" style={{ maxWidth: '130px' }} value={tipoPessoa}
              onChange={e => { setTipoPessoa(e.target.value); setResultados([]); }}>
              <option value="fisica">Física</option>
              <option value="juridica">Jurídica</option>
            </select>
            <div style={{ flex: 1, position: 'relative' }}>
              <input className="form-control" autoComplete="off" placeholder="Buscar parceiro..."
                value={busca} onChange={e => { setBusca(e.target.value); buscar(e.target.value); }} />
              {resultados.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '6px', zIndex: 20, maxHeight: '130px', overflowY: 'auto' }}>
                  {resultados.map(r => (
                    <div key={r.id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                      onMouseDown={() => { setSel({ id: r.id, tipo: tipoPessoa, nome: r.nome || r.razao_social }); setBusca(r.nome || r.razao_social); setResultados([]); }}>
                      {r.nome || r.razao_social}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {sel && <p style={{ fontSize: '13px' }}>Parceiro: <strong>{sel.nome}</strong></p>}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Forma</label>
              <select className="form-control" value={tipo} onChange={e => setTipo(e.target.value)}>
                <option value="percent">% do honorário</option>
                <option value="fixo">Valor fixo</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{tipo === 'percent' ? 'Percentual (%)' : 'Valor (R$)'}</label>
              {tipo === 'percent'
                ? <input type="number" step="0.01" min="0" max="100" className="form-control" value={percentual} onChange={e => setPercentual(e.target.value)} />
                : <input type="text" inputMode="numeric" className="form-control" value={valorFixo} onChange={e => setValorFixo(mascaraMoeda(e.target.value))} placeholder="0,00" />}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          {parcela.parceria_pessoa_id && <button className="btn btn-danger" onClick={remover} style={{ marginRight: 'auto' }}>Remover</button>}
          <button className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-primary" onClick={aplicar}>Aplicar</button>
        </div>
      </div>
    </div>
  );
}
