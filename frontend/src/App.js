// ============================================================
// APLICAÇÃO PRINCIPAL — Roteamento e proteção de rotas
// ============================================================

import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import { authAPI } from './services/api';

// Páginas
import Login         from './pages/Login/Login';
import ResetSenha    from './pages/ResetSenha/ResetSenha';

// Carregamento sob demanda COM proteção contra "pedaço obsoleto após deploy".
// Se o navegador estiver com um index.html novo mas pedir um pedaço antigo que já
// não existe (deploy no meio do uso), a importação falha. Nesse caso recarregamos
// a página UMA vez para pegar os arquivos novos. A trava por tempo (10s) impede
// qualquer loop de recarregamento caso a falha seja real (não apenas obsolescência).
function lazyComRetry(importar) {
  return lazy(() =>
    importar().catch((erro) => {
      const agora = Date.now();
      const ultimoReload = Number(sessionStorage.getItem('chunk-reload-ts') || 0);
      if (agora - ultimoReload > 10000) {
        sessionStorage.setItem('chunk-reload-ts', String(agora));
        window.location.reload();
        return new Promise(() => {}); // segura até a página recarregar
      }
      throw erro; // já recarregou há pouco e ainda falha → deixa a rede de segurança agir
    })
  );
}

// --- Telas carregadas SOB DEMANDA (code-splitting) ---
// Cada uma vira um "pedaço" (chunk) separado, baixado só quando a pessoa entra
// na tela — não pesa no primeiro carregamento. Fase 1: as telas mais isoladas.
const Relatorios      = lazyComRetry(() => import('./pages/Relatorios/Relatorios'));
const Foruns          = lazyComRetry(() => import('./pages/Controle/Foruns'));
const Varas           = lazyComRetry(() => import('./pages/Controle/Varas'));
const Auxiliares      = lazyComRetry(() => import('./pages/Controle/Auxiliares'));
const FormasPagamento = lazyComRetry(() => import('./pages/Controle/FormasPagamento'));
// Fase 2: telas pesadas e independentes.
const Audiencias      = lazyComRetry(() => import('./pages/Audiencias/Audiencias'));
const Pericias        = lazyComRetry(() => import('./pages/Pericias/Pericias'));
const Financeiro      = lazyComRetry(() => import('./pages/Financeiro/Financeiro'));
const Documentos      = lazyComRetry(() => import('./pages/Documentos/Documentos'));
// Fase 3: Pessoas (exporta modais reusados) + Configurações.
const Pessoas         = lazyComRetry(() => import('./pages/Pessoas/Pessoas'));
const Configuracoes   = lazyComRetry(() => import('./pages/Configuracoes/Configuracoes'));
// Fase 4: Processos + PastaDetalhe (importam Pessoas/Audiências/Perícias/Financeiro)
// + Publicações. Ao virarem sob demanda, o cluster reusado sai do bundle principal.
const Processos       = lazyComRetry(() => import('./pages/Processos/Processos'));
const PastaDetalhe    = lazyComRetry(() => import('./pages/Processos/PastaDetalhe'));
const Publicacoes     = lazyComRetry(() => import('./pages/Publicacoes/Publicacoes'));
// Fase 5: Prazos e Tarefas (exportam modais reusados pela PastaDetalhe) + Agenda
// (traz o calendário pesado) + Dashboard.
const Dashboard       = lazyComRetry(() => import('./pages/Dashboard/Dashboard'));
const Prazos          = lazyComRetry(() => import('./pages/Prazos/Prazos'));
const Tarefas         = lazyComRetry(() => import('./pages/Tarefas/Tarefas'));
const Agenda          = lazyComRetry(() => import('./pages/Agenda/Agenda'));

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

// Tela de carregamento exibida enquanto um "pedaço" (chunk) é baixado sob demanda.
// Mesmo visual do "Carregando..." usado na checagem de login (RotaProtegida).
function CarregandoTela() {
  return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh'}}>Carregando...</div>;
}

// Rede de segurança: se uma tela sob demanda falhar ao carregar mesmo após o
// recarregamento automático (lazyComRetry), em vez de tela branca mostramos uma
// faixa amigável dentro da própria tela, com um botão para atualizar a página.
class ErroAoCarregarTela extends React.Component {
  constructor(props) {
    super(props);
    this.state = { falhou: false };
  }
  static getDerivedStateFromError() {
    return { falhou: true };
  }
  render() {
    if (this.state.falhou) {
      return (
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',padding:'20px'}}>
          <div style={{maxWidth:420,background:'#fff4e5',border:'1px solid #ffcf99',color:'#8a5300',padding:'16px 18px',borderRadius:8,textAlign:'center'}}>
            <div style={{fontSize:14,marginBottom:12}}>
              Não foi possível carregar esta tela. Isso costuma acontecer após uma atualização do sistema. Clique em Atualizar para recarregar.
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{background:'#8a5300',color:'#fff',border:'none',padding:'8px 16px',borderRadius:6,fontSize:13,cursor:'pointer'}}
            >
              Atualizar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppRoutes() {
  return (
    // ErroAoCarregarTela (rede de segurança) por fora; Suspense captura o
    // carregamento das telas sob demanda (React.lazy) e mostra o "Carregando..."
    // por frações de segundo até o pedaço daquela tela chegar.
    <ErroAoCarregarTela>
    <Suspense fallback={<CarregandoTela />}>
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
      <Route path="/controle/auxiliares" element={<RotaProtegida apenasAdmin><Auxiliares /></RotaProtegida>} />
      <Route path="/controle/formas-pagamento" element={<RotaProtegida apenasAdmin><FormasPagamento /></RotaProtegida>} />

      {/* Redireciona raiz para dashboard */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </Suspense>
    </ErroAoCarregarTela>
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
