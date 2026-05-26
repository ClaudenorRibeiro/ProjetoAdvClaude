// ============================================================
// PÁGINA DE PERÍCIAS
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { periciasAPI, processosAPI, pessoasAPI } from '../../services/api';
import { formatarData, toTitleCase } from '../../utils/formatters';
import { toast } from 'react-toastify';

export default function Pericias() {
  const [lista, setLista]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [filtros, setFiltros]     = useState({ data_de: '', data_ate: '', pagina: 1 });
  const [tipos, setTipos]         = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando]   = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await periciasAPI.listar({ ...filtros, limite: 30 });
      if (data.ok) { setLista(data.dados.registros); setTotal(data.dados.total); }
    } catch { toast.error('Erro ao carregar perícias'); }
    finally { setCarregando(false); }
  }, [filtros]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    periciasAPI.tipos().then(r => { if (r.data.ok) setTipos(r.data.dados); });
  }, []);

  async function marcarEmail(id) {
    try {
      await periciasAPI.marcarEmailPerito(id);
      toast.success('E-mail registrado como enviado');
      carregar();
    } catch { toast.error('Erro ao atualizar'); }
  }

  async function marcarComunicado(id) {
    try {
      await periciasAPI.marcarComunicado(id);
      toast.success('Comunicado registrado como enviado');
      carregar();
    } catch { toast.error('Erro ao atualizar'); }
  }

  function setFiltro(k, v) { setFiltros(f => ({...f, [k]: v, pagina: 1})); }

  return (
    <div>
      {/* Filtros */}
      <div className="card" style={{marginBottom:'16px'}}>
        <div style={{display:'flex',gap:'12px',flexWrap:'wrap',alignItems:'flex-end'}}>
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
            onClick={() => { setEditando(null); setModalAberto(true); }}>
            + Nova Perícia
          </button>
          <span style={{marginLeft:'auto',color:'#888',fontSize:'13px',marginBottom:'1px'}}>
            {total} perícia(s)
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
                  <th>Data / Hora</th><th>Perito</th><th>Assistente</th>
                  <th>Status</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(p => (
                  <tr key={p.id}>
                    <td>{p.processo_numero || '—'}</td>
                    <td style={{maxWidth:'180px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {p.pasta_titulo || '—'}
                    </td>
                    <td>{p.tipo_nome || '—'}</td>
                    <td>
                      <strong>{formatarData(p.data)}</strong>
                      {p.hora && <div style={{fontSize:'12px',color:'#888'}}>{p.hora.slice(0,5)}</div>}
                    </td>
                    <td>{p.perito_nome || '—'}</td>
                    <td>{p.assistente_nome || '—'}</td>
                    <td>
                      <span className={`badge ${p.status === 'realizada' ? 'badge-verde' : 'badge-azul'}`}>
                        {p.status === 'realizada' ? 'Realizada' : 'Agendada'}
                      </span>
                    </td>
                    <td>
                      <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                        <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px'}}
                          onClick={() => { setEditando(p); setModalAberto(true); }}>
                          Editar
                        </button>
                        {!p.email_perito_enviado && p.perito_id && (
                          <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px'}}
                            onClick={() => marcarEmail(p.id)}
                            title="Marcar e-mail ao perito como enviado">
                            ✉ Perito
                          </button>
                        )}
                        {!p.comunicado_enviado && (
                          <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px'}}
                            onClick={() => marcarComunicado(p.id)}
                            title="Marcar comunicado ao cliente como enviado">
                            ✉ Cliente
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && <p className="lista-vazia">Nenhuma perícia encontrada</p>}
          </div>
        )}

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

      {modalAberto && (
        <ModalPericia tipos={tipos} pericia={editando}
          onFechar={(reload) => { setModalAberto(false); if(reload) carregar(); }} />
      )}
    </div>
  );
}

function ModalPericia({ tipos, pericia, onFechar }) {
  const [form, setForm]       = useState(pericia || {});
  const [salvando, setSalvando] = useState(false);
  const [pastas, setPastas]   = useState([]);
  const [processos, setProcessos] = useState([]);
  const [buscaPasta, setBuscaPasta] = useState(pericia?.pasta_titulo || '');
  const [peritos, setPeritos] = useState([]);
  const [buscaPerito, setBuscaPerito] = useState(pericia?.perito_nome || '');
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

  async function buscarPeritos(termo) {
    if (termo.length < 2) return;
    const tipo = form.perito_tipo || 'fisica';
    const fn = tipo === 'fisica' ? pessoasAPI.listarFisicas : pessoasAPI.listarJuridicas;
    const { data } = await fn({ busca: termo, limite: 10 });
    if (data.ok) setPeritos(data.dados.registros);
  }

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.processo_id) return toast.error('Processo é obrigatório');
    if (!form.data)        return toast.error('Data é obrigatória');
    setSalvando(true);
    try {
      if (pericia?.id) {
        await periciasAPI.atualizar(pericia.id, form);
        toast.success('Perícia atualizada!');
      } else {
        await periciasAPI.criar(form);
        toast.success('Perícia criada!');
      }
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>{pericia ? 'Editar Perícia' : 'Nova Perícia'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          {/* Busca de pasta → processo */}
          <div className="form-group">
            <label className="form-label">Pasta *</label>
            <input className="form-control" placeholder="Buscar pasta..."
              value={buscaPasta}
              onChange={e => { setBuscaPasta(e.target.value); buscarPastas(e.target.value); }} />
            {pastas.length > 0 && (
              <div style={{border:'1px solid #ddd',borderRadius:'6px',marginTop:'4px',maxHeight:'130px',overflowY:'auto'}}>
                {pastas.map(p => (
                  <div key={p.id} style={{padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid #f0f0f0'}}
                    onClick={() => { setBuscaPasta(p.titulo); setPastas([]); setProcessos(p.processos||[]); }}>
                    {p.numero} — {p.titulo}
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
                <option value="">— Selecione —</option>
                {processos.map(p => <option key={p.id} value={p.id}>{p.numero||`#${p.id}`}</option>)}
              </select>
            </div>
          )}
          {!processos.length && pericia && (
            <div className="form-group">
              <label className="form-label">Processo</label>
              <input className="form-control" disabled value={pericia.processo_numero||'—'} />
            </div>
          )}

          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Tipo de perícia</label>
              <select className="form-control" value={form.tipo_pericia_id||''}
                onChange={e => set('tipo_pericia_id', e.target.value)}>
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
              <label className="form-label">Hora</label>
              <input type="time" className="form-control" value={form.hora||''}
                onChange={e => set('hora', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Local</label>
            <input className="form-control" value={form.local||''}
              onChange={e => set('local', e.target.value)}
              onBlur={() => set('local', toTitleCase(form.local))}
              placeholder="Endereço da perícia..." />
          </div>

          {/* Perito */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Tipo do perito</label>
              <select className="form-control" value={form.perito_tipo||'fisica'}
                onChange={e => { set('perito_tipo', e.target.value); set('perito_id',''); setPeritos([]); setBuscaPerito(''); }}>
                <option value="fisica">Pessoa Física</option>
                <option value="juridica">Pessoa Jurídica</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Assistente técnico</label>
              <select className="form-control" value={form.assistente_tecnico_id||''}
                onChange={e => set('assistente_tecnico_id', e.target.value)}>
                <option value="">— Não definido —</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Perito</label>
            <input className="form-control" placeholder="Buscar perito pelo nome..."
              value={buscaPerito}
              onChange={e => { setBuscaPerito(e.target.value); buscarPeritos(e.target.value); }} />
            {peritos.length > 0 && (
              <div style={{border:'1px solid #ddd',borderRadius:'6px',marginTop:'4px',maxHeight:'130px',overflowY:'auto'}}>
                {peritos.map(p => (
                  <div key={p.id} style={{padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid #f0f0f0'}}
                    onClick={() => {
                      set('perito_id', p.id);
                      setBuscaPerito(p.nome || p.razao_social);
                      setPeritos([]);
                    }}>
                    {p.nome || p.razao_social}
                  </div>
                ))}
              </div>
            )}
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
