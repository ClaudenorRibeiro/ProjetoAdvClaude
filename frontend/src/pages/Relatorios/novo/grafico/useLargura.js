// ============================================================
// GRÁFICOS — mede a largura disponível (o gráfico se ajusta a celular, tablet e PC)
// ============================================================
import { useEffect, useState } from 'react';

export default function useLargura(ref, padrao = 720) {
  const [largura, setLargura] = useState(padrao);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ler = () => { const w = Math.floor(el.getBoundingClientRect().width); if (w > 0) setLargura(w); };
    ler();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', ler); return () => window.removeEventListener('resize', ler); }
    const obs = new ResizeObserver(ler);
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return Math.max(280, largura);
}
