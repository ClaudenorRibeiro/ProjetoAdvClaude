import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const codigo = readFileSync(join(process.cwd(), 'src/pages/Financeiro/Financeiro.js'), 'utf8');
const api = readFileSync(join(process.cwd(), 'src/services/api.js'), 'utf8');

describe('Financeiro — contas e destinos', () => {
  it('exige conta ou caixa do escritório e filtra formas compatíveis no recebimento e repasse', () => {
    expect(codigo).toContain('Conta ou caixa de recebimento *');
    expect(codigo).toContain('Conta ou caixa de saída *');
    expect(codigo).toContain('Forma de recebimento *');
    expect(codigo).toContain('formasCompativeis');
    expect(codigo).toContain("uso_permitido === 'ambos'");
    expect(codigo).toContain('recebimento_conta_financeira_id');
    expect(codigo).toContain('conta_financeira_id');
  });

  it('permite selecionar beneficiário e conta padrão do acordo', () => {
    expect(codigo).toContain('Beneficiário padrão das parcelas');
    expect(codigo).toContain('Conta padrão do beneficiário');
    expect(api).toContain('beneficiariosProcesso');
    expect(api).toContain('contasBeneficiario');
  });
});
