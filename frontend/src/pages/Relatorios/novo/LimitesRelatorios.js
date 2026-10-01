// ============================================================
// RELATÓRIOS — limite "x" de relatórios por usuário (somente administrador)
// Padrão para todos + exceção por usuário (vazio = usa o padrão).
// ============================================================
import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { relatoriosAPI } from '../../../services/api';
import { mensagemDeErro } from './Construtor';

export default function LimitesRelatorios({ onVoltar }) {
  const [dados, setDados] = useState(null);
  const [padrao, setPadrao] = useState('');
  const [excecoes, setExcecoes] = useState({});   // id -> texto digitado ('' = usa o padrão)
  const [salvando, setSalvando] = useState(false);

  function aplicar(d) {
    setDados(d); setPadrao(String(d.padrao));
    setExcecoes(Object.fromEntries(d.usuarios.map(u => [u.id, u.max_relatorios === null ? '' : String(u.max_relatorios)])));
  }
  useEffect(() => {
    relatoriosAPI.obterLimites().then(({ data }) => aplicar(data.dados)).catch(err => toast.error(mensagemDeErro(err, 'Erro ao carregar os limites')));
  }, []);

  async function salvar() {
    const numero = (t) => (t.trim() === '' ? null : Number(t));
    const usuarios = {};
    for (const u of dados.usuarios) {
      const novo = numero(excecoes[u.id] ?? '');
      if (novo !== u.max_relatorios) usuarios[u.id] = novo;
    }
    setSalvando(true);
    try {
      const { data } = await relatoriosAPI.salvarLimites({ padrao: Number(padrao), usuarios });
      aplicar(data.dados);
      toast.success('Limites salvos');
    } catch (err) { toast.error(mensagemDeErro(err, 'Não foi possível salvar os limites')); }
    finally { setSalvando(false); }
  }

  if (!dados) return <div className="loading">Carregando...</div>;
  const padraoInvalido = padrao.trim() === '' || !Number.isInteger(Number(padrao)) || Number(padrao) < 0 || Number(padrao) > dados.maximoPermitido;

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button className="btn btn-secondary" onClick={onVoltar}>← Voltar</button>
        <button className="btn btn-primary" disabled={salvando || padraoInvalido} onClick={salvar}>{salvando ? 'Salvando...' : 'Salvar limites'}</button>
      </div>
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="form-group" style={{ maxWidth: '320px', margin: 0 }}>
          <label className="form-label" htmlFor="limite-padrao">Limite padrão de relatórios por usuário</label>
          <input id="limite-padrao" className="form-control" type="number" min="0" max={dados.maximoPermitido} value={padrao} onChange={e => setPadrao(e.target.value)} />
          <small style={{ color: '#6b7280' }}>Vale para todos que não tiverem um limite próprio abaixo (0 a {dados.maximoPermitido}).</small>
        </div>
      </div>
      <div className="card">
        <div className="tabela-wrapper">
          <table className="tabela">
            <thead><tr><th>Usuário</th><th>Relatórios criados</th><th>Limite próprio (vazio = padrão)</th></tr></thead>
            <tbody>
              {dados.usuarios.map(u => (
                <tr key={u.id}>
                  <td>{u.nome}</td>
                  <td>{u.criados}</td>
                  <td><input className="form-control" style={{ width: '120px' }} type="number" min="0" max={dados.maximoPermitido}
                    aria-label={`Limite de ${u.nome}`} placeholder={String(dados.padrao)} value={excecoes[u.id] ?? ''}
                    onChange={e => setExcecoes(x => ({ ...x, [u.id]: e.target.value }))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
