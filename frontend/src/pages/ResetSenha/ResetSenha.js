// ============================================================
// PÁGINA DE REDEFINIÇÃO DE SENHA
// Acessada pelo link enviado no e-mail: /redefinir-senha?token=xxx
// ============================================================

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../../services/api';

export default function ResetSenha() {
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const token           = searchParams.get('token');

  const [status, setStatus]   = useState('validando'); // validando | valido | invalido | sucesso
  const [nomeUsuario, setNomeUsuario] = useState('');
  const [senha, setSenha]     = useState('');
  const [confirma, setConfirma] = useState('');
  const [verSenha, setVerSenha]     = useState(false); // olhinho da "Nova senha"
  const [verConfirma, setVerConfirma] = useState(false); // olhinho da "Confirmar nova senha"
  const [erro, setErro]       = useState('');
  const [salvando, setSalvando] = useState(false);

  // Valida o token ao carregar a página
  useEffect(() => {
    if (!token) { setStatus('invalido'); return; }
    authAPI.validarToken(token)
      .then(r => { setNomeUsuario(r.data.dados?.nome || ''); setStatus('valido'); })
      .catch(() => setStatus('invalido'));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    if (senha.length < 6)   { setErro('A senha deve ter no mínimo 6 caracteres'); return; }
    if (senha !== confirma)  { setErro('As senhas não coincidem'); return; }

    setSalvando(true);
    try {
      await authAPI.redefinirSenha({ token, senha });
      setStatus('sucesso');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setErro(err.response?.data?.mensagem || 'Erro ao redefinir senha');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1e3a8a 0%, #2d6be4 100%)',
    }}>
      <div style={{
        background: '#fff', borderRadius: '12px', padding: '40px 36px',
        width: '100%', maxWidth: '420px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: '22px', color: '#1e2a3a' }}>Sistema de Advocacia</h1>
          <p style={{ margin: 0, color: '#888', fontSize: '14px' }}>Redefinição de senha</p>
        </div>

        {/* Validando */}
        {status === 'validando' && (
          <p style={{ textAlign: 'center', color: '#888' }}>Validando link...</p>
        )}

        {/* Token inválido ou expirado */}
        {status === 'invalido' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <p style={{ color: '#dc2626', fontWeight: '600', marginBottom: '8px' }}>Link inválido ou expirado</p>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '24px' }}>
              O link de redefinição é válido por apenas 1 hora. Solicite um novo link na tela de login.
            </p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/login')}>
              Voltar ao Login
            </button>
          </div>
        )}

        {/* Formulário de nova senha */}
        {status === 'valido' && (
          <form onSubmit={handleSubmit}>
            {nomeUsuario && (
              <p style={{ margin: '0 0 20px', color: '#555', fontSize: '14px' }}>
                Olá, <strong>{nomeUsuario}</strong>. Defina sua nova senha abaixo.
              </p>
            )}

            {erro && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px',
                padding: '10px 14px', color: '#dc2626', fontSize: '13px', marginBottom: '16px',
              }}>
                {erro}
              </div>
            )}

            {/* Olhinho: troca SÓ o tipo do campo (password <-> text). Cada campo tem o
                seu, independente do outro; nada é guardado e ambos nascem escondidos. */}
            <div className="form-group">
              <label className="form-label">Nova senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={verSenha ? 'text' : 'password'} className="form-control"
                  value={senha} onChange={e => setSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres" autoFocus
                  autoComplete="new-password"
                  style={{ paddingRight: '42px' }}
                />
                <button
                  type="button"
                  onClick={() => setVerSenha(v => !v)}
                  title={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'none', border: 'none', padding: '2px', cursor: 'pointer',
                    color: '#6b7280',
                  }}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                    {verSenha && <line x1="3" y1="21" x2="21" y2="3" />}
                  </svg>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirmar nova senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={verConfirma ? 'text' : 'password'} className="form-control"
                  value={confirma} onChange={e => setConfirma(e.target.value)}
                  placeholder="Repita a nova senha"
                  autoComplete="new-password"
                  style={{ paddingRight: '42px' }}
                />
                <button
                  type="button"
                  onClick={() => setVerConfirma(v => !v)}
                  title={verConfirma ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-label={verConfirma ? 'Ocultar senha' : 'Mostrar senha'}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'none', border: 'none', padding: '2px', cursor: 'pointer',
                    color: '#6b7280',
                  }}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                    {verConfirma && <line x1="3" y1="21" x2="21" y2="3" />}
                  </svg>
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Redefinir Senha'}
            </button>
          </form>
        )}

        {/* Sucesso */}
        {status === 'sucesso' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <p style={{ color: '#166534', fontWeight: '600', marginBottom: '8px' }}>Senha redefinida com sucesso!</p>
            <p style={{ color: '#666', fontSize: '14px' }}>
              Você será redirecionado para o login em instantes...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
