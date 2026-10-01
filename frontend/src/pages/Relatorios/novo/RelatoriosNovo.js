// ============================================================
// RELATÓRIOS (tela nova) — a "casca": carrega o catálogo e os relatórios do usuário
// e alterna entre as telas (lista, construtor, resultado). A lógica de cada tela
// mora no seu próprio arquivo — este fica pequeno de propósito.
// O limite de relatórios fica em Configurações → Permissões.
// Em construção: por enquanto só o administrador enxerga (rota /meus-relatorios).
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { relatoriosAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import ModalConfirmar from '../../../components/ui/ModalConfirmar';
import ListaRelatorios from './ListaRelatorios';
import Construtor, { mensagemDeErro } from './Construtor';
import Resultado from './Resultado';
import ModalPerguntas from './ModalPerguntas';
import { perguntasDe, normalizarReceita } from './receita';

export default function RelatoriosNovo() {
  const { temPermissao } = useAuth();
  const podeCriar = temPermissao('relatorios.criar', 'cadastrar');
  const [catalogo, setCatalogo] = useState(null);
  const [lista, setLista] = useState({ modelos: [], limite: 0, criados: 0 });
  const [carregando, setCarregando] = useState(true);
  // tela: { nome: 'lista' } | { nome: 'construtor', modelo, receita } | { nome: 'resultado', modelo, origem, receita, parametros, respostas }
  const [tela, setTela] = useState({ nome: 'lista' });
  const [perguntando, setPerguntando] = useState(null);  // janela de perguntas aberta (antes de rodar)
  const [confirmar, setConfirmar] = useState(null);

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
    setConfirmar({
      titulo: 'Excluir relatório', mensagem: `O relatório "${m.nome}" será excluído. Os dados do sistema não são afetados.`, textoBotao: 'Excluir',
      acao: async () => { await relatoriosAPI.excluirModelo(m.id); toast.success('Relatório excluído'); await carregarLista(); },
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
          podeCriar={podeCriar}
          onNovo={() => setTela({ nome: 'construtor', modelo: null, receita: null })}
          onAbrir={m => iniciar(m.receita, m)}
          onEditar={m => setTela({ nome: 'construtor', modelo: m, receita: m.receita })}
          onDuplicar={duplicar} onExcluir={pedirExclusao} />
      )}
      {tela.nome === 'construtor' && (
        <Construtor catalogo={catalogo} modelo={tela.modelo} receitaInicial={tela.receita} podeSalvar={podeCriar}
          onVerResultado={(receita, modelo) => iniciar(receita, null, modelo)}
          onSalvo={irParaLista} onCancelar={irParaLista} />
      )}
      {tela.nome === 'resultado' && (
        <Resultado receita={tela.receita} modelo={tela.modelo} parametros={tela.parametros}
          temPerguntas={perguntasDe(tela.receita.filtros).length > 0}
          onVoltar={irParaLista}
          onPerguntas={() => setPerguntando({ receita: tela.receita, modelo: tela.modelo, origem: tela.origem, perguntas: perguntasDe(tela.receita.filtros), respostasIniciais: tela.respostas })}
          onEditar={() => setTela({ nome: 'construtor', modelo: tela.modelo || tela.origem || null, receita: tela.receita })} />
      )}
      {perguntando && (
        <ModalPerguntas assunto={assuntoDe(perguntando.receita)} periodos={catalogo.periodos} perguntas={perguntando.perguntas}
          respostasIniciais={perguntando.respostasIniciais} onConfirmar={responder} onCancelar={() => setPerguntando(null)} />
      )}
      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}
