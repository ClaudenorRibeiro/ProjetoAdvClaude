// ============================================================
// MODAL: LER A PUBLICAÇÃO DE ORIGEM (somente leitura)
// ------------------------------------------------------------
// Aberto a partir de um prazo/tarefa/compromisso que nasceu de uma publicação
// (via o vínculo publicacao_id). Busca a publicação pelo id e mostra o texto.
// Compartilhado por Prazos, Tarefas e Agenda para não duplicar código.
// Tem um "Localizar no texto" que destaca (amarelo) as ocorrências, ignorando
// maiúsculas E acentos, mostra a contagem e rola até a primeira.
// ============================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { publicacoesAPI } from '../services/api';
import { formatarData, textoLimpo } from '../utils/formatters';
import useEscFechar from '../hooks/useEscFechar';

// Cada letra vira uma classe que casa também com as versões acentuadas → busca ignora acento.
const MAPA_ACENTOS = { a: 'aàáâãä', e: 'eéèêë', i: 'iíìîï', o: 'oóòôõö', u: 'uúùûü', c: 'cç', n: 'nñ' };

// Monta a expressão de busca a partir do termo (sem acento + escapado), casando acentos no texto real.
function regexBusca(termo) {
  const base = termo.normalize('NFD').replace(/[̀-ͯ]/g, ''); // tira acento do que foi digitado
  const escapado = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const padrao = escapado.split('').map(ch => {
    const b = ch.toLowerCase();
    return MAPA_ACENTOS[b] ? `[${MAPA_ACENTOS[b]}]` : ch;
  }).join('');
  return new RegExp(padrao, 'gi');
}

export default function ModalLerPublicacao({ publicacaoId, onFechar }) {
  const [pub, setPub]     = useState(null);
  const [aviso, setAviso] = useState('');
  const [busca, setBusca] = useState('');
  const textoRef        = useRef(null); // container do texto (rolável)
  const primeiraMarcaRef = useRef(null); // 1ª ocorrência destacada

  useEffect(() => {
    publicacoesAPI.obter(publicacaoId)
      .then(({ data }) => { if (data.ok) setPub(data.dados); })
      .catch((e) => setAviso(e.response?.data?.mensagem || 'Não foi possível carregar a publicação de origem.'));
  }, [publicacaoId]);

  // Fecha com Escape — só quando esta janela é a mais acima (não fecha junto com outra empilhada).
  const overlayRef = useEscFechar(onFechar);

  const texto = pub ? textoLimpo(pub.texto) : '';

  // Quebra o texto em pedaços, destacando as ocorrências. Sem busca → devolve o texto puro.
  const { partes, total } = useMemo(() => {
    const termo = busca.trim();
    if (!termo || !texto) return { partes: texto, total: 0 };
    const re = regexBusca(termo);
    const out = [];
    let ultimo = 0, n = 0, m;
    while ((m = re.exec(texto)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; } // segurança contra loop
      if (m.index > ultimo) out.push(texto.slice(ultimo, m.index));
      const primeira = n === 0;
      out.push(
        <mark key={m.index} ref={primeira ? primeiraMarcaRef : null}
          style={{ background: '#fde047', color: 'inherit', padding: '0 1px', borderRadius: '2px' }}>
          {m[0]}
        </mark>
      );
      ultimo = m.index + m[0].length;
      n++;
    }
    if (ultimo < texto.length) out.push(texto.slice(ultimo));
    return { partes: out, total: n };
  }, [busca, texto]);

  // Rola o container até a 1ª ocorrência (só mexe no container, não na página).
  useEffect(() => {
    if (!busca.trim() || !primeiraMarcaRef.current || !textoRef.current) return;
    const c = textoRef.current, mk = primeiraMarcaRef.current;
    c.scrollTop += mk.getBoundingClientRect().top - c.getBoundingClientRect().top - 40;
  }, [busca, partes]);

  return (
    <div className="modal-overlay" style={{ zIndex: 2100 }} ref={overlayRef}>
      <div className="modal-box modal-largo">
        <div className="modal-header">
          <h3>Publicação de origem{pub ? ` — ${formatarData(pub.data_publicacao)}` : ''}</h3>
          {pub && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', marginRight: '12px' }}>
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Localizar no texto..."
                style={{ width: '200px', padding: '5px 9px', fontSize: '13px',
                  border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
              {busca.trim() && (
                <span style={{ fontSize: '12px', color: total ? '#64748b' : '#b91c1c', whiteSpace: 'nowrap' }}>
                  {total} {total === 1 ? 'ocorrência' : 'ocorrências'}
                </span>
              )}
            </div>
          )}
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {aviso && (
            <div style={{ background: '#fff4e5', border: '1px solid #ffcf99', color: '#8a5300',
              padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>
              {aviso}
            </div>
          )}
          {!pub && !aviso ? <div className="loading">Carregando...</div> : pub && (
            <>
              <div style={{ marginBottom: '12px', fontSize: '13px', color: '#555' }}>
                {pub.tribunal && <div><strong>Tribunal:</strong> {pub.tribunal}</div>}
                {pub.titulo && <div>{pub.titulo}</div>}
                {pub.numero_processo && <div><strong>Processo:</strong> {pub.numero_processo}</div>}
                {pub.numero_publicacao && <div><strong>Nº da publicação:</strong> {pub.numero_publicacao}</div>}
              </div>
              <div ref={textoRef} style={{
                background: '#f8fafc', padding: '16px', borderRadius: '8px',
                fontSize: '14px', lineHeight: '1.7', whiteSpace: 'pre-wrap', maxHeight: '420px', overflowY: 'auto',
              }}>
                {partes}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
