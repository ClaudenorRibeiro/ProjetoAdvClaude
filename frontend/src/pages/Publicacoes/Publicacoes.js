// ============================================================
// PÁGINA DE PUBLICAÇÕES AASP
// Busca incremental, marcação de tratadas, geração de prazos/tarefas
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { publicacoesAPI, prazosAPI, tarefasAPI } from '../../services/api';
import { formatarData } from '../../utils/formatters';
import { toast } from 'react-toastify';

export default function Publicacoes() {
  const [lista, setLista]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [filtros, setFiltros] = useState({ tratada: '0', data_de: '', data_ate: '', pagina: 1 });
  const [carregando, setCarregando] = useState(false);
  const [buscando, setBuscando]     = useState(false);
  const [publicacaoAberta, setPublicacaoAberta] = useState(null);
  const [modalPrazo, setModalPrazo]   = useState(null);
  const [modalTarefa, setModalTarefa] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await publicacoesAPI.listar({ ...filtros, limite: 30 });
      if (data.ok) { setLista(data.dados.registros); setTotal(data.dados.total); }
    } catch { toast.error('Erro ao carregar publicações'); }
    finally { setCarregando(false); }
  }, [filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  async function buscarNaAasp() {
    setBuscando(true);
    try {
      const { data } = await publicacoesAPI.buscarAasp({});
      if (data.ok) {
        toast.success(`${data.dados?.novas || 0} nova(s) publicação(ões) importada(s)`);
        carregar();
      }
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao buscar na AASP'); }
    finally { setBuscando(false); }
  }

  async function tratarPublicacao(id) {
    try {
      await publicacoesAPI.marcarTratada(id);
      toast.success('Publicação marcada como tratada');
      carregar();
    } catch { toast.error('Erro ao atualizar'); }
  }

  async function excluirPublicacao(id) {
    if (!window.confirm('Excluir esta publicação? A ação ficará registrada no log.')) return;
    try {
      await publicacoesAPI.excluir(id);
      toast.success('Publicação excluída');
      carregar();
    } catch { toast.error('Erro ao excluir'); }
  }

  function setFiltro(k, v) { setFiltros(f => ({...f, [k]: v, pagina: 1})); }

  return (
    <div>
      {/* Filtros + ação buscar */}
      <div className="card" style={{marginBottom:'16px'}}>
        <div style={{display:'flex',gap:'12px',flexWrap:'wrap',alignItems:'flex-end'}}>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Status</label>
            <select className="form-control" value={filtros.tratada}
              onChange={e => setFiltro('tratada', e.target.value)}>
              <option value="0">Não tratadas</option>
              <option value="1">Tratadas</option>
              <option value="">Todas</option>
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
            onClick={buscarNaAasp} disabled={buscando}>
            {buscando ? 'Buscando...' : '↓ Buscar na AASP'}
          </button>
          <span style={{marginLeft:'auto',color:'#888',fontSize:'13px',marginBottom:'1px'}}>
            {total} publicação(ões)
          </span>
        </div>
      </div>

      <div className="card">
        {carregando ? <div className="loading">Carregando...</div> : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data</th><th>Processo</th><th>Conteúdo</th>
                  <th>Status</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(p => (
                  <tr key={p.id}>
                    <td style={{whiteSpace:'nowrap'}}>{formatarData(p.data_publicacao)}</td>
                    <td style={{whiteSpace:'nowrap'}}>{p.numero_processo || '—'}</td>
                    <td style={{maxWidth:'380px'}}>
                      <div style={{
                        overflow:'hidden',
                        textOverflow:'ellipsis',
                        whiteSpace:'nowrap',
                        fontSize:'13px',
                        cursor:'pointer',
                        color:'#1a56db'
                      }}
                        onClick={() => setPublicacaoAberta(p)}
                        title="Clique para ler o texto completo">
                        {p.conteudo}
                      </div>
                      {p.tratada_por_nome && (
                        <div style={{fontSize:'11px',color:'#059669',marginTop:'2px'}}>
                          ✓ Tratada por {p.tratada_por_nome} em {formatarData(p.tratada_em)}
                        </div>
                      )}
                    </td>
                    <td>
                      {p.tratada
                        ? <span className="badge badge-verde">Tratada</span>
                        : <span className="badge badge-laranja">Pendente</span>
                      }
                    </td>
                    <td>
                      <div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}>
                        {!p.tratada && (
                          <button className="btn btn-success" style={{fontSize:'11px',padding:'3px 7px'}}
                            onClick={() => tratarPublicacao(p.id)}>
                            ✓ Tratar
                          </button>
                        )}
                        <button className="btn btn-outline" style={{fontSize:'11px',padding:'3px 7px'}}
                          onClick={() => setModalPrazo(p)}>
                          + Prazo
                        </button>
                        <button className="btn btn-outline" style={{fontSize:'11px',padding:'3px 7px'}}
                          onClick={() => setModalTarefa(p)}>
                          + Tarefa
                        </button>
                        <button className="btn btn-danger" style={{fontSize:'11px',padding:'3px 7px'}}
                          onClick={() => excluirPublicacao(p.id)}>
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && (
              <p className="lista-vazia">
                Nenhuma publicação encontrada.
                Clique em "Buscar na AASP" para importar novas publicações.
              </p>
            )}
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

      {/* Modal: texto completo da publicação */}
      {publicacaoAberta && (
        <div className="modal-overlay">
          <div className="modal-box modal-largo">
            <div className="modal-header">
              <h3>Publicação — {formatarData(publicacaoAberta.data_publicacao)}</h3>
              <button className="modal-fechar" onClick={() => setPublicacaoAberta(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{marginBottom:'12px',display:'flex',gap:'16px',fontSize:'13px',color:'#555'}}>
                {publicacaoAberta.numero_processo && (
                  <span><strong>Processo:</strong> {publicacaoAberta.numero_processo}</span>
                )}
                {publicacaoAberta.tratada_por_nome && (
                  <span style={{color:'#059669'}}>
                    ✓ Tratada por <strong>{publicacaoAberta.tratada_por_nome}</strong> em {formatarData(publicacaoAberta.tratada_em)}
                  </span>
                )}
              </div>
              <div style={{
                background:'#f8fafc', padding:'16px', borderRadius:'8px',
                fontSize:'13px', lineHeight:'1.7', whiteSpace:'pre-wrap', maxHeight:'400px', overflowY:'auto'
              }}>
                {publicacaoAberta.conteudo}
              </div>
            </div>
            <div className="modal-footer">
              {!publicacaoAberta.tratada && (
                <button className="btn btn-success" onClick={() => {
                  tratarPublicacao(publicacaoAberta.id);
                  setPublicacaoAberta(null);
                }}>
                  ✓ Marcar como Tratada
                </button>
              )}
              <button className="btn btn-outline" onClick={() => {
                setModalPrazo(publicacaoAberta);
                setPublicacaoAberta(null);
              }}>
                + Gerar Prazo
              </button>
              <button className="btn btn-outline" onClick={() => {
                setModalTarefa(publicacaoAberta);
                setPublicacaoAberta(null);
              }}>
                + Gerar Tarefa
              </button>
              <button className="btn btn-secondary" onClick={() => setPublicacaoAberta(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: gerar prazo a partir da publicação */}
      {modalPrazo && (
        <ModalGerarPrazo publicacao={modalPrazo}
          onFechar={() => setModalPrazo(null)} />
      )}

      {/* Modal: gerar tarefa a partir da publicação */}
      {modalTarefa && (
        <ModalGerarTarefa publicacao={modalTarefa}
          onFechar={() => setModalTarefa(null)} />
      )}
    </div>
  );
}

// Modal para gerar prazo vinculado à publicação
function ModalGerarPrazo({ publicacao, onFechar }) {
  const [form, setForm]       = useState({
    processo_numero: publicacao.numero_processo || '',
    data_inicio: new Date().toISOString().split('T')[0],
    tipo_dias: 'uteis',
    descricao: `Publicação AASP: ${publicacao.conteudo?.slice(0, 60) || ''}...`,
  });
  const [salvando, setSalvando] = useState(false);
  const [tipos, setTipos]       = useState({ tipos: [], subtipos: [] });

  useEffect(() => {
    prazosAPI.tipos().then(r => { if (r.data.ok) setTipos(r.data.dados); });
  }, []);

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.processo_id) return toast.error('ID do processo é obrigatório');
    setSalvando(true);
    try {
      await prazosAPI.criar(form);
      toast.success('Prazo criado com sucesso!');
      onFechar();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao criar prazo'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Gerar Prazo da Publicação</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">ID do Processo *</label>
            <input type="number" className="form-control" value={form.processo_id||''}
              onChange={e => set('processo_id', e.target.value)}
              placeholder="Informe o ID do processo no sistema" />
            {form.processo_numero && (
              <small style={{color:'#888'}}>Nº do processo AASP: {form.processo_numero}</small>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Tipo de prazo</label>
            <select className="form-control" value={form.tipo_prazo_id||''}
              onChange={e => set('tipo_prazo_id', e.target.value)}>
              <option value="">— Selecione —</option>
              {tipos.tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <input className="form-control" value={form.descricao||''}
              onChange={e => set('descricao', e.target.value)} />
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Data início *</label>
              <input type="date" className="form-control" value={form.data_inicio}
                onChange={e => set('data_inicio', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Quantidade de dias</label>
              <input type="number" className="form-control" value={form.quantidade||''}
                onChange={e => set('quantidade', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de dias</label>
              <select className="form-control" value={form.tipo_dias}
                onChange={e => set('tipo_dias', e.target.value)}>
                <option value="uteis">Dias úteis</option>
                <option value="corridos">Dias corridos</option>
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Criar Prazo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal para gerar tarefa vinculada à publicação
function ModalGerarTarefa({ publicacao, onFechar }) {
  const [form, setForm]       = useState({
    prioridade: 'normal',
    titulo: `Tratar publicação: ${publicacao.numero_processo || 'processo'}`,
    descricao: publicacao.conteudo?.slice(0, 200) || '',
  });
  const [salvando, setSalvando] = useState(false);

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.titulo) return toast.error('Título é obrigatório');
    setSalvando(true);
    try {
      await tarefasAPI.criar(form);
      toast.success('Tarefa criada com sucesso!');
      onFechar();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao criar tarefa'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Gerar Tarefa da Publicação</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Título *</label>
            <input className="form-control" value={form.titulo}
              onChange={e => set('titulo', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea className="form-control" rows={3} value={form.descricao}
              onChange={e => set('descricao', e.target.value)} />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Prioridade</label>
              <select className="form-control" value={form.prioridade}
                onChange={e => set('prioridade', e.target.value)}>
                <option value="urgente">🔴 Urgente</option>
                <option value="normal">🟡 Normal</option>
                <option value="baixa">🟢 Baixa</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Vencimento</label>
              <input type="date" className="form-control" value={form.data_vencimento||''}
                onChange={e => set('data_vencimento', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Criar Tarefa'}
          </button>
        </div>
      </div>
    </div>
  );
}
