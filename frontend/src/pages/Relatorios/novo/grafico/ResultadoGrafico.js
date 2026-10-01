// ============================================================
// GRÁFICOS — tela do gráfico de um resultado AGRUPADO.
// Mostra UM total por vez (nunca dois eixos). A escolha (tipo/total/empilhar) é uma preferência do
// relatório salvo; nada dos dados é guardado. A tabela continua a um clique de distância (mesmos números).
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { metricasGraficaveis, prepararGrafico, tipoPadrao } from './dadosGrafico';
import ControlesGrafico from './ControlesGrafico';
import GraficoColunas from './GraficoColunas';
import GraficoLinhas from './GraficoLinhas';
import GraficoRosca from './GraficoRosca';
import Legenda from './Legenda';
import useLargura from './useLargura';
import { baixarPng, montarSvgImagem, pngEmDataUrl, serializarSvg } from './exportarPng';
import { corDaSerie } from './cores';

export default function ResultadoGrafico({ dados, preferencias, aoMudarPreferencias, onAbrirGrupo, nomeRelatorio, registrarGrafico }) {
  const salvo = preferencias?.grafico || {};
  const [tipo, setTipo] = useState(salvo.tipo || tipoPadrao(dados));
  const [metrica, setMetrica] = useState(salvo.metrica || 'm1');
  const [empilhado, setEmpilhado] = useState(!!salvo.empilhado);
  const [gerando, setGerando] = useState(false);
  const caixaRef = useRef(null);
  const svgRef = useRef(null);
  const largura = useLargura(caixaRef);
  const prep = useMemo(() => prepararGrafico(dados, { metrica }), [dados, metrica]);
  const gerarImagemRef = useRef(null);
  // Avisa a tela de exportação que existe um gráfico visível (para incluir no PDF/Word); retira ao sair
  useEffect(() => {
    if (!registrarGrafico || prep.vazio) return undefined;
    registrarGrafico(() => gerarImagemRef.current());
    return () => registrarGrafico(null);
  }, [registrarGrafico, prep.vazio]);

  function mudar(parcial) {
    if (parcial.tipo !== undefined) setTipo(parcial.tipo);
    if (parcial.metrica !== undefined) setMetrica(parcial.metrica);
    if (parcial.empilhado !== undefined) setEmpilhado(parcial.empilhado);
    if (aoMudarPreferencias) aoMudarPreferencias({ grafico: parcial });
  }

  if (prep.vazio) return <div className="card"><p style={{ margin: 0 }}>{prep.motivo}</p></div>;

  const tipoEfetivo = tipo === 'rosca' && !prep.rosca.ok ? 'colunas' : tipo;
  const descricao = `Gráfico: ${prep.metrica.rotulo} por ${dados.colunas.grupos.map(g => g.rotulo).join(' e ')}`;
  const varias = prep.series.length > 1;
  const legenda = tipoEfetivo === 'rosca' ? null : (varias ? prep.series.map(s => ({ cor: s.cor, rotulo: s.rotulo })) : null);

  function montarImagem({ semTitulo = false } = {}) {
    const itensLegenda = tipoEfetivo === 'rosca'
      ? prep.categorias.map((c, i) => ({ cor: corDaSerie(i), rotulo: c.rotulo }))
      : (legenda || []);
    return montarSvgImagem({ svgTexto: serializarSvg(svgRef.current), largura: svgRef.current.getAttribute('width') * 1,
      altura: svgRef.current.getAttribute('height') * 1, titulo: semTitulo ? '' : (nomeRelatorio || 'Relatório'), subtitulo: descricao, legenda: itensLegenda });
  }
  gerarImagemRef.current = () => pngEmDataUrl(montarImagem({ semTitulo: true }));   // no documento o título já está na página

  async function baixar() {
    if (!svgRef.current) return;
    setGerando(true);
    try { await baixarPng(montarImagem(), nomeRelatorio || 'grafico'); }
    catch (e) { toast.error(e.message || 'Não foi possível gerar a imagem'); } finally { setGerando(false); }
  }

  const comum = { prep, largura, onAbrir: onAbrirGrupo, svgRef, descricao };
  return (
    <div className="card">
      <ControlesGrafico tipo={tipoEfetivo} metrica={prep.metrica.chave} empilhado={empilhado} graficaveis={metricasGraficaveis(dados)} rosca={prep.rosca}
        podeEmpilhar={varias && (tipoEfetivo === 'colunas' || tipoEfetivo === 'barras')} gerando={gerando} aoMudar={mudar} aoBaixar={baixar} />
      {tipo === 'rosca' && !prep.rosca.ok && <p role="note" style={{ color: '#92400e', marginTop: 0 }}>{prep.rosca.motivo} Mostrando colunas.</p>}
      {prep.avisos.map((a, i) => <p key={i} role="note" style={{ color: '#92400e', marginTop: 0 }}>{a}</p>)}
      <div ref={caixaRef} style={{ width: '100%', overflow: 'hidden' }}>
        {tipoEfetivo === 'linhas' && <GraficoLinhas {...comum} />}
        {tipoEfetivo === 'rosca' && <GraficoRosca {...comum} />}
        {(tipoEfetivo === 'colunas' || tipoEfetivo === 'barras') && <GraficoColunas {...comum} horizontal={tipoEfetivo === 'barras'} empilhado={empilhado} />}
      </div>
      {legenda && <Legenda itens={legenda} tipo={tipoEfetivo === 'linhas' ? 'linha' : 'barra'} />}
      <p style={{ color: '#6b7280', fontSize: 12, margin: '10px 0 0' }}>
        {onAbrirGrupo ? 'Clique em uma barra, ponto ou fatia para ver os itens. ' : ''}Os mesmos números estão na visão "Tabela".
      </p>
    </div>
  );
}
