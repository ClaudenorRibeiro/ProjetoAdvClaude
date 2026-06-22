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
          <button className="btn btn-primary" onClick={gerar} disabled={gerando || carregando || !modelos.length}>
            {gerando ? 'Gerando...' : 'Gerar e Baixar'}
          </button>
        </div>
      </div>
    </div>
  );
}
