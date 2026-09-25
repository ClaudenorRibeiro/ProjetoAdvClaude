import { describe, expect, it, vi, afterEach } from 'vitest';
import * as f from './formatters';

describe('formatadores e validadores compartilhados', () => {
  afterEach(() => vi.useRealTimers());

  it('normaliza nomes, espaços e e-mails', () => {
    expect(f.limparEspacos('  Frederico   Carvalho  ')).toBe('Frederico Carvalho');
    expect(f.limparEspacos('linha 1\n   linha 2')).toBe('linha 1\nlinha 2');
    expect(f.limparEmail(' EDNA @Provedor.COM ')).toBe('edna@provedor.com');
    expect(f.toTitleCase('joão   dos   santos')).toBe('João dos Santos');
  });

  it('valida CPF e CNPJ e rejeita sequências repetidas', () => {
    expect(f.validarCPF('529.982.247-25')).toBe(true);
    expect(f.validarCPF('111.111.111-11')).toBe(false);
    expect(f.validarCNPJ('11.222.333/0001-81')).toBe(true);
    expect(f.validarCNPJ('11.111.111/1111-11')).toBe(false);
  });

  it('aplica máscaras sem perder limites', () => {
    expect(f.mascaraCPF('12345678900123')).toBe('123.456.789-00');
    expect(f.mascaraCNPJ('12345678000195123')).toBe('12.345.678/0001-95');
    expect(f.mascaraCNJ('00012341220235020001')).toBe('0001234-12.2023.5.02.0001');
    expect(f.formatarTelefone('5511950487461')).toBe('(11) 95048-7461');
  });

  it('converte moeda brasileira nos dois sentidos', () => {
    expect(f.parseMoeda('R$ 2.345,67')).toBe(2345.67);
    expect(f.parseMoeda('')).toBe(0);
    expect(f.mascaraMoeda('150000')).toBe('1.500,00');
    expect(f.numeroParaMascaraMoeda(1500)).toBe('1.500,00');
  });

  it('formata datas ISO sem passar por UTC', () => {
    expect(f.formatarData('2026-12-25')).toBe('25/12/2026');
    expect(f.dataParaIsoLocal(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
    expect(f.dataParaIsoLocal('inválida')).toBe('');
  });

  it('identifica se o horário da audiência já passou no fuso de Brasília', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T15:30:00.000Z')); // 12:30 em Brasília
    expect(f.audienciaJaPassou('2026-09-15', '12:29')).toBe(true);
    expect(f.audienciaJaPassou('2026-09-15', '12:30')).toBe(false);
    expect(f.audienciaJaPassou('2026-09-15', '12:31')).toBe(false);
    expect(f.audienciaJaPassou('2000-01-01EXTRA', '10:00')).toBe(true);
    expect(f.audienciaJaPassou('2000-01-01', '10:00EXTRA')).toBe(true);
    expect(f.audienciaJaPassou('data inválida', '10:00')).toBe(false);
    expect(f.audienciaJaPassou('2026-01-01', '')).toBe(false);
    expect(f.audienciaJaPassou(null, null)).toBe(false);

    vi.setSystemTime(new Date('2026-09-16T01:30:00.000Z')); // 22:30 do dia anterior em Brasília
    expect(f.audienciaJaPassou('2026-09-15', '22:29')).toBe(true);
    expect(f.audienciaJaPassou('2026-09-15', '22:31')).toBe(false);
    expect(f.audienciaJaPassou('2026-09-16', '00:00')).toBe(false);
  });

  it('remove HTML e conteúdo executável de publicações', () => {
    expect(f.textoLimpo('Texto puro\nsegunda linha')).toBe('Texto puro\nsegunda linha');
    expect(f.textoLimpo('<script>alert(1)</script><b>Oi</b>&nbsp;tchau')).toBe('Oi tchau');
  });

  it('mantém as faixas visuais de prazo', () => {
    expect(f.corPrazo(-1)).toBe('prazo-atrasado');
    expect(f.corPrazo(0)).toBe('prazo-urgente');
    expect(f.corPrazo(2)).toBe('prazo-urgente');
    expect(f.corPrazo(3)).toBe('prazo-ok');
    expect(f.corPrazo(null)).toBe('');
  });

  it('formata data/hora e moeda inclusive entradas vazias ou inválidas', () => {
    expect(f.formatarDataHora('2026-12-25T13:45:00-03:00')).toBe('25/12/2026 13:45');
    expect(f.formatarDataHora('')).toBe('—');
    expect(f.formatarDataHora('inválida')).toBe('—');
    expect(f.formatarMoeda(1234.5)).toMatch(/1\.234,50/);
    expect(f.formatarMoeda(null)).toBe('R$ 0,00');
  });

  it('formata documentos, pasta e todos os comprimentos de telefone', () => {
    expect(f.formatarCPF(null)).toBe('—');
    expect(f.formatarCNPJ('12345678000195')).toBe('12.345.678/0001-95');
    expect(f.formatarCNPJ(null)).toBe('—');
    expect(f.formatarNumeroPasta(42)).toBe('0042');
    expect(f.formatarNumeroPasta(null)).toBe('—');
    expect(f.formatarTelefone(null)).toBe('—');
    expect(f.formatarTelefone('950487461')).toBe('95048-7461');
    expect(f.formatarTelefone('20538881')).toBe('2053-8881');
    expect(f.formatarTelefone('123')).toBe('123');
  });

  it('máscara CNJ é progressiva durante a digitação', () => {
    expect(f.mascaraCNJ('123')).toBe('123');
    expect(f.mascaraCNJ('000123412')).toBe('0001234-12');
    expect(f.mascaraCNJ('0001234122023')).toBe('0001234-12.2023');
    expect(f.mascaraCNJ('00012341220235')).toBe('0001234-12.2023.5');
    expect(f.mascaraCNJ('0001234122023502')).toBe('0001234-12.2023.5.02');
  });

  it('rótulos conhecidos são amigáveis e desconhecidos são preservados', () => {
    expect(f.labelPrioridade('urgente')).toBe('🔴 Urgente');
    expect(f.labelPrioridade('customizada')).toBe('customizada');
    expect(f.labelStatusPrazo('concluido')).toBe('Concluído');
    expect(f.labelStatusPrazo('novo')).toBe('novo');
    expect(f.labelAreaDireito('previdenciario')).toBe('Previdenciário');
    expect(f.labelAreaDireito('ambiental')).toBe('ambiental');
  });

  it('mascaraDocumento alterna entre CPF e CNPJ pelo número de dígitos (conta bancária de terceiro)', () => {
    expect(f.mascaraDocumento('12345678900')).toBe('123.456.789-00');
    expect(f.mascaraDocumento('123456789001')).toBe('12.345.678/9001');
    expect(f.mascaraDocumento('12345678000195')).toBe('12.345.678/0001-95');
    expect(f.mascaraDocumento('')).toBe('');
  });

  it('funções de limpeza preservam valores vazios', () => {
    expect(f.limparEspacos('')).toBe('');
    expect(f.limparEspacos(null)).toBe(null);
    expect(f.limparEmail('')).toBe('');
    expect(f.toTitleCase(null)).toBe(null);
    expect(f.numeroParaMascaraMoeda(null)).toBe('');
    expect(f.mascaraMoeda('')).toBe('');
  });
});
