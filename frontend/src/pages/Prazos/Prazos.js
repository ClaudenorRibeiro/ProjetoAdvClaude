// ============================================================
// PÁGINA DE PRAZOS
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { prazosAPI, processosAPI } from '../../services/api';
import { formatarData, labelStatusPrazo, corPrazo, toTitleCase } from '../../utils/formatters';
import { toast } from 'react-toastify';

const STATUS_OPCOES = ['aberto','fazendo','pendente','agendado','concluido'];
const STATUS_COR = { aberto:'badge-azul', fazendo:'badge-laranja', pendente:'badge-vermelho', agendado:'badge-cinza', concluido:'badge-verde' };

export default function Prazos() {
  const [lista, setLista]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [filtros, setFiltros]     = useState({ status: '', data_de: '', data_ate: '', pagina: 1 });
  const [tipos, setTipos]         = useState({ tipos: [], subtipos: [] });
  const [carregando, setCarregando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await prazosAPI.listar({ ...filtros, limite: 30 });
      if (data.ok) { setLista(data.dados.registros); setTotal(data.dados.total); }
    } catch { toast.error('Erro ao carregar prazos'); }
    finally { setCarregando(false); }
  }, [filtros]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { prazosAPI.tipos().then(r => setTipos(r.data.dados)); }, []);

  async function mudarStatus(id, novoStatus) {
    try {
      await prazosAPI.mudarStatus(id, { status: novoStatus });
      toast.success(`Prazo marcado como "${novoStatus}"`);
      carregar();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao alterar status'); }
  }

  function setFiltro(k, v) { setFiltros(f => ({...f, [k]: v, pagina: 1})); }

  return (
    <div>
      {/* Filtros */}
      <div className="card" style={{marginBottom:'16px'}}>
        <div style={{display:'flex',gap:'12px',flexWrap:'wrap',alignItems:'flex-end'}}>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Status</label>
            <select className="form-control" value={filtros.status} onChange={e=>setFiltro('status',e.target.value)}>
              <option value="">Todos</option>
              {STATUS_OPCOES.map(s => <option key={s} value={s}>{labelStatusPrazo(s)}</option>)}
            </select>
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Vencimento de</label>
            <input type="date" className="form-control" value={filtros.data_de} onChange={e=>setFiltro('data_de',e.target.value)} />
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Até</label>
            <input type="date" className="form-control" value={filtros.data_ate} onChange={e=>setFiltro('data_ate',e.target.value)} />
          </div>
          <button className="btn btn-primary" style={{marginBottom:'1px'}} onClick={() => setModalAberto(true)}>
            + Novo Prazo
          </button>
          <span style={{marginLeft:'auto',color:'#888',fontSize:'13px',marginBottom:'1px'}}>{total} prazo(s)</span>
        </div>
      </div>

      <div className="card">
        {carregando ? <div className="loading">Carregando...</div> : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Processo</th><th>Pasta</th><th>Prazo</th><th>Vencimento</th>
                  <th>Dias</th><th>Responsável</th><th>Status</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(p => (
                  <tr key={p.id} className={corPrazo(p.dias_restantes)}>
                    <td>{p.processo_numero || '—'}</td>
                    <td>{p.pasta_numero_fmt} — {p.pasta_titulo}</td>
                    <td>{p.subtipo_nome || p.descricao || '—'}</td>
                    <td>{formatarData(p.data_vencimento)}</td>
                    <td>
                      {p.dias_restantes < 0
                        ? <span className="badge badge-vermelho">{Math.abs(p.dias_restantes)}d atraso</span>
                        : <span>{p.dias_restantes}d</span>
                      }
                    </td>
                    <td>{p.responsavel_nome || 'Escritório'}</td>
                    <td><span className={`badge ${STATUS_COR[p.status]}`}>{labelStatusPrazo(p.status)}</span></td>
                    <td>
                      <select
                        className="form-control" style={{fontSize:'12px',padding:'3px 6px',width:'130px'}}
                        value={p.status}
                        onChange={e => mudarStatus(p.id, e.target.value)}
                      >
                        {STATUS_OPCOES.map(s => <option key={s} value={s}>{labelStatusPrazo(s)}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && <p className="lista-vazia">Nenhum prazo encontrado</p>}
          </div>
        )}
      </div>

      {modalAberto && <ModalNovoPrazo tipos={tipos} onFechar={(reload) => { setModalAberto(false); if(reload) carregar(); }} />}
    </div>
  );
}

function ModalNovoPrazo({ tipos, onFechar }) {
  const [form, setForm]         = useState({ tipo_dias: 'uteis', data_inicio: new Date().toISOString().split('T')[0] });
  const [salvando, setSalvando] = useState(false);
  const [pastas, setPastas]     = useState([]);
  const [processos, setProcessos] = useState([]);
  const [buscaPasta, setBuscaPasta] = useState('');
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    processosAPI.auxiliares().then(r => setUsuarios(r.data.dados.usuarios || []));
  }, []);

  async function buscarPastas(termo) {
    if (termo.length < 2) return setPastas([]);
    const { data } = await processosAPI.listarPastas({ busca: termo, limite: 10 });
    if (data.ok) setPastas(data.dados.registros);
  }

  function selecionarPasta(pasta) {
    setBuscaPasta(`${pasta.numero} — ${pasta.titulo}`);
    setPastas([]);
    setProcessos(pasta.processos || []);
    set('processo_id', ''); // limpa processo anterior ao trocar pasta
  }

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.processo_id || !form.data_inicio) return toast.error('Processo e data de início são obrigatórios');
    setSalvando(true);
    try {
      await prazosAPI.criar(form);
      toast.success('Prazo criado com sucesso!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao criar prazo'); }
    finally { setSalvando(false); }
  }

  const subtiposFiltrados = form.tipo_prazo_id
    ? tipos.subtipos.filter(s => String(s.tipo_prazo_id) === String(form.tipo_prazo_id))
    : tipos.subtipos;

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Novo Prazo</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          {/* Busca de pasta — mesmo padrão de Audiências */}
          <div className="form-group">
            <label className="form-label">Pasta / Processo *</label>
            <input className="form-control" placeholder="Buscar pasta pelo título ou número..."
              value={buscaPasta}
              onChange={e => { setBuscaPasta(e.target.value); buscarPastas(e.target.value); }} />
            {pastas.length > 0 && (
              <div style={{border:'1px solid #ddd',borderRadius:'6px',marginTop:'4px',maxHeight:'140px',overflowY:'auto',background:'#fff',zIndex:10,position:'relative'}}>
                {pastas.map(p => (
                  <div key={p.id} style={{padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid #f0f0f0'}}
                    onMouseDown={() => selecionarPasta(p)}>
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
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Tipo de prazo</label>
              <select className="form-control" value={form.tipo_prazo_id||''} onChange={e=>set('tipo_prazo_id',e.target.value)}>
                <option value="">— Todos os tipos —</option>
                {tipos.tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Subtipo</label>
              <select className="form-control" value={form.subtipo_id||''} onChange={e=>{
                const st = tipos.subtipos.find(s=>String(s.id)===e.target.value);
                set('subtipo_id', e.target.value);
                if (st?.dias_padrao) { set('quantidade', st.dias_padrao); set('tipo_dias', st.tipo_dias); }
              }}>
                <option value="">— Selecione —</option>
                {subtiposFiltrados.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <input className="form-control" value={form.descricao||''} onChange={e=>set('descricao',e.target.value)} onBlur={()=>set('descricao', toTitleCase(form.descricao))} placeholder="Descrição adicional..." />
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Data início *</label>
              <input type="date" className="form-control" value={form.data_inicio} onChange={e=>set('data_inicio',e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Quantidade de dias</label>
              <input type="number" className="form-control" value={form.quantidade||''} onChange={e=>set('quantidade',e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de dias</label>
              <select className="form-control" value={form.tipo_dias} onChange={e=>set('tipo_dias',e.target.value)}>
                <option value="uteis">Dias úteis</option>
                <option value="corridos">Dias corridos</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Delegar para</label>
            <select className="form-control" value={form.delegado_para||''} onChange={e=>set('delegado_para',e.target.value)}>
              <option value="">Escritório (sem responsável)</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar Prazo'}
          </button>
        </div>
      </div>
    </div>
  );
}
