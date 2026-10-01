// ============================================================
// GRÁFICO DE ROSCA — parte-do-todo para poucos grupos (a regra de quando é permitido está em dadosGrafico.js).
// Legenda ao lado com valor e percentual: a informação nunca depende só da cor.
// ============================================================
import React, { useMemo, useState } from 'react';
import { fatiasRosca } from './geometriaRosca';
import Dica from './Dica';
import Legenda from './Legenda';
import { formatarValor, formatarEixo, percentual } from './formato';
import { TINTA, corDaSerie } from './cores';

const SOMAVEIS = ['contagem', 'soma'];

export default function GraficoRosca({ prep, largura, onAbrir, svgRef, descricao }) {
  const lado = Math.min(320, Math.max(220, largura - 16));
  const caixa = { cx: lado / 2, cy: lado / 2, R: lado / 2 - 8, r: (lado / 2 - 8) * 0.62 };
  const valores = prep.series[0].valores;
  const total = valores.reduce((a, v) => a + v, 0);
  const fatias = useMemo(() => fatiasRosca(valores, caixa), [valores, lado]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [dica, setDica] = useState(null);
  const fmt = { formato: prep.metrica.formato, funcao: prep.metrica.funcao };

  function mostrar(i, e) {
    const r = e?.currentTarget?.ownerSVGElement?.getBoundingClientRect?.();
    const x = r && e.clientX !== undefined ? e.clientX - r.left : lado / 2;
    const y = r && e.clientY !== undefined ? e.clientY - r.top : lado / 2;
    setDica({ x, y, titulo: prep.categorias[i].rotulo,
      linhas: [{ cor: prep.series[0].cor, rotulo: percentual(valores[i], total), valor: formatarValor(valores[i], fmt) }] });
  }
  const cores = (i) => corDaSerie(i);   // na rosca cada FATIA é um grupo: cores em ordem fixa (máx. 6 fatias)
  const itens = prep.categorias.map((c, i) => ({ cor: cores(i), rotulo: c.rotulo, extra: `${formatarValor(valores[i], fmt)} · ${percentual(valores[i], total)}` }));

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: lado }}>
        <svg ref={svgRef} width={lado} height={lado} viewBox={`0 0 ${lado} ${lado}`} role="img" aria-label={descricao} style={{ display: 'block', background: TINTA.fundo }}>
          <rect x="0" y="0" width={lado} height={lado} fill={TINTA.fundo} />
          {fatias.map(f => {
            const ponto = prep.series[0].pontos[f.i];
            return (
              <path key={f.i} d={f.caminho} fill={cores(f.i)} fillRule="evenodd" tabIndex={0} role="img"
                aria-label={`${prep.categorias[f.i].rotulo}: ${formatarValor(f.valor, fmt)} (${percentual(f.valor, total)})`}
                style={{ outline: 'none', cursor: ponto && onAbrir ? 'pointer' : 'default' }}
                onPointerMove={(e) => mostrar(f.i, e)} onPointerLeave={() => setDica(null)} onFocus={() => mostrar(f.i)} onBlur={() => setDica(null)}
                onClick={ponto && onAbrir ? () => onAbrir(ponto.chaves, ponto.rotulos) : undefined} />
            );
          })}
          {SOMAVEIS.includes(prep.metrica.funcao) && (
            <g fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif" textAnchor="middle">
              <text x={caixa.cx} y={caixa.cy - 2} fontSize="20" fontWeight="600" fill={TINTA.primaria}>{formatarEixo(total, { formato: prep.metrica.formato })}</text>
              <text x={caixa.cx} y={caixa.cy + 16} fontSize="11" fill={TINTA.secundaria}>total</text>
            </g>
          )}
        </svg>
        <Dica dica={dica} largura={lado} />
      </div>
      <div style={{ flex: '1 1 220px' }}><Legenda itens={itens} vertical /></div>
    </div>
  );
}
