// ============================================================
// PÁGINA DE PERÍCIAS
// Fluxo espelhado na audiência: status (agendada/realizada/cancelada/remarcada),
// cancelar, remarcar, histórico. Endereço estruturado (CEP), responsável e
// perito vindo do processo. NÃO tem "registrar ata".
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { periciasAPI, processosAPI, pessoasAPI, audienciasAPI, authAPI, calendarioAPI } from '../../services/api';
import { formatarData, toTitleCase, mascaraCNJ } from '../../utils/formatters';
import { toast } from 'react-toastify';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import GerarDocumentoBotao from '../../components/GerarDocumento';
import ModalGerarLote from '../../components/GerarLote';
import { useAuth } from '../../context/AuthContext';

// Cor/label do badge conforme o status
function badgeStatus(status) {
  switch (status) {
    case 'realizada': return { cls: 'badge-verde',    txt: 'Realizada' };
    case 'cancelada': return { cls: 'badge-vermelho',  txt: 'Cancelada' };
    case 'remarcada': return { cls: 'badge-amarelo',   txt: 'Remarcada' };
    default:          return { cls: 'badge-azul',      txt: 'Agendada' };
  }
}

export default function Pericias() {
  const { temPermissao } = useAuth();
  const [lista, setLista]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [filtros, setFiltros]     = useState({ data_de: '', data_ate: '', pagina: 1 });
  const [tipos, setTipos]         = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando]   = useState(null);
  // Modais de ação
  const [cancelando, setCancelando] = useState(null);  // perícia a cancelar
  const [remarcando, setRemarcando] = useState(null);  // perícia a remarcar
  const [historicoDe, setHistoricoDe] = useState(null); // perícia p/ ver histórico
  const [confirmar, setConfirmar]   = useState(null);   // { titulo, mensagem, acao, ... }
  // Seleção para geração em lote (IDs das perícias marcadas) + modal do lote
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [loteAberto, setLoteAberto] = useState(false);
  const podeLote = temPermissao('documentos', 'cadastrar'); // quem pode gerar documentos

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await periciasAPI.listar({ ...filtros, limite: 30 });
      if (data.ok) { setLista(data.dados.registros); setTotal(data.dados.total); }
      setSelecionados(new Set()); // troca de página/filtro zera a seleção (evita IDs de outra página)
    } catch { toast.error('Erro ao carregar perícias'); }
    finally { setCarregando(false); }
  }, [filtros]);

  // Só perícias agendadas podem entrar no lote (mesma regra do botão "Gerar Doc" individual).
  const elegivelLote = (p) => p.status === 'agendada' || !p.status;
  const idsElegiveis = lista.filter(elegivelLote).map(p => p.id);
  const todosSelecionados = idsElegiveis.length > 0 && idsElegiveis.every(id => selecionados.has(id));

  function alternarSelecao(id) {
    setSelecionados(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function alternarTodos() {
    setSelecionados(s => {
      const n = new Set(s);
      if (todosSelecionados) idsElegiveis.forEach(id => n.delete(id));
      else idsElegiveis.forEach(id => n.add(id));
      return n;
    });
  }

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    periciasAPI.tipos().then(r => { if (r.data.ok) setTipos(r.data.dados); });
  }, []);

  // Abre a edição com a perícia COMPLETA. A linha da lista (listar) não traz o endereço
  // estruturado nem o responsável; sem eles, salvar gravaria NULL e apagaria esses dados.
  async function abrirEdicao(p) {
    try {
      const { data } = await periciasAPI.buscar(p.id);
      if (data.ok) { setEditando(data.dados); setModalAberto(true); }
      else toast.error('Erro ao carregar perícia');
    } catch { toast.error('Erro ao carregar perícia'); }
  }

  async function enviarComunicado(id) {
    try {
      const { data } = await periciasAPI.enviarComunicado(id);
      toast.success(data.mensagem || 'Comunicado enviado ao cliente');
      carregar();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao enviar comunicado'); }
  }

  // Marca como realizada (com confirmação)
  function pedirMarcarRealizada(p) {
    setConfirmar({
      titulo: 'Marcar como realizada',
      mensagem: `Confirma que a perícia do processo ${p.processo_numero || ''} foi realizada?`,
      textoBotao: 'Marcar como realizada',
      tipo: 'aviso',
      acao: async () => {
        try {
          await periciasAPI.marcarRealizada(p.id);
          toast.success('Perícia marcada como realizada');
          carregar();
        } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao atualizar'); }
      },
    });
  }

  // Excluir (com confirmação)
  function pedirExcluir(p) {
    setConfirmar({
      titulo: 'Excluir perícia',
      mensagem: `Tem certeza que deseja excluir esta perícia? Esta ação não pode ser desfeita.`,
      textoBotao: 'Excluir',
      tipo: 'perigo',
      acao: async () => {
        try {
          await periciasAPI.excluir(p.id);
          toast.success('Perícia excluída');
          carregar();
        } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao excluir'); }
      },
    });
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
          {/* Geração em lote — só para quem pode gerar documentos; habilita ao marcar perícias */}
          {podeLote && (
            <button className="btn btn-outline" style={{marginBottom:'1px'}}
              disabled={selecionados.size === 0}
              onClick={() => setLoteAberto(true)}>
              📄 Gerar em lote{selecionados.size ? ` (${selecionados.size})` : ''}
            </button>
          )}
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
                  {podeLote && (
                    <th style={{width:'32px'}}>
                      {/* Marca/desmarca todas as perícias elegíveis da página */}
                      <input type="checkbox" checked={todosSelecionados}
                        onChange={alternarTodos} disabled={idsElegiveis.length === 0}
                        title="Selecionar todas (agendadas)" />
                    </th>
                  )}
                  <th>Processo</th><th>Pasta</th><th>Tipo</th>
                  <th>Data / Hora</th><th>Perito</th><th>Responsável</th>
                  <th>Status</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(p => {
                  const bg = badgeStatus(p.status);
                  const agendada = p.status === 'agendada' || !p.status;
                  const historico = p.status === 'cancelada' || p.status === 'remarcada';
                  return (
                    <tr key={p.id}>
                      {podeLote && (
                        <td>
                          {/* Caixinha só nas perícias elegíveis (agendadas) */}
                          {elegivelLote(p) && (
                            <input type="checkbox" checked={selecionados.has(p.id)}
                              onChange={() => alternarSelecao(p.id)} />
                          )}
                        </td>
                      )}
                      <td>{p.processo_numero || '—'}</td>
                      <td style={{maxWidth:'220px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {/* Formato padrão do sistema: "0010 — Título" */}
                        {p.pasta_numero
                          ? `${String(p.pasta_numero).padStart(4,'0')} — ${p.pasta_titulo || ''}`
                          : (p.pasta_titulo || '—')}
                      </td>
                      <td>{p.tipo_nome || '—'}</td>
                      <td>
                        <strong>{formatarData(p.data)}</strong>
                        {p.hora && <div style={{fontSize:'12px',color:'#888'}}>{p.hora.slice(0,5)}</div>}
                      </td>
                      <td>{p.perito_nome || '—'}</td>
                      <td>{p.responsavel_nome || '—'}</td>
                      <td><span className={`badge ${bg.cls}`}>{bg.txt}</span></td>
                      <td>
                        <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                          {/* Editar só quando agendada */}
                          {agendada && (
                            <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px'}}
                              onClick={() => abrirEdicao(p)}>Editar</button>
                          )}
                          {agendada && (
                            <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px'}}
                              onClick={() => pedirMarcarRealizada(p)}>✓ Realizada</button>
                          )}
                          {agendada && (
                            <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px'}}
                              onClick={() => setCancelando(p)}>Cancelar</button>
                          )}
                          {agendada && (
                            <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px'}}
                              onClick={() => setRemarcando(p)}>Remarcar</button>
                          )}
                          <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px'}}
                            onClick={() => setHistoricoDe(p)}>Histórico</button>
                          {!historico && (
                            <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px',color:'#dc2626'}}
                              onClick={() => pedirExcluir(p)}>Excluir</button>
                          )}
                          {agendada && (
                            <button className="btn btn-outline" style={{fontSize:'11px',padding:'4px 8px'}}
                              onClick={() => enviarComunicado(p.id)}
                              title="Enviar/reenviar comunicado ao cliente por e-mail">
                              ✉ {p.comunicado_enviado ? 'Reenviar' : 'Comunicar'}
                            </button>
                          )}
                          {/* Gerar documento — só perícia agendada e com modelo para o seu tipo */}
                          {agendada && Number(p.tem_modelo_doc) === 1 && (
                            <GerarDocumentoBotao ancoraTipo="pericia" ancoraId={p.id}
                              estilo={{fontSize:'11px',padding:'4px 8px'}} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
          onTiposChange={() => periciasAPI.tipos().then(r => { if (r.data.ok) setTipos(r.data.dados); })}
          onFechar={(reload) => { setModalAberto(false); if(reload) carregar(); }} />
      )}
      {cancelando && (
        <ModalCancelar pericia={cancelando}
          onFechar={(reload) => { setCancelando(null); if(reload) carregar(); }} />
      )}
      {remarcando && (
        <ModalRemarcar pericia={remarcando}
          onFechar={(reload) => { setRemarcando(null); if(reload) carregar(); }} />
      )}
      {historicoDe && (
        <ModalHistorico pericia={historicoDe} onFechar={() => setHistoricoDe(null)} />
      )}
      {confirmar && (
        <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />
      )}
      {loteAberto && (
        <ModalGerarLote ancoraTipo="pericia" ancoraIds={[...selecionados]}
          onFechar={() => setLoteAberto(false)} />
      )}
    </div>
  );
}

// ============================================================
// MODAL: NOVA / EDITAR PERÍCIA
// ============================================================
// processoInicial (opcional): { processo_id, processo_numero, pasta_titulo } — quando o modal é
// aberto já dentro de um processo (ex.: aba Perícias da pasta), pré-seleciona o processo e dispensa
// a busca de pasta. Default undefined => comportamento idêntico ao da tela de Perícias.
export function ModalPericia({ tipos, pericia, processoInicial, onTiposChange, onFechar }) {
  const { temPermissao } = useAuth();
  // Mostra o botão "..." de gerenciar tipos só para quem pode cadastrar/alterar tipos
  const podeTipos = temPermissao('pericias', 'tipos', 'cadastrar') || temPermissao('pericias', 'tipos', 'alterar');
  const [modalTipos, setModalTipos] = useState(false);
  // Inicializa o form. Em edição/aba-da-pasta já vem com processo_id e o título do processo.
  const [form, setForm]       = useState(
    pericia ? { ...pericia, titulo: pericia.pasta_titulo || '' }
    : processoInicial ? { processo_id: processoInicial.processo_id, titulo: processoInicial.pasta_titulo || '' }
    : {}
  );
  const [salvando, setSalvando] = useState(false);
  const [pastas, setPastas]   = useState([]);
  // Campo "Número do Processo" (CNJ) — mesmo padrão do Novo Prazo. Em edição/aba já vem preenchido.
  const [buscaProc, setBuscaProc] = useState(pericia?.processo_numero || processoInicial?.processo_numero || '');
  const [buscandoCep, setBuscandoCep] = useState(false);
  // Perito: lista do processo + busca avulsa (fallback)
  const [peritosProc, setPeritosProc] = useState([]);
  const [peritosBusca, setPeritosBusca] = useState([]);
  const [buscaPerito, setBuscaPerito] = useState(pericia?.perito_nome || '');
  // Selects de pessoas
  const [usuarios, setUsuarios] = useState([]);
  const [advogados, setAdvogados] = useState([]);
  // Confirmação de dia não útil com senha
  const [senhaDiaUtil, setSenhaDiaUtil] = useState(null);

  useEffect(() => {
    processosAPI.auxiliares().then(r => {
      if (r.data.ok) setUsuarios(r.data.dados.usuarios || []);
    });
    audienciasAPI.advogados().then(r => {
      if (r.data.ok) setAdvogados(r.data.dados || []);
    });
    // Na edição, já carrega os peritos do processo e o valor do responsável.
    // Quando aberto a partir de um processo (processoInicial), também já carrega os peritos.
    if (pericia?.processo_id) carregarPeritosProcesso(pericia.processo_id);
    else if (processoInicial?.processo_id) carregarPeritosProcesso(processoInicial.processo_id);
    if (pericia?.responsavel_valor) setForm(f => ({ ...f, responsavel_id: pericia.responsavel_valor }));
  }, []); // eslint-disable-line

  async function carregarPeritosProcesso(processoId) {
    try {
      const { data } = await periciasAPI.peritosProcesso(processoId);
      if (data.ok) setPeritosProc(data.dados);
    } catch { /* ignora */ }
  }

  // Busca pastas/processos pelo número (ou parte) do CNJ — autocomplete do campo "Número do Processo"
  async function buscarPastas(termo) {
    if (termo.length < 2) return setPastas([]);
    const { data } = await processosAPI.listarPastas({ busca: termo, limite: 10 });
    if (data.ok) setPastas(data.dados.registros);
  }

  // Ao escolher um item do autocomplete: preenche o Título (somente leitura), preenche o
  // "Número do Processo" COMPLETO (num_proc do item), resolve o processo_id e carrega os peritos.
  async function selecionarPasta(pasta) {
    const numFmt = String(pasta.numPasta).padStart(4, '0');
    setPastas([]);
    set('titulo', `${numFmt} — ${pasta.titulo_proc || ''}`);
    set('processo_id', '');
    setPeritosProc([]);
    // num_proc = número do processo representativo da pasta (vem completo do backend)
    if (pasta.num_proc) setBuscaProc(pasta.num_proc);
    try {
      const { data } = await processosAPI.buscarPasta(pasta.id);
      if (data.ok) {
        const procs = data.dados.processos || [];
        const soDigitos = s => (s || '').replace(/\D/g, '');
        // 1º) tenta casar exatamente o que foi digitado; 2º) o processo representativo (num_proc);
        // 3º) se a pasta só tem um processo, usa ele.
        const match = procs.find(p => soDigitos(p.numProc) === soDigitos(buscaProc))
                   || procs.find(p => soDigitos(p.numProc) === soDigitos(pasta.num_proc))
                   || (procs.length === 1 ? procs[0] : null);
        if (match) {
          set('processo_id', match.id);
          setBuscaProc(match.numProc || pasta.num_proc || '');   // garante o CNJ completo no campo
          carregarPeritosProcesso(match.id);                      // peritos do processo selecionado
        }
      }
    } catch {}
  }

  async function buscarPeritos(termo) {
    if (termo.length < 2) { setPeritosBusca([]); return; }
    const tipo = form.perito_tipo || 'fisica';
    const fn = tipo === 'fisica' ? pessoasAPI.listarFisicas : pessoasAPI.listarJuridicas;
    const { data } = await fn({ busca: termo, limite: 10 });
    if (data.ok) setPeritosBusca(data.dados.registros);
  }

  // Busca endereço por CEP (ViaCEP) — mesmo padrão do cadastro de pessoas
  async function buscarCep(cep) {
    const nums = (cep || '').replace(/\D/g, '');
    if (nums.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${nums}/json/`);
      const d = await r.json();
      if (!d.erro) {
        setForm(f => ({
          ...f,
          logradouro: toTitleCase(d.logradouro || ''),
          bairro:     toTitleCase(d.bairro     || ''),
          cidade:     toTitleCase(d.localidade || ''),
          estado:     d.uf || '',
        }));
      }
    } catch { /* ignora erro de rede */ }
    finally { setBuscandoCep(false); }
  }

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  function selecionarPerito(tipo, id, nome) {
    set('perito_tipo', tipo);
    set('perito_id', id);
    setBuscaPerito(nome);
    setPeritosBusca([]);
  }

  async function salvar() {
    if (!form.processo_id) return toast.error('Número do processo é obrigatório');
    if (!form.data)        return toast.error('Data é obrigatória');

    // Regra (15/06): agendar perícia com data retroativa, fim de semana, feriado ou fora do
    // horário de expediente (08:00–18:00) SÓ é permitido com confirmação por senha do usuário.
    const motivos = [];   // o que será mostrado na confirmação
    const obs     = [];   // o que será gravado na auditoria

    // 1) Data retroativa (anterior a hoje)
    const hoje = new Date().toISOString().split('T')[0];
    if (form.data < hoje) {
      const dataFmt = form.data.split('-').reverse().join('/');
      motivos.push(`data retroativa (${dataFmt})`);
      obs.push(`data retroativa confirmada com senha (${dataFmt})`);
    }
    // 2) Fora do horário de expediente (08:00–18:00) — só checa se a hora foi informada
    if (form.hora) {
      const h = parseInt(String(form.hora).split(':')[0], 10);
      if (h < 8 || h >= 18) {
        const horaFmt = String(form.hora).slice(0, 5);
        motivos.push(`fora do horário de expediente (${horaFmt})`);
        obs.push(`horário fora do expediente confirmado com senha (${horaFmt})`);
      }
    }
    // 3) Fim de semana / feriado (calendário do sistema)
    try {
      const { data: cal } = await calendarioAPI.verificarDiaUtil(form.data);
      if (cal.ok && !cal.dados.dia_util) {
        const desc = cal.dados.descricao || 'dia não útil';
        motivos.push(desc);
        obs.push(`dia não útil (${desc}) confirmado com senha`);
      }
    } catch { /* se a verificação de calendário falhar, não bloqueia por esse motivo */ }

    // Qualquer condição incomum → exige a senha do usuário antes de salvar
    if (motivos.length > 0) {
      setSenhaDiaUtil({
        descricao: `Esta perícia será agendada com: ${motivos.join('; ')}.`,
        obs: obs.join('; '),
      });
      return;
    }

    await executarSalvar(null);
  }

  async function executarSalvar(obs_auditoria) {
    setSalvando(true);
    try {
      const payload = { ...form, responsavel_id: form.responsavel_id || null, obs_auditoria };
      if (pericia?.id) {
        await periciasAPI.atualizar(pericia.id, payload);
        toast.success('Perícia atualizada!');
      } else {
        await periciasAPI.criar(payload);
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
          {/* Número do Processo (CNJ) — mesmo padrão do Novo Prazo. Quando aberto pela aba da
              pasta (processoInicial), o processo é fixo e o campo fica somente leitura. */}
          <div className="form-group">
            <label className="form-label">Número do Processo *</label>
            <input className="form-control" placeholder="0000000-00.0000.0.00.0000"
              value={buscaProc} maxLength={25}
              style={{ maxWidth: '260px', fontFamily: 'monospace', letterSpacing: '0.5px',
                       ...(processoInicial ? { background: '#f8fafc', cursor: 'default' } : {}) }}
              readOnly={!!processoInicial}
              onChange={processoInicial ? undefined : e => {
                const masked = mascaraCNJ(e.target.value);
                setBuscaProc(masked);
                set('processo_id', '');   // limpa seleção anterior até casar de novo
                buscarPastas(masked);
              }} />
            {pastas.length > 0 && (
              <div style={{border:'1px solid #ddd',borderRadius:'6px',marginTop:'4px',maxHeight:'140px',overflowY:'auto',background:'#fff',zIndex:10,position:'relative'}}>
                {pastas.map(p => (
                  <div key={p.id} style={{padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid #f0f0f0'}}
                    onMouseDown={() => selecionarPasta(p)}>
                    <strong>{String(p.numPasta).padStart(4,'0')}</strong> — {p.titulo_proc || '—'}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Título</label>
            <input className="form-control" value={form.titulo||''} readOnly
              style={{background:'#f8fafc', cursor:'default'}} />
          </div>

          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Tipo de perícia</label>
              <div style={{display:'flex',gap:'6px'}}>
                <select className="form-control" value={form.tipo_pericia_id||''}
                  onChange={e => set('tipo_pericia_id', e.target.value)}>
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
              <input type="date" className="form-control" value={form.data ? String(form.data).slice(0,10) : ''}
                onChange={e => set('data', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Hora</label>
              <input type="time" className="form-control" value={form.hora ? String(form.hora).slice(0,5) : ''}
                onChange={e => set('hora', e.target.value)} />
            </div>
          </div>

          {/* Local — nome/referência opcional */}
          <div className="form-group">
            <label className="form-label">Nome/Referência do local (opcional)</label>
            <input className="form-control" value={form.local||''}
              onChange={e => set('local', e.target.value)}
              onBlur={() => set('local', toTitleCase(form.local))}
              placeholder="Ex: IML Central, Consultório Dr. Fulano, Canteiro de obra..." />
          </div>

          {/* Endereço estruturado (CEP → ViaCEP).
              autoComplete="off" em todos: impede o navegador de tratar como endereço pessoal
              e oferecer "salvar endereço" (vale em qualquer micro/navegador, sem config local). */}
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">CEP {buscandoCep && <small style={{color:'#3b82f6'}}>(buscando...)</small>}</label>
              <input className="form-control" autoComplete="off" value={form.cep||''}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g,'').slice(0,8);
                  const fmt = v.length > 5 ? v.replace(/(\d{5})(\d)/,'$1-$2') : v;
                  set('cep', fmt);
                  if (v.length === 8) buscarCep(v);
                }}
                placeholder="00000-000" maxLength={9} />
            </div>
            <div className="form-group" style={{gridColumn:'span 2'}}>
              <label className="form-label">Logradouro</label>
              <input className="form-control" autoComplete="off" value={form.logradouro||''}
                onChange={e => set('logradouro', e.target.value)} />
            </div>
          </div>
          <div className="grid-3">
            <div className="form-group">
              <label className="form-label">Número</label>
              <input className="form-control" autoComplete="off" value={form.numero||''}
                onChange={e => set('numero', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Complemento</label>
              <input className="form-control" autoComplete="off" value={form.complemento||''}
                onChange={e => set('complemento', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Bairro</label>
              <input className="form-control" autoComplete="off" value={form.bairro||''}
                onChange={e => set('bairro', e.target.value)} />
            </div>
          </div>
          <div className="grid-3">
            <div className="form-group" style={{gridColumn:'span 2'}}>
              <label className="form-label">Cidade</label>
              <input className="form-control" autoComplete="off" value={form.cidade||''}
                onChange={e => set('cidade', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <input className="form-control" autoComplete="off" value={form.estado||''}
                onChange={e => set('estado', e.target.value)} placeholder="SP" maxLength={2} />
            </div>
          </div>

          {/* Responsável + Assistente técnico */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Responsável pela condução</label>
              <select className="form-control" value={form.responsavel_id||''}
                onChange={e => set('responsavel_id', e.target.value)}>
                <option value="">— Não definido —</option>
                {advogados.map(a => (
                  <option key={`${a.origem}:${a.id}`} value={`${a.origem}:${a.id}`}>
                    {a.nome}{a.origem === 'freela' ? ' (freelancer)' : ''}
                  </option>
                ))}
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

          {/* Perito — primeiro os peritos do processo, com busca avulsa de apoio */}
          <div className="form-group">
            <label className="form-label">Perito</label>
            {peritosProc.length > 0 ? (
              <select className="form-control"
                value={form.perito_id ? `${form.perito_tipo}:${form.perito_id}` : ''}
                onChange={e => {
                  if (!e.target.value) { selecionarPerito('', '', ''); return; }
                  const [tp, pid] = e.target.value.split(':');
                  const sel = peritosProc.find(x => x.tipo_pessoa === tp && String(x.pessoa_id) === pid);
                  selecionarPerito(tp, pid, sel ? sel.nome : '');
                }}>
                <option value="">— Selecione um perito do processo —</option>
                {peritosProc.map(x => (
                  <option key={`${x.tipo_pessoa}:${x.pessoa_id}`} value={`${x.tipo_pessoa}:${x.pessoa_id}`}>
                    {x.nome} ({x.tipo_pessoa === 'juridica' ? 'PJ' : 'PF'})
                  </option>
                ))}
              </select>
            ) : (
              <small style={{color:'#888'}}>
                Nenhum perito vinculado a este processo. Cadastre os peritos no processo, ou busque abaixo.
              </small>
            )}
            {/* Busca avulsa (caso o perito ainda não esteja no processo) */}
            <div style={{display:'flex',gap:'8px',marginTop:'8px'}}>
              <select className="form-control" style={{maxWidth:'130px'}}
                value={form.perito_tipo||'fisica'}
                onChange={e => { set('perito_tipo', e.target.value); setPeritosBusca([]); }}>
                <option value="fisica">Física</option>
                <option value="juridica">Jurídica</option>
              </select>
              <div style={{flex:1,position:'relative'}}>
                <input className="form-control" placeholder="Buscar outra pessoa como perito..."
                  value={buscaPerito}
                  onChange={e => { setBuscaPerito(e.target.value); buscarPeritos(e.target.value); }} />
                {peritosBusca.length > 0 && (
                  <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#fff',border:'1px solid #ddd',borderRadius:'6px',zIndex:20,maxHeight:'130px',overflowY:'auto',boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}}>
                    {peritosBusca.map(p => (
                      <div key={p.id} style={{padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid #f0f0f0'}}
                        onClick={() => selecionarPerito(form.perito_tipo||'fisica', p.id, p.nome || p.razao_social)}>
                        {p.nome || p.razao_social}
                      </div>
                    ))}
                  </div>
                )}
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

      {/* Confirmação de dia não útil com senha */}
      {senhaDiaUtil && (
        <ModalConfirmarSenhaDiaUtil
          descricao={senhaDiaUtil.descricao}
          onCancelar={() => setSenhaDiaUtil(null)}
          onConfirmar={async () => { const obs = senhaDiaUtil.obs; setSenhaDiaUtil(null); await executarSalvar(obs); }}
        />
      )}

      {/* Gerenciar tipos de perícia (cadastrar/editar/excluir) — abre por cima */}
      {modalTipos && (
        <ModalGerenciarTipos
          onFechar={() => setModalTipos(false)}
          onAtualizar={onTiposChange}
        />
      )}
    </div>
  );
}

// ============================================================
// MODAL: GERENCIAR TIPOS DE PERÍCIA (cadastrar / editar / excluir)
// Espelha o gerenciador de tipos da Audiência. Exclusão é soft-delete e
// bloqueada no backend se o tipo estiver em uso por alguma perícia.
// ============================================================
function ModalGerenciarTipos({ onFechar, onAtualizar }) {
  const [tipos, setTipos]       = useState([]);
  const [novoNome, setNovoNome] = useState('');
  const [editando, setEditando] = useState(null); // { id, nome }
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    const { data } = await periciasAPI.tipos();
    if (data.ok) setTipos(data.dados);
  }

  async function adicionar() {
    if (!novoNome.trim()) return toast.error('Digite o nome do tipo');
    setSalvando(true);
    try {
      await periciasAPI.criarTipo({ nome: novoNome.trim() });
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
      await periciasAPI.atualizarTipo(editando.id, { nome: editando.nome.trim() });
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
      await periciasAPI.excluirTipo(id);
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
          <h3>Tipos de Perícia</h3>
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

// ============================================================
// MODAL: CANCELAR PERÍCIA (motivo)
// ============================================================
export function ModalCancelar({ pericia, onFechar }) {
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    if (!motivo.trim()) return toast.error('Informe o motivo do cancelamento');
    setSalvando(true);
    try {
      await periciasAPI.cancelar(pericia.id, motivo.trim());
      toast.success('Perícia cancelada');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao cancelar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{maxWidth:'480px'}}>
        <div className="modal-header">
          <h3>Cancelar Perícia</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Motivo do cancelamento *</label>
            <textarea className="form-control" rows={3} value={motivo}
              onChange={e => setMotivo(e.target.value)} autoFocus
              placeholder="Descreva o motivo..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Voltar</button>
          <button className="btn btn-danger" onClick={confirmar} disabled={salvando}>
            {salvando ? 'Cancelando...' : 'Cancelar perícia'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL: REMARCAR PERÍCIA (nova data/hora + motivo, valida dia útil)
// ============================================================
export function ModalRemarcar({ pericia, onFechar }) {
  const [dados, setDados] = useState({ nova_data: '', nova_hora: pericia.hora ? String(pericia.hora).slice(0,5) : '', motivo: '' });
  const [salvando, setSalvando] = useState(false);
  const [senhaDiaUtil, setSenhaDiaUtil] = useState(null);

  function set(k, v) { setDados(d => ({...d, [k]: v})); }

  async function confirmar() {
    if (!dados.nova_data)     return toast.error('Informe a nova data');
    if (!dados.motivo.trim()) return toast.error('Informe o motivo da remarcação');

    // Mesma regra do cadastro: data retroativa, fim de semana, feriado ou fora de 08–18h → senha.
    const motivos = [];
    const hoje = new Date().toISOString().split('T')[0];
    if (dados.nova_data < hoje) {
      motivos.push(`data retroativa (${dados.nova_data.split('-').reverse().join('/')})`);
    }
    if (dados.nova_hora) {
      const h = parseInt(String(dados.nova_hora).split(':')[0], 10);
      if (h < 8 || h >= 18) motivos.push(`fora do horário de expediente (${String(dados.nova_hora).slice(0,5)})`);
    }
    try {
      const { data: cal } = await calendarioAPI.verificarDiaUtil(dados.nova_data);
      if (cal.ok && !cal.dados.dia_util) motivos.push(cal.dados.descricao || 'dia não útil');
    } catch { /* se falhar, não bloqueia por esse motivo */ }

    if (motivos.length > 0) {
      setSenhaDiaUtil({ descricao: `Esta perícia será remarcada com: ${motivos.join('; ')}.` });
      return;
    }

    await executar();
  }

  async function executar() {
    setSalvando(true);
    try {
      await periciasAPI.remarcar(pericia.id, {
        motivo: dados.motivo.trim(),
        nova_data: dados.nova_data,
        nova_hora: dados.nova_hora || null,
      });
      toast.success('Perícia remarcada');
      onFechar(true);
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao remarcar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{maxWidth:'480px'}}>
        <div className="modal-header">
          <h3>Remarcar Perícia</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Nova data *</label>
              <input type="date" className="form-control" value={dados.nova_data}
                onChange={e => set('nova_data', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Nova hora</label>
              <input type="time" className="form-control" value={dados.nova_hora}
                onChange={e => set('nova_hora', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Motivo da remarcação *</label>
            <textarea className="form-control" rows={3} value={dados.motivo}
              onChange={e => set('motivo', e.target.value)} placeholder="Descreva o motivo..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Voltar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={salvando}>
            {salvando ? 'Remarcando...' : 'Remarcar'}
          </button>
        </div>
      </div>

      {senhaDiaUtil && (
        <ModalConfirmarSenhaDiaUtil
          descricao={senhaDiaUtil.descricao}
          onCancelar={() => setSenhaDiaUtil(null)}
          onConfirmar={async () => { setSenhaDiaUtil(null); await executar(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// MODAL: HISTÓRICO DA PERÍCIA (auditoria)
// ============================================================
export function ModalHistorico({ pericia, onFechar }) {
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    periciasAPI.historico(pericia.id)
      .then(r => { if (r.data.ok) setRegistros(r.data.dados); })
      .catch(() => toast.error('Erro ao carregar histórico'))
      .finally(() => setCarregando(false));
  }, [pericia.id]);

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{maxWidth:'560px'}}>
        <div className="modal-header">
          <h3>Histórico da Perícia</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {carregando ? <div className="loading">Carregando...</div> : (
            registros.length === 0 ? <p className="lista-vazia">Nenhum registro de histórico</p> : (
              <div className="tabela-wrapper">
                <table className="tabela">
                  <thead><tr><th>Quando</th><th>Campo</th><th>De</th><th>Para</th><th>Usuário</th></tr></thead>
                  <tbody>
                    {registros.map(r => (
                      <tr key={r.id}>
                        {/* alterado_em é DATETIME completo — formata data+hora juntos (mesmo padrão do histórico de audiência) */}
                        <td style={{whiteSpace:'nowrap'}}>
                          {r.alterado_em ? new Date(r.alterado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                        </td>
                        <td>{r.campo_alterado}</td>
                        <td>{r.valor_anterior || '—'}</td>
                        <td>{r.valor_novo || '—'}</td>
                        <td>{r.usuario_nome || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL: confirmação de senha para agendar em dia não útil
// ============================================================
function ModalConfirmarSenhaDiaUtil({ descricao, onCancelar, onConfirmar }) {
  const [senha, setSenha] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  async function confirmar() {
    if (!senha) return toast.error('Digite sua senha para confirmar');
    setConfirmando(true);
    try {
      const { data } = await authAPI.verificarSenha({ senha });
      if (data.ok) await onConfirmar();
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Senha incorreta');
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box" style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <h3>⚠️ Confirmação por senha</h3>
          <button className="modal-fechar" onClick={onCancelar}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '16px', color: '#555', fontSize: '14px' }}>
            <strong>{descricao}</strong> Para prosseguir, confirme sua identidade digitando sua senha:
          </p>
          <div className="form-group">
            <label className="form-label">Sua senha *</label>
            <input type="password" className="form-control" value={senha}
              onChange={e => setSenha(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmar()}
              autoFocus autoComplete="current-password" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-danger" onClick={confirmar} disabled={confirmando}>
            {confirmando ? 'Verificando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
