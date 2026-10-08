// ============================================================
// AVISOS AOS CLIENTES — conferência antes de enviar (Perícia, Audiência, Parabéns).
// A lista é compartilhada por quem tem permissão; o primeiro que decide vence (os outros recebem aviso e a lista atualiza).
// WhatsApp nunca é automático: abre o link wa.me com a mensagem pronta e a própria pessoa envia.
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { avisosAPI } from '../../services/api';
import { linkWhatsApp } from '../../utils/whatsapp';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import AvisoCartao from './AvisoCartao';
import EditarAviso from './EditarAviso';
import HistoricoAvisos from './HistoricoAvisos';

export default function Avisos() {
  const [aba, setAba] = useState('pendentes');
  const [itens, setItens] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState(null);
  const [descartando, setDescartando] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([avisosAPI.listar(), avisosAPI.historico()]);
      setItens(p.data.dados.itens);
      setHistorico(h.data.dados);
    } catch { toast.error('Não foi possível carregar os avisos'); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Mostra a mensagem do servidor; se outra pessoa chegou primeiro (409), atualiza a lista.
  function tratarErro(err, padrao) {
    toast.error(err?.response?.data?.mensagem || padrao);
    if (err?.response?.status === 409) carregar();
  }

  async function atualizarLista() {
    setOcupado(true);
    try { await avisosAPI.atualizar(); await carregar(); toast.success('Lista atualizada'); }
    catch (err) { tratarErro(err, 'Não foi possível atualizar a lista'); }
    finally { setOcupado(false); }
  }

  async function enviar(aviso, marcados) {
    const canais = ['email', 'sms', 'whatsapp'].filter(c => aviso.canais[c].disponivel && marcados[c]);
    // Abre a aba do WhatsApp já no clique (senão o navegador bloqueia); o endereço entra depois da resposta.
    const janela = canais.includes('whatsapp') ? window.open('', '_blank') : null;
    setOcupado(true);
    try {
      const { data } = await avisosAPI.enviar(aviso.id, { canais });
      const wa = data.dados?.whatsapp;
      const link = wa ? linkWhatsApp(wa.numero, wa.texto) : null;
      if (janela && link) janela.location = link; else if (janela) janela.close();
      toast.success('Aviso enviado');
      await carregar();
    } catch (err) {
      if (janela) janela.close();
      tratarErro(err, 'Não foi possível enviar o aviso');
    } finally { setOcupado(false); }
  }

  const pendentes = itens.length;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e2a3a', margin: 0 }}>Avisos aos clientes</h2>
          <p style={{ color: '#5b6472', fontSize: 13, margin: '4px 0 0' }}>Confira, ajuste e envie os avisos de perícia, audiência e parabéns</p>
        </div>
        <button className="btn btn-outline" disabled={ocupado} onClick={atualizarLista}>Atualizar lista</button>
      </div>
      <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button role="tab" aria-selected={aba === 'pendentes'} className={`btn ${aba === 'pendentes' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setAba('pendentes')}>Pendentes ({pendentes})</button>
        <button role="tab" aria-selected={aba === 'historico'} className={`btn ${aba === 'historico' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setAba('historico')}>Histórico</button>
      </div>
      {carregando ? <div className="loading">Carregando...</div> : aba === 'historico' ? <HistoricoAvisos itens={historico} /> : (
        pendentes === 0 ? <p style={{ color: '#5b6472' }}>Nenhum aviso aguardando conferência.</p>
          : itens.map(a => <AvisoCartao key={a.id} aviso={a} ocupado={ocupado} onEnviar={enviar} onEditar={setEditando} onDescartar={setDescartando} />)
      )}
      {editando && <EditarAviso aviso={editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar(); }} onConflito={() => { setEditando(null); carregar(); }} />}
      {descartando && (
        <ModalConfirmar titulo="Descartar aviso" tipo="aviso" textoBotao="Descartar"
          mensagem={`O aviso para ${descartando.cliente_nome} não será enviado e ficará registrado no histórico.`}
          onCancelar={() => setDescartando(null)}
          acao={async () => {
            try { await avisosAPI.descartar(descartando.id); toast.success('Aviso descartado'); await carregar(); }
            catch (err) { tratarErro(err, 'Não foi possível descartar o aviso'); }
          }} />
      )}
    </div>
  );
}
