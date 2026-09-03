// ============================================================
// PÁGINA DE PROCESSOS — Lista de pastas + modal de novo processo
// Novo modelo: tblPasta → tblProc → tblTituloProcAutor + tblTituloProcReu
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { processosAPI, pessoasAPI, etiquetasAPI } from '../../services/api';
import { EtiquetaCelula, LegendaEtiquetasPessoais, itemEtiquetasSubmenu } from '../../components/Etiquetas';
import { formatarNumeroPasta, mascaraCNJ, toTitleCase } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import MenuAcoes from '../../components/MenuAcoes';
import useEscFechar from '../../hooks/useEscFechar';
import { buscarEnderecoPorCep } from '../../utils/cep';
import ModalCadastroRapidoParte from '../../components/ModalCadastroRapidoParte';

function formatarCpfCnpjSelecao(valor, tipo) {
  const d = String(valor || '').replace(/\D/g, '');
  if (tipo === 'fisica' && d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (tipo === 'juridica' && d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return '';
}

function labelPessoaSelecao(pessoa, tipo) {
  const nome = pessoa?.nome || pessoa?.razao_social || '';
  const documento = formatarCpfCnpjSelecao(tipo === 'fisica' ? pessoa?.cpf : pessoa?.cnpj, tipo);
  return documento ? `${documento} - ${nome}` : nome;
}

export default function Processos() {
  const navigate = useNavigate();
  const { temPermissao } = useAuth();
  const podeCadastrarProcesso = temPermissao('processos', 'cadastrar'); // admin/super já retornam true
  const [lista, setLista]           = useState([]);
  const [total, setTotal]           = useState(0);
  const [busca, setBusca]           = useState('');     // termo já aplicado (usado na consulta)
  const [buscaInput, setBuscaInput] = useState('');     // texto digitado na caixa (instantâneo)
  const [pagina, setPagina]         = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [etqDefs, setEtqDefs]       = useState([]); // etiquetas pessoais do usuário no módulo "pastas"
  const [filtroEtiqueta, setFiltroEtiqueta] = useState(null); // slot ativo no filtro pessoal (ou null)
  const [filtroEsc, setFiltroEsc]           = useState(null); // slot ativo no filtro do escritório (ou null)
  const [assuntos, setAssuntos]             = useState([]);
  const [filtroAssuntos, setFiltroAssuntos] = useState([]);

  const [catEscritorio, setCatEscritorio] = useState([]); // catálogo do escritório (para a pasta derivada)

  // Carrega as definições de etiqueta pessoal do usuário e o catálogo do escritório (uma vez).
  useEffect(() => {
    etiquetasAPI.definicoes('pastas').then(r => { if (r.data?.ok) setEtqDefs(r.data.dados || []); }).catch(() => {});
    etiquetasAPI.catalogo('processos').then(r => { if (r.data?.ok) setCatEscritorio(r.data.dados || []); }).catch(() => {});
    processosAPI.auxiliares().then(r => { if (r.data?.ok) setAssuntos(r.data.dados?.assuntos || []); }).catch(() => {});
  }, []);

  // Marca/desmarca a etiqueta pessoal de uma pasta e reflete na lista sem recarregar.
  async function marcarEtiquetaPasta(pastaId, slot) {
    try {
      await etiquetasAPI.marcar({ modulo: 'pastas', registro_id: pastaId, slot });
      setLista(ls => ls.map(x => (x.id === pastaId ? { ...x, etiqueta_pessoal: slot } : x)));
    } catch { toast.error('Não foi possível salvar a etiqueta'); }
  }

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await processosAPI.listarPastas({
        busca,
        pagina,
        limite: 20,
        etiqueta: filtroEtiqueta || undefined,
        etiquetaEscritorio: filtroEsc || undefined,
        assuntos: filtroAssuntos.length ? filtroAssuntos.join(',') : undefined,
      });
      if (data.ok) { setLista(data.dados.registros); setTotal(data.dados.total); }
    } catch { toast.error('Erro ao carregar processos'); }
    finally { setCarregando(false); }
  }, [busca, pagina, filtroEtiqueta, filtroEsc, filtroAssuntos]);

  // Liga/desliga os filtros por etiqueta e volta para a primeira página.
  function aplicarFiltroEtiqueta(slot) { setFiltroEtiqueta(slot); setPagina(1); }
  function aplicarFiltroEsc(slot)      { setFiltroEsc(slot); setPagina(1); }
  function aplicarFiltroAssuntos(ids)  { setFiltroAssuntos(ids); setPagina(1); }

  useEffect(() => { carregar(); }, [carregar]);

  // Debounce da busca: consulta só 350ms após parar de digitar (evita 1 consulta por tecla)
  useEffect(() => {
    const t = setTimeout(() => { setBusca(buscaInput); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [buscaInput]);

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
            placeholder="Buscar por nº pasta, título, nº CNJ ou protocolo..."
            value={buscaInput}
            onChange={e => setBuscaInput(e.target.value)}
          />
          {podeCadastrarProcesso && (
            <button className="btn btn-primary" onClick={() => setModalAberto(true)}>
              + Novo Processo
            </button>
          )}
          <div style={{ minWidth: '320px', flex: '0 1 420px' }}>
            <label className="form-label" style={{ fontSize: '11px', marginBottom: '3px' }}>Assuntos</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <SeletorAssuntos
                assuntos={assuntos}
                selecionados={filtroAssuntos}
                onChange={aplicarFiltroAssuntos}
              />
              {filtroAssuntos.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => aplicarFiltroAssuntos([])}
                  style={{ minHeight: '40px', padding: '0 12px', flexShrink: 0 }}
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
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
          <>
          <LegendaEtiquetasPessoais definicoes={etqDefs} filtroAtivo={filtroEtiqueta} onFiltrar={aplicarFiltroEtiqueta} />
          <LegendaEtiquetasPessoais definicoes={catEscritorio} titulo="Etiquetas do escritório"
            filtroAtivo={filtroEsc} onFiltrar={aplicarFiltroEsc} />
          <div className="tabela-wrapper" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <table className="tabela tabela-sticky">
              <thead>
                <tr>
                  <th>Pasta</th>
                  <th>Título (Partes)</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Processos</th>
                  <th style={{ textAlign: 'center' }}>Etiq. Pessoal</th>
                  <th style={{ textAlign: 'center' }}>Etiq. Escrit.</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(p => {
                  // Destaque verde: célula da pasta cujo número é exatamente o pesquisado
                  // (só quando a busca é numérica; compara pelo valor, então 430 == 0430)
                  const pastaDestacada = /^\d+$/.test(busca.trim()) && Number(busca) === Number(p.numPasta);
                  return (
                  <tr key={p.id}>
                    <td style={pastaDestacada ? { backgroundColor: '#dcfce7' } : undefined}>
                      <strong style={{ fontFamily: 'monospace', fontSize: '14px', color: pastaDestacada ? '#166534' : undefined }}>
                        {formatarNumeroPasta(p.numPasta)}
                      </strong>
                    </td>
                    {/* Título clicável: abre a pasta (mesma ação do "Abrir pasta" no menu ⋮) */}
                    <td onClick={() => navigate(`/processos/pasta/${p.id}`)}
                        style={{ cursor: 'pointer' }}
                        title="Abrir pasta">
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
                    <td style={{ textAlign: 'center' }}>
                      <EtiquetaCelula slot={p.etiqueta_pessoal} definicoes={etqDefs} />
                    </td>
                    <td style={{ textAlign: 'center' }} title="Derivada: todos os processos da pasta com a mesma etiqueta do escritório">
                      <EtiquetaCelula slot={p.etiqueta_escritorio} definicoes={catEscritorio} />
                    </td>
                    <td>
                      <MenuAcoes itens={[
                        { label: 'Abrir pasta', icone: '📂',
                          onClick: () => navigate(`/processos/pasta/${p.id}`) },
                        itemEtiquetasSubmenu({ definicoes: etqDefs, slotAtual: p.etiqueta_pessoal,
                          onMarcar: (slot) => marcarEtiquetaPasta(p.id, slot) }),
                      ]} />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {lista.length === 0 && (
              <p className="lista-vazia">Nenhuma pasta encontrada</p>
            )}
          </div>
          </>
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

function SeletorAssuntos({ assuntos = [], selecionados = [], onChange, podeGerenciar, onGerenciar, somenteLeitura = false }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const boxRef = useRef(null);

  const selecionadosSet = new Set(selecionados);
  const assuntosSelecionados = assuntos.filter(a => selecionadosSet.has(a.id));
  const buscaNorm = busca.trim().normalize('NFD').replace(/[^\x00-\x7F]/g, '').toLowerCase();
  const assuntosFiltrados = !buscaNorm ? assuntos : assuntos.filter(a =>
    (a.nome || '').normalize('NFD').replace(/[^\x00-\x7F]/g, '').toLowerCase().includes(buscaNorm)
  );

  function alternar(id) {
    if (somenteLeitura) return;
    onChange(selecionadosSet.has(id)
      ? selecionados.filter(selId => selId !== id)
      : [...selecionados, id]);
  }

  function remover(id) {
    if (somenteLeitura) return;
    onChange(selecionados.filter(selId => selId !== id));
  }

  function fecharAoSair(e) {
    if (!boxRef.current?.contains(e.relatedTarget)) setAberto(false);
  }

  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
      <div ref={boxRef} onBlur={fecharAoSair} style={{ flex: 1, position: 'relative' }}>
        <button
          type="button"
          className="form-control"
          disabled={somenteLeitura}
          onClick={() => { if (!somenteLeitura) setAberto(a => !a); }}
          style={{
            minHeight: '40px',
            height: 'auto',
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            alignItems: 'start',
            columnGap: '8px',
            rowGap: '6px',
            textAlign: 'left',
            cursor: somenteLeitura ? 'default' : 'pointer',
            padding: '7px 10px',
            borderColor: aberto ? '#2d6be4' : '#d9e1ec',
            boxShadow: aberto ? '0 0 0 2px rgba(45,107,228,0.08)' : 'none',
            background: somenteLeitura ? '#f8fafc' : '#fff',
          }}
        >
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
            maxHeight: '78px',
            overflowY: 'auto',
            paddingRight: assuntosSelecionados.length > 6 ? '4px' : 0,
          }}>
            {assuntosSelecionados.length === 0 && (
              <span style={{ color: '#94a3b8' }}>Selecionar assuntos...</span>
            )}
            {assuntosSelecionados.map(a => (
              <span key={a.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: '#eaf2ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                borderRadius: '999px', padding: '3px 9px', fontSize: '12px', fontWeight: 500,
              }}>
                {a.nome}
                {!somenteLeitura && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => { e.stopPropagation(); remover(a.id); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); remover(a.id); } }}
                    style={{ fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}
                  >×</span>
                )}
              </span>
            ))}
          </span>
          {!somenteLeitura && <span style={{ color: '#64748b', fontSize: '12px', paddingTop: '5px' }}>{aberto ? '▲' : '▼'}</span>}
        </button>

        {!somenteLeitura && aberto && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: '#fff', border: '1px solid #d9e1ec', borderRadius: '8px',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.14)', zIndex: 40,
            padding: '8px',
          }}>
            <input
              className="form-control"
              autoFocus
              placeholder="Buscar assunto..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{ fontSize: '13px', marginBottom: '8px' }}
            />
            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #edf2f7', borderRadius: '6px' }}>
              {assuntosFiltrados.length ? assuntosFiltrados.map((a, idx) => (
                <label key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 10px', cursor: 'pointer', fontSize: '13px',
                  borderBottom: idx < assuntosFiltrados.length - 1 ? '1px solid #f1f5f9' : 'none',
                  background: selecionadosSet.has(a.id) ? '#f0f7ff' : '#fff',
                }}>
                  <input
                    type="checkbox"
                    checked={selecionadosSet.has(a.id)}
                    onChange={() => alternar(a.id)}
                    style={{ accentColor: '#2d6be4' }}
                  />
                  <span>{a.nome}</span>
                </label>
              )) : (
                <div style={{ padding: '10px', color: '#94a3b8', fontSize: '13px' }}>Nenhum assunto encontrado</div>
              )}
            </div>
          </div>
        )}
      </div>

      {!somenteLeitura && podeGerenciar && (
        <button type="button" className="btn btn-outline" style={{ minHeight: '40px', padding: '0 10px', fontSize: '13px', flexShrink: 0 }} onClick={onGerenciar}>…</button>
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
  const { temPermissao } = useAuth();
  const overlayRef = useEscFechar(() => onFechar(false)); // ESC fecha este modal (só quando é o de cima)
  // Modal auxiliar: null = fechado, string = tipo aberto ('tipos','status','instancias','foruns','varas','assuntos')
  const [modalAux, setModalAux] = useState(null);
  // Cadastro rápido de parte: null = fechado; 'autor' | 'reu' | 'perito' = campo que abriu
  const [cadastroRapido, setCadastroRapido] = useState(null);

  const [form, setForm] = useState({
    numPasta: '',
    numProc: '',
    protocolo: '',
    forum_id: '',
    vara_id: '',
    tipo_id: '',
    status_id: '',
    instancia_id: '',
    data_distribuicao: '',
    observacoes: '',
    // 'autor' | 'reu' | '' (não definido) — quem é o cliente do escritório.
    // Padrão 'autor': é o caso da esmagadora maioria dos processos e alinha a tela
    // com a geração de documentos, que já assume o autor quando o polo não vem definido.
    cliente_polo: 'autor',
    responsavel_id: '',
    oab_processo: '',
  });

  // Partes do processo
  const [autores, setAutores] = useState([]);
  const [reus, setReus]       = useState([]);
  const [peritos, setPeritos] = useState([]);   // peritos vinculados ao processo (opcional)

  // Checkbox "Novas Partes" — quando false, partes bloqueadas vindas do processoBase
  const [novasPartes, setNovasPartes] = useState(false);

  // Busca de pessoas (só usada quando partes estão desbloqueadas)
  const [tipoAutor, setTipoAutor]         = useState('fisica');
  const [tipoReu, setTipoReu]             = useState('juridica'); // padrão do réu = Jurídica (polo passivo geralmente é empresa)
  const [buscaAutor, setBuscaAutor]       = useState('');
  const [buscaReu, setBuscaReu]           = useState('');
  const [resultAutor, setResultAutor]     = useState([]);
  const [resultReu, setResultReu]         = useState([]);
  // Busca de peritos (independente do bloqueio de partes)
  const [tipoPerito, setTipoPerito]       = useState('fisica');
  const [buscaPerito, setBuscaPerito]     = useState('');
  const [resultPerito, setResultPerito]   = useState([]);

  // Dados auxiliares
  const [aux, setAux]                       = useState({ foruns: [], varas: [], tipos: [], status: [], instancias: [], assuntos: [] });
  const [varasFiltradas, setVarasFiltradas] = useState([]);
  const [assuntosSelecionados, setAssuntosSelecionados] = useState([]);

  // Título gerado automaticamente
  const [nomeTitulo, setNomeTitulo] = useState('');
  const [salvando, setSalvando]     = useState(false);

  // Aviso amigável quando a pasta digitada já está em uso (tem processo ativo)
  const [confirmar, setConfirmar]   = useState(null);
  // Marca que o usuário confirmou "incluir na pasta existente" — evita reverter o
  // número ao fechar o modal de confirmação (o fechamento é compartilhado com o cancelar)
  const pastaConfirmadaRef = useRef(false);

  // ---- Monta o estado inicial de partes a partir de um processo ----
  function partesDoProcesso(proc) {
    return {
      autores: (proc?.autores || []).map(a => ({
        pessoa_id:   a.pessoa_id,
        tipo_pessoa: a.tipo_pessoa || 'fisica',
        nome:        a.nome,
        responsavel_nome: a.responsavel_nome || null,
        parentesco_nome:  a.parentesco_nome  || null,
      })),
      reus: (proc?.reus || []).map(r => ({
        pessoa_id:   r.pessoa_id,
        tipo_pessoa: r.tipo_pessoa || 'fisica',
        nome:        r.nome,
        responsavel_nome: r.responsavel_nome || null,
        parentesco_nome:  r.parentesco_nome  || null,
      })),
      peritos: (proc?.peritos || []).map(p => ({
        pessoa_id:   p.pessoa_id,
        tipo_pessoa: p.tipo_pessoa || 'fisica',
        nome:        p.nome,
      })),
    };
  }

  // Carrega auxiliares + sugestão de pasta + pré-preenche partes do processoBase
  useEffect(() => {
    processosAPI.auxiliares().then(({ data }) => {
      if (!data.ok) return;
      const dados = data.dados;
      setAux(dados);
      setVarasFiltradas(dados.varas);
      // Pré-preenche Status = "Conhecimento" e Instância = "1ª Instância" para novo cadastro
      const statusPadrao = dados.status.find(s => s.nome.toLowerCase().includes('conhecimento'));
      if (statusPadrao) setForm(f => ({ ...f, status_id: String(statusPadrao.id) }));
      const instanciaPadrao = dados.instancias.find(i => i.nome.startsWith('1'));
      if (instanciaPadrao) setForm(f => ({ ...f, instancia_id: String(instanciaPadrao.id) }));
      // Padrões do escritório (Responsável / OAB do processo) — vêm na MESMA resposta
      // de auxiliares (rota aberta a qualquer usuário logado), não mais pela rota de admin.
      setForm(f => ({
        ...f,
        responsavel_id: dados.advogado_principal_id ? String(dados.advogado_principal_id) : '',
        oab_processo: dados.oab_principal || '',
      }));
    });
    if (!pastaId) {
      processosAPI.sugerirPasta().then(r => {
        if (r.data.ok) setForm(f => ({ ...f, numPasta: String(r.data.dados.proximo) }));
      });
    }
    // Pré-preenche partes quando há um processo de referência
    if (processoBase) {
      const { autores: a, reus: r, peritos: pe } = partesDoProcesso(processoBase);
      setAutores(a);
      setReus(r);
      setPeritos(pe);
      // Herda o polo do cliente do processo de origem (a pasta é do mesmo cliente).
      // Origem sem polo definido mantém o padrão 'autor'.
      if (processoBase.cliente_polo) {
        setForm(f => ({ ...f, cliente_polo: processoBase.cliente_polo }));
      }
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

  // Volta o campo da pasta para o próximo número livre sugerido (opção A no cancelar)
  function reverterPastaSugerida() {
    processosAPI.sugerirPasta().then(r => {
      if (r.data.ok) setForm(f => ({ ...f, numPasta: String(r.data.dados.proximo) }));
    }).catch(() => {});
  }

  // Ao sair do campo "Número da Pasta": se a pasta já existir e tiver processo
  // ativo, avisa e pede confirmação antes de anexar mais um processo a ela.
  async function checarPastaEmUso() {
    const num = parseInt(form.numPasta);
    if (!num || num < 1) return;
    try {
      const r = await processosAPI.checarPasta(num);
      if (!r.data.ok || !r.data.dados.emUso) return;
      const d = r.data.dados;
      pastaConfirmadaRef.current = false;
      setConfirmar({
        titulo:     'Pasta já em uso',
        tipo:       'aviso',
        textoBotao: 'Sim, incluir',
        mensagem:   `A pasta nº ${formatarNumeroPasta(num)} já existe e possui ${d.totalProcessos} `
          + `processo(s)${d.titulo ? ` (ex.: ${d.titulo})` : ''}. `
          + 'Deseja incluir mais um processo dentro desta mesma pasta?',
        acao: async () => { pastaConfirmadaRef.current = true; },
      });
    } catch {
      // Se a checagem falhar, não bloqueia o cadastro — apenas segue sem aviso.
    }
  }

  // Extrai campos do número CNJ e pré-preenche Tipo, Fórum e Vara.
  // Formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO (20 dígitos brutos)
  //   Tipo:       dígito J  (posição [13])       → match por codTipoProc
  //   Fórum+Vara: J+TT+OOOO (posições [13..19])  → match por codVaraNoProc
  function preencherTipoPorCNJ(valor) {
    const digits = valor.replace(/\D/g, '');

    // Pré-preenche Tipo quando dígito J estiver disponível (14+ dígitos)
    if (digits.length >= 14) {
      const codJ = digits[13];
      const tipo = aux.tipos.find(t => String(t.codTipoProc) === codJ);
      if (tipo) set('tipo_id', String(tipo.id));
    }

    // Pré-preenche Fórum + Vara quando o número estiver completo (20 dígitos)
    if (digits.length >= 20) {
      const codVara = digits.slice(13, 20); // 7 dígitos: J + TT + OOOO
      const vara = aux.varas.find(v => v.codVaraNoProc === codVara);
      if (vara) {
        setForm(f => ({ ...f, forum_id: String(vara.forum_id), vara_id: String(vara.id) }));
        setVarasFiltradas(aux.varas.filter(v => String(v.forum_id) === String(vara.forum_id)));
      }
    }
  }

  function mudarForum(forumId) {
    set('forum_id', forumId);
    set('vara_id', '');
    setVarasFiltradas(aux.varas.filter(v => String(v.forum_id) === String(forumId)));
  }

  // Recarrega auxiliares após CRUD no ModalGerenciarAux
  async function recarregarAux() {
    const r = await processosAPI.auxiliares();
    if (r.data.ok) {
      setAux(r.data.dados);
      // Mantém varas filtradas pelo fórum já selecionado
      if (form.forum_id) {
        setVarasFiltradas(r.data.dados.varas.filter(v => String(v.forum_id) === String(form.forum_id)));
      } else {
        setVarasFiltradas(r.data.dados.varas);
      }
    }
  }

  // Mostra o botão (...) se tiver pelo menos uma permissão de escrita
  const podeGerenciarAux = temPermissao('processos','cadastrar')
    || temPermissao('processos','alterar')
    || temPermissao('processos','excluir');
  const podeGerenciarAssuntos = temPermissao('processos.assuntos','cadastrar')
    || temPermissao('processos.assuntos','alterar')
    || temPermissao('processos.assuntos','excluir');

  // Busca pessoas físicas ou jurídicas conforme o tipo selecionado
  async function buscarPessoas(termo, tipo, setResultados) {
    if (termo.length < 2) { setResultados([]); return; }
    try {
      const fn = tipo === 'fisica' ? pessoasAPI.listarFisicas : pessoasAPI.listarJuridicas;
      // selecao: 1 → só nome/CPF (ou razão social/CNPJ), quem começa pelo termo primeiro.
      const { data } = await fn({ busca: termo, limite: 8, selecao: 1 });
      if (data.ok) setResultados(data.dados.registros);
    } catch {}
  }

  // Adiciona parte à lista (autor ou réu).
  // listaOposta = o polo contrário — mesma pessoa não pode estar nos dois polos.
  // A comparação usa pessoa_id + tipo_pessoa porque físicas e jurídicas têm
  // IDs independentes — o mesmo número pode existir nas duas tabelas.
  function adicionarParte(pessoa, tipo, lista, setLista, listaOposta, setBusca, setResultados) {
    const nome = pessoa.nome || pessoa.razao_social;
    // Já está na mesma lista?
    if (lista.some(p => p.pessoa_id === pessoa.id && p.tipo_pessoa === tipo)) {
      toast.warn(`${nome} já foi adicionado(a) neste polo`);
      setBusca(''); setResultados([]);
      return;
    }
    // Está no polo oposto com o mesmo tipo e id?
    if (listaOposta.some(p => p.pessoa_id === pessoa.id && p.tipo_pessoa === tipo)) {
      toast.error(`${nome} já está no polo oposto — a mesma pessoa não pode ser autor e réu ao mesmo tempo`);
      setBusca(''); setResultados([]);
      return;
    }
    setLista([...lista, {
      pessoa_id:   pessoa.id,
      tipo_pessoa: tipo,
      nome,
      responsavel_nome: pessoa.responsavel_nome || null,
      parentesco_nome:  pessoa.parentesco_nome  || null,
    }]);
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
        protocolo:         form.protocolo?.trim() || null,
        NomeTituloProc:    nomeTitulo,
        vara_id:           form.vara_id      || null,
        tipo_id:           form.tipo_id      || null,
        status_id:         form.status_id    || null,
        instancia_id:      form.instancia_id || null,
        data_distribuicao: form.data_distribuicao || null,
        observacoes:       form.observacoes  || null,
        autores,
        reus,
        peritos,
        assuntos:          assuntosSelecionados,
        cliente_polo:      form.cliente_polo || null,
        responsavel_id:    form.responsavel_id || null,
        oab_processo:      form.oab_processo || null,
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
    <div className="modal-overlay" ref={overlayRef}>
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
                  onBlur={checarPastaEmUso}
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
                          onClick={() => adicionarParte(p, tipoAutor, autores, setAutores, reus, setBuscaAutor, setResultAutor)}
                        >
                          {labelPessoaSelecao(p, tipoAutor)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" className="btn btn-outline"
                  title="Cadastrar nova pessoa (conforme o tipo selecionado)"
                  style={{ padding: '0 12px', fontSize: '16px', flexShrink: 0 }}
                  onClick={() => setCadastroRapido('autor')}>…</button>
              </div>
            )}

            {/* Chips dos autores */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '28px' }}>
              {autores.map((a, i) => (
                <span key={i} style={{ background: '#dbeafe', color: '#1e40af', borderRadius: '20px', padding: '4px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>
                    {a.nome}
                    {a.responsavel_nome && (
                      <span style={{ display: 'block', fontSize: '11px', opacity: 0.85 }}>
                        repr. por {a.responsavel_nome}{a.parentesco_nome ? ` — ${a.parentesco_nome}` : ''}
                      </span>
                    )}
                  </span>
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
                          onClick={() => adicionarParte(p, tipoReu, reus, setReus, autores, setBuscaReu, setResultReu)}
                        >
                          {labelPessoaSelecao(p, tipoReu)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" className="btn btn-outline"
                  title="Cadastrar nova pessoa (conforme o tipo selecionado)"
                  style={{ padding: '0 12px', fontSize: '16px', flexShrink: 0 }}
                  onClick={() => setCadastroRapido('reu')}>…</button>
              </div>
            )}

            {/* Chips dos réus */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '28px' }}>
              {reus.map((r, i) => (
                <span key={i} style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '20px', padding: '4px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>
                    {r.nome}
                    {r.responsavel_nome && (
                      <span style={{ display: 'block', fontSize: '11px', opacity: 0.85 }}>
                        repr. por {r.responsavel_nome}{r.parentesco_nome ? ` — ${r.parentesco_nome}` : ''}
                      </span>
                    )}
                  </span>
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

          {/* === CLIENTE DO ESCRITÓRIO (qual polo) === */}
          <div className="form-group">
            <label className="form-label">Cliente do escritório</label>
            <select className="form-control" style={{ maxWidth: '260px' }}
              value={form.cliente_polo || ''}
              onChange={e => set('cliente_polo', e.target.value)}>
              <option value="">— Não definido —</option>
              <option value="autor">Autor (polo ativo)</option>
              <option value="reu">Réu (polo passivo)</option>
            </select>
            <small style={{ color: '#888' }}>Define para quem vão os comunicados (perícia/audiência)</small>
          </div>

          {/* === RESPONSABILIDADE DO PROCESSO === */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Responsável pelo processo</label>
              <select className="form-control"
                value={form.responsavel_id || ''}
                onChange={e => set('responsavel_id', e.target.value)}>
                <option value="">— Não definido —</option>
                {aux.usuarios?.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.nome}{u.oab ? ` — OAB ${u.oab}` : ''}
                  </option>
                ))}
              </select>
              <small style={{ color: '#888' }}>Advogado que cuida do processo no escritório.</small>
            </div>
            <div className="form-group">
              <label className="form-label">OAB do processo</label>
              <input className="form-control"
                value={form.oab_processo || ''}
                onChange={e => set('oab_processo', e.target.value)}
                placeholder="Ex: 222418/SP"
                maxLength={30} />
              <small style={{ color: '#888' }}>OAB vinculada/pertencente ao processo.</small>
            </div>
          </div>

          {/* === PERITOS DO PROCESSO (opcional) === */}
          <div className="form-group">
            <label className="form-label">Peritos do processo (opcional)</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
              <select className="form-control" style={{ maxWidth: '130px' }}
                value={tipoPerito}
                onChange={e => { setTipoPerito(e.target.value); setResultPerito([]); setBuscaPerito(''); }}>
                <option value="fisica">Física</option>
                <option value="juridica">Jurídica</option>
              </select>
              <div style={{ flex: 1, position: 'relative' }}>
                <input className="form-control" placeholder="Buscar e adicionar perito..."
                  value={buscaPerito}
                  onChange={e => { setBuscaPerito(e.target.value); buscarPessoas(e.target.value, tipoPerito, setResultPerito); }} />
                {resultPerito.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '6px', zIndex: 20, maxHeight: '160px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {resultPerito.map(p => (
                      <div key={p.id}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}
                        onClick={() => adicionarParte(p, tipoPerito, peritos, setPeritos, [], setBuscaPerito, setResultPerito)}>
                        {labelPessoaSelecao(p, tipoPerito)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className="btn btn-outline"
                title="Cadastrar novo perito (conforme o tipo selecionado)"
                style={{ padding: '0 12px', fontSize: '16px', flexShrink: 0 }}
                onClick={() => setCadastroRapido('perito')}>…</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '28px' }}>
              {peritos.map((pe, i) => (
                <span key={i} style={{ background: '#ede9fe', color: '#5b21b6', borderRadius: '20px', padding: '4px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {pe.nome}
                  <button onClick={() => removerParte(i, peritos, setPeritos)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5b21b6', fontWeight: 'bold', padding: '0', lineHeight: '1', fontSize: '14px' }}>×</button>
                </span>
              ))}
              {peritos.length === 0 && <span style={{ color: '#ccc', fontSize: '13px' }}>Nenhum perito adicionado</span>}
            </div>
          </div>

          {/* Número CNJ + Número de Protocolo (lado a lado) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Número do Processo (CNJ)</label>
              <input
                className="form-control"
                value={form.numProc}
                onChange={e => { set('numProc', mascaraCNJ(e.target.value)); preencherTipoPorCNJ(e.target.value); }}
                placeholder="0000000-00.0000.0.00.0000"
                maxLength={25}
              />
            </div>
            {/* Protocolo: processos ainda não distribuídos (ex.: previdenciário) só têm protocolo */}
            <div className="form-group">
              <label className="form-label">Número de Protocolo</label>
              <input
                className="form-control"
                value={form.protocolo}
                onChange={e => set('protocolo', e.target.value)}
                placeholder="Protocolo (antes de existir o nº CNJ)"
                maxLength={60}
              />
            </div>
          </div>

          {/* Tipo, Status, Instância — 3 selects com botão (...) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select className="form-control" value={form.tipo_id} onChange={e => set('tipo_id', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {aux.tipos?.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
                {podeGerenciarAux && <button type="button" className="btn btn-outline" style={{ padding: '0 8px', fontSize: '13px', flexShrink: 0 }} onClick={() => setModalAux('tipos')}>…</button>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select className="form-control" value={form.status_id} onChange={e => set('status_id', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {aux.status?.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
                {podeGerenciarAux && <button type="button" className="btn btn-outline" style={{ padding: '0 8px', fontSize: '13px', flexShrink: 0 }} onClick={() => setModalAux('status')}>…</button>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Instância</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select className="form-control" value={form.instancia_id} onChange={e => set('instancia_id', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {aux.instancias?.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </select>
                {podeGerenciarAux && <button type="button" className="btn btn-outline" style={{ padding: '0 8px', fontSize: '13px', flexShrink: 0 }} onClick={() => setModalAux('instancias')}>…</button>}
              </div>
            </div>
          </div>

          {/* Fórum e Vara com botão (...) */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Fórum</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select className="form-control" value={form.forum_id} onChange={e => mudarForum(e.target.value)}>
                  <option value="">— Selecione —</option>
                  {aux.foruns?.map(f => <option key={f.id} value={f.id}>{f.abrev_nome || f.nome}</option>)}
                </select>
                {podeGerenciarAux && <button type="button" className="btn btn-outline" style={{ padding: '0 8px', fontSize: '13px', flexShrink: 0 }} onClick={() => setModalAux('foruns')}>…</button>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Vara</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select className="form-control" value={form.vara_id} onChange={e => set('vara_id', e.target.value)} disabled={!form.forum_id}>
                  <option value="">{form.forum_id ? '— Selecione —' : '— Selecione o fórum primeiro —'}</option>
                  {varasFiltradas.map(v => <option key={v.id} value={v.id}>{v.abrev_nome || v.nome}</option>)}
                </select>
                {podeGerenciarAux && <button type="button" className="btn btn-outline" style={{ padding: '0 8px', fontSize: '13px', flexShrink: 0 }} onClick={() => setModalAux('varas')}>…</button>}
              </div>
            </div>
          </div>

          {/* Assuntos do processo */}
          <div className="form-group">
            <label className="form-label">Assuntos</label>
            <SeletorAssuntos
              assuntos={aux.assuntos || []}
              selecionados={assuntosSelecionados}
              onChange={setAssuntosSelecionados}
              podeGerenciar={podeGerenciarAssuntos}
              onGerenciar={() => setModalAux('assuntos')}
            />
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

        {/* Modal auxiliar (tipo, status, instância, fórum, vara) */}
        {modalAux && (
          <ModalGerenciarAux
            tipo={modalAux}
            itens={modalAux === 'tipos' ? (aux.tipos || [])
                 : modalAux === 'status' ? (aux.status || [])
                 : modalAux === 'instancias' ? (aux.instancias || [])
                 : modalAux === 'foruns' ? (aux.foruns || [])
                 : modalAux === 'assuntos' ? (aux.assuntos || [])
                 : (aux.varas || [])}
            foruns={aux.foruns || []}
            onFechar={() => setModalAux(null)}
            onAtualizado={async () => { await recarregarAux(); }}
          />
        )}

        {/* Cadastro rápido de nova parte (Física/Jurídica conforme o tipo do campo) */}
        {cadastroRapido && (
          <ModalCadastroRapidoParte
            tipo={cadastroRapido === 'autor' ? tipoAutor : cadastroRapido === 'reu' ? tipoReu : tipoPerito}
            onFechar={() => setCadastroRapido(null)}
            onSalvo={(nova) => {
              if (cadastroRapido === 'autor')    adicionarParte(nova, tipoAutor,  autores, setAutores, reus,    setBuscaAutor,  setResultAutor);
              else if (cadastroRapido === 'reu') adicionarParte(nova, tipoReu,    reus,    setReus,    autores, setBuscaReu,    setResultReu);
              else                               adicionarParte(nova, tipoPerito, peritos, setPeritos, [],      setBuscaPerito, setResultPerito);
              setCadastroRapido(null);
            }}
          />
        )}

        {/* Aviso amigável: pasta já em uso — confirmar antes de anexar outro processo */}
        {confirmar && (
          <ModalConfirmar
            {...confirmar}
            onCancelar={() => {
              // Opção A: ao cancelar (ou fechar sem confirmar), volta ao número sugerido
              if (!pastaConfirmadaRef.current) reverterPastaSugerida();
              pastaConfirmadaRef.current = false;
              setConfirmar(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// MODAL DE EDIÇÃO DE PROCESSO
// Componente independente do ModalNovoProcesso para não afetar o fluxo de criação.
// Recebe o objeto processo completo (com autores, reus, forum_id, etc.)
// ============================================================
export function ModalEditarProcesso({ processo, onFechar, somenteLeitura = false }) {
  const { temPermissao } = useAuth();
  const overlayRef = useEscFechar(() => onFechar(false)); // ESC fecha este modal (só quando é o de cima)
  const podeAlterarProcesso = temPermissao('processos', 'alterar');
  const [leitura, setLeitura] = useState(somenteLeitura);
  const [modalAux, setModalAux] = useState(null);
  // Cadastro rápido de parte: null = fechado; 'autor' | 'reu' | 'perito' = campo que abriu
  const [cadastroRapido, setCadastroRapido] = useState(null);

  const [form, setForm] = useState({
    numProc:           processo.numProc          || '',
    protocolo:         processo.protocolo        || '',
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
    cliente_polo: processo.cliente_polo || '',   // 'autor' | 'reu' | '' — cliente do escritório
    responsavel_id: processo.responsavel_id ? String(processo.responsavel_id) : '',
    oab_processo: processo.oab_processo || '',
  });

  // Partes — pré-preenchidas do processo existente
  const [autores, setAutores] = useState(
    (processo.autores || []).map(a => ({ pessoa_id: a.pessoa_id, tipo_pessoa: a.tipo_pessoa, nome: a.nome }))
  );
  const [reus, setReus] = useState(
    (processo.reus || []).map(r => ({ pessoa_id: r.pessoa_id, tipo_pessoa: r.tipo_pessoa, nome: r.nome }))
  );
  const [peritos, setPeritos] = useState(
    (processo.peritos || []).map(p => ({ pessoa_id: p.pessoa_id, tipo_pessoa: p.tipo_pessoa, nome: p.nome }))
  );
  const [assuntosSelecionados, setAssuntosSelecionados] = useState(
    (processo.assuntos || []).map(a => a.assunto_id)
  );

  // Busca de pessoas
  const [tipoAutor, setTipoAutor]     = useState('fisica');
  const [tipoReu, setTipoReu]         = useState('fisica');
  const [buscaAutor, setBuscaAutor]   = useState('');
  const [buscaReu, setBuscaReu]       = useState('');
  const [resultAutor, setResultAutor] = useState([]);
  const [resultReu, setResultReu]     = useState([]);
  const [tipoPerito, setTipoPerito]   = useState('fisica');
  const [buscaPerito, setBuscaPerito] = useState('');
  const [resultPerito, setResultPerito] = useState([]);

  // Dados auxiliares
  const [aux, setAux]                       = useState({ foruns: [], varas: [], tipos: [], status: [], instancias: [], assuntos: [] });
  const [varasFiltradas, setVarasFiltradas] = useState([]);

  const [nomeTitulo, setNomeTitulo] = useState('');
  const [salvando, setSalvando]     = useState(false);
  const [modalMotivoStatus, setModalMotivoStatus] = useState(null);

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

  async function recarregarAux() {
    const r = await processosAPI.auxiliares();
    if (r.data.ok) {
      setAux(r.data.dados);
      if (form.forum_id) {
        setVarasFiltradas(r.data.dados.varas.filter(v => String(v.forum_id) === String(form.forum_id)));
      } else {
        setVarasFiltradas(r.data.dados.varas);
      }
    }
  }

  const podeGerenciarAux = !leitura && (temPermissao('processos','cadastrar')
    || temPermissao('processos','alterar')
    || temPermissao('processos','excluir'));
  const podeGerenciarAssuntos = !leitura && (temPermissao('processos.assuntos','cadastrar')
    || temPermissao('processos.assuntos','alterar')
    || temPermissao('processos.assuntos','excluir'));

  async function buscarPessoas(termo, tipo, setResultados) {
    if (leitura) return;
    if (termo.length < 2) { setResultados([]); return; }
    try {
      const fn = tipo === 'fisica' ? pessoasAPI.listarFisicas : pessoasAPI.listarJuridicas;
      // selecao: 1 → só nome/CPF (ou razão social/CNPJ), quem começa pelo termo primeiro.
      const { data } = await fn({ busca: termo, limite: 8, selecao: 1 });
      if (data.ok) setResultados(data.dados.registros);
    } catch {}
  }

  // listaOposta = polo contrário — mesma pessoa não pode estar nos dois polos.
  // Compara pessoa_id + tipo_pessoa porque físicas e jurídicas têm IDs independentes.
  function adicionarParte(pessoa, tipo, lista, setLista, listaOposta, setBusca, setResultados) {
    const nome = pessoa.nome || pessoa.razao_social;
    if (lista.some(p => p.pessoa_id === pessoa.id && p.tipo_pessoa === tipo)) {
      toast.warn(`${nome} já foi adicionado(a) neste polo`);
      setBusca(''); setResultados([]); return;
    }
    if (listaOposta.some(p => p.pessoa_id === pessoa.id && p.tipo_pessoa === tipo)) {
      toast.error(`${nome} já está no polo oposto — a mesma pessoa não pode ser autor e réu ao mesmo tempo`);
      setBusca(''); setResultados([]); return;
    }
    setLista([...lista, { pessoa_id: pessoa.id, tipo_pessoa: tipo, nome,
      responsavel_nome: pessoa.responsavel_nome || null,
      parentesco_nome:  pessoa.parentesco_nome  || null }]);
    setBusca('');
    setResultados([]);
  }

  function removerParte(index, lista, setLista) {
    setLista(lista.filter((_, i) => i !== index));
  }

  function nomeStatus(statusId) {
    if (!statusId) return 'Sem status';
    return aux.status?.find(s => String(s.id) === String(statusId))?.nome || 'Status selecionado';
  }

  function montarPayload(motivoStatus = null) {
    return {
      numProc:           form.numProc           || null,
      protocolo:         form.protocolo?.trim()  || null,
      NomeTituloProc:    nomeTitulo,
      vara_id:           form.vara_id           || null,
      tipo_id:           form.tipo_id           || null,
      status_id:         form.status_id         || null,
      instancia_id:      form.instancia_id      || null,
      data_distribuicao: form.data_distribuicao || null,
      observacoes:       form.observacoes       || null,
      autores,
      reus,
      peritos,
      assuntos:          assuntosSelecionados,
      cliente_polo:      form.cliente_polo || null,
      responsavel_id:    form.responsavel_id || null,
      oab_processo:      form.oab_processo || null,
      motivo_status:     motivoStatus?.trim() || null,
    };
  }

  async function salvarComMotivoStatus(motivoStatus = null) {
    setSalvando(true);
    try {
      await processosAPI.atualizarProcesso(processo.id, montarPayload(motivoStatus));
      toast.success('Processo atualizado com sucesso!');
      onFechar(true);
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  async function salvar() {
    if (leitura) return;
    if (!autores.length) return toast.error('Adicione ao menos um autor (polo ativo)');
    if (!reus.length)    return toast.error('Adicione ao menos um réu (polo passivo)');
    const statusAnterior = processo.status_id ? String(processo.status_id) : '';
    const statusNovo = form.status_id ? String(form.status_id) : '';
    if (statusAnterior !== statusNovo) {
      setModalMotivoStatus({
        anterior: nomeStatus(statusAnterior),
        novo: nomeStatus(statusNovo),
      });
      return;
    }
    await salvarComMotivoStatus();
  }

  return (
    <div className="modal-overlay" ref={overlayRef}>
      <div className="modal-box" style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h3>{leitura ? 'Detalhes do Processo' : 'Editar Processo'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>

        <div className="modal-body">
          <fieldset disabled={leitura} style={{ border: 0, padding: 0, margin: 0 }}>

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
                disabled={leitura}
                onChange={e => { setTipoAutor(e.target.value); setResultAutor([]); setBuscaAutor(''); }}>
                <option value="fisica">Física</option>
                <option value="juridica">Jurídica</option>
              </select>
              <div style={{ flex: 1, position: 'relative' }}>
                <input className="form-control" placeholder="Buscar e adicionar autor..."
                  value={buscaAutor}
                  disabled={leitura}
                  onChange={e => { setBuscaAutor(e.target.value); buscarPessoas(e.target.value, tipoAutor, setResultAutor); }} />
                {!leitura && resultAutor.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '6px', zIndex: 20, maxHeight: '160px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {resultAutor.map(p => (
                      <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}
                        onClick={() => adicionarParte(p, tipoAutor, autores, setAutores, reus, setBuscaAutor, setResultAutor)}>
                        {labelPessoaSelecao(p, tipoAutor)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {!leitura && (
                <button type="button" className="btn btn-outline"
                  title="Cadastrar nova pessoa (conforme o tipo selecionado)"
                  style={{ padding: '0 12px', fontSize: '16px', flexShrink: 0 }}
                  onClick={() => setCadastroRapido('autor')}>…</button>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '28px' }}>
              {autores.map((a, i) => (
                <span key={i} style={{ background: '#dbeafe', color: '#1e40af', borderRadius: '20px', padding: '4px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>
                    {a.nome}
                    {a.responsavel_nome && (
                      <span style={{ display: 'block', fontSize: '11px', opacity: 0.85 }}>
                        repr. por {a.responsavel_nome}{a.parentesco_nome ? ` — ${a.parentesco_nome}` : ''}
                      </span>
                    )}
                  </span>
                  {!leitura && (
                    <button onClick={() => removerParte(i, autores, setAutores)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1e40af', fontWeight: 'bold', padding: '0', lineHeight: '1', fontSize: '14px' }}>×</button>
                  )}
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
                disabled={leitura}
                onChange={e => { setTipoReu(e.target.value); setResultReu([]); setBuscaReu(''); }}>
                <option value="fisica">Física</option>
                <option value="juridica">Jurídica</option>
              </select>
              <div style={{ flex: 1, position: 'relative' }}>
                <input className="form-control" placeholder="Buscar e adicionar réu..."
                  value={buscaReu}
                  disabled={leitura}
                  onChange={e => { setBuscaReu(e.target.value); buscarPessoas(e.target.value, tipoReu, setResultReu); }} />
                {!leitura && resultReu.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '6px', zIndex: 20, maxHeight: '160px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {resultReu.map(p => (
                      <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}
                        onClick={() => adicionarParte(p, tipoReu, reus, setReus, autores, setBuscaReu, setResultReu)}>
                        {labelPessoaSelecao(p, tipoReu)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {!leitura && (
                <button type="button" className="btn btn-outline"
                  title="Cadastrar nova pessoa (conforme o tipo selecionado)"
                  style={{ padding: '0 12px', fontSize: '16px', flexShrink: 0 }}
                  onClick={() => setCadastroRapido('reu')}>…</button>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '28px' }}>
              {reus.map((r, i) => (
                <span key={i} style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '20px', padding: '4px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>
                    {r.nome}
                    {r.responsavel_nome && (
                      <span style={{ display: 'block', fontSize: '11px', opacity: 0.85 }}>
                        repr. por {r.responsavel_nome}{r.parentesco_nome ? ` — ${r.parentesco_nome}` : ''}
                      </span>
                    )}
                  </span>
                  {!leitura && (
                    <button onClick={() => removerParte(i, reus, setReus)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 'bold', padding: '0', lineHeight: '1', fontSize: '14px' }}>×</button>
                  )}
                </span>
              ))}
              {reus.length === 0 && <span style={{ color: '#ccc', fontSize: '13px' }}>Nenhum réu adicionado</span>}
            </div>
          </div>

          {/* === CLIENTE DO ESCRITÓRIO (qual polo) === */}
          <div className="form-group">
            <label className="form-label">Cliente do escritório</label>
            <select className="form-control" style={{ maxWidth: '260px' }}
              value={form.cliente_polo || ''}
              onChange={e => set('cliente_polo', e.target.value)}>
              <option value="">— Não definido —</option>
              <option value="autor">Autor (polo ativo)</option>
              <option value="reu">Réu (polo passivo)</option>
            </select>
            <small style={{ color: '#888' }}>Define para quem vão os comunicados (perícia/audiência)</small>
          </div>

          {/* === RESPONSABILIDADE DO PROCESSO === */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Responsável pelo processo</label>
              <select className="form-control"
                value={form.responsavel_id || ''}
                onChange={e => set('responsavel_id', e.target.value)}>
                <option value="">— Não definido —</option>
                {aux.usuarios?.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.nome}{u.oab ? ` — OAB ${u.oab}` : ''}
                  </option>
                ))}
              </select>
              <small style={{ color: '#888' }}>Advogado que cuida do processo no escritório.</small>
            </div>
            <div className="form-group">
              <label className="form-label">OAB do processo</label>
              <input className="form-control"
                value={form.oab_processo || ''}
                onChange={e => set('oab_processo', e.target.value)}
                placeholder="Ex: 222418/SP"
                maxLength={30} />
              <small style={{ color: '#888' }}>OAB vinculada/pertencente ao processo.</small>
            </div>
          </div>

          {/* === PERITOS DO PROCESSO (opcional) === */}
          <div className="form-group">
            <label className="form-label">Peritos do processo (opcional)</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
              <select className="form-control" style={{ maxWidth: '130px' }}
                value={tipoPerito}
                onChange={e => { setTipoPerito(e.target.value); setResultPerito([]); setBuscaPerito(''); }}>
                <option value="fisica">Física</option>
                <option value="juridica">Jurídica</option>
              </select>
              <div style={{ flex: 1, position: 'relative' }}>
                <input className="form-control" placeholder="Buscar e adicionar perito..."
                  value={buscaPerito}
                  onChange={e => { setBuscaPerito(e.target.value); buscarPessoas(e.target.value, tipoPerito, setResultPerito); }} />
                {resultPerito.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '6px', zIndex: 20, maxHeight: '160px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {resultPerito.map(p => (
                      <div key={p.id}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}
                        onClick={() => adicionarParte(p, tipoPerito, peritos, setPeritos, [], setBuscaPerito, setResultPerito)}>
                        {labelPessoaSelecao(p, tipoPerito)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className="btn btn-outline"
                title="Cadastrar novo perito (conforme o tipo selecionado)"
                style={{ padding: '0 12px', fontSize: '16px', flexShrink: 0 }}
                onClick={() => setCadastroRapido('perito')}>…</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '28px' }}>
              {peritos.map((pe, i) => (
                <span key={i} style={{ background: '#ede9fe', color: '#5b21b6', borderRadius: '20px', padding: '4px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {pe.nome}
                  {!leitura && (
                    <button onClick={() => removerParte(i, peritos, setPeritos)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5b21b6', fontWeight: 'bold', padding: '0', lineHeight: '1', fontSize: '14px' }}>×</button>
                  )}
                </span>
              ))}
              {peritos.length === 0 && <span style={{ color: '#ccc', fontSize: '13px' }}>Nenhum perito adicionado</span>}
            </div>
          </div>

          {/* Número CNJ + Número de Protocolo (lado a lado) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Número do Processo (CNJ)</label>
              <input className="form-control"
                value={form.numProc}
                disabled={leitura}
                onChange={e => set('numProc', mascaraCNJ(e.target.value))}
                placeholder="0000000-00.0000.0.00.0000"
                maxLength={25} />
            </div>
            {/* Protocolo: processos ainda não distribuídos (ex.: previdenciário) só têm protocolo */}
            <div className="form-group">
              <label className="form-label">Número de Protocolo</label>
              <input className="form-control"
                value={form.protocolo}
                disabled={leitura}
                onChange={e => set('protocolo', e.target.value)}
                placeholder="Protocolo (antes de existir o nº CNJ)"
                maxLength={60} />
            </div>
          </div>

          {/* Tipo, Status, Instância com botão (...) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select className="form-control" value={form.tipo_id} onChange={e => set('tipo_id', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {aux.tipos?.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
                {podeGerenciarAux && <button type="button" className="btn btn-outline" style={{ padding: '0 8px', fontSize: '13px', flexShrink: 0 }} onClick={() => setModalAux('tipos')}>…</button>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select className="form-control" value={form.status_id} onChange={e => set('status_id', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {aux.status?.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
                {podeGerenciarAux && <button type="button" className="btn btn-outline" style={{ padding: '0 8px', fontSize: '13px', flexShrink: 0 }} onClick={() => setModalAux('status')}>…</button>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Instância</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select className="form-control" value={form.instancia_id} onChange={e => set('instancia_id', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {aux.instancias?.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </select>
                {podeGerenciarAux && <button type="button" className="btn btn-outline" style={{ padding: '0 8px', fontSize: '13px', flexShrink: 0 }} onClick={() => setModalAux('instancias')}>…</button>}
              </div>
            </div>
          </div>

          {/* Fórum e Vara com botão (...) */}
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Fórum</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select className="form-control" value={form.forum_id} onChange={e => mudarForum(e.target.value)}>
                  <option value="">— Selecione —</option>
                  {aux.foruns?.map(f => <option key={f.id} value={f.id}>{f.abrev_nome || f.nome}</option>)}
                </select>
                {podeGerenciarAux && <button type="button" className="btn btn-outline" style={{ padding: '0 8px', fontSize: '13px', flexShrink: 0 }} onClick={() => setModalAux('foruns')}>…</button>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Vara</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <select className="form-control" value={form.vara_id}
                  onChange={e => set('vara_id', e.target.value)} disabled={leitura || !form.forum_id}>
                  <option value="">{form.forum_id ? '— Selecione —' : '— Selecione o fórum primeiro —'}</option>
                  {varasFiltradas.map(v => <option key={v.id} value={v.id}>{v.abrev_nome || v.nome}</option>)}
                </select>
                {podeGerenciarAux && <button type="button" className="btn btn-outline" style={{ padding: '0 8px', fontSize: '13px', flexShrink: 0 }} onClick={() => setModalAux('varas')}>…</button>}
              </div>
            </div>
          </div>

          {/* Assuntos do processo */}
          <div className="form-group">
            <label className="form-label">Assuntos</label>
            <SeletorAssuntos
              assuntos={aux.assuntos || []}
              selecionados={assuntosSelecionados}
              onChange={setAssuntosSelecionados}
              podeGerenciar={podeGerenciarAssuntos}
              onGerenciar={() => setModalAux('assuntos')}
              somenteLeitura={leitura}
            />
          </div>

          {/* Data de distribuição */}
          <div className="form-group">
            <label className="form-label">Data de Distribuição</label>
            <input type="date" className="form-control" style={{ maxWidth: '180px' }}
              value={form.data_distribuicao}
              disabled={leitura}
              onChange={e => set('data_distribuicao', e.target.value)} />
          </div>

          {/* Observações */}
          <div className="form-group">
            <label className="form-label">Observações</label>
            <textarea className="form-control" rows={2}
              value={form.observacoes}
              disabled={leitura}
              onChange={e => set('observacoes', e.target.value)}
              onBlur={() => set('observacoes', toTitleCase(form.observacoes))} />
          </div>

          </fieldset>
        </div>

        <div className="modal-footer">
          {leitura ? (
            <>
              <button className="btn btn-secondary" onClick={() => onFechar(false)}>Fechar</button>
              {podeAlterarProcesso && (
                <button className="btn btn-primary" onClick={() => setLeitura(false)}>
                  Editar
                </button>
              )}
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </>
          )}
        </div>

        {/* Modal auxiliar */}
        {!leitura && modalAux && (
          <ModalGerenciarAux
            tipo={modalAux}
            itens={modalAux === 'tipos' ? (aux.tipos || [])
                 : modalAux === 'status' ? (aux.status || [])
                 : modalAux === 'instancias' ? (aux.instancias || [])
                 : modalAux === 'foruns' ? (aux.foruns || [])
                 : modalAux === 'assuntos' ? (aux.assuntos || [])
                 : (aux.varas || [])}
            foruns={aux.foruns || []}
            onFechar={() => setModalAux(null)}
            onAtualizado={async () => { await recarregarAux(); }}
          />
        )}

        {/* Cadastro rápido de nova parte (Física/Jurídica conforme o tipo do campo) */}
        {!leitura && cadastroRapido && (
          <ModalCadastroRapidoParte
            tipo={cadastroRapido === 'autor' ? tipoAutor : cadastroRapido === 'reu' ? tipoReu : tipoPerito}
            onFechar={() => setCadastroRapido(null)}
            onSalvo={(nova) => {
              if (cadastroRapido === 'autor')    adicionarParte(nova, tipoAutor,  autores, setAutores, reus,    setBuscaAutor,  setResultAutor);
              else if (cadastroRapido === 'reu') adicionarParte(nova, tipoReu,    reus,    setReus,    autores, setBuscaReu,    setResultReu);
              else                               adicionarParte(nova, tipoPerito, peritos, setPeritos, [],      setBuscaPerito, setResultPerito);
              setCadastroRapido(null);
            }}
          />
        )}
        {!leitura && modalMotivoStatus && (
          <ModalMotivoStatus
            anterior={modalMotivoStatus.anterior}
            novo={modalMotivoStatus.novo}
            salvando={salvando}
            onCancelar={() => setModalMotivoStatus(null)}
            onSalvar={async (motivo) => {
              setModalMotivoStatus(null);
              await salvarComMotivoStatus(motivo);
            }}
          />
        )}
      </div>
    </div>
  );
}

function ModalMotivoStatus({ anterior, novo, salvando, onCancelar, onSalvar }) {
  const [motivo, setMotivo] = useState('');
  const overlayRef = useEscFechar(onCancelar);

  return (
    <div className="modal-overlay" ref={overlayRef}>
      <div className="modal-box" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3>Motivo da mudança de status</h3>
          <button className="modal-fechar" onClick={onCancelar}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0, color: '#374151', lineHeight: 1.5 }}>
            O status foi alterado de <strong>{anterior}</strong> para <strong>{novo}</strong>.
            Deseja informar o motivo desta mudança?
          </p>
          <textarea
            className="form-control"
            rows={4}
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Digite o motivo, se quiser..."
            autoFocus
          />
          <small style={{ color: '#6b7280' }}>
            O motivo ficará salvo no histórico/auditoria do processo.
          </small>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancelar} disabled={salvando}>
            Cancelar
          </button>
          <button className="btn btn-outline" onClick={() => onSalvar(null)} disabled={salvando}>
            Salvar sem motivo
          </button>
          <button className="btn btn-primary" onClick={() => onSalvar(motivo)} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar com motivo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL DE GERENCIAMENTO DE AUXILIARES
// Usado para Tipo, Status, Instância, Fórum e Vara.
// Qualquer usuário com a permissão processos.cadastrar/alterar/excluir
// pode realizar a ação correspondente.
// ============================================================

// Configuração de cada tipo de auxiliar
const AUX_CONFIG = {
  tipos: {
    titulo:  'Tipos de Processo',
    campos:  [{ key: 'nome', label: 'Nome', required: true }],
    criar:   (d) => processosAPI.criarTipo(d),
    atualizar:(id, d) => processosAPI.atualizarTipo(id, d),
    excluir: (id) => processosAPI.excluirTipo(id),
  },
  status: {
    titulo:  'Status de Processo',
    campos:  [{ key: 'nome', label: 'Nome', required: true }],
    criar:   (d) => processosAPI.criarStatus(d),
    atualizar:(id, d) => processosAPI.atualizarStatus(id, d),
    excluir: (id) => processosAPI.excluirStatus(id),
  },
  instancias: {
    titulo:  'Instâncias',
    campos:  [{ key: 'nome', label: 'Nome', required: true }],
    criar:   (d) => processosAPI.criarInstancia(d),
    atualizar:(id, d) => processosAPI.atualizarInstancia(id, d),
    excluir: (id) => processosAPI.excluirInstancia(id),
  },
  assuntos: {
    titulo:  'Assuntos dos Processos',
    campos:  [{ key: 'nome', label: 'Nome', required: true, fullWidth: true }],
    criar:   (d) => processosAPI.criarAssunto(d),
    atualizar:(id, d) => processosAPI.atualizarAssunto(id, d),
    excluir: (id) => processosAPI.excluirAssunto(id),
  },
  foruns: {
    titulo:  'Fóruns',
    campos:  [
      { key: 'nome',      label: 'Nome',        required: true,  fullWidth: true },
      { key: 'abrev_nome',label: 'Abreviação',  required: false, fullWidth: true,
        hint: 'Exibida nos dropdowns — ex: VT/B.Funda' },
      { key: 'cep',       label: 'CEP',         required: false, maxLength: 8,  style: { maxWidth: '100px' } },
      { key: 'logradouro',label: 'Logradouro',  required: false, fullWidth: true },
      { key: 'num_end',   label: 'Número',      required: false, style: { maxWidth: '80px' } },
      { key: 'compl_end', label: 'Complemento', required: false, style: { maxWidth: '160px' } },
      { key: 'bairro',    label: 'Bairro',      required: false },
      { key: 'cidade',    label: 'Cidade',      required: false },
      { key: 'uf',        label: 'UF',          required: false, maxLength: 2,  style: { maxWidth: '60px' } },
    ],
    criar:   (d) => processosAPI.criarForum(d),
    atualizar:(id, d) => processosAPI.atualizarForum(id, d),
    excluir: (id) => processosAPI.excluirForum(id),
  },
  varas: {
    titulo:  'Varas',
    // forum_id é tratado separadamente (select especial abaixo do form)
    campos:  [
      { key: 'nome',         label: 'Nome',             required: true,  fullWidth: true },
      { key: 'abrev_nome',   label: 'Abreviação',       required: false, fullWidth: true,
        hint: 'Exibida nos dropdowns — ex: 04ªVT/SP-ZL' },
      { key: 'codVaraNoProc',label: 'Cód. no processo', required: false, style: { maxWidth: '160px' } },
      { key: 'compl_end',    label: 'Complemento End.', required: false,
        hint: 'Ex: 4º andar, Bloco B' },
      { key: 'tel',          label: 'Telefone',         required: false, style: { maxWidth: '160px' } },
      { key: 'email',        label: 'E-mail',           required: false },
    ],
    criar:   (d) => processosAPI.criarVara(d),
    atualizar:(id, d) => processosAPI.atualizarVara(id, d),
    excluir: (id) => processosAPI.excluirVara(id),
  },
};

export function ModalGerenciarAux({ tipo, itens, foruns = [], onFechar, onAtualizado }) {
  const { temPermissao } = useAuth();
  const overlayRef = useEscFechar(onFechar); // ESC fecha esta janelinha (só quando é a de cima)
  const cfg = AUX_CONFIG[tipo];

  const moduloPermissao = tipo === 'assuntos' ? 'processos.assuntos' : 'processos';
  const podeCadastrar = temPermissao(moduloPermissao, 'cadastrar');
  const podeAlterar   = temPermissao(moduloPermissao, 'alterar');
  const podeExcluir   = temPermissao(moduloPermissao, 'excluir');

  // Form de criação / edição
  const formVazio = cfg.campos.reduce((acc, c) => ({ ...acc, [c.key]: '' }), {});
  const [editando, setEditando]   = useState(null);  // null = modo criação, objeto = modo edição
  const [form, setForm]           = useState(formVazio);
  const [forumId, setForumId]     = useState('');    // só usado para varas
  const [salvando, setSalvando]   = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [erro, setErro]           = useState('');    // aviso de validação/erro, exibido dentro do modal
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep]     = useState('');
  const [busca, setBusca]         = useState(''); // filtra a lista de itens já cadastrados
  const camposRef = useRef({}); // refs dos inputs dinâmicos, por key — usado p/ focar "Número" após achar o CEP

  // Busca sem acento/maiúscula (ex.: "aracatuba" acha "Araçatuba"). Filtra por nome/abreviação
  // e, em Fóruns, também pela cidade — é o que mais ajuda quando a lista passa de 100 itens.
  const semAcento = s => (s || '').normalize('NFD').replace(/[^\x00-\x7F]/g, '').toLowerCase();
  const buscaNorm = semAcento(busca.trim());
  const itensFiltrados = !buscaNorm ? itens : itens.filter(item => {
    const alvo = [item.nome, item.abrev_nome, tipo === 'foruns' ? item.cidade : null, tipo === 'varas' ? item.forum_nome : null]
      .filter(Boolean).join(' ');
    return semAcento(alvo).includes(buscaNorm);
  });

  function iniciarEdicao(item) {
    setEditando(item);
    const f = cfg.campos.reduce((acc, c) => ({ ...acc, [c.key]: item[c.key] || '' }), {});
    setForm(f);
    if (tipo === 'varas') setForumId(String(item.forum_id || ''));
    setErro('');
    setErroCep('');
  }

  function cancelarEdicao() {
    setEditando(null);
    setForm(formVazio);
    setForumId('');
    setErro('');
    setErroCep('');
  }

  // Ao sair do campo CEP (só existe no tipo Fóruns): busca o endereço via ViaCEP
  // e preenche Logradouro/Bairro/Cidade/UF, jogando o foco no campo Número.
  async function handleCepBlur() {
    const limpo = (form.cep || '').replace(/\D/g, '');
    if (!limpo) { setErroCep(''); return; }
    if (limpo.length !== 8) { setErroCep('CEP incompleto'); return; }

    setBuscandoCep(true);
    setErroCep('');
    const r = await buscarEnderecoPorCep(limpo);
    setBuscandoCep(false);

    if (!r.ok) {
      setErroCep(r.motivo === 'nao_encontrado' ? 'CEP não encontrado' : 'Não foi possível buscar o CEP agora');
      return;
    }
    setForm(f => ({ ...f, ...r.endereco }));
    camposRef.current['num_end']?.focus();
  }

  async function salvar() {
    for (const c of cfg.campos) {
      if (c.required && !form[c.key]?.trim()) {
        setErro(`${c.label} é obrigatório`);
        return;
      }
    }
    if (tipo === 'varas' && !forumId) { setErro('Fórum é obrigatório'); return; }

    const payload = { ...form };
    if (tipo === 'varas') payload.forum_id = forumId;

    setErro('');
    setSalvando(true);
    try {
      if (editando) {
        await cfg.atualizar(editando.id, payload);
        toast.success('Atualizado com sucesso!');
      } else {
        await cfg.criar(payload);
        toast.success('Criado com sucesso!');
      }
      cancelarEdicao();
      setBusca(''); // limpa o filtro pra garantir que o item recém-salvo apareça na lista
      onAtualizado(); // recarrega auxiliares no modal pai
    } catch (err) {
      setErro(err.response?.data?.mensagem || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  function excluir(item) {
    setConfirmar({
      titulo: `Excluir ${cfg.titulo}`,
      mensagem: `Excluir "${item.nome}"? Esta ação não pode ser desfeita.`,
      textoBotao: '🗑️ Excluir',
      tipo: 'perigo',
      acao: async () => {
        await cfg.excluir(item.id);
        toast.success('Excluído com sucesso!');
        onAtualizado();
      },
    });
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} ref={overlayRef}>
      <div className="modal-box" style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h3>{cfg.titulo}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <div className="modal-body">
          {/* Lista de itens existentes */}
          <div style={{ marginBottom: '20px' }}>
            {itens.length === 0 ? (
              <p className="lista-vazia">Nenhum item cadastrado</p>
            ) : (
              <>
                {/* Busca: some com listas curtas de propósito? Não — sempre visível, custa
                    nada e ajuda até com poucos itens; quem mais precisa é Fóruns/Varas (150+). */}
                <input
                  className="form-control"
                  style={{ fontSize: '13px', marginBottom: '8px' }}
                  placeholder={`Buscar em ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}...`}
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                />
                {itensFiltrados.length === 0 ? (
                  <p className="lista-vazia">Nenhum item encontrado para "{busca}"</p>
                ) : (
                <div style={{ border: '1px solid #e8ecf0', borderRadius: '6px', overflow: 'hidden',
                  maxHeight: '280px', overflowY: 'auto' }}>
                {itensFiltrados.map((item, idx) => (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', fontSize: '13px',
                    background: idx % 2 === 0 ? '#fff' : '#f9fafb',
                    borderBottom: idx < itensFiltrados.length - 1 ? '1px solid #f0f0f0' : 'none',
                  }}>
                    <span>
                      {/* Nome principal: abreviação quando disponível, senão nome completo */}
                      <strong style={{ fontWeight: '500' }}>{item.abrev_nome || item.nome}</strong>
                      {/* Se tem abreviação, mostra o nome completo em seguida (menor) */}
                      {item.abrev_nome && (
                        <span style={{ color: '#555', marginLeft: '6px', fontSize: '11px' }}>
                          {item.nome}
                        </span>
                      )}
                      {/* Cidade/UF para fóruns */}
                      {tipo === 'foruns' && item.cidade && (
                        <span style={{ color: '#888', marginLeft: '6px', fontSize: '11px' }}>
                          {item.cidade}{item.uf ? ` - ${item.uf}` : ''}
                        </span>
                      )}
                      {/* Fórum pai para varas */}
                      {tipo === 'varas' && item.forum_nome && (
                        <span style={{ color: '#888', marginLeft: '6px', fontSize: '11px' }}>
                          {item.forum_nome}
                        </span>
                      )}
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {podeAlterar && (
                        <button className="btn btn-outline"
                          style={{ fontSize: '11px', padding: '3px 8px', color: '#2d6be4', borderColor: '#2d6be4' }}
                          onClick={() => iniciarEdicao(item)}>
                          Editar
                        </button>
                      )}
                      {podeExcluir && (
                        <button className="btn btn-danger"
                          style={{ fontSize: '11px', padding: '3px 8px' }}
                          onClick={() => excluir(item)}>
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                </div>
                )}
              </>
            )}
          </div>

          {/* Formulário de criação / edição */}
          {(podeCadastrar || (podeAlterar && editando)) && (
            <div style={{ background: '#f8fafc', border: '1px solid #e8ecf0', borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '10px' }}>
                {editando ? `Editando: ${editando.nome}` : `Novo item`}
              </div>

              {/* Campos dinâmicos por tipo */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {cfg.campos.map(c => (
                  <div key={c.key} className="form-group" style={{
                    marginBottom: 0,
                    // fullWidth ocupa linha inteira; style fixa a largura; senão expande
                    flex: c.fullWidth ? '0 0 100%' : (c.style ? 'none' : '1'),
                    minWidth: c.fullWidth ? '100%' : '100px',
                  }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>
                      {c.label}{c.required ? ' *' : ''}
                      {c.hint && <span style={{ color: '#aaa', fontWeight: '400', marginLeft: '4px' }}>({c.hint})</span>}
                    </label>
                    <input
                      ref={el => (camposRef.current[c.key] = el)}
                      className="form-control"
                      style={{ fontSize: '13px', ...(c.style || {}) }}
                      maxLength={c.maxLength}
                      value={form[c.key]}
                      onChange={e => setForm(f => ({ ...f, [c.key]: e.target.value }))}
                      onBlur={() => {
                        if (c.key === 'nome') setForm(f => ({ ...f, nome: toTitleCase(f.nome) }));
                        if (c.key === 'uf')   setForm(f => ({ ...f, uf: f.uf.toUpperCase().slice(0, 2) }));
                        if (c.key === 'cep')  handleCepBlur();
                      }}
                    />
                    {c.key === 'cep' && buscandoCep && (
                      <small style={{ color: '#888', fontSize: '11px' }}>Buscando endereço...</small>
                    )}
                    {c.key === 'cep' && erroCep && !buscandoCep && (
                      <small style={{ color: '#d97706', fontSize: '11px' }}>{erroCep}</small>
                    )}
                  </div>
                ))}

                {/* Select de fórum (só para varas) */}
                {tipo === 'varas' && (
                  <div className="form-group" style={{ marginBottom: 0, flex: '1', minWidth: '140px' }}>
                    <label className="form-label" style={{ fontSize: '11px' }}>Fórum *</label>
                    <select className="form-control" style={{ fontSize: '13px' }}
                      value={forumId} onChange={e => setForumId(e.target.value)}>
                      <option value="">— Selecione —</option>
                      {foruns.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </div>
                )}

              </div>

              {/* Aviso de validação/erro — dentro do próprio modal, nunca toast */}
              {erro && (
                <div style={{
                  marginTop: '10px', padding: '8px 10px', borderRadius: '6px',
                  background: '#fffbeb', border: '1px solid #fde68a',
                  color: '#92400e', fontSize: '12px',
                }}>
                  {erro}
                </div>
              )}
            </div>
          )}

          {!podeCadastrar && !podeAlterar && !podeExcluir && (
            <p style={{ color: '#888', fontSize: '13px', textAlign: 'center' }}>
              Você tem acesso somente leitura a estes registros.
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
          {(podeCadastrar || (podeAlterar && editando)) && (
            <>
              {editando && (
                <button className="btn btn-secondary" onClick={cancelarEdicao} disabled={salvando}>
                  Cancelar
                </button>
              )}
              <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Adicionar'}
              </button>
            </>
          )}
        </div>
      </div>
      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
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
