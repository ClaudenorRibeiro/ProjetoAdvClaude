// ============================================================
// ETIQUETAS PESSOAIS — núcleo visual reutilizável.
// A bolinha na coluna, a legenda e os itens de menu "Etiquetar".
// Usado (piloto) nas Pastas; será reaproveitado nas demais telas.
// `definicoes` = [{ slot, cor, significado }] do usuário logado no módulo.
// ============================================================

import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { etiquetasAPI } from '../services/api';

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
export function EditorEtiquetasCinco({ rows, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {rows.map((row, i) => (
        <div key={row.slot} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="color" value={row.cor} onChange={e => onChange(i, 'cor', e.target.value)}
            style={{ width: 40, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }} />
          <input className="form-control" maxLength={60}
            placeholder={`Significado da cor ${i + 1} (ex.: aguardando retorno)`}
            value={row.significado} onChange={e => onChange(i, 'significado', e.target.value)}
            style={{ flex: 1 }} />
        </div>
      ))}
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
