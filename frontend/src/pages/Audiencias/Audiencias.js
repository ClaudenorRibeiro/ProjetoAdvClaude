// ============================================================
// PÁGINA DE AUDIÊNCIAS
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { audienciasAPI, processosAPI, pessoasAPI } from '../../services/api';
import { formatarData, toTitleCase } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import ModalConfirmar from '../../components/ui/ModalConfirmar';

const STATUS_COR = {
  agendada:  'badge-azul',
  realizada: 'badge-verde',
  adiada:    'badge-laranja',
  cancelada: 'badge-vermelho',
  remarcada: 'badge-cinza',
  acordo:    'badge-verde',
};

const STATUS_LABEL = {
  agendada:  'Agendada',
  realizada: 'Realizada',
  adiada:    'Adiada',
  cancelada: 'Cancelada',
  remarcada: 'Remarcada',
  acordo:    'Acordo',
};

export default function Audiencias() {
  const { temPermissao, ehAdmin }  = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [lista, setLista]          = useState([]);
  const [total, setTotal]          = useState(0);

  // Inicializa filtros a partir de query params da URL (ex: vindo do dashboard)
  const params = new URLSearchParams(location.search);
  const [filtros, setFiltros] = useState({
    status:   params.get('status')   || '',
    data_de:  params.get('data_de')  || '',
    data_ate: params.get('data_ate') || '',
    pagina: 1,
  });
  const [tipos, setTipos]          = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [modalNova, setModalNova]  = useState(false);
  const [modalEditar, setModalEditar] = useState(null); // audiência selecionada para editar
  const [modalAta, setModalAta]    = useState(null);    // audiência selecionada para registrar ata
  const [confirmarExcluir, setConfirmarExcluir] = useState(null); // audiência selecionada para excluir
  const [modalHistorico, setModalHistorico]     = useState(null); // audiência selecionada para ver histórico
  const [modalCancelar, setModalCancelar]       = useState(null); // audiência selecionada para cancelar
  const [modalRemarcar, setModalRemarcar]       = useState(null); // audiência selecionada para remarcar

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

  async function excluirAudiencia(id) {
    try {
      await audienciasAPI.excluir(id);
      toast.success('Audiência excluída com sucesso!');
      carregar();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao excluir audiência'); }
  }

  // Editar: só audiências agendadas ou adiadas; realizadas/acordo só admin
  function podeEditar(a) {
    if (['cancelada','remarcada'].includes(a.status)) return false;
    if (['realizada','acordo'].includes(a.status) && !ehAdmin) return false;
    return temPermissao('audiencias', 'alterar');
  }

  // Excluir: cancelada e remarcada nunca; realizadas/acordo só admin
  function podeExcluir(a) {
    if (['cancelada','remarcada'].includes(a.status)) return false;
    if (['realizada','acordo'].includes(a.status) && !ehAdmin) return false;
    return temPermissao('audiencias', 'excluir');
  }

  function setFiltro(k, v) { setFiltros(f => ({...f, [k]: v, pagina: 1})); }

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
              <option value="agendada">Agendada</option>
              <option value="adiada">Adiada</option>
              <option value="realizada">Realizada</option>
              <option value="acordo">Acordo</option>
              <option value="remarcada">Remarcada</option>
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
                {lista.map(a => (
                    <tr key={a.id}>
                      <td>
                        {a.processo_numero && a.pasta_id
                          ? <span
                              style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', fontSize: '13px' }}
                              onClick={() => navigate(`/processos/pasta/${a.pasta_id}`)}>
                              {a.processo_numero}
                            </span>
                          : (a.processo_numero || '—')
                        }
                      </td>
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
                        <span className={`badge ${STATUS_COR[a.status] || 'badge-cinza'}`}>
                          {STATUS_LABEL[a.status] || a.status}
                        </span>
                        {a.ata_impressa === 1 && (
                          <span className="badge badge-verde" style={{marginLeft:'4px',fontSize:'10px'}}>
                            Impressa
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                          {/* Registrar ata — só audiências agendadas ou adiadas */}
                          {(a.status === 'agendada' || a.status === 'adiada') && (
                            <button className="btn btn-primary" style={{fontSize:'11px',padding:'4px 8px'}}
                              onClick={() => setModalAta(a)}>
                              Registrar Ata
                            </button>
                          )}
                          {/* Cancelar — só agendadas/adiadas */}
                          {(a.status === 'agendada' || a.status === 'adiada') && temPermissao('audiencias','alterar') && (
                            <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px',color:'#d97706',borderColor:'#fcd34d'}}
                              onClick={() => setModalCancelar(a)}>
                              Cancelar
                            </button>
                          )}
                          {/* Remarcar — só agendadas/adiadas */}
                          {(a.status === 'agendada' || a.status === 'adiada') && temPermissao('audiencias','alterar') && (
                            <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px',color:'#7c3aed',borderColor:'#c4b5fd'}}
                              onClick={() => setModalRemarcar(a)}>
                              Remarcar
                            </button>
                          )}
                          {/* Marcar impressa — só com ata */}
                          {['realizada','adiada','acordo','cancelada'].includes(a.status) && !a.ata_impressa && (
                            <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px'}}
                              onClick={() => marcarAtaImpressa(a.id)}>
                              Marcar Impressa
                            </button>
                          )}
                          {/* Editar */}
                          {podeEditar(a) && (
                            <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px'}}
                              onClick={() => setModalEditar(a)}>
                              ✏️ Editar
                            </button>
                          )}
                          {/* Excluir */}
                          {podeExcluir(a) && (
                            <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px',color:'#dc2626',borderColor:'#fca5a5'}}
                              onClick={() => setConfirmarExcluir(a)}>
                              🗑️ Excluir
                            </button>
                          )}
                          {/* Histórico */}
                          <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px',color:'#6b7280',borderColor:'#d1d5db'}}
                            onClick={() => setModalHistorico(a)}>
                            📋 Histórico
                          </button>
                        </div>
                      </td>
                    </tr>
                ))}
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
          onTiposChange={() => audienciasAPI.tipos().then(r => { if (r.data.ok) setTipos(r.data.dados); })}
          onFechar={(reload) => { setModalNova(false); if(reload) carregar(); }} />
      )}

      {/* Modal editar audiência */}
      {modalEditar && (
        <ModalEditarAudiencia
          audiencia={modalEditar}
          tipos={tipos}
          onTiposChange={() => audienciasAPI.tipos().then(r => { if (r.data.ok) setTipos(r.data.dados); })}
          onFechar={(reload) => { setModalEditar(null); if (reload) carregar(); }}
        />
      )}

      {/* Modal registrar ata */}
      {modalAta && (
        <ModalRegistrarAta audiencia={modalAta}
          onFechar={(reload) => { setModalAta(null); if(reload) carregar(); }} />
      )}

      {/* Modal cancelar audiência */}
      {modalCancelar && (
        <ModalCancelarAudiencia
          audiencia={modalCancelar}
          onFechar={(reload) => { setModalCancelar(null); if (reload) carregar(); }}
        />
      )}

      {/* Modal remarcar audiência */}
      {modalRemarcar && (
        <ModalRemarcarAudiencia
          audiencia={modalRemarcar}
          onFechar={(reload) => { setModalRemarcar(null); if (reload) carregar(); }}
        />
      )}

      {/* Modal histórico de alterações */}
      {modalHistorico && (
        <ModalHistoricoAudiencia
          audiencia={modalHistorico}
          onFechar={() => setModalHistorico(null)}
        />
      )}

      {/* Confirmação de exclusão */}
      {confirmarExcluir && (
        <ModalConfirmar
          titulo="Excluir Audiência"
          mensagem={
            ['realizada','adiada','acordo'].includes(confirmarExcluir.status)
              ? `Esta audiência possui ata registrada (${STATUS_LABEL[confirmarExcluir.status]}).\n\nComo administrador, você pode excluí-la permanentemente. Esta ação não pode ser desfeita.`
              : `A audiência de ${formatarData(confirmarExcluir.data)} às ${confirmarExcluir.hora?.slice(0,5)} será excluída permanentemente. Esta ação não pode ser desfeita.`
          }
          textoBotao="Excluir"
          tipo="perigo"
          acao={async () => { await excluirAudiencia(confirmarExcluir.id); }}
          onCancelar={() => setConfirmarExcluir(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// Modal para CANCELAR audiência — solicita motivo obrigatório
// ============================================================
export function ModalCancelarAudiencia({ audiencia, onFechar }) {
  const [motivo, setMotivo]     = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!motivo.trim()) return toast.error('Motivo do cancelamento é obrigatório');
    setSalvando(true);
    try {
      await audienciasAPI.cancelar(audiencia.id, { motivo });
      toast.success('Audiência cancelada com sucesso!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao cancelar audiência'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Cancelar Audiência</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
            Audiência de <strong>{formatarData(audiencia.data)}</strong> às <strong>{audiencia.hora?.slice(0,5)}</strong>.
            <br/>Esta ação não pode ser desfeita — a audiência ficará no histórico como cancelada.
          </p>
          <div className="form-group">
            <label className="form-label">Motivo do cancelamento *</label>
            <textarea className="form-control" rows={3} value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Descreva o motivo do cancelamento..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Voltar</button>
          <button className="btn btn-danger" onClick={salvar} disabled={salvando}>
            {salvando ? 'Cancelando...' : 'Confirmar Cancelamento'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Modal para REMARCAR audiência — solicita motivo + nova data/hora
// Marca a original como "remarcada" e cria nova audiência
// ============================================================
export function ModalRemarcarAudiencia({ audiencia, onFechar }) {
  const [form, setForm]         = useState({ motivo: '', nova_data: '', nova_hora: audiencia.hora?.slice(0,5) || '09:00' });
  const [salvando, setSalvando] = useState(false);

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function salvar() {
    if (!form.motivo.trim())  return toast.error('Motivo é obrigatório');
    if (!form.nova_data)      return toast.error('Nova data é obrigatória');
    if (!form.nova_hora)      return toast.error('Nova hora é obrigatória');
    setSalvando(true);
    try {
      const { data } = await audienciasAPI.remarcar(audiencia.id, {
        motivo:    form.motivo,
        nova_data: form.nova_data,
        nova_hora: form.nova_hora,
      });
      toast.success('Audiência remarcada! Nova audiência criada com sucesso.');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao remarcar audiência'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Remarcar Audiência</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
            A audiência de <strong>{formatarData(audiencia.data)}</strong> às <strong>{audiencia.hora?.slice(0,5)}</strong> será
            marcada como <strong>Remarcada</strong> e uma nova audiência será criada com a data informada.
          </p>
          <div className="form-group">
            <label className="form-label">Motivo da remarcação *</label>
            <textarea className="form-control" rows={2} value={form.motivo}
              onChange={e => set('motivo', e.target.value)}
              placeholder="Ex: Pedido de adiamento pela parte contrária..." />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Nova data *</label>
              <input type="date" className="form-control" value={form.nova_data}
                onChange={e => set('nova_data', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Nova hora *</label>
              <input type="time" className="form-control" value={form.nova_hora}
                onChange={e => set('nova_hora', e.target.value)} />
            </div>
          </div>
          <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>
            Os demais dados (tipo, local, responsável) serão copiados automaticamente para a nova audiência.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Voltar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Remarcando...' : 'Confirmar Remarcação'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Modal de histórico de alterações de uma audiência
// Exibe todos os registros da tabela auditoria_audiencia
// ============================================================
export function ModalHistoricoAudiencia({ audiencia, onFechar }) {
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        const { data } = await audienciasAPI.historico(audiencia.id);
        if (data.ok) setRegistros(data.dados);
      } catch { /* silencioso */ }
      finally { setCarregando(false); }
    }
    carregar();
  }, [audiencia.id]);

  // Mapa de nomes legíveis para os campos técnicos
  const CAMPO_LABEL = {
    cadastrado:         'Cadastrado',
    criacao:            'Criação',
    tipo_audiencia_id:  'Tipo de audiência',
    data:               'Data',
    hora:               'Hora',
    modalidade:         'Modalidade',
    vara_id:            'Local (vara)',
    plataforma_virtual: 'Plataforma virtual',
    link_virtual:       'Link virtual',
    responsavel_id:     'Responsável',
    cancelada:          'Cancelamento',
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>Histórico — {audiencia.processo_numero || 'Audiência'}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {carregando ? (
            <div className="loading">Carregando...</div>
          ) : registros.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
              Nenhuma alteração registrada para esta audiência.
            </p>
          ) : (
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Data / Hora</th>
                    <th>Usuário</th>
                    <th>Campo</th>
                    <th>Valor anterior</th>
                    <th>Valor novo</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map(r => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                        {r.alterado_em
                          ? new Date(r.alterado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                          : '—'}
                      </td>
                      <td style={{ fontSize: '13px' }}>{r.usuario_nome || '—'}</td>
                      <td style={{ fontSize: '13px', fontWeight: 500 }}>
                        {CAMPO_LABEL[r.campo_alterado] || r.campo_alterado}
                      </td>
                      <td style={{ fontSize: '12px', color: '#dc2626', maxWidth: '200px', wordBreak: 'break-word' }}>
                        {r.valor_anterior || <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                      <td style={{ fontSize: '12px', color: '#16a34a', maxWidth: '200px', wordBreak: 'break-word' }}>
                        {r.valor_novo || <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Modal para criar nova audiência
// ============================================================
// MODAL CADASTRO RÁPIDO DE PESSOA — abre a partir do campo de testemunhas
// Cria registro em pessoas_fisicas com os campos principais
// Campos trabalhistas (PIS/CTPS) e filiação ficam para completar depois em Pessoas
// ============================================================
function ModalCadastroRapidoPessoa({ onFechar, onSalvo }) {
  const [form, setForm]         = useState({});
  const [salvando, setSalvando] = useState(false);
  const [auxiliares, setAux]    = useState({ generos: [], estados_civis: [], profissoes: [] });
  const [buscandoCep, setBuscandoCep] = useState(false);

  useEffect(() => {
    pessoasAPI.auxiliares().then(r => { if (r.data.ok) setAux(r.data.dados); }).catch(() => {});
  }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Busca CEP via ViaCEP e preenche endereço automaticamente
  async function buscarCep(cep) {
    const limpo = cep.replace(/\D/g, '');
    if (limpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const dados = await resp.json();
      if (!dados.erro) {
        setForm(f => ({
          ...f,
          logradouro: dados.logradouro || '',
          bairro:     dados.bairro     || '',
          cidade:     dados.localidade || '',
          estado:     dados.uf         || '',
        }));
      }
    } catch { /* silencioso */ }
    finally { setBuscandoCep(false); }
  }

  async function salvar() {
    if (!form.nome?.trim()) return toast.error('Nome é obrigatório');
    setSalvando(true);
    try {
      const { data } = await pessoasAPI.criarFisica(form);
      if (data.ok) {
        toast.success('Pessoa cadastrada com sucesso!');
        onSalvo({ id: data.dados.id, nome: form.nome, telefone: '' });
      }
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao cadastrar pessoa'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>Cadastrar Pessoa (Testemunha)</h3>
          <button className="modal-fechar" onClick={() => onFechar()}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
            Campos trabalhistas e filiação podem ser completados depois em <strong>Pessoas</strong>.
          </p>

          {/* Nome */}
          <div className="form-group">
            <label className="form-label">Nome completo *</label>
            <input className="form-control" value={form.nome || ''} onChange={e => set('nome', e.target.value)} />
          </div>

          {/* CPF + RG + Órgão + Data Nasc + Gênero */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">CPF</label>
              <input className="form-control" value={form.cpf || ''} placeholder="000.000.000-00"
                onChange={e => set('cpf', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Data de nascimento</label>
              <input type="date" className="form-control" value={form.data_nascimento || ''}
                onChange={e => set('data_nascimento', e.target.value)} />
            </div>
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">RG</label>
              <input className="form-control" value={form.rg || ''} onChange={e => set('rg', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Órgão Expedidor</label>
              <input className="form-control" value={form.rg_orgao || ''} placeholder="SSP/SP"
                onChange={e => set('rg_orgao', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Gênero</label>
              <select className="form-control" value={form.genero_id || ''} onChange={e => set('genero_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {auxiliares.generos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Estado Civil + Profissão */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Estado civil</label>
              <select className="form-control" value={form.estado_civil_id || ''} onChange={e => set('estado_civil_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {auxiliares.estados_civis.map(ec => <option key={ec.id} value={ec.id}>{ec.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Profissão</label>
              <select className="form-control" value={form.profissao_id || ''} onChange={e => set('profissao_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {auxiliares.profissoes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Endereço */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">CEP {buscandoCep && <small style={{color:'#3b82f6'}}>(buscando...)</small>}</label>
              <input className="form-control" value={form.cep || ''} placeholder="00000-000"
                onChange={e => set('cep', e.target.value)}
                onBlur={e => buscarCep(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Logradouro</label>
              <input className="form-control" value={form.logradouro || ''} onChange={e => set('logradouro', e.target.value)} />
            </div>
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Número</label>
              <input className="form-control" value={form.numero || ''} onChange={e => set('numero', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Complemento</label>
              <input className="form-control" value={form.complemento || ''} placeholder="Apto, sala..."
                onChange={e => set('complemento', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Bairro</label>
              <input className="form-control" value={form.bairro || ''} onChange={e => set('bairro', e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Cidade</label>
              <input className="form-control" value={form.cidade || ''} onChange={e => set('cidade', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <input className="form-control" value={form.estado || ''} placeholder="SP" maxLength={2}
                onChange={e => set('estado', e.target.value.toUpperCase())} />
            </div>
          </div>

          {/* Observações */}
          <div className="form-group">
            <label className="form-label">Observações</label>
            <textarea className="form-control" rows={2} value={form.observacoes || ''}
              onChange={e => set('observacoes', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar()}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Cadastrando...' : 'Cadastrar e Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SEÇÃO DE TESTEMUNHAS — reutilizada em ModalNovaAudiencia e ModalEditarAudiencia
// processoId: ID do processo para filtrar partes (autor/réu não podem ser testemunhas)
// testemunhas: [{ id, nome, telefone, polo }]
// onChange: função chamada quando a lista muda
// ============================================================
function SecaoTestemunhas({ processoId, testemunhas, onChange }) {
  const [busca, setBusca]           = useState('');
  const [sugestoes, setSugestoes]   = useState([]);
  const [partes, setPartes]         = useState([]); // IDs das partes do processo
  const [pendente, setPendente]     = useState(null); // pessoa selecionada aguardando polo
  const [modalCadastro, setModalCadastro] = useState(false);

  // Carrega partes do processo para bloquear na busca e remover da lista existente
  useEffect(() => {
    if (!processoId) { setPartes([]); return; }
    audienciasAPI.partesProcesso(processoId)
      .then(r => {
        if (r.data.ok) {
          const ids = r.data.dados.map(p => Number(p.pessoa_id));
          setPartes(ids);
          // Remove da lista qualquer testemunha que seja parte do processo
          const filtradas = testemunhas.filter(t => !ids.includes(Number(t.id)));
          if (filtradas.length !== testemunhas.length) onChange(filtradas);
        }
      })
      .catch(() => {});
  }, [processoId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function buscarPessoas(termo) {
    if (termo.length < 2) { setSugestoes([]); return; }
    try {
      const { data } = await pessoasAPI.listarFisicas({ busca: termo, limite: 15 });
      if (data.ok) {
        const idsJaAdicionados = testemunhas.map(t => t.id);
        // Filtra: remove partes do processo e já adicionadas
        setSugestoes(
          (data.dados.registros || []).filter(p =>
            !partes.includes(Number(p.id)) && !idsJaAdicionados.includes(p.id)
          )
        );
      }
    } catch { /* silencioso */ }
  }

  function selecionarPessoa(p) {
    setSugestoes([]);
    setBusca('');
    // Abre mini-seletor de polo antes de adicionar
    setPendente({ id: p.id, nome: p.nome, telefone: p.telefone || '' });
  }

  function confirmarPolo(polo) {
    onChange([...testemunhas, { ...pendente, polo }]);
    setPendente(null);
  }

  function alterarPolo(id, novoPolo) {
    onChange(testemunhas.map(t => t.id === id ? { ...t, polo: novoPolo } : t));
  }

  function remover(id) {
    onChange(testemunhas.filter(t => t.id !== id));
  }

  return (
    <div className="form-group">
      <label className="form-label">Testemunhas</label>

      {/* Busca + botão cadastrar nova pessoa */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input className="form-control"
            placeholder="Buscar pessoa cadastrada para adicionar como testemunha..."
            value={busca}
            onChange={e => { setBusca(e.target.value); buscarPessoas(e.target.value); }} />
          {sugestoes.length > 0 && (
            <div style={{ position:'absolute', zIndex:100, width:'100%', border:'1px solid #ddd', borderRadius:'6px', marginTop:'2px', maxHeight:'150px', overflowY:'auto', background:'#fff', boxShadow:'0 4px 12px rgba(0,0,0,0.1)' }}>
              {sugestoes.map(p => (
                <div key={p.id}
                  style={{ padding:'8px 12px', cursor:'pointer', fontSize:'13px', borderBottom:'1px solid #f0f0f0' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  onClick={() => selecionarPessoa(p)}>
                  {p.nome}{p.cpf ? ` — CPF ${p.cpf}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Botão para cadastrar nova pessoa que ainda não está no sistema */}
        <button type="button" title="Cadastrar nova pessoa"
          style={{ padding:'0 12px', border:'1px solid #ddd', borderRadius:'6px', background:'#f8fafc', cursor:'pointer', fontSize:'16px', whiteSpace:'nowrap' }}
          onClick={() => setModalCadastro(true)}>…</button>
      </div>

      {/* Mini-seletor de polo — aparece após selecionar uma pessoa */}
      {pendente && (
        <div style={{ margin:'8px 0', padding:'12px', background:'#f0f7ff', borderRadius:'6px', border:'1px solid #bfdbfe' }}>
          <div style={{ fontSize:'13px', fontWeight:600, marginBottom:'8px' }}>
            {pendente.nome} — Selecione o polo desta testemunha:
          </div>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => confirmarPolo('autor')}>
              👤 Testem. Autor
            </button>
            <button type="button" className="btn btn-sm"
              style={{ background:'#7c3aed', color:'#fff', border:'none', borderRadius:'5px', padding:'4px 10px', cursor:'pointer', fontSize:'12px' }}
              onClick={() => confirmarPolo('reu')}>
              👤 Testem. Réu
            </button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setPendente(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de testemunhas adicionadas */}
      {testemunhas.length > 0 && (
        <div style={{ marginTop:'8px', border:'1px solid #e2e8f0', borderRadius:'6px', overflow:'hidden' }}>
          {testemunhas.map(t => (
            <div key={t.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 12px', borderBottom:'1px solid #f0f0f0', fontSize:'13px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <span>{t.nome}</span>
                <span className={`badge ${t.polo === 'autor' ? 'badge-azul' : 'badge-roxo'}`}
                  style={t.polo !== 'autor' ? { background:'#7c3aed', color:'#fff' } : {}}>
                  {t.polo === 'autor' ? 'Testem. Autor' : 'Testem. Réu'}
                </span>
              </div>
              <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                {/* Troca de polo com um clique */}
                <button type="button"
                  title={`Trocar para Testem. ${t.polo === 'autor' ? 'Réu' : 'Autor'}`}
                  style={{ background:'none', border:'1px solid #d1d5db', borderRadius:'4px', cursor:'pointer', fontSize:'11px', padding:'2px 6px', color:'#374151' }}
                  onClick={() => alterarPolo(t.id, t.polo === 'autor' ? 'reu' : 'autor')}>
                  ⇄ Trocar polo
                </button>
                <button type="button" onClick={() => remover(t.id)}
                  style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'16px', lineHeight:1 }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de cadastro rápido de nova pessoa */}
      {modalCadastro && (
        <ModalCadastroRapidoPessoa
          onFechar={() => setModalCadastro(false)}
          onSalvo={(novaPessoa) => { setModalCadastro(false); selecionarPessoa(novaPessoa); }}
        />
      )}
    </div>
  );
}

export function ModalNovaAudiencia({ tipos, onTiposChange, onFechar, processoInicial }) {
  const { temPermissao } = useAuth();
  const [form, setForm]                     = useState({
    modalidade: 'presencial', hora: '09:00',
    ...(processoInicial ? { processo_id: processoInicial.id } : {})
  });
  const [salvando, setSalvando]             = useState(false);
  // Avisos inline nos campos (aparecem no onBlur)
  const [avisos, setAvisos]                 = useState({ data: '', hora: '' });
  // Modal de confirmação para dados incomuns
  const [confirmar, setConfirmar]           = useState(null);
  // Busca processo — pré-preenchida quando processoInicial é passado
  const [buscaProc, setBuscaProc]           = useState(
    processoInicial ? `${processoInicial.numProc || '(sem nº)'} — ${processoInicial.NomeTituloProc || ''}` : ''
  );
  const [sugestoes, setSugestoes]           = useState([]);
  const [procSelecionado, setProcSelecionado] = useState(processoInicial || null);
  // Advogados (usuários tipo advogado + freelas) para o responsável
  const [advogados, setAdvogados]           = useState([]);
  // Testemunhas — [{id, nome, telefone, polo}]
  const [testemunhas, setTestemunhas]       = useState([]);
  // Local — vara selecionada
  const [varas, setVaras]                   = useState([]);
  const [foruns, setForuns]                 = useState([]);
  const [varaId, setVaraId]                 = useState(null);
  // Modais internos
  const [modalTipos, setModalTipos]         = useState(false);
  const [modalNovoFreela, setModalNovoFreela] = useState(false);

  useEffect(() => { carregarAdvogados(); carregarVaras(); }, []);

  async function carregarAdvogados() {
    const { data } = await audienciasAPI.advogados();
    if (data.ok) setAdvogados(data.dados);
  }

  async function carregarVaras() {
    try {
      const { data } = await processosAPI.auxiliares();
      if (data.ok) {
        setVaras(data.dados.varas || []);
        setForuns(data.dados.foruns || []);
      }
    } catch { /* silencioso — varas são opcionais */ }
  }

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  // Busca processos por CNJ
  async function buscarProcessos(termo) {
    if (termo.length < 2) { setSugestoes([]); return; }
    const { data } = await processosAPI.buscarPorNumero(termo);
    if (data.ok) setSugestoes(data.dados);
  }
  function selecionarProcesso(proc) {
    setBuscaProc(`${proc.numProc || '(sem nº)'} — ${proc.NomeTituloProc || ''}`);
    setSugestoes([]);
    setProcSelecionado(proc);
    set('processo_id', proc.id);
  }

  // Valida data no blur — exibe aviso inline abaixo do campo
  function validarDataBlur() {
    if (!form.data) { setAvisos(a => ({ ...a, data: '' })); return; }
    const hoje = new Date().toISOString().split('T')[0];
    if (form.data < hoje) {
      setAvisos(a => ({ ...a, data: `Data anterior a hoje (${form.data.split('-').reverse().join('/')})` }));
    } else {
      setAvisos(a => ({ ...a, data: '' }));
    }
  }

  // Valida hora no blur — exibe aviso inline abaixo do campo
  function validarHoraBlur() {
    if (!form.hora) { setAvisos(a => ({ ...a, hora: '' })); return; }
    const h = parseInt(form.hora.split(':')[0], 10);
    if (h < 8 || h >= 18) {
      setAvisos(a => ({ ...a, hora: `Horário incomum (${form.hora}) — fóruns geralmente atendem das 08h às 18h` }));
    } else {
      setAvisos(a => ({ ...a, hora: '' }));
    }
  }

  // Executa o salvamento efetivo (chamado direto ou após confirmação do usuário)
  async function executarSalvar(obs) {
    setSalvando(true);
    try {
      await audienciasAPI.criar({
        ...form,
        vara_id: varaId || null,
        testemunhas: testemunhas.map(t => ({ pessoa_id: t.id, polo: t.polo })),
        obs_auditoria: obs.length ? obs.join('; ') : undefined
      });
      toast.success('Audiência criada com sucesso!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao criar audiência'); }
    finally { setSalvando(false); }
  }

  async function salvar() {
    if (!form.processo_id) return toast.error('Processo é obrigatório');
    if (!form.data)        return toast.error('Data é obrigatória');
    if (!form.hora)        return toast.error('Hora é obrigatória');

    const hoje = new Date().toISOString().split('T')[0];
    const h    = parseInt(form.hora.split(':')[0], 10);

    // Coleta todos os alertas presentes
    const alertas = [];
    const obs     = [];

    if (form.data < hoje) {
      const dataFmt = form.data.split('-').reverse().join('/');
      alertas.push(`• Data retroativa: ${dataFmt}`);
      obs.push(`data retroativa confirmada pelo usuário (${dataFmt})`);
    }
    if (h < 8 || h >= 18) {
      alertas.push(`• Horário incomum: ${form.hora} (fóruns geralmente atendem das 08h às 18h)`);
      obs.push(`horário incomum confirmado pelo usuário (${form.hora})`);
    }

    // Se houver alertas, exibe ModalConfirmar (estilizado do sistema) antes de salvar
    if (alertas.length > 0) {
      setConfirmar({
        titulo:     'Atenção — dados incomuns',
        mensagem:   `Foram identificados os seguintes alertas:\n\n${alertas.join('\n')}\n\nDeseja confirmar mesmo assim ou voltar para corrigir?`,
        textoBotao: 'Confirmar mesmo assim',
        tipo:       'aviso',
        acao:       async () => { await executarSalvar(obs); }
      });
      return;
    }

    // Sem alertas: salva direto
    await executarSalvar([]);
  }

  const podeTipos = temPermissao('audiencias', 'tipos', 'cadastrar') || temPermissao('audiencias', 'tipos', 'alterar');

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>Nova Audiência</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">

          {/* Informativo da pasta */}
          {procSelecionado && (
            <div style={{marginBottom:'10px',fontSize:'13px',color:'#475569',fontWeight:500}}>
              Pasta: {String(procSelecionado.numPasta).padStart(4, '0')}
            </div>
          )}

          {/* Busca de processo — somente leitura quando processo vem pré-selecionado da pasta */}
          <div className="form-group" style={{position:'relative'}}>
            <label className="form-label">Processo *</label>
            <input className="form-control" placeholder="Digite o número CNJ ou parte do título..."
              value={buscaProc}
              readOnly={!!processoInicial}
              style={processoInicial ? { background: '#f1f5f9', cursor: 'not-allowed' } : {}}
              onChange={e => { if (processoInicial) return; setBuscaProc(e.target.value); setProcSelecionado(null); set('processo_id', null); buscarProcessos(e.target.value); }} />
            {sugestoes.length > 0 && (
              <div style={{position:'absolute',zIndex:100,width:'100%',border:'1px solid #ddd',borderRadius:'6px',marginTop:'2px',maxHeight:'180px',overflowY:'auto',background:'#fff',boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}}>
                {sugestoes.map(p => (
                  <div key={p.id} style={{padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid #f0f0f0',fontSize:'13px'}}
                    onMouseEnter={e => e.currentTarget.style.background='#f0f7ff'}
                    onMouseLeave={e => e.currentTarget.style.background='#fff'}
                    onClick={() => selecionarProcesso(p)}>
                    <strong>{p.numProc || '(sem nº)'}</strong> — {p.NomeTituloProc}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tipo + Data + Hora */}
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Tipo de audiência</label>
              <div style={{display:'flex',gap:'6px'}}>
                <select className="form-control" value={form.tipo_audiencia_id||''}
                  onChange={e => set('tipo_audiencia_id', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
                {podeTipos && (
                  <button type="button" title="Gerenciar tipos"
                    style={{padding:'0 10px',border:'1px solid #ddd',borderRadius:'6px',background:'#f8fafc',cursor:'pointer',fontSize:'16px',whiteSpace:'nowrap'}}
                    onClick={() => setModalTipos(true)}>…</button>
                )}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Data *</label>
              <input type="date" className="form-control" value={form.data||''}
                onChange={e => { set('data', e.target.value); setAvisos(a => ({ ...a, data: '' })); }}
                onBlur={validarDataBlur} />
              {avisos.data && (
                <small style={{ color: '#d97706', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  ⚠️ {avisos.data}
                </small>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Hora *</label>
              <input type="time" className="form-control" value={form.hora}
                onChange={e => { set('hora', e.target.value); setAvisos(a => ({ ...a, hora: '' })); }}
                onBlur={validarHoraBlur} />
              {avisos.hora && (
                <small style={{ color: '#d97706', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  ⚠️ {avisos.hora}
                </small>
              )}
            </div>
          </div>

          {/* Modalidade + Responsável */}
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
              <label className="form-label">Responsável pela condução</label>
              <div style={{display:'flex',gap:'6px'}}>
                <select className="form-control" value={form.responsavel_id||''}
                  onChange={e => set('responsavel_id', e.target.value)}>
                  <option value="">Escritório (sem advogado definido)</option>
                  {advogados.filter(a => a.origem === 'usuario').length > 0 && (
                    <optgroup label="Advogados do escritório">
                      {advogados.filter(a => a.origem === 'usuario').map(a =>
                        <option key={`u-${a.id}`} value={`usuario:${a.id}`}>{a.nome}</option>
                      )}
                    </optgroup>
                  )}
                  {advogados.filter(a => a.origem === 'freela').length > 0 && (
                    <optgroup label="Freelancers">
                      {advogados.filter(a => a.origem === 'freela').map(a =>
                        <option key={`f-${a.id}`} value={`freela:${a.id}`}>{a.nome}</option>
                      )}
                    </optgroup>
                  )}
                </select>
                <button type="button" title="Cadastrar novo freelancer"
                  style={{padding:'0 10px',border:'1px solid #ddd',borderRadius:'6px',background:'#f8fafc',cursor:'pointer',fontSize:'16px',whiteSpace:'nowrap'}}
                  onClick={() => setModalNovoFreela(true)}>…</button>
              </div>
            </div>
          </div>

          {/* Local — vara responsável (presencial e virtual) */}
          <CampoLocalVara
            varas={varas}
            foruns={foruns}
            varaId={varaId}
            onChange={setVaraId}
            onRecarregarVaras={carregarVaras}
          />

          {/* Plataforma e Link — somente para audiências virtuais */}
          {form.modalidade === 'virtual' && (
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

          {/* Testemunhas — componente reutilizável com polo e cadastro rápido */}
          <SecaoTestemunhas
            processoId={form.processo_id}
            testemunhas={testemunhas}
            onChange={setTestemunhas}
          />

        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Criar Audiência'}
          </button>
        </div>
      </div>

      {/* Modal de gerenciamento de tipos — abre por cima */}
      {modalTipos && (
        <ModalGerenciarTipos
          onFechar={() => setModalTipos(false)}
          onAtualizar={onTiposChange}
        />
      )}

      {/* Modal cadastro rápido de freelancer */}
      {modalNovoFreela && (
        <ModalNovoFreela
          onFechar={() => setModalNovoFreela(false)}
          onSalvo={async (novoId) => {
            await carregarAdvogados();
            set('responsavel_id', `freela:${novoId}`);
            setModalNovoFreela(false);
          }}
        />
      )}

      {/* Modal de confirmação para dados incomuns (data retroativa / hora fora do expediente) */}
      {confirmar && (
        <ModalConfirmar
          {...confirmar}
          onCancelar={() => setConfirmar(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// Modal para EDITAR audiência existente
// Processo é somente leitura — para trocar processo: excluir + criar nova
// Mesmas validações de blur (data retroativa / hora incomum) do modal de criação
// ============================================================
export function ModalEditarAudiencia({ audiencia, tipos, onTiposChange, onFechar }) {
  const { temPermissao, ehAdmin }             = useAuth();
  const [form, setForm]                       = useState({ modalidade: 'presencial' });
  const [carregando, setCarregando]           = useState(true);
  const [salvando, setSalvando]               = useState(false);
  const [avisos, setAvisos]                   = useState({ data: '', hora: '' });
  const [confirmar, setConfirmar]             = useState(null);
  // Advogados (usuários + freelas)
  const [advogados, setAdvogados]             = useState([]);
  // Testemunhas — formato {id, nome, polo, telefone}
  const [testemunhas, setTestemunhas]         = useState([]);
  // Local — vara selecionada
  const [varas, setVaras]                     = useState([]);
  const [foruns, setForuns]                   = useState([]);
  const [varaId, setVaraId]                   = useState(null);
  // Modais internos
  const [modalTipos, setModalTipos]           = useState(false);
  const [modalNovoFreela, setModalNovoFreela] = useState(false);

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    setCarregando(true);
    try {
      const [rAdv, rAud, rAux] = await Promise.all([
        audienciasAPI.advogados(),
        audienciasAPI.buscar(audiencia.id),
        processosAPI.auxiliares(),
      ]);
      if (rAdv.data.ok) setAdvogados(rAdv.data.dados);
      if (rAux.data.ok) {
        setVaras(rAux.data.dados.varas || []);
        setForuns(rAux.data.dados.foruns || []);
      }

      if (rAud.data.ok) {
        const d = rAud.data.dados;
        // Monta o valor do responsável no formato "tipo:id"
        let responsavel_id = '';
        if (d.responsavel_id)       responsavel_id = `usuario:${d.responsavel_id}`;
        if (d.responsavel_freela_id) responsavel_id = `freela:${d.responsavel_freela_id}`;

        setForm({
          tipo_audiencia_id:   d.tipo_audiencia_id  || '',
          data:                d.data?.split('T')[0] || '',
          hora:                d.hora?.slice(0,5)    || '',
          modalidade:          d.modalidade          || 'presencial',
          plataforma_virtual:  d.plataforma_virtual  || '',
          link_virtual:        d.link_virtual         || '',
          responsavel_id,
        });

        // Pré-popula a vara selecionada
        if (d.vara_id) setVaraId(d.vara_id);

        // Pré-carrega testemunhas no formato esperado pelo SecaoTestemunhas
        if (d.testemunhas?.length) {
          setTestemunhas(d.testemunhas.map(t => ({
            id:       t.pessoa_id,
            nome:     t.nome,
            polo:     t.polo || 'autor',
            telefone: t.telefone_principal || '',
          })));
        }
      }
    } catch { toast.error('Erro ao carregar dados da audiência'); }
    finally { setCarregando(false); }
  }

  async function recarregarVaras() {
    try {
      const { data } = await processosAPI.auxiliares();
      if (data.ok) {
        setVaras(data.dados.varas || []);
        setForuns(data.dados.foruns || []);
      }
    } catch { /* silencioso */ }
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // ---- Validações de blur (iguais ao modal de criação) ----
  function validarDataBlur() {
    if (!form.data) { setAvisos(a => ({ ...a, data: '' })); return; }
    const hoje = new Date().toISOString().split('T')[0];
    if (form.data < hoje) {
      setAvisos(a => ({ ...a, data: `Data anterior a hoje (${form.data.split('-').reverse().join('/')})` }));
    } else {
      setAvisos(a => ({ ...a, data: '' }));
    }
  }

  function validarHoraBlur() {
    if (!form.hora) { setAvisos(a => ({ ...a, hora: '' })); return; }
    const h = parseInt(form.hora.split(':')[0], 10);
    if (h < 8 || h >= 18) {
      setAvisos(a => ({ ...a, hora: `Horário incomum (${form.hora}) — fóruns geralmente atendem das 08h às 18h` }));
    } else {
      setAvisos(a => ({ ...a, hora: '' }));
    }
  }

  // ---- Salvamento ----
  async function executarSalvar(obs) {
    setSalvando(true);
    try {
      await audienciasAPI.atualizar(audiencia.id, {
        ...form,
        vara_id: varaId || null,
        testemunhas: testemunhas.map(t => ({ pessoa_id: t.id, polo: t.polo || 'autor' })),
        obs_auditoria: obs.length ? obs.join('; ') : undefined,
      });
      toast.success('Audiência atualizada com sucesso!');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao atualizar audiência'); }
    finally { setSalvando(false); }
  }

  async function salvar() {
    if (!form.data) return toast.error('Data é obrigatória');
    if (!form.hora) return toast.error('Hora é obrigatória');

    const hoje = new Date().toISOString().split('T')[0];
    const h    = parseInt(form.hora.split(':')[0], 10);

    const alertas = [];
    const obs     = [];

    if (form.data < hoje) {
      const dataFmt = form.data.split('-').reverse().join('/');
      alertas.push(`• Data retroativa: ${dataFmt}`);
      obs.push(`data retroativa confirmada pelo usuário na edição (${dataFmt})`);
    }
    if (h < 8 || h >= 18) {
      alertas.push(`• Horário incomum: ${form.hora} (fóruns geralmente atendem das 08h às 18h)`);
      obs.push(`horário incomum confirmado pelo usuário na edição (${form.hora})`);
    }

    if (alertas.length > 0) {
      setConfirmar({
        titulo:     'Atenção — dados incomuns',
        mensagem:   `Foram identificados os seguintes alertas:\n\n${alertas.join('\n')}\n\nDeseja confirmar mesmo assim ou voltar para corrigir?`,
        textoBotao: 'Confirmar mesmo assim',
        tipo:       'aviso',
        acao:       async () => { await executarSalvar(obs); },
      });
      return;
    }

    await executarSalvar([]);
  }

  const podeTipos = temPermissao('audiencias', 'tipos', 'cadastrar') || temPermissao('audiencias', 'tipos', 'alterar');

  if (carregando) {
    return (
      <div className="modal-overlay">
        <div className="modal-box modal-grande">
          <div className="modal-body" style={{ textAlign: 'center', padding: '40px' }}>
            Carregando dados...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>Editar Audiência</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">

          {/* Aviso se audiência tem ata e é admin editando */}
          {audiencia.ata_resultado && ehAdmin && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#92400e' }}>
              ⚠️ Esta audiência possui ata registrada. Alterações são permitidas apenas para administradores e ficam registradas no histórico.
            </div>
          )}

          {/* Processo — somente leitura */}
          <div className="form-group">
            <label className="form-label">Processo</label>
            <div style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', color: '#475569' }}>
              {audiencia.processo_numero || '(sem número)'} — {audiencia.pasta_titulo || ''}
            </div>
            <small style={{ color: '#94a3b8', fontSize: '12px' }}>
              Para alterar o processo, exclua esta audiência e crie uma nova.
            </small>
          </div>

          {/* Tipo + Data + Hora */}
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Tipo de audiência</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <select className="form-control" value={form.tipo_audiencia_id || ''}
                  onChange={e => set('tipo_audiencia_id', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
                {podeTipos && (
                  <button type="button" title="Gerenciar tipos"
                    style={{ padding: '0 10px', border: '1px solid #ddd', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer', fontSize: '16px', whiteSpace: 'nowrap' }}
                    onClick={() => setModalTipos(true)}>…</button>
                )}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Data *</label>
              <input type="date" className="form-control" value={form.data || ''}
                onChange={e => { set('data', e.target.value); setAvisos(a => ({ ...a, data: '' })); }}
                onBlur={validarDataBlur} />
              {avisos.data && (
                <small style={{ color: '#d97706', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  ⚠️ {avisos.data}
                </small>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Hora *</label>
              <input type="time" className="form-control" value={form.hora || ''}
                onChange={e => { set('hora', e.target.value); setAvisos(a => ({ ...a, hora: '' })); }}
                onBlur={validarHoraBlur} />
              {avisos.hora && (
                <small style={{ color: '#d97706', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  ⚠️ {avisos.hora}
                </small>
              )}
            </div>
          </div>

          {/* Modalidade + Responsável */}
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
              <label className="form-label">Responsável pela condução</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <select className="form-control" value={form.responsavel_id || ''}
                  onChange={e => set('responsavel_id', e.target.value)}>
                  <option value="">Escritório (sem advogado definido)</option>
                  {advogados.filter(a => a.origem === 'usuario').length > 0 && (
                    <optgroup label="Advogados do escritório">
                      {advogados.filter(a => a.origem === 'usuario').map(a =>
                        <option key={`u-${a.id}`} value={`usuario:${a.id}`}>{a.nome}</option>
                      )}
                    </optgroup>
                  )}
                  {advogados.filter(a => a.origem === 'freela').length > 0 && (
                    <optgroup label="Freelancers">
                      {advogados.filter(a => a.origem === 'freela').map(a =>
                        <option key={`f-${a.id}`} value={`freela:${a.id}`}>{a.nome}</option>
                      )}
                    </optgroup>
                  )}
                </select>
                <button type="button" title="Cadastrar novo freelancer"
                  style={{ padding: '0 10px', border: '1px solid #ddd', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer', fontSize: '16px', whiteSpace: 'nowrap' }}
                  onClick={() => setModalNovoFreela(true)}>…</button>
              </div>
            </div>
          </div>

          {/* Local — vara responsável (presencial e virtual) */}
          <CampoLocalVara
            varas={varas}
            foruns={foruns}
            varaId={varaId}
            onChange={setVaraId}
            onRecarregarVaras={recarregarVaras}
          />

          {/* Plataforma e Link — somente para audiências virtuais */}
          {form.modalidade === 'virtual' && (
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Plataforma</label>
                <input className="form-control" value={form.plataforma_virtual || ''}
                  onChange={e => set('plataforma_virtual', e.target.value)}
                  placeholder="Zoom, Teams, Meet..." />
              </div>
              <div className="form-group">
                <label className="form-label">Link</label>
                <input className="form-control" value={form.link_virtual || ''}
                  onChange={e => set('link_virtual', e.target.value)}
                  placeholder="https://..." />
              </div>
            </div>
          )}

          {/* Testemunhas — componente reutilizável com polo e cadastro rápido */}
          <SecaoTestemunhas
            processoId={audiencia.processo_id}
            testemunhas={testemunhas}
            onChange={setTestemunhas}
          />

        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {/* Modais internos */}
      {modalTipos && (
        <ModalGerenciarTipos
          onFechar={() => setModalTipos(false)}
          onAtualizar={onTiposChange}
        />
      )}
      {modalNovoFreela && (
        <ModalNovoFreela
          onFechar={() => setModalNovoFreela(false)}
          onSalvo={async (novoId) => {
            const { data } = await audienciasAPI.advogados();
            if (data.ok) setAdvogados(data.dados);
            set('responsavel_id', `freela:${novoId}`);
            setModalNovoFreela(false);
          }}
        />
      )}
      {confirmar && (
        <ModalConfirmar
          {...confirmar}
          onCancelar={() => setConfirmar(null)}
        />
      )}
    </div>
  );
}

// Modal para cadastrar freelancer rapidamente
function ModalNovoFreela({ onFechar, onSalvo }) {
  const [form, setForm]         = useState({ nome: '', oab: '', telefone: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' });
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep]   = useState('');

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  // Máscara de telefone (99) 99999-9999
  function mascaraTel(v) {
    const d = v.replace(/\D/g,'').slice(0,11);
    if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3').replace(/-$/,'');
    return d.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3').replace(/-$/,'');
  }

  // Máscara CEP e busca ViaCEP
  function mascaraCEP(v) {
    const d = v.replace(/\D/g,'').slice(0,8);
    return d.replace(/(\d{5})(\d)/,'$1-$2');
  }
  async function buscarCep(cep) {
    const limpo = cep.replace(/\D/g,'');
    if (limpo.length < 8) { setErroCep('CEP incompleto'); return; }
    setBuscandoCep(true); setErroCep('');
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const dados = await resp.json();
      if (dados.erro) { setErroCep('CEP não encontrado'); return; }
      setForm(f => ({...f, logradouro: dados.logradouro||'', bairro: dados.bairro||'', cidade: dados.localidade||'', estado: dados.uf||'' }));
    } catch { setErroCep('Erro ao consultar CEP'); }
    finally { setBuscandoCep(false); }
  }

  async function salvar() {
    if (!form.nome.trim()) return toast.error('Nome é obrigatório');
    setSalvando(true);
    try {
      const { data } = await audienciasAPI.criarFreela(form);
      toast.success('Freelancer cadastrado');
      onSalvo(data.dados.id);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao cadastrar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" style={{zIndex:200}}>
      <div className="modal-box" style={{maxWidth:'500px'}}>
        <div className="modal-header">
          <h3>Novo Advogado Freelancer</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Nome *</label>
            <input className="form-control" value={form.nome}
              onChange={e => set('nome', e.target.value)} />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">OAB</label>
              <input className="form-control" placeholder="Ex: SP 123456"
                value={form.oab} onChange={e => set('oab', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefone</label>
              <input className="form-control" placeholder="(00) 00000-0000"
                value={form.telefone}
                onChange={e => set('telefone', mascaraTel(e.target.value))} />
            </div>
          </div>

          {/* Endereço com CEP + busca automática */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">CEP</label>
              <input className="form-control" placeholder="00000-000" maxLength={9}
                value={form.cep}
                onChange={e => { setErroCep(''); set('cep', mascaraCEP(e.target.value)); }}
                onBlur={e => buscarCep(e.target.value)} />
              {buscandoCep && <small style={{color:'#888',fontSize:'12px'}}>🔍 Buscando...</small>}
              {erroCep     && <small style={{color:'#e74c3c',fontSize:'12px'}}>⚠️ {erroCep}</small>}
            </div>
            <div className="form-group">
              <label className="form-label">Logradouro</label>
              <input className="form-control" value={form.logradouro}
                onChange={e => set('logradouro', e.target.value)} />
            </div>
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Número</label>
              <input className="form-control" value={form.numero}
                onChange={e => set('numero', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Complemento</label>
              <input className="form-control" value={form.complemento}
                onChange={e => set('complemento', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Bairro</label>
              <input className="form-control" value={form.bairro}
                onChange={e => set('bairro', e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Cidade</label>
              <input className="form-control" value={form.cidade}
                onChange={e => set('cidade', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <input className="form-control" maxLength={2} value={form.estado}
                onChange={e => set('estado', e.target.value.toUpperCase())} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal para gerenciar tipos de audiência
function ModalGerenciarTipos({ onFechar, onAtualizar }) {
  const [tipos, setTipos]         = useState([]);
  const [novoNome, setNovoNome]   = useState('');
  const [editando, setEditando]   = useState(null); // { id, nome }
  const [salvando, setSalvando]   = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    const { data } = await audienciasAPI.tipos();
    if (data.ok) setTipos(data.dados);
  }

  async function adicionar() {
    if (!novoNome.trim()) return toast.error('Digite o nome do tipo');
    setSalvando(true);
    try {
      await audienciasAPI.criarTipo({ nome: novoNome.trim() });
      setNovoNome('');
      await carregar();
      onAtualizar && onAtualizar();
      toast.success('Tipo adicionado');
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao adicionar'); }
    finally { setSalvando(false); }
  }

  async function salvarEdicao() {
    if (!editando?.nome.trim()) return toast.error('Nome não pode ser vazio');
    setSalvando(true);
    try {
      await audienciasAPI.atualizarTipo(editando.id, { nome: editando.nome.trim() });
      setEditando(null);
      await carregar();
      onAtualizar && onAtualizar();
      toast.success('Tipo atualizado');
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao atualizar'); }
    finally { setSalvando(false); }
  }

  async function excluir(id) {
    setSalvando(true);
    try {
      await audienciasAPI.excluirTipo(id);
      await carregar();
      onAtualizar && onAtualizar();
      toast.success('Tipo removido');
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Tipo em uso — não pode ser removido'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" style={{zIndex:200}}>
      <div className="modal-box" style={{maxWidth:'420px'}}>
        <div className="modal-header">
          <h3>Tipos de Audiência</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {/* Adicionar novo tipo */}
          <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
            <input className="form-control" placeholder="Novo tipo..."
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && adicionar()} />
            <button className="btn btn-primary" onClick={adicionar} disabled={salvando}
              style={{whiteSpace:'nowrap'}}>+ Adicionar</button>
          </div>

          {/* Lista de tipos */}
          {tipos.length === 0
            ? <p className="lista-vazia">Nenhum tipo cadastrado</p>
            : tipos.map(t => (
              <div key={t.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'7px 0',borderBottom:'1px solid #f0f0f0'}}>
                {editando?.id === t.id ? (
                  <>
                    <input className="form-control" value={editando.nome}
                      onChange={e => setEditando(ed => ({...ed, nome: e.target.value}))}
                      onKeyDown={e => e.key === 'Enter' && salvarEdicao()}
                      autoFocus style={{flex:1}} />
                    <button className="btn btn-primary" onClick={salvarEdicao} disabled={salvando}
                      style={{padding:'4px 10px',fontSize:'12px'}}>✓</button>
                    <button className="btn btn-secondary" onClick={() => setEditando(null)}
                      style={{padding:'4px 10px',fontSize:'12px'}}>✕</button>
                  </>
                ) : (
                  <>
                    <span style={{flex:1,fontSize:'14px'}}>{t.nome}</span>
                    <button onClick={() => setEditando({ id: t.id, nome: t.nome })}
                      style={{background:'none',border:'none',cursor:'pointer',fontSize:'15px',color:'#3b82f6'}}
                      title="Editar">✏️</button>
                    <button onClick={() => excluir(t.id)} disabled={salvando}
                      style={{background:'none',border:'none',cursor:'pointer',fontSize:'15px',color:'#ef4444'}}
                      title="Remover">🗑️</button>
                  </>
                )}
              </div>
            ))
          }
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Modal para registrar ata da audiência
export function ModalRegistrarAta({ audiencia, onFechar }) {
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

// ============================================================
// Campo de busca de vara para o Local da audiência
// Usado nos modais Nova e Editar — busca por nome, abrev, fórum, cidade
// ============================================================
function CampoLocalVara({ varas, foruns, varaId, onChange, onRecarregarVaras }) {
  const [busca, setBusca]       = useState('');
  const [aberto, setAberto]     = useState(false);
  const [modalNova, setModalNova] = useState(false);

  const varaSelecionada = varas.find(v => v.id === varaId) || null;

  const varasFiltradas = busca.length >= 1
    ? varas.filter(v =>
        v.nome?.toLowerCase().includes(busca.toLowerCase()) ||
        v.abrev_nome?.toLowerCase().includes(busca.toLowerCase()) ||
        v.forum_nome?.toLowerCase().includes(busca.toLowerCase()) ||
        v.forum_cidade?.toLowerCase().includes(busca.toLowerCase())
      ).sort((a, b) => {
        const aa = (a.abrev_nome || a.nome || '').toLowerCase();
        const bb = (b.abrev_nome || b.nome || '').toLowerCase();
        return aa.localeCompare(bb, 'pt-BR', { numeric: true });
      }).slice(0, 20)
    : [];

  function montarEndereco(v) {
    if (!v) return '';
    const linha1 = [v.forum_logradouro, v.forum_num_end, v.compl_end]
      .filter(Boolean).join(', ');
    const linha2 = [v.forum_bairro, v.forum_cidade, v.forum_uf]
      .filter(Boolean).join(v.forum_cidade && v.forum_uf ? ' — ' : ', ');
    const cep = v.forum_cep ? `CEP ${v.forum_cep}` : '';
    return [linha1, linha2, cep].filter(Boolean).join(' · ');
  }

  const endereco = montarEndereco(varaSelecionada);

  return (
    <div className="form-group">
      <label className="form-label">Local da audiência</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          {varaSelecionada ? (
            /* Vara selecionada — exibe chip com botão × para limpar */
            <div style={{ display: 'flex', alignItems: 'center', padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', minHeight: 38 }}>
              <span style={{ flex: 1, fontSize: 14 }}>
                <strong>{varaSelecionada.abrev_nome || varaSelecionada.nome}</strong>
                {' — '}{varaSelecionada.forum_nome}
              </span>
              <button type="button"
                onClick={() => { onChange(null); setBusca(''); }}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 0 0 8px' }}
                title="Limpar seleção">×</button>
            </div>
          ) : (
            /* Campo de busca */
            <input className="form-control"
              value={busca}
              onChange={e => { setBusca(e.target.value); setAberto(true); }}
              onFocus={() => setAberto(true)}
              onBlur={() => setTimeout(() => setAberto(false), 200)}
              placeholder="Digite para buscar vara (nome, fórum, cidade)..." />
          )}

          {/* Dropdown de resultados */}
          {aberto && varasFiltradas.length > 0 && !varaSelecionada && (
            <div style={{ position: 'absolute', zIndex: 150, width: '100%', border: '1px solid #ddd', borderRadius: 6, marginTop: 2, maxHeight: 200, overflowY: 'auto', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {varasFiltradas.map(v => (
                <div key={v.id}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  onClick={() => { onChange(v.id); setBusca(''); setAberto(false); }}>
                  <strong>{v.abrev_nome || v.nome}</strong>
                  {' — '}{v.forum_nome}
                  {v.forum_cidade && (
                    <span style={{ color: '#888', fontSize: 12 }}>
                      {' · '}{v.forum_cidade}{v.forum_uf ? `/${v.forum_uf}` : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Hint quando nenhum resultado */}
          {aberto && busca.length >= 1 && varasFiltradas.length === 0 && !varaSelecionada && (
            <div style={{ position: 'absolute', zIndex: 150, width: '100%', border: '1px solid #ddd', borderRadius: 6, marginTop: 2, background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: '10px 12px', fontSize: 13, color: '#888' }}>
              Nenhuma vara encontrada. Use o botão <strong>…</strong> para cadastrar.
            </div>
          )}
        </div>

        {/* Botão para cadastrar nova vara */}
        <button type="button" title="Cadastrar nova vara"
          style={{ padding: '0 10px', border: '1px solid #ddd', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', fontSize: 16, whiteSpace: 'nowrap' }}
          onClick={() => setModalNova(true)}>…</button>
      </div>

      {/* Endereço informativo abaixo */}
      {varaSelecionada && endereco && (
        <div style={{ marginTop: 6, padding: '7px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 12, color: '#1e40af' }}>
          📍 {endereco}
        </div>
      )}
      {varaSelecionada && !endereco && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>
          📍 Endereço não cadastrado para este fórum
        </div>
      )}

      {/* Mini-modal cadastro rápido de vara */}
      {modalNova && (
        <ModalNovaVara
          foruns={foruns}
          onFechar={() => setModalNova(false)}
          onSalvo={async (novoId) => {
            await onRecarregarVaras();
            onChange(novoId);
            setModalNova(false);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Mini-modal para cadastro rápido de vara (dentro do modal de audiência)
// ============================================================
function ModalNovaVara({ foruns, onFechar, onSalvo }) {
  const [form, setForm]     = useState({ forum_id: '', nome: '', abrev_nome: '', codVaraNoProc: '', compl_end: '' });
  const [salvando, setSalvando] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function salvar() {
    if (!form.forum_id)      return toast.error('Fórum é obrigatório');
    if (!form.nome.trim())   return toast.error('Nome é obrigatório');
    setSalvando(true);
    try {
      const { data } = await processosAPI.criarVara({ ...form, forum_id: parseInt(form.forum_id) });
      toast.success('Vara cadastrada!');
      onSalvo(data.dados.id);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao cadastrar vara'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3>Nova Vara</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label obrigatorio">Fórum</label>
            <select className="form-control" value={form.forum_id}
              onChange={e => set('forum_id', e.target.value)} autoFocus>
              <option value="">Selecione o fórum...</option>
              {foruns.map(f => (
                <option key={f.id} value={f.id}>{f.abrev_nome || f.nome}</option>
              ))}
            </select>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label obrigatorio">Nome completo</label>
              <input className="form-control" placeholder="Ex: 1ª Vara do Trabalho"
                value={form.nome} onChange={e => set('nome', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Abreviação</label>
              <input className="form-control" placeholder="Ex: 1ªVT/SP"
                value={form.abrev_nome} onChange={e => set('abrev_nome', e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Código CNJ</label>
              <input className="form-control" placeholder="Ex: 5020001" maxLength={15}
                style={{ fontFamily: 'monospace' }}
                value={form.codVaraNoProc} onChange={e => set('codVaraNoProc', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Complemento de endereço</label>
              <input className="form-control" placeholder="Ex: 3º andar, Bloco A"
                value={form.compl_end} onChange={e => set('compl_end', e.target.value)} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
            Para editar mais detalhes desta vara (tel, e-mail), acesse Controle → Varas.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Cadastrar Vara'}
          </button>
        </div>
      </div>
    </div>
  );
}
