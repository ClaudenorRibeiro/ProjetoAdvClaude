// ============================================================
// RELATÓRIOS — RESULTADO na tela, com páginas e exportação em Excel.
// Nada é guardado: cada abertura consulta o banco de novo e respeita as permissões de agora.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { relatoriosAPI } from '../../../services/api';
import TabelaResultado from './TabelaResultado';
import { mensagemDeErro } from './Construtor';

const OPCOES_LINHAS = [10, 25, 50, 100, 200];

async function textoDoBlob(err) {
  try { return JSON.parse(await err.response.data.text()); } catch { return null; }
}

function baixar(blob, cabecalho, padrao) {
  const m = /filename\*=UTF-8''([^;]+)/.exec(cabecalho || '');
  const nome = m ? decodeURIComponent(m[1]) : padrao;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Resultado({ receita, modelo, onVoltar, onEditar }) {
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(modelo?.preferencias?.linhas_por_pagina || 50);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [exportando, setExportando] = useState(false);

  const corpo = useCallback((extra = {}) => (modelo ? { modelo_id: modelo.id, ...extra } : { receita, ...extra }), [modelo, receita]);

  useEffect(() => {
    let ativo = true;
    setCarregando(true); setErro('');
    relatoriosAPI.executar(corpo({ pagina, limite }))
      .then(({ data }) => { if (ativo) setDados(data.dados); })
      .catch(err => { if (ativo) setErro(mensagemDeErro(err, 'Não foi possível gerar o relatório')); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [corpo, pagina, limite]);

  function trocarLimite(valor) {
    setLimite(valor); setPagina(1);
    if (modelo) relatoriosAPI.salvarPreferencias(modelo.id, { linhas_por_pagina: valor }).catch(() => {});
  }

  async function exportar() {
    setExportando(true);
    try {
      const res = await relatoriosAPI.exportar(corpo({ formato: 'xlsx' }));
      baixar(res.data, res.headers['content-disposition'], 'relatorio.xlsx');
    } catch (err) {
      const corpoErro = await textoDoBlob(err);
      toast.error(corpoErro?.mensagem || 'Não foi possível exportar o relatório');
    } finally { setExportando(false); }
  }

  const total = dados?.total ?? 0;
  const visiveis = dados ? Math.min(total, dados.limiteTela) : 0;
  const totalPaginas = Math.max(1, Math.ceil(visiveis / limite));
  const de = total ? (pagina - 1) * limite + 1 : 0;
  const ate = Math.min(pagina * limite, visiveis);

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        <button className="btn btn-secondary" onClick={onVoltar}>← Voltar</button>
        <button className="btn btn-secondary" onClick={() => onEditar(dados?.receita || receita)}>Editar relatório</button>
        <button className="btn btn-primary" disabled={exportando || carregando || !!erro} onClick={exportar}>
          {exportando ? 'Gerando Excel...' : 'Exportar Excel'}</button>
        <span style={{ marginLeft: 'auto', color: '#374151' }}>
          {modelo ? <strong>{modelo.nome}</strong> : <em>Relatório não salvo</em>}
        </span>
      </div>

      {erro && <div className="card" role="alert" style={{ color: '#b91c1c' }}>{erro}</div>}
      {!erro && (
        <div className="card">
          {carregando && !dados ? <div className="loading">Carregando...</div> : dados && (
            <>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
                <span>{total.toLocaleString('pt-BR')} registro(s){total ? ` — mostrando ${de}–${ate}` : ''}</span>
                <label style={{ marginLeft: 'auto' }}>Linhas por página{' '}
                  <select value={limite} aria-label="Linhas por página" onChange={e => trocarLimite(Number(e.target.value))}>
                    {OPCOES_LINHAS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              {dados.truncado && (
                <p role="status" style={{ background: '#fef3c7', padding: '8px', borderRadius: '6px' }}>
                  Há {total.toLocaleString('pt-BR')} registros, mas a tela mostra só os primeiros {dados.limiteTela.toLocaleString('pt-BR')}.
                  Refine os filtros ou exporte para o Excel.
                </p>
              )}
              <div style={{ opacity: carregando ? 0.5 : 1 }}><TabelaResultado colunas={dados.colunas} linhas={dados.linhas} /></div>
              {totalPaginas > 1 && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', marginTop: '12px' }}>
                  <button className="btn btn-secondary" disabled={pagina <= 1 || carregando} onClick={() => setPagina(p => p - 1)}>‹ Anterior</button>
                  <span>Página {pagina} de {totalPaginas}</span>
                  <button className="btn btn-secondary" disabled={pagina >= totalPaginas || carregando} onClick={() => setPagina(p => p + 1)}>Próxima ›</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
