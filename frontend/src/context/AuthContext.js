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

  // Ao montar a aplicação, verifica se há token salvo e ainda é válido
  useEffect(() => {
    const tokenSalvo = localStorage.getItem('token');
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
      } else {
        deslogar();
      }
    } catch {
      deslogar();
    } finally {
      setCarregando(false);
    }
  }

  // Realiza o login e salva os dados na memória e no localStorage
  async function logar(login, senha) {
    const { data } = await authAPI.login({ login, senha });
    if (data.ok) {
      localStorage.setItem('token', data.dados.token);
      localStorage.setItem('usuario', JSON.stringify(data.dados.usuario));
      setUsuario(data.dados.usuario);
      setPermissoes(data.dados.permissoes || {});
    }
    return data;
  }

  // Limpa tudo e redireciona para login
  function deslogar() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setUsuario(null);
    setPermissoes({});
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
