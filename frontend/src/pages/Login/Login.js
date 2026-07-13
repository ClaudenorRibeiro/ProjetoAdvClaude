// ============================================================
// TELA DE LOGIN
// ============================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authAPI, api } from '../../services/api';
import './Login.css';

export default function Login() {
  const [login, setLogin]     = useState('');
  const [senha, setSenha]     = useState('');
  const [erro, setErro]       = useState('');
  const [carregando, setCarregando] = useState(false);
  const [nomeEscritorio, setNomeEscritorio] = useState('Sistema de Advocacia');
  const [logoEscritorio, setLogoEscritorio] = useState(null);
  const { logar }   = useAuth();
  const navigate    = useNavigate();

  useEffect(() => {
    api.get('/public/info')
      .then(r => {
        if (r.data.ok && r.data.dados?.nome) setNomeEscritorio(r.data.dados.nome);
        if (r.data.ok && r.data.dados?.logo_base64) setLogoEscritorio(r.data.dados.logo_base64);
      })
      .catch(() => {}); // falha silenciosa — mantém o fallback
  }, []);

  // Estado do modal "Esqueci minha senha"
  const [modalEsqueci, setModalEsqueci]     = useState(false);
  const [loginOuEmail, setLoginOuEmail]     = useState('');
  const [enviando, setEnviando]             = useState(false);
  const [msgEsqueci, setMsgEsqueci]         = useState('');
  const [erroEsqueci, setErroEsqueci]       = useState('');

  async function handleEsqueci(e) {
    e.preventDefault();
    setErroEsqueci('');
    setMsgEsqueci('');
    if (!loginOuEmail.trim()) { setErroEsqueci('Informe o login ou e-mail'); return; }
    setEnviando(true);
    try {
      const { data } = await authAPI.esqueciSenha({ loginOuEmail });
      setMsgEsqueci(data.mensagem);
    } catch (err) {
      setErroEsqueci(err.response?.data?.mensagem || 'Erro ao processar solicitação');
    } finally {
      setEnviando(false);
    }
  }

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
          {logoEscritorio && (
            <img src={logoEscritorio} alt="Logo do escritório"
              style={{maxWidth:'200px', maxHeight:'90px', marginBottom:'10px'}} />
          )}
          <h1>{nomeEscritorio}</h1>
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

          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => { setModalEsqueci(true); setMsgEsqueci(''); setErroEsqueci(''); setLoginOuEmail(''); }}
              style={{ background: 'none', border: 'none', color: '#2d6be4', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}
            >
              Esqueci minha senha
            </button>
          </div>
        </form>
      </div>

      {/* Modal Esqueci minha senha */}
      {modalEsqueci && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3>Esqueci minha senha</h3>
              <button className="modal-fechar" onClick={() => setModalEsqueci(false)}>✕</button>
            </div>
            <div className="modal-body">
              {msgEsqueci ? (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '16px', color: '#166534', fontSize: '14px' }}>
                  ✅ {msgEsqueci}
                </div>
              ) : (
                <form onSubmit={handleEsqueci}>
                  <p style={{ margin: '0 0 16px', color: '#555', fontSize: '14px' }}>
                    Informe o seu login ou e-mail cadastrado. Você receberá um link para criar uma nova senha.
                  </p>
                  {erroEsqueci && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '10px 14px', color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>
                      {erroEsqueci}
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Login ou E-mail</label>
                    <input
                      className="form-control"
                      value={loginOuEmail}
                      onChange={e => setLoginOuEmail(e.target.value)}
                      placeholder="Seu login ou e-mail cadastrado"
                      autoFocus
                    />
                  </div>
                  <div className="modal-footer" style={{ paddingBottom: 0 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setModalEsqueci(false)}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={enviando}>
                      {enviando ? 'Enviando...' : 'Enviar link'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
