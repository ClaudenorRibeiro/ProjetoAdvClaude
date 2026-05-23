// ============================================================
// PÁGINA DE CONFIGURAÇÕES
// Escritório, Usuários, Permissões, Feriados, Integrações
// Acesso restrito ao administrador
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { configuracaoAPI } from '../../services/api';
import { formatarData } from '../../utils/formatters';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';

// Módulos e ações para a matriz de permissões
const MODULOS_PERM = [
  'pessoas', 'processos', 'prazos', 'tarefas',
  'audiencias', 'pericias', 'financeiro',
  'documentos', 'publicacoes', 'relatorios',
];
const ACOES_PERM = ['visualizar', 'cadastrar', 'alterar', 'excluir'];

const TIPO_USUARIO = {
  advogado: 'Advogado',
  estagiario: 'Estagiário',
  secretario: 'Secretário',
  socio: 'Sócio',
  administrador: 'Administrador',
};

export default function Configuracoes() {
  const { ehAdmin } = useAuth();
  const [abaAtiva, setAbaAtiva] = useState('escritorio');

  if (!ehAdmin) {
    return (
      <div className="card">
        <p className="lista-vazia">Esta área é restrita ao administrador do escritório.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Abas */}
      <div className="card" style={{marginBottom:'16px',padding:'0'}}>
        <div className="abas-nav" style={{paddingLeft:'8px'}}>
          {[
            { key:'escritorio',  label:'Escritório' },
            { key:'usuarios',    label:'Usuários' },
            { key:'permissoes',  label:'Permissões' },
            { key:'feriados',    label:'Feriados' },
            { key:'integracoes', label:'Integrações' },
          ].map(({ key, label }) => (
            <button key={key} className={`aba-btn ${abaAtiva===key?'ativa':''}`}
              onClick={() => setAbaAtiva(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {abaAtiva === 'escritorio'  && <TabEscritorio />}
      {abaAtiva === 'usuarios'    && <TabUsuarios />}
      {abaAtiva === 'permissoes'  && <TabPermissoes />}
      {abaAtiva === 'feriados'    && <TabFeriados />}
      {abaAtiva === 'integracoes' && <TabIntegracoes />}
    </div>
  );
}

// ============================================================
// ABA: ESCRITÓRIO
// ============================================================
function TabEscritorio() {
  const [form, setForm]       = useState({});
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    configuracaoAPI.buscarEscritorio().then(r => {
      if (r.data.ok) setForm(r.data.dados);
    }).finally(() => setCarregando(false));
  }, []);

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.nome) return toast.error('Nome do escritório é obrigatório');
    setSalvando(true);
    try {
      await configuracaoAPI.atualizarEscritorio(form);
      toast.success('Dados do escritório salvos!');
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  if (carregando) return <div className="card"><div className="loading">Carregando...</div></div>;

  return (
    <div className="card">
      <h3 style={{marginBottom:'20px',fontSize:'15px',color:'#1e2a3a'}}>Dados do Escritório</h3>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Nome do escritório *</label>
          <input className="form-control" value={form.nome||''} onChange={e => set('nome', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">CNPJ / CPF</label>
          <input className="form-control" value={form.cnpj_cpf||''} onChange={e => set('cnpj_cpf', e.target.value)}
            placeholder="00.000.000/0000-00" />
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">E-mail principal</label>
          <input type="email" className="form-control" value={form.email||''} onChange={e => set('email', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Telefone</label>
          <input className="form-control" value={form.telefone||''} onChange={e => set('telefone', e.target.value)}
            placeholder="(11) 99999-9999" />
        </div>
      </div>
      <div className="grid-3">
        <div className="form-group">
          <label className="form-label">CEP</label>
          <input className="form-control" value={form.cep||''} onChange={e => set('cep', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Logradouro</label>
          <input className="form-control" value={form.logradouro||''} onChange={e => set('logradouro', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Número</label>
          <input className="form-control" value={form.numero||''} onChange={e => set('numero', e.target.value)} />
        </div>
      </div>
      <div className="grid-3">
        <div className="form-group">
          <label className="form-label">Bairro</label>
          <input className="form-control" value={form.bairro||''} onChange={e => set('bairro', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Cidade</label>
          <input className="form-control" value={form.cidade||''} onChange={e => set('cidade', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Estado</label>
          <input className="form-control" value={form.estado||''} onChange={e => set('estado', e.target.value)}
            placeholder="SP" maxLength={2} />
        </div>
      </div>

      <h4 style={{margin:'20px 0 12px',fontSize:'13px',fontWeight:600,color:'#555'}}>Configurações de alertas</h4>
      <div className="grid-3">
        <div className="form-group">
          <label className="form-label">Dias alerta prazos</label>
          <input type="number" min="1" className="form-control" value={form.dias_alerta_prazos||''}
            onChange={e => set('dias_alerta_prazos', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Dias alerta audiências</label>
          <input type="number" min="1" className="form-control" value={form.dias_alerta_audiencia||''}
            onChange={e => set('dias_alerta_audiencia', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Dias alerta perícias</label>
          <input type="number" min="1" className="form-control" value={form.dias_alerta_pericia||''}
            onChange={e => set('dias_alerta_pericia', e.target.value)} />
        </div>
      </div>

      <div style={{marginTop:'8px'}}>
        <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// ABA: USUÁRIOS
// ============================================================
function TabUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando]     = useState(null);

  const carregar = useCallback(async () => {
    try {
      const { data } = await configuracaoAPI.listarUsuarios();
      if (data.ok) setUsuarios(data.dados);
    } catch { toast.error('Erro ao carregar usuários'); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'16px'}}>
        <button className="btn btn-primary" onClick={() => { setEditando(null); setModalAberto(true); }}>
          + Novo Usuário
        </button>
      </div>
      {carregando ? <div className="loading">Carregando...</div> : (
        <div className="tabela-wrapper">
          <table className="tabela">
            <thead>
              <tr><th>Nome</th><th>Login</th><th>Tipo</th><th>OAB</th><th>Status</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.nome}</strong></td>
                  <td>{u.login}</td>
                  <td>{TIPO_USUARIO[u.tipo] || u.tipo}</td>
                  <td>{u.oab || '—'}</td>
                  <td>
                    <span className={`badge ${u.ativo ? 'badge-verde' : 'badge-cinza'}`}>
                      {u.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-outline" style={{fontSize:'12px',padding:'4px 10px'}}
                      onClick={() => { setEditando(u); setModalAberto(true); }}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {usuarios.length === 0 && <p className="lista-vazia">Nenhum usuário cadastrado</p>}
        </div>
      )}

      {modalAberto && (
        <ModalUsuario usuario={editando}
          onFechar={(reload) => { setModalAberto(false); if(reload) carregar(); }} />
      )}
    </div>
  );
}

function ModalUsuario({ usuario, onFechar }) {
  const [form, setForm]       = useState(usuario || { nivel: 2, tipo: 'advogado', ativo: true });
  const [salvando, setSalvando] = useState(false);

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.nome)  return toast.error('Nome é obrigatório');
    if (!form.login) return toast.error('Login é obrigatório');
    if (!usuario && !form.senha) return toast.error('Senha é obrigatória para novo usuário');
    setSalvando(true);
    try {
      if (usuario?.id) {
        await configuracaoAPI.atualizarUsuario(usuario.id, form);
        toast.success('Usuário atualizado!');
      } else {
        await configuracaoAPI.criarUsuario(form);
        toast.success('Usuário criado!');
      }
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" onClick={() => onFechar(false)}>
      <div className="modal-box modal-grande" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{usuario ? 'Editar Usuário' : 'Novo Usuário'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Nome completo *</label>
              <input className="form-control" value={form.nome||''} onChange={e => set('nome', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Login (usuário) *</label>
              <input className="form-control" value={form.login||''} onChange={e => set('login', e.target.value)}
                disabled={!!usuario} />
            </div>
          </div>
          {!usuario && (
            <div className="form-group">
              <label className="form-label">Senha *</label>
              <input type="password" className="form-control" value={form.senha||''}
                onChange={e => set('senha', e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>
          )}
          {usuario && (
            <div className="form-group">
              <label className="form-label">Nova senha (deixe em branco para não alterar)</label>
              <input type="password" className="form-control" value={form.senha||''}
                onChange={e => set('senha', e.target.value)} />
            </div>
          )}
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-control" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                {Object.entries(TIPO_USUARIO).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Nível de acesso</label>
              <select className="form-control" value={form.nivel} onChange={e => set('nivel', Number(e.target.value))}>
                <option value={1}>Admin</option>
                <option value={2}>Usuário comum</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Nº OAB (advogados)</label>
              <input className="form-control" value={form.oab||''} onChange={e => set('oab', e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input type="email" className="form-control" value={form.email||''}
                onChange={e => set('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" style={{marginBottom:'8px'}}>Opções</label>
              <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontSize:'13px'}}>
                  <input type="checkbox" checked={!!form.ativo}
                    onChange={e => set('ativo', e.target.checked)} />
                  Usuário ativo
                </label>
                <label style={{display:'flex',alignItems:'center',gap:'8px',cursor:'pointer',fontSize:'13px'}}>
                  <input type="checkbox" checked={!!form.ver_todos_processos}
                    onChange={e => set('ver_todos_processos', e.target.checked)} />
                  Ver todos os processos (não só os seus)
                </label>
              </div>
            </div>
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
// ABA: PERMISSÕES
// ============================================================
function TabPermissoes() {
  const [usuarios, setUsuarios]     = useState([]);
  const [usuarioId, setUsuarioId]   = useState('');
  const [permissoes, setPermissoes] = useState({});
  const [salvando, setSalvando]     = useState(false);

  useEffect(() => {
    configuracaoAPI.listarUsuarios().then(r => {
      // Mostra todos exceto superusuário (nível 0)
      if (r.data.ok) setUsuarios(r.data.dados.filter(u => u.nivel > 0));
    });
  }, []);

  useEffect(() => {
    if (!usuarioId) return;
    configuracaoAPI.buscarPermissoes(usuarioId).then(r => {
      if (r.data.ok) {
        // Backend já retorna objeto { modulo: { acao: bool } }
        setPermissoes(r.data.dados || {});
      }
    });
  }, [usuarioId]);

  function togglePerm(modulo, acao) {
    setPermissoes(p => ({
      ...p,
      [modulo]: { ...(p[modulo] || {}), [acao]: !(p[modulo]?.[acao]) }
    }));
  }

  // Marca/desmarca todas as ações de um módulo
  function toggleModulo(modulo, ativo) {
    const acoes = {};
    ACOES_PERM.forEach(a => { acoes[a] = ativo; });
    setPermissoes(p => ({ ...p, [modulo]: acoes }));
  }

  async function salvar() {
    if (!usuarioId) return toast.error('Selecione um usuário');
    setSalvando(true);
    try {
      await configuracaoAPI.salvarPermissoes(usuarioId, { permissoes });
      toast.success('Permissões salvas!');
    } catch { toast.error('Erro ao salvar permissões'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="card">
      <div className="form-group" style={{maxWidth:'320px',marginBottom:'20px'}}>
        <label className="form-label">Selecionar usuário</label>
        <select className="form-control" value={usuarioId}
          onChange={e => setUsuarioId(e.target.value)}>
          <option value="">— Selecione —</option>
          {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome} ({u.login})</option>)}
        </select>
      </div>

      {usuarioId && (
        <>
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Módulo</th>
                  {ACOES_PERM.map(a => (
                    <th key={a} style={{textAlign:'center',textTransform:'capitalize'}}>{a}</th>
                  ))}
                  <th style={{textAlign:'center'}}>Todos</th>
                </tr>
              </thead>
              <tbody>
                {MODULOS_PERM.map(modulo => {
                  const todosMarcados = ACOES_PERM.every(a => permissoes[modulo]?.[a]);
                  return (
                    <tr key={modulo}>
                      <td style={{fontWeight:500,textTransform:'capitalize'}}>{modulo}</td>
                      {ACOES_PERM.map(acao => (
                        <td key={acao} style={{textAlign:'center'}}>
                          <input type="checkbox"
                            checked={!!permissoes[modulo]?.[acao]}
                            onChange={() => togglePerm(modulo, acao)} />
                        </td>
                      ))}
                      <td style={{textAlign:'center'}}>
                        <input type="checkbox"
                          checked={todosMarcados}
                          onChange={e => toggleModulo(modulo, e.target.checked)}
                          title="Marcar/desmarcar todos" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:'16px'}}>
            <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar Permissões'}
            </button>
          </div>
        </>
      )}
      {!usuarioId && (
        <p className="lista-vazia" style={{paddingTop:'24px'}}>
          Selecione um usuário para gerenciar suas permissões
        </p>
      )}
    </div>
  );
}

// ============================================================
// ABA: FERIADOS
// ============================================================
function TabFeriados() {
  const [feriados, setFeriados] = useState([]);
  const [ano, setAno]           = useState(new Date().getFullYear());
  const [carregando, setCarregando] = useState(false);
  const [form, setForm]         = useState({ data: '', descricao: '', nacional: true });
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await configuracaoAPI.listarFeriados({ ano });
      if (data.ok) setFeriados(data.dados);
    } catch { toast.error('Erro ao carregar feriados'); }
    finally { setCarregando(false); }
  }, [ano]);

  useEffect(() => { carregar(); }, [carregar]);

  async function criarFeriado() {
    if (!form.data || !form.descricao) return toast.error('Data e descrição são obrigatórias');
    setSalvando(true);
    try {
      await configuracaoAPI.criarFeriado(form);
      toast.success('Feriado adicionado!');
      setForm({ data: '', descricao: '', nacional: true });
      carregar();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }

  async function excluirFeriado(id) {
    if (!window.confirm('Excluir este feriado?')) return;
    try {
      await configuracaoAPI.excluirFeriado(id);
      toast.success('Feriado removido');
      carregar();
    } catch { toast.error('Erro ao excluir'); }
  }

  return (
    <div className="card">
      {/* Formulário de novo feriado */}
      <div style={{marginBottom:'20px',padding:'16px',background:'#f8fafc',borderRadius:'8px',border:'1px solid #e8ecf0'}}>
        <h4 style={{margin:'0 0 12px',fontSize:'13px',fontWeight:600,color:'#555'}}>Adicionar feriado</h4>
        <div style={{display:'flex',gap:'12px',alignItems:'flex-end',flexWrap:'wrap'}}>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Data *</label>
            <input type="date" className="form-control" value={form.data}
              onChange={e => setForm(f => ({...f, data: e.target.value}))} />
          </div>
          <div className="form-group" style={{margin:0,flex:1,minWidth:'200px'}}>
            <label className="form-label">Descrição *</label>
            <input className="form-control" value={form.descricao}
              onChange={e => setForm(f => ({...f, descricao: e.target.value}))}
              placeholder="Ex: Natal, Corpus Christi..." />
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Tipo</label>
            <select className="form-control" value={form.nacional ? '1' : '0'}
              onChange={e => setForm(f => ({...f, nacional: e.target.value === '1'}))}>
              <option value="1">Nacional</option>
              <option value="0">Local / Estadual</option>
            </select>
          </div>
          <button className="btn btn-primary" style={{marginBottom:'1px'}}
            onClick={criarFeriado} disabled={salvando}>
            {salvando ? 'Salvando...' : '+ Adicionar'}
          </button>
        </div>
      </div>

      {/* Filtro por ano */}
      <div style={{display:'flex',gap:'12px',alignItems:'center',marginBottom:'16px'}}>
        <label className="form-label" style={{margin:0}}>Ano:</label>
        <select className="form-control" style={{width:'100px'}} value={ano}
          onChange={e => setAno(Number(e.target.value))}>
          {Array.from({length:10},(_,i) => new Date().getFullYear() - 2 + i).map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span style={{color:'#888',fontSize:'13px'}}>{feriados.length} feriado(s) em {ano}</span>
      </div>

      {carregando ? <div className="loading">Carregando...</div> : (
        <div className="tabela-wrapper">
          <table className="tabela">
            <thead>
              <tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {feriados.map(f => (
                <tr key={f.id}>
                  <td>{formatarData(f.data)}</td>
                  <td>{f.descricao}</td>
                  <td>
                    <span className={`badge ${f.nacional ? 'badge-azul' : 'badge-laranja'}`}>
                      {f.nacional ? 'Nacional' : 'Local'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-danger" style={{fontSize:'12px',padding:'4px 8px'}}
                      onClick={() => excluirFeriado(f.id)}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {feriados.length === 0 && <p className="lista-vazia">Nenhum feriado cadastrado para {ano}</p>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ABA: INTEGRAÇÕES
// ============================================================
function TabIntegracoes() {
  const [integracoes, setIntegracoes] = useState({});
  const [carregando, setCarregando]   = useState(true);
  const [salvando, setSalvando]       = useState('');

  useEffect(() => {
    configuracaoAPI.buscarIntegracoes().then(r => {
      if (r.data.ok) setIntegracoes(r.data.dados || {});
    }).finally(() => setCarregando(false));
  }, []);

  function setModulo(modulo, k, v) {
    setIntegracoes(prev => ({
      ...prev,
      [modulo]: { ...(prev[modulo] || {}), [k]: v }
    }));
  }

  async function salvarModulo(modulo) {
    setSalvando(modulo);
    try {
      await configuracaoAPI.salvarIntegracao(modulo, integracoes[modulo] || {});
      toast.success(`Configurações de ${modulo} salvas!`);
    } catch { toast.error('Erro ao salvar'); }
    finally { setSalvando(''); }
  }

  if (carregando) return <div className="card"><div className="loading">Carregando...</div></div>;

  const aasp      = integracoes.aasp      || {};
  const whatsapp  = integracoes.whatsapp  || {};
  const email     = integracoes.email     || {};

  return (
    <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>

      {/* AASP */}
      <div className="card">
        <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px'}}>
          <h3 style={{margin:0,fontSize:'15px',color:'#1e2a3a'}}>Publicações AASP</h3>
          <label style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',marginLeft:'auto'}}>
            <input type="checkbox" checked={!!aasp.ativo}
              onChange={e => setModulo('aasp','ativo', e.target.checked)} />
            <span style={{fontSize:'13px'}}>Integração ativa</span>
          </label>
        </div>
        {aasp.ativo && (
          <>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Login AASP</label>
                <input className="form-control" value={aasp.login||''}
                  onChange={e => setModulo('aasp','login', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Senha AASP</label>
                <input type="password" className="form-control" value={aasp.senha||''}
                  onChange={e => setModulo('aasp','senha', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">OABs monitoradas (até 10, separadas por vírgula)</label>
              <input className="form-control" value={aasp.oabs||''}
                onChange={e => setModulo('aasp','oabs', e.target.value)}
                placeholder="SP123456, SP789012, ..." />
            </div>
          </>
        )}
        <button className="btn btn-primary" onClick={() => salvarModulo('aasp')}
          disabled={salvando === 'aasp'}>
          {salvando === 'aasp' ? 'Salvando...' : 'Salvar configurações AASP'}
        </button>
      </div>

      {/* WhatsApp Z-API */}
      <div className="card">
        <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px'}}>
          <h3 style={{margin:0,fontSize:'15px',color:'#1e2a3a'}}>WhatsApp (Z-API)</h3>
          <label style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',marginLeft:'auto'}}>
            <input type="checkbox" checked={!!whatsapp.ativo}
              onChange={e => setModulo('whatsapp','ativo', e.target.checked)} />
            <span style={{fontSize:'13px'}}>Integração ativa</span>
          </label>
        </div>
        {whatsapp.ativo && (
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Instance ID (Z-API)</label>
              <input className="form-control" value={whatsapp.instancia||''}
                onChange={e => setModulo('whatsapp','instancia', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Token Z-API</label>
              <input type="password" className="form-control" value={whatsapp.token||''}
                onChange={e => setModulo('whatsapp','token', e.target.value)} />
            </div>
          </div>
        )}
        <button className="btn btn-primary" onClick={() => salvarModulo('whatsapp')}
          disabled={salvando === 'whatsapp'}>
          {salvando === 'whatsapp' ? 'Salvando...' : 'Salvar configurações WhatsApp'}
        </button>
      </div>

      {/* E-mail */}
      <div className="card">
        <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px'}}>
          <h3 style={{margin:0,fontSize:'15px',color:'#1e2a3a'}}>E-mail (SMTP / Office 365)</h3>
          <label style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',marginLeft:'auto'}}>
            <input type="checkbox" checked={!!email.ativo}
              onChange={e => setModulo('email','ativo', e.target.checked)} />
            <span style={{fontSize:'13px'}}>Integração ativa</span>
          </label>
        </div>
        {email.ativo && (
          <>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-control" style={{maxWidth:'200px'}} value={email.tipo||'smtp'}
                onChange={e => setModulo('email','tipo', e.target.value)}>
                <option value="smtp">SMTP genérico</option>
                <option value="office365">Office 365</option>
                <option value="gmail">Gmail (OAuth)</option>
              </select>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Servidor SMTP / Host</label>
                <input className="form-control" value={email.host||''}
                  onChange={e => setModulo('email','host', e.target.value)}
                  placeholder="smtp.seudominio.com.br" />
              </div>
              <div className="form-group">
                <label className="form-label">Porta</label>
                <input type="number" className="form-control" value={email.porta||''}
                  onChange={e => setModulo('email','porta', e.target.value)}
                  placeholder="587" />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Usuário / E-mail remetente</label>
                <input className="form-control" value={email.usuario||''}
                  onChange={e => setModulo('email','usuario', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Senha</label>
                <input type="password" className="form-control" value={email.senha||''}
                  onChange={e => setModulo('email','senha', e.target.value)} />
              </div>
            </div>
          </>
        )}
        <button className="btn btn-primary" onClick={() => salvarModulo('email')}
          disabled={salvando === 'email'}>
          {salvando === 'email' ? 'Salvando...' : 'Salvar configurações de E-mail'}
        </button>
      </div>
    </div>
  );
}
