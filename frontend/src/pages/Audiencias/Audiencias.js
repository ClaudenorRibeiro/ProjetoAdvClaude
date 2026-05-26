// ============================================================
// PÁGINA DE AUDIÊNCIAS
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { audienciasAPI, processosAPI } from '../../services/api';
import { formatarData, toTitleCase } from '../../utils/formatters';
import { toast } from 'react-toastify';

const STATUS_COR = {
  agendada: 'badge-azul',
  realizada: 'badge-verde',
  adiada: 'badge-laranja',
  cancelada: 'badge-vermelho',
};

const RESULTADO_LABEL = {
  realizada: 'Realizada',
  adiada: 'Adiada',
  cancelada: 'Cancelada',
  acordo: 'Acordo',
};

export default function Audiencias() {
  const [lista, setLista]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [filtros, setFiltros]     = useState({ status: '', data_de: '', data_ate: '', pagina: 1 });
  const [tipos, setTipos]         = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [modalNova, setModalNova] = useState(false);
  const [modalAta, setModalAta]   = useState(null); // audiência selecionada para registrar ata

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await audienciasAPI.listar({ ...filtros, limite: 30 });
      if (data.ok) { setLista(data.dados.registros); setTotal(data.dados.total); }
    } catch { toast.error('Erro ao carregar audiências'); }
    finally { setCarregando(false); }
  }, [filtros]);

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

  function setFiltro(k, v) { setFiltros(f => ({...f, [k]: v, pagina: 1})); }

  // Determina o status visual da audiência
  function statusAudiencia(a) {
    if (a.ata_resultado) return a.ata_resultado;
    if (new Date(a.data) < new Date()) return 'adiada'; // sem ata e data passada
    return 'agendada';
  }

  return (
    <div>
      {/* Filtros */}
      <div className="card" style={{marginBottom:'16px'}}>
        <div style={{display:'flex',gap:'12px',flexWrap:'wrap',alignItems:'flex-end'}}>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Status</label>
            <select className="form-control" value={filtros.status} onChange={e => setFiltro('status', e.target.value)}>
              <option value="">Todos</option>
              <option value="agendada">Agendada</option>
              <option value="realizada">Realizada</option>
              <option value="adiada">Adiada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Data de</label>
            <input type="date" className="form-control" value={filtros.data_de}
              onChange={e => setFiltro('data_de', e.target.value)} />
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Até</label>
            <input type="date" className="form-control" value={filtros.data_ate}
              onChange={e => setFiltro('data_ate', e.target.value)} />
          </div>
          <button className="btn btn-primary" style={{marginBottom:'1px'}}
            onClick={() => setModalNova(true)}>
            + Nova Audiência
          </button>
          <span style={{marginLeft:'auto',color:'#888',fontSize:'13px',marginBottom:'1px'}}>
            {total} audiência(s)
          </span>
        </div>
      </div>

      <div className="card">
        {carregando ? <div className="loading">Carregando...</div> : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Processo</th><th>Pasta</th><th>Tipo</th>
                  <th>Data / Hora</th><th>Modalidade</th><th>Status</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(a => {
                  const status = statusAudiencia(a);
                  return (
                    <tr key={a.id}>
                      <td>{a.processo_numero || '—'}</td>
                      <td style={{maxWidth:'200px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {a.pasta_titulo || '—'}
                      </td>
                      <td>{a.tipo_nome || '—'}</td>
                      <td>
                        <strong>{formatarData(a.data)}</strong>
                        <div style={{fontSize:'12px',color:'#888'}}>{a.hora?.slice(0,5)}</div>
                      </td>
                      <td>
                        {a.modalidade === 'virtual'
                          ? <span className="badge badge-azul">Virtual</span>
                          : <span className="badge badge-cinza">Presencial</span>
                        }
                      </td>
                      <td>
                        <span className={`badge ${STATUS_COR[status] || 'badge-cinza'}`}>
                          {RESULTADO_LABEL[status] || status}
                        </span>
                        {a.ata_impressa === 1 && (
                          <span className="badge badge-verde" style={{marginLeft:'4px',fontSize:'10px'}}>
                            Impressa
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                          {!a.ata_resultado && (
                            <button className="btn btn-primary" style={{fontSize:'11px',padding:'4px 8px'}}
                              onClick={() => setModalAta(a)}>
                              Registrar Ata
                            </button>
                          )}
                          {a.ata_resultado && !a.ata_impressa && (
                            <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px'}}
                              onClick={() => marcarAtaImpressa(a.id)}>
                              Marcar Impressa
                            </button>
                          )}
                          {a.ata_resultado && (
                            <span style={{fontSize:'11px',color:'#888',padding:'4px 0'}}>
                              {RESULTADO_LABEL[a.ata_resultado]}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {lista.length === 0 && <p className="lista-vazia">Nenhuma audiência encontrada</p>}
          </div>
        )}

        {/* Paginação */}
        {Math.ceil(total/30) > 1 && (
          <div style={{display:'flex',gap:'8px',marginTop:'16px',justifyContent:'center'}}>
            <button className="btn btn-outline" disabled={filtros.pagina===1}
              onClick={() => setFiltros(f => ({...f, pagina: f.pagina-1}))}>← Anterior</button>
            <span style={{padding:'8px 12px',fontSize:'13px'}}>Página {filtros.pagina}</span>
            <button className="btn btn-outline"
              onClick={() => setFiltros(f => ({...f, pagina: f.pagina+1}))}>Próxima →</button>
          </div>
        )}
      </div>

      {/* Modal nova audiência */}
      {modalNova && (
        <ModalNovaAudiencia tipos={tipos}
          onFechar={(reload) => { setModalNova(false); if(reload) carregar(); }} />
      )}

      {/* Modal registrar ata */}
      {modalAta && (
        <ModalRegistrarAta audiencia={modalAta}
          onFechar={(reload) => { setModalAta(null); if(reload) carregar(); }} />
      )}
    </div>
  );
}

// Modal para criar nova audiência
function ModalNovaAudiencia({ tipos, onFechar }) {
  const [form, setForm]       = useState({ modalidade: 'presencial', hora: '09:00' });
  const [salvando, setSalvando] = useState(false);
  const [pastas, setPastas]   = useState([]);
  const [processos, setProcessos] = useState([]);
  const [buscaPasta, setBuscaPasta] = useState('');
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    processosAPI.auxiliares().then(r => {
      if (r.data.ok) setUsuarios(r.data.dados.usuarios || []);
    });
  }, []);

  async function buscarPastas(termo) {
    if (termo.length < 2) return;
    const { data } = await processosAPI.listarPastas({ busca: termo, limite: 10 });
    if (data.ok) setPastas(data.dados.registros);
  }

  function selecionarPasta(pasta) {
    setBuscaPasta(pasta.titulo);
    setPastas([]);
    setProcessos(pasta.processos || []);
  }

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.processo_id) return toast.error('Processo é obrigatório');
    if (!form.data)        return toast.error('Data é obrigatória');
    setSalvando(true);
    try {
      await audienciasAPI.criar(form);
      toast.success('Audiência criada com sucesso!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao criar audiência'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>Nova Audiência</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          {/* Busca de pasta/processo */}
          <div className="form-group">
            <label className="form-label">Pasta / Processo *</label>
            <input className="form-control" placeholder="Buscar pasta pelo título..."
              value={buscaPasta}
              onChange={e => { setBuscaPasta(e.target.value); buscarPastas(e.target.value); }} />
            {pastas.length > 0 && (
              <div style={{border:'1px solid #ddd',borderRadius:'6px',marginTop:'4px',maxHeight:'140px',overflowY:'auto'}}>
                {pastas.map(p => (
                  <div key={p.id} style={{padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid #f0f0f0'}}
                    onClick={() => selecionarPasta(p)}>
                    <strong>{p.numero}</strong> — {p.titulo}
                  </div>
                ))}
              </div>
            )}
          </div>
          {processos.length > 0 && (
            <div className="form-group">
              <label className="form-label">Processo *</label>
              <select className="form-control" value={form.processo_id||''}
                onChange={e => set('processo_id', e.target.value)}>
                <option value="">— Selecione o processo —</option>
                {processos.map(p => (
                  <option key={p.id} value={p.id}>{p.numero || `#${p.id}`}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Tipo de audiência</label>
              <select className="form-control" value={form.tipo_audiencia_id||''}
                onChange={e => set('tipo_audiencia_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Data *</label>
              <input type="date" className="form-control" value={form.data||''}
                onChange={e => set('data', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Hora *</label>
              <input type="time" className="form-control" value={form.hora}
                onChange={e => set('hora', e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Modalidade</label>
              <select className="form-control" value={form.modalidade}
                onChange={e => set('modalidade', e.target.value)}>
                <option value="presencial">Presencial</option>
                <option value="virtual">Virtual (online)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Responsável</label>
              <select className="form-control" value={form.criado_por||''}
                onChange={e => set('responsavel_id', e.target.value)}>
                <option value="">Escritório</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          </div>
          {form.modalidade === 'presencial' ? (
            <div className="form-group">
              <label className="form-label">Local</label>
              <input className="form-control" value={form.local||''}
                onChange={e => set('local', e.target.value)}
                onBlur={() => set('local', toTitleCase(form.local))}
                placeholder="Endereço do fórum / sala..." />
            </div>
          ) : (
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Plataforma</label>
                <input className="form-control" value={form.plataforma_virtual||''}
                  onChange={e => set('plataforma_virtual', e.target.value)}
                  placeholder="Zoom, Teams, Meet..." />
              </div>
              <div className="form-group">
                <label className="form-label">Link</label>
                <input className="form-control" value={form.link_virtual||''}
                  onChange={e => set('link_virtual', e.target.value)}
                  placeholder="https://..." />
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Criar Audiência'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal para registrar ata da audiência
function ModalRegistrarAta({ audiencia, onFechar }) {
  const [form, setForm]       = useState({ resultado: 'realizada', houve_acordo: false });
  const [salvando, setSalvando] = useState(false);

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.resultado) return toast.error('Resultado é obrigatório');
    setSalvando(true);
    try {
      await audienciasAPI.registrarAta(audiencia.id, form);
      toast.success('Ata registrada com sucesso!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao registrar ata'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>Registrar Ata — {formatarData(audiencia.data)} {audiencia.hora?.slice(0,5)}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Resultado *</label>
            <select className="form-control" value={form.resultado}
              onChange={e => set('resultado', e.target.value)}>
              <option value="realizada">Realizada</option>
              <option value="adiada">Adiada</option>
              <option value="cancelada">Cancelada</option>
              <option value="acordo">Acordo</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Resumo / Termos</label>
            <textarea className="form-control" rows={4} value={form.resultado_texto||''}
              onChange={e => set('resultado_texto', e.target.value)}
              onBlur={() => set('resultado_texto', toTitleCase(form.resultado_texto))}
              placeholder="Descreva os principais pontos da audiência..." />
          </div>

          {/* Se houve acordo */}
          <div className="form-group">
            <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer'}}>
              <input type="checkbox" checked={form.houve_acordo}
                onChange={e => set('houve_acordo', e.target.checked)} />
              <span className="form-label" style={{margin:0}}>Houve acordo?</span>
            </label>
          </div>

          {form.houve_acordo && (
            <div style={{background:'#f0fdf4',padding:'14px',borderRadius:'8px',border:'1px solid #bbf7d0'}}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Valor total do acordo (R$)</label>
                  <input type="number" step="0.01" className="form-control" value={form.valor_acordo||''}
                    onChange={e => set('valor_acordo', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Número de parcelas</label>
                  <input type="number" className="form-control" value={form.parcelas||''}
                    onChange={e => set('parcelas', e.target.value)} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Valor da parcela (R$)</label>
                  <input type="number" step="0.01" className="form-control" value={form.valor_parcela||''}
                    onChange={e => set('valor_parcela', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Data do 1º pagamento</label>
                  <input type="date" className="form-control" value={form.data_primeiro_pagamento||''}
                    onChange={e => set('data_primeiro_pagamento', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <div className="form-group" style={{marginTop:'12px'}}>
            <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer'}}>
              <input type="checkbox" checked={form.nova_audiencia||false}
                onChange={e => set('nova_audiencia', e.target.checked)} />
              <span className="form-label" style={{margin:0}}>Designar nova audiência?</span>
            </label>
          </div>
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
            {salvando ? 'Salvando...' : 'Registrar Ata'}
          </button>
        </div>
      </div>
    </div>
  );
}
