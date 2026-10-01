// ============================================================
// PERMISSÕES — limite de relatórios (padrão do escritório + exceção do usuário selecionado)
// Fica ao lado do seletor de usuário, na aba Permissões. Tem o próprio botão "Salvar limites"
// (não mexe na gravação das permissões). Vazio no campo do usuário = usa o padrão.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { relatoriosAPI } from '../../services/api';

const texto = (v) => (v === null || v === undefined ? '' : String(v));

export default function LimitesRelatorios({ usuarioId }) {
  const [dados, setDados] = useState(null);
  const [padrao, setPadrao] = useState('');
  const [individual, setIndividual] = useState('');
  const [salvando, setSalvando] = useState(false);

  const aplicar = useCallback((d, id) => {
    setDados(d);
    setPadrao(texto(d.padrao));
    setIndividual(texto(d.usuarios.find(u => String(u.id) === String(id))?.max_relatorios));
  }, []);

  useEffect(() => {
    relatoriosAPI.obterLimites().then(({ data }) => aplicar(data.dados, usuarioId))
      .catch(() => toast.error('Erro ao carregar os limites de relatórios'));
  }, [usuarioId, aplicar]);

  if (!dados) return null;
  const usuario = dados.usuarios.find(u => String(u.id) === String(usuarioId)) || null;
  const max = dados.maximoPermitido;
  const inteiroOk = (t) => /^\d+$/.test(t.trim()) && Number(t) <= max;
  const padraoOk = inteiroOk(padrao);
  const individualOk = individual.trim() === '' || inteiroOk(individual);
  const padraoMudou = padraoOk && Number(padrao) !== dados.padrao;
  const individualMudou = Boolean(usuario) && individualOk && texto(usuario.max_relatorios) !== individual.trim();
  const podeSalvar = padraoOk && individualOk && (padraoMudou || individualMudou) && !salvando;

  async function salvar() {
    const corpo = {};
    if (padraoMudou) corpo.padrao = Number(padrao);
    if (individualMudou) corpo.usuarios = { [usuario.id]: individual.trim() === '' ? null : Number(individual) };
    setSalvando(true);
    try {
      const { data } = await relatoriosAPI.salvarLimites(corpo);
      aplicar(data.dados, usuarioId);
      toast.success('Limites de relatórios salvos');
    } catch (err) {
      toast.error(err?.response?.data?.mensagem || 'Não foi possível salvar os limites');
    } finally { setSalvando(false); }
  }

  const campo = { width: '110px' };
  return (
    <div role="group" aria-label="Limite de relatórios"
      style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <strong style={{ alignSelf: 'center' }}>Limite de relatórios</strong>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label" htmlFor="limite-rel-padrao">Padrão para todos</label>
        <input id="limite-rel-padrao" className="form-control" style={campo} type="number" min="0" max={max}
          value={padrao} onChange={e => setPadrao(e.target.value)} />
      </div>
      {usuario && (
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="limite-rel-usuario">Deste usuário (vazio = padrão)</label>
          <input id="limite-rel-usuario" className="form-control" style={campo} type="number" min="0" max={max}
            placeholder={texto(dados.padrao)} value={individual} onChange={e => setIndividual(e.target.value)} />
        </div>
      )}
      <button className="btn btn-primary" disabled={!podeSalvar} onClick={salvar}>{salvando ? 'Salvando...' : 'Salvar limites'}</button>
      {usuario && <span style={{ color: '#6b7280', alignSelf: 'center' }}>{usuario.nome} já criou {usuario.criados} relatório(s).</span>}
      {(!padraoOk || !individualOk) && <span role="alert" style={{ color: '#b45309', alignSelf: 'center' }}>Use um número inteiro de 0 a {max}.</span>}
    </div>
  );
}
