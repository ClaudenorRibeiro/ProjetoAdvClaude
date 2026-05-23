// ============================================================
// LAYOUT PRINCIPAL — Estrutura com sidebar + header + conteúdo
// Envolvido em todas as páginas autenticadas
// ============================================================

import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Layout.css';

// Itens do menu lateral
const MENU = [
  { path: '/dashboard',     label: 'Dashboard',       icone: '🏠', modulo: null },
  { path: '/pessoas',       label: 'Pessoas',          icone: '👥', modulo: 'pessoas' },
  { path: '/processos',     label: 'Processos',        icone: '📁', modulo: 'processos' },
  { path: '/prazos',        label: 'Prazos',           icone: '⏱️', modulo: 'prazos' },
  { path: '/tarefas',       label: 'Tarefas',          icone: '✅', modulo: 'tarefas' },
  { path: '/audiencias',    label: 'Audiências',       icone: '⚖️', modulo: 'audiencias' },
  { path: '/pericias',      label: 'Perícias',         icone: '🔬', modulo: 'pericias' },
  { path: '/financeiro',    label: 'Financeiro',       icone: '💰', modulo: 'financeiro' },
  { path: '/documentos',    label: 'Documentos',       icone: '📄', modulo: 'documentos' },
  { path: '/publicacoes',   label: 'Publicações',      icone: '📰', modulo: 'publicacoes' },
  { path: '/agenda',        label: 'Agenda',           icone: '📅', modulo: null },
  { path: '/relatorios',    label: 'Relatórios',       icone: '📊', modulo: 'relatorios' },
  { path: '/configuracoes', label: 'Configurações',    icone: '⚙️', modulo: null, apenasAdmin: true },
];

export default function Layout({ children }) {
  const { usuario, deslogar, temPermissao, ehAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarAberta, setSidebarAberta] = useState(true);

  function handleLogout() {
    deslogar();
    navigate('/login');
  }

  // Filtra o menu conforme permissões do usuário
  const menuFiltrado = MENU.filter(item => {
    if (item.apenasAdmin && !ehAdmin) return false;
    if (item.modulo && !temPermissao(item.modulo, 'visualizar') && !ehAdmin) return false;
    return true;
  });

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
          {menuFiltrado.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`menu-item ${location.pathname.startsWith(item.path) ? 'ativo' : ''}`}
              title={item.label}
            >
              <span className="menu-icone">{item.icone}</span>
              {sidebarAberta && <span className="menu-label">{item.label}</span>}
            </Link>
          ))}
        </nav>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <div className="main">
        {/* HEADER */}
        <header className="header">
          <div className="header-esquerda">
            <h2 className="pagina-titulo">
              {MENU.find(m => location.pathname.startsWith(m.path))?.label || 'Sistema'}
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
