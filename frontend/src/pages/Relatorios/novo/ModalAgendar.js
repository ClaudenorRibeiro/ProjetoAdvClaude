// ============================================================
// RELATÓRIOS — janela "Envios agendados" de um relatório: lista, cria, pausa, testa e exclui envios por e-mail.
// Só o dono mexe nos seus. O relatório é gerado na hora do envio (nada fica guardado), sempre com as permissões do dono.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { relatoriosAPI } from '../../../services/api';
import useEscFechar from '../../../hooks/useEscFechar';
import { mensagemDeErro } from './Construtor';
import FormAgendamento, { descreverQuando } from './FormAgendamento';

const FORMATO = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel' };
const dataHora = (t) => (t ? `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)} ${t.slice(11, 16)}` : '—');

export default function ModalAgendar({ modelo, onFechar }) {
  const [lista, setLista] = useState(null);
  const [candidatos, setCandidatos] = useState([]);
  const [editando, setEditando] = useState(null);   // null = fechado; {} = novo; objeto = editar
  const [ocupado, setOcupado] = useState(false);
  const overlayRef = useEscFechar(() => { if (!editando) onFechar(); });

  const carregar = useCallback(async () => {
    const [a, c] = await Promise.all([relatoriosAPI.listarAgendamentos(modelo.id), relatoriosAPI.candidatosAgendamento(modelo.id)]);
    setLista(a.data.dados); setCandidatos(c.data.dados.candidatos);
  }, [modelo.id]);
  useEffect(() => { carregar().catch(err => { toast.error(mensagemDeErro(err, 'Não foi possível carregar os envios')); onFechar(); }); }, [carregar]); // eslint-disable-line

  async function executar(fn, ok) {
    setOcupado(true);
    try { const r = await fn(); toast.success((r && r.data && r.data.mensagem) || ok); await carregar(); return true; }
    catch (err) { toast.error(mensagemDeErro(err, 'Não foi possível concluir')); return false; }
    finally { setOcupado(false); }
  }
  const salvar = async (campos) => {
    const feito = await executar(() => (editando.id ? relatoriosAPI.atualizarAgendamento(editando.id, campos) : relatoriosAPI.criarAgendamento({ modelo_id: modelo.id, ...campos })), 'Envio salvo');
    if (feito) setEditando(null);
  };
  const excluir = (a) => { if (window.confirm('Excluir este envio agendado?')) executar(() => relatoriosAPI.excluirAgendamento(a.id), 'Envio excluído'); };

  function cartao(a) {
    return (
      <div key={a.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, marginBottom: 8, opacity: a.ativo ? 1 : 0.75 }}>
        <div><strong>{descreverQuando(a)}</strong> · {FORMATO[a.formato]} {!a.ativo && <span style={{ color: '#b45309' }}>· pausado</span>}</div>
        <div style={{ fontSize: 13, color: '#374151' }}>Para: {a.destinatarios.map(d => d.nome).join(', ')}</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          {a.ativo && <>Próximo envio: {dataHora(a.proxima_execucao)} · </>}Último: {a.ultimo_envio ? `${dataHora(a.ultimo_envio)} (${a.ultimo_status === 'ok' ? 'enviado' : 'falhou'})` : 'ainda não enviado'}
        </div>
        {a.ultimo_erro && <div role="alert" style={{ fontSize: 12, color: '#b91c1c' }}>{a.ultimo_erro}</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          <button className="btn btn-secondary" disabled={ocupado} onClick={() => setEditando(a)}>Editar</button>
          <button className="btn btn-secondary" disabled={ocupado} onClick={() => executar(() => relatoriosAPI.atualizarAgendamento(a.id, { ativo: !a.ativo }), a.ativo ? 'Envio pausado' : 'Envio retomado')}>{a.ativo ? 'Pausar' : 'Retomar'}</button>
          <button className="btn btn-secondary" disabled={ocupado} title="Manda agora, só para o seu e-mail" onClick={() => executar(() => relatoriosAPI.testarAgendamento(a.id), 'Enviado')}>Testar (enviar para mim)</button>
          <button className="btn btn-danger" disabled={ocupado} onClick={() => excluir(a)}>Excluir</button>
        </div>
      </div>
    );
  }

  const cheio = lista && lista.agendamentos.length >= lista.limite;
  return (
    <div className="modal-overlay" ref={overlayRef}>
      <div className="modal-box" role="dialog" aria-label="Envios agendados" style={{ maxWidth: 680 }}>
        <div className="modal-header"><h3>Envios agendados: {modelo.nome}</h3><button className="modal-fechar" onClick={onFechar}>✕</button></div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflow: 'auto' }}>
          {!lista ? <div className="loading">Carregando...</div> : (
            <>
              <p style={{ marginTop: 0, color: '#374151' }}>O sistema gera este relatório no dia e na hora escolhidos e envia por e-mail como anexo. Seus envios: {lista.agendamentos.length} de {lista.limite}.</p>
              {lista.agendamentos.length === 0 && !editando && <p className="lista-vazia">Nenhum envio agendado para este relatório.</p>}
              {lista.agendamentos.map(a => (editando && editando.id === a.id
                ? <FormAgendamento key={a.id} inicial={a} candidatos={candidatos} salvando={ocupado} onSalvar={salvar} onCancelar={() => setEditando(null)} />
                : cartao(a)))}
              {editando && !editando.id && <FormAgendamento candidatos={candidatos} salvando={ocupado} onSalvar={salvar} onCancelar={() => setEditando(null)} />}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
          <button className="btn btn-primary" disabled={!lista || !!editando || cheio} title={cheio ? 'Limite de envios atingido' : ''} onClick={() => setEditando({})}>+ Novo envio</button>
        </div>
      </div>
    </div>
  );
}
