import { useEffect, useRef } from 'react';

// O react-big-calendar (visão de Mês) põe os eventos e o "+N mais" de cada semana dentro de uma linha da tabela
// (role="row") sem marcar o grupo como célula; leitores de tela e o verificador de acessibilidade (regra
// aria-required-children) reprovam isso assim que uma semana tem eventos. Aqui cada grupo ganha role="cell".
// Só mexe no atributo `role` dentro do calendário; a biblioteca recria os grupos a cada troca de mês/dados,
// por isso um observador reaplica quando o calendário muda.
export default function useAcessibilidadeCalendario() {
  const ref = useRef(null);
  useEffect(() => {
    const raiz = ref.current;
    if (!raiz) return undefined;
    const marcar = () => raiz.querySelectorAll('.rbc-row-segment:not([role])').forEach(el => el.setAttribute('role', 'cell'));
    marcar();
    const observador = new MutationObserver(marcar);
    observador.observe(raiz, { childList: true, subtree: true });
    return () => observador.disconnect();
  }, []);
  return ref;
}
