// ============================================================
// PÁGINA FINANCEIRA (reescrita 15/06/2026 — POR PROCESSO)
// Fluxo: busca pasta -> escolhe processo -> conta corrente (entradas/saídas com saldo)
//        + acordos parcelados (modal-tabela editável) + baixa de parcela (vira entrada).
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { financeiroAPI, processosAPI, pessoasAPI } from '../../services/api';
import { formatarData, formatarMoeda, formatarNumeroPasta, toTitleCase, mascaraMoeda, numeroParaMascaraMoeda, parseMoeda, hojeLocal } from '../../utils/formatters';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import MenuAcoes from '../../components/MenuAcoes';

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

  async function buscarPastas(termo) {
    if (termo.length < 2) return setPastas([]);
    const { data } = await processosAPI.listarPastas({ busca: termo, limite: 10 });
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
    setCarregando(true);
    try {
      const [c, a] = await Promise.all([
        financeiroAPI.buscarConta(processoId, {}),
        financeiroAPI.listarAcordos(processoId),
      ]);
      if (c.data.ok) setConta(c.data.dados);
      if (a.data.ok) setAcordos(a.data.dados);
    } catch { toast.error('Erro ao carregar financeiro'); }
    finally { setCarregando(false); }
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

      {aba === 'repasses' && <RepassesView podeAlterar={podeAlterar} />}
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
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Data</th><th>Descrição</th><th>Tipo</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(conta.lancamentos || []).map(l => {
                    const ehAcordo = l.origem === 'acordo';
                    return (
                      <tr key={l.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatarData(l.data)}</td>
                        <td>{l.descricao}</td>
                        <td>
                          <span className={`badge ${l.tipo === 'entrada' ? 'badge-verde' : 'badge-vermelho'}`}>
                            {l.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }} className={l.tipo === 'entrada' ? 'valor-positivo' : 'valor-negativo'}>
                          {l.tipo === 'saida' ? '−' : '+'}{formatarMoeda(l.valor)}
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
                  })}
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
function RepassesView({ podeAlterar }) {
  const { temPermissao } = useAuth();
  const [sub, setSub] = useState('pendentes');         // 'pendentes' | 'concluidos'
  const [pendentes, setPendentes] = useState(null);
  const [concluidos, setConcluidos] = useState(null);
  const [repassando, setRepassando] = useState(null);   // linha aguardando o modal de repasse
  const [historicoDe, setHistoricoDe] = useState(null); // parcela com histórico aberto

  // Pendentes: uma linha por repasse que ainda FALTA (cliente e/ou parceiro)
  function montarPendentes(parcelas) {
    const out = [];
    for (const p of parcelas) {
      if (Number(p.valor_liquido) > 0 && !p.repasse_cliente_em)
        out.push({ key: `c${p.id}`, parcela: p, tipo: 'cliente', beneficiario: 'Cliente', valor: p.valor_liquido });
      if (p.parceria_pessoa_id && !p.repasse_parceiro_em)
        out.push({ key: `p${p.id}`, parcela: p, tipo: 'parceiro', beneficiario: p.parceria_nome || 'Parceiro', valor: p.parceria_valor });
    }
    return out;
  }

  // Concluídos: uma linha por repasse JÁ FEITO (com data, forma e quem fez)
  function montarConcluidos(parcelas) {
    const out = [];
    for (const p of parcelas) {
      if (p.repasse_cliente_em)
        out.push({ key: `c${p.id}`, parcela: p, tipo: 'cliente', beneficiario: 'Cliente', valor: p.valor_liquido,
                   data: p.repasse_cliente_em, forma: p.repasse_cliente_forma_nome, quem: p.repasse_cliente_por_nome });
      if (p.repasse_parceiro_em)
        out.push({ key: `p${p.id}`, parcela: p, tipo: 'parceiro', beneficiario: p.parceria_nome || 'Parceiro', valor: p.parceria_valor,
                   data: p.repasse_parceiro_em, forma: p.repasse_parceiro_forma_nome, quem: p.repasse_parceiro_por_nome });
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
      await financeiroAPI.registrarRepasse(repassando.parcela.id, { tipo: repassando.tipo, ...dados });
      toast.success('Repasse registrado'); setRepassando(null); carregar();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao repassar'); }
  }
  async function desfazerRepasse(l) {
    try { await financeiroAPI.desfazerRepasse(l.parcela.id, l.tipo); toast.success('Repasse desfeito'); carregar(); }
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
                        {l.tipo === 'cliente' ? 'Cliente' : `Parceiro: ${l.beneficiario}`}
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
                  <th>Forma</th><th>Quem fez</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {concluidos.map(l => (
                  <tr key={l.key}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatarData(l.data)}</td>
                    {colProc(l.parcela)}
                    <td>
                      <span className={`badge ${l.tipo === 'cliente' ? 'badge-azul' : 'badge-roxo'}`}>
                        {l.tipo === 'cliente' ? 'Cliente' : `Parceiro: ${l.beneficiario}`}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatarMoeda(l.valor)}</td>
                    <td>{l.forma || '—'}</td>
                    <td>{l.quem || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <MenuAcoes itens={[
                        { label: 'Recibo', icone: '📄',
                          oculto: !temPermissao('documentos','cadastrar'),
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

  useEffect(() => {
    financeiroAPI.formasPagamento()
      .then(({ data }) => { if (data.ok) setFormas(data.dados); })
      .catch(() => toast.error('Erro ao carregar formas de pagamento'));
  }, []);

  async function confirmar() {
    if (!data) return toast.error('Informe a data do repasse');
    if (!formaId) return toast.error('Informe a forma de pagamento');
    setSalvando(true);
    await onConfirmar({ data, forma_id: parseInt(formaId, 10) });
    setSalvando(false);
  }

  const destino = linha.tipo === 'cliente' ? 'cliente' : `parceiro (${linha.beneficiario})`;

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
            <input type="date" className="form-control" value={data}
              onChange={e => setData(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Forma de pagamento *</label>
            <select className="form-control" value={formaId} onChange={e => setFormaId(e.target.value)}>
              <option value="">Selecione...</option>
              {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
            {formas.length === 0 && (
              <small style={{ color: '#b45309' }}>
                Nenhuma forma cadastrada. Cadastre em Controle → Formas de pagamento.
              </small>
            )}
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
                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
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
  const cancelado = acordo.status === 'cancelado';
  const tipoLabel = acordo.tipo === 'alvara' ? 'Alvará' : 'Acordo';

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
                <tr key={p.id}>
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
                    {/* Indicadores dos repasses já feitos */}
                    {p.status === 'pago' && (p.repasse_cliente_em || p.repasse_parceiro_em) && (
                      <div style={{ fontSize: 10, color: '#059669', marginTop: 2 }}>
                        {p.repasse_cliente_em && <div>✓ Cliente {formatarData(p.repasse_cliente_em)}</div>}
                        {p.repasse_parceiro_em && <div>✓ Parceiro {formatarData(p.repasse_parceiro_em)}</div>}
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <MenuAcoes itens={[
                      // Gerar documento da parcela (recibo/declaração/autorização) — o modal lista os modelos (ou avisa se não houver).
                      { label: 'Gerar documento', icone: '📄',
                        oculto: !temPermissao('documentos','cadastrar'),
                        gerarDoc: { ancoraTipo: 'pagamento', ancoraId: p.id } },
                      // Pendente recebe; recebida desfaz (bloqueado se houver repasse); cancelada não tem ação
                      { label: 'Receber', icone: '💰',
                        oculto: !(podeAlterar && p.status === 'pendente'),
                        onClick: () => setRecebendo(p) },
                      { label: 'Desfazer recebimento', icone: '↩️',
                        oculto: !(podeAlterar && p.status === 'pago'),
                        // Continua visível com repasse feito para poder explicar o porquê do bloqueio
                        onClick: () => {
                          if (p.repasse_cliente_em || p.repasse_parceiro_em) {
                            toast.info("Desfaça os repasses na aba 'Repasses' antes de desfazer o recebimento.");
                            return;
                          }
                          desfazer(p);
                        } },
                      { label: 'Histórico', icone: '📋', onClick: () => setHistoricoDe(p) },
                    ]} />
                  </td>
                </tr>
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
                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
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
function ModalReceberParcela({ parcela, onCancelar, onConfirmar }) {
  const [data, setData] = useState(hojeLocal());          // data em que o réu pagou (default hoje)
  const [formaId, setFormaId] = useState('');             // forma de pagamento do recebimento
  const [identificacao, setIdentificacao] = useState(''); // identificação no extrato bancário
  const [formas, setFormas] = useState([]);               // formas cadastradas (Controle)
  const [salvando, setSalvando] = useState(false);

  // Carrega as formas de pagamento ativas para o select
  useEffect(() => {
    financeiroAPI.formasPagamento()
      .then(({ data }) => { if (data.ok) setFormas(data.dados); })
      .catch(() => toast.error('Erro ao carregar formas de pagamento'));
  }, []);

  async function confirmar() {
    if (!data) return toast.error('Informe a data do recebimento');
    if (!formaId) return toast.error('Informe a forma de pagamento');
    setSalvando(true);
    await onConfirmar({
      recebido_em: data,
      recebimento_forma_id: parseInt(formaId, 10),
      recebimento_identificacao: identificacao.trim() || null,
    });
    setSalvando(false);
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box" style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <h3>Receber parcela {parcela.numero}</h3>
          <button className="modal-fechar" onClick={onCancelar}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Data do recebimento *</label>
            <input type="date" className="form-control" value={data}
              onChange={e => setData(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Forma de pagamento *</label>
            <select className="form-control" value={formaId} onChange={e => setFormaId(e.target.value)}>
              <option value="">Selecione...</option>
              {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
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
            Valor: <strong>{formatarMoeda(parcela.valor_bruto)}</strong>
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
export function ModalAcordo({ processoId, acordoId, tipo, onFechar }) {
  const [tipoAcordo, setTipoAcordo] = useState(tipo || 'acordo'); // 'acordo' | 'alvara'
  const tipoLabel = tipoAcordo === 'alvara' ? 'Alvará' : 'Acordo';
  const [cab, setCab] = useState({ descricao: '', valor_total: '', qtd_parcelas: '', data_primeira: '', honor_percentual: 30 });
  const [parcelas, setParcelas] = useState([]);
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [parceriaRow, setParceriaRow] = useState(null); // índice da parcela editando parceria
  const [parceriaAcordo, setParceriaAcordo] = useState(null); // parceria aplicada a TODAS as parcelas
  const [modalParcAcordo, setModalParcAcordo] = useState(false);
  const [confirmar, setConfirmar] = useState(null); // confirmação (ex.: total do acordo mudou)

  // Edição: carrega o acordo existente
  useEffect(() => {
    if (!acordoId) return;
    financeiroAPI.buscarAcordo(acordoId).then(({ data }) => {
      if (data.ok) {
        setTipoAcordo(data.dados.tipo || 'acordo');
        setCab({
          descricao: data.dados.descricao || '', valor_total: numeroParaMascaraMoeda(data.dados.valor_total),
          qtd_parcelas: data.dados.qtd_parcelas, data_primeira: String(data.dados.data_primeira).slice(0, 10),
          honor_percentual: 30,
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
        mensagem: `A 1ª parcela está com data anterior a hoje (${cab.data_primeira.split('-').reverse().join('/')}). Deseja gerar as parcelas mesmo assim?`,
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
        data_primeira: cab.data_primeira, honor_percentual: cab.honor_percentual,
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
          </div>
          <div className="form-group">
            <label className="form-label">Descrição (opcional)</label>
            <input className="form-control" autoComplete="off" value={cab.descricao}
              onChange={e => setC('descricao', e.target.value)} placeholder="Ex: Acordo trabalhista homologado" />
          </div>
          <button className="btn btn-outline" onClick={gerar} disabled={gerando} style={{ marginBottom: '12px' }}>
            {gerando ? 'Gerando...' : (parcelas.length ? '↻ Regerar parcelas' : 'Gerar parcelas')}
          </button>
          {/* Parceria de TODO o acordo — aplica a mesma parceria em todas as parcelas */}
          <button type="button" className="btn btn-outline" style={{ marginBottom: '12px', marginLeft: '8px' }}
            onClick={() => setModalParcAcordo(true)}>
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
                  {parcelas.map((p, i) => (
                    <tr key={i}>
                      <td>{p.numero || i + 1}</td>
                      <td>
                        <input type="date" className="form-control" style={{ minWidth: '140px', padding: '4px 6px' }}
                          value={p.vencimento} onChange={e => setParc(i, 'vencimento', e.target.value)} />
                      </td>
                      <td>
                        <input type="text" inputMode="numeric" className="form-control" style={{ width: '110px', padding: '4px 6px' }}
                          value={p.valor_bruto} onChange={e => setParc(i, 'valor_bruto', mascaraMoeda(e.target.value))} />
                      </td>
                      <td>
                        <select className="form-control" style={{ width: '90px', padding: '4px 6px' }}
                          value={p.honor_tipo} onChange={e => setParc(i, 'honor_tipo', e.target.value)}>
                          <option value="percent">%</option>
                          <option value="fixo">Fixo</option>
                          <option value="sem">Sem</option>
                        </select>
                      </td>
                      <td>
                        {p.honor_tipo === 'percent' && (
                          <input type="number" step="0.01" className="form-control" style={{ width: '70px', padding: '4px 6px' }}
                            value={p.honor_percentual ?? ''} onChange={e => setParc(i, 'honor_percentual', e.target.value)} />
                        )}
                        {p.honor_tipo === 'fixo' && (
                          <>
                            <input type="text" inputMode="numeric"
                              className={`form-control ${parseMoeda(p.honor_valor) > parseMoeda(p.valor_bruto) ? 'is-invalid' : ''}`}
                              style={{ width: '100px', padding: '4px 6px' }}
                              value={p.honor_valor ?? ''} onChange={e => setParc(i, 'honor_valor', mascaraMoeda(e.target.value))} />
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
                              onClick={() => setParceriaRow(i)}>{p.parceria_nome || 'Parceiro'}{parceriaDaParcela(p) ? ` · ${formatarMoeda(parceriaDaParcela(p))}` : ''}</button>
                          : <button className="btn btn-outline" style={{ fontSize: '11px', padding: '2px 6px', whiteSpace: 'nowrap' }}
                              onClick={() => setParceriaRow(i)}>+ parceria</button>}
                      </td>
                      <td>
                        <input className="form-control" style={{ width: '120px', padding: '4px 6px' }}
                          value={p.observacao || ''} onChange={e => setParc(i, 'observacao', e.target.value)} />
                      </td>
                    </tr>
                  ))}
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
