// ============================================================
// CONTEXTO DE AUTENTICAÇÃO
// Disponibiliza dados do usuário logado para toda a aplicação
// ============================================================

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario]       = useState(null);
  const [permissoes, setPermissoes] = useState({});
  const [carregando, setCarregando] = useState(true); // Verificando token inicial
  const [tempoInatividade, setTempoInatividade] = useState(15); // minutos até o logout automático (mín. 15)

  // Ao montar a aplicação:
  // 1) Se ESTA guia já tem token no sessionStorage, valida no backend (como sempre foi).
  // 2) Se NÃO tem, antes de cair no login ela PERGUNTA às guias vizinhas do mesmo navegador
  //    (via BroadcastChannel) se alguma está logada e adota o login na hora — assim uma guia
  //    aberta a partir de uma tela logada não pede senha de novo.
  // Como o token continua no sessionStorage (por guia), o "deslogar ao fechar o navegador"
  // segue valendo: fechou tudo → nenhuma vizinha responde → a próxima abertura pede login.
  useEffect(() => {
    const canal = 'BroadcastChannel' in window ? new BroadcastChannel('auth-sessao') : null;
    let respondido = false;   // esta guia já adotou um login vindo de vizinha?
    let prazo;                // timer da espera pela resposta

    if (canal) {
      canal.onmessage = (ev) => {
        const msg = ev.data || {};
        // Uma vizinha pediu o login e ESTA guia tem → envia (mesma origem, mesmo navegador).
        if (msg.tipo === 'PEDIR_TOKEN') {
          const token = sessionStorage.getItem('token');
          if (token) canal.postMessage({ tipo: 'TOKEN', token, usuario: sessionStorage.getItem('usuario') });
          return;
        }
        // Recebeu o login de uma vizinha — só interessa se esta guia ainda não tinha.
        if (msg.tipo === 'TOKEN' && msg.token && !respondido && !sessionStorage.getItem('token')) {
          respondido = true;
          clearTimeout(prazo);
          sessionStorage.setItem('token', msg.token);
          if (msg.usuario) sessionStorage.setItem('usuario', msg.usuario);
          verificarToken();
        }
      };
    }

    const tokenSalvo = sessionStorage.getItem('token');
    if (tokenSalvo) {
      verificarToken();
    } else if (canal) {
      // Sem login nesta guia: pergunta às vizinhas antes de decidir mostrar o login.
      canal.postMessage({ tipo: 'PEDIR_TOKEN' });
      prazo = setTimeout(() => { if (!respondido) setCarregando(false); }, 400);
    } else {
      setCarregando(false);
    }

    return () => { clearTimeout(prazo); canal?.close(); };
  }, []);

  // Verifica se o token ainda é válido no backend
  async function verificarToken() {
    try {
      const { data } = await authAPI.verificar();
      if (data.ok) {
        setUsuario(data.dados.usuario);
        setPermissoes(data.dados.permissoes || {});
        if (data.dados.tempo_inatividade_min) setTempoInatividade(data.dados.tempo_inatividade_min);
      } else {
        deslogar();
      }
    } catch {
      deslogar();
    } finally {
      setCarregando(false);
    }
  }

  // Realiza o login e salva os dados na memória e no sessionStorage
  async function logar(login, senha) {
    // Identidade do navegador (localStorage: compartilhada por todas as abas, sobrevive ao fechar).
    // Enviamos a atual para o servidor decidir se mantém a sessão (mesmo navegador) ou troca (outro).
    const dispositivo = localStorage.getItem('deviceSessao') || null;
    const { data } = await authAPI.login({ login, senha, sessao: dispositivo });
    if (data.ok) {
      if (data.dados.sessao) localStorage.setItem('deviceSessao', data.dados.sessao);
      sessionStorage.setItem('token', data.dados.token);
      sessionStorage.setItem('usuario', JSON.stringify(data.dados.usuario));
      setUsuario(data.dados.usuario);
      setPermissoes(data.dados.permissoes || {});
      if (data.dados.tempo_inatividade_min) setTempoInatividade(data.dados.tempo_inatividade_min);
    }
    return data;
  }

  // Limpa tudo e redireciona para login.
  // Limpamos o token IMEDIATAMENTE (como sempre foi) — assim, se o usuário logar de novo logo em
  // seguida, não há risco de uma chamada de logout atrasada apagar o token NOVO (corrida).
  // Só nos logouts DELIBERADOS (manual ou por inatividade) registramos o evento no backend: guardamos
  // o token ANTES de limpar e o enviamos explícito no cabeçalho (fire-and-forget, nunca trava a saída).
  // Sem motivo (ex.: token inválido na abertura do app), apenas limpa, sem logar (evita 401 à toa).
  function deslogar(motivo) {
    const token = sessionStorage.getItem('token');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('usuario');
    setUsuario(null);
    setPermissoes({});
    if (motivo && token) {
      authAPI.logout({ motivo }, token).catch(() => {});
    }
  }

  // Logout automático por INATIVIDADE.
  // Só vigia enquanto há usuário logado. A cada atividade (mouse, teclado, clique,
  // rolagem, toque) o cronômetro reinicia; se passar o tempo configurado pelo
  // escritório (mínimo 15 min) sem nenhuma atividade, desloga direto (sem aviso).
  // Ao sair (logout/troca), remove os "ouvintes" — sem nada pendurado em memória.
  useEffect(() => {
    if (!usuario) return; // fora do ar quando não logado
    const limiteMs = Math.max(15, Number(tempoInatividade) || 15) * 60 * 1000;
    let timer;
    const reiniciar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { deslogar('inatividade'); }, limiteMs);
    };
    const eventos = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    eventos.forEach(ev => window.addEventListener(ev, reiniciar, { passive: true }));
    reiniciar(); // arma o cronômetro ao logar
    return () => {
      clearTimeout(timer);
      eventos.forEach(ev => window.removeEventListener(ev, reiniciar));
    };
  }, [usuario, tempoInatividade]);

  // Atualiza as cores da Agenda do usuário logado (após salvar no "Aparência"),
  // refletindo na hora sem recarregar. Mantém o sessionStorage sincronizado.
  function atualizarCoresAgenda(cores) {
    setUsuario(u => {
      if (!u) return u;
      const novo = { ...u, cores_agenda: cores || null };
      sessionStorage.setItem('usuario', JSON.stringify(novo));
      return novo;
    });
  }

  // Atualiza as cores do menu lateral do usuário logado (após salvar no "Aparência"),
  // refletindo na hora sem recarregar. Mantém o sessionStorage sincronizado.
  function atualizarCoresMenu(cores) {
    setUsuario(u => {
      if (!u) return u;
      const novo = { ...u, cores_menu: cores || null };
      sessionStorage.setItem('usuario', JSON.stringify(novo));
      return novo;
    });
  }

  // Atualiza a cor de destaque da linha (hover) do usuário logado (após salvar no
  // "Aparência"), refletindo na hora sem recarregar. Mantém o sessionStorage sincronizado.
  function atualizarCorLinha(cor) {
    setUsuario(u => {
      if (!u) return u;
      const novo = { ...u, cor_linha: cor || null };
      sessionStorage.setItem('usuario', JSON.stringify(novo));
      return novo;
    });
  }

  // Atualiza a cor da linha de "publicação já lida" do usuário logado (após salvar no
  // "Aparência"), refletindo na hora sem recarregar. Mantém o sessionStorage sincronizado.
  function atualizarCorLinhaLida(cor) {
    setUsuario(u => {
      if (!u) return u;
      const novo = { ...u, cor_linha_lida: cor || null };
      sessionStorage.setItem('usuario', JSON.stringify(novo));
      return novo;
    });
  }

  // Verifica se o usuário tem permissão para uma ação em um módulo
  // Admins (nível 1) e superusuários (nível 0) têm acesso total
  function temPermissao(modulo, acao) {
    if (!usuario) return false;
    if (usuario.nivel <= 1) return true; // Admin e super têm tudo
    return permissoes[modulo]?.[acao] === true;
  }

  // Verifica se é admin ou super
  const ehAdmin = usuario?.nivel <= 1;
  const ehSuper = usuario?.nivel === 0;

  return (
    <AuthContext.Provider value={{
      usuario, permissoes, carregando,
      logar, deslogar, temPermissao, ehAdmin, ehSuper, atualizarCoresAgenda, atualizarCoresMenu, atualizarCorLinha, atualizarCorLinhaLida,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook para usar em qualquer componente: const { usuario } = useAuth()
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
