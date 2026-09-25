import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const diretorio = path.dirname(fileURLToPath(import.meta.url));
const codigo = fs.readFileSync(path.join(diretorio, 'InstituicoesFinanceiras.js'), 'utf8');

describe('caixa físico do escritório', () => {
  it('esconde e limpa os campos bancários para dinheiro em espécie', () => {
    expect(codigo).toContain("tipo === 'especie' ? {");
    expect(codigo).toContain("instituicao_financeira_id: '', agencia: '', numero: '', digito: '', chave_pix: ''");
    expect(codigo).toContain("formConta.tipo === 'bancaria' && <><div className=\"grid-3\">");
  });

  it('não apresenta ação de desativar para caixa físico na interface', () => {
    expect(codigo).toContain("c.tipo === 'especie' ? []");
    expect(codigo).toContain('Local físico / observação');
  });
});
