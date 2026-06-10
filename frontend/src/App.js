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

// Rota protegida — redireciona para login se não estiver autenticado
function RotaProtegida({ children }) {
  const { usuario, carregando } = useAuth();

  if (carregando) {
    return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}>Carregando...</div>;
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
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

      {/* Rotas protegidas */}
      <Route path="/dashboard"     element={<RotaProtegida><Dashboard /></RotaProtegida>} />
      <Route path="/pessoas/*"     element={<RotaProtegida><Pessoas /></RotaProtegida>} />
      <Route path="/processos"              element={<RotaProtegida><Processos /></RotaProtegida>} />
      <Route path="/processos/pasta/:id"    element={<RotaProtegida><PastaDetalhe /></RotaProtegida>} />
      <Route path="/prazos/*"      element={<RotaProtegida><Prazos /></RotaProtegida>} />
      <Route path="/tarefas/*"     element={<RotaProtegida><Tarefas /></RotaProtegida>} />
      <Route path="/audiencias/*"  element={<RotaProtegida><Audiencias /></RotaProtegida>} />
      <Route path="/pericias/*"    element={<RotaProtegida><Pericias /></RotaProtegida>} />
      <Route path="/financeiro/*"  element={<RotaProtegida><Financeiro /></RotaProtegida>} />
      <Route path="/documentos/*"  element={<RotaProtegida><Documentos /></RotaProtegida>} />
      <Route path="/publicacoes/*" element={<RotaProtegida><Publicacoes /></RotaProtegida>} />
      <Route path="/agenda/*"      element={<RotaProtegida><Agenda /></RotaProtegida>} />
      <Route path="/relatorios/*"  element={<RotaProtegida><Relatorios /></RotaProtegida>} />
      <Route path="/configuracoes/*"   element={<RotaProtegida><Configuracoes /></RotaProtegida>} />
      <Route path="/controle/foruns"  element={<RotaProtegida><Foruns /></RotaProtegida>} />
      <Route path="/controle/varas"   element={<RotaProtegida><Varas /></RotaProtegida>} />

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
