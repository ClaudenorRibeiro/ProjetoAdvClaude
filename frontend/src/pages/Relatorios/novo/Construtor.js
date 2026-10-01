// ============================================================
// RELATÓRIOS — CONSTRUTOR: o usuário monta o relatório em 4 passos
// (assunto → colunas → filtros → ordem). Só aparece o que o catálogo liberou para ele.
// ============================================================
import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { relatoriosAPI } from '../../../services/api';
import PassoColunas from './PassoColunas';
import { PassoFiltros } from './GrupoFiltros';
import PassoOrdem from './PassoOrdem';
import PassoAgrupar from './PassoAgrupar';
import ModalSalvar from './ModalSalvar';
import { receitaVazia, validarLocal, limparReceita, normalizarReceita } from './receita';

export function mensagemDeErro(err, padrao) {
  const d = err?.response?.data;
  return (d?.detalhes && d.detalhes.join(' ')) || d?.mensagem || padrao;
}

function Passo({ numero, titulo, children }) {
  return (
    <div className="card" style={{ marginBottom: '16px' }}>
      <h3 style={{ marginTop: 0 }}>{numero}. {titulo}</h3>
      {children}
    </div>
  );
}

export default function Construtor({ catalogo, modelo, receitaInicial, podeSalvar, onVerResultado, onSalvo, onCancelar }) {
  const [receita, setReceita] = useState(receitaInicial ? normalizarReceita(receitaInicial) : null);
  const [salvando, setSalvando] = useState(false);
  const [modalSalvar, setModalSalvar] = useState(false);
  const assunto = receita ? catalogo.assuntos.find(a => a.chave === receita.assunto) : null;
  const erros = assunto ? validarLocal(assunto, receita) : ['Escolha um assunto.'];

  const set = (parcial) => setReceita(r => ({ ...r, ...parcial }));

  async function salvar(nome, descricao) {
    setSalvando(true);
    try {
      const corpo = { nome, descricao, receita: limparReceita(assunto, receita) };
      const { data } = modelo ? await relatoriosAPI.atualizarModelo(modelo.id, corpo) : await relatoriosAPI.criarModelo(corpo);
      toast.success(data.mensagem || 'Relatório salvo');
      setModalSalvar(false);
      onSalvo(data.dados);
    } catch (err) {
      toast.error(mensagemDeErro(err, 'Não foi possível salvar o relatório'));
    } finally { setSalvando(false); }
  }

  return (
    <div>
      <Passo numero={1} titulo="Assunto">
        {modelo ? <strong>{assunto?.rotulo}</strong> : (
          <select className="form-control" style={{ maxWidth: '320px' }} aria-label="Assunto do relatório" value={receita?.assunto || ''}
            onChange={e => setReceita(receitaVazia(catalogo.assuntos.find(a => a.chave === e.target.value)))}>
            <option value="" disabled>— Escolha sobre o que será o relatório —</option>
            {catalogo.assuntos.map(a => <option key={a.chave} value={a.chave}>{a.rotulo}</option>)}
          </select>
        )}
      </Passo>

      {assunto && (
        <>
          <Passo numero={2} titulo="Colunas (dos itens)"><PassoColunas assunto={assunto} colunas={receita.colunas} onChange={colunas => set({ colunas })} /></Passo>
          <Passo numero={3} titulo="Filtros">
            <PassoFiltros assunto={assunto} periodos={catalogo.periodos} filtros={receita.filtros} onChange={filtros => set({ filtros })} />
          </Passo>
          <Passo numero={4} titulo="Agrupar e totalizar">
            <PassoAgrupar assunto={assunto} agrupar={receita.agrupar} metricas={receita.metricas} ordemGrupo={receita.ordemGrupo} onChange={set} />
          </Passo>
          <Passo numero={5} titulo="Ordem dos itens"><PassoOrdem assunto={assunto} ordem={receita.ordem} onChange={ordem => set({ ordem })} /></Passo>
        </>
      )}

      {erros.length > 0 && assunto && <p role="alert" style={{ color: '#b45309' }}>{erros.join(' ')}</p>}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={!assunto || erros.length > 0}
          onClick={() => onVerResultado(limparReceita(assunto, receita), modelo)}>Ver resultado</button>
        {podeSalvar && <button className="btn btn-secondary" disabled={!assunto || erros.length > 0} onClick={() => setModalSalvar(true)}>
          {modelo ? 'Salvar alterações' : 'Salvar relatório'}</button>}
        <button className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
      </div>

      {modalSalvar && <ModalSalvar editando={Boolean(modelo)} nomeInicial={modelo?.nome} descricaoInicial={modelo?.descricao}
        salvando={salvando} onSalvar={salvar} onCancelar={() => setModalSalvar(false)} />}
    </div>
  );
}
