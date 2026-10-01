// ============================================================
// RELATÓRIOS — resultado AGRUPADO: busca os números UMA vez e os mostra em três visões
// (Tabela, Gráfico e Tabela cruzada). As três usam exatamente os mesmos números.
// Clicar em um grupo (linha, barra, fatia ou célula) abre os itens dele.
// A visão escolhida é uma preferência do relatório salvo (nenhum dado é guardado).
// ============================================================
import React, { useEffect, useState } from 'react';
import { relatoriosAPI } from '../../../services/api';
import { mensagemDeErro } from './Construtor';
import TabelaAgrupada from './TabelaAgrupada';
import TabelaCruzada from './TabelaCruzada';
import ResultadoGrafico from './grafico/ResultadoGrafico';

const VISOES = [
  { valor: 'tabela', rotulo: 'Tabela' },
  { valor: 'grafico', rotulo: 'Gráfico' },
  { valor: 'cruzada', rotulo: 'Tabela cruzada' },
];

export default function ResultadoAgrupado({ corpoBase, onAbrirGrupo, preferencias, aoMudarPreferencias, nomeRelatorio, registrarGrafico }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [visao, setVisao] = useState(VISOES.some(v => v.valor === preferencias?.visao) ? preferencias.visao : 'tabela');

  useEffect(() => {
    let ativo = true;
    setDados(null); setErro('');
    relatoriosAPI.executar(corpoBase)
      .then(({ data }) => { if (ativo) setDados(data.dados); })
      .catch(err => { if (ativo) setErro(mensagemDeErro(err, 'Não foi possível gerar o relatório')); });
    return () => { ativo = false; };
  }, [corpoBase]);

  if (erro) return <div className="card" role="alert" style={{ color: '#b91c1c' }}>{erro}</div>;
  if (!dados) return <div className="card"><div className="loading">Carregando...</div></div>;

  const doisNiveis = dados.colunas.grupos.length >= 2;
  const visaoAtual = visao === 'cruzada' && !doisNiveis ? 'tabela' : visao;
  const abrir = (chaves, rotulos) => onAbrirGrupo(chaves, rotulos);
  function escolher(v) { setVisao(v); if (aoMudarPreferencias) aoMudarPreferencias({ visao: v }); }

  return (
    <div>
      {dados.colunas.grupos.length > 0 && (
        <div role="group" aria-label="Forma de exibição" style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {VISOES.map(v => {
            const bloqueada = v.valor === 'cruzada' && !doisNiveis;
            return (
              <button key={v.valor} type="button" className={`btn ${visaoAtual === v.valor ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={visaoAtual === v.valor}
                disabled={bloqueada} title={bloqueada ? 'Escolha 2 níveis em "Agrupar e totalizar" para usar a tabela cruzada' : undefined}
                onClick={() => escolher(v.valor)}>{v.rotulo}</button>
            );
          })}
        </div>
      )}
      {visaoAtual === 'grafico' && (
        <ResultadoGrafico dados={dados} preferencias={preferencias} aoMudarPreferencias={aoMudarPreferencias} onAbrirGrupo={abrir} nomeRelatorio={nomeRelatorio} registrarGrafico={registrarGrafico} />
      )}
      {visaoAtual === 'cruzada' && (
        <TabelaCruzada dados={dados} metricaInicial={preferencias?.grafico?.metrica} onAbrirGrupo={abrir} />
      )}
      {visaoAtual === 'tabela' && <TabelaAgrupada dados={dados} onAbrirGrupo={abrir} />}
    </div>
  );
}
