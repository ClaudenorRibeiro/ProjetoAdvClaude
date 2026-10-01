// ============================================================
// RELATÓRIOS (tela nova) — a "casca": carrega o catálogo e os relatórios do usuário
// e alterna entre as telas (lista, construtor, resultado, limites). A lógica de cada tela
// mora no seu próprio arquivo — este fica pequeno de propósito.
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
import LimitesRelatorios from './LimitesRelatorios';

export default function RelatoriosNovo() {
  const { temPermissao, ehAdmin } = useAuth();
  const podeCriar = temPermissao('relatorios.criar', 'cadastrar');
  const [catalogo, setCatalogo] = useState(null);
  const [lista, setLista] = useState({ modelos: [], limite: 0, criados: 0 });
  const [carregando, setCarregando] = useState(true);
  // tela: { nome: 'lista' } | { nome: 'construtor', modelo, receita } | { nome: 'resultado', modelo, receita } | { nome: 'limites' }
  const [tela, setTela] = useState({ nome: 'lista' });
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

  return (
    <div>
      {tela.nome === 'lista' && (
        <ListaRelatorios modelos={lista.modelos} assuntos={catalogo.assuntos} limite={lista.limite} criados={lista.criados}
          podeCriar={podeCriar} ehAdmin={ehAdmin}
          onNovo={() => setTela({ nome: 'construtor', modelo: null, receita: null })}
          onAbrir={m => setTela({ nome: 'resultado', modelo: m, receita: m.receita })}
          onEditar={m => setTela({ nome: 'construtor', modelo: m, receita: m.receita })}
          onDuplicar={duplicar} onExcluir={pedirExclusao} onLimites={() => setTela({ nome: 'limites' })} />
      )}
      {tela.nome === 'construtor' && (
        <Construtor catalogo={catalogo} modelo={tela.modelo} receitaInicial={tela.receita} podeSalvar={podeCriar}
          onVerResultado={(receita, modelo) => setTela({ nome: 'resultado', modelo: null, receita, origem: modelo })}
          onSalvo={irParaLista} onCancelar={irParaLista} />
      )}
      {tela.nome === 'resultado' && (
        <Resultado receita={tela.receita} modelo={tela.modelo} onVoltar={irParaLista}
          onEditar={(receita) => setTela({ nome: 'construtor', modelo: tela.modelo || tela.origem || null, receita })} />
      )}
      {tela.nome === 'limites' && <LimitesRelatorios onVoltar={irParaLista} />}

      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}
