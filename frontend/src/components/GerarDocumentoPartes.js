// ============================================================
// BOTÃO + MODAL "GERAR DOCUMENTO DE PARTES" (multipessoas)
// ------------------------------------------------------------
// Gera um documento que usa VÁRIAS pessoas: um ou mais autores e um ou
// mais réus (todos já cadastrados no sistema). NÃO depende de processo.
// O modelo (.docx) repete a qualificação de cada pessoa com as regiões
// {{#autores}}…{{/autores}} e {{#reus}}…{{/reus}}.
// Uso: <GerarDocumentoPartesBotao />
// ============================================================

import React, { useState, useEffect } from 'react';
import { documentosAPI, pessoasAPI } from '../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';

export default function GerarDocumentoPartesBotao({ label = '📄 Gerar documento de partes', estilo }) {
  const { temPermissao } = useAuth();
  const [aberto, setAberto] = useState(false);

  // Mesma permissão da geração comum (documentos/cadastrar).
  if (!temPermissao('documentos', 'cadastrar')) return null;

  return (
    <>
      <button className="btn btn-outline" style={estilo} onClick={() => setAberto(true)}>
        {label}
      </button>
      {aberto && <ModalGerarPartes onFechar={() => setAberto(false)} />}
    </>
  );
}

// ------------------------------------------------------------
// Seletor de um polo (autores OU réus): busca pessoa (física/jurídica) já
// cadastrada e monta a lista. Impede repetir a mesma pessoa no polo e no oposto.
// ------------------------------------------------------------
function SeletorPolo({ titulo, cor, lista, setLista, listaOposta }) {
  const [tipo, setTipo] = useState('fisica');
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);

  async function buscar(termo) {
    setBusca(termo);
    if (termo.trim().length < 2) { setResultados([]); return; }
    try {
      const fn = tipo === 'fisica' ? pessoasAPI.listarFisicas : pessoasAPI.listarJuridicas;
      const { data } = await fn({ busca: termo, limite: 8 });
      if (data.ok) setResultados(data.dados.registros);
    } catch { /* silencioso: busca não derruba a tela */ }
  }

  function adicionar(pessoa) {
    const nome = pessoa.nome || pessoa.razao_social;
    // Mesma pessoa já neste polo?
    if (lista.some(p => p.pessoa_id === pessoa.id && p.tipo_pessoa === tipo)) {
      toast.warn(`${nome} já está nesta lista`);
      setBusca(''); setResultados([]); return;
    }
    // Mesma pessoa no polo oposto?
    if (listaOposta.some(p => p.pessoa_id === pessoa.id && p.tipo_pessoa === tipo)) {
      toast.error(`${nome} já está no outro lado — a mesma pessoa não pode ser autor e réu`);
      setBusca(''); setResultados([]); return;
    }
    setLista([...lista, { pessoa_id: pessoa.id, tipo_pessoa: tipo, nome }]);
    setBusca(''); setResultados([]);
  }

  function remover(i) {
    setLista(lista.filter((_, idx) => idx !== i));
  }

  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">{titulo}</label>

      {/* Tipo de pessoa + campo de busca */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
        <select className="form-control" style={{ maxWidth: '110px' }}
          value={tipo} onChange={e => { setTipo(e.target.value); setBusca(''); setResultados([]); }}>
          <option value="fisica">Física</option>
          <option value="juridica">Jurídica</option>
        </select>
        <input className="form-control" placeholder="Buscar por nome / CPF / CNPJ..."
          value={busca} onChange={e => buscar(e.target.value)} autoComplete="off" />
      </div>

      {/* Resultados da busca */}
      {resultados.length > 0 && (
        <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', marginBottom: '8px', maxHeight: '160px', overflowY: 'auto' }}>
          {resultados.map(p => (
            <div key={`${tipo}-${p.id}`}
              onClick={() => adicionar(p)}
              style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #eef2f7', fontSize: '13px' }}>
              {p.nome || p.razao_social}
              <span style={{ color: '#888', fontSize: '11px' }}>
                {p.cpf ? ` · ${p.cpf}` : ''}{p.cnpj ? ` · ${p.cnpj}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pessoas escolhidas (chips) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {lista.length === 0
          ? <span style={{ fontSize: '12px', color: '#9ca3af' }}>Nenhuma pessoa adicionada</span>
          : lista.map((p, i) => (
            <span key={`${p.tipo_pessoa}-${p.pessoa_id}`} className={`badge ${cor}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {p.nome}
              <button onClick={() => remover(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}
                title="Remover">✕</button>
            </span>
          ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Modal de geração: escolhe o modelo, monta autores/réus e gera o documento.
// ------------------------------------------------------------
function ModalGerarPartes({ onFechar }) {
  const [modelos, setModelos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modeloId, setModeloId] = useState('');
  const [formato, setFormato] = useState('docx');
  const [autores, setAutores] = useState([]);
  const [reus, setReus] = useState([]);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    let ativo = true;
    documentosAPI.modelosParaGerar('multipessoas')
      .then(({ data }) => { if (ativo && data.ok) setModelos(data.dados); })
      .catch(() => { if (ativo) toast.error('Erro ao carregar modelos'); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  async function gerar() {
    if (!modeloId) return toast.error('Escolha um modelo');
    if (!autores.length && !reus.length) return toast.error('Adicione ao menos uma pessoa (autor ou réu)');
    setGerando(true);
    try {
      const resp = await documentosAPI.gerarMultipessoas({ modelo_id: modeloId, autores, reus, formato });
      // Nome do arquivo vem no cabeçalho Content-Disposition.
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
      // A resposta de erro também vem como blob — lê e mostra a mensagem do backend.
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
      <div className="modal-box" style={{ maxWidth: '760px' }}>
        <div className="modal-header">
          <h3>Gerar documento de partes</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {carregando ? (
            <div className="loading">Carregando modelos...</div>
          ) : modelos.length === 0 ? (
            <p className="lista-vazia">
              Nenhum modelo de "Documento de partes" cadastrado. Cadastre um modelo em Documentos
              com o destino "Documento de partes (autores e réus)".
            </p>
          ) : (
            <>
              <div className="grid-2">
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
              </div>

              {/* Esquerda = autores, direita = réus */}
              <div className="grid-2" style={{ marginTop: '8px' }}>
                <SeletorPolo titulo="Autor(es)" cor="badge-roxo"
                  lista={autores} setLista={setAutores} listaOposta={reus} />
                <SeletorPolo titulo="Réu(s)" cor="badge-cinza"
                  lista={reus} setLista={setReus} listaOposta={autores} />
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={gerar}
            disabled={gerando || carregando || !modelos.length}>
            {gerando ? 'Gerando...' : 'Gerar e Baixar'}
          </button>
        </div>
      </div>
    </div>
  );
}
