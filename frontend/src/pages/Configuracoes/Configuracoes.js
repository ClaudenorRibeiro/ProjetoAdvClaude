// ============================================================
// PÁGINA DE CONFIGURAÇÕES
// Escritório, Usuários, Permissões, Feriados, Integrações
// Acesso restrito ao administrador
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { configuracaoAPI, manutencaoAPI } from '../../services/api';
import { formatarData, toTitleCase } from '../../utils/formatters';
import { toast } from 'react-toastify';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import { useAuth } from '../../context/AuthContext';

// Estrutura de módulos para a matriz de permissões
// Sub-módulos usam chave composta: 'processos.andamentos'
const MODULOS_PERM = [
  { chave: 'pessoas',      label: 'Pessoas' },
  { chave: 'processos',    label: 'Processos', submodulos: [
    { chave: 'processos.andamentos', label: 'Andamentos' },
    { chave: 'processos.prazos',     label: 'Prazos' },
    { chave: 'processos.tarefas',    label: 'Tarefas' },
    { chave: 'processos.audiencias', label: 'Audiências' },
    { chave: 'processos.pericias',   label: 'Perícias' },
  ]},
  { chave: 'pastas',       label: 'Pastas' },
  { chave: 'prazos', label: 'Prazos (menu)', submodulos: [
    { chave: 'prazos.ver_todos', label: 'Ver prazos de todos os usuários' },
  ]},
  { chave: 'tarefas', label: 'Tarefas (menu)', submodulos: [
    { chave: 'tarefas.ver_todos', label: 'Ver tarefas de todos os usuários' },
  ]},
  { chave: 'audiencias', label: 'Audiências (menu)', submodulos: [
    { chave: 'audiencias.tipos', label: 'Tipos de audiência' },
  ]},
  { chave: 'pericias', label: 'Perícias (menu)', submodulos: [
    { chave: 'pericias.tipos', label: 'Tipos de perícia' },
  ]},
  { chave: 'financeiro',   label: 'Financeiro' },
  { chave: 'documentos',   label: 'Documentos (menu)', submodulos: [
    { chave: 'documentos.modelos', label: 'Modelos de documento' },
  ]},
  { chave: 'publicacoes',  label: 'Publicações' },
  { chave: 'relatorios',   label: 'Relatórios' },
];
// 'historico' aparece para todos os módulos — futuras implementações de histórico
// já encontram a permissão pronta; para módulos sem histórico, a coluna fica disponível mas inativa
const ACOES_PERM = ['visualizar', 'cadastrar', 'alterar', 'excluir', 'historico'];

const TIPO_USUARIO = {
  advogado: 'Advogado',
  estagiario: 'Estagiário',
  secretario: 'Secretário',
  socio: 'Sócio',
  administrador: 'Administrador',
};

// Converte "HH:MM" (ou "HH:MM:SS") em minutos desde a meia-noite. Retorna null se vazio.
function minutosDoHorario(h) {
  if (!h) return null;
  const [hh, mm] = String(h).split(':');
  return parseInt(hh, 10) * 60 + parseInt(mm, 10);
}

// Aplica máscara CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00) conforme o tamanho
function mascaraCnpjCpf(valor) {
  const d = valor.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d.replace(/(\d{2})(\d)/, '$1.$2')
          .replace(/(\d{3})(\d)/, '$1.$2')
          .replace(/(\d{3})(\d)/, '$1.$2')
          .replace(/(\d{3})(\d{1,2})$/, '$1/$2')
          .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export default function Configuracoes() {
  const { ehAdmin, ehSuper } = useAuth();
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
            // Aba de manutenção visível APENAS para o superusuário (nivel 0)
            ...(ehSuper ? [{ key:'manutencao', label:'Manutenção' }] : []),
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
      {abaAtiva === 'manutencao' && ehSuper && <TabManutencao />}
    </div>
  );
}

// ============================================================
// ABA: MANUTENÇÃO (somente superusuário) — Zona de perigo
// Limpa toda a massa de TESTE do banco. Ação irreversível, com dupla trava:
// 1) digitar "LIMPAR" para liberar o botão; 2) ModalConfirmar antes de executar.
// O backend ainda exige confirmacao==='LIMPAR' e é protegido por apenasSuper.
// ============================================================
function TabManutencao() {
  const [texto, setTexto]           = useState('');
  const [confirmar, setConfirmar]   = useState(null);
  const [executando, setExecutando] = useState(false);

  const liberado = texto.trim() === 'LIMPAR';

  function pedirConfirmacao() {
    setConfirmar({
      titulo:    'Limpar TODOS os dados de teste',
      mensagem:  'Esta ação apaga DEFINITIVAMENTE pessoas, processos, prazos, tarefas, audiências, '
               + 'perícias, financeiro, publicações, notificações e logs. Mantém apenas tipos/listas '
               + 'de referência, calendário, configurações, usuários e os modelos de documento. '
               + 'NÃO pode ser desfeita.',
      textoBotao: '🗑️ Limpar tudo',
      tipo: 'perigo',
      // O ModalConfirmar já trata erro (toast) e mantém-se aberto se falhar
      acao: async () => {
        setExecutando(true);
        try {
          const { data } = await manutencaoAPI.limparDadosTeste({ confirmacao: texto.trim() });
          const r = data?.dados;
          toast.success(
            r ? `Limpeza concluída: ${r.registros} registro(s) em ${r.tabelas} tabela(s).`
              : (data?.mensagem || 'Dados de teste removidos.')
          );
          setTexto('');
        } finally {
          setExecutando(false);
        }
      },
    });
  }

  return (
    <div className="card" style={{ borderColor: '#fca5a5' }}>
      <h3 style={{ color: '#b91c1c', marginTop: 0 }}>⚠️ Zona de perigo — Limpar dados de teste</h3>
      <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: 1.6 }}>
        Remove <strong>definitivamente</strong> toda a massa de teste: pessoas, processos, prazos,
        tarefas, audiências, perícias, financeiro, publicações, notificações e logs. São{' '}
        <strong>preservados</strong>: tipos/listas de referência, varas/fóruns, calendário/feriados,
        configurações do escritório, integrações, usuários/permissões e os modelos de documento.
        Esta ação é exclusiva do superusuário e <strong>não pode ser desfeita</strong>.
      </p>
      <div className="form-group" style={{ maxWidth: '260px' }}>
        <label className="form-label">Digite <strong>LIMPAR</strong> para liberar o botão</label>
        <input className="form-control" value={texto} placeholder="LIMPAR"
          onChange={e => setTexto(e.target.value)} autoComplete="off" />
      </div>
      <button className="btn" disabled={!liberado || executando} onClick={pedirConfirmacao}
        style={{ background: '#dc2626', color: '#fff', opacity: (liberado && !executando) ? 1 : 0.5 }}>
        {executando ? 'Limpando…' : '🗑️ Limpar dados de teste'}
      </button>

      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

// ============================================================
// ABA: ESCRITÓRIO
// ============================================================
// ------------------------------------------------------------
// Painel de Data e Hora do Servidor
// Busca fuso horário uma vez no mount e exibe relógio ao vivo
// ------------------------------------------------------------
function PainelHoraServidor() {
  const [fusoHorario, setFusoHorario] = useState('');
  const [fusoAbrev,   setFusoAbrev]   = useState('');
  const [horaAtual,   setHoraAtual]   = useState(new Date());

  // Busca o fuso horário do servidor uma única vez
  useEffect(() => {
    configuracaoAPI.horaServidor().then(r => {
      if (r.data.ok) {
        setFusoHorario(r.data.dados.fuso_horario);
        setFusoAbrev(r.data.dados.fuso_abrev);
      }
    }).catch(() => {}); // silencioso — não bloqueia a tela
  }, []);

  // Atualiza o relógio a cada segundo usando o horário local do navegador
  // (após o servidor confirmar o fuso, o usuário sabe que está sincronizado)
  useEffect(() => {
    const timer = setInterval(() => setHoraAtual(new Date()), 1000);
    return () => clearInterval(timer); // limpa ao desmontar
  }, []);

  const diaSemana = horaAtual.toLocaleDateString('pt-BR', { weekday: 'long' });
  const dataFmt   = horaAtual.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const horaFmt   = horaAtual.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div style={{
      background: '#f0f4ff',
      border: '1px solid #c7d2fe',
      borderRadius: '8px',
      padding: '14px 20px',
      marginBottom: '24px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
    }}>
      {/* Ícone */}
      <div style={{ fontSize: '28px', lineHeight: 1 }}>🕐</div>

      {/* Informações */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
          Data e Hora do Servidor
        </div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#1e2a3a' }}>
          {/* Capitaliza primeira letra do dia da semana */}
          {diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1)}, {dataFmt}
        </div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e2a3a', fontVariantNumeric: 'tabular-nums' }}>
          {horaFmt}
          {fusoAbrev && (
            <span style={{ fontSize: '12px', fontWeight: 400, color: '#6b7280', marginLeft: '10px' }}>
              {fusoAbrev} {fusoHorario && `• ${fusoHorario}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TabEscritorio() {
  const { ehSuper } = useAuth();
  const [form, setForm]         = useState({});
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const refNumero = React.useRef(null);

  const carregar = useCallback(() => {
    configuracaoAPI.buscarEscritorio().then(r => {
      if (r.data.ok) setForm(r.data.dados);
    }).finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    carregar();
    const onFocus = () => carregar();
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [carregar]);

  function set(k, v) { setForm(f => ({...f, [k]: v})); }

  async function buscarCep(cep) {
    const nums = cep.replace(/\D/g, '');
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
          numero:     '',
        }));
        // Posiciona o cursor no campo número
        setTimeout(() => refNumero.current?.focus(), 50);
      }
    } catch (_) { /* ignora erro de rede silenciosamente */ }
    finally { setBuscandoCep(false); }
  }

  // Valida na tela: se os dois horários estiverem preenchidos, exigir 1h de diferença
  const horariosInvalidos = !!(
    form.horario_alerta_prazos && form.horario_alerta_prazos_2 &&
    Math.abs(minutosDoHorario(form.horario_alerta_prazos) - minutosDoHorario(form.horario_alerta_prazos_2)) < 60
  );

  async function salvar() {
    if (!form.nome) return toast.error('Nome do escritório é obrigatório');
    // Bloqueia o salvamento quando os dois horários estão a menos de 1h (mesma regra do backend)
    if (horariosInvalidos) {
      return toast.error('Os dois horários de alerta devem ter no mínimo 1 hora de diferença');
    }
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
      <PainelHoraServidor />
      <h3 style={{marginBottom:'20px',fontSize:'15px',color:'#1e2a3a'}}>Dados do Escritório</h3>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Nome do escritório *</label>
          <input className="form-control" value={form.nome||''} onChange={e => set('nome', e.target.value)} onBlur={() => set('nome', toTitleCase(form.nome))} disabled={!ehSuper} />
        </div>
        <div className="form-group">
          <label className="form-label">Título da aba do navegador</label>
          <input className="form-control" value={form.titulo_aba||''}
            onChange={e => set('titulo_aba', e.target.value)}
            placeholder={form.nome || 'Ex: Dr. Antonio | Advocacia'} disabled={!ehSuper} />
          <small style={{color:'#888',fontSize:'12px'}}>Se vazio, usa o nome do escritório</small>
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">CNPJ / CPF</label>
          <input className="form-control" value={form.cnpj_cpf||''}
            onChange={e => set('cnpj_cpf', mascaraCnpjCpf(e.target.value))}
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            maxLength={18} disabled={!ehSuper} />
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">E-mail principal</label>
          <input type="email" className="form-control" value={form.email||''} onChange={e => set('email', e.target.value)} disabled={!ehSuper} />
        </div>
        <div className="form-group">
          <label className="form-label">Telefone</label>
          <input className="form-control" value={form.telefone||''} onChange={e => set('telefone', e.target.value)}
            placeholder="(11) 99999-9999" disabled={!ehSuper} />
        </div>
      </div>
      <div className="grid-3">
        <div className="form-group">
          <label className="form-label">CEP</label>
          <input className="form-control" value={form.cep||''}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 8);
              const fmt = v.length > 5 ? v.replace(/(\d{5})(\d)/, '$1-$2') : v;
              set('cep', fmt);
              if (v.length === 8) buscarCep(v);
            }}
            placeholder="00000-000" maxLength={9} disabled={!ehSuper || buscandoCep} />
        </div>
        <div className="form-group">
          <label className="form-label">Logradouro</label>
          <input className="form-control" value={form.logradouro||''} onChange={e => set('logradouro', e.target.value)} onBlur={() => set('logradouro', toTitleCase(form.logradouro))} disabled={!ehSuper} />
        </div>
        <div className="form-group">
          <label className="form-label">Número</label>
          <input ref={refNumero} className="form-control" value={form.numero||''} onChange={e => set('numero', e.target.value)} disabled={!ehSuper} />
        </div>
      </div>
      <div className="grid-3">
        <div className="form-group">
          <label className="form-label">Bairro</label>
          <input className="form-control" value={form.bairro||''} onChange={e => set('bairro', e.target.value)} onBlur={() => set('bairro', toTitleCase(form.bairro))} disabled={!ehSuper} />
        </div>
        <div className="form-group">
          <label className="form-label">Cidade</label>
          <input className="form-control" value={form.cidade||''} onChange={e => set('cidade', e.target.value)} onBlur={() => set('cidade', toTitleCase(form.cidade))} disabled={!ehSuper} />
        </div>
        <div className="form-group">
          <label className="form-label">Estado</label>
          <input className="form-control" value={form.estado||''} onChange={e => set('estado', e.target.value)}
            placeholder="SP" maxLength={2} disabled={!ehSuper} />
        </div>
      </div>

      <h4 style={{margin:'20px 0 12px',fontSize:'13px',fontWeight:600,color:'#555'}}>Alertas de prazos — e-mail coletivo</h4>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Horário do e-mail diário</label>
          <input type="time" className="form-control" value={form.horario_alerta_prazos||'18:00'}
            onChange={e => set('horario_alerta_prazos', e.target.value)} />
          <small style={{color:'#888'}}>Envia "PRAZO PENDENTE HOJE" (e atrasado) neste horário</small>
        </div>
        <div className="form-group">
          <label className="form-label">Segundo horário — opcional</label>
          <input type="time" className="form-control" value={form.horario_alerta_prazos_2||''}
            onChange={e => set('horario_alerta_prazos_2', e.target.value)} />
          <small style={{color: horariosInvalidos ? '#dc2626' : '#888'}}>
            {horariosInvalidos
              ? 'Mínimo de 1 hora de diferença entre os dois horários'
              : 'Dispara os mesmos alertas. Deixe vazio para usar só um horário'}
          </small>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">E-mails dos destinatários</label>
        <input type="text" className="form-control" value={form.alerta_emails||''}
          onChange={e => set('alerta_emails', e.target.value)}
          placeholder="email1@ex.com, email2@ex.com" />
        <small style={{color:'#888'}}>Separe por vírgula</small>
      </div>
      <div className="form-group">
        <label style={{display:'flex',alignItems:'center',gap:'10px',cursor:'pointer'}}>
          <input type="checkbox" checked={!!form.alerta_atrasado_ativo}
            onChange={e => set('alerta_atrasado_ativo', e.target.checked ? 1 : 0)} />
          <span>Enviar também "PRAZO ATRASADO" diariamente (no mesmo horário)</span>
        </label>
      </div>

      <h4 style={{margin:'20px 0 12px',fontSize:'13px',fontWeight:600,color:'#555'}}>Outros alertas automáticos</h4>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Dias úteis antes da audiência para alertar cliente</label>
          <input type="number" min="1" className="form-control" value={form.dias_alerta_audiencia||''}
            onChange={e => set('dias_alerta_audiencia', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Dias úteis antes da perícia para alertar cliente</label>
          <input type="number" min="1" className="form-control" value={form.dias_alerta_pericia||''}
            onChange={e => set('dias_alerta_pericia', e.target.value)} />
        </div>
      </div>
      <div className="form-group" style={{maxWidth:'300px'}}>
        <label className="form-label">Audiências sem advogado — alertar nos próximos (dias)</label>
        <input type="number" min="1" className="form-control" value={form.dias_audiencia_sem_adv||7}
          onChange={e => set('dias_audiencia_sem_adv', e.target.value)} />
        <small style={{color:'#888'}}>Aparece no dashboard para todos os usuários</small>
      </div>

      <h4 style={{margin:'20px 0 12px',fontSize:'13px',fontWeight:600,color:'#555'}}>Controle "Fazendo" em prazos</h4>
      <div className="form-group" style={{maxWidth:'300px'}}>
        <label className="form-label">Liberar prazo "Fazendo" automaticamente após (minutos)</label>
        <input type="number" min="5" max="480" className="form-control"
          value={form.prazo_fazendo_timeout || 60}
          onChange={e => set('prazo_fazendo_timeout', e.target.value)} />
        <small style={{color:'#888'}}>O prazo volta ao status anterior se ninguém concluiu no prazo definido</small>
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
  const [usuarios, setUsuarios]               = useState([]);
  const [carregando, setCarregando]           = useState(true);
  const [modalAberto, setModalAberto]         = useState(false);
  const [editando, setEditando]               = useState(null);
  const [modalSenha, setModalSenha]           = useState(false);
  const [usuarioSenha, setUsuarioSenha]       = useState(null);
  const [modalHistorico, setModalHistorico]   = useState(false);
  const [usuarioHistorico, setUsuarioHistorico] = useState(null);
  const [excluindo, setExcluindo]             = useState(null);

  const carregar = useCallback(async () => {
    try {
      const { data } = await configuracaoAPI.listarUsuarios();
      if (data.ok) setUsuarios(data.dados);
    } catch { toast.error('Erro ao carregar usuários'); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function confirmarExclusao(u) {
    if (!window.confirm(`Excluir o usuário "${u.nome}"?\n\nEsta ação não pode ser desfeita.`)) return;
    setExcluindo(u.id);
    try {
      const { data } = await configuracaoAPI.excluirUsuario(u.id);
      toast.success(data.mensagem || 'Usuário excluído');
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao excluir usuário');
    } finally {
      setExcluindo(null);
    }
  }

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
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn btn-outline" style={{fontSize:'12px',padding:'4px 10px'}}
                        onClick={() => { setEditando(u); setModalAberto(true); }}>
                        Editar
                      </button>
                      <button className="btn btn-outline" style={{fontSize:'12px',padding:'4px 10px',color:'#d97706',borderColor:'#d97706'}}
                        onClick={() => { setUsuarioSenha(u); setModalSenha(true); }}
                        title="Redefinir senha deste usuário">
                        🔑 Senha
                      </button>
                      <button className="btn btn-outline" style={{fontSize:'12px',padding:'4px 10px',color:'#6366f1',borderColor:'#6366f1'}}
                        onClick={() => { setUsuarioHistorico(u); setModalHistorico(true); }}
                        title="Ver histórico de ações deste usuário">
                        📋 Histórico
                      </button>
                      <button className="btn btn-outline" style={{fontSize:'12px',padding:'4px 10px',color:'#dc2626',borderColor:'#dc2626'}}
                        onClick={() => confirmarExclusao(u)}
                        disabled={excluindo === u.id}
                        title="Excluir usuário">
                        🗑️
                      </button>
                    </div>
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

      {modalSenha && usuarioSenha && (
        <ModalRedefinirSenha
          usuario={usuarioSenha}
          onFechar={() => { setModalSenha(false); setUsuarioSenha(null); }}
        />
      )}
      {modalHistorico && usuarioHistorico && (
        <ModalHistoricoUsuario
          usuario={usuarioHistorico}
          onFechar={() => { setModalHistorico(false); setUsuarioHistorico(null); }}
        />
      )}
    </div>
  );
}

function ModalHistoricoUsuario({ usuario, onFechar }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [dataDe,  setDataDe]  = useState('');
  const [dataAte, setDataAte] = useState(hoje);
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(false);

  const ACAO_LABEL = { criar: 'Criou', editar: 'Editou', excluir: 'Excluiu', visualizar: 'Visualizou' };
  const ACAO_COR   = { criar: '#16a34a', editar: '#2563eb', excluir: '#dc2626', visualizar: '#6b7280' };

  async function buscar() {
    setCarregando(true);
    try {
      const { data } = await configuracaoAPI.historicoUsuario(usuario.id, { data_de: dataDe, data_ate: dataAte });
      if (data.ok) setRegistros(data.dados.registros);
    } catch { toast.error('Erro ao buscar histórico'); }
    finally { setCarregando(false); }
  }

  useEffect(() => { buscar(); }, []); // eslint-disable-line

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande" style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h3>Histórico — {usuario.nome}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">De</label>
              <input type="date" className="form-control" value={dataDe} onChange={e => setDataDe(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Até</label>
              <input type="date" className="form-control" value={dataAte} onChange={e => setDataAte(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={buscar} disabled={carregando}>
              {carregando ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {carregando ? <div className="loading">Carregando...</div> : registros.length === 0
            ? <p className="lista-vazia">Nenhum registro encontrado para o período</p>
            : (
              <div className="tabela-wrapper" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table className="tabela">
                  <thead>
                    <tr><th>Data/Hora</th><th>Ação</th><th>Módulo</th><th>Registro</th></tr>
                  </thead>
                  <tbody>
                    {registros.map(r => (
                      <tr key={r.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                          {new Date(r.criado_em).toLocaleString('pt-BR')}
                        </td>
                        <td>
                          <span style={{ color: ACAO_COR[r.acao] || '#333', fontWeight: 600, fontSize: '12px' }}>
                            {ACAO_LABEL[r.acao] || r.acao}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px' }}>{r.tabela}</td>
                        <td style={{ fontSize: '12px', color: '#666' }}>#{r.registro_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>
                  {registros.length} registro{registros.length !== 1 ? 's' : ''} encontrado{registros.length !== 1 ? 's' : ''}
                  {registros.length === 500 ? ' (limite de 500 — refine o período)' : ''}
                </p>
              </div>
            )
          }
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Valida requisitos de senha — retorna mensagem de erro ou null se válida
function validarSenha(senha) {
  if (!senha || senha.length < 8)   return 'A senha deve ter no mínimo 8 caracteres';
  if (senha.length > 20)            return 'A senha deve ter no máximo 20 caracteres';
  if (!/[A-Z]/.test(senha))         return 'A senha deve conter pelo menos 1 letra maiúscula';
  if (!/[a-z]/.test(senha))         return 'A senha deve conter pelo menos 1 letra minúscula';
  if (!/[0-9]/.test(senha))         return 'A senha deve conter pelo menos 1 número';
  if (!/[^A-Za-z0-9]/.test(senha))  return 'A senha deve conter pelo menos 1 caractere especial';
  return null;
}

const DICA_SENHA = 'Entre 8 e 20 caracteres, com letra maiúscula, minúscula, número e caractere especial.';

// Modal para admin redefinir senha de um usuário
function ModalRedefinirSenha({ usuario, onFechar }) {
  const [senha, setSenha]       = useState('');
  const [confirma, setConfirma] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const errSenha = validarSenha(senha);
    if (errSenha) return toast.error(errSenha);
    if (senha !== confirma) return toast.error('As senhas não coincidem');
    setSalvando(true);
    try {
      await configuracaoAPI.redefinirSenhaAdmin(usuario.id, { senha });
      toast.success(`Senha de ${usuario.nome} redefinida com sucesso!`);
      onFechar();
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao redefinir senha');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3>Redefinir Senha</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ margin: '0 0 16px', color: '#555', fontSize: '14px' }}>
            Definindo nova senha para <strong>{usuario.nome}</strong> ({usuario.login}).
          </p>
          <div className="form-group">
            <label className="form-label">Nova senha *</label>
            <input type="password" className="form-control"
              value={senha} onChange={e => setSenha(e.target.value)}
              placeholder="Nova senha" autoFocus
              autoComplete="new-password" />
            <small style={{ color: '#777', fontSize: '12px' }}>{DICA_SENHA}</small>
          </div>
          <div className="form-group">
            <label className="form-label">Confirmar senha *</label>
            <input type="password" className="form-control"
              value={confirma} onChange={e => setConfirma(e.target.value)}
              placeholder="Repita a nova senha"
              autoComplete="new-password" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Redefinir Senha'}
          </button>
        </div>
      </div>
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
    if (form.senha) {
      const errSenha = validarSenha(form.senha);
      if (errSenha) return toast.error(errSenha);
    }
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
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>{usuario ? 'Editar Usuário' : 'Novo Usuário'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Nome completo *</label>
              <input className="form-control" value={form.nome||''} onChange={e => set('nome', e.target.value)} onBlur={() => set('nome', toTitleCase(form.nome))} />
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
                onChange={e => set('senha', e.target.value)} placeholder="Senha"
                autoComplete="new-password" />
              <small style={{ color: '#777', fontSize: '12px' }}>{DICA_SENHA}</small>
            </div>
          )}
          {usuario && (
            <div className="form-group">
              <label className="form-label">Nova senha (deixe em branco para não alterar)</label>
              <input type="password" className="form-control" value={form.senha||''}
                onChange={e => set('senha', e.target.value)} placeholder="Nova senha"
                autoComplete="new-password" />
              {form.senha && <small style={{ color: '#777', fontSize: '12px' }}>{DICA_SENHA}</small>}
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
  const [usuarios, setUsuarios]       = useState([]);
  const [usuarioId, setUsuarioId]     = useState('');
  const [permissoes, setPermissoes]   = useState({});
  const [salvando, setSalvando]       = useState(false);
  const [expandidos, setExpandidos]   = useState({}); // { processos: true/false }

  // Nível do usuário selecionado — admin (<=1) tem todos os checkboxes marcados e desabilitados
  const usuarioSelecionado = usuarios.find(u => String(u.id) === String(usuarioId));
  const ehAdmin            = usuarioSelecionado ? usuarioSelecionado.nivel <= 1 : false;

  function toggleExpandir(chave) {
    setExpandidos(e => ({ ...e, [chave]: !e[chave] }));
  }

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
        const dados = r.data.dados || {};
        // Garante que TODOS os módulos e sub-módulos têm entradas explícitas (false por padrão).
        // Sem isso, módulos nunca salvos ficam undefined e são omitidos no próximo save,
        // deixando o banco sem registro — o que torna o comportamento de permissão indefinido.
        const completo = {};
        MODULOS_PERM.forEach(modulo => {
          completo[modulo.chave] = {};
          ACOES_PERM.forEach(a => {
            completo[modulo.chave][a] = dados[modulo.chave]?.[a] ?? false;
          });
          (modulo.submodulos || []).forEach(sub => {
            completo[sub.chave] = {};
            ACOES_PERM.forEach(a => {
              completo[sub.chave][a] = dados[sub.chave]?.[a] ?? false;
            });
          });
        });
        setPermissoes(completo);
      }
    });
  }, [usuarioId]);

  // Alterna uma ação específica de uma chave (pode ser 'pessoas' ou 'processos.andamentos')
  function togglePerm(chave, acao) {
    setPermissoes(p => ({
      ...p,
      [chave]: { ...(p[chave] || {}), [acao]: !(p[chave]?.[acao]) }
    }));
  }

  // Marca/desmarca todas as ações de uma chave
  function toggleTodos(chave, ativo) {
    const acoes = {};
    ACOES_PERM.forEach(a => { acoes[a] = ativo; });
    setPermissoes(p => ({ ...p, [chave]: acoes }));
  }

  // Marca/desmarca o módulo pai E todos os seus sub-módulos
  function toggleModuloPai(modulo, ativo) {
    setPermissoes(p => {
      const novo = { ...p };
      // Marca o módulo pai
      const acoesPai = {};
      ACOES_PERM.forEach(a => { acoesPai[a] = ativo; });
      novo[modulo.chave] = acoesPai;
      // Marca todos os sub-módulos
      (modulo.submodulos || []).forEach(sub => {
        const acoesSub = {};
        ACOES_PERM.forEach(a => { acoesSub[a] = ativo; });
        novo[sub.chave] = acoesSub;
      });
      return novo;
    });
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
                  // Verifica se TODAS as ações do módulo pai + sub-módulos estão marcadas
                  const todasChaves   = [modulo, ...(modulo.submodulos || [])];
                  const todosMarcados = todasChaves.every(m =>
                    ACOES_PERM.every(a => permissoes[m.chave]?.[a])
                  );
                  return (
                    <React.Fragment key={modulo.chave}>
                      {/* Linha do módulo pai */}
                      <tr style={modulo.submodulos ? {backgroundColor:'#f0f4ff', cursor:'pointer'} : {}}
                          onClick={modulo.submodulos ? () => toggleExpandir(modulo.chave) : undefined}>
                        <td style={{fontWeight:600, userSelect:'none'}}>
                          {modulo.submodulos && (
                            <span style={{marginRight:'6px', fontSize:'11px', color:'#667'}}>
                              {expandidos[modulo.chave] ? '▼' : '▶'}
                            </span>
                          )}
                          {modulo.label}
                        </td>
                        {ACOES_PERM.map(acao => (
                          <td key={acao} style={{textAlign:'center'}}>
                            <input type="checkbox"
                              checked={ehAdmin ? true : !!permissoes[modulo.chave]?.[acao]}
                              disabled={ehAdmin}
                              onChange={() => !ehAdmin && togglePerm(modulo.chave, acao)}
                              style={ehAdmin ? {accentColor:'#94a3b8', cursor:'not-allowed'} : {}} />
                          </td>
                        ))}
                        <td style={{textAlign:'center'}}>
                          <input type="checkbox"
                            checked={ehAdmin ? true : todosMarcados}
                            disabled={ehAdmin}
                            onChange={e => !ehAdmin && toggleModuloPai(modulo, e.target.checked)}
                            title={ehAdmin ? 'Administradores têm acesso total' : 'Marcar/desmarcar todos (incluindo sub-itens)'}
                            style={ehAdmin ? {accentColor:'#94a3b8', cursor:'not-allowed'} : {}} />
                        </td>
                      </tr>
                      {/* Sub-módulos indentados — só aparecem quando expandido */}
                      {expandidos[modulo.chave] && (modulo.submodulos || []).map(sub => {
                        const subTodos = ACOES_PERM.every(a => permissoes[sub.chave]?.[a]);
                        return (
                          <tr key={sub.chave} style={{backgroundColor:'#fafafa'}}>
                            <td style={{paddingLeft:'28px', color:'#555', fontSize:'13px'}}>
                              ↳ {sub.label}
                            </td>
                            {ACOES_PERM.map(acao => (
                              <td key={acao} style={{textAlign:'center'}}>
                                <input type="checkbox"
                                  checked={ehAdmin ? true : !!permissoes[sub.chave]?.[acao]}
                                  disabled={ehAdmin}
                                  onChange={() => !ehAdmin && togglePerm(sub.chave, acao)}
                                  style={ehAdmin ? {accentColor:'#94a3b8', cursor:'not-allowed'} : {}} />
                              </td>
                            ))}
                            <td style={{textAlign:'center'}}>
                              <input type="checkbox"
                                checked={ehAdmin ? true : subTodos}
                                disabled={ehAdmin}
                                onChange={e => !ehAdmin && toggleTodos(sub.chave, e.target.checked)}
                                title={ehAdmin ? 'Administradores têm acesso total' : 'Marcar/desmarcar todos'}
                                style={ehAdmin ? {accentColor:'#94a3b8', cursor:'not-allowed'} : {}} />
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:'16px'}}>
            <button className="btn btn-primary" onClick={salvar}
              disabled={salvando || ehAdmin}
              title={ehAdmin ? 'Administradores têm acesso total — permissões não se aplicam' : ''}>
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
  const [confirmar, setConfirmar] = useState(null);
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

  function excluirFeriado(id) {
    setConfirmar({
      titulo: 'Excluir Feriado',
      mensagem: 'Este feriado será removido do calendário. O sistema recalculará os dias úteis automaticamente. Esta ação não pode ser desfeita.',
      textoBotao: '🗑️ Excluir',
      tipo: 'perigo',
      acao: async () => {
        await configuracaoAPI.excluirFeriado(id);
        toast.success('Feriado removido');
        carregar();
      },
    });
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
      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

// ============================================================
// ABA: INTEGRAÇÕES
// ============================================================
// URL oficial da API de Intimações da AASP — usada apenas como valor PADRÃO do campo
// (a URL efetiva é sempre a que estiver salva na configuração; nada fica fixo no backend).
const URL_PADRAO_AASP = 'https://intimacaoapi.aasp.org.br/api/Associado/intimacao/json';

function TabIntegracoes() {
  const [integracoes, setIntegracoes] = useState({});
  const [carregando, setCarregando]   = useState(true);
  const [salvando, setSalvando]       = useState('');

  useEffect(() => {
    configuracaoAPI.buscarIntegracoes().then(r => {
      if (r.data.ok) {
        const dados = r.data.dados || {};
        // Se já existe config AASP mas sem URL (config antiga), pré-preenche com a URL padrão
        // para o usuário só conferir e salvar — sem quebrar a busca.
        if (dados.aasp && !dados.aasp.url) dados.aasp = { ...dados.aasp, url: URL_PADRAO_AASP };
        setIntegracoes(dados);
      }
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
            <div className="form-group">
              <label className="form-label">URL da API AASP</label>
              <input className="form-control" value={aasp.url||''}
                onChange={e => setModulo('aasp','url', e.target.value)}
                placeholder={URL_PADRAO_AASP} />
              <small style={{ color: '#888' }}>
                Endereço da API de Intimações da AASP. Já vem preenchido com o padrão oficial —
                só altere se a AASP informar uma URL diferente.
              </small>
            </div>
            <div className="form-group">
              <label className="form-label">Chave de acesso AASP</label>
              <input className="form-control" value={aasp.chave||''}
                onChange={e => setModulo('aasp','chave', e.target.value)}
                placeholder="Chave única fornecida pela AASP" />
              <small style={{ color: '#888' }}>
                A chave é fornecida pela AASP (API de Intimações). As OABs monitoradas já estão vinculadas
                a essa chave na própria AASP — não precisa cadastrá-las aqui.
              </small>
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
