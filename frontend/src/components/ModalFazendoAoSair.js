// Aviso de prazos que a pessoa ainda está fazendo (status "Fazendo").
//  modo 'sair'   — ao clicar em "Sair": manter e sair, liberar os marcados e sair, ou cancelar e continuar no sistema;
//  modo 'entrada' — no login seguinte a um logout por inatividade: manter ou liberar os marcados.
// A tela só mostra a lista e devolve os números marcados para liberar; quem libera e sai é o chamador.
import React, { useState, useEffect, useRef } from 'react';
import { formatarData, haQuantoTempo } from '../utils/formatters';

export default function ModalFazendoAoSair({ modo = 'sair', prazos, ocupado = false, onContinuar, onCancelar }) {
  const [marcados, setMarcados] = useState([]);
  const botaoManterRef = useRef(null);
  const sair = modo === 'sair';
  const qtd = prazos.length;

  useEffect(() => { botaoManterRef.current?.focus(); }, []);
  useEffect(() => {
    function tecla(e) { if (e.key === 'Escape' && !ocupado) (sair ? onCancelar : () => onContinuar([]))(); }
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [sair, ocupado, onCancelar, onContinuar]);

  const alternar = (id) => setMarcados(m => (m.includes(id) ? m.filter(x => x !== id) : [...m, id]));
  const todosMarcados = marcados.length === qtd;
  const plural = qtd === 1 ? '1 prazo está marcado' : `${qtd} prazos estão marcados`;

  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="titulo-fazendo-sair" style={{ maxWidth: '620px' }}>
        <div className="modal-header">
          <h3 id="titulo-fazendo-sair">▶ {sair ? 'Você tem prazos em "Fazendo"' : 'Você ainda tem prazos em "Fazendo"'}</h3>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0 }}>
            {sair
              ? `${plural} como "Fazendo" em seu nome. Se você só sair, eles continuam marcados para o seu próximo login.`
              : `O sistema foi fechado por inatividade. ${plural} como "Fazendo" em seu nome e continuam assim.`}
            {' '}Marque os que você quer <strong>liberar</strong> (voltam a ficar sem ninguém fazendo).
          </p>
          <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', cursor: 'pointer' }}>
            <input type="checkbox" aria-label="Marcar todos para liberar" checked={todosMarcados}
              onChange={() => setMarcados(todosMarcados ? [] : prazos.map(p => p.id))} />
            <span>Marcar todos para liberar</span>
          </label>
          <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px' }} tabIndex={0} aria-label="Prazos em Fazendo" role="region">
            {prazos.map(p => (
              <label key={p.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 10px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                <input type="checkbox" aria-label={`Liberar o prazo ${p.subtipo_nome || p.descricao || p.id} do processo ${p.processo_numero}`}
                  checked={marcados.includes(p.id)} onChange={() => alternar(p.id)} style={{ marginTop: '3px' }} />
                <span>
                  <strong>{p.subtipo_nome || p.descricao || 'Prazo'}</strong>
                  <span style={{ display: 'block', fontSize: '12px', color: '#5b6472' }}>
                    {p.processo_numero} · vence em {formatarData(p.data_vencimento)} · {haQuantoTempo(p.fazendo_desde) || 'agora'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {sair && <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={onCancelar}>Cancelar</button>}
          <button type="button" className="btn btn-outline" disabled={ocupado || marcados.length === 0} onClick={() => onContinuar(marcados)}>
            {sair ? `Liberar marcados (${marcados.length}) e sair` : `Liberar marcados (${marcados.length})`}
          </button>
          <button type="button" ref={botaoManterRef} className="btn btn-primary" disabled={ocupado} onClick={() => onContinuar([])}>
            {sair ? 'Manter e sair' : 'Manter como está'}
          </button>
        </div>
      </div>
    </div>
  );
}
