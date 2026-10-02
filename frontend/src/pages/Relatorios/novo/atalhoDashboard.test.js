import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ catalogo: vi.fn(), listarModelos: vi.fn(), executar: vi.fn() }));
vi.mock('../../../services/api', () => ({ relatoriosAPI: api }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ ehAdmin: false, temPermissao: () => true }) }));

import RelatoriosNovo from './RelatoriosNovo';
import { toast } from 'react-toastify';

const RECEITA = { versao: 2, assunto: 'prazos', colunas: ['pasta'], filtros: { op: 'E', itens: [] }, ordem: [], agrupar: [], metricas: [], ordemGrupo: null };
const base = { assunto: 'prazos', descricao: null, receita: RECEITA, preferencias: {}, criado_em: '2026-10-01 09:00:00', alterado_em: null, sem_acesso: false, compartilhado_com: 0 };
const MEU = { ...base, id: 5, nome: 'Prazos da semana', escopo: 'pessoal', origem: 'proprio', pode_editar: true };
const PARADOS = { ...base, id: 9, nome: 'Processos parados', escopo: 'sistema', origem: 'sistema', pode_editar: false };
const CATALOGO = { periodos: [], assuntos: [{ chave: 'prazos', rotulo: 'Prazos', campos: [{ chave: 'pasta', rotulo: 'Pasta', tipo: 'texto', formato: 'pasta', opcoes: null, agrupavel: false, passos: null, funcoes: [], operadores: [] }] }] };
const RESULTADO = { colunas: [{ chave: 'pasta', rotulo: 'Pasta', tipo: 'texto', formato: 'pasta' }], linhas: [], total: 0, pagina: 1, limite: 50, limiteTela: 2000, truncado: false, receita: RECEITA, modelo: null };

const abrir = () => render(<MemoryRouter initialEntries={['/relatorios?rel=processos_parados']}><RelatoriosNovo /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.catalogo.mockResolvedValue({ data: { dados: CATALOGO } });
  api.executar.mockResolvedValue({ data: { dados: RESULTADO } });
});

describe('Atalho do Dashboard (?rel=processos_parados)', () => {
  it('abre direto o relatório do sistema "Processos parados"', async () => {
    api.listarModelos.mockResolvedValue({ data: { dados: { modelos: [MEU, PARADOS], limite: 10, criados: 1 } } });
    abrir();
    await waitFor(() => expect(api.executar).toHaveBeenCalled());
    expect(api.executar.mock.calls[0][0]).toMatchObject({ modelo_id: 9 });
  });

  it('se os relatórios padrão ainda não foram instalados, avisa e mostra a lista', async () => {
    api.listarModelos.mockResolvedValue({ data: { dados: { modelos: [MEU], limite: 10, criados: 1 } } });
    abrir();
    expect(await screen.findByText('Prazos da semana', { selector: 'button' })).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('instalar os relatórios padrão'));
    expect(api.executar).not.toHaveBeenCalled();
  });
});
