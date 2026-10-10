import React, { useEffect, useState } from 'react';
import { etiquetasAPI } from '../services/api';

// Etiqueta AUTOMÁTICA "Acordo": processo com acordo cadastrado (e não cancelado) ganha a etiqueta e um fundo na MESMA cor.
// A cor é escolhida em Configurações > Etiquetas do escritório; sem escolha vale a cor padrão. Peça única usada pela lista de
// Processos, pelo alto da pasta e pela aba Processos da pasta.
export const COR_ACORDO_PADRAO = '#86efac';

function rgbDe(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  const n = parseInt((m ? m[1] : COR_ACORDO_PADRAO.slice(1)), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminancia(hex) {
  const [r, g, b] = rgbDe(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Texto da etiqueta: escuro ou branco, o que tiver MAIS contraste com a cor escolhida (sempre legível, qualquer cor).
export function corDoTextoSobre(hex) {
  const l = luminancia(hex);
  const comEscuro = (l + 0.05) / (luminancia('#000000') + 0.05);
  const comBranco = 1.05 / (l + 0.05);
  return comEscuro >= comBranco ? '#000000' : '#ffffff';
}
// Fundo (linha da tabela, cartão do alto da pasta): a MESMA cor, clareada. Quanto mais escura a cor escolhida, mais clara fica a
// mistura com o branco — o suficiente para os textos que já existem sobre ele (azul dos botões, vermelho dos avisos, cinza da
// tabela) continuarem com contraste mínimo de 4,5:1 (até o preto escolhido vira um cinza bem claro, nunca um fundo ilegível).
// Vai como variáveis de CSS (`.linha-acordo`/`.card-acordo` em Layout.css), assim o "passar o mouse" também funciona.
const LUMINANCIA_MINIMA_FUNDO = 0.82;
const LUMINANCIA_MINIMA_FUNDO_HOVER = 0.8;
function misturaComBranco(rgb, alfa) { return rgb.map(v => Math.round(255 - (255 - v) * alfa)); }
function maiorAlfa(rgb, maximo, luminanciaMinima) {
  for (let a = Math.round(maximo * 100); a > 4; a -= 1) {
    const [r, g, b] = misturaComBranco(rgb, a / 100);
    if (luminancia(`#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`) >= luminanciaMinima) return a / 100;
  }
  return 0.04;
}
export function estiloFundoAcordo(hex) {
  const rgb = rgbDe(hex);
  // cor OPACA (já misturada com o branco): uma cor transparente se misturaria com o cinza da página atrás do cartão e escureceria
  const opaca = (alfa) => `rgb(${misturaComBranco(rgb, alfa).join(', ')})`;
  return {
    '--acordo-fundo': opaca(maiorAlfa(rgb, 0.3, LUMINANCIA_MINIMA_FUNDO)),
    '--acordo-fundo-hover': opaca(maiorAlfa(rgb, 0.4, LUMINANCIA_MINIMA_FUNDO_HOVER)),
  };
}

// A cor vale para a tela inteira e muda raramente: lida uma vez (e de novo quando a Configurações salva uma nova).
let cache = null;
export function esquecerCorAcordo() { cache = null; }
function lerCor() {
  if (!cache) {
    cache = etiquetasAPI.corAcordo()
      .then(r => (r.data?.ok && /^#[0-9a-f]{6}$/i.test(r.data.dados?.cor || '') ? r.data.dados.cor : COR_ACORDO_PADRAO))
      .catch(() => { cache = null; return COR_ACORDO_PADRAO; });
  }
  return cache;
}
export function useCorAcordo() {
  const [cor, setCor] = useState(COR_ACORDO_PADRAO);
  useEffect(() => {
    let vivo = true;
    lerCor().then(c => { if (vivo) setCor(c); });
    return () => { vivo = false; };
  }, []);
  return cor;
}

export default function EtiquetaAcordo({ cor = COR_ACORDO_PADRAO, style }) {
  return (
    <span className="badge" title="Este processo tem acordo cadastrado"
      style={{ background: cor, color: corDoTextoSobre(cor), ...style }}>Acordo</span>
  );
}
