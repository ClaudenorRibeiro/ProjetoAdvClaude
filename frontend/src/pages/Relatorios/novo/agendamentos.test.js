import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listarAgendamentos: vi.fn(), candidatosAgendamento: vi.fn(), criarAgendamento: vi.fn(),
  atualizarAgendamento: vi.fn(), excluirAgendamento: vi.fn(), testarAgendamento: vi.fn(),
}));
vi.mock('../../../services/api', () => ({ relatoriosAPI: api }));
const avisos = vi.hoisted(() => ({ ok: vi.fn(), erro: vi.fn() }));
vi.mock('react-toastify', () => ({ toast: { success: avisos.ok, error: avisos.erro } }));

import ModalAgendar from './ModalAgendar';
import { descreverQuando } from './FormAgendamento';

const MODELO = { id: 7, nome: 'Prazos da semana', assunto: 'prazos' };
const CANDIDATOS = [
  { id: 4, nome: 'Dono', pode: true, motivo: null },
  { id: 5, nome: 'Colega Ok', pode: true, motivo: null },
  { id: 6, nome: 'Sem Prazos', pode: false, motivo: 'não tem acesso a Prazos' },
];
const AG = { id: 1, modelo_id: 7, frequencia: 'mensal', dia_semana: null, dia_mes: 1, hora: '08:00', formato: 'pdf', ativo: true,
  proxima_execucao: '2026-11-01 08:00:00', ultimo_envio: null, ultimo_status: null, ultimo_erro: null, destinatarios: [{ id: 5, nome: 'Colega Ok' }] };

beforeEach(() => {
  vi.clearAllMocks();
  api.listarAgendamentos.mockResolvedValue({ data: { dados: { agendamentos: [AG], limite: 10 } } });
  api.candidatosAgendamento.mockResolvedValue({ data: { dados: { candidatos: CANDIDATOS } } });
  api.criarAgendamento.mockResolvedValue({ data: { mensagem: 'Envio agendado' } });
  api.atualizarAgendamento.mockResolvedValue({ data: { mensagem: 'ok' } });
  api.testarAgendamento.mockResolvedValue({ data: { mensagem: 'Enviado para o seu e-mail' } });
});

describe('Envios agendados', () => {
  it('descreve em português quando o envio acontece', () => {
    expect(descreverQuando({ frequencia: 'diaria', hora: '07:30' })).toBe('Todo dia às 07:30');
    expect(descreverQuando({ frequencia: 'semanal', dia_semana: 1, hora: '09:00' })).toBe('Toda segunda-feira às 09:00');
    expect(descreverQuando({ frequencia: 'mensal', dia_mes: 1, hora: '08:00' })).toBe('Todo dia 1 do mês às 08:00');
  });

  it('lista os envios do relatório com próximo envio e destinatários', async () => {
    render(<ModalAgendar modelo={MODELO} onFechar={vi.fn()} />);
    expect(await screen.findByText('Todo dia 1 do mês às 08:00')).toBeInTheDocument();
    expect(screen.getByText(/Para: Colega Ok/)).toBeInTheDocument();
    expect(screen.getByText(/Próximo envio: 01\/11\/2026 08:00/)).toBeInTheDocument();
    expect(api.listarAgendamentos).toHaveBeenCalledWith(7);
  });

  it('cria um envio: quem não pode receber fica desabilitado com o motivo e só os válidos vão ao servidor', async () => {
    render(<ModalAgendar modelo={MODELO} onFechar={vi.fn()} />);
    await screen.findByText('Todo dia 1 do mês às 08:00');
    await userEvent.click(screen.getByText('+ Novo envio'));
    expect(screen.getByLabelText(/Sem Prazos/)).toBeDisabled();
    expect(screen.getByText(/não tem acesso a Prazos/)).toBeInTheDocument();
    expect(screen.getByText('Salvar envio')).toBeDisabled();           // ninguém marcado
    await userEvent.click(screen.getByLabelText('Colega Ok'));
    await userEvent.click(screen.getByText('Salvar envio'));
    await waitFor(() => expect(api.criarAgendamento).toHaveBeenCalledWith({ modelo_id: 7, frequencia: 'diaria', hora: '08:00', formato: 'pdf', destinatarios: [5] }));
    expect(avisos.ok).toHaveBeenCalledWith('Envio agendado');
  });

  it('pausa e testa um envio existente', async () => {
    render(<ModalAgendar modelo={MODELO} onFechar={vi.fn()} />);
    await screen.findByText('Todo dia 1 do mês às 08:00');
    await userEvent.click(screen.getByText('Pausar'));
    await waitFor(() => expect(api.atualizarAgendamento).toHaveBeenCalledWith(1, { ativo: false }));
    await userEvent.click(screen.getByText(/Testar/));
    await waitFor(() => expect(api.testarAgendamento).toHaveBeenCalledWith(1));
  });

  it('mostra o motivo da última falha', async () => {
    api.listarAgendamentos.mockResolvedValue({ data: { dados: { agendamentos: [{ ...AG, ativo: false, ultimo_envio: '2026-10-01 08:00:00', ultimo_status: 'falha', ultimo_erro: 'Nenhum destinatário pode mais receber este relatório.' }], limite: 10 } } });
    render(<ModalAgendar modelo={MODELO} onFechar={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Nenhum destinatário pode mais receber');
    expect(screen.getByText('Retomar')).toBeInTheDocument();
  });
});
