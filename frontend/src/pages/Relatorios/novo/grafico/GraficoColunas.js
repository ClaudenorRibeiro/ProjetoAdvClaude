// ============================================================
// GRÁFICO DE COLUNAS (verticais) e BARRAS (horizontais) — agrupadas ou empilhadas.
// Quem decide posições é geometriaBarras.js; aqui só desenhamos e tratamos mouse/teclado.
// ============================================================
import React, { useMemo, useState } from 'react';
import { geometriaBarras, caminhoBarra } from './geometriaBarras';
import { linhasDaCategoria } from './Dica';
import Dica from './Dica';
import { formatarValor } from './formato';
import { TINTA } from './cores';

const FONTE = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const texto = { fontFamily: FONTE, fontSize: 11, fill: TINTA.secundaria };

export default function GraficoColunas({ prep, horizontal, empilhado, largura, onAbrir, svgRef, descricao }) {
  const g = useMemo(() => geometriaBarras({ prep, horizontal, empilhado, largura }), [prep, horizontal, empilhado, largura]);
  const [dica, setDica] = useState(null);
  const [ativa, setAtiva] = useState(null);
  const unico = prep.series.length === 1;

  function mostrar(c, e) {
    const alvo = e?.currentTarget?.ownerSVGElement || e?.currentTarget;
    let x; let y;
    if (e && e.clientX !== undefined && alvo?.getBoundingClientRect) {
      const r = alvo.getBoundingClientRect(); x = e.clientX - r.left; y = e.clientY - r.top;
    } else { const b = g.bandas[c]; x = b.x + b.w / 2; y = b.y + 12; }
    setAtiva(c);
    setDica({ x, y, titulo: prep.categorias[c].rotulo, linhas: linhasDaCategoria(prep, c) });
  }
  const esconder = () => { setAtiva(null); setDica(null); };

  return (
    <div style={{ position: 'relative', width: largura }}>
      <svg ref={svgRef} width={largura} height={g.altura} viewBox={`0 0 ${largura} ${g.altura}`} role="img" aria-label={descricao}
        style={{ display: 'block', background: TINTA.fundo }}>
        <rect x="0" y="0" width={largura} height={g.altura} fill={TINTA.fundo} />
        {g.marcas.map((m, i) => (horizontal ? (
          <g key={i}>
            <line x1={m.pos} x2={m.pos} y1={g.plot.y} y2={g.plot.y + g.plot.h} stroke={TINTA.grade} strokeWidth="1" />
            <text x={m.pos} y={g.plot.y + g.plot.h + 16} textAnchor="middle" {...texto}>{m.texto}</text>
          </g>
        ) : (
          <g key={i}>
            <line x1={g.plot.x} x2={g.plot.x + g.plot.w} y1={m.pos} y2={m.pos} stroke={TINTA.grade} strokeWidth="1" />
            <text x={g.plot.x - 6} y={m.pos + 4} textAnchor="end" {...texto}>{m.texto}</text>
          </g>
        )))}

        {g.bandas.map(b => {
          const rotuloAria = `${prep.categorias[b.c].rotulo}: ${linhasDaCategoria(prep, b.c).map(l => `${l.rotulo} ${l.valor}`).join('; ')}`;
          const pontoUnico = unico ? prep.series[0].pontos[b.c] : null;
          return (
            <g key={b.c} tabIndex={0} role="img" aria-label={rotuloAria} style={{ outline: 'none' }}
              onPointerMove={(e) => mostrar(b.c, e)} onPointerLeave={esconder} onFocus={() => mostrar(b.c)} onBlur={esconder}
              onClick={pontoUnico && onAbrir ? () => onAbrir(pontoUnico.chaves, pontoUnico.rotulos) : undefined}
              onKeyDown={(e) => { if (e.key === 'Enter' && pontoUnico && onAbrir) onAbrir(pontoUnico.chaves, pontoUnico.rotulos); }}>
              <rect data-efeito="1" x={b.x} y={b.y} width={b.w} height={b.h} fill={ativa === b.c ? 'rgba(11,11,11,0.05)' : 'transparent'} />
              {g.barras.filter(x => x.c === b.c).map(x => (
                <path key={x.s} d={caminhoBarra(x)} fill={prep.series[x.s].cor}
                  style={{ cursor: prep.series[x.s].pontos[b.c] && onAbrir ? 'pointer' : 'default' }}
                  onClick={prep.series[x.s].pontos[b.c] && onAbrir && !unico ? (e) => { e.stopPropagation(); const p = prep.series[x.s].pontos[b.c]; onAbrir(p.chaves, p.rotulos); } : undefined} />
              ))}
            </g>
          );
        })}

        {horizontal
          ? <line x1={g.zero} x2={g.zero} y1={g.plot.y} y2={g.plot.y + g.plot.h} stroke={TINTA.eixo} strokeWidth="1" />
          : <line x1={g.plot.x} x2={g.plot.x + g.plot.w} y1={g.zero} y2={g.zero} stroke={TINTA.eixo} strokeWidth="1" />}

        {g.rotulos.map((r, i) => (horizontal ? (
          <text key={i} x={g.plot.x - 8} y={r.pos + 4} textAnchor="end" {...texto}><title>{r.completo}</title>{r.texto}</text>
        ) : (
          <text key={i} x={r.pos} y={g.plot.y + g.plot.h + 16} {...texto} textAnchor={g.rotacionar ? 'end' : 'middle'}
            transform={g.rotacionar ? `rotate(-40 ${r.pos} ${g.plot.y + g.plot.h + 16})` : undefined}><title>{r.completo}</title>{r.texto}</text>
        )))}

        {g.destaque && (() => {
          const d = g.destaque; const t = formatarValor(d.valor, { formato: prep.metrica.formato, funcao: prep.metrica.funcao });
          return horizontal
            ? <text x={d.x + d.w + 6} y={d.y + d.h / 2 + 4} {...texto} fill={TINTA.primaria} style={{ fontWeight: 600 }}>{t}</text>
            : <text x={Math.min(d.x + d.w / 2, largura - 40)} y={(d.valor >= 0 ? d.y : d.y + d.h) + (d.valor >= 0 ? -6 : 14)} textAnchor="middle" {...texto} fill={TINTA.primaria} style={{ fontWeight: 600 }}>{t}</text>;
        })()}
      </svg>
      <Dica dica={dica} largura={largura} />
    </div>
  );
}
