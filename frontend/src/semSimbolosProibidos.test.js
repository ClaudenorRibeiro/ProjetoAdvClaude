import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Pedido do usuário (09/10/2026): os alfinetes (pino redondo e pino inclinado) não aparecem em NENHUM lugar do sistema.
// Os símbolos são montados por código para este arquivo não contê-los.
const PROIBIDOS = { 'alfinete redondo': String.fromCodePoint(0x1F4CD), 'alfinete inclinado': String.fromCodePoint(0x1F4CC) };

function arquivos(pasta) {
  const lista = [];
  for (const nome of readdirSync(pasta)) {
    if (nome === 'node_modules') continue;
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) lista.push(...arquivos(caminho));
    else if (/\.(js|jsx|css|html)$/.test(nome) && nome !== 'semSimbolosProibidos.test.js') lista.push(caminho);
  }
  return lista;
}

describe('símbolos proibidos', () => {
  it('nenhum arquivo do frontend ou do servidor usa o alfinete redondo ou o inclinado', () => {
    const achados = [];
    for (const pasta of [join(process.cwd(), 'src'), join(process.cwd(), '..', 'backend', 'src')]) {
      for (const arq of arquivos(pasta)) {
        const texto = readFileSync(arq, 'utf8');
        for (const [nome, simbolo] of Object.entries(PROIBIDOS)) if (texto.includes(simbolo)) achados.push(`${nome}: ${arq}`);
      }
    }
    expect(achados).toEqual([]);
  });
});
