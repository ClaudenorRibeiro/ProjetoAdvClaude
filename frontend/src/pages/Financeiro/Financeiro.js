// ============================================================
// PÁGINA FINANCEIRA
// Conta corrente por pasta, honorários e relatório geral
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { financeiroAPI, processosAPI } from '../../services/api';
import { formatarData, formatarMoeda, formatarNumeroPasta, toTitleCase } from '../../utils/formatters';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';

export default function Financeiro() {
  const { ehAdmin } = useAuth();
  const [abaAtiva, setAbaAtiva]     = useState('conta');
  const [pastas, setPastas]         = useState([]);
  const [buscaPasta, setBuscaPasta] = useState('');
  const [pastaSelecionada, setPastaSelecionada] = useState(null);
  const [contaCorrente, setContaCorrente]       = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [modalLancamento, setModalLancamento]   = useState(false);
  const [modalHonorarios, setModalHonorarios]   = useState(false);
  const [relatorio, setRelatorio]   = useState(null);
  const [filtrosRel, setFiltrosRel] = useState({ data_de: '', data_ate: '', tipo: '' });

  async function buscarPastas(termo) {
    if (termo.length < 2) return;
    const { data } = await processosAPI.listarPastas({ busca: termo, limite: 10 });
    if (data.ok) setPastas(data.dados.registros);
  }

  const carregarConta = useCallback(async () => {
    if (!pastaSelecionada) return;
    setCarregando(true);
    try {
      const { data } = await financeiroAPI.buscarConta(pastaSelecionada.id, {});
      if (data.ok) setContaCorrente(data.dados);
    } catch { toast.error('Erro ao carregar conta'); }
    finally { setCarregando(false); }
  }, [pastaSelecionada]);

  useEffect(() => { carregarConta(); }, [carregarConta]);

  async function excluirLancamento(id) {
    if (!window.confirm('Excluir este lançamento?')) return;
    try {
      await financeiroAPI.excluirLanc(id);
      toast.success('Lançamento excluído');
      carregarConta();
    } catch { toast.error('Erro ao excluir'); }
  }

  async function gerarRecibo() {
    try {
      const resp = await financeiroAPI.gerarRecibo(pastaSelecionada.id);
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch { toast.error('Erro ao gerar recibo'); }
  }

  async function carregarRelatorio() {
    try {
      const { data } = await financeiroAPI.relatorio(filtrosRel);
      if (data.ok) setRelatorio(data.dados);
    } catch { toast.error('Erro ao carregar relatório'); }
  }

  return (
    <div>
      {/* Abas */}
      <div style={{display:'flex',gap:'0',marginBottom:'16px'}}>
        <button className={`btn ${abaAtiva==='conta'?'btn-primary':'btn-outline'}`}
          style={{borderRadius:'6px 0 0 6px'}}
          onClick={() => setAbaAtiva('conta')}>
          Conta Corrente
        </button>
        {ehAdmin && (
          <button className={`btn ${abaAtiva==='relatorio'?'btn-primary':'btn-outline'}`}
            style={{borderRadius:'0 6px 6px 0'}}
            onClick={() => setAbaAtiva('relatorio')}>
            Relatório Geral
          </button>
        )}
      </div>

      {/* ===== ABA: CONTA CORRENTE ===== */}
      {abaAtiva === 'conta' && (
        <div>
          {/* Seleção de pasta */}
          <div className="card" style={{marginBottom:'16px'}}>
            <div style={{display:'flex',gap:'12px',alignItems:'flex-end',flexWrap:'wrap'}}>
              <div className="form-group" style={{margin:0,flex:1,maxWidth:'400px'}}>
                <label className="form-label">Selecionar pasta</label>
                <input className="form-control" placeholder="Buscar pasta pelo título ou número..."
                  value={buscaPasta}
                  onChange={e => { setBuscaPasta(e.target.value); buscarPastas(e.target.value); }} />
                {pastas.length > 0 && (
                  <div style={{border:'1px solid #ddd',borderRadius:'6px',marginTop:'4px',maxHeight:'150px',overflowY:'auto',background:'#fff',position:'absolute',zIndex:10,width:'400px'}}>
                    {pastas.map(p => (
                      <div key={p.id} style={{padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid #f0f0f0'}}
                        onClick={() => {
                          setPastaSelecionada(p);
                          setBuscaPasta(`${formatarNumeroPasta(p.numero)} — ${p.titulo}`);
                          setPastas([]);
                        }}>
                        <strong>{formatarNumeroPasta(p.numero)}</strong> — {p.titulo}
                        <div style={{fontSize:'11px',color:'#888'}}>{p.cliente_nome}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {pastaSelecionada && (
                <div style={{display:'flex',gap:'8px'}}>
                  <button className="btn btn-outline" onClick={() => setModalHonorarios(true)}>
                    Honorários
                  </button>
                  <button className="btn btn-outline" onClick={gerarRecibo}>
                    Gerar Recibo PDF
                  </button>
                  <button className="btn btn-primary" onClick={() => setModalLancamento(true)}>
                    + Lançamento
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Conta corrente */}
          {pastaSelecionada && (
            <div className="card">
              {carregando ? <div className="loading">Carregando...</div> : contaCorrente ? (
                <>
                  {/* Header com saldo */}
                  <div style={{display:'flex',gap:'24px',marginBottom:'20px',flexWrap:'wrap'}}>
                    <div>
                      <div style={{fontSize:'12px',color:'#888'}}>Pasta</div>
                      <strong>{pastaSelecionada.titulo}</strong>
                    </div>
                    {contaCorrente.honorarios && (
                      <div>
                        <div style={{fontSize:'12px',color:'#888'}}>Honorários</div>
                        <strong>
                          {contaCorrente.honorarios.tipo === 'percentual'
                            ? `${contaCorrente.honorarios.percentual}%`
                            : contaCorrente.honorarios.tipo === 'fixo'
                              ? formatarMoeda(contaCorrente.honorarios.valor_fixo)
                              : 'Sem honorários'}
                        </strong>
                      </div>
                    )}
                    <div style={{marginLeft:'auto',textAlign:'right'}}>
                      <div style={{fontSize:'12px',color:'#888'}}>Saldo atual</div>
                      <strong style={{
                        fontSize:'20px',
                        color: (contaCorrente.saldo || 0) >= 0 ? '#059669' : '#dc2626'
                      }}>
                        {formatarMoeda(contaCorrente.saldo || 0)}
                      </strong>
                    </div>
                  </div>

                  {/* Extrato */}
                  <div className="tabela-wrapper">
                    <table className="tabela">
                      <thead>
                        <tr>
                          <th>Data</th><th>Descrição</th><th>Tipo</th>
                          <th style={{textAlign:'right'}}>Valor</th>
                          <th style={{textAlign:'right'}}>Saldo</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(contaCorrente.lancamentos || []).map(l => (
                          <tr key={l.id}>
                            <td style={{whiteSpace:'nowrap'}}>{formatarData(l.data_lancamento)}</td>
                            <td>{l.descricao}</td>
                            <td>
                              <span className={`badge ${l.tipo === 'credito' ? 'badge-verde' : 'badge-vermelho'}`}>
                                {l.tipo === 'credito' ? 'Crédito' : 'Débito'}
                              </span>
                            </td>
                            <td style={{textAlign:'right'}}
                              className={l.tipo === 'credito' ? 'valor-positivo' : 'valor-negativo'}>
                              {l.tipo === 'debito' ? '−' : '+'}{formatarMoeda(l.valor)}
                            </td>
                            <td style={{textAlign:'right'}}>
                              {formatarMoeda(l.saldo_acumulado || 0)}
                            </td>
                            <td>
                              <button className="btn btn-danger" style={{fontSize:'11px',padding:'3px 8px'}}
                                onClick={() => excluirLancamento(l.id)}>
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(!contaCorrente.lancamentos || contaCorrente.lancamentos.length === 0) && (
                      <p className="lista-vazia">Nenhum lançamento registrado nesta pasta</p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}

          {!pastaSelecionada && (
            <div className="card">
              <p className="lista-vazia">Selecione uma pasta para ver a conta corrente</p>
            </div>
          )}
        </div>
      )}

      {/* ===== ABA: RELATÓRIO GERAL (admin) ===== */}
      {abaAtiva === 'relatorio' && ehAdmin && (
        <div>
          <div className="card" style={{marginBottom:'16px'}}>
            <div style={{display:'flex',gap:'12px',flexWrap:'wrap',alignItems:'flex-end'}}>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Período de</label>
                <input type="date" className="form-control" value={filtrosRel.data_de}
                  onChange={e => setFiltrosRel(f => ({...f, data_de: e.target.value}))} />
              </div>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Até</label>
                <input type="date" className="form-control" value={filtrosRel.data_ate}
                  onChange={e => setFiltrosRel(f => ({...f, data_ate: e.target.value}))} />
              </div>
              <div className="form-group" style={{margin:0}}>
                <label className="form-label">Tipo</label>
                <select className="form-control" value={filtrosRel.tipo}
                  onChange={e => setFiltrosRel(f => ({...f, tipo: e.target.value}))}>
                  <option value="">Todos</option>
                  <option value="credito">Créditos</option>
                  <option value="debito">Débitos</option>
                </select>
              </div>
              <button className="btn btn-primary" style={{marginBottom:'1px'}} onClick={carregarRelatorio}>
                Gerar Relatório
              </button>
            </div>
          </div>

          {relatorio && (
            <div className="card">
              <div style={{display:'flex',gap:'24px',marginBottom:'20px',flexWrap:'wrap'}}>
                <div>
                  <div style={{fontSize:'12px',color:'#888'}}>Total créditos</div>
                  <strong style={{fontSize:'18px',color:'#059669'}}>{formatarMoeda(relatorio.total_creditos||0)}</strong>
                </div>
                <div>
                  <div style={{fontSize:'12px',color:'#888'}}>Total débitos</div>
                  <strong style={{fontSize:'18px',color:'#dc2626'}}>{formatarMoeda(relatorio.total_debitos||0)}</strong>
                </div>
                <div>
                  <div style={{fontSize:'12px',color:'#888'}}>Saldo do período</div>
                  <strong style={{fontSize:'18px',color: (relatorio.saldo_periodo||0) >= 0 ? '#059669' : '#dc2626'}}>
                    {formatarMoeda(relatorio.saldo_periodo||0)}
                  </strong>
                </div>
              </div>
              <div className="tabela-wrapper">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Data</th><th>Pasta</th><th>Cliente</th>
                      <th>Descrição</th><th>Tipo</th><th style={{textAlign:'right'}}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(relatorio.lancamentos || []).map(l => (
                      <tr key={l.id}>
                        <td>{formatarData(l.data_lancamento)}</td>
                        <td>{formatarNumeroPasta(l.pasta_numero)} — {l.pasta_titulo}</td>
                        <td>{l.cliente_nome || '—'}</td>
                        <td>{l.descricao}</td>
                        <td>
                          <span className={`badge ${l.tipo === 'credito' ? 'badge-verde' : 'badge-vermelho'}`}>
                            {l.tipo === 'credito' ? 'Crédito' : 'Débito'}
                          </span>
                        </td>
                        <td style={{textAlign:'right'}}
                          className={l.tipo === 'credito' ? 'valor-positivo' : 'valor-negativo'}>
                          {l.tipo === 'debito' ? '−' : '+'}{formatarMoeda(l.valor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Lançamento */}
      {modalLancamento && pastaSelecionada && (
        <ModalLancamento pastaId={pastaSelecionada.id}
          onFechar={(reload) => { setModalLancamento(false); if(reload) carregarConta(); }} />
      )}

      {/* Modal: Honorários */}
      {modalHonorarios && pastaSelecionada && contaCorrente && (
        <ModalHonorarios
          pastaId={pastaSelecionada.id}
          honorarios={contaCorrente.honorarios}
          onFechar={(reload) => { setModalHonorarios(false); if(reload) carregarConta(); }} />
      )}
    </div>
  );
}

function ModalLancamento({ pastaId, onFechar }) {
  const [form, setForm]       = useState({ tipo: 'credito', data_lancamento: new Date().toISOString().split('T')[0] });
  const [salvando, setSalvando] = useState(false);

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.descricao || !form.valor) return toast.error('Descrição e valor são obrigatórios');
    setSalvando(true);
    try {
      await financeiroAPI.lancar(pastaId, form);
      toast.success('Lançamento registrado!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao lançar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-pequeno">
        <div className="modal-header">
          <h3>Novo Lançamento</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-control" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                <option value="credito">Crédito (entrada)</option>
                <option value="debito">Débito (saída)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Data *</label>
              <input type="date" className="form-control" value={form.data_lancamento}
                onChange={e => set('data_lancamento', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Descrição *</label>
            <input className="form-control" value={form.descricao||''}
              onChange={e => set('descricao', e.target.value)}
              onBlur={() => set('descricao', toTitleCase(form.descricao))}
              placeholder="Ex: Honorários contratados" />
          </div>
          <div className="form-group">
            <label className="form-label">Valor (R$) *</label>
            <input type="number" step="0.01" min="0" className="form-control" value={form.valor||''}
              onChange={e => set('valor', e.target.value)} placeholder="0,00" />
          </div>
          <div className="form-group">
            <label className="form-label">Observação</label>
            <textarea className="form-control" rows={2} value={form.observacao||''}
              onChange={e => set('observacao', e.target.value)}
              onBlur={() => set('observacao', toTitleCase(form.observacao))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Lançar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalHonorarios({ pastaId, honorarios, onFechar }) {
  const [form, setForm]       = useState(honorarios || { tipo: 'sem_honorarios' });
  const [salvando, setSalvando] = useState(false);

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    setSalvando(true);
    try {
      await financeiroAPI.salvarHonorarios(pastaId, form);
      toast.success('Honorários salvos!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-pequeno">
        <div className="modal-header">
          <h3>Configurar Honorários</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Tipo de honorários</label>
            <select className="form-control" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              <option value="sem_honorarios">Sem honorários</option>
              <option value="percentual">Percentual sobre valor da causa</option>
              <option value="fixo">Valor fixo</option>
            </select>
          </div>
          {form.tipo === 'percentual' && (
            <div className="form-group">
              <label className="form-label">Percentual (%)</label>
              <input type="number" step="0.01" min="0" max="100" className="form-control"
                value={form.percentual||''}
                onChange={e => set('percentual', e.target.value)} placeholder="Ex: 30" />
            </div>
          )}
          {form.tipo === 'fixo' && (
            <div className="form-group">
              <label className="form-label">Valor fixo (R$)</label>
              <input type="number" step="0.01" min="0" className="form-control"
                value={form.valor_fixo||''}
                onChange={e => set('valor_fixo', e.target.value)} placeholder="Ex: 5000,00" />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Observações</label>
            <textarea className="form-control" rows={2} value={form.observacoes||''}
              onChange={e => set('observacoes', e.target.value)}
              onBlur={() => set('observacoes', toTitleCase(form.observacoes))} />
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
