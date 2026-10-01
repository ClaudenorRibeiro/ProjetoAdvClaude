// ============================================================
// RELATÓRIOS — janela para compartilhar um relatório pessoal com colegas.
// Só aparecem para marcar os colegas ATIVOS; quem não tem acesso a Relatórios ou ao assunto fica desabilitado
// com o motivo. Quem recebe abre e exporta com as PRÓPRIAS permissões e não consegue alterar o seu.
// ============================================================
import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { relatoriosAPI } from '../../../services/api';
import useEscFechar from '../../../hooks/useEscFechar';
import { mensagemDeErro } from './Construtor';

export default function ModalCompartilhar({ modelo, onSalvo, onCancelar }) {
  const [dados, setDados] = useState(null);
  const [marcados, setMarcados] = useState(new Set());
  const [salvando, setSalvando] = useState(false);
  const overlayRef = useEscFechar(onCancelar);

  useEffect(() => {
    relatoriosAPI.consultarCompartilhamento(modelo.id)
      .then(({ data }) => {
        setDados(data.dados);
        const elegiveis = new Set(data.dados.candidatos.filter(c => c.pode).map(c => c.id));
        setMarcados(new Set(data.dados.compartilhados.map(c => c.id).filter(id => elegiveis.has(id))));
      })
      .catch(err => { toast.error(mensagemDeErro(err, 'Não foi possível carregar os colegas')); onCancelar(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelo.id]);

  const alternar = (id) => setMarcados(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function salvar() {
    setSalvando(true);
    try {
      const { data } = await relatoriosAPI.definirCompartilhamento(modelo.id, [...marcados]);
      toast.success(data.mensagem || 'Compartilhamento atualizado');
      onSalvo();
    } catch (err) { toast.error(mensagemDeErro(err, 'Não foi possível compartilhar')); } finally { setSalvando(false); }
  }

  const inativos = dados ? dados.compartilhados.filter(c => !c.ativo) : [];
  return (
    <div className="modal-overlay" ref={overlayRef}>
      <div className="modal-box modal-pequeno" role="dialog" aria-label="Compartilhar relatório">
        <div className="modal-header">
          <h3>Compartilhar: {modelo.nome}</h3>
          <button className="modal-fechar" onClick={onCancelar}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '60vh', overflow: 'auto' }}>
          {!dados ? <div className="loading">Carregando...</div> : (
            <>
              <p style={{ marginTop: 0, color: '#374151' }}>
                Os colegas marcados poderão <strong>abrir, exportar e copiar</strong> este relatório, sempre com as permissões deles. Eles não conseguem alterá-lo nem repassá-lo.
              </p>
              {dados.candidatos.length === 0 && <p className="lista-vazia">Não há outros colegas ativos.</p>}
              {dados.candidatos.map(c => (
                <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', cursor: c.pode ? 'pointer' : 'not-allowed', opacity: c.pode ? 1 : 0.6 }}>
                  <input type="checkbox" disabled={!c.pode} checked={marcados.has(c.id)} onChange={() => alternar(c.id)} />
                  <span>{c.nome}{!c.pode && <small style={{ color: '#92400e' }}> — {c.motivo}</small>}</span>
                </label>
              ))}
              {inativos.length > 0 && (
                <p role="note" style={{ color: '#92400e', fontSize: 13 }}>
                  Colegas inativos que ainda tinham acesso ({inativos.map(c => c.nome).join(', ')}) perdem o acesso ao salvar.
                </p>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-primary" disabled={!dados || salvando} onClick={salvar}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}
