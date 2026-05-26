// ============================================================
// PÁGINA DE TAREFAS
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { tarefasAPI, processosAPI } from '../../services/api';
import { formatarData, labelPrioridade, toTitleCase } from '../../utils/formatters';
import { toast } from 'react-toastify';

const PRIORIDADE_COR = { urgente:'badge-vermelho', normal:'badge-laranja', baixa:'badge-verde' };

export default function Tarefas() {
  const [lista, setLista]           = useState([]);
  const [total, setTotal]           = useState(0);
  const [filtros, setFiltros]       = useState({ concluida: '0', prioridade: '' });
  const [carregando, setCarregando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando]     = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await tarefasAPI.listar({ ...filtros, limite: 50 });
      if (data.ok) { setLista(data.dados.registros); setTotal(data.dados.total); }
    } catch { toast.error('Erro ao carregar tarefas'); }
    finally { setCarregando(false); }
  }, [filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  async function toggleConcluir(tarefa) {
    try {
      if (tarefa.concluida) {
        await tarefasAPI.reabrir(tarefa.id);
        toast.success('Tarefa reaberta');
      } else {
        await tarefasAPI.concluir(tarefa.id);
        toast.success('Tarefa concluída!');
      }
      carregar();
    } catch (err) { toast.error('Erro ao alterar tarefa'); }
  }

  function setFiltro(k, v) { setFiltros(f => ({...f, [k]: v})); }

  return (
    <div>
      <div className="card" style={{marginBottom:'16px'}}>
        <div style={{display:'flex',gap:'12px',flexWrap:'wrap',alignItems:'flex-end'}}>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Mostrar</label>
            <select className="form-control" value={filtros.concluida} onChange={e=>setFiltro('concluida',e.target.value)}>
              <option value="0">Pendentes</option>
              <option value="1">Concluídas</option>
              <option value="">Todas</option>
            </select>
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Prioridade</label>
            <select className="form-control" value={filtros.prioridade} onChange={e=>setFiltro('prioridade',e.target.value)}>
              <option value="">Todas</option>
              <option value="urgente">🔴 Urgente</option>
              <option value="normal">🟡 Normal</option>
              <option value="baixa">🟢 Baixa</option>
            </select>
          </div>
          <button className="btn btn-primary" style={{marginBottom:'1px'}} onClick={() => { setEditando(null); setModalAberto(true); }}>
            + Nova Tarefa
          </button>
          <span style={{marginLeft:'auto',color:'#888',fontSize:'13px',marginBottom:'1px'}}>{total} tarefa(s)</span>
        </div>
      </div>

      <div className="card">
        {carregando ? <div className="loading">Carregando...</div> : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr><th>Tarefa</th><th>Prioridade</th><th>Vencimento</th><th>Para</th><th>Processo</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {lista.map(t => (
                  <tr key={t.id} style={t.concluida ? {opacity:0.6} : {}}>
                    <td>
                      <strong style={t.concluida ? {textDecoration:'line-through'} : {}}>{t.titulo}</strong>
                      {t.descricao && <div style={{fontSize:'12px',color:'#888',marginTop:'2px'}}>{t.descricao}</div>}
                    </td>
                    <td><span className={`badge ${PRIORIDADE_COR[t.prioridade]}`}>{labelPrioridade(t.prioridade)}</span></td>
                    <td style={!t.concluida && t.dias_restantes < 0 ? {color:'#dc2626',fontWeight:600} : {}}>
                      {t.data_vencimento ? formatarData(t.data_vencimento) : '—'}
                      {!t.concluida && t.dias_restantes < 0 && <span style={{fontSize:'11px',display:'block'}}>({Math.abs(t.dias_restantes)}d atraso)</span>}
                    </td>
                    <td>{t.atribuida_para_nome || 'Escritório'}</td>
                    <td>{t.processo_numero || '—'}</td>
                    <td>
                      <div style={{display:'flex',gap:'6px'}}>
                        <button
                          className={`btn ${t.concluida ? 'btn-outline' : 'btn-success'}`}
                          style={{fontSize:'12px',padding:'4px 10px'}}
                          onClick={() => toggleConcluir(t)}
                        >
                          {t.concluida ? 'Reabrir' : '✓ Concluir'}
                        </button>
                        <button className="btn btn-outline" style={{fontSize:'12px',padding:'4px 10px'}}
                          onClick={() => { setEditando(t); setModalAberto(true); }}>
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && <p className="lista-vazia">Nenhuma tarefa encontrada</p>}
          </div>
        )}
      </div>

      {modalAberto && (
        <ModalTarefa
          tarefa={editando}
          onFechar={(reload) => { setModalAberto(false); if(reload) carregar(); }}
        />
      )}
    </div>
  );
}

function ModalTarefa({ tarefa, onFechar }) {
  const [form, setForm]     = useState(tarefa || { prioridade: 'normal' });
  const [salvando, setSalvando] = useState(false);
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    processosAPI.auxiliares().then(r => setUsuarios(r.data.dados.usuarios || []));
  }, []);

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.titulo) return toast.error('Título é obrigatório');
    setSalvando(true);
    try {
      if (tarefa?.id) {
        await tarefasAPI.atualizar(tarefa.id, form);
        toast.success('Tarefa atualizada!');
      } else {
        await tarefasAPI.criar(form);
        toast.success('Tarefa criada!');
      }
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>{tarefa ? 'Editar Tarefa' : 'Nova Tarefa'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Título *</label>
            <input className="form-control" value={form.titulo||''} onChange={e=>set('titulo',e.target.value)} onBlur={()=>set('titulo', toTitleCase(form.titulo))} placeholder="Descreva a tarefa..." />
          </div>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea className="form-control" rows={3} value={form.descricao||''} onChange={e=>set('descricao',e.target.value)} onBlur={()=>set('descricao', toTitleCase(form.descricao))} />
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Prioridade</label>
              <select className="form-control" value={form.prioridade} onChange={e=>set('prioridade',e.target.value)}>
                <option value="urgente">🔴 Urgente</option>
                <option value="normal">🟡 Normal</option>
                <option value="baixa">🟢 Baixa</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Vencimento</label>
              <input type="date" className="form-control" value={form.data_vencimento||''} onChange={e=>set('data_vencimento',e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Atribuir para</label>
              <select className="form-control" value={form.atribuida_para||''} onChange={e=>set('atribuida_para',e.target.value)}>
                <option value="">Escritório</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">ID do Processo (opcional)</label>
            <input type="number" className="form-control" value={form.processo_id||''} onChange={e=>set('processo_id',e.target.value)} placeholder="Vincular ao processo..." />
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
