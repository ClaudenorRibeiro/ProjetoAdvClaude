import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = process.cwd();
const controlesPorTela = [
  ['pages/Pericias/Pericias.js', ['Tipo de perícia', 'Responsável pela condução', 'Assistente técnico', 'freela:${a.id}', 'Cadastrar freelancer', 'ModalNovoFreela', 'NumeroProcessoCopiavel', 'whiteSpace: \'nowrap\'']],
  ['pages/Prazos/Prazos.js', ['ariaLabel="Delegar para"', 'NumeroProcessoCopiavel', 'p.pasta_id', 'whiteSpace: \'nowrap\'']],
  ['pages/Processos/Processos.js', ['Responsável pelo processo', 'Tipo do processo', 'Status do processo', 'Instância', 'Fórum', 'Vara', 'Fórum da vara']],
];

describe('integrações dos controles pesquisáveis', () => {
  it.each(controlesPorTela)('mantém os controles expansíveis de %s no componente compartilhado', (arquivo, controles) => {
    const codigo = readFileSync(join(raiz, 'src', arquivo), 'utf8');
    expect(codigo).toContain("from '../../components/ui/SelectPesquisavel'");
    for (const controle of controles) expect(codigo).toContain(controle);
  });

  it('Prazos.js usa o SelectComCRUD compartilhado para Tipo de prazo e Subtipo (editar/excluir sem duplicar lógica)', () => {
    const codigo = readFileSync(join(raiz, 'src', 'pages/Prazos/Prazos.js'), 'utf8');
    expect(codigo).toContain("from '../../components/ui/SelectComCRUD'");
    expect(codigo).toContain('nomeEntidade="tipo de prazo"');
    expect(codigo).toContain('nomeEntidade="subtipo"');
  });

  it('SelectComCRUD mantém busca (SelectPesquisavel), criação, edição e exclusão condicionais', () => {
    const codigo = readFileSync(join(raiz, 'src', 'components/ui/SelectComCRUD.js'), 'utf8');
    expect(codigo).toContain("from './SelectPesquisavel'");
    expect(codigo).toContain('ariaLabel={label}');
    expect(codigo).toContain('onEditar &&');
    expect(codigo).toContain('onExcluir &&');
  });

  it('mantém busca no seletor múltiplo de responsáveis de Audiências', () => {
    const codigo = readFileSync(join(raiz, 'src', 'pages/Audiencias/Audiencias.js'), 'utf8');
    expect(codigo).toContain('Pesquisar responsáveis pela condução');
    expect(codigo).toContain('Pesquisar por nome...');
  });
});
