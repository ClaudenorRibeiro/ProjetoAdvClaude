// ============================================================
// RELATÓRIOS (tela nova) — a "casca": carrega o catálogo e os relatórios do usuário
// e alterna entre as telas (lista, construtor, resultado). A lógica de cada tela
// mora no seu próprio arquivo — este fica pequeno de propósito.
// O limite de relatórios fica em Configurações → Permissões.
// Liberada para quem tem permissão em Relatórios (rota /relatorios).
// Atalho de outras telas: /relatorios?rel=processos_parados abre o relatório do sistema correspondente.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { relatoriosAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import ModalConfirmar from '../../../components/ui/ModalConfirmar';
import ListaRelatorios from './ListaRelatorios';
import Construtor, { mensagemDeErro } from './Construtor';
import Resultado from './Resultado';
import ModalPerguntas from './ModalPerguntas';
import ModalCompartilhar from './ModalCompartilhar';
import ModalAgendar from './ModalAgendar';
import { perguntasDe, normalizarReceita } from './receita';

// atalhos (?rel=...) -> nome do relatório do sistema
const ATALHOS = { processos_parados: 'Processos parados' };

export default function RelatoriosNovo() {
  const { temPermissao, ehAdmin } = useAuth();
  const podeCriar = temPermissao('relatorios.criar', 'cadastrar');
  const [catalogo, setCatalogo] = useState(null);
  const [lista, setLista] = useState({ modelos: [], limite: 0, criados: 0 });
  const [carregando, setCarregando] = useState(true);
  // tela: { nome: 'lista' } | { nome: 'construtor', modelo, receita } | { nome: 'resultado', modelo, origem, receita, parametros, respostas }
  const [tela, setTela] = useState({ nome: 'lista' });
  const [perguntando, setPerguntando] = useState(null);  // janela de perguntas aberta (antes de rodar)
  const [confirmar, setConfirmar] = useState(null);
  const [agendando, setAgendando] = useState(null);            // relatório cuja janela de envios agendados está aberta
  const [compartilhando, setCompartilhando] = useState(null);  // relatório cuja janela de compartilhar está aberta

  const carregarLista = useCallback(async () => {
    const { data } = await relatoriosAPI.listarModelos();
    setLista(data.dados);
  }, []);

  useEffect(() => {
    Promise.all([relatoriosAPI.catalogo(), relatoriosAPI.listarModelos()])
      .then(([cat, mod]) => { setCatalogo(cat.data.dados); setLista(mod.data.dados); })
      .catch(err => toast.error(mensagemDeErro(err, 'Erro ao carregar os relatórios')))
      .finally(() => setCarregando(false));
  }, []);

  // Atalho vindo de outra tela (ex.: card "Processos Parados" do Dashboard): abre o relatório do sistema
  const [params, setParams] = useSearchParams();
  const atalho = params.get('rel');
  useEffect(() => {
    if (carregando || !atalho) return;
    setParams({}, { replace: true });
    const nome = ATALHOS[atalho];
    const m = nome && lista.modelos.find(x => x.origem === 'sistema' && x.nome === nome);
    if (m && !m.sem_acesso) iniciar(m.receita, m);
    else toast.info(`O relatório "${nome || atalho}" ainda não está disponível. Peça ao administrador para instalar os relatórios padrão.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando, atalho]);

  const irParaLista = () => { setTela({ nome: 'lista' }); carregarLista().catch(() => {}); };

  // Roda o relatório; se ele tem perguntas ("perguntar ao abrir"), pergunta antes
  function iniciar(receitaBruta, modelo, origem = null) {
    const receita = normalizarReceita(receitaBruta);
    const perguntas = perguntasDe(receita.filtros);
    if (!perguntas.length) return setTela({ nome: 'resultado', modelo, origem, receita, parametros: [], respostas: {} });
    return setPerguntando({ receita, modelo, origem, perguntas, respostasIniciais: {} });
  }

  function responder(parametros, respostas) {
    const { receita, modelo, origem } = perguntando;
    setPerguntando(null);
    setTela({ nome: 'resultado', modelo, origem, receita, parametros, respostas });
  }

  async function duplicar(m) {
    try { await relatoriosAPI.duplicarModelo(m.id); toast.success('Relatório duplicado'); await carregarLista(); }
    catch (err) { toast.error(mensagemDeErro(err, 'Não foi possível duplicar')); }
  }

  function pedirExclusao(m) {
    const sistema = m.origem === 'sistema';
    setConfirmar({
      titulo: 'Excluir relatório',
      mensagem: sistema
        ? `O relatório do sistema "${m.nome}" deixará de existir para TODOS os usuários. Os dados do sistema não são afetados.`
        : `O relatório "${m.nome}" será excluído${m.compartilhado_com ? ` e os ${m.compartilhado_com} colega(s) com quem você o compartilhou perdem o acesso` : ''}. Os dados do sistema não são afetados.`,
      textoBotao: 'Excluir',
      acao: async () => { await relatoriosAPI.excluirModelo(m.id); toast.success('Relatório excluído'); await carregarLista(); },
    });
  }

  function pedirSaida(m) {
    setConfirmar({
      titulo: 'Remover da sua lista', mensagem: `"${m.nome}" sai da sua lista. O relatório de ${m.dono_nome} não é afetado e ele pode compartilhar de novo.`, textoBotao: 'Remover',
      acao: async () => { await relatoriosAPI.sairDoCompartilhamento(m.id); toast.success('Removido da sua lista'); await carregarLista(); },
    });
  }

  function pedirInstalacaoPadrao() {
    setConfirmar({
      titulo: 'Instalar relatórios padrão',
      mensagem: 'Cria os relatórios padrão do escritório (prazos, tarefas, audiências, perícias por perito, processos, processos parados, aniversariantes e lançamentos financeiros) que ainda não existem. Os que já existem não são alterados.',
      textoBotao: 'Instalar', tipo: 'aviso',
      acao: async () => {
        const { data } = await relatoriosAPI.instalarPadrao();
        const r = data.dados;
        toast.success(`${r.criados.length} criado(s); ${r.jaExistiam.length} já existia(m).`);
        r.falhas.forEach(f => toast.error(`${f.nome}: ${f.motivo}`));
        await carregarLista();
      },
    });
  }

  if (carregando) return <div className="loading">Carregando...</div>;
  if (!catalogo) return null;
  if (!catalogo.assuntos.length) {
    return <div className="card"><p className="lista-vazia">Você não tem permissão para nenhum assunto de relatório. Peça ao administrador.</p></div>;
  }
  const assuntoDe = (receita) => catalogo.assuntos.find(a => a.chave === receita.assunto);

  return (
    <div>
      {tela.nome === 'lista' && (
        <ListaRelatorios modelos={lista.modelos} assuntos={catalogo.assuntos} limite={lista.limite} criados={lista.criados}
          podeCriar={podeCriar} ehAdmin={ehAdmin}
          onNovo={() => setTela({ nome: 'construtor', modelo: null, receita: null })}
          onAbrir={m => iniciar(m.receita, m)}
          onEditar={m => setTela({ nome: 'construtor', modelo: m, receita: m.receita })}
          onDuplicar={duplicar} onExcluir={pedirExclusao} onCompartilhar={setCompartilhando} onAgendar={setAgendando} onSair={pedirSaida}
          onInstalarPadrao={pedirInstalacaoPadrao} />
      )}
      {tela.nome === 'construtor' && (
        <Construtor catalogo={catalogo} modelo={tela.modelo} receitaInicial={tela.receita} podeSalvar={podeCriar || (ehAdmin && tela.modelo?.escopo === 'sistema')} podeSistema={ehAdmin}
          onVerResultado={(receita, modelo) => iniciar(receita, null, modelo)}
          onSalvo={irParaLista} onCancelar={irParaLista} />
      )}
      {tela.nome === 'resultado' && (
        <Resultado receita={tela.receita} modelo={tela.modelo} parametros={tela.parametros}
          temPerguntas={perguntasDe(tela.receita.filtros).length > 0}
          podeEditar={!tela.modelo || tela.modelo.pode_editar !== false}
          onVoltar={irParaLista}
          onPerguntas={() => setPerguntando({ receita: tela.receita, modelo: tela.modelo, origem: tela.origem, perguntas: perguntasDe(tela.receita.filtros), respostasIniciais: tela.respostas })}
          onEditar={() => {
            // relatório que não é meu (sistema para quem não é admin, ou compartilhado): edita uma CÓPIA nova, só minha
            const editavel = !tela.modelo || tela.modelo.pode_editar !== false;
            setTela({ nome: 'construtor', modelo: editavel ? (tela.modelo || tela.origem || null) : null, receita: tela.receita });
          }} />
      )}
      {perguntando && (
        <ModalPerguntas assunto={assuntoDe(perguntando.receita)} periodos={catalogo.periodos} perguntas={perguntando.perguntas}
          respostasIniciais={perguntando.respostasIniciais} onConfirmar={responder} onCancelar={() => setPerguntando(null)} />
      )}
      {agendando && <ModalAgendar modelo={agendando} onFechar={() => setAgendando(null)} />}
      {compartilhando && <ModalCompartilhar modelo={compartilhando} onCancelar={() => setCompartilhando(null)} onSalvo={() => { setCompartilhando(null); carregarLista().catch(() => {}); }} />}
      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}
