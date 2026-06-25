// ============================================================
// APLICAÇÃO PRINCIPAL — Roteamento e proteção de rotas
// ============================================================

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import { authAPI } from './services/api';

// Páginas
import Login         from './pages/Login/Login';
import ResetSenha    from './pages/ResetSenha/ResetSenha';
import Dashboard     from './pages/Dashboard/Dashboard';
import Pessoas       from './pages/Pessoas/Pessoas';
import Processos     from './pages/Processos/Processos';
import PastaDetalhe  from './pages/Processos/PastaDetalhe';
import Prazos        from './pages/Prazos/Prazos';
import Tarefas       from './pages/Tarefas/Tarefas';
import Audiencias    from './pages/Audiencias/Audiencias';
import Pericias      from './pages/Pericias/Pericias';
import Financeiro    from './pages/Financeiro/Financeiro';
import Documentos    from './pages/Documentos/Documentos';
import Publicacoes   from './pages/Publicacoes/Publicacoes';
import Agenda        from './pages/Agenda/Agenda';
import Relatorios    from './pages/Relatorios/Relatorios';
import Configuracoes from './pages/Configuracoes/Configuracoes';
import Foruns        from './pages/Controle/Foruns';
import Varas         from './pages/Controle/Varas';
import FormasPagamento from './pages/Controle/FormasPagamento';

// Rota protegida — exige login E (quando aplicável) permissão do módulo ou perfil admin.
// Sem login → vai para /login. Logado mas sem acesso àquela tela → volta ao painel
// (/dashboard, que todos veem). Espelha o menu lateral, que já esconde o que o usuário não pode usar.
// Obs.: o backend continua sendo o guardião real dos dados; isto é defesa em profundidade na navegação.
function RotaProtegida({ children, modulo = null, apenasAdmin = false }) {
  const { usuario, carregando, temPermissao, ehAdmin } = useAuth();

  if (carregando) {
    return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}>Carregando...</div>;
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  // Tela só de admin e usuário não é admin → sem acesso, volta ao painel
  if (apenasAdmin && !ehAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  // Tela de um módulo e usuário sem permissão de visualizar → sem acesso
  // (temPermissao já libera admin/super automaticamente)
  if (modulo && !temPermissao(modulo, 'visualizar')) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Layout>{children}</Layout>;
}

// Rota pública — redireciona para dashboard se já estiver logado
function RotaPublica({ children }) {
  const { usuario, carregando } = useAuth();
  if (carregando) return null;
  if (usuario) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Rotas públicas */}
      <Route path="/login"           element={<RotaPublica><Login /></RotaPublica>} />
      <Route path="/redefinir-senha" element={<ResetSenha />} />

      {/* Rotas protegidas — modulo/apenasAdmin espelham o menu lateral (Layout) */}
      <Route path="/dashboard"     element={<RotaProtegida><Dashboard /></RotaProtegida>} />
      <Route path="/pessoas/*"     element={<RotaProtegida modulo="pessoas"><Pessoas /></RotaProtegida>} />
      <Route path="/processos"              element={<RotaProtegida modulo="processos"><Processos /></RotaProtegida>} />
      <Route path="/processos/pasta/:id"    element={<RotaProtegida modulo="processos"><PastaDetalhe /></RotaProtegida>} />
      <Route path="/prazos/*"      element={<RotaProtegida modulo="prazos"><Prazos /></RotaProtegida>} />
      <Route path="/tarefas/*"     element={<RotaProtegida modulo="tarefas"><Tarefas /></RotaProtegida>} />
      <Route path="/audiencias/*"  element={<RotaProtegida modulo="audiencias"><Audiencias /></RotaProtegida>} />
      <Route path="/pericias/*"    element={<RotaProtegida modulo="pericias"><Pericias /></RotaProtegida>} />
      <Route path="/financeiro/*"  element={<RotaProtegida modulo="financeiro"><Financeiro /></RotaProtegida>} />
      <Route path="/documentos/*"  element={<RotaProtegida modulo="documentos"><Documentos /></RotaProtegida>} />
      <Route path="/publicacoes/*" element={<RotaProtegida modulo="publicacoes"><Publicacoes /></RotaProtegida>} />
      <Route path="/agenda/*"      element={<RotaProtegida><Agenda /></RotaProtegida>} />
      <Route path="/relatorios/*"  element={<RotaProtegida modulo="relatorios"><Relatorios /></RotaProtegida>} />
      <Route path="/configuracoes/*"   element={<RotaProtegida apenasAdmin><Configuracoes /></RotaProtegida>} />
      <Route path="/controle/foruns"  element={<RotaProtegida apenasAdmin><Foruns /></RotaProtegida>} />
      <Route path="/controle/varas"   element={<RotaProtegida apenasAdmin><Varas /></RotaProtegida>} />
      <Route path="/controle/formas-pagamento" element={<RotaProtegida apenasAdmin><FormasPagamento /></RotaProtegida>} />

      {/* Redireciona raiz para dashboard */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  // Define o título da aba do navegador com base nas configurações do escritório.
  // Busca via endpoint público (/api/public/info) — sem necessidade de login.
  // Fallback: "Sistema de Advocacia" caso o campo esteja vazio ou a requisição falhe.
  useEffect(() => {
    authAPI.infoPublica().then(r => {
      if (r.data.ok) {
        const { titulo_aba, nome } = r.data.dados;
        document.title = titulo_aba?.trim() || nome?.trim() || 'Sistema de Advocacia';
      }
    }).catch(() => {
      // Silencia erros — título padrão já está no index.html
    });
  }, []);

  // Desativa o autocomplete do navegador em todos os inputs do sistema.
  // O MutationObserver monitora inputs adicionados dinamicamente (modais, etc.)
  // e aplica autoComplete="off" assim que aparecem no DOM.
  useEffect(() => {
    function desativarAutocomplete(root) {
      root.querySelectorAll('input, textarea').forEach(el => {
        // "new-password" é o único valor que Chrome respeita de forma confiável.
        // Para inputs de senha (type=password) mantém o comportamento padrão.
        if (el.type !== 'password') {
          el.setAttribute('autocomplete', 'new-password');
        }
        el.setAttribute('autocorrect', 'off');
        el.setAttribute('autocapitalize', 'off');
        el.setAttribute('spellcheck', 'false');
      });
    }

    // Aplica nos elementos já existentes
    desativarAutocomplete(document);

    // Observa novas inserções no DOM (modais, dropdowns, etc.)
    const observer = new MutationObserver(mutations => {
      mutations.forEach(({ addedNodes }) => {
        addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            desativarAutocomplete(node);
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        {/* Sistema de notificações (toasts) */}
        <ToastContainer
          position="top-right"
          autoClose={4000}
          hideProgressBar={false}
          closeOnClick
          pauseOnHover
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
