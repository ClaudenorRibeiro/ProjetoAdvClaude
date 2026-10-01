// ============================================================
// RELATÓRIOS — RESULTADO: barra de ações (voltar, editar, perguntas, Excel/PDF/Word) e a tabela certa
// (uma linha por registro ou agrupada). Nada é guardado: cada abertura consulta o banco de novo
// e respeita as permissões de agora.
// ============================================================
import React, { useCallback, useMemo, useState } from 'react';
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

const FORMATOS = [
  { valor: 'xlsx', rotulo: 'Excel', padrao: 'relatorio.xlsx', primario: true },
  { valor: 'pdf', rotulo: 'PDF', padrao: 'relatorio.pdf' },
  { valor: 'docx', rotulo: 'Word', padrao: 'relatorio.docx' },
];

export default function Resultado({ receita, modelo, parametros, temPerguntas, onVoltar, onEditar, onPerguntas }) {
  const [exportando, setExportando] = useState(null);          // 'xlsx' | 'pdf' | 'docx' | null
  const [incluirDetalhes, setIncluirDetalhes] = useState(false);
  const [incluirGrafico, setIncluirGrafico] = useState(true);
  const [obterGrafico, setObterGrafico] = useState(null);       // função que gera o PNG do gráfico visível (ou null)
  const registrarGrafico = useCallback((fn) => setObterGrafico(() => fn), []);
  const [grupoAberto, setGrupoAberto] = useState(null);
  const agrupado = temAgrupamento(receita);

  // objeto estável: só muda quando a receita, o relatório salvo ou as respostas mudam (evita consultar de novo à toa)
  const corpoBase = useMemo(() => ({
    ...(modelo ? { modelo_id: modelo.id } : { receita }),
    ...(parametros?.length ? { parametros } : {}),
  }), [modelo, receita, parametros]);

  async function exportar(formato) {
    setExportando(formato.valor);
    try {
      const corpo = { ...corpoBase, formato: formato.valor, ...(agrupado ? { incluirDetalhes } : {}) };
      // O gráfico só vai para PDF/Word, e só se estiver na tela e a opção marcada
      if (formato.valor !== 'xlsx' && agrupado && obterGrafico && incluirGrafico) corpo.grafico = await obterGrafico();
      const res = await relatoriosAPI.exportar(corpo);
      baixar(res.data, res.headers['content-disposition'], formato.padrao);
    } catch (err) {
      const corpoErro = await textoDoBlob(err);
      toast.error(corpoErro?.mensagem || err?.message || `Não foi possível exportar o relatório em ${formato.rotulo}`);
    } finally { setExportando(null); }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        <button className="btn btn-secondary" onClick={onVoltar}>← Voltar</button>
        <button className="btn btn-secondary" onClick={onEditar}>Editar relatório</button>
        {temPerguntas && <button className="btn btn-secondary" onClick={onPerguntas}>Alterar respostas</button>}
        {FORMATOS.map(f => (
          <button key={f.valor} className={`btn ${f.primario ? 'btn-primary' : 'btn-secondary'}`} disabled={!!exportando} onClick={() => exportar(f)}>
            {exportando === f.valor ? `Gerando ${f.rotulo}...` : `Exportar ${f.rotulo}`}
          </button>
        ))}
        {agrupado && (
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}
            title="Excel: aba Detalhes. PDF e Word: seção Itens (até 1.000 linhas).">
            <input type="checkbox" checked={incluirDetalhes} onChange={e => setIncluirDetalhes(e.target.checked)} />
            Incluir os itens (aba Detalhes)
          </label>
        )}
        {agrupado && obterGrafico && (
          <label style={{ display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }} title="O gráfico que está na tela entra no PDF e no Word.">
            <input type="checkbox" checked={incluirGrafico} onChange={e => setIncluirGrafico(e.target.checked)} />
            Incluir o gráfico (PDF e Word)
          </label>
        )}
        <span style={{ marginLeft: 'auto', color: '#374151' }}>
          {modelo ? <strong>{modelo.nome}</strong> : <em>Relatório não salvo</em>}
        </span>
      </div>

      {agrupado
        ? <ResultadoAgrupado corpoBase={corpoBase} onAbrirGrupo={(chaves, rotulos) => setGrupoAberto({ chaves, rotulos })}
            preferencias={modelo?.preferencias} nomeRelatorio={modelo?.nome} registrarGrafico={registrarGrafico}
            aoMudarPreferencias={modelo ? (p) => relatoriosAPI.salvarPreferencias(modelo.id, p).catch(() => {}) : undefined} />
        : <ResultadoDetalhado corpoBase={corpoBase} limiteInicial={modelo?.preferencias?.linhas_por_pagina || 50}
            aoMudarLimite={modelo ? (n) => relatoriosAPI.salvarPreferencias(modelo.id, { linhas_por_pagina: n }).catch(() => {}) : undefined} />}

      {grupoAberto && <DetalheGrupo corpoBase={corpoBase} chaves={grupoAberto.chaves} rotulos={grupoAberto.rotulos} onFechar={() => setGrupoAberto(null)} />}
    </div>
  );
}
