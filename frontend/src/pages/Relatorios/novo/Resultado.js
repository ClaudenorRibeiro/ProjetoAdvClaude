// ============================================================
// RELATÓRIOS — RESULTADO: barra de ações (voltar, editar, perguntas, Excel) e a tabela certa
// (uma linha por registro ou agrupada). Nada é guardado: cada abertura consulta o banco de novo
// e respeita as permissões de agora.
// ============================================================
import React, { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { relatoriosAPI } from '../../../services/api';
import ResultadoDetalhado from './ResultadoDetalhado';
import ResultadoAgrupado from './ResultadoAgrupado';
import DetalheGrupo from './DetalheGrupo';
import { temAgrupamento } from './receita';

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

export default function Resultado({ receita, modelo, parametros, temPerguntas, onVoltar, onEditar, onPerguntas }) {
  const [exportando, setExportando] = useState(false);
  const [incluirDetalhes, setIncluirDetalhes] = useState(false);
  const [grupoAberto, setGrupoAberto] = useState(null);
  const agrupado = temAgrupamento(receita);

  // objeto estável: só muda quando a receita, o relatório salvo ou as respostas mudam (evita consultar de novo à toa)
  const corpoBase = useMemo(() => ({
    ...(modelo ? { modelo_id: modelo.id } : { receita }),
    ...(parametros?.length ? { parametros } : {}),
  }), [modelo, receita, parametros]);

  async function exportar() {
    setExportando(true);
    try {
      const res = await relatoriosAPI.exportar({ ...corpoBase, formato: 'xlsx', ...(agrupado ? { incluirDetalhes } : {}) });
      baixar(res.data, res.headers['content-disposition'], 'relatorio.xlsx');
    } catch (err) {
      const corpoErro = await textoDoBlob(err);
      toast.error(corpoErro?.mensagem || 'Não foi possível exportar o relatório');
    } finally { setExportando(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        <button className="btn btn-secondary" onClick={onVoltar}>← Voltar</button>
        <button className="btn btn-secondary" onClick={onEditar}>Editar relatório</button>
        {temPerguntas && <button className="btn btn-secondary" onClick={onPerguntas}>Alterar respostas</button>}
        <button className="btn btn-primary" disabled={exportando} onClick={exportar}>{exportando ? 'Gerando Excel...' : 'Exportar Excel'}</button>
        {agrupado && (
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={incluirDetalhes} onChange={e => setIncluirDetalhes(e.target.checked)} />
            Incluir os itens (aba Detalhes)
          </label>
        )}
        <span style={{ marginLeft: 'auto', color: '#374151' }}>
          {modelo ? <strong>{modelo.nome}</strong> : <em>Relatório não salvo</em>}
        </span>
      </div>

      {agrupado
        ? <ResultadoAgrupado corpoBase={corpoBase} onAbrirGrupo={(chaves, rotulos) => setGrupoAberto({ chaves, rotulos })}
            preferencias={modelo?.preferencias} nomeRelatorio={modelo?.nome}
            aoMudarPreferencias={modelo ? (p) => relatoriosAPI.salvarPreferencias(modelo.id, p).catch(() => {}) : undefined} />
        : <ResultadoDetalhado corpoBase={corpoBase} limiteInicial={modelo?.preferencias?.linhas_por_pagina || 50}
            aoMudarLimite={modelo ? (n) => relatoriosAPI.salvarPreferencias(modelo.id, { linhas_por_pagina: n }).catch(() => {}) : undefined} />}

      {grupoAberto && <DetalheGrupo corpoBase={corpoBase} chaves={grupoAberto.chaves} rotulos={grupoAberto.rotulos} onFechar={() => setGrupoAberto(null)} />}
    </div>
  );
}
