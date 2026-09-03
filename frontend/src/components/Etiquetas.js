// ============================================================
// ETIQUETAS PESSOAIS — núcleo visual reutilizável.
// A bolinha na coluna, a legenda e os itens de menu "Etiquetar".
// Usado (piloto) nas Pastas; será reaproveitado nas demais telas.
// `definicoes` = [{ slot, cor, significado }] do usuário logado no módulo.
// ============================================================

import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { etiquetasAPI } from '../services/api';
import useEscFechar from '../hooks/useEscFechar';
import { formatarDataHora } from '../utils/formatters';

// Módulos com etiqueta PESSOAL. A CONFIGURAÇÃO (5 cores) vale para todos;
// a EXIBIÇÃO na tela é ligada por rollout (hoje: só "pastas"/Processos).
export const MODULOS_ETIQUETA_PESSOAL = [
  { chave: 'publicacoes', label: 'Publicações' },
  { chave: 'pastas',      label: 'Processos' },
  { chave: 'prazos',      label: 'Prazos' },
  { chave: 'tarefas',     label: 'Tarefas' },
  { chave: 'audiencias',  label: 'Audiências' },
  { chave: 'pericias',    label: 'Perícias' },
];

// Módulos que já têm etiqueta DO ESCRITÓRIO ligada (cresce a cada tela nova).
export const MODULOS_ETIQUETA_ESCRITORIO = [
  { chave: 'processos', label: 'Processos' },
  { chave: 'pessoas',   label: 'Pessoas' },
];

// Cores iniciais sugeridas para os 5 slots (só aparecem no editor da Aparência).
export const CORES_ETIQUETA_PADRAO = ['#e24b4a', '#ef9f27', '#378add', '#639922', '#7f77dd'];

// Monta 5 linhas para o editor, mesclando o que já está salvo (usado na Aparência e no admin).
export function cincoLinhasEtiqueta(salvas) {
  const base = CORES_ETIQUETA_PADRAO.map((cor, i) => ({ slot: i + 1, cor, significado: '' }));
  if (!salvas || !salvas.length) return base;
  return base.map(row => {
    const s = salvas.find(x => Number(x.slot) === row.slot);
    return s ? { slot: row.slot, cor: s.cor, significado: s.significado || '' } : row;
  });
}

// Editor das 5 cores + significados. `rows`=[{slot,cor,significado}]; onChange(i, campo, valor).
// `emUso`=[slots] que já estão marcados em algum registro — a cor fica travada e o slot não
// pode ficar vazio (só o nome/significado continua editável). O backend também protege isso
// mesmo se esta trava visual for contornada.
export function EditorEtiquetasCinco({ rows, onChange, emUso = [] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {rows.map((row, i) => {
        const travada = emUso.includes(row.slot);
        return (
          <div key={row.slot} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="color" value={row.cor} disabled={travada}
              onChange={e => onChange(i, 'cor', e.target.value)}
              title={travada ? 'Cor em uso — não pode ser trocada' : ''}
              style={{
                width: 40, height: 28, border: 'none', background: 'none', padding: 0, flexShrink: 0,
                cursor: travada ? 'not-allowed' : 'pointer', opacity: travada ? 0.5 : 1,
              }} />
            <input className="form-control" maxLength={60}
              placeholder={`Significado da cor ${i + 1} (ex.: aguardando retorno)`}
              value={row.significado} onChange={e => onChange(i, 'significado', e.target.value)}
              style={{ flex: 1 }} />
            {travada && (
              <span style={{ fontSize: '11px', color: '#888', whiteSpace: 'nowrap' }}
                title="Essa cor já está em uso em registros existentes — não pode mudar de cor nem ser removida, só o nome">
                🔒 em uso
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Hook que uma tela de lista usa para ter etiqueta PESSOAL com o mínimo de código:
// carrega as 5 definições do módulo e devolve marcar(registroId, slot) que atualiza a linha.
// Espera que os itens de `lista` tenham `.id` e o campo `etiqueta_pessoal`.
export function useEtiquetasPessoais(modulo, lista, setLista) {
  const [defs, setDefs] = useState([]);
  useEffect(() => {
    etiquetasAPI.definicoes(modulo).then(r => { if (r.data?.ok) setDefs(r.data.dados || []); }).catch(() => {});
  }, [modulo]);
  const marcar = async (registroId, slot) => {
    try {
      await etiquetasAPI.marcar({ modulo, registro_id: registroId, slot });
      setLista(ls => ls.map(x => (x.id === registroId ? { ...x, etiqueta_pessoal: slot } : x)));
    } catch { toast.error('Não foi possível salvar a etiqueta'); }
  };
  return { defs, marcar };
}

// Hook equivalente para etiqueta DO ESCRITÓRIO (compartilhada): carrega o catálogo do módulo
// e devolve marcar(registroId, slot). Atualiza `etiqueta_escritorio` da linha.
export function useEtiquetasEscritorio(moduloCatalogo, moduloMarcar, lista, setLista) {
  const [catalogo, setCatalogo] = useState([]);
  useEffect(() => {
    etiquetasAPI.catalogo(moduloCatalogo).then(r => { if (r.data?.ok) setCatalogo(r.data.dados || []); }).catch(() => {});
  }, [moduloCatalogo]);
  const marcar = async (registroId, slot) => {
    try {
      await etiquetasAPI.marcarEscritorio({ modulo: moduloMarcar, registro_id: registroId, slot });
      setLista(ls => ls.map(x => (x.id === registroId ? { ...x, etiqueta_escritorio: slot } : x)));
    } catch (e) { toast.error(e.response?.data?.mensagem || 'Não foi possível salvar a etiqueta do escritório'); }
  };
  return { catalogo, marcar };
}

export function defDoSlot(definicoes, slot) {
  if (!slot) return null;
  return (definicoes || []).find(d => Number(d.slot) === Number(slot)) || null;
}

// A bolinha na célula da tabela (ou um traço neutro quando não há etiqueta).
export function EtiquetaCelula({ slot, definicoes }) {
  const def = defDoSlot(definicoes, slot);
  if (!def) return <span style={{ color: '#c9ccd1', fontSize: 16 }} title="Sem etiqueta">–</span>;
  return (
    <span title={def.significado || 'Etiqueta'}
      style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
        background: def.cor, verticalAlign: 'middle' }} />
  );
}

// Legenda com as etiquetas configuradas (some se o usuário não definiu nenhuma).
// Modo FILTRO opcional: passe `onFiltrar` (e `filtroAtivo`) para os chips virarem
// botões — clicar liga/desliga o filtro daquela cor. Sem `onFiltrar` = só exibição.
export function LegendaEtiquetasPessoais({ definicoes, titulo = 'Minhas etiquetas', filtroAtivo = null, onFiltrar = null }) {
  const defs = (definicoes || []).filter(d => d.cor && d.significado);
  if (defs.length === 0) return null;
  const clicavel = typeof onFiltrar === 'function';

  const conteudo = d => (
    <>
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: d.cor, display: 'inline-block' }} />
      {d.significado}
    </>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 0 10px' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>{titulo}:</span>
      {defs.map(d => {
        const ativo = Number(filtroAtivo) === Number(d.slot);
        const base = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
          borderRadius: 20, padding: '3px 10px', background: ativo ? '#eff6ff' : '#fff',
          border: ativo ? '2px solid #2563eb' : '1px solid #e5e7eb' };
        if (!clicavel) return <span key={d.slot} style={base}>{conteudo(d)}</span>;
        return (
          <button key={d.slot} type="button" title={ativo ? 'Clique para tirar o filtro' : 'Filtrar por esta etiqueta'}
            onClick={() => onFiltrar(ativo ? null : Number(d.slot))}
            style={{ ...base, cursor: 'pointer' }}>
            {conteudo(d)}
          </button>
        );
      })}
      {clicavel && filtroAtivo && (
        <button type="button" onClick={() => onFiltrar(null)}
          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 12 }}>
          limpar filtro
        </button>
      )}
    </div>
  );
}

// Bolinha usada como "ícone" nos itens do MenuAcoes (aceita JSX no `icone`).
function bolinha(cor) {
  return <span style={{ width: 11, height: 11, borderRadius: '50%', background: cor, display: 'inline-block' }} />;
}

// Monta os itens de MenuAcoes para etiquetar um registro.
// onMarcar(slot|null): aplica a cor ou remove.
export function itensMenuEtiqueta({ definicoes, slotAtual, onMarcar }) {
  const defs = (definicoes || []).filter(d => d.cor && d.significado);
  const itens = defs.map(d => ({
    label: d.significado,
    icone: bolinha(d.cor),
    onClick: () => onMarcar(Number(d.slot)),
  }));
  if (slotAtual) {
    itens.push({ label: 'Remover etiqueta', icone: '⊘', onClick: () => onMarcar(null) });
  }
  return itens;
}

// Versão AGRUPADA para etiquetas PESSOAIS: em vez de jogar as cores soltas no menu ⋮,
// devolve UM único item "Etiquetas" com um submenu lateral (as cores + "Remover etiqueta").
// Reaproveita itensMenuEtiqueta. Retorna null quando não há nada a mostrar
// (sem cores configuradas e sem etiqueta aplicada) — o MenuAcoes ignora itens null.
export function itemEtiquetasSubmenu({ definicoes, slotAtual, onMarcar }) {
  const sub = itensMenuEtiqueta({ definicoes, slotAtual, onMarcar });
  if (sub.length === 0) return null;
  return { label: 'Etiquetas', icone: '🏷️', submenu: sub };
}

// Versão AGRUPADA para etiqueta DO ESCRITÓRIO: em vez de jogar as cores soltas no menu ⋮,
// devolve UM único item "Etiqueta" com submenu lateral — as cores + "Remover etiqueta" (só
// pra quem tem a permissão de aplicar) + "Histórico da etiqueta" (sempre; ver é livre pra
// todos, igual à bolinha). `onAbrirHistorico` recebe { modulo, registroId }.
export function itemEtiquetaEscritorioSubmenu({ definicoes, slotAtual, podeAplicar, onMarcar, modulo, registroId, onAbrirHistorico }) {
  const sub = podeAplicar ? itensMenuEtiqueta({ definicoes, slotAtual, onMarcar }) : [];
  sub.push({ label: 'Histórico da etiqueta', icone: '🕓', onClick: () => onAbrirHistorico({ modulo, registroId }) });
  const def = defDoSlot(definicoes, slotAtual);
  return { label: 'Etiqueta', icone: def ? bolinha(def.cor) : '🏷️', submenu: sub };
}

// Modal simples: lista quem aplicou/trocou/removeu a etiqueta do escritório desse
// registro, e quando (mais recente primeiro). `catalogo`=[{slot,cor,significado}]
// pra mostrar a cor/nome de cada lado da troca (sem ele, mostra só a cor crua).
export function ModalHistoricoEtiquetaEscritorio({ modulo, registroId, catalogo, onFechar }) {
  const [linhas, setLinhas]     = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]         = useState('');
  const overlayRef = useEscFechar(onFechar);

  useEffect(() => {
    let cancelado = false;
    etiquetasAPI.historicoEscritorio(modulo, registroId)
      .then(r => { if (!cancelado) setLinhas(r.data?.dados || []); })
      .catch(e => { if (!cancelado) setErro(e.response?.data?.mensagem || 'Não foi possível carregar o histórico.'); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [modulo, registroId]);

  function ladoEtiqueta(slot) {
    const def = defDoSlot(catalogo, slot);
    if (!slot) return <span style={{ color: '#888' }}>Sem etiqueta</span>;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: def?.cor || '#ccc', display: 'inline-block' }} />
        {def?.significado || `Cor ${slot}`}
      </span>
    );
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1200 }} ref={overlayRef}
      onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal-box" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h3>Histórico da etiqueta</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {carregando && <p className="lista-vazia">Carregando...</p>}
          {!carregando && erro && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
              padding: '8px 12px', borderRadius: 6, fontSize: 13 }}>
              {erro}
            </div>
          )}
          {!carregando && !erro && linhas.length === 0 && (
            <p className="lista-vazia">Nenhuma alteração registrada ainda para este registro.</p>
          )}
          {!carregando && !erro && linhas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {linhas.map((l, i) => (
                <div key={i} style={{
                  border: '1px solid #e8ecf0', borderRadius: '6px', padding: '10px 12px', fontSize: '13px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {ladoEtiqueta(l.slot_anterior)}
                    <span style={{ color: '#aaa' }}>→</span>
                    {ladoEtiqueta(l.slot_novo)}
                  </div>
                  <div style={{ color: '#888', fontSize: '11px', marginTop: '4px' }}>
                    {l.usuario_nome} · {formatarDataHora(l.criado_em)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
