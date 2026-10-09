import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  catalogo: vi.fn(), listarModelos: vi.fn(), executar: vi.fn(), exportar: vi.fn(), duplicarModelo: vi.fn(), excluirModelo: vi.fn(),
  consultarCompartilhamento: vi.fn(), definirCompartilhamento: vi.fn(), sairDoCompartilhamento: vi.fn(), instalarPadrao: vi.fn(), salvarPreferencias: vi.fn(),
}));
const pessoas = vi.hoisted(() => ({ dadosParabens: vi.fn(), parabenizar: vi.fn() }));
vi.mock('../../../services/api', () => ({ relatoriosAPI: api, pessoasAPI: pessoas }));
const avisos = vi.hoisted(() => ({ ok: vi.fn(), erro: vi.fn() }));
vi.mock('react-toastify', () => ({ toast: { success: avisos.ok, error: avisos.erro } }));
const auth = vi.hoisted(() => ({ podeCriar: true, ehAdmin: false }));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ ehAdmin: auth.ehAdmin, temPermissao: (m) => (m === 'relatorios.criar' ? auth.podeCriar : true) }),
}));
vi.mock('../../../utils/whatsapp', () => ({ linkWhatsApp: vi.fn(() => 'https://wa.me/x') }));

import ListaRelatorios from './ListaRelatorios';
import ModalCompartilhar from './ModalCompartilhar';
import ModalSalvar from './ModalSalvar';
import RelatoriosNovo from './RelatoriosNovo';
import TabelaResultado from './TabelaResultado';

const RECEITA = { versao: 2, assunto: 'prazos', colunas: ['pasta'], filtros: { op: 'E', itens: [] }, ordem: [], agrupar: [], metricas: [], ordemGrupo: null };
const base = { assunto: 'prazos', descricao: null, receita: RECEITA, preferencias: {}, criado_em: '2026-10-01 09:00:00', alterado_em: null, sem_acesso: false, compartilhado_com: 0 };
const SISTEMA = { ...base, id: 1, nome: 'Prazos do período', escopo: 'sistema', origem: 'sistema', dono_nome: 'Administrador', pode_editar: false };
const MEU = { ...base, id: 2, nome: 'Meu relatório', escopo: 'pessoal', origem: 'proprio', dono_nome: 'Eu', pode_editar: true, compartilhado_com: 2 };
const RECEBIDO = { ...base, id: 3, nome: 'Do colega', escopo: 'pessoal', origem: 'compartilhado', dono_nome: 'Fulano', pode_editar: false };
const ASSUNTOS = [{ chave: 'prazos', rotulo: 'Prazos' }];
const acoesDaLinha = async (nome) => {
  const linha = screen.getByText(nome, { selector: 'button' }).closest('tr');
  await userEvent.click(within(linha).getByTitle('Mais ações'));
  return () => screen.queryAllByRole('button').map(b => b.textContent.replace(/^[^\p{L}]+/u, '').trim());
};
const props = (extra = {}) => ({ modelos: [SISTEMA, MEU, RECEBIDO], assuntos: ASSUNTOS, limite: 4, criados: 1, podeCriar: true, ehAdmin: false,
  onNovo: vi.fn(), onAbrir: vi.fn(), onEditar: vi.fn(), onDuplicar: vi.fn(), onExcluir: vi.fn(), onCompartilhar: vi.fn(), onSair: vi.fn(), onInstalarPadrao: vi.fn(), ...extra });

beforeEach(() => { vi.clearAllMocks(); auth.podeCriar = true; auth.ehAdmin = false; });

describe('Lista de relatórios: sistema, meus e compartilhados', () => {
  it('três seções, com selo de quem compartilhou e para quantos eu compartilhei', () => {
    render(<ListaRelatorios {...props()} />);
    expect(screen.getByRole('heading', { name: 'Relatórios do sistema' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Meus relatórios' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Compartilhados comigo' })).toBeTruthy();
    expect(screen.getByText('compartilhado com 2')).toBeTruthy();
    expect(screen.getByText('de Fulano')).toBeTruthy();
    expect(screen.getByText((_, el) => el.tagName === 'SPAN' && el.textContent === 'Você usa 1 de 4 relatórios pessoais permitidos.')).toBeTruthy();
  });

  it('seção sem itens não aparece', () => {
    render(<ListaRelatorios {...props({ modelos: [MEU] })} />);
    expect(screen.queryByRole('heading', { name: 'Relatórios do sistema' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Compartilhados comigo' })).toBeNull();
  });

  it('as ações mudam conforme a origem: sistema (usuário), meu e compartilhado', async () => {
    render(<ListaRelatorios {...props()} />);
    let ler = await acoesDaLinha('Prazos do período');
    expect(ler()).toContain('Duplicar para mim');
    expect(ler()).not.toContain('Editar'); expect(ler()).not.toContain('Excluir'); expect(ler()).not.toContain('Compartilhar');
    await userEvent.keyboard('{Escape}');
    ler = await acoesDaLinha('Meu relatório');
    expect(ler()).toEqual(expect.arrayContaining(['Editar', 'Duplicar para mim', 'Compartilhar', 'Excluir']));
    await userEvent.keyboard('{Escape}');
    ler = await acoesDaLinha('Do colega');
    expect(ler()).toContain('Remover da minha lista');
    expect(ler()).toContain('Duplicar para mim');
    expect(ler()).not.toContain('Editar'); expect(ler()).not.toContain('Excluir'); expect(ler()).not.toContain('Compartilhar');
  });

  it('administrador edita e exclui os do sistema e vê "Instalar relatórios padrão"; usuário comum não vê o botão', async () => {
    const { rerender } = render(<ListaRelatorios {...props({ ehAdmin: true, modelos: [{ ...SISTEMA, pode_editar: true }] })} />);
    expect(screen.getByRole('button', { name: 'Instalar relatórios padrão' })).toBeTruthy();
    const ler = await acoesDaLinha('Prazos do período');
    expect(ler()).toEqual(expect.arrayContaining(['Editar', 'Excluir']));
    rerender(<ListaRelatorios {...props({ ehAdmin: false })} />);
    expect(screen.queryByRole('button', { name: 'Instalar relatórios padrão' })).toBeNull();
  });

  it('sem acesso ao assunto: o nome fica desabilitado com aviso (o servidor também recusa)', () => {
    const p = props({ modelos: [{ ...RECEBIDO, sem_acesso: true }] });
    render(<ListaRelatorios {...p} />);
    expect(screen.getByText('sem acesso ao assunto')).toBeTruthy();
    expect(screen.getByText('Do colega', { selector: 'button' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Abrir' }).disabled).toBe(true);
  });

  it('quem não pode criar não vê "Novo relatório" nem Duplicar/Compartilhar', async () => {
    render(<ListaRelatorios {...props({ podeCriar: false })} />);
    expect(screen.queryByRole('button', { name: '+ Novo relatório' })).toBeNull();
  });
});

describe('Compartilhar com colegas', () => {
  const dados = { compartilhados: [{ id: 4, nome: 'Colega A', ativo: true }, { id: 9, nome: 'Ex-colega', ativo: false }],
    candidatos: [{ id: 4, nome: 'Colega A', pode: true, motivo: null }, { id: 5, nome: 'Colega B', pode: false, motivo: 'não tem acesso a Prazos' }, { id: 8, nome: 'Colega E', pode: true, motivo: null }] };

  it('lista os colegas ativos, bloqueia quem não tem acesso (com o motivo) e envia exatamente a seleção', async () => {
    api.consultarCompartilhamento.mockResolvedValue({ data: { dados } });
    api.definirCompartilhamento.mockResolvedValue({ data: { mensagem: 'Compartilhamento atualizado' } });
    const onSalvo = vi.fn();
    render(<ModalCompartilhar modelo={MEU} onSalvo={onSalvo} onCancelar={vi.fn()} />);
    expect(await screen.findByLabelText('Colega A')).toBeChecked();
    expect(screen.getByLabelText(/Colega B/)).toBeDisabled();
    expect(screen.getByText(/não tem acesso a Prazos/)).toBeTruthy();
    expect(screen.getByLabelText('Colega E')).not.toBeChecked();
    expect(screen.getByRole('note').textContent).toMatch(/Ex-colega/);                   // inativo: perde o acesso ao salvar
    await userEvent.click(screen.getByLabelText('Colega E'));
    await userEvent.click(screen.getByLabelText('Colega A'));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.definirCompartilhamento).toHaveBeenCalledWith(2, [8]));
    expect(onSalvo).toHaveBeenCalled();
  });

  it('mostra a mensagem do servidor quando a gravação é recusada', async () => {
    api.consultarCompartilhamento.mockResolvedValue({ data: { dados } });
    api.definirCompartilhamento.mockRejectedValue({ response: { data: { mensagem: 'Só dá para compartilhar com colegas ativos' } } });
    render(<ModalCompartilhar modelo={MEU} onSalvo={vi.fn()} onCancelar={vi.fn()} />);
    await screen.findByLabelText('Colega A');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(avisos.erro).toHaveBeenCalledWith('Só dá para compartilhar com colegas ativos'));
  });
});

describe('Salvar: pessoal ou do sistema', () => {
  it('usuário comum não escolhe; administrador escolhe ao criar; ao editar o tipo não muda', async () => {
    const onSalvar = vi.fn();
    const { unmount } = render(<ModalSalvar podeSistema={false} onSalvar={onSalvar} onCancelar={vi.fn()} />);
    expect(screen.queryByText(/Relatório do sistema/)).toBeNull();
    await userEvent.type(screen.getByLabelText('Nome do relatório *'), 'A');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar).toHaveBeenLastCalledWith('A', '', undefined);
    unmount();

    const salvar2 = vi.fn();
    const { unmount: u2 } = render(<ModalSalvar podeSistema onSalvar={salvar2} onCancelar={vi.fn()} />);
    expect(screen.getByLabelText(/Só eu/)).toBeChecked();
    await userEvent.type(screen.getByLabelText('Nome do relatório *'), 'B');
    await userEvent.click(screen.getByLabelText(/Relatório do sistema/));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(salvar2).toHaveBeenLastCalledWith('B', '', 'sistema');
    u2();

    const salvar3 = vi.fn();
    render(<ModalSalvar podeSistema editando nomeInicial="C" onSalvar={salvar3} onCancelar={vi.fn()} />);
    expect(screen.queryByText(/Quem vai ver/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(salvar3).toHaveBeenLastCalledWith('C', '', undefined);
  });
});

describe('Tela de relatórios (casca)', () => {
  const CATALOGO = { periodos: [], assuntos: [{ chave: 'prazos', rotulo: 'Prazos', colunasPadrao: ['pasta'], ordemPadrao: [], campos: [{ chave: 'pasta', rotulo: 'Pasta', tipo: 'texto', operadores: [], agrupavel: true, funcoes: [] }] }] };
  const RESULTADO = { colunas: [{ chave: 'pasta', rotulo: 'Pasta', tipo: 'texto', formato: null }], linhas: [{ pasta: '0001' }], total: 1, pagina: 1, limite: 50, limiteTela: 2000, truncado: false, acoes: [] };
  const abrir = () => render(<MemoryRouter><RelatoriosNovo /></MemoryRouter>);

  beforeEach(() => {
    api.catalogo.mockResolvedValue({ data: { dados: CATALOGO } });
    api.listarModelos.mockResolvedValue({ data: { dados: { modelos: [SISTEMA, MEU], limite: 4, criados: 1 } } });
    api.executar.mockResolvedValue({ data: { dados: RESULTADO } });
  });

  it('administrador instala os relatórios padrão (com confirmação) e vê o resultado', async () => {
    auth.ehAdmin = true;
    api.instalarPadrao.mockResolvedValue({ data: { dados: { criados: ['A', 'B'], jaExistiam: ['C'], falhas: [{ nome: 'D', motivo: 'campo indisponível' }] } } });
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Instalar relatórios padrão' }));
    expect(api.instalarPadrao).not.toHaveBeenCalled();                                            // primeiro pergunta
    await userEvent.click(screen.getByRole('button', { name: 'Instalar' }));
    await waitFor(() => expect(api.instalarPadrao).toHaveBeenCalled());
    expect(avisos.ok).toHaveBeenCalledWith('2 criado(s); 1 já existia(m).');
    expect(avisos.erro).toHaveBeenCalledWith('D: campo indisponível');
  });

  it('colega remove da própria lista um relatório recebido (com confirmação)', async () => {
    api.listarModelos.mockResolvedValue({ data: { dados: { modelos: [RECEBIDO], limite: 4, criados: 0 } } });
    api.sairDoCompartilhamento.mockResolvedValue({ data: {} });
    abrir();
    await screen.findByText('Do colega', { selector: 'button' });
    await userEvent.click(screen.getByTitle('Mais ações'));
    await userEvent.click(screen.getByText('Remover da minha lista'));
    await userEvent.click(await screen.findByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(api.sairDoCompartilhamento).toHaveBeenCalledWith(3));
  });

  it('abre o do sistema como usuário comum: o botão vira "Editar uma cópia" e a cópia não herda o vínculo com o original', async () => {
    abrir();
    await userEvent.click(await screen.findByText('Prazos do período', { selector: 'button' }));
    await screen.findByText('0001');
    await userEvent.click(screen.getByRole('button', { name: 'Editar uma cópia' }));
    expect(await screen.findByRole('button', { name: 'Salvar relatório' })).toBeTruthy();         // salvar = relatório NOVO (não "Salvar alterações")
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull();
  });

  it('o meu relatório abre com "Editar relatório" e salva como alteração', async () => {
    abrir();
    await userEvent.click(await screen.findByText('Meu relatório', { selector: 'button' }));
    await screen.findByText('0001');
    await userEvent.click(screen.getByRole('button', { name: 'Editar relatório' }));
    expect(await screen.findByRole('button', { name: 'Salvar alterações' })).toBeTruthy();
  });
});

describe('Menu "Parabenizar" nas linhas do resultado', () => {
  const colunas = [{ chave: 'nome', rotulo: 'Nome', tipo: 'texto', formato: null }];
  const montar = (acoes = ['parabenizar'], aoFazer = vi.fn()) => render(<MemoryRouter><TabelaResultado colunas={colunas} linhas={[{ nome: 'Ana', __id: 7 }]} acoes={acoes} aoFazerAcao={aoFazer} /></MemoryRouter>);

  it('sem ação liberada não aparece coluna de ações', () => {
    montar([]);
    expect(screen.queryByTitle('Mais ações')).toBeNull();
  });

  it('busca os dados do cliente já no clique no ⋮; o e-mail só sai depois da janela de confirmação (Para, Assunto, Mensagem)', async () => {
    pessoas.dadosParabens.mockResolvedValue({ data: { dados: { id: 7, nome: 'Ana Souza', telefone: '11999990000', email: 'ana@example.invalid', assunto_email: 'Feliz Aniversário!', mensagem: 'Feliz!', ja_parabenizado: false, parabens: [] } } });
    pessoas.parabenizar.mockResolvedValue({ data: {} });
    const aoFazer = vi.fn();
    montar(['parabenizar'], aoFazer);
    await userEvent.click(screen.getByTitle('Mais ações'));
    expect(pessoas.dadosParabens).toHaveBeenCalledWith(7);                                      // antecipado: antes de escolher
    await userEvent.click(screen.getByText('Parabenizar E-mail'));
    const janela = await screen.findByRole('dialog', { name: 'Parabenizar por e-mail' });       // abre a janela, NÃO envia na hora
    expect(within(janela).getByText('ana@example.invalid')).toBeTruthy();
    expect(within(janela).getByText('Feliz Aniversário!')).toBeTruthy();
    expect(within(janela).getByText('Feliz!')).toBeTruthy();
    expect(pessoas.parabenizar).not.toHaveBeenCalled();
    await userEvent.click(within(janela).getByRole('button', { name: 'Enviar parabéns' }));
    await waitFor(() => expect(pessoas.parabenizar).toHaveBeenCalledWith(7, { canal: 'email' }));
    expect(pessoas.dadosParabens).toHaveBeenCalledTimes(1);                                     // não busca duas vezes
    await waitFor(() => expect(aoFazer).toHaveBeenCalled());                                    // a lista recarrega
  });

  it('já parabenizado neste ano: a janela do e-mail avisa quando foi e só envia de novo no "Enviar parabéns"', async () => {
    pessoas.dadosParabens.mockResolvedValue({ data: { dados: { id: 7, nome: 'Ana Souza', email: 'ana@example.invalid', assunto_email: 'Feliz!', mensagem: 'Oi', ja_parabenizado: true, parabens: [{ canal: 'email', usuario_nome: 'Maria', enviado_em: '2026-10-01 09:00:00' }] } } });
    pessoas.parabenizar.mockResolvedValue({ data: {} });
    montar();
    await userEvent.click(screen.getByTitle('Mais ações'));
    await userEvent.click(screen.getByText('Parabenizar E-mail'));
    expect(await screen.findByText(/já foi parabenizado\(a\) por e-mail \(Maria\)/)).toBeTruthy();
    expect(pessoas.parabenizar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar parabéns' }));
    await waitFor(() => expect(pessoas.parabenizar).toHaveBeenCalledWith(7, { canal: 'email' }));
  });

  it('Cancelar na janela do e-mail não envia nada; cliente sem e-mail: a janela explica e não oferece "Enviar"', async () => {
    pessoas.dadosParabens.mockResolvedValue({ data: { dados: { id: 7, nome: 'Ana Souza', email: 'ana@example.invalid', assunto_email: 'Feliz!', mensagem: 'Oi', ja_parabenizado: false, parabens: [] } } });
    pessoas.parabenizar.mockResolvedValue({ data: {} });
    montar();
    await userEvent.click(screen.getByTitle('Mais ações'));
    await userEvent.click(screen.getByText('Parabenizar E-mail'));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Parabenizar por e-mail' })).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(pessoas.parabenizar).not.toHaveBeenCalled();
  });

  it('cliente sem e-mail cadastrado: a janela do e-mail avisa e não tem botão de enviar', async () => {
    pessoas.dadosParabens.mockResolvedValue({ data: { dados: { id: 7, nome: 'Ana Souza', email: null, assunto_email: 'Feliz!', mensagem: 'Oi', ja_parabenizado: false, parabens: [] } } });
    montar();
    await userEvent.click(screen.getByTitle('Mais ações'));
    await userEvent.click(screen.getByText('Parabenizar E-mail'));
    const janela = await screen.findByRole('dialog', { name: 'Parabenizar por e-mail' });
    expect(within(janela).getByText(/não tem e-mail cadastrado/)).toBeTruthy();
    expect(within(janela).queryByRole('button', { name: 'Enviar parabéns' })).toBeNull();
    expect(pessoas.parabenizar).not.toHaveBeenCalled();
  });

  it('cliente não encontrado (404): mostra o aviso do servidor e não registra nada', async () => {
    pessoas.dadosParabens.mockRejectedValue({ response: { data: { mensagem: 'Cliente não encontrado, inativo ou sem data de nascimento' } } });
    montar();
    await userEvent.click(screen.getByTitle('Mais ações'));
    await userEvent.click(screen.getByText('Parabenizar Zap'));
    await waitFor(() => expect(avisos.erro).toHaveBeenCalledWith('Cliente não encontrado, inativo ou sem data de nascimento'));
    expect(pessoas.parabenizar).not.toHaveBeenCalled();
  });
});
