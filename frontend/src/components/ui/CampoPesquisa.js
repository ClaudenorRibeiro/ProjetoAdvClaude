import React, { useEffect, useRef, useState } from 'react';

// Campo "Pesquisar" único das telas de lista (Audiências, Perícias, Prazos): o texto aparece na hora, mas a lista só é
// consultada `esperaMs` depois de parar de digitar (uma consulta por tecla seria demais), e "Limpar pesquisa" aparece
// quando há algo digitado. `valor` é o termo JÁ aplicado na lista; quando quem usa o campo o zera de fora
// (ex.: "Limpar filtros"), o texto digitado é apagado junto.
export default function CampoPesquisa({ valor = '', onChange, placeholder = 'Pesquisar...', rotulo = 'Pesquisar', maxLength = 200, esperaMs = 350, largura = '260px' }) {
  const [digitado, setDigitado] = useState(valor);
  const aplicado = useRef(valor);
  const aoMudar = useRef(onChange);
  aoMudar.current = onChange;          // quem usa o campo pode passar uma função nova a cada tela; a espera não deve recomeçar por isso

  // (a ordem importa: este efeito atualiza `aplicado` antes do efeito da espera olhar para ele)
  useEffect(() => {
    aplicado.current = valor;
    if (!valor) setDigitado(t => (t.trim() === '' ? t : ''));
  }, [valor]);

  useEffect(() => {
    const termo = digitado.trim();
    if (termo === aplicado.current) return undefined;
    const espera = setTimeout(() => aoMudar.current(termo), esperaMs);
    return () => clearTimeout(espera);
  }, [digitado, esperaMs]);

  function limpar() { setDigitado(''); aoMudar.current(''); }

  return (
    <>
      <div className="form-group" style={{ margin: 0 }}>
        <label className="form-label">{rotulo}</label>
        <input aria-label={rotulo} className="form-control" style={{ minWidth: largura }} placeholder={placeholder}
          value={digitado} maxLength={maxLength} autoComplete="off" onChange={e => setDigitado(e.target.value)} />
      </div>
      {digitado && (
        <button type="button" className="btn btn-outline" style={{ marginBottom: '1px' }} onClick={limpar}>Limpar pesquisa</button>
      )}
    </>
  );
}
