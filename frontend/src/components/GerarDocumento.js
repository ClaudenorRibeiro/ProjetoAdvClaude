// ============================================================
// BOTÃO + MODAL "GERAR DOCUMENTO" (reutilizável por qualquer setor)
// ------------------------------------------------------------
// Uso: <GerarDocumentoBotao ancoraTipo="audiencia" ancoraId={a.id} />
// Lista os modelos compatíveis com a âncora, deixa escolher e gera o
// documento já preenchido (baixa no Downloads). PDF entra na etapa 2b.
// ============================================================

import React, { useState, useEffect } from 'react';
import { documentosAPI } from '../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';

export default function GerarDocumentoBotao({ ancoraTipo, ancoraId, beneficiario, label = '📄 Gerar Doc', estilo }) {
  const { temPermissao } = useAuth();
  const [aberto, setAberto] = useState(false);

  // Só aparece para quem pode gerar documentos.
  if (!temPermissao('documentos', 'cadastrar')) return null;

  return (
    <>
      <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 10px', ...estilo }}
        onClick={() => setAberto(true)}>
        {label}
      </button>
      {aberto && (
        <ModalGerar ancoraTipo={ancoraTipo} ancoraId={ancoraId} beneficiario={beneficiario} onFechar={() => setAberto(false)} />
      )}
    </>
  );
}

// Modal de geração — exportado para também ser usado de forma controlada
// por outras telas (ex.: no fluxo do "Fazer" em Prazos).
// beneficiario (opcional): só usado em recibos (âncora 'pagamento') — 'cliente' | 'parceiro'.
export function ModalGerar({ ancoraTipo, ancoraId, beneficiario, onFechar }) {
  const [modelos, setModelos]     = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modeloId, setModeloId]   = useState('');
  const [formato, setFormato]     = useState('docx');
  const [gerando, setGerando]     = useState(false);
  const [comporEmail, setComporEmail] = useState(false); // janela "Enviar por e-mail" aberta

  function abrirEnviarEmail() {
    if (!modeloId) return toast.error('Escolha um modelo');
    setComporEmail(true);
  }

  useEffect(() => {
    let ativo = true;
    documentosAPI.modelosParaGerar(ancoraTipo, ancoraId, beneficiario)
      .then(({ data }) => { if (ativo && data.ok) setModelos(data.dados); })
      .catch(() => { if (ativo) toast.error('Erro ao carregar modelos'); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [ancoraTipo, ancoraId, beneficiario]);

  async function gerar() {
    if (!modeloId) return toast.error('Escolha um modelo');
    setGerando(true);
    try {
      const resp = await documentosAPI.gerar({
        modelo_id: modeloId, ancora_tipo: ancoraTipo, ancora_id: ancoraId, formato,
      });
      // Extrai o nome do arquivo do cabeçalho Content-Disposition.
      const cd = resp.headers['content-disposition'] || '';
      const m = cd.match(/filename="(.+?)"/);
      const nome = m ? m[1] : `documento.${formato}`;

      const url = URL.createObjectURL(new Blob([resp.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('Documento gerado e baixado!');
      onFechar();
    } catch (err) {
      // Como a resposta é blob, a mensagem de erro do backend também vem como blob — lê e mostra.
      let msg = 'Erro ao gerar o documento';
      try {
        const txt = await err.response?.data?.text?.();
        if (txt) msg = (JSON.parse(txt).mensagem) || msg;
      } catch { /* mantém msg padrão */ }
      toast.error(msg);
    } finally {
      setGerando(false);
    }
  }

  return (
    <>
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Gerar documento</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {carregando ? (
            <div className="loading">Carregando modelos...</div>
          ) : modelos.length === 0 ? (
            <p className="lista-vazia">
              Nenhum modelo compatível com esta tela. Cadastre um modelo em Documentos
              usando variáveis desta origem.
            </p>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Modelo *</label>
                <select className="form-control" value={modeloId} onChange={e => setModeloId(e.target.value)}>
                  <option value="">— Selecione —</option>
                  {modelos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Formato</label>
                <select className="form-control" value={formato} onChange={e => setFormato(e.target.value)}>
                  <option value="docx">Word (.docx)</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-outline" onClick={abrirEnviarEmail} disabled={gerando || carregando || !modelos.length}>
            ✉️ Enviar por e-mail
          </button>
          <button className="btn btn-primary" onClick={gerar} disabled={gerando || carregando || !modelos.length}>
            {gerando ? 'Gerando...' : 'Gerar e Baixar'}
          </button>
        </div>
      </div>
    </div>

    {/* Janela de envio por e-mail: gera o documento e anexa (nada é salvo) */}
    {comporEmail && (
      <ModalEnviarDocumentoEmail
        ancoraTipo={ancoraTipo} ancoraId={ancoraId} modeloId={modeloId} formato={formato}
        onFechar={() => setComporEmail(false)}
        onSucesso={() => { setComporEmail(false); onFechar(); }}
      />
    )}
    </>
  );
}

// ============================================================
// MODAL "Enviar documento por e-mail" (aberto de dentro do "Gerar documento").
// Gera o documento escolhido e ENVIA anexado. O documento NÃO é salvo (nem S3, nem banco):
// só fica o log de comunicação. Destinatário sugerido = a pessoa (âncora pessoa) ou o
// cliente do processo — sempre editável.
// ============================================================
function ModalEnviarDocumentoEmail({ ancoraTipo, ancoraId, modeloId, formato, onFechar, onSucesso }) {
  const [para, setPara]         = useState('');
  const [outros, setOutros]     = useState([]); // outros e-mails sugeridos (atalhos)
  const [assunto, setAssunto]   = useState('');
  const [mensagem, setMensagem] = useState('');
  const [carregandoDest, setCarregandoDest] = useState(true);
  const [enviando, setEnviando] = useState(false);

  // Busca o destinatário sugerido (e-mails da pessoa ou do cliente do processo).
  useEffect(() => {
    let ativo = true;
    documentosAPI.destinatarioSugerido(ancoraTipo, ancoraId)
      .then(({ data }) => {
        if (!ativo || !data.ok) return;
        const emails = (data.dados?.emails || []).filter(Boolean);
        if (emails.length) { setPara(emails[0]); setOutros(emails.slice(1)); }
      })
      .catch(() => { /* sem sugestão: o usuário digita o e-mail */ })
      .finally(() => { if (ativo) setCarregandoDest(false); });
    return () => { ativo = false; };
  }, [ancoraTipo, ancoraId]);

  // Fecha com Escape (a menos que esteja enviando)
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !enviando) onFechar(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onFechar, enviando]);

  async function enviar() {
    const dest = para.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) { toast.error('Informe um e-mail de destino válido'); return; }
    if (!assunto.trim())  { toast.error('Informe o assunto'); return; }
    if (!mensagem.trim()) { toast.error('Escreva a mensagem'); return; }
    setEnviando(true);
    try {
      await documentosAPI.gerarEEnviar({
        modelo_id: modeloId, ancora_tipo: ancoraTipo, ancora_id: ancoraId, formato,
        para: dest, assunto: assunto.trim(), mensagem: mensagem.trim(),
      });
      toast.success('E-mail enviado com o documento em anexo!');
      onSucesso();
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Não foi possível enviar o e-mail');
    } finally {
      setEnviando(false);
    }
  }

  const rotulo = { display: 'block', fontSize: '13px', color: '#555', margin: '0 0 4px' };
  const campo  = { width: '100%', padding: '8px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '6px', boxSizing: 'border-box', marginBottom: '12px' };
  const nomeFormato = formato === 'pdf' ? 'PDF' : 'Word (.docx)';

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Enviar documento por e-mail</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          <label style={rotulo}>Para</label>
          <input value={para} onChange={e => setPara(e.target.value)}
            placeholder={carregandoDest ? 'Buscando e-mail sugerido...' : 'e-mail do destinatário'} style={campo} />
          {/* Atalhos para outros e-mails sugeridos (quando a pessoa tem mais de um) */}
          {outros.length > 0 && (
            <div style={{ marginTop: '-6px', marginBottom: '12px', fontSize: '12px', color: '#666' }}>
              Outros e-mails:{' '}
              {outros.map((em, i) => (
                <button key={i} type="button" onClick={() => setPara(em)}
                  style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, marginRight: '8px', textDecoration: 'underline' }}>
                  {em}
                </button>
              ))}
            </div>
          )}

          <label style={rotulo}>Assunto</label>
          <input value={assunto} onChange={e => setAssunto(e.target.value)} maxLength={200}
            placeholder="Assunto do e-mail" style={campo} />

          <label style={rotulo}>Mensagem</label>
          <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={6}
            placeholder="Escreva a mensagem..." style={{ ...campo, resize: 'vertical' }} />

          <div style={{ fontSize: '13px', color: '#334155', background: '#f1f5f9', border: '1px solid #e2e8f0',
            borderRadius: '6px', padding: '8px 10px' }}>
            📎 Anexo: o documento gerado agora, em <strong>{nomeFormato}</strong>.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar} disabled={enviando}>Cancelar</button>
          <button className="btn btn-primary" onClick={enviar} disabled={enviando || !para.trim() || !assunto.trim() || !mensagem.trim()}>
            {enviando ? 'Enviando...' : 'Gerar e Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
