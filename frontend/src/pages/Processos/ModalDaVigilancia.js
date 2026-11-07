// ============================================================
// Janela Nova/Editar Vigilância (e o gerenciador de tipos).
// Usada na aba Vigilâncias da pasta e, reaproveitada, a partir de uma publicação.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { vigilanciasAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import ModalConfirmar from '../../components/ui/ModalConfirmar';

export function ModalDaVigilancia({ processos, vigilancia, onFechar, bloquearProcesso = false }) {
  const { temPermissao } = useAuth();
  const [tipos, setTipos] = useState([]);
  const [gerenciandoTipos, setGerenciandoTipos] = useState(false);
  const comumNaoApenso = processos.find(p => !p.apenso_de_id) || processos[0];
  const [processoId, setProcessoId] = useState(vigilancia?.processo_id ?? comumNaoApenso?.id ?? '');
  const [tipoId, setTipoId]         = useState(vigilancia?.tipo_id ?? '');
  const [observacao, setObservacao] = useState(vigilancia?.observacao ?? '');
  const [erro, setErro]             = useState('');
  const [salvando, setSalvando]     = useState(false);
  const processoTravado = !!vigilancia || bloquearProcesso;

  const recarregarTipos = useCallback(() => {
    vigilanciasAPI.tipos().then(r => { if (r.data.ok) setTipos(r.data.dados); });
  }, []);
  useEffect(() => { recarregarTipos(); }, [recarregarTipos]);

  async function salvar() {
    if (!vigilancia && !tipoId) return setErro('Escolha o tipo de vigilância.');
    setErro('');
    setSalvando(true);
    try {
      const texto = observacao.trim() === '' ? null : observacao.trim();
      if (vigilancia) await vigilanciasAPI.editar(vigilancia.id, { observacao: texto });
      else await vigilanciasAPI.criar({ processo_id: processoId, tipo_id: tipoId, observacao: texto });
      onFechar(true);
    } catch (err) { setErro(err.response?.data?.mensagem || 'Erro ao salvar a vigilância'); }
    finally { setSalvando(false); }
  }

  return (
    <>
      <div className="modal-overlay">
        <div className="modal-box" style={{ maxWidth: '560px' }}>
          <div className="modal-header">
            <h3>{vigilancia ? 'Editar Vigilância' : 'Nova Vigilância'}</h3>
            <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
          </div>
          <div className="modal-body">
            {erro && (
              <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>
                {erro}
              </div>
            )}
            <div className="form-group">
              <label className="form-label" htmlFor="vigilancia-processo">Processo</label>
              <select id="vigilancia-processo" className="form-control" value={processoId} disabled={processoTravado}
                onChange={e => setProcessoId(Number(e.target.value))}>
                {processos.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.numProc || (p.protocolo ? `Protocolo ${p.protocolo}` : `Processo #${p.id}`)}
                    {p.apenso_de_id ? ' (apenso)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="vigilancia-tipo">Tipo de vigilância</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select id="vigilancia-tipo" className="form-control" value={tipoId} disabled={!!vigilancia}
                  onChange={e => setTipoId(Number(e.target.value))}>
                  <option value="">Selecione...</option>
                  {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
                {!vigilancia && (temPermissao('vigilancias.tipos', 'cadastrar') || temPermissao('vigilancias.tipos', 'alterar') || temPermissao('vigilancias.tipos', 'excluir')) && (
                  <button type="button" className="btn btn-outline" style={{ padding: '0 8px' }} title="Gerenciar tipos"
                    onClick={() => setGerenciandoTipos(true)}>…</button>
                )}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="vigilancia-observacao">Observação</label>
              <textarea id="vigilancia-observacao" className="form-control" rows={3} maxLength={1000} value={observacao}
                onChange={e => setObservacao(e.target.value)} style={{ resize: 'vertical' }} />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
      {gerenciandoTipos && (
        <ModalDeTiposVigilancia tipos={tipos} onMudar={recarregarTipos} onFechar={() => setGerenciandoTipos(false)} />
      )}
    </>
  );
}

function ModalDeTiposVigilancia({ tipos, onMudar, onFechar }) {
  const { temPermissao } = useAuth();
  const [novoNome, setNovoNome] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [nomeEditado, setNomeEditado] = useState('');
  const [erro, setErro]         = useState('');
  const [confirmarExcluir, setConfirmarExcluir] = useState(null);
  const podeCadastrar = temPermissao('vigilancias.tipos', 'cadastrar');
  const podeAlterar   = temPermissao('vigilancias.tipos', 'alterar');
  const podeExcluir   = temPermissao('vigilancias.tipos', 'excluir');

  async function criar() {
    if (!novoNome.trim()) return setErro('Informe o nome do tipo');
    try {
      await vigilanciasAPI.criarTipo({ nome: novoNome.trim() });
      setNovoNome(''); setErro(''); onMudar();
    } catch (err) { setErro(err.response?.data?.mensagem || 'Erro ao criar'); }
  }
  async function salvarEdicao(id) {
    if (!nomeEditado.trim()) return setErro('Informe o nome do tipo');
    try {
      await vigilanciasAPI.editarTipo(id, { nome: nomeEditado.trim() });
      setEditandoId(null); setErro(''); onMudar();
    } catch (err) { setErro(err.response?.data?.mensagem || 'Erro ao renomear'); }
  }
  async function excluir(id) {
    await vigilanciasAPI.excluirTipo(id);
    onMudar();
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box modal-pequeno">
        <div className="modal-header">
          <h3>Tipos de Vigilância</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {erro && <div style={{ color: '#b91c1c', fontSize: '13px', marginBottom: '10px' }}>{erro}</div>}
          {podeCadastrar && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input className="form-control" placeholder="Novo tipo..." value={novoNome}
                onChange={e => setNovoNome(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') criar(); }} />
              <button className="btn btn-primary" onClick={criar}>+ Adicionar</button>
            </div>
          )}
          {tipos.length === 0 && <p style={{ color: '#888' }}>Nenhum tipo cadastrado</p>}
          {tipos.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
              {editandoId === t.id ? (
                <>
                  <input className="form-control" value={nomeEditado} onChange={e => setNomeEditado(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 10px' }} aria-label="Salvar o novo nome" onClick={() => salvarEdicao(t.id)}>✓</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1 }}>{t.nome}</span>
                  {podeAlterar && (
                    <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={() => { setEditandoId(t.id); setNomeEditado(t.nome); }}>Editar</button>
                  )}
                  {podeExcluir && (
                    <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={() => setConfirmarExcluir(t)}>Excluir</button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
      {confirmarExcluir && (
        <ModalConfirmar
          titulo="Excluir tipo"
          mensagem={`Excluir o tipo "${confirmarExcluir.nome}"?`}
          textoBotao="Excluir"
          acao={() => excluir(confirmarExcluir.id)}
          onCancelar={() => setConfirmarExcluir(null)}
        />
      )}
    </div>
  );
}
