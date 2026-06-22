// ============================================================
// MODAL "GERAR EM LOTE" (reutilizável por Audiências e Perícias)
// ------------------------------------------------------------
// Recebe a lista de registros selecionados (caixinhas marcadas na tela) e:
//  1) chama o backend para AGRUPAR por tipo (audiência: tipo+modalidade; perícia: tipo)
//     e descobrir os modelos disponíveis de cada grupo;
//  2) deixa o usuário escolher 1 modelo por grupo (grupos sem modelo são avisados e pulados);
//  3) escolhe o formato (PDF ou DOCX) e gera tudo num único ZIP (baixa no Downloads).
//
// Uso: <ModalGerarLote ancoraTipo="audiencia" ancoraIds={[1,2,3]} onFechar={...} />
// ============================================================

import React, { useState, useEffect } from 'react';
import { documentosAPI } from '../services/api';
import { toast } from 'react-toastify';

export default function ModalGerarLote({ ancoraTipo, ancoraIds, onFechar }) {
  const [grupos, setGrupos]         = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formato, setFormato]       = useState('docx');
  // Modelo escolhido por grupo: { [chave do grupo]: modeloId }
  const [escolhas, setEscolhas]     = useState({});
  const [gerando, setGerando]       = useState(false);

  // 1) Pergunta ao backend como ficam os grupos e os modelos de cada um.
  useEffect(() => {
    let ativo = true;
    documentosAPI.prepararLote(ancoraTipo, ancoraIds)
      .then(({ data }) => {
        if (!ativo || !data.ok) return;
        const gs = data.dados.grupos || [];
        setGrupos(gs);
        // Pré-seleciona o modelo quando o grupo tem exatamente um (evita clique à toa).
        const iniciais = {};
        gs.forEach(g => { if (g.modelos.length === 1) iniciais[g.chave] = String(g.modelos[0].id); });
        setEscolhas(iniciais);
      })
      .catch(() => { if (ativo) toast.error('Erro ao preparar o lote'); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [ancoraTipo, ancoraIds]);

  // Separa os grupos que têm modelo (geráveis) dos que não têm (serão pulados).
  const comModelo = grupos.filter(g => g.modelos.length > 0);
  const semModelo = grupos.filter(g => g.modelos.length === 0);
  const qtdSemModelo = semModelo.reduce((s, g) => s + g.ancora_ids.length, 0);
  // Quantos documentos serão realmente gerados (só dos grupos com modelo escolhido).
  const qtdGerar = comModelo.reduce((s, g) => s + (escolhas[g.chave] ? g.ancora_ids.length : 0), 0);

  function escolherModelo(chave, modeloId) {
    setEscolhas(e => ({ ...e, [chave]: modeloId }));
  }

  async function gerar() {
    // Exige um modelo escolhido em cada grupo que TEM modelo.
    const faltando = comModelo.some(g => !escolhas[g.chave]);
    if (faltando) return toast.error('Escolha um modelo para cada tipo listado');
    if (!qtdGerar) return toast.error('Nenhum documento a gerar');

    // Monta a lista plana de itens (um por registro) com o modelo do seu grupo.
    const itens = [];
    comModelo.forEach(g => {
      const modeloId = escolhas[g.chave];
      if (!modeloId) return;
      g.ancora_ids.forEach(id => itens.push({ ancora_id: id, modelo_id: Number(modeloId) }));
    });

    setGerando(true);
    try {
      const resp = await documentosAPI.gerarLote({ ancora_tipo: ancoraTipo, formato, itens });

      // Baixa o ZIP (nome vem no Content-Disposition).
      const cd = resp.headers['content-disposition'] || '';
      const m = cd.match(/filename="(.+?)"/);
      const nome = m ? m[1] : 'Documentos em lote.zip';
      const url = URL.createObjectURL(new Blob([resp.data]));
      const link = document.createElement('a');
      link.href = url; link.download = nome; link.click();
      URL.revokeObjectURL(url);

      // Resumo: gerados (header) + pulados por falta de modelo + falhas em tempo de geração.
      const gerados = Number(resp.headers['x-doc-gerados'] || itens.length);
      const falhas  = Number(resp.headers['x-doc-falhas'] || 0);
      const partes = [`${gerados} gerado(s)`];
      if (qtdSemModelo) partes.push(`${qtdSemModelo} sem modelo`);
      if (falhas)       partes.push(`${falhas} com falha`);
      toast.success(`Lote concluído: ${partes.join(' · ')}`);
      onFechar();
    } catch (err) {
      // Resposta de erro vem como blob (responseType blob) — lê e mostra a mensagem.
      let msg = 'Erro ao gerar o lote';
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
          <h3>Gerar em lote</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {carregando ? (
            <div className="loading">Preparando lote...</div>
          ) : grupos.length === 0 ? (
            <p className="lista-vazia">Nenhum registro selecionado.</p>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Formato</label>
                <select className="form-control" value={formato} onChange={e => setFormato(e.target.value)}>
                  <option value="docx">Word (.docx)</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>

              {/* Um seletor de modelo por tipo encontrado na seleção */}
              {comModelo.map(g => (
                <div className="form-group" key={g.chave}>
                  <label className="form-label">
                    {g.rotulo} <span style={{ color: '#888', fontWeight: 'normal' }}>({g.ancora_ids.length})</span>
                  </label>
                  <select className="form-control" value={escolhas[g.chave] || ''}
                    onChange={e => escolherModelo(g.chave, e.target.value)}>
                    <option value="">— Selecione o modelo —</option>
                    {g.modelos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </div>
              ))}

              {/* Aviso dos que serão pulados por não ter modelo */}
              {semModelo.length > 0 && (
                <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '6px', padding: '10px', fontSize: '13px', marginTop: '8px' }}>
                  ⚠️ {qtdSemModelo} registro(s) serão <strong>pulados</strong> por não ter modelo cadastrado:
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                    {semModelo.map(g => <li key={g.chave}>{g.rotulo} ({g.ancora_ids.length})</li>)}
                  </ul>
                </div>
              )}

              <p style={{ marginTop: '12px', fontSize: '13px', color: '#555' }}>
                Serão gerados <strong>{qtdGerar}</strong> documento(s) num único arquivo ZIP.
              </p>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={gerar}
            disabled={gerando || carregando || qtdGerar === 0}>
            {gerando ? 'Gerando...' : 'Gerar ZIP'}
          </button>
        </div>
      </div>
    </div>
  );
}
