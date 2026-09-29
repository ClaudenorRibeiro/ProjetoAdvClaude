import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apareceNaAgenda, esmaecidoNaAgenda } from '../../utils/statusAgenda';

const diretorio = path.dirname(fileURLToPath(import.meta.url));
const codigo = fs.readFileSync(path.join(diretorio, 'Agenda.js'), 'utf8');

describe('regras de status da agenda', () => {
  it('perícia remarcada ou cancelada não aparece no calendário', () => {
    expect(apareceNaAgenda('pericia', 'remarcada')).toBe(false);
    expect(apareceNaAgenda('pericia', 'cancelada')).toBe(false);
  });

  it('audiência remarcada ou cancelada não aparece no calendário', () => {
    expect(apareceNaAgenda('audiencia', 'remarcada')).toBe(false);
    expect(apareceNaAgenda('audiencia', 'cancelada')).toBe(false);
  });

  it('perícia e audiência ainda por acontecer aparecem (agendada, adiada, sem status)', () => {
    expect(apareceNaAgenda('pericia', 'agendada')).toBe(true);
    expect(apareceNaAgenda('pericia', undefined)).toBe(true);
    expect(apareceNaAgenda('pericia', null)).toBe(true);
    expect(apareceNaAgenda('audiencia', 'agendada')).toBe(true);
    expect(apareceNaAgenda('audiencia', 'adiada')).toBe(true);
  });

  it('realizadas e acordo continuam aparecendo, mas esmaecidas e riscadas', () => {
    expect(apareceNaAgenda('pericia', 'realizada')).toBe(true);
    expect(esmaecidoNaAgenda('pericia', 'realizada')).toBe(true);
    expect(apareceNaAgenda('audiencia', 'realizada')).toBe(true);
    expect(esmaecidoNaAgenda('audiencia', 'realizada')).toBe(true);
    expect(apareceNaAgenda('audiencia', 'acordo')).toBe(true);
    expect(esmaecidoNaAgenda('audiencia', 'acordo')).toBe(true);
  });

  it('itens agendados não ficam esmaecidos', () => {
    expect(esmaecidoNaAgenda('pericia', 'agendada')).toBe(false);
    expect(esmaecidoNaAgenda('audiencia', 'agendada')).toBe(false);
    expect(esmaecidoNaAgenda('audiencia', 'adiada')).toBe(false);
  });

  it('prazos, tarefas e compromissos não são afetados por essas regras', () => {
    for (const tipo of ['prazo', 'tarefa', 'compromisso']) {
      expect(apareceNaAgenda(tipo, 'remarcada')).toBe(true);
      expect(esmaecidoNaAgenda(tipo, 'realizada')).toBe(false);
    }
  });

  it('a página da Agenda realmente aplica o filtro e o esmaecimento', () => {
    expect(codigo).toContain("apareceNaAgenda('pericia', p.status)");
    expect(codigo).toContain("apareceNaAgenda('audiencia', a.status)");
    expect(codigo).toContain('esmaecidoNaAgenda(evento.tipo, evento.dados?.status)');
    expect(codigo).toContain("textDecoration: 'line-through'");
  });
});
