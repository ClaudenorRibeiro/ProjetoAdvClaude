import { describe, expect, it } from 'vitest';
import { analisarPublicacao } from './sugestoesPublicacao';

describe('sugestões determinísticas de publicações', () => {
  it('não inventa sugestão sem gatilho', () => {
    expect(analisarPublicacao('')).toEqual([]);
    expect(analisarPublicacao('Texto informativo sem providência.')).toEqual([]);
  });

  it('extrai audiência com data, hora e confiança alta', () => {
    const [r] = analisarPublicacao(
      'Fica designada audiência de instrução para o dia 20/10/2026 às 14:30, na sala 3.',
      { dataPublicacao: '2026-09-10', numeroProcesso: '0001' }
    );
    expect(r).toMatchObject({ tipo: 'compromisso', subtipo: 'audiencia', data: '2026-10-20', hora: '14:30', confianca: 'alta' });
  });

  it('não sugere audiência já realizada', () => {
    expect(analisarPublicacao('Designada audiência para 10/09/2026, a mesma foi realizada nesta data.')).toEqual([]);
  });

  it('extrai perícia designada sem confundir laudo já juntado', () => {
    const periciaSemContexto = analisarPublicacao('Designo a perícia médica para o dia 05/11/2026 às 09:00.')[0];
    expect(periciaSemContexto).toMatchObject({ tipo: 'pericia', data: '2026-11-05', hora: '09:00' });
    expect(periciaSemContexto.titulo).not.toContain('Stryker was here!');
    expect(periciaSemContexto.descricao).not.toContain('Stryker was here!');
    expect(analisarPublicacao('Laudo pericial juntado aos autos em 05/11/2026.')).toEqual([]);
  });

  it('identifica prazo e não calcula termo inicial jurídico', () => {
    const [r] = analisarPublicacao('Intime-se para, no prazo de 15 dias, apresentar contestação.');
    expect(r).toMatchObject({ tipo: 'prazo', quantidadeInicial: 15, tipoDiasInicial: 'corridos' });
    expect(r.descricaoInicial).toMatch(/CONFERIR a data de in[íi]cio/i);
    expect(analisarPublicacao('Intime-se para, no prazo de 15 dias, apresentar contestação.')).toHaveLength(1);
  });

  it('identifica dias úteis e providência genérica', () => {
    expect(analisarPublicacao('Manifeste-se no prazo de 5 dias úteis.')[0])
      .toMatchObject({ tipo: 'prazo', quantidadeInicial: 5, tipoDiasInicial: 'uteis' });
    expect(analisarPublicacao('Manifestem-se as partes sobre os documentos.')[0])
      .toMatchObject({ tipo: 'tarefa', subtipo: 'providencia' });
  });

  it('infere o ano pela publicação e reduz a confiança', () => {
    const [r] = analisarPublicacao('Designo audiência una para o dia 15/12 às 10h.', {
      dataPublicacao: '2031-09-10', numeroProcesso: 'PROCESSO-TESTE', numeroPublicacao: 'PUB-99',
    });
    expect(r).toMatchObject({ data: '2031-12-15', confianca: 'media' });
    expect(r.titulo).toContain('PROCESSO-TESTE');
    expect(r.descricao).toContain('PUB-99');
  });

  it('qualquer exceção inesperada devolve lista vazia e não quebra a tela', () => {
    const opcoesQueFalham = new Proxy({}, { get() { throw new Error('falha simulada'); } });
    expect(analisarPublicacao('Designo audiência para 20/10/2031.', opcoesQueFalham)).toEqual([]);
  });
});
