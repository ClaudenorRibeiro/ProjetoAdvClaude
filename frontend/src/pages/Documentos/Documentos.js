// ============================================================
// PÁGINA DE DOCUMENTOS E MODELOS
// Geração de documentos Word/PDF a partir de modelos com variáveis
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { documentosAPI, processosAPI } from '../../services/api';
import { formatarData, toTitleCase } from '../../utils/formatters';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';

export default function Documentos() {
  const { ehAdmin } = useAuth();
  const [abaAtiva, setAbaAtiva]   = useState('gerar');
  const [modelos, setModelos]     = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [modalModelo, setModalModelo] = useState(false);
  const [modeloEditando, setModeloEditando] = useState(null);

  const carregarModelos = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await documentosAPI.listarModelos();
      if (data.ok) setModelos(data.dados);
    } catch { toast.error('Erro ao carregar modelos'); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregarModelos(); }, [carregarModelos]);

  return (
    <div>
      {/* Abas */}
      <div style={{display:'flex',marginBottom:'16px'}}>
        <button className={`btn ${abaAtiva==='gerar'?'btn-primary':'btn-outline'}`}
          style={{borderRadius:'6px 0 0 6px'}}
          onClick={() => setAbaAtiva('gerar')}>
          Gerar Documento
        </button>
        {ehAdmin && (
          <button className={`btn ${abaAtiva==='modelos'?'btn-primary':'btn-outline'}`}
            style={{borderRadius:'0 6px 6px 0'}}
            onClick={() => setAbaAtiva('modelos')}>
            Gerenciar Modelos
          </button>
        )}
      </div>

      {/* ===== ABA: GERAR DOCUMENTO ===== */}
      {abaAtiva === 'gerar' && (
        <GerarDocumento modelos={modelos} />
      )}

      {/* ===== ABA: MODELOS (admin) ===== */}
      {abaAtiva === 'modelos' && ehAdmin && (
        <div className="card">
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'16px'}}>
            <button className="btn btn-primary"
              onClick={() => { setModeloEditando(null); setModalModelo(true); }}>
              + Novo Modelo
            </button>
          </div>
          {carregando ? <div className="loading">Carregando...</div> : (
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr><th>Modelo</th><th>Tipo</th><th>Criado em</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {modelos.map(m => (
                    <tr key={m.id}>
                      <td><strong>{m.titulo}</strong></td>
                      <td>
                        <span className={`badge ${m.tipo === 'pdf' ? 'badge-vermelho' : 'badge-azul'}`}>
                          {m.tipo?.toUpperCase() || 'DOCX'}
                        </span>
                      </td>
                      <td>{formatarData(m.criado_em)}</td>
                      <td>
                        <button className="btn btn-outline" style={{fontSize:'12px',padding:'4px 10px'}}
                          onClick={() => { setModeloEditando(m); setModalModelo(true); }}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {modelos.length === 0 && (
                <p className="lista-vazia">
                  Nenhum modelo cadastrado.
                  Use as variáveis {'{{nome_cliente}}'}, {'{{numero_processo}}'}, {'{{data_hoje}}'} e outras no texto.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal: criar/editar modelo */}
      {modalModelo && (
        <ModalModelo modelo={modeloEditando}
          onFechar={(reload) => { setModalModelo(false); if(reload) carregarModelos(); }} />
      )}
    </div>
  );
}

// Formulário para gerar um documento a partir de um modelo
function GerarDocumento({ modelos }) {
  const [form, setForm]     = useState({ formato: 'docx' });
  const [pastas, setPastas] = useState([]);
  const [processos, setProcessos] = useState([]);
  const [buscaPasta, setBuscaPasta] = useState('');
  const [gerando, setGerando]   = useState(false);

  async function buscarPastas(termo) {
    if (termo.length < 2) return;
    const { data } = await processosAPI.listarPastas({ busca: termo, limite: 10 });
    if (data.ok) setPastas(data.dados.registros);
  }

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function gerar() {
    if (!form.modelo_id)   return toast.error('Selecione um modelo');
    if (!form.processo_id) return toast.error('Selecione o processo');
    setGerando(true);
    try {
      const resp = await documentosAPI.gerar(form);
      const tipo = form.formato === 'pdf' ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const ext  = form.formato === 'pdf' ? '.pdf' : '.docx';
      const url = URL.createObjectURL(new Blob([resp.data], { type: tipo }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `documento${ext}`;
      link.click();
      toast.success('Documento gerado e baixado!');
    } catch { toast.error('Erro ao gerar documento'); }
    finally { setGerando(false); }
  }

  return (
    <div className="card">
      <h3 style={{marginBottom:'20px',fontSize:'15px',color:'#1e2a3a'}}>Gerar novo documento</h3>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Modelo *</label>
          <select className="form-control" value={form.modelo_id||''}
            onChange={e => set('modelo_id', e.target.value)}>
            <option value="">— Selecione um modelo —</option>
            {modelos.map(m => <option key={m.id} value={m.id}>{m.titulo}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Formato</label>
          <select className="form-control" value={form.formato}
            onChange={e => set('formato', e.target.value)}>
            <option value="docx">Word (.docx)</option>
            <option value="pdf">PDF</option>
          </select>
        </div>
      </div>

      {/* Seleção de pasta → processo */}
      <div className="form-group" style={{position:'relative'}}>
        <label className="form-label">Pasta *</label>
        <input className="form-control" placeholder="Buscar pasta pelo título..."
          value={buscaPasta}
          onChange={e => { setBuscaPasta(e.target.value); buscarPastas(e.target.value); }} />
        {pastas.length > 0 && (
          <div style={{border:'1px solid #ddd',borderRadius:'6px',marginTop:'4px',maxHeight:'140px',overflowY:'auto',background:'#fff',position:'absolute',zIndex:10,width:'100%'}}>
            {pastas.map(p => (
              <div key={p.id} style={{padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid #f0f0f0'}}
                onClick={() => {
                  setBuscaPasta(`${p.numero} — ${p.titulo}`);
                  setPastas([]);
                  setProcessos(p.processos || []);
                  set('pasta_id', p.id);
                }}>
                <strong>{p.numero}</strong> — {p.titulo}
                <div style={{fontSize:'11px',color:'#888'}}>{p.cliente_nome}</div>
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
            {processos.map(p => <option key={p.id} value={p.id}>{p.numero || `#${p.id}`}</option>)}
          </select>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Informações adicionais (opcional)</label>
        <textarea className="form-control" rows={3} value={form.info_adicional||''}
          onChange={e => set('info_adicional', e.target.value)}
          placeholder="Informações extras que serão incorporadas ao documento..." />
      </div>

      {/* Referência de variáveis disponíveis */}
      <div style={{background:'#f8fafc',padding:'12px',borderRadius:'8px',marginBottom:'16px'}}>
        <p style={{fontSize:'12px',color:'#555',marginBottom:'4px',fontWeight:600}}>
          Variáveis disponíveis nos modelos:
        </p>
        <p style={{fontSize:'11px',color:'#888',lineHeight:'1.8'}}>
          {'{{nome_cliente}}'} {'{{cpf_cliente}}'} {'{{numero_processo}}'} {'{{numero_pasta}}'} {'{{pasta_titulo}}'}
          {'{{vara}}'} {'{{forum}}'} {'{{data_hoje}}'} {'{{nome_escritorio}}'} {'{{cnpj_escritorio}}'}
        </p>
      </div>

      <button className="btn btn-primary" onClick={gerar} disabled={gerando}>
        {gerando ? 'Gerando...' : 'Gerar e Baixar Documento'}
      </button>
    </div>
  );
}

// Modal para criar ou editar modelo de documento
function ModalModelo({ modelo, onFechar }) {
  const [form, setForm]       = useState(modelo || { tipo: 'docx' });
  const [salvando, setSalvando] = useState(false);

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.titulo)   return toast.error('Título é obrigatório');
    if (!form.conteudo) return toast.error('Conteúdo é obrigatório');
    setSalvando(true);
    try {
      if (modelo?.id) {
        await documentosAPI.atualizarModelo(modelo.id, form);
        toast.success('Modelo atualizado!');
      } else {
        await documentosAPI.criarModelo(form);
        toast.success('Modelo criado!');
      }
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" onClick={() => onFechar(false)}>
      <div className="modal-box modal-largo" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{modelo ? 'Editar Modelo' : 'Novo Modelo de Documento'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Título do modelo *</label>
              <input className="form-control" value={form.titulo||''}
                onChange={e => set('titulo', e.target.value)}
                onBlur={() => set('titulo', toTitleCase(form.titulo))}
                placeholder="Ex: Procuração Trabalhista" />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de saída</label>
              <select className="form-control" value={form.tipo||'docx'}
                onChange={e => set('tipo', e.target.value)}>
                <option value="docx">Word (.docx)</option>
                <option value="pdf">PDF</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Conteúdo do modelo *</label>
            <small style={{display:'block',color:'#888',marginBottom:'6px'}}>
              Use {'{{variavel}}'} para inserir dados automáticos. Ex: {'{{nome_cliente}}'}, {'{{numero_processo}}'}, {'{{data_hoje}}'}
            </small>
            <textarea className="form-control" rows={12} value={form.conteudo||''}
              onChange={e => set('conteudo', e.target.value)}
              style={{fontFamily:'monospace',fontSize:'13px'}}
              placeholder={'PROCURAÇÃO\n\nEu, {{nome_cliente}}, portador do CPF {{cpf_cliente}},\nnomeiro o escritório para representar-me no processo {{numero_processo}}...'} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar Modelo'}
          </button>
        </div>
      </div>
    </div>
  );
}
