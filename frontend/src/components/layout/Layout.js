// ============================================================
// LAYOUT PRINCIPAL — Estrutura com sidebar + header + conteúdo
// Suporta itens de menu simples e grupos expansíveis com sub-itens
// ============================================================

import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Layout.css';

// Itens do menu lateral.
// tipo: 'grupo' → item expansível com sub-itens (filhos[])
// apenasAdmin: true → só aparece para nível admin
// modulo: string → verifica permissão 'visualizar' do módulo
const MENU = [
  { path: '/dashboard',     label: 'Dashboard',    icone: '🏠', modulo: null },
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
    ],
  },
  { path: '/configuracoes', label: 'Configurações', icone: '⚙️', modulo: null, apenasAdmin: true },
];

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

  return (
    <div className={`layout ${sidebarAberta ? 'sidebar-aberta' : 'sidebar-fechada'}`}>

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-topo">
          <div className="logo">
            {sidebarAberta && <span className="logo-texto">Advocacia</span>}
            <button
              className="btn-toggle-sidebar"
              onClick={() => setSidebarAberta(!sidebarAberta)}
              title={sidebarAberta ? 'Recolher menu' : 'Expandir menu'}
            >
              {sidebarAberta ? '◀' : '▶'}
            </button>
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
            <h2 className="pagina-titulo">
              {getTituloAtual(location.pathname)}
            </h2>
          </div>
          <div className="header-direita">
            <span className="usuario-nome">👤 {usuario?.nome}</span>
            <button className="btn-logout" onClick={handleLogout}>Sair</button>
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
