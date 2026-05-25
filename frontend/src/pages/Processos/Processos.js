// ============================================================
// PÁGINA DE PROCESSOS E PASTAS
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { processosAPI, pessoasAPI, andamentoAPI } from '../../services/api';
import { formatarData, formatarNumeroPasta, labelAreaDireito, toTitleCase } from '../../utils/formatters';
import { toast } from 'react-toastify';

export default function Processos() {
  const [lista, setLista]           = useState([]);
  const [total, setTotal]           = useState(0);
  const [busca, setBusca]           = useState('');
  const [pagina, setPagina]         = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [modalPasta, setModalPasta] = useState(false);
  const [pastaSelecionada, setPastaSelecionada] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await processosAPI.listarPastas({ busca, pagina, limite: 20 });
      if (data.ok) { setLista(data.dados.registros); setTotal(data.dados.total); }
    } catch { toast.error('Erro ao carregar pastas'); }
    finally { setCarregando(false); }
  }, [busca, pagina]);

  useEffect(() => { carregar(); }, [carregar]);

  const AREA_COR = { trabalhista:'badge-azul', previdenciario:'badge-verde', familia:'badge-laranja', outro:'badge-cinza' };

  return (
    <div>
      <div className="card" style={{marginBottom:'16px'}}>
        <div style={{display:'flex',gap:'12px',alignItems:'center',flexWrap:'wrap'}}>
          <input className="form-control" style={{maxWidth:'300px'}} placeholder="Buscar pasta por título ou número..."
            value={busca} onChange={e=>{setBusca(e.target.value);setPagina(1);}} />
          <button className="btn btn-primary" onClick={() => { setPastaSelecionada(null); setModalPasta(true); }}>
            + Nova Pasta
          </button>
          <span style={{marginLeft:'auto',color:'#888',fontSize:'13px'}}>{total} pasta(s)</span>
        </div>
      </div>

      <div className="card">
        {carregando ? <div className="loading">Carregando...</div> : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr><th>Nº</th><th>Pasta</th><th>Cliente</th><th>Área</th><th>Processos</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {lista.map(p => (
                  <tr key={p.id}>
                    <td><strong>{formatarNumeroPasta(p.numero)}</strong></td>
                    <td>{p.titulo}</td>
                    <td>{p.cliente_nome}</td>
                    <td><span className={`badge ${AREA_COR[p.area_direito]}`}>{labelAreaDireito(p.area_direito)}</span></td>
                    <td>{p.total_processos}</td>
                    <td>
                      <Link to={`/processos/pasta/${p.id}`} className="btn btn-outline" style={{fontSize:'12px',padding:'4px 10px'}}>
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && <p className="lista-vazia">Nenhuma pasta encontrada</p>}
          </div>
        )}

        {Math.ceil(total/20) > 1 && (
          <div style={{display:'flex',gap:'8px',marginTop:'16px',justifyContent:'center'}}>
            <button className="btn btn-outline" disabled={pagina===1} onClick={()=>setPagina(p=>p-1)}>← Anterior</button>
            <span style={{padding:'8px 12px',fontSize:'13px'}}>Página {pagina}</span>
            <button className="btn btn-outline" onClick={()=>setPagina(p=>p+1)}>Próxima →</button>
          </div>
        )}
      </div>

      {modalPasta && (
        <ModalPasta onFechar={(reload) => { setModalPasta(false); if(reload) carregar(); }} />
      )}
    </div>
  );
}

// Modal de nova pasta
function ModalPasta({ onFechar }) {
  const [form, setForm]     = useState({ tipo_pessoa: 'fisica', area_direito: 'trabalhista' });
  const [salvando, setSalvando] = useState(false);
  const [pessoas, setPessoas]   = useState([]);
  const [buscaPessoa, setBuscaPessoa] = useState('');

  async function buscarPessoas(termo) {
    if (termo.length < 2) return;
    const fn = form.tipo_pessoa === 'fisica' ? pessoasAPI.listarFisicas : pessoasAPI.listarJuridicas;
    const { data } = await fn({ busca: termo, limite: 10 });
    if (data.ok) setPessoas(data.dados.registros);
  }

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.titulo || !form.cliente_id) return toast.error('Título e cliente são obrigatórios');
    setSalvando(true);
    try {
      await processosAPI.criarPasta(form);
      toast.success('Pasta criada com sucesso!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao criar pasta'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" onClick={() => onFechar(false)}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nova Pasta</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Título (Autor vs Réu) *</label>
            <input className="form-control" value={form.titulo||''} onChange={e=>set('titulo',e.target.value)} onBlur={()=>set('titulo', toTitleCase(form.titulo))} placeholder="Ex: João Silva vs Empresa XYZ" />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Área do Direito</label>
              <select className="form-control" value={form.area_direito} onChange={e=>set('area_direito',e.target.value)}>
                <option value="trabalhista">Trabalhista</option>
                <option value="previdenciario">Previdenciário</option>
                <option value="familia">Família</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de cliente</label>
              <select className="form-control" value={form.tipo_pessoa} onChange={e=>{set('tipo_pessoa',e.target.value);set('cliente_id','');setPessoas([]);}}>
                <option value="fisica">Pessoa Física</option>
                <option value="juridica">Pessoa Jurídica</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Cliente *</label>
            <input className="form-control" placeholder="Buscar cliente pelo nome..."
              value={buscaPessoa} onChange={e=>{setBuscaPessoa(e.target.value);buscarPessoas(e.target.value);}} />
            {pessoas.length > 0 && (
              <div style={{border:'1px solid #ddd',borderRadius:'6px',marginTop:'4px',maxHeight:'150px',overflowY:'auto'}}>
                {pessoas.map(p => (
                  <div key={p.id} style={{padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid #f0f0f0'}}
                    onClick={() => { set('cliente_id', p.id); setBuscaPessoa(p.nome || p.razao_social); setPessoas([]); }}>
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
            {salvando ? 'Salvando...' : 'Criar Pasta'}
          </button>
        </div>
      </div>
    </div>
  );
}
