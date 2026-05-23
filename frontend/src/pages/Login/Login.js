// ============================================================
// TELA DE LOGIN
// ============================================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Login.css';

export default function Login() {
  const [login, setLogin]     = useState('');
  const [senha, setSenha]     = useState('');
  const [erro, setErro]       = useState('');
  const [carregando, setCarregando] = useState(false);
  const { logar }   = useAuth();
  const navigate    = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');

    if (!login || !senha) {
      setErro('Preencha o login e a senha');
      return;
    }

    setCarregando(true);
    try {
      const resultado = await logar(login, senha);
      if (resultado.ok) {
        navigate('/dashboard');
      } else {
        setErro(resultado.mensagem || 'Login ou senha incorretos');
      }
    } catch (err) {
      setErro(err.response?.data?.mensagem || 'Erro ao conectar com o servidor');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>Sistema de Advocacia</h1>
          <p>Gestão jurídica completa</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {erro && <div className="login-erro">{erro}</div>}

          <div className="form-group">
            <label className="form-label">Login</label>
            <input
              type="text"
              className="form-control"
              value={login}
              onChange={e => setLogin(e.target.value)}
              placeholder="Seu login"
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Senha</label>
            <input
              type="password"
              className="form-control"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              placeholder="Sua senha"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary login-btn"
            disabled={carregando}
          >
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
