// ============================================================
// RELATÓRIOS — resultado "uma linha por registro", com páginas.
// Também serve para listar os itens de um grupo (o corpo traz o `grupo`).
// ============================================================
import React, { useEffect, useState } from 'react';
import { relatoriosAPI } from '../../../services/api';
import TabelaResultado from './TabelaResultado';
import { mensagemDeErro } from './Construtor';

const OPCOES_LINHAS = [10, 25, 50, 100, 200];

export default function ResultadoDetalhado({ corpoBase, limiteInicial = 50, aoMudarLimite, aoCarregar }) {
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(limiteInicial);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    setCarregando(true); setErro('');
    relatoriosAPI.executar({ ...corpoBase, pagina, limite })
      .then(({ data }) => { if (ativo) { setDados(data.dados); aoCarregar?.(data.dados); } })
      .catch(err => { if (ativo) setErro(mensagemDeErro(err, 'Não foi possível gerar o relatório')); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corpoBase, pagina, limite]);

  function trocarLimite(valor) { setLimite(valor); setPagina(1); aoMudarLimite?.(valor); }

  if (erro) return <div className="card" role="alert" style={{ color: '#b91c1c' }}>{erro}</div>;
  const total = dados?.total ?? 0;
  const visiveis = dados ? Math.min(total, dados.limiteTela) : 0;
  const totalPaginas = Math.max(1, Math.ceil(visiveis / limite));
  const de = total ? (pagina - 1) * limite + 1 : 0;
  const ate = Math.min(pagina * limite, visiveis);

  return (
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
  );
}
