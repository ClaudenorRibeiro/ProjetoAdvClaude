// ============================================================
// PÁGINA DE PROCESSOS — Lista de pastas + modal de novo processo
// Novo modelo: tblPasta → tblProc → tblTituloProcAutor + tblTituloProcReu
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { processosAPI, pessoasAPI } from '../../services/api';
import { formatarNumeroPasta, mascaraCNJ, toTitleCase } from '../../utils/formatters';
import { toast } from 'react-toastify';

export default function Processos() {
  const navigate = useNavigate();
  const [lista, setLista]           = useState([]);
  const [total, setTotal]           = useState(0);
  const [busca, setBusca]           = useState('');
  const [pagina, setPagina]         = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await processosAPI.listarPastas({ busca, pagina, limite: 20 });
      if (data.ok) { setLista(data.dados.registros); setTotal(data.dados.total); }
    } catch { toast.error('Erro ao carregar processos'); }
    finally { setCarregando(false); }
  }, [busca, pagina]);

  useEffect(() => { carregar(); }, [carregar]);

  function aoFecharModal(reload, pastaId) {
    setModalAberto(false);
    // Após criar, navega diretamente para a pasta criada
    if (pastaId) {
      navigate(`/processos/pasta/${pastaId}`);
    } else if (reload) {
      carregar();
    }
  }

  const totalPaginas = Math.ceil(total / 20);

  return (
    <div>
      {/* Barra de busca e botão */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="form-control"
            style={{ maxWidth: '340px' }}
            placeholder="Buscar por nº pasta, título ou número CNJ..."
            value={busca}
            onChange={e => { setBusca(e.target.value); setPagina(1); }}
          />
          <button className="btn btn-primary" onClick={() => setModalAberto(true)}>
            + Novo Processo
          </button>
          <span style={{ marginLeft: 'auto', color: '#888', fontSize: '13px' }}>
            {total} pasta(s)
          </span>
        </div>
      </div>

      {/* Tabela */}
      <div className="card">
        {carregando ? (
          <div className="loading">Carregando...</div>
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Pasta</th>
                  <th>Título (Partes)</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Processos</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(p => (
                  <tr key={p.id}>
                    <td>
                      <strong style={{ fontFamily: 'monospace', fontSize: '14px' }}>
                        {formatarNumeroPasta(p.numPasta)}
                      </strong>
                    </td>
                    <td>
                      <div style={{ fontWeight: '500', color: '#1e2a3a' }}>
                        {p.titulo_proc || <em style={{ color: '#aaa' }}>Sem processos</em>}
                      </div>
                    </td>
                    <td>
                      {p.tipo_nome
                        ? <span className="badge badge-azul">{p.tipo_nome}</span>
                        : <span style={{ color: '#888', fontWeight: '600' }}>—</span>
                      }
                    </td>
                    <td>
                      {p.status_nome
                        ? <span className="badge badge-cinza">{p.status_nome}</span>
                        : <span style={{ color: '#888', fontWeight: '600' }}>—</span>
                      }
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontWeight: '600' }}>{p.total_processos}</span>
                    </td>
                    <td>
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: '12px', padding: '4px 10px' }}
                        onClick={() => navigate(`/processos/pasta/${p.id}`)}
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && (
              <p className="lista-vazia">Nenhuma pasta encontrada</p>
            )}
          </div>
        )}

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'center' }}>
            <button className="btn btn-outline" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>
              ← Anterior
            </button>
            <span style={{ padding: '8px 12px', fontSize: '13px' }}>
              Página {pagina} de {totalPaginas}
            </span>
            <button className="btn btn-outline" disabled={pagina === totalPaginas} onClick={() => setPagina(p => p + 1)}>
              Próxima →
            </button>
          </div>
        )}
      </div>

      {/* Modal de novo processo */}
      {modalAberto && (
        <ModalNovoProcesso
          pastaId={null}          // null = vai criar nova pasta
          processoBase={null}     // sem base — partes em branco
          onFechar={aoFecharModal}
        />
      )}
    </div>
  );
}

// ============================================================
// MODAL DE NOVO PROCESSO
// Usado tanto em Processos.js (cria pasta + processo)
// quanto em PastaDetalhe.js (cria só processo na pasta existente)
//
// Props:
//   pastaId      — null quando cria nova pasta; id quando adiciona em pasta existente
//   processoBase — objeto {autores, reus} do processo de referência (vem do 1º processo
//                  da pasta); quando fornecido, partes são pré-preenchidas e bloqueadas
//                  até que o checkbox "Novas Partes" seja marcado
//   onFechar     — callback(reload, pastaId)
// ============================================================
export function ModalNovoProcesso({ pastaId, processoBase, onFechar }) {
  const [form, setForm] = useState({
    numPasta: '',
    numProc: '',
    forum_id: '',
    vara_id: '',
    tipo_id: '',
    status_id: '',
    instancia_id: '',
    data_distribuicao: '',
    observacoes: '',
  });

  // Partes do processo
  const [autores, setAutores] = useState([]);
  const [reus, setReus]       = useState([]);

  // Checkbox "Novas Partes" — quando false, partes bloqueadas vindas do processoBase
  const [novasPartes, setNovasPartes] = useState(false);

  // Busca de pessoas (só usada quando partes estão desbloqueadas)
  const [tipoAutor, setTipoAutor]         = useState('fisica');
  const [tipoReu, setTipoReu]             = useState('fisica');
  const [buscaAutor, setBuscaAutor]       = useState('');
  const [buscaReu, setBuscaReu]           = useState('');
  const [resultAutor, setResultAutor]     = useState([]);
  const [resultReu, setResultReu]         = useState([]);

  // Dados auxiliares
  const [aux, setAux]                       = useState({ foruns: [], varas: [], tipos: [], status: [], instancias: [] });
  const [varasFiltradas, setVarasFiltradas] = useState([]);

  // Título gerado automaticamente
  const [nomeTitulo, setNomeTitulo] = useState('');
  const [salvando, setSalvando]     = useState(false);

  // ---- Monta o estado inicial de partes a partir de um processo ----
  function partesDoProcesso(proc) {
    return {
      autores: (proc?.autores || []).map(a => ({
        pessoa_id:   a.pessoa_id,
        tipo_pessoa: a.tipo_pessoa || 'fisica',
        nome:        a.nome,
      })),
      reus: (proc?.reus || []).map(r => ({
        pessoa_id:   r.pessoa_id,
        tipo_pessoa: r.tipo_pessoa || 'fisica',
        nome:        r.nome,
      })),
    };
  }

  // Carrega auxiliares + sugestão de pasta + pré-preenche partes do processoBase
  useEffect(() => {
    processosAPI.auxiliares().then(r => {
      if (r.data.ok) {
        setAux(r.data.dados);
        setVarasFiltradas(r.data.dados.varas);
      }
    });
    if (!pastaId) {
      processosAPI.sugerirPasta().then(r => {
        if (r.data.ok) setForm(f => ({ ...f, numPasta: String(r.data.dados.proximo) }));
      });
    }
    // Pré-preenche partes quando há um processo de referência
    if (processoBase) {
      const { autores: a, reus: r } = partesDoProcesso(processoBase);
      setAutores(a);
      setReus(r);
    }
  }, [pastaId]); // eslint-disable-line

  // Quando o usuário desmarca "Novas Partes", restaura as partes originais do processoBase
  useEffect(() => {
    if (!novasPartes && processoBase) {
      const { autores: a, reus: r } = partesDoProcesso(processoBase);
      setAutores(a);
      setReus(r);
      // Limpa os campos de busca ao voltar para modo bloqueado
      setBuscaAutor('');
      setBuscaReu('');
      setResultAutor([]);
      setResultReu([]);
    }
  }, [novasPartes]); // eslint-disable-line

  // Gera NomeTituloProc automaticamente conforme partes são adicionadas
  useEffect(() => {
    setNomeTitulo(gerarTituloProc(autores, reus));
  }, [autores, reus]);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function mudarForum(forumId) {
    set('forum_id', forumId);
    set('vara_id', '');
    setVarasFiltradas(aux.varas.filter(v => String(v.forum_id) === String(forumId)));
  }

  // Busca pessoas físicas ou jurídicas conforme o tipo selecionado
  async function buscarPessoas(termo, tipo, setResultados) {
    if (termo.length < 2) { setResultados([]); return; }
    try {
      const fn = tipo === 'fisica' ? pessoasAPI.listarFisicas : pessoasAPI.listarJuridicas;
      const { data } = await fn({ busca: termo, limite: 8 });
      if (data.ok) setResultados(data.dados.registros);
    } catch {}
  }

  // Adiciona parte à lista (autor ou réu), evitando duplicatas
  function adicionarParte(pessoa, tipo, lista, setLista, setBusca, setResultados) {
    const jaTem = lista.some(p => p.pessoa_id === pessoa.id && p.tipo_pessoa === tipo);
    if (!jaTem) {
      setLista([...lista, {
        pessoa_id:   pessoa.id,
        tipo_pessoa: tipo,
        nome:        pessoa.nome || pessoa.razao_social,
      }]);
    }
    setBusca('');
    setResultados([]);
  }

  function removerParte(index, lista, setLista) {
    setLista(lista.filter((_, i) => i !== index));
  }

  async function salvar() {
    if (autores.length === 0) return toast.error('Adicione ao menos um autor (polo ativo)');
    if (reus.length === 0)    return toast.error('Adicione ao menos um réu (polo passivo)');
    if (!pastaId && !form.numPasta) return toast.error('Número da pasta é obrigatório');

    setSalvando(true);
    try {
      const payload = {
        pasta_id:          pastaId || null,
        numPasta:          pastaId ? undefined : parseInt(form.numPasta),
        numProc:           form.numProc || null,
        NomeTituloProc:    nomeTitulo,
        vara_id:           form.vara_id      || null,
        tipo_id:           form.tipo_id      || null,
        status_id:         form.status_id    || null,
        instancia_id:      form.instancia_id || null,
        data_distribuicao: form.data_distribuicao || null,
        observacoes:       form.observacoes  || null,
        autores,
        reus,
      };
      const { data } = await processosAPI.criarProcesso(payload);
      toast.success('Processo criado com sucesso!');
      onFechar(true, data.dados?.pasta_id);
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao criar processo');
    } finally {
      setSalvando(false);
    }
  }

  // Determina se os campos de partes estão desbloqueados para edição
  const partesEditaveis = novasPartes || !processoBase;

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h3>{pastaId ? 'Novo Processo (mesma pasta)' : 'Novo Processo'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>

        <div className="modal-body">

          {/* Número da pasta — só exibe se vai criar nova pasta */}
          {!pastaId && (
            <div className="form-group">
              <label className="form-label">Número da Pasta *</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="number" min="1"
                  className="form-control"
                  style={{ maxWidth: '110px' }}
                  value={form.numPasta}
                  onChange={e => set('numPasta', e.target.value)}
                />
                <span style={{ fontSize: '12px', color: '#888' }}>
                  Sugerido automaticamente — altere se necessário (ex: carta precatória na pasta 42)
                </span>
              </div>
            </div>
          )}

          {/* Preview do título gerado */}
          <div className="form-group">
            <label className="form-label">Título do Processo (gerado automaticamente pelas partes)</label>
            <div style={{
              background: nomeTitulo ? '#f0f4ff' : '#f8f8f8',
              border: `1px solid ${nomeTitulo ? '#c7d7fd' : '#e0e0e0'}`,
              borderRadius: '6px',
              padding: '10px 14px',
              fontWeight: '600',
              color: nomeTitulo ? '#1e3a8a' : '#aaa',
              fontSize: '14px',
              minHeight: '40px',
            }}>
              {nomeTitulo || 'Será gerado ao adicionar autores e réus abaixo'}
            </div>
          </div>

          {/* ===== CHECKBOX "NOVAS PARTES" — só exibido quando há processoBase ===== */}
          {pastaId && processoBase && (
            <div style={{
              background: novasPartes ? '#fffbeb' : '#f0f9ff',
              border: `1px solid ${novasPartes ? '#fcd34d' : '#bae6fd'}`,
              borderRadius: '8px',
              padding: '10px 14px',
              marginBottom: '16px',
            }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={novasPartes}
                  onChange={e => setNovasPartes(e.target.checked)}
                  style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'pointer', accentColor: '#2d6be4', flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontWeight: '600', fontSize: '13px', color: novasPartes ? '#92400e' : '#0369a1' }}>
                    Novas Partes
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {novasPartes
                      ? 'Partes desbloqueadas — adicione ou remova livremente. Um novo título será gerado.'
                      : 'As mesmas partes do processo anterior foram carregadas. Marque para alterar.'}
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* === AUTORES (polo ativo) === */}
          <div className="form-group">
            <label className="form-label">Autores — polo ativo *</label>

            {/* Campo de busca — só quando partes estão desbloqueadas */}
            {partesEditaveis && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                <select
                  className="form-control" style={{ maxWidth: '130px' }}
                  value={tipoAutor}
                  onChange={e => { setTipoAutor(e.target.value); setResultAutor([]); setBuscaAutor(''); }}
                >
                  <option value="fisica">Física</option>
                  <option value="juridica">Jurídica</option>
                </select>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    className="form-control"
                    placeholder="Buscar e adicionar autor..."
                    value={buscaAutor}
                    onChange={e => { setBuscaAutor(e.target.value); buscarPessoas(e.target.value, tipoAutor, setResultAutor); }}
                  />
                  {resultAutor.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '6px', zIndex: 20, maxHeight: '160px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                      {resultAutor.map(p => (
                        <div key={p.id}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}
                          onClick={() => adicionarParte(p, tipoAutor, autores, setAutores, setBuscaAutor, setResultAutor)}
                        >
                          {p.nome || p.razao_social}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Chips dos autores */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '28px' }}>
              {autores.map((a, i) => (
                <span key={i} style={{ background: '#dbeafe', color: '#1e40af', borderRadius: '20px', padding: '4px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {a.nome}
                  {/* Botão de remoção só quando partes estão desbloqueadas */}
                  {partesEditaveis && (
                    <button
                      onClick={() => removerParte(i, autores, setAutores)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1e40af', fontWeight: 'bold', padding: '0', lineHeight: '1', fontSize: '14px' }}
                    >×</button>
                  )}
                </span>
              ))}
              {autores.length === 0 && <span style={{ color: '#ccc', fontSize: '13px' }}>Nenhum autor adicionado</span>}
            </div>
          </div>

          {/* === RÉUS (polo passivo) === */}
          <div className="form-group">
            <label className="form-label">Réus — polo passivo *</label>

            {/* Campo de busca — só quando partes estão desbloqueadas */}
            {partesEditaveis && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                <select
                  className="form-control" style={{ maxWidth: '130px' }}
                  value={tipoReu}
                  onChange={e => { setTipoReu(e.target.value); setResultReu([]); setBuscaReu(''); }}
                >
                  <option value="fisica">Física</option>
                  <option value="juridica">Jurídica</option>
                </select>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    className="form-control"
                    placeholder="Buscar e adicionar réu..."
                    value={buscaReu}
                    onChange={e => { setBuscaReu(e.target.value); buscarPessoas(e.target.value, tipoReu, setResultReu); }}
                  />
                  {resultReu.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '6px', zIndex: 20, maxHeight: '160px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                      {resultReu.map(p => (
                        <div key={p.id}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}
                          onClick={() => adicionarParte(p, tipoReu, reus, setReus, setBuscaReu, setResultReu)}
                        >
                          {p.nome || p.razao_social}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Chips dos réus */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '28px' }}>
              {reus.map((r, i) => (
                <span key={i} style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '20px', padding: '4px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {r.nome}
                  {/* Botão de remoção só quando partes estão desbloqueadas */}
                  {partesEditaveis && (
                    <button
                      onClick={() => removerParte(i, reus, setReus)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 'bold', padding: '0', lineHeight: '1', fontSize: '14px' }}
                    >×</button>
                  )}
                </span>
              ))}
              {reus.length === 0 && <span style={{ color: '#ccc', fontSize: '13px' }}>Nenhum réu adicionado</span>}
            </div>
          </div>

          {/* Número CNJ */}
          <div className="form-group">
            <label className="form-label">Número do Processo (CNJ)</label>
            <input
              className="form-control"
              value={form.numProc}
              onChange={e => set('numProc', mascaraCNJ(e.target.value))}
              placeholder="0000000-00.0000.0.00.0000"
              maxLength={25}
              style={{ maxWidth: '260px' }}
            />
          </div>

          {/* Tipo, Status, Instância — 3 selects em linha */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-control" value={form.tipo_id} onChange={e => set('tipo_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {aux.tipos?.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status_id} onChange={e => set('status_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {aux.status?.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Instância</label>
              <select className="form-control" value={form.instancia_id} onChange={e => set('instancia_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {aux.instancias?.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Fórum e Vara */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Fórum</label>
              <select className="form-control" value={form.forum_id} onChange={e => mudarForum(e.target.value)}>
                <option value="">— Selecione —</option>
                {aux.foruns?.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Vara</label>
              <select
                className="form-control"
                value={form.vara_id}
                onChange={e => set('vara_id', e.target.value)}
                disabled={!form.forum_id}
              >
                <option value="">{form.forum_id ? '— Selecione —' : '— Selecione o fórum primeiro —'}</option>
                {varasFiltradas.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Data de distribuição */}
          <div className="form-group">
            <label className="form-label">Data de Distribuição</label>
            <input
              type="date" className="form-control"
              style={{ maxWidth: '180px' }}
              value={form.data_distribuicao}
              onChange={e => set('data_distribuicao', e.target.value)}
            />
          </div>

          {/* Observações */}
          <div className="form-group">
            <label className="form-label">Observações</label>
            <textarea
              className="form-control" rows={2}
              value={form.observacoes}
              onChange={e => set('observacoes', e.target.value)}
              onBlur={() => set('observacoes', toTitleCase(form.observacoes))}
            />
          </div>

        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Criar Processo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL DE EDIÇÃO DE PROCESSO
// Componente independente do ModalNovoProcesso para não afetar o fluxo de criação.
// Recebe o objeto processo completo (com autores, reus, forum_id, etc.)
// ============================================================
export function ModalEditarProcesso({ processo, onFechar }) {
  const [form, setForm] = useState({
    numProc:           processo.numProc          || '',
    forum_id:          processo.forum_id         ? String(processo.forum_id)      : '',
    vara_id:           processo.vara_id          ? String(processo.vara_id)       : '',
    tipo_id:           processo.tipo_id          ? String(processo.tipo_id)       : '',
    status_id:         processo.status_id        ? String(processo.status_id)     : '',
    instancia_id:      processo.instancia_id     ? String(processo.instancia_id)  : '',
    // data_distribuicao pode vir como datetime do MySQL — pega só a parte da data
    data_distribuicao: processo.data_distribuicao
      ? processo.data_distribuicao.split('T')[0]
      : '',
    observacoes: processo.observacoes || '',
  });

  // Partes — pré-preenchidas do processo existente
  const [autores, setAutores] = useState(
    (processo.autores || []).map(a => ({ pessoa_id: a.pessoa_id, tipo_pessoa: a.tipo_pessoa, nome: a.nome }))
  );
  const [reus, setReus] = useState(
    (processo.reus || []).map(r => ({ pessoa_id: r.pessoa_id, tipo_pessoa: r.tipo_pessoa, nome: r.nome }))
  );

  // Busca de pessoas
  const [tipoAutor, setTipoAutor]     = useState('fisica');
  const [tipoReu, setTipoReu]         = useState('fisica');
  const [buscaAutor, setBuscaAutor]   = useState('');
  const [buscaReu, setBuscaReu]       = useState('');
  const [resultAutor, setResultAutor] = useState([]);
  const [resultReu, setResultReu]     = useState([]);

  // Dados auxiliares
  const [aux, setAux]                       = useState({ foruns: [], varas: [], tipos: [], status: [], instancias: [] });
  const [varasFiltradas, setVarasFiltradas] = useState([]);

  const [nomeTitulo, setNomeTitulo] = useState('');
  const [salvando, setSalvando]     = useState(false);

  // Carrega auxiliares e filtra varas do fórum já selecionado
  useEffect(() => {
    processosAPI.auxiliares().then(r => {
      if (!r.data.ok) return;
      const dados = r.data.dados;
      setAux(dados);
      // Filtra varas do fórum atual do processo
      if (processo.forum_id) {
        setVarasFiltradas(dados.varas.filter(v => String(v.forum_id) === String(processo.forum_id)));
      } else {
        setVarasFiltradas(dados.varas);
      }
    });
  }, []); // eslint-disable-line

  // Recalcula título ao mudar partes
  useEffect(() => {
    setNomeTitulo(gerarTituloProc(autores, reus));
  }, [autores, reus]);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function mudarForum(forumId) {
    set('forum_id', forumId);
    set('vara_id', '');
    setVarasFiltradas(aux.varas.filter(v => String(v.forum_id) === String(forumId)));
  }

  async function buscarPessoas(termo, tipo, setResultados) {
    if (termo.length < 2) { setResultados([]); return; }
    try {
      const fn = tipo === 'fisica' ? pessoasAPI.listarFisicas : pessoasAPI.listarJuridicas;
      const { data } = await fn({ busca: termo, limite: 8 });
      if (data.ok) setResultados(data.dados.registros);
    } catch {}
  }

  function adicionarParte(pessoa, tipo, lista, setLista, setBusca, setResultados) {
    const jaTem = lista.some(p => p.pessoa_id === pessoa.id && p.tipo_pessoa === tipo);
    if (!jaTem) {
      setLista([...lista, { pessoa_id: pessoa.id, tipo_pessoa: tipo, nome: pessoa.nome || pessoa.razao_social }]);
    }
    setBusca('');
    setResultados([]);
  }

  function removerParte(index, lista, setLista) {
    setLista(lista.filter((_, i) => i !== index));
  }

  async function salvar() {
    if (!autores.length) return toast.error('Adicione ao menos um autor (polo ativo)');
    if (!reus.length)    return toast.error('Adicione ao menos um réu (polo passivo)');
    setSalvando(true);
    try {
      await processosAPI.atualizarProcesso(processo.id, {
        numProc:           form.numProc           || null,
        NomeTituloProc:    nomeTitulo,
        vara_id:           form.vara_id           || null,
        tipo_id:           form.tipo_id           || null,
        status_id:         form.status_id         || null,
        instancia_id:      form.instancia_id      || null,
        data_distribuicao: form.data_distribuicao || null,
        observacoes:       form.observacoes       || null,
        autores,
        reus,
      });
      toast.success('Processo atualizado com sucesso!');
      onFechar(true);
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h3>Editar Processo</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>

        <div className="modal-body">

          {/* Preview do título gerado */}
          <div className="form-group">
            <label className="form-label">Título (gerado automaticamente pelas partes)</label>
            <div style={{
              background: nomeTitulo ? '#f0f4ff' : '#f8f8f8',
              border: `1px solid ${nomeTitulo ? '#c7d7fd' : '#e0e0e0'}`,
              borderRadius: '6px', padding: '10px 14px',
              fontWeight: '600', color: nomeTitulo ? '#1e3a8a' : '#aaa',
              fontSize: '14px', minHeight: '40px',
            }}>
              {nomeTitulo || 'Será gerado ao adicionar autores e réus abaixo'}
            </div>
          </div>

          {/* === AUTORES === */}
          <div className="form-group">
            <label className="form-label">Autores — polo ativo *</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
              <select className="form-control" style={{ maxWidth: '130px' }} value={tipoAutor}
                onChange={e => { setTipoAutor(e.target.value); setResultAutor([]); setBuscaAutor(''); }}>
                <option value="fisica">Física</option>
                <option value="juridica">Jurídica</option>
              </select>
              <div style={{ flex: 1, position: 'relative' }}>
                <input className="form-control" placeholder="Buscar e adicionar autor..."
                  value={buscaAutor}
                  onChange={e => { setBuscaAutor(e.target.value); buscarPessoas(e.target.value, tipoAutor, setResultAutor); }} />
                {resultAutor.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '6px', zIndex: 20, maxHeight: '160px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {resultAutor.map(p => (
                      <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}
                        onClick={() => adicionarParte(p, tipoAutor, autores, setAutores, setBuscaAutor, setResultAutor)}>
                        {p.nome || p.razao_social}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '28px' }}>
              {autores.map((a, i) => (
                <span key={i} style={{ background: '#dbeafe', color: '#1e40af', borderRadius: '20px', padding: '4px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {a.nome}
                  <button onClick={() => removerParte(i, autores, setAutores)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1e40af', fontWeight: 'bold', padding: '0', lineHeight: '1', fontSize: '14px' }}>×</button>
                </span>
              ))}
              {autores.length === 0 && <span style={{ color: '#ccc', fontSize: '13px' }}>Nenhum autor adicionado</span>}
            </div>
          </div>

          {/* === RÉUS === */}
          <div className="form-group">
            <label className="form-label">Réus — polo passivo *</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
              <select className="form-control" style={{ maxWidth: '130px' }} value={tipoReu}
                onChange={e => { setTipoReu(e.target.value); setResultReu([]); setBuscaReu(''); }}>
                <option value="fisica">Física</option>
                <option value="juridica">Jurídica</option>
              </select>
              <div style={{ flex: 1, position: 'relative' }}>
                <input className="form-control" placeholder="Buscar e adicionar réu..."
                  value={buscaReu}
                  onChange={e => { setBuscaReu(e.target.value); buscarPessoas(e.target.value, tipoReu, setResultReu); }} />
                {resultReu.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '6px', zIndex: 20, maxHeight: '160px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {resultReu.map(p => (
                      <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}
                        onClick={() => adicionarParte(p, tipoReu, reus, setReus, setBuscaReu, setResultReu)}>
                        {p.nome || p.razao_social}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '28px' }}>
              {reus.map((r, i) => (
                <span key={i} style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '20px', padding: '4px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {r.nome}
                  <button onClick={() => removerParte(i, reus, setReus)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 'bold', padding: '0', lineHeight: '1', fontSize: '14px' }}>×</button>
                </span>
              ))}
              {reus.length === 0 && <span style={{ color: '#ccc', fontSize: '13px' }}>Nenhum réu adicionado</span>}
            </div>
          </div>

          {/* Número CNJ */}
          <div className="form-group">
            <label className="form-label">Número do Processo (CNJ)</label>
            <input className="form-control"
              value={form.numProc}
              onChange={e => set('numProc', mascaraCNJ(e.target.value))}
              placeholder="0000000-00.0000.0.00.0000"
              maxLength={25} style={{ maxWidth: '260px' }} />
          </div>

          {/* Tipo, Status, Instância */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-control" value={form.tipo_id} onChange={e => set('tipo_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {aux.tipos?.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status_id} onChange={e => set('status_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {aux.status?.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Instância</label>
              <select className="form-control" value={form.instancia_id} onChange={e => set('instancia_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {aux.instancias?.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Fórum e Vara */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Fórum</label>
              <select className="form-control" value={form.forum_id} onChange={e => mudarForum(e.target.value)}>
                <option value="">— Selecione —</option>
                {aux.foruns?.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Vara</label>
              <select className="form-control" value={form.vara_id}
                onChange={e => set('vara_id', e.target.value)} disabled={!form.forum_id}>
                <option value="">{form.forum_id ? '— Selecione —' : '— Selecione o fórum primeiro —'}</option>
                {varasFiltradas.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Data de distribuição */}
          <div className="form-group">
            <label className="form-label">Data de Distribuição</label>
            <input type="date" className="form-control" style={{ maxWidth: '180px' }}
              value={form.data_distribuicao}
              onChange={e => set('data_distribuicao', e.target.value)} />
          </div>

          {/* Observações */}
          <div className="form-group">
            <label className="form-label">Observações</label>
            <textarea className="form-control" rows={2}
              value={form.observacoes}
              onChange={e => set('observacoes', e.target.value)}
              onBlur={() => set('observacoes', toTitleCase(form.observacoes))} />
          </div>

        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Gera o título automático do processo a partir das partes
// Ex: 3 autores + 1 réu → "João Silva(+2) X Empresa XYZ"
// ============================================================
export function gerarTituloProc(autores, reus) {
  if (!autores.length || !reus.length) return '';

  const primeiroAutor = autores[0].nome;
  const parteAutor = autores.length > 1
    ? `${primeiroAutor}(+${autores.length - 1})`
    : primeiroAutor;

  const primeiroReu = reus[0].nome;
  const parteReu = reus.length > 1
    ? `${primeiroReu}(+${reus.length - 1})`
    : primeiroReu;

  return `${parteAutor} X ${parteReu}`;
}
