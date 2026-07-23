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

  // Ao montar a aplicação, verifica se há token salvo e ainda é válido
  useEffect(() => {
    const tokenSalvo = sessionStorage.getItem('token');
    if (tokenSalvo) {
      verificarToken();
    } else {
      setCarregando(false);
    }
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
    const { data } = await authAPI.login({ login, senha });
    if (data.ok) {
      sessionStorage.setItem('token', data.dados.token);
      sessionStorage.setItem('usuario', JSON.stringify(data.dados.usuario));
      setUsuario(data.dados.usuario);
      setPermissoes(data.dados.permissoes || {});
      if (data.dados.tempo_inatividade_min) setTempoInatividade(data.dados.tempo_inatividade_min);
    }
    return data;
  }

  // Limpa tudo e redireciona para login
  function deslogar() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('usuario');
    setUsuario(null);
    setPermissoes({});
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
      timer = setTimeout(() => { deslogar(); }, limiteMs);
    };
    const eventos = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    eventos.forEach(ev => window.addEventListener(ev, reiniciar, { passive: true }));
    reiniciar(); // arma o cronômetro ao logar
    return () => {
      clearTimeout(timer);
      eventos.forEach(ev => window.removeEventListener(ev, reiniciar));
    };
  }, [usuario, tempoInatividade]);

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
      logar, deslogar, temPermissao, ehAdmin, ehSuper,
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
