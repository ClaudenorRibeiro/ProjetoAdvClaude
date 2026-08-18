// ============================================================
// MODAL "APARÊNCIA" — personalização de cores por usuário.
// Fase 1: seção "Cores da agenda" (usuarios.cores_agenda).
// Fase 2: seção "Cores do menu lateral" (usuarios.cores_menu).
// Cada seção tem "Restaurar padrão"; vazio = padrão do sistema.
// ============================================================

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI, etiquetasAPI } from '../services/api';
import { EditorEtiquetasCinco, cincoLinhasEtiqueta, MODULOS_ETIQUETA_PESSOAL } from './Etiquetas';
import { CORES_AGENDA_PADRAO, CORES_AGENDA_LABELS, coresEfetivas, corTextoPara } from '../utils/coresAgenda';
import { CORES_MENU_PADRAO, CORES_MENU_LABELS, coresMenuEfetivas, hexParaRgba } from '../utils/coresMenu';
import { COR_LINHA_PADRAO, COR_LINHA_LIDA_PADRAO } from '../utils/coresLinha';
import useEscFechar from '../hooks/useEscFechar';

export default function ModalAparencia({ onFechar }) {
  const { usuario, atualizarCoresAgenda, atualizarCoresMenu, atualizarCorLinha, atualizarCorLinhaLida } = useAuth();
  const [cores, setCores]         = useState(() => coresEfetivas(usuario?.cores_agenda));
  const [coresMenu, setCoresMenu] = useState(() => coresMenuEfetivas(usuario?.cores_menu));
  const [corLinha, setCorLinha]   = useState(() => usuario?.cor_linha || COR_LINHA_PADRAO);
  const [corLinhaLida, setCorLinhaLida] = useState(() => usuario?.cor_linha_lida || COR_LINHA_LIDA_PADRAO);
  const [salvando, setSalvando]   = useState(false);
  const [aviso, setAviso]         = useState('');
  const overlayRef = useEscFechar(onFechar);

  // Minhas etiquetas (piloto: módulo "pastas" / Processos). 5 slots; significado vazio = slot não usado.
  const [etqModulo, setEtqModulo] = useState('pastas');   // módulo selecionado no seletor
  const [etqMap, setEtqMap]       = useState({});          // { modulo: [5 linhas] } — carregado sob demanda
  const [etqEmUsoMap, setEtqEmUsoMap] = useState({});       // { modulo: [slots já em uso] }
  // Carrega as 5 cores + quais slots já estão em uso do módulo selecionado (uma vez por módulo).
  // etqMap fora das deps de propósito (senão recarregaria a cada edição); o guard evita recarregar
  // e apagar o que já foi editado.
  useEffect(() => {
    if (etqMap[etqModulo]) return;
    Promise.all([etiquetasAPI.definicoes(etqModulo), etiquetasAPI.emUso(etqModulo)])
      .then(([r, u]) => {
        setEtqMap(m => ({ ...m, [etqModulo]: cincoLinhasEtiqueta(r.data?.dados) }));
        setEtqEmUsoMap(m => ({ ...m, [etqModulo]: u.data?.dados || [] }));
      })
      .catch(() => {
        setEtqMap(m => ({ ...m, [etqModulo]: cincoLinhasEtiqueta() }));
        setEtqEmUsoMap(m => ({ ...m, [etqModulo]: [] }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etqModulo]);
  const etqRows  = etqMap[etqModulo] || cincoLinhasEtiqueta();
  const etqEmUso = etqEmUsoMap[etqModulo] || [];
  const setEtq = (i, campo, valor) => setEtqMap(m => ({
    ...m,
    [etqModulo]: (m[etqModulo] || cincoLinhasEtiqueta()).map((r, j) => (j === i ? { ...r, [campo]: valor } : r)),
  }));

  // Cada seção está no padrão? (para desabilitar "Restaurar" e gravar null = padrão)
  const agendaEhPadrao = JSON.stringify(cores)     === JSON.stringify(CORES_AGENDA_PADRAO);
  const menuEhPadrao   = JSON.stringify(coresMenu) === JSON.stringify(CORES_MENU_PADRAO);
  // O grupo "linhas" cobre as duas cores (mouse + lida).
  const linhasEhPadrao = corLinha === COR_LINHA_PADRAO && corLinhaLida === COR_LINHA_LIDA_PADRAO;

  const setCor        = (k, v) => setCores(c => ({ ...c, [k]: v }));
  const setCorMenu    = (k, v) => setCoresMenu(c => ({ ...c, [k]: v }));
  const restaurarAgenda = () => { setCores({ ...CORES_AGENDA_PADRAO }); setAviso(''); };
  const restaurarMenu   = () => { setCoresMenu({ ...CORES_MENU_PADRAO }); setAviso(''); };
  const restaurarLinhas = () => { setCorLinha(COR_LINHA_PADRAO); setCorLinhaLida(COR_LINHA_LIDA_PADRAO); setAviso(''); };

  async function salvar() {
    setSalvando(true);
    try {
      // Salva as seções. Cada cor manda null quando está no padrão (limpa a coluna).
      const respAgenda = await authAPI.salvarCoresAgenda(agendaEhPadrao ? null : cores);
      const respMenu   = await authAPI.salvarCoresMenu(menuEhPadrao ? null : coresMenu);
      const respLinha  = await authAPI.salvarCorLinha(corLinha === COR_LINHA_PADRAO ? null : corLinha);
      const respLida   = await authAPI.salvarCorLinhaLida(corLinhaLida === COR_LINHA_LIDA_PADRAO ? null : corLinhaLida);
      // Salva as etiquetas pessoais de CADA módulo que o usuário abriu (cada um guarda as suas).
      const modulosEtq = Object.keys(etqMap);
      const respsEtq   = await Promise.all(modulosEtq.map(m => etiquetasAPI.salvarDefinicoes(m, etqMap[m])));
      const etqOk      = respsEtq.every(r => r.data.ok);
      if (respAgenda.data.ok && respMenu.data.ok && respLinha.data.ok && respLida.data.ok && etqOk) {
        atualizarCoresAgenda(respAgenda.data.dados?.cores_agenda || null);
        atualizarCoresMenu(respMenu.data.dados?.cores_menu || null);
        atualizarCorLinha(respLinha.data.dados?.cor_linha || null);
        atualizarCorLinhaLida(respLida.data.dados?.cor_linha_lida || null);

        // Algum slot em uso foi protegido (cor/exclusão ignorada)? Recarrega esses módulos
        // com o que realmente ficou salvo e avisa dentro do próprio modal, sem fechar.
        const comProtegidos = modulosEtq
          .map((m, i) => ({ m, protegidos: respsEtq[i].data?.dados?.protegidos || [] }))
          .filter(x => x.protegidos.length > 0);
        if (comProtegidos.length > 0) {
          const atualizados = await Promise.all(comProtegidos.map(x => etiquetasAPI.definicoes(x.m)));
          setEtqMap(m => {
            const novo = { ...m };
            comProtegidos.forEach((x, i) => { novo[x.m] = cincoLinhasEtiqueta(atualizados[i].data?.dados); });
            return novo;
          });
          const nomes = comProtegidos
            .map(x => MODULOS_ETIQUETA_PESSOAL.find(mm => mm.chave === x.m)?.label || x.m)
            .join(', ');
          setAviso(`Algumas cores já estão em uso em registros existentes (${nomes}) e por isso não podem mudar de cor nem ser removidas — só o nome. As demais alterações foram salvas normalmente.`);
          setSalvando(false);
          return;
        }
        onFechar();
      } else {
        setAviso(respAgenda.data.mensagem || respMenu.data.mensagem || respLinha.data.mensagem || respLida.data.mensagem || 'Não foi possível salvar as cores.');
      }
    } catch (err) {
      setAviso(err.response?.data?.mensagem || 'Não foi possível salvar as cores.');
    } finally {
      setSalvando(false);
    }
  }

  // Texto legível sobre o fundo escolhido do menu (para a prévia ao vivo).
  const textoMenu = corTextoPara(coresMenu.fundo);

  return (
    <div className="modal-overlay" ref={overlayRef}
      onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal-box" style={{ maxWidth: '460px' }}>
        <div className="modal-header">
          <h3>🎨 Aparência</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {aviso && (
            <div style={{ background: '#fff4e5', border: '1px solid #ffcf99', color: '#8a5300',
              padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>
              {aviso}
            </div>
          )}

          {/* ---- SEÇÃO: CORES DA AGENDA ---- */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 4px' }}>
            <span style={{ fontWeight: 600, color: '#374151' }}>Cores da agenda</span>
            <button onClick={restaurarAgenda} disabled={salvando || agendaEhPadrao}
              style={{ background: 'none', border: 'none', color: agendaEhPadrao ? '#c0c4cc' : '#2563eb',
                cursor: agendaEhPadrao ? 'default' : 'pointer', fontSize: 12 }}>
              Restaurar padrão
            </button>
          </div>
          <p style={{ color: '#6b7280', fontSize: 12, margin: '0 0 12px' }}>
            Escolha a cor de cada tipo de item. O texto se ajusta sozinho para ficar legível.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.keys(CORES_AGENDA_PADRAO).map(k => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: cores[k], color: corTextoPara(cores[k]), borderRadius: '6px', padding: '8px 12px' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{CORES_AGENDA_LABELS[k]}</span>
                <input type="color" value={cores[k]} onChange={e => setCor(k, e.target.value)}
                  style={{ width: 40, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
              </div>
            ))}
          </div>

          {/* ---- SEÇÃO: CORES DO MENU LATERAL ---- */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 0 4px' }}>
            <span style={{ fontWeight: 600, color: '#374151' }}>Cores do menu lateral</span>
            <button onClick={restaurarMenu} disabled={salvando || menuEhPadrao}
              style={{ background: 'none', border: 'none', color: menuEhPadrao ? '#c0c4cc' : '#2563eb',
                cursor: menuEhPadrao ? 'default' : 'pointer', fontSize: 12 }}>
              Restaurar padrão
            </button>
          </div>
          <p style={{ color: '#6b7280', fontSize: 12, margin: '0 0 12px' }}>
            Escolha o fundo e a cor de destaque do menu. O texto se ajusta sozinho para ficar legível.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.keys(CORES_MENU_PADRAO).map(k => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: coresMenu[k], color: corTextoPara(coresMenu[k]), borderRadius: '6px', padding: '8px 12px' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{CORES_MENU_LABELS[k]}</span>
                <input type="color" value={coresMenu[k]} onChange={e => setCorMenu(k, e.target.value)}
                  style={{ width: 40, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
              </div>
            ))}
          </div>

          {/* Prévia ao vivo do menu */}
          <p style={{ color: '#6b7280', fontSize: 11, margin: '10px 0 4px' }}>Prévia:</p>
          <div style={{ background: coresMenu.fundo, borderRadius: 6, padding: 8,
            display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ color: textoMenu, padding: '7px 12px', fontSize: 13 }}>Processos</div>
            <div style={{ color: coresMenu.destaque, background: hexParaRgba(coresMenu.destaque, 0.15),
              borderRight: `3px solid ${coresMenu.destaque}`, padding: '7px 12px', fontSize: 13, fontWeight: 600 }}>
              Pessoas
            </div>
            <div style={{ color: textoMenu, padding: '7px 12px', fontSize: 13 }}>Prazos</div>
          </div>

          {/* ---- SEÇÃO: COR DE DESTAQUE DA LINHA (mouse + publicação lida) ---- */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 0 4px' }}>
            <span style={{ fontWeight: 600, color: '#374151' }}>Cor de destaque da Linha</span>
            <button onClick={restaurarLinhas} disabled={salvando || linhasEhPadrao}
              style={{ background: 'none', border: 'none', color: linhasEhPadrao ? '#c0c4cc' : '#2563eb',
                cursor: linhasEhPadrao ? 'default' : 'pointer', fontSize: 12 }}>
              Restaurar padrão
            </button>
          </div>
          <p style={{ color: '#6b7280', fontSize: 12, margin: '0 0 12px' }}>
            Cores das linhas das tabelas do sistema.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            border: '1px solid #e5e7eb', borderRadius: '6px', padding: '8px 12px', marginBottom: '8px' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Linha do mouse</span>
            <input type="color" value={corLinha} onChange={e => setCorLinha(e.target.value)}
              style={{ width: 40, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            border: '1px solid #e5e7eb', borderRadius: '6px', padding: '8px 12px' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Publicação já lida</span>
            <input type="color" value={corLinhaLida} onChange={e => setCorLinhaLida(e.target.value)}
              style={{ width: 40, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
          </div>
          {/* Prévia ao vivo: linha normal, sob o mouse e publicação já lida */}
          <p style={{ color: '#6b7280', fontSize: 11, margin: '10px 0 4px' }}>Prévia:</p>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', fontSize: 13, color: '#444', borderBottom: '1px solid #eef2f7' }}>
              Linha normal
            </div>
            <div style={{ padding: '8px 12px', fontSize: 13, color: '#444', borderBottom: '1px solid #eef2f7', background: corLinha }}>
              Linha sob o mouse
            </div>
            <div style={{ padding: '8px 12px', fontSize: 13, color: '#444', background: corLinhaLida }}>
              Publicação já lida
            </div>
          </div>

          {/* ---- SEÇÃO: MINHAS ETIQUETAS (Processos / Pastas) ---- */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 0 4px' }}>
            <span style={{ fontWeight: 600, color: '#374151' }}>Minhas etiquetas</span>
          </div>
          <p style={{ color: '#6b7280', fontSize: 12, margin: '0 0 10px' }}>
            Até 5 cores só suas (ninguém mais vê), <strong>separadas por módulo</strong>. Dê um significado a cada cor
            para poder usá-la. Cor sem significado fica desativada.
          </p>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Módulo</label>
            <select className="form-control" value={etqModulo} onChange={e => setEtqModulo(e.target.value)}>
              {MODULOS_ETIQUETA_PESSOAL.map(m => <option key={m.chave} value={m.chave}>{m.label}</option>)}
            </select>
          </div>
          <EditorEtiquetasCinco rows={etqRows} onChange={setEtq} emUso={etqEmUso} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
