// ============================================================
// GRÁFICO DE LINHAS — uma linha por série, com marcador de leitura (linha vertical que acompanha o mouse
// e mostra todas as séries daquele ponto). Funciona também com o teclado (setas).
// ============================================================
import React, { useMemo, useState } from 'react';
import { geometriaLinhas, caminhoLinha, caminhoArea } from './geometriaLinhas';
import Dica, { linhasDaCategoria } from './Dica';
import { TINTA } from './cores';

const texto = { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', fontSize: 11, fill: TINTA.secundaria };

export default function GraficoLinhas({ prep, largura, onAbrir, svgRef, descricao }) {
  const g = useMemo(() => geometriaLinhas({ prep, largura }), [prep, largura]);
  const [ativa, setAtiva] = useState(null);
  const [dica, setDica] = useState(null);
  const unico = prep.series.length === 1;

  function ir(c, y = g.plot.y + 12) {
    const n = prep.categorias.length;
    const cc = Math.max(0, Math.min(n - 1, c));
    setAtiva(cc);
    setDica({ x: g.xs[cc], y, titulo: prep.categorias[cc].rotulo, linhas: linhasDaCategoria(prep, cc) });
  }
  function aoMover(e) {
    const r = e.currentTarget.ownerSVGElement.getBoundingClientRect();
    ir(Math.floor((e.clientX - r.left - g.plot.x) / g.banda), e.clientY - r.top);
  }
  const sair = () => { setAtiva(null); setDica(null); };
  const abrir = () => { const p = unico && ativa !== null ? prep.series[0].pontos[ativa] : null; if (p && onAbrir) onAbrir(p.chaves, p.rotulos); };

  return (
    <div style={{ position: 'relative', width: largura }}>
      <svg ref={svgRef} width={largura} height={g.altura} viewBox={`0 0 ${largura} ${g.altura}`} role="img" aria-label={descricao}
        style={{ display: 'block', background: TINTA.fundo }}>
        <rect x="0" y="0" width={largura} height={g.altura} fill={TINTA.fundo} />
        {g.marcas.map((m, i) => (
          <g key={i}>
            <line x1={g.plot.x} x2={g.plot.x + g.plot.w} y1={m.pos} y2={m.pos} stroke={TINTA.grade} strokeWidth="1" />
            <text x={g.plot.x - 6} y={m.pos + 4} textAnchor="end" {...texto}>{m.texto}</text>
          </g>
        ))}
        <line x1={g.plot.x} x2={g.plot.x + g.plot.w} y1={g.zero} y2={g.zero} stroke={TINTA.eixo} strokeWidth="1" />
        {g.rotulos.filter(r => r.mostrar).map((r, i) => (
          <text key={i} x={r.x} y={g.plot.y + g.plot.h + 18} textAnchor="middle" {...texto}><title>{r.completo}</title>{r.texto}</text>
        ))}
        {ativa !== null && <line data-efeito="1" x1={g.xs[ativa]} x2={g.xs[ativa]} y1={g.plot.y} y2={g.plot.y + g.plot.h} stroke={TINTA.eixo} strokeWidth="1" />}

        {g.linhas.map(l => {
          const cor = prep.series[l.s].cor;
          return (
            <g key={l.s}>
              {unico && l.segmentos.map((seg, k) => <path key={`a${k}`} d={caminhoArea(seg, g.zero)} fill={cor} fillOpacity="0.1" />)}
              {l.segmentos.map((seg, k) => <path key={k} d={caminhoLinha(seg)} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
              {l.pontos.map(p => <circle key={p.c} cx={p.x} cy={p.y} r={ativa === p.c ? 5 : 4} fill={cor} stroke={TINTA.fundo} strokeWidth="2" />)}
            </g>
          );
        })}

        <rect x={g.plot.x} y={g.plot.y} width={g.plot.w} height={g.plot.h} fill="transparent" tabIndex={0}
          aria-label={`${descricao}. Use as setas para percorrer os pontos.`} style={{ outline: 'none', cursor: unico && onAbrir ? 'pointer' : 'default' }}
          onPointerMove={aoMover} onPointerLeave={sair} onFocus={() => ir(ativa ?? 0)} onBlur={sair} onClick={abrir}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); ir((ativa ?? -1) + 1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); ir((ativa ?? 1) - 1); }
            else if (e.key === 'Enter') abrir();
          }} />
      </svg>
      <Dica dica={dica} largura={largura} />
    </div>
  );
}
