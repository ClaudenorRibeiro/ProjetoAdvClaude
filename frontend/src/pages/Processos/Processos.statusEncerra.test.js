import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const diretorio = path.dirname(fileURLToPath(import.meta.url));
const codigo = fs.readFileSync(path.join(diretorio, 'Processos.js'), 'utf8');

describe('cadastro de status: "Encerra o processo"', () => {
  it('o status tem a caixa "Encerra o processo" (escolha do escritório, independe do nome)', () => {
    const trecho = codigo.slice(codigo.indexOf("titulo:  'Status de Processo'"), codigo.indexOf("titulo:  'Instâncias'"));
    expect(trecho).toContain("key: 'encerra_processo'");
    expect(trecho).toContain("tipo: 'checkbox'");
  });

  it('a caixa começa desmarcada na criação e reflete o valor salvo na edição', () => {
    expect(codigo).toContain("c.tipo === 'checkbox' ? false : ''");
    expect(codigo).toContain("c.tipo === 'checkbox' ? !!Number(item[c.key])");
  });

  it('a lista mostra quais status encerram o processo', () => {
    expect(codigo).toContain("tipo === 'status' && !!Number(item.encerra_processo)");
    expect(codigo).toContain('encerra o processo');
  });
});
