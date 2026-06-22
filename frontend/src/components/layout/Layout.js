// ============================================================
// LAYOUT PRINCIPAL — Estrutura com sidebar + header + conteúdo
// Suporta itens de menu simples e grupos expansíveis com sub-itens
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { notificacoesAPI, authAPI } from '../../services/api';
import { toast } from 'react-toastify';
import './Layout.css';

// Itens do menu lateral.
// tipo: 'grupo' → item expansível com sub-itens (filhos[])
// apenasAdmin: true → só aparece para nível admin
// modulo: string → verifica permissão 'visualizar' do módulo
const MENU = [
  { path: '/pessoas',       label: 'Pessoas',       icone: '👥', modulo: 'pessoas' },
  { path: '/processos',     label: 'Processos',     icone: '📁', modulo: 'processos' },
  { path: '/prazos',        label: 'Prazos',        icone: '⏱️', modulo: 'prazos' },
  { path: '/tarefas',       label: 'Tarefas',       icone: '✅', modulo: 'tarefas' },
  { path: '/audiencias',    label: 'Audiências',    icone: '⚖️', modulo: 'audiencias' },
  { path: '/pericias',      label: 'Perícias',      icone: '🔬', modulo: 'pericias' },
  { path: '/financeiro',    label: 'Financeiro',    icone: '💰', modulo: 'financeiro' },
  { path: '/documentos',    label: 'Documentos',    icone: '📄', modulo: 'documentos' },
  { path: '/publicacoes',   label: 'Publicações',   icone: '📰', modulo: 'publicacoes' },
  { path: '/agenda',        label: 'Agenda',        icone: '📅', modulo: null },
  { path: '/relatorios',    label: 'Relatórios',    icone: '📊', modulo: 'relatorios' },
  {
    tipo: 'grupo', id: 'controle', label: 'Controle', icone: '🗂️', apenasAdmin: true,
    filhos: [
      { path: '/controle/foruns', label: 'Fóruns', icone: '🏛️' },
      { path: '/controle/varas',  label: 'Varas',  icone: '🏢' },
      { path: '/controle/formas-pagamento', label: 'Formas de pagamento', icone: '💳' },
    ],
  },
  { path: '/configuracoes', label: 'Configurações', icone: '⚙️', modulo: null, apenasAdmin: true },
];

// Retorna saudação conforme horário atual
function saudacao() {
  const hora = new Date().getHours();
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

// Retorna o título da página atual, incluindo sub-itens de grupos
function getTituloAtual(pathname) {
  for (const item of MENU) {
    if (item.tipo === 'grupo') {
      const filho = item.filhos.find(f => pathname.startsWith(f.path));
      if (filho) return filho.label;
    } else {
      if (pathname.startsWith(item.path) && item.path !== '/') return item.label;
    }
  }
  return 'Sistema';
}

export default function Layout({ children }) {
  const { usuario, deslogar, temPermissao, ehAdmin } = useAuth();
  const location  = useLocation();
  const navigate  = useNavigate();
  const [sidebarAberta, setSidebarAberta] = useState(true);
  // Sidebar no celular: vira menu off-canvas (escondido por padrão, abre pelo hambúrguer)
  const [sidebarMobile, setSidebarMobile] = useState(false);
  const [qtdNotif, setQtdNotif]   = useState(0);
  const [notifs, setNotifs]       = useState([]);
  const [sinoAberto, setSinoAberto]       = useState(false);
  const [menuUsuario, setMenuUsuario]     = useState(false);
  const [modalSenha, setModalSenha]       = useState(false);
  const sinoRef    = useRef(null);
  const usuarioRef = useRef(null);

  // Busca contagem ao montar e a cada 2 minutos
  useEffect(() => {
    buscarContagem();
    const intervalo = setInterval(buscarContagem, 120000);
    return () => clearInterval(intervalo);
  }, []);

  // Celular: fecha o menu off-canvas automaticamente ao navegar para outra página
  useEffect(() => {
    setSidebarMobile(false);
  }, [location.pathname]);

  // Fecha painéis ao clicar fora
  useEffect(() => {
    function fecharFora(e) {
      if (sinoRef.current && !sinoRef.current.contains(e.target)) setSinoAberto(false);
      if (usuarioRef.current && !usuarioRef.current.contains(e.target)) setMenuUsuario(false);
    }
    document.addEventListener('mousedown', fecharFora);
    return () => document.removeEventListener('mousedown', fecharFora);
  }, []);

  async function buscarContagem() {
    try {
      const { data } = await notificacoesAPI.contagem();
      if (data.ok) setQtdNotif(data.dados.total);
    } catch {}
  }

  async function abrirSino() {
    setSinoAberto(v => !v);
    if (!sinoAberto) {
      try {
        const { data } = await notificacoesAPI.listar();
        if (data.ok) setNotifs(data.dados);
      } catch {}
    }
  }

  async function marcarLidas() {
    try {
      await notificacoesAPI.marcarLidas();
      setQtdNotif(0); setNotifs([]); setSinoAberto(false);
    } catch {}
  }

  // Grupos expansíveis — inicia aberto se algum filho estiver na rota atual
  const [gruposAbertos, setGruposAbertos] = useState(() => {
    const abertos = {};
    MENU.forEach(item => {
      if (item.tipo === 'grupo') {
        abertos[item.id] = item.filhos.some(f =>
          window.location.pathname.startsWith(f.path)
        );
      }
    });
    return abertos;
  });

  function toggleGrupo(id) {
    if (!sidebarAberta) {
      // Sidebar fechada: abre a sidebar e o grupo ao mesmo tempo
      setSidebarAberta(true);
      setGruposAbertos(prev => ({ ...prev, [id]: true }));
    } else {
      setGruposAbertos(prev => ({ ...prev, [id]: !prev[id] }));
    }
  }

  function handleLogout() {
    deslogar();
    navigate('/login');
  }

  // Decide se o item deve aparecer no menu

  function deveExibir(item) {
    if (item.apenasAdmin && !ehAdmin) return false;
    if (item.modulo && !temPermissao(item.modulo, 'visualizar') && !ehAdmin) return false;
    return true;
  }

  // Abre o menu no celular — garante a sidebar expandida para os rótulos aparecerem
  function abrirMenuMobile() {
    setSidebarAberta(true);
    setSidebarMobile(true);
  }

  return (
    <div className={`layout ${sidebarAberta ? 'sidebar-aberta' : 'sidebar-fechada'} ${sidebarMobile ? 'sidebar-mobile-aberta' : ''}`}>

      {/* Fundo escurecido atrás do menu no celular — clicar fora fecha */}
      <div className="sidebar-backdrop" onClick={() => setSidebarMobile(false)} />

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-topo">
          <div className="logo">
            <button
              className="btn-toggle-sidebar"
              onClick={() => setSidebarAberta(!sidebarAberta)}
              title={sidebarAberta ? 'Recolher menu' : 'Expandir menu'}
            >
              {sidebarAberta ? '◀' : '▶'}
            </button>
            <Link to="/dashboard" title="Ir para o Dashboard">
              <img
                src="/logo.png"
                alt="Logo do escritório"
                className="logo-img"
              />
            </Link>
          </div>
        </div>

        <nav className="menu">
          {MENU.filter(deveExibir).map(item => {

            // ---- GRUPO COM SUB-ITENS ----
            if (item.tipo === 'grupo') {
              const aberto     = gruposAbertos[item.id];
              const filhoAtivo = item.filhos.some(f => location.pathname.startsWith(f.path));
              return (
                <div key={item.id} className="menu-grupo">
                  <button
                    className={`menu-grupo-header ${filhoAtivo ? 'ativo' : ''}`}
                    onClick={() => toggleGrupo(item.id)}
                    title={item.label}
                  >
                    <span className="menu-icone">{item.icone}</span>
                    {sidebarAberta && (
                      <>
                        <span className="menu-label">{item.label}</span>
                        <span className={`menu-grupo-chevron ${aberto ? 'aberto' : ''}`}>▶</span>
                      </>
                    )}
                  </button>

                  {/* Sub-itens — só visíveis com sidebar aberta e grupo expandido */}
                  {sidebarAberta && aberto && (
                    <div className="menu-subgrupo">
                      {item.filhos.map(filho => (
                        <Link
                          key={filho.path}
                          to={filho.path}
                          className={`menu-subitem ${location.pathname.startsWith(filho.path) ? 'ativo' : ''}`}
                          title={filho.label}
                        >
                          <span className="menu-icone">{filho.icone}</span>
                          <span className="menu-label">{filho.label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            // ---- ITEM NORMAL ----
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`menu-item ${location.pathname.startsWith(item.path) && item.path !== '/' ? 'ativo' : ''}`}
                title={item.label}
              >
                <span className="menu-icone">{item.icone}</span>
                {sidebarAberta && <span className="menu-label">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <div className="main">
        {/* HEADER */}
        <header className="header">
          <div className="header-esquerda">
            {/* Hambúrguer — só aparece em telas pequenas (controlado pelo CSS) */}
            <button className="btn-hamburger" onClick={abrirMenuMobile} title="Abrir menu">
              ☰
            </button>
            <h2 className="pagina-titulo">
              {location.pathname.startsWith('/dashboard')
                ? `${saudacao()}, ${usuario?.nome?.split(' ')[0]}! 👋`
                : getTituloAtual(location.pathname)
              }
            </h2>
          </div>
          <div className="header-direita">
            {/* Sino de notificações */}
            <div ref={sinoRef} style={{position:'relative'}}>
              <button onClick={abrirSino} title="Notificações"
                style={{position:'relative',background:'none',border:'none',cursor:'pointer',fontSize:'20px',padding:'4px 8px'}}>
                🔔
                {qtdNotif > 0 && (
                  <span style={{
                    position:'absolute',top:'-2px',right:'-2px',
                    background:'#ef4444',color:'#fff',borderRadius:'50%',
                    fontSize:'11px',fontWeight:'bold',
                    minWidth:'18px',height:'18px',lineHeight:'18px',
                    textAlign:'center',padding:'0 3px'
                  }}>{qtdNotif > 99 ? '99+' : qtdNotif}</span>
                )}
              </button>
              {sinoAberto && (
                <div style={{
                  position:'absolute',right:0,top:'110%',width:'340px',
                  maxWidth:'calc(100vw - 24px)', // celular: nunca passa da largura da tela
                  background:'#fff',border:'1px solid #e5e7eb',borderRadius:'8px',
                  boxShadow:'0 8px 24px rgba(0,0,0,0.15)',zIndex:1000
                }}>
                  <div style={{padding:'12px 16px',borderBottom:'1px solid #e5e7eb',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <strong style={{fontSize:'14px'}}>Notificações</strong>
                    {qtdNotif > 0 && (
                      <button onClick={marcarLidas}
                        style={{background:'none',border:'none',color:'#3b82f6',cursor:'pointer',fontSize:'12px'}}>
                        Marcar todas como lidas
                      </button>
                    )}
                  </div>
                  <div style={{maxHeight:'320px',overflowY:'auto'}}>
                    {notifs.length === 0
                      ? <p style={{padding:'20px',textAlign:'center',color:'#9ca3af',fontSize:'13px'}}>Nenhuma notificação nova</p>
                      : notifs.map(n => (
                        <div key={n.id} style={{padding:'12px 16px',borderBottom:'1px solid #f3f4f6',fontSize:'13px'}}>
                          <div style={{color:'#111'}}>{n.mensagem}</div>
                          <div style={{color:'#9ca3af',fontSize:'11px',marginTop:'4px'}}>
                            {new Date(n.criado_em).toLocaleString('pt-BR')}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
            {/* Menu do usuário — clica no nome para abrir dropdown */}
            <div ref={usuarioRef} style={{position:'relative'}}>
              <button onClick={() => setMenuUsuario(v => !v)}
                style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:'6px',
                        fontSize:'14px',color:'#1e2a3a',padding:'4px 8px',borderRadius:'6px',
                        transition:'background 0.15s'}}
                onMouseEnter={e => e.currentTarget.style.background='#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.background='none'}>
                <span>👤</span>
                <span className="usuario-nome-header" style={{fontWeight:500}}>{usuario?.nome}</span>
                <span style={{fontSize:'10px',color:'#94a3b8'}}>{menuUsuario ? '▲' : '▼'}</span>
              </button>
              {menuUsuario && (
                <div style={{
                  position:'absolute',right:0,top:'110%',minWidth:'180px',
                  background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px',
                  boxShadow:'0 8px 24px rgba(0,0,0,0.12)',zIndex:1000,overflow:'hidden'
                }}>
                  <button onClick={() => { setMenuUsuario(false); setModalSenha(true); }}
                    style={{width:'100%',display:'flex',alignItems:'center',gap:'10px',
                            padding:'11px 16px',background:'none',border:'none',cursor:'pointer',
                            fontSize:'13px',color:'#374151',textAlign:'left',
                            borderBottom:'1px solid #f1f5f9'}}
                    onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background='none'}>
                    🔑 Trocar senha
                  </button>
                  <button onClick={() => { setMenuUsuario(false); handleLogout(); }}
                    style={{width:'100%',display:'flex',alignItems:'center',gap:'10px',
                            padding:'11px 16px',background:'none',border:'none',cursor:'pointer',
                            fontSize:'13px',color:'#dc2626',textAlign:'left'}}
                    onMouseEnter={e => e.currentTarget.style.background='#fef2f2'}
                    onMouseLeave={e => e.currentTarget.style.background='none'}>
                    🚪 Sair
                  </button>
                </div>
              )}
            </div>
            {modalSenha && <ModalTrocarSenha onFechar={() => setModalSenha(false)} />}
          </div>
        </header>

        {/* CONTEÚDO DA PÁGINA */}
        <main className="conteudo">
          {children}
        </main>
      </div>
    </div>
  );
}

// ============================================================
// Modal de troca de senha — usuário altera a própria senha
// ============================================================
function ModalTrocarSenha({ onFechar }) {
  const [form, setForm]         = useState({ senha_atual: '', nova_senha: '', confirmar_senha: '' });
  const [salvando, setSalvando] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function salvar() {
    if (!form.senha_atual || !form.nova_senha || !form.confirmar_senha) {
      return toast.error('Preencha todos os campos');
    }
    if (form.nova_senha.length < 6) {
      return toast.error('A nova senha deve ter no mínimo 6 caracteres');
    }
    if (form.nova_senha !== form.confirmar_senha) {
      return toast.error('A nova senha e a confirmação não coincidem');
    }
    setSalvando(true);
    try {
      await authAPI.trocarSenha(form);
      toast.success('Senha alterada com sucesso!');
      onFechar();
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao alterar senha');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3>🔑 Trocar Senha</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Senha atual *</label>
            <input type="password" className="form-control" autoFocus
              value={form.senha_atual} onChange={e => set('senha_atual', e.target.value)}
              placeholder="Digite sua senha atual" autoComplete="current-password" />
          </div>
          <div className="form-group">
            <label className="form-label">Nova senha *</label>
            <input type="password" className="form-control"
              value={form.nova_senha} onChange={e => set('nova_senha', e.target.value)}
              placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
          </div>
          <div className="form-group">
            <label className="form-label">Confirmar nova senha *</label>
            <input type="password" className="form-control"
              value={form.confirmar_senha} onChange={e => set('confirmar_senha', e.target.value)}
              placeholder="Repita a nova senha" autoComplete="new-password" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Alterar Senha'}
          </button>
        </div>
      </div>
    </div>
  );
}
