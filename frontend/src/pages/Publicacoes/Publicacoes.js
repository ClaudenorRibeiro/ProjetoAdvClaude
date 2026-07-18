// ============================================================
// PÁGINA DE PUBLICAÇÕES
// ------------------------------------------------------------
// Abas por FONTE (hoje só "AASP"; outras fontes entram no futuro).
// Fluxo da AASP: escolher um dia e baixar as publicações (só as novas são
// salvas — dedup pelo texto). Pesquisar por conteúdo, direcionar (escritório
// ou usuários), marcar tratada, ver histórico e excluir.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { publicacoesAPI } from '../../services/api';
import { formatarData, hojeLocal } from '../../utils/formatters';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import MenuAcoes from '../../components/MenuAcoes';

const POR_PAGINA = 30;

// "Dobra" um texto para comparação: remove acentos e ignora maiúsc./minúsc.
// Ex.: "Audiência" -> "audiencia". Assim "audiencia" casa com "audiência" e vice-versa.
function dobrarTexto(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Realça (fundo amarelo) as ocorrências de `termo` dentro de `texto`.
// Sem termo, devolve o texto puro (modal "limpo").
// A comparação ignora ACENTOS e maiúsc./minúsc. (igual à busca no banco), mas o trecho
// pintado preserva o texto ORIGINAL (com acento). Para isso, comparamos uma versão "dobrada"
// do texto e guardamos um mapa posição-dobrada -> índice no texto original.
function realcarTexto(texto, termo) {
  const t = (termo || '').trim();
  if (!t) return texto;
  const txt  = String(texto);
  const alvo = dobrarTexto(t);
  if (!alvo) return txt;

  // Monta a versão dobrada do texto, caractere a caractere, mantendo o mapa de posições.
  // mapa[j] = índice, no texto ORIGINAL, do j-ésimo caractere da versão dobrada.
  let foldStr = '';
  const mapa = [];
  for (let i = 0; i < txt.length; i++) {
    const f = dobrarTexto(txt[i]);        // normalmente 1 caractere (pode ser 0 ou +)
    for (let k = 0; k < f.length; k++) { foldStr += f[k]; mapa.push(i); }
  }

  // Procura todas as ocorrências no texto dobrado e remonta destacando os trechos originais.
  const out = [];
  let cursor = 0;   // até onde já consumimos o texto original
  let from   = 0;   // de onde continuar a busca no texto dobrado
  let key    = 0;
  let pos;
  while ((pos = foldStr.indexOf(alvo, from)) !== -1) {
    const oIni = mapa[pos];                     // início da ocorrência no texto original
    const oFim = mapa[pos + alvo.length - 1] + 1; // fim (exclusivo) no texto original
    if (oIni > cursor) out.push(<React.Fragment key={key++}>{txt.slice(cursor, oIni)}</React.Fragment>);
    out.push(<mark key={key++} style={{ background: '#fde047', padding: 0 }}>{txt.slice(oIni, oFim)}</mark>);
    cursor = oFim;
    from = pos + alvo.length;
  }
  if (cursor < txt.length) out.push(<React.Fragment key={key++}>{txt.slice(cursor)}</React.Fragment>);
  return out;
}

// Deixa o texto legível: quando o conteúdo vem em HTML (acontece em algumas publicações
// do CNJ), remove as tags e decodifica os símbolos. Texto puro (o caso normal, e toda a
// AASP) passa INTACTO — inclusive as quebras de linha do modal.
function textoLimpo(texto) {
  const s = String(texto == null ? '' : texto);
  if (!/<\/?[a-z][^>]*>/i.test(s)) return s;   // não parece HTML → devolve como está
  let t = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')                 // remove script/style + conteúdo
    .replace(/<\s*(br|\/p|\/div|\/tr|\/li|\/h[1-6])\s*\/?>/gi, '\n') // quebras viram nova linha
    .replace(/<[^>]+>/g, ' ');                                       // remove o resto das tags
  t = t.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  return t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// Trava de 3 meses da pesquisa: true se o período De→Até passar de 3 meses.
function excede3Meses(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return false;
  const ini = new Date(dataInicio + 'T00:00:00');
  const fim = new Date(dataFim + 'T00:00:00');
  if (isNaN(ini.getTime()) || isNaN(fim.getTime())) return false;
  const limite = new Date(ini); limite.setMonth(limite.getMonth() + 3);
  return fim > limite;
}

// Devolve a data (YYYY-MM-DD, hora local) de N dias atrás — usado para sugerir a janela.
function diasAtras(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Publicacoes() {
  // Duas fontes, TELAS SEPARADAS: AASP e CNJ/DJEN. Cada aba é independente
  // (busca e listagem próprias). As ações de direcionar/tratar/histórico/excluir
  // são as mesmas por baixo (compartilhadas por id da publicação).
  const [aba, setAba] = useState('aasp');
  return (
    <div>
      <div className="abas" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button className={'btn ' + (aba === 'aasp' ? 'btn-primary' : 'btn-outline')}
          onClick={() => setAba('aasp')}>AASP</button>
        <button className={'btn ' + (aba === 'cnj' ? 'btn-primary' : 'btn-outline')}
          onClick={() => setAba('cnj')}>CNJ / DJEN</button>
      </div>
      {aba === 'aasp' && <PublicacoesAASP />}
      {aba === 'cnj'  && <PublicacoesCNJ />}
    </div>
  );
}

// ------------------------------------------------------------
// Aba AASP
// ------------------------------------------------------------
function PublicacoesAASP() {
  const { temPermissao } = useAuth();
  const podeImportar = temPermissao('publicacoes', 'cadastrar');
  const podeAlterar  = temPermissao('publicacoes', 'alterar');
  const podeExcluir  = temPermissao('publicacoes', 'excluir');

  const [configurado, setConfigurado] = useState(null); // null = ainda verificando
  const [dataImport, setDataImport]   = useState(hojeLocal());
  const [importando, setImportando]   = useState(false);

  const [lista, setLista]       = useState([]);
  const [total, setTotal]       = useState(0);
  // filtros: janela de datas (dataInicio/dataFim, máx. 3 meses) OU todasDatas=true (mostra tudo);
  // escopo 'todas'|'minhas'; tratada; busca; paginação; e ordenação (ordenar/direcao).
  const [filtros, setFiltros]   = useState({
    dataInicio: '', dataFim: '', todasDatas: true,
    escopo: 'todas', tratada: '0', busca: '', pagina: 1,
    ordenar: null, direcao: null,
  });
  const [carregando, setCarregando] = useState(false);
  const [selecionados, setSelecionados] = useState([]); // ids marcados na página atual

  const [textoAberto, setTextoAberto]         = useState(null);
  const [direcionarAberto, setDirecionarAberto] = useState(null);
  const [historicoAberto, setHistoricoAberto]   = useState(null);
  const [confirmar, setConfirmar]             = useState(null);

  // Verifica se a AASP está configurada (para mostrar o aviso, sem quebrar a tela).
  useEffect(() => {
    publicacoesAPI.statusAasp()
      .then(({ data }) => { if (data.ok) setConfigurado(!!data.dados.configurado); })
      .catch(() => setConfigurado(false));
  }, []);

  const carregar = useCallback(async () => {
    // Trava de 3 meses na tela (o backend também barra). Período inválido → não busca.
    if (!filtros.todasDatas && filtros.dataInicio && filtros.dataFim
        && excede3Meses(filtros.dataInicio, filtros.dataFim)) return;
    setCarregando(true);
    setSelecionados([]); // troca de página/filtro limpa a seleção (seleção é da página atual)
    try {
      const params = {
        busca: filtros.busca, escopo: filtros.escopo, tratada: filtros.tratada,
        pagina: filtros.pagina, limite: POR_PAGINA,
        ordenar: filtros.ordenar || '', direcao: filtros.direcao || '',
      };
      if (!filtros.todasDatas) { params.dataInicio = filtros.dataInicio; params.dataFim = filtros.dataFim; }
      const { data } = await publicacoesAPI.listar(params);
      if (data.ok) { setLista(data.dados.registros); setTotal(data.dados.total); }
    } catch { toast.error('Erro ao carregar publicações'); }
    finally { setCarregando(false); }
  }, [filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  function setFiltro(k, v) { setFiltros(f => ({ ...f, [k]: v, pagina: 1 })); }

  // ---- Ordenação (3 estados: ▲ crescente → ▼ decrescente → volta ao padrão Data) ----
  function clicarOrdenar(campo) {
    setFiltros(f => {
      if (f.ordenar !== campo) return { ...f, ordenar: campo, direcao: 'asc', pagina: 1 };
      if (f.direcao === 'asc')  return { ...f, direcao: 'desc', pagina: 1 };
      return { ...f, ordenar: null, direcao: null, pagina: 1 }; // 3º clique volta ao padrão
    });
  }
  function thOrder(campo, label) {
    const ativo = filtros.ordenar === campo;
    const seta  = ativo ? (filtros.direcao === 'asc' ? ' ▲' : ' ▼') : '';
    return (
      <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
        onClick={() => clicarOrdenar(campo)} title="Clique para ordenar">{label}{seta}</th>
    );
  }

  // ---- Janela de datas (máx. 3 meses); "Todas as datas" ignora a janela ----
  const periodoInvalido = !filtros.todasDatas && !!filtros.dataInicio && !!filtros.dataFim
    && excede3Meses(filtros.dataInicio, filtros.dataFim);
  function toggleTodasDatas(marcado) {
    setFiltros(f => marcado
      ? { ...f, todasDatas: true, pagina: 1 }
      // Ao ligar a janela, se estiver vazia, sugere os últimos 30 dias.
      : { ...f, todasDatas: false, pagina: 1,
          dataInicio: f.dataInicio || diasAtras(30), dataFim: f.dataFim || hojeLocal() });
  }

  // ---- Seleção e exclusão em lote (age só na fonte AASP) ----
  const idsPagina = lista.map(p => p.id);
  const todasMarcadas = idsPagina.length > 0 && idsPagina.every(id => selecionados.includes(id));
  function toggleSel(id) {
    setSelecionados(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }
  function toggleSelPagina() { setSelecionados(todasMarcadas ? [] : idsPagina); }
  function excluirSelecionadas() {
    if (!selecionados.length) return;
    setConfirmar({
      titulo: 'Excluir selecionadas',
      mensagem: `${selecionados.length} publicação(ões) selecionada(s) serão removidas permanentemente. `
        + 'A exclusão fica registrada no log. Deseja continuar?',
      textoBotao: 'Excluir selecionadas', tipo: 'perigo',
      acao: async () => {
        const { data } = await publicacoesAPI.excluirLote({ fonte: 'aasp', ids: selecionados });
        toast.success(data.mensagem || 'Publicações excluídas');
        carregar();
      },
    });
  }
  function excluirTodas() {
    if (total === 0) return;
    setConfirmar({
      titulo: 'Excluir todas',
      mensagem: `Isto vai excluir TODAS as ${total} publicação(ões) do resultado atual `
        + '(com os filtros aplicados). A exclusão é permanente e fica registrada no log. Deseja continuar?',
      textoBotao: `Excluir todas (${total})`, tipo: 'perigo',
      acao: async () => {
        const payload = { todas: true, fonte: 'aasp', tratada: filtros.tratada, busca: filtros.busca, escopo: filtros.escopo };
        if (!filtros.todasDatas) { payload.dataInicio = filtros.dataInicio; payload.dataFim = filtros.dataFim; }
        const { data } = await publicacoesAPI.excluirLote(payload);
        toast.success(data.mensagem || 'Publicações excluídas');
        carregar();
      },
    });
  }

  // Clique no botão "Buscar publicações do dia": se o dia já foi importado, confirma antes
  // (re-rodar traz só as que faltam — não duplica nem apaga). Senão, importa direto.
  async function buscarDia() {
    if (!dataImport) return toast.error('Escolha a data');
    try {
      // Checagem leve: o dia já tem publicações no sistema? (não mexe na lista visível)
      const { data } = await publicacoesAPI.listar({ dataInicio: dataImport, dataFim: dataImport, tratada: '', limite: 1, pagina: 1 });
      if (data.ok && data.dados.total > 0) {
        setConfirmar({
          titulo: 'Dia já importado',
          mensagem: 'Este dia já foi importado. Buscar novamente trará apenas as publicações que ' +
            'ainda não estão no sistema (as já salvas não são reimportadas). Deseja continuar?',
          textoBotao: 'Buscar novamente',
          acao: importarDia,
        });
        return;
      }
    } catch { /* se a checagem falhar, segue para importar normalmente */ }
    importarDia();
  }

  async function importarDia() {
    if (!dataImport) return toast.error('Escolha a data');
    setImportando(true);
    try {
      const { data } = await publicacoesAPI.importar({ data: dataImport });
      if (data.ok) {
        // Sem AASP configurada o backend responde ok com configurado=false (aviso, não erro).
        if (data.dados && data.dados.configurado === false) {
          setConfigurado(false);
          toast.info(data.mensagem || 'AASP não configurada');
        } else {
          toast.success(data.mensagem || 'Publicações importadas');
          carregar();
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao buscar na AASP');
    } finally {
      setImportando(false);
    }
  }

  async function alternarTratada(p) {
    try {
      await publicacoesAPI.tratar(p.id, { tratada: !p.tratada });
      toast.success(p.tratada ? 'Publicação reaberta' : 'Publicação marcada como tratada');
      carregar();
    } catch { toast.error('Erro ao atualizar'); }
  }

  function excluirPublicacao(p) {
    setConfirmar({
      titulo: 'Excluir publicação',
      mensagem: 'Esta publicação será removida permanentemente. A exclusão fica registrada no log do sistema.',
      textoBotao: 'Excluir',
      tipo: 'perigo',
      acao: async () => {
        await publicacoesAPI.excluir(p.id);
        toast.success('Publicação excluída');
        carregar();
      },
    });
  }

  // Texto curto da coluna "Direcionada a".
  function direcionadaTexto(p) {
    if (p.escritorio) return 'Escritório (todos)';
    return p.direcionada_nomes || '—';
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div>
      {/* Aviso quando a AASP não está configurada (não quebra a tela) */}
      {configurado === false && (
        <div className="card" style={{ marginBottom: '16px', borderLeft: '4px solid #d97706' }}>
          <p style={{ margin: 0, color: '#92400e', fontSize: '14px' }}>
            ⚠️ A integração com a AASP não está configurada. Um administrador pode configurar a chave em
            <strong> Configurações → Integrações</strong>. As publicações já salvas continuam disponíveis abaixo.
          </p>
        </div>
      )}

      {/* Importar um dia + pesquisa/filtro */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="filtros-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {podeImportar && (
            <>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Dia da publicação (AASP)</label>
                <input type="date" className="form-control" value={dataImport}
                  onChange={e => setDataImport(e.target.value)} />
              </div>
              <button className="btn btn-primary" style={{ marginBottom: '1px' }}
                onClick={buscarDia} disabled={importando}>
                {importando ? 'Buscando...' : '↓ Buscar publicações do dia'}
              </button>
              <span style={{ width: '1px', alignSelf: 'stretch', background: '#e2e8f0', margin: '0 4px' }} />
            </>
          )}

          <div className="form-group" style={{ margin: 0, flex: '1 1 220px' }}>
            <label className="form-label">Pesquisar no conteúdo</label>
            <input className="form-control" placeholder="Digite parte do texto, nome, processo..."
              value={filtros.busca} onChange={e => setFiltro('busca', e.target.value)} />
          </div>
          {/* Janela de datas da pesquisa (máx. 3 meses). "Todas as datas" ignora a janela. */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Período (máx. 3 meses)</label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input type="date" className="form-control" value={filtros.dataInicio}
                disabled={filtros.todasDatas} onChange={e => setFiltro('dataInicio', e.target.value)} />
              <span style={{ fontSize: '12px', color: '#888' }}>até</span>
              <input type="date" className="form-control" value={filtros.dataFim}
                disabled={filtros.todasDatas} onChange={e => setFiltro('dataFim', e.target.value)} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px',
              fontSize: '12px', color: '#555', cursor: 'pointer' }}>
              <input type="checkbox" checked={filtros.todasDatas}
                onChange={e => toggleTodasDatas(e.target.checked)} />
              Todas as datas
            </label>
            {periodoInvalido && (
              <small style={{ color: '#b91c1c', display: 'block', marginTop: '2px' }}>
                O período não pode passar de 3 meses.
              </small>
            )}
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Exibir</label>
            <select className="form-control" value={filtros.escopo}
              onChange={e => setFiltro('escopo', e.target.value)}>
              <option value="todas">Todas</option>
              <option value="minhas">Direcionadas a mim</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Status</label>
            <select className="form-control" value={filtros.tratada}
              onChange={e => setFiltro('tratada', e.target.value)}>
              <option value="0">Não tratadas</option>
              <option value="1">Tratadas</option>
              <option value="">Todas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="card">
        {/* Ações em lote (só para quem tem permissão de excluir) */}
        {podeExcluir && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" disabled={!selecionados.length}
              onClick={excluirSelecionadas}>
              🗑️ Excluir selecionadas{selecionados.length ? ` (${selecionados.length})` : ''}
            </button>
            <button className="btn btn-outline" disabled={total === 0}
              onClick={excluirTodas} style={{ color: '#b91c1c', borderColor: '#f0c0c0' }}>
              🗑️ Excluir todas{total ? ` (${total})` : ''}
            </button>
          </div>
        )}
        {/* Legenda da pintura de duplicadas */}
        <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#888' }}>
          <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#fde8e8',
            border: '1px solid #f0c0c0', borderRadius: '2px', verticalAlign: 'middle', marginRight: '6px' }} />
          Linha em vermelho claro = publicação repetida (texto idêntico a outra do mesmo dia). Exclua manualmente as que não quiser.
        </p>
        {carregando ? <div className="loading">Carregando...</div> : (
          <div className="tabela-wrapper" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <table className="tabela tabela-sticky">
              <thead>
                <tr>
                  {podeExcluir && (
                    <th style={{ width: '34px', textAlign: 'center' }}>
                      <input type="checkbox" checked={todasMarcadas} onChange={toggleSelPagina}
                        title="Marcar/desmarcar todas da página" />
                    </th>
                  )}
                  {thOrder('data', 'Data')}
                  {thOrder('processo', 'Processo')}
                  {thOrder('publicacao', 'Nº Publ.')}
                  {thOrder('conteudo', 'Conteúdo')}
                  {thOrder('direcionada', 'Direcionada a')}
                  {thOrder('status', 'Status')}
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(p => (
                  // Linha pintada (vermelho claro) = publicação repetida: existe outra de texto
                  // idêntico no mesmo dia. Fica pintada uma cópia; a mais antiga não é pintada.
                  <tr key={p.id}
                    style={p.duplicada ? { background: '#fde8e8' } : undefined}
                    title={p.duplicada ? 'Publicação repetida (texto idêntico a outra do mesmo dia)' : undefined}>
                    {podeExcluir && (
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={selecionados.includes(p.id)}
                          onChange={() => toggleSel(p.id)} />
                      </td>
                    )}
                    <td style={{ whiteSpace: 'nowrap' }}>{formatarData(p.data_publicacao)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.numero_processo || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.numero_publicacao || '—'}</td>
                    <td style={{ maxWidth: '360px' }}>
                      <div style={{
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontSize: '13px', cursor: 'pointer', color: '#1a56db',
                      }}
                        onClick={() => setTextoAberto(p)} title="Clique para ler o texto completo">
                        {textoLimpo(p.texto)}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px' }}>{direcionadaTexto(p)}</td>
                    <td>
                      {p.tratada
                        ? <span className="badge badge-verde">Tratada</span>
                        : <span className="badge badge-laranja">Pendente</span>}
                    </td>
                    <td>
                      <MenuAcoes itens={[
                        { label: 'Direcionar', icone: '📨',
                          oculto: !podeAlterar,
                          onClick: () => setDirecionarAberto(p) },
                        { label: p.tratada ? 'Reabrir' : 'Tratar', icone: p.tratada ? '↩️' : '✓',
                          oculto: !podeAlterar,
                          onClick: () => alternarTratada(p) },
                        { label: 'Histórico', icone: '📋',
                          onClick: () => setHistoricoAberto(p) },
                        { label: 'Excluir', icone: '🗑️', perigo: true,
                          oculto: !podeExcluir,
                          onClick: () => excluirPublicacao(p) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && (
              <p className="lista-vazia">
                Nenhuma publicação encontrada. {podeImportar && 'Escolha um dia e clique em "Buscar publicações do dia".'}
              </p>
            )}
          </div>
        )}

        {/* Rodapé: intervalo visível + total (sempre que houver resultado) e paginação (quando >1 página) */}
        {total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: '#555' }}>
              Exibindo {(filtros.pagina - 1) * POR_PAGINA + 1}–{Math.min(filtros.pagina * POR_PAGINA, total)} de {total} publicações
            </span>
            {totalPaginas > 1 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
                <button className="btn btn-outline" disabled={filtros.pagina === 1}
                  onClick={() => setFiltros(f => ({ ...f, pagina: f.pagina - 1 }))}>← Anterior</button>
                <span style={{ padding: '8px 12px', fontSize: '13px' }}>Página {filtros.pagina} de {totalPaginas}</span>
                <button className="btn btn-outline" disabled={filtros.pagina >= totalPaginas}
                  onClick={() => setFiltros(f => ({ ...f, pagina: f.pagina + 1 }))}>Próxima →</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: texto completo (navega só dentro do resultado atual da tela) */}
      {textoAberto && (() => {
        const idx = lista.findIndex(p => p.id === textoAberto.id);
        const anterior = idx > 0 ? lista[idx - 1] : null;
        const proxima  = (idx >= 0 && idx < lista.length - 1) ? lista[idx + 1] : null;
        return (
          <div className="modal-overlay">
            <div className="modal-box modal-largo">
              <div className="modal-header">
                <h3>
                  Publicação — {formatarData(textoAberto.data_publicacao)}
                  {idx >= 0 && <span style={{ color: '#888', fontWeight: 'normal', fontSize: '13px' }}> ({idx + 1} de {lista.length})</span>}
                </h3>
                <button className="modal-fechar" onClick={() => setTextoAberto(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div style={{ marginBottom: '12px', fontSize: '13px', color: '#555' }}>
                  {textoAberto.titulo && <div>{textoAberto.titulo}</div>}
                  {textoAberto.numero_processo && <div><strong>Processo:</strong> {textoAberto.numero_processo}</div>}
                </div>
                <div style={{
                  background: '#f8fafc', padding: '16px', borderRadius: '8px',
                  fontSize: '14px', lineHeight: '1.7', whiteSpace: 'pre-wrap', maxHeight: '420px', overflowY: 'auto',
                }}>
                  {realcarTexto(textoLimpo(textoAberto.texto), filtros.busca)}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline" disabled={!anterior}
                  onClick={() => setTextoAberto(anterior)}>◀ Anterior</button>
                <button className="btn btn-outline" disabled={!proxima}
                  onClick={() => setTextoAberto(proxima)}>Próxima ▶</button>
                <button className="btn btn-secondary" style={{ marginLeft: 'auto' }}
                  onClick={() => setTextoAberto(null)}>Fechar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: direcionar */}
      {direcionarAberto && (
        <ModalDirecionar publicacao={direcionarAberto}
          onFechar={(recarregar) => { setDirecionarAberto(null); if (recarregar) carregar(); }} />
      )}

      {/* Modal: histórico */}
      {historicoAberto && (
        <ModalHistorico publicacao={historicoAberto} onFechar={() => setHistoricoAberto(null)} />
      )}

      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

// ------------------------------------------------------------
// Aba CNJ / DJEN (Diário de Justiça Eletrônico Nacional)
// Tela separada da AASP. Busca por PERÍODO, usando as OABs cadastradas em
// Configurações → Integrações → CNJ. Direcionamento manual (igual à AASP).
// Reaproveita os modais ModalDirecionar/ModalHistorico e o helper realcarTexto.
// ------------------------------------------------------------
// Base para baixar a certidão oficial (PDF) de uma comunicação do CNJ.
const CNJ_CERTIDAO_BASE = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';

function PublicacoesCNJ() {
  const { temPermissao } = useAuth();
  const podeImportar = temPermissao('publicacoes', 'cadastrar');
  const podeAlterar  = temPermissao('publicacoes', 'alterar');
  const podeExcluir  = temPermissao('publicacoes', 'excluir');

  const [configurado, setConfigurado] = useState(null); // null = ainda verificando
  const [dataInicio, setDataInicio]   = useState(hojeLocal());
  const [dataFim, setDataFim]         = useState(hojeLocal());
  const [importando, setImportando]   = useState(false);

  const [lista, setLista]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [filtros, setFiltros]   = useState({
    dataInicio: '', dataFim: '', todasDatas: true,
    escopo: 'todas', tratada: '0', busca: '', pagina: 1,
    ordenar: null, direcao: null,
  });
  const [carregando, setCarregando] = useState(false);
  const [selecionados, setSelecionados] = useState([]); // ids marcados na página atual

  const [textoAberto, setTextoAberto]           = useState(null);
  const [direcionarAberto, setDirecionarAberto] = useState(null);
  const [historicoAberto, setHistoricoAberto]   = useState(null);
  const [confirmar, setConfirmar]               = useState(null);

  // Verifica se o CNJ está configurado (para mostrar o aviso, sem quebrar a tela).
  useEffect(() => {
    publicacoesAPI.statusCnj()
      .then(({ data }) => { if (data.ok) setConfigurado(!!data.dados.configurado); })
      .catch(() => setConfigurado(false));
  }, []);

  const carregar = useCallback(async () => {
    // Trava de 3 meses na tela (o backend também barra). Período inválido → não busca.
    if (!filtros.todasDatas && filtros.dataInicio && filtros.dataFim
        && excede3Meses(filtros.dataInicio, filtros.dataFim)) return;
    setCarregando(true);
    setSelecionados([]); // troca de página/filtro limpa a seleção (seleção é da página atual)
    try {
      const params = {
        busca: filtros.busca, escopo: filtros.escopo, tratada: filtros.tratada,
        pagina: filtros.pagina, limite: POR_PAGINA,
        ordenar: filtros.ordenar || '', direcao: filtros.direcao || '',
        fonte: 'cnj', // lista SÓ as publicações desta fonte
      };
      if (!filtros.todasDatas) { params.dataInicio = filtros.dataInicio; params.dataFim = filtros.dataFim; }
      const { data } = await publicacoesAPI.listar(params);
      if (data.ok) { setLista(data.dados.registros); setTotal(data.dados.total); }
    } catch { toast.error('Erro ao carregar publicações'); }
    finally { setCarregando(false); }
  }, [filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  function setFiltro(k, v) { setFiltros(f => ({ ...f, [k]: v, pagina: 1 })); }

  // ---- Ordenação (3 estados: ▲ crescente → ▼ decrescente → volta ao padrão Data) ----
  function clicarOrdenar(campo) {
    setFiltros(f => {
      if (f.ordenar !== campo) return { ...f, ordenar: campo, direcao: 'asc', pagina: 1 };
      if (f.direcao === 'asc')  return { ...f, direcao: 'desc', pagina: 1 };
      return { ...f, ordenar: null, direcao: null, pagina: 1 }; // 3º clique volta ao padrão
    });
  }
  function thOrder(campo, label) {
    const ativo = filtros.ordenar === campo;
    const seta  = ativo ? (filtros.direcao === 'asc' ? ' ▲' : ' ▼') : '';
    return (
      <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
        onClick={() => clicarOrdenar(campo)} title="Clique para ordenar">{label}{seta}</th>
    );
  }

  // ---- Janela de datas (máx. 3 meses); "Todas as datas" ignora a janela ----
  const periodoInvalido = !filtros.todasDatas && !!filtros.dataInicio && !!filtros.dataFim
    && excede3Meses(filtros.dataInicio, filtros.dataFim);
  function toggleTodasDatas(marcado) {
    setFiltros(f => marcado
      ? { ...f, todasDatas: true, pagina: 1 }
      : { ...f, todasDatas: false, pagina: 1,
          dataInicio: f.dataInicio || diasAtras(30), dataFim: f.dataFim || hojeLocal() });
  }

  // ---- Seleção e exclusão em lote (age só na fonte CNJ) ----
  const idsPagina = lista.map(p => p.id);
  const todasMarcadas = idsPagina.length > 0 && idsPagina.every(id => selecionados.includes(id));
  function toggleSel(id) {
    setSelecionados(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }
  function toggleSelPagina() { setSelecionados(todasMarcadas ? [] : idsPagina); }
  function excluirSelecionadas() {
    if (!selecionados.length) return;
    setConfirmar({
      titulo: 'Excluir selecionadas',
      mensagem: `${selecionados.length} publicação(ões) selecionada(s) serão removidas permanentemente. `
        + 'A exclusão fica registrada no log. Deseja continuar?',
      textoBotao: 'Excluir selecionadas', tipo: 'perigo',
      acao: async () => {
        const { data } = await publicacoesAPI.excluirLote({ fonte: 'cnj', ids: selecionados });
        toast.success(data.mensagem || 'Publicações excluídas');
        carregar();
      },
    });
  }
  function excluirTodas() {
    if (total === 0) return;
    setConfirmar({
      titulo: 'Excluir todas',
      mensagem: `Isto vai excluir TODAS as ${total} publicação(ões) do resultado atual `
        + '(com os filtros aplicados). A exclusão é permanente e fica registrada no log. Deseja continuar?',
      textoBotao: `Excluir todas (${total})`, tipo: 'perigo',
      acao: async () => {
        const payload = { todas: true, fonte: 'cnj', tratada: filtros.tratada, busca: filtros.busca, escopo: filtros.escopo };
        if (!filtros.todasDatas) { payload.dataInicio = filtros.dataInicio; payload.dataFim = filtros.dataFim; }
        const { data } = await publicacoesAPI.excluirLote(payload);
        toast.success(data.mensagem || 'Publicações excluídas');
        carregar();
      },
    });
  }

  // Busca o período no CNJ. Re-rodar não duplica (dedup pelo id do CNJ no backend).
  async function importarPeriodo() {
    if (!dataInicio || !dataFim) return toast.error('Escolha o período');
    if (dataFim < dataInicio)    return toast.error('A data final não pode ser anterior à inicial');
    if (excede3Meses(dataInicio, dataFim)) return toast.error('O período de busca não pode passar de 3 meses.');
    setImportando(true);
    try {
      const { data } = await publicacoesAPI.importarCnj({ dataInicio, dataFim });
      if (data.ok) {
        if (data.dados && data.dados.configurado === false) {
          setConfigurado(false);
          toast.info(data.mensagem || 'CNJ não configurado');
        } else {
          toast.success(data.mensagem || 'Publicações importadas');
          carregar();
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao buscar no CNJ');
    } finally {
      setImportando(false);
    }
  }

  async function alternarTratada(p) {
    try {
      await publicacoesAPI.tratar(p.id, { tratada: !p.tratada });
      toast.success(p.tratada ? 'Publicação reaberta' : 'Publicação marcada como tratada');
      carregar();
    } catch { toast.error('Erro ao atualizar'); }
  }

  function excluirPublicacao(p) {
    setConfirmar({
      titulo: 'Excluir publicação',
      mensagem: 'Esta publicação será removida permanentemente. A exclusão fica registrada no log do sistema.',
      textoBotao: 'Excluir',
      tipo: 'perigo',
      acao: async () => {
        await publicacoesAPI.excluir(p.id);
        toast.success('Publicação excluída');
        carregar();
      },
    });
  }

  function direcionadaTexto(p) {
    if (p.escritorio) return 'Escritório (todos)';
    return p.direcionada_nomes || '—';
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div>
      {/* Aviso quando o CNJ não está configurado (não quebra a tela) */}
      {configurado === false && (
        <div className="card" style={{ marginBottom: '16px', borderLeft: '4px solid #d97706' }}>
          <p style={{ margin: 0, color: '#92400e', fontSize: '14px' }}>
            ⚠️ A integração com o CNJ (DJEN) não está configurada. Um administrador pode ativá-la e cadastrar as OABs
            do escritório em <strong>Configurações → Integrações</strong>. As publicações já salvas continuam disponíveis abaixo.
          </p>
        </div>
      )}

      {/* Buscar por período + pesquisa/filtro */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="filtros-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {podeImportar && (
            <>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">De (CNJ)</label>
                <input type="date" className="form-control" value={dataInicio}
                  onChange={e => setDataInicio(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Até</label>
                <input type="date" className="form-control" value={dataFim}
                  onChange={e => setDataFim(e.target.value)} />
              </div>
              <button className="btn btn-primary" style={{ marginBottom: '1px' }}
                onClick={importarPeriodo} disabled={importando}>
                {importando ? 'Buscando...' : '↓ Buscar publicações do período'}
              </button>
              <span style={{ width: '1px', alignSelf: 'stretch', background: '#e2e8f0', margin: '0 4px' }} />
            </>
          )}

          <div className="form-group" style={{ margin: 0, flex: '1 1 220px' }}>
            <label className="form-label">Pesquisar no conteúdo</label>
            <input className="form-control" placeholder="Digite parte do texto, nome, processo..."
              value={filtros.busca} onChange={e => setFiltro('busca', e.target.value)} />
          </div>
          {/* Janela de datas da pesquisa (máx. 3 meses). "Todas as datas" ignora a janela. */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Período (máx. 3 meses)</label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input type="date" className="form-control" value={filtros.dataInicio}
                disabled={filtros.todasDatas} onChange={e => setFiltro('dataInicio', e.target.value)} />
              <span style={{ fontSize: '12px', color: '#888' }}>até</span>
              <input type="date" className="form-control" value={filtros.dataFim}
                disabled={filtros.todasDatas} onChange={e => setFiltro('dataFim', e.target.value)} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px',
              fontSize: '12px', color: '#555', cursor: 'pointer' }}>
              <input type="checkbox" checked={filtros.todasDatas}
                onChange={e => toggleTodasDatas(e.target.checked)} />
              Todas as datas
            </label>
            {periodoInvalido && (
              <small style={{ color: '#b91c1c', display: 'block', marginTop: '2px' }}>
                O período não pode passar de 3 meses.
              </small>
            )}
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Exibir</label>
            <select className="form-control" value={filtros.escopo}
              onChange={e => setFiltro('escopo', e.target.value)}>
              <option value="todas">Todas</option>
              <option value="minhas">Direcionadas a mim</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Status</label>
            <select className="form-control" value={filtros.tratada}
              onChange={e => setFiltro('tratada', e.target.value)}>
              <option value="0">Não tratadas</option>
              <option value="1">Tratadas</option>
              <option value="">Todas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="card">
        {/* Ações em lote (só para quem tem permissão de excluir) */}
        {podeExcluir && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" disabled={!selecionados.length}
              onClick={excluirSelecionadas}>
              🗑️ Excluir selecionadas{selecionados.length ? ` (${selecionados.length})` : ''}
            </button>
            <button className="btn btn-outline" disabled={total === 0}
              onClick={excluirTodas} style={{ color: '#b91c1c', borderColor: '#f0c0c0' }}>
              🗑️ Excluir todas{total ? ` (${total})` : ''}
            </button>
          </div>
        )}
        <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#888' }}>
          <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#fde8e8',
            border: '1px solid #f0c0c0', borderRadius: '2px', verticalAlign: 'middle', marginRight: '6px' }} />
          Linha em vermelho claro = publicação repetida (texto idêntico a outra do mesmo dia). Exclua manualmente as que não quiser.
        </p>
        {carregando ? <div className="loading">Carregando...</div> : (
          <div className="tabela-wrapper" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <table className="tabela tabela-sticky">
              <thead>
                <tr>
                  {podeExcluir && (
                    <th style={{ width: '34px', textAlign: 'center' }}>
                      <input type="checkbox" checked={todasMarcadas} onChange={toggleSelPagina}
                        title="Marcar/desmarcar todas da página" />
                    </th>
                  )}
                  {thOrder('data', 'Data')}
                  {thOrder('tribunal', 'Tribunal')}
                  {thOrder('processo', 'Processo')}
                  {thOrder('conteudo', 'Conteúdo')}
                  {thOrder('direcionada', 'Direcionada a')}
                  {thOrder('status', 'Status')}
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(p => (
                  <tr key={p.id}
                    style={p.duplicada ? { background: '#fde8e8' } : undefined}
                    title={p.duplicada ? 'Publicação repetida (texto idêntico a outra do mesmo dia)' : undefined}>
                    {podeExcluir && (
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={selecionados.includes(p.id)}
                          onChange={() => toggleSel(p.id)} />
                      </td>
                    )}
                    <td style={{ whiteSpace: 'nowrap' }}>{formatarData(p.data_publicacao)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.tribunal || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.numero_processo || '—'}</td>
                    <td style={{ maxWidth: '360px' }}>
                      <div style={{
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontSize: '13px', cursor: 'pointer', color: '#1a56db',
                      }}
                        onClick={() => setTextoAberto(p)} title="Clique para ler o texto completo">
                        {textoLimpo(p.texto)}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px' }}>{direcionadaTexto(p)}</td>
                    <td>
                      {p.tratada
                        ? <span className="badge badge-verde">Tratada</span>
                        : <span className="badge badge-laranja">Pendente</span>}
                    </td>
                    <td>
                      <MenuAcoes itens={[
                        { label: 'Direcionar', icone: '📨',
                          oculto: !podeAlterar,
                          onClick: () => setDirecionarAberto(p) },
                        { label: p.tratada ? 'Reabrir' : 'Tratar', icone: p.tratada ? '↩️' : '✓',
                          oculto: !podeAlterar,
                          onClick: () => alternarTratada(p) },
                        { label: 'Histórico', icone: '📋',
                          onClick: () => setHistoricoAberto(p) },
                        { label: 'Excluir', icone: '🗑️', perigo: true,
                          oculto: !podeExcluir,
                          onClick: () => excluirPublicacao(p) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length === 0 && (
              <p className="lista-vazia">
                Nenhuma publicação encontrada. {podeImportar && 'Escolha o período e clique em "Buscar publicações do período".'}
              </p>
            )}
          </div>
        )}

        {total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: '#555' }}>
              Exibindo {(filtros.pagina - 1) * POR_PAGINA + 1}–{Math.min(filtros.pagina * POR_PAGINA, total)} de {total} publicações
            </span>
            {totalPaginas > 1 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
                <button className="btn btn-outline" disabled={filtros.pagina === 1}
                  onClick={() => setFiltros(f => ({ ...f, pagina: f.pagina - 1 }))}>← Anterior</button>
                <span style={{ padding: '8px 12px', fontSize: '13px' }}>Página {filtros.pagina} de {totalPaginas}</span>
                <button className="btn btn-outline" disabled={filtros.pagina >= totalPaginas}
                  onClick={() => setFiltros(f => ({ ...f, pagina: f.pagina + 1 }))}>Próxima →</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: texto completo (navega só dentro do resultado atual da tela) */}
      {textoAberto && (() => {
        const idx = lista.findIndex(p => p.id === textoAberto.id);
        const anterior = idx > 0 ? lista[idx - 1] : null;
        const proxima  = (idx >= 0 && idx < lista.length - 1) ? lista[idx + 1] : null;
        return (
          <div className="modal-overlay">
            <div className="modal-box modal-largo">
              <div className="modal-header">
                <h3>
                  Publicação — {formatarData(textoAberto.data_publicacao)}
                  {idx >= 0 && <span style={{ color: '#888', fontWeight: 'normal', fontSize: '13px' }}> ({idx + 1} de {lista.length})</span>}
                </h3>
                <button className="modal-fechar" onClick={() => setTextoAberto(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div style={{ marginBottom: '12px', fontSize: '13px', color: '#555' }}>
                  {textoAberto.tribunal && <div><strong>Tribunal:</strong> {textoAberto.tribunal}</div>}
                  {textoAberto.titulo && <div>{textoAberto.titulo}</div>}
                  {textoAberto.numero_processo && <div><strong>Processo:</strong> {textoAberto.numero_processo}</div>}
                  {textoAberto.hash_cnj && (
                    <div style={{ marginTop: '6px' }}>
                      <a href={`${CNJ_CERTIDAO_BASE}/${textoAberto.hash_cnj}/certidao`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ color: '#1a56db', fontSize: '13px' }}>
                        📄 Baixar certidão oficial (PDF)
                      </a>
                    </div>
                  )}
                </div>
                <div style={{
                  background: '#f8fafc', padding: '16px', borderRadius: '8px',
                  fontSize: '14px', lineHeight: '1.7', whiteSpace: 'pre-wrap', maxHeight: '420px', overflowY: 'auto',
                }}>
                  {realcarTexto(textoLimpo(textoAberto.texto), filtros.busca)}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline" disabled={!anterior}
                  onClick={() => setTextoAberto(anterior)}>◀ Anterior</button>
                <button className="btn btn-outline" disabled={!proxima}
                  onClick={() => setTextoAberto(proxima)}>Próxima ▶</button>
                <button className="btn btn-secondary" style={{ marginLeft: 'auto' }}
                  onClick={() => setTextoAberto(null)}>Fechar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: direcionar (compartilhado com a AASP) */}
      {direcionarAberto && (
        <ModalDirecionar publicacao={direcionarAberto}
          onFechar={(recarregar) => { setDirecionarAberto(null); if (recarregar) carregar(); }} />
      )}

      {/* Modal: histórico (compartilhado com a AASP) */}
      {historicoAberto && (
        <ModalHistorico publicacao={historicoAberto} onFechar={() => setHistoricoAberto(null)} />
      )}

      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

// ------------------------------------------------------------
// Modal: direcionar a publicação (escritório OU usuários específicos)
// ------------------------------------------------------------
function ModalDirecionar({ publicacao, onFechar }) {
  const [escritorio, setEscritorio] = useState(!!publicacao.escritorio);
  const [usuarios, setUsuarios]     = useState([]);
  const [selecionados, setSelecionados] = useState([]);
  const [salvando, setSalvando]     = useState(false);

  useEffect(() => {
    publicacoesAPI.usuarios()
      .then(({ data }) => { if (data.ok) setUsuarios(data.dados); })
      .catch(() => toast.error('Erro ao carregar usuários'));
  }, []);

  function toggleUsuario(id) {
    setSelecionados(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  }

  async function salvar() {
    if (!escritorio && !selecionados.length) return toast.error('Escolha ao menos um usuário');
    setSalvando(true);
    try {
      await publicacoesAPI.direcionar(publicacao.id, { escritorio, usuario_ids: escritorio ? [] : selecionados });
      toast.success('Direcionamento salvo');
      onFechar(true);
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao direcionar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Direcionar publicação</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="radio" checked={escritorio} onChange={() => setEscritorio(true)} />
              <span>Escritório (todos com permissão veem)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '6px' }}>
              <input type="radio" checked={!escritorio} onChange={() => setEscritorio(false)} />
              <span>Usuários específicos (só eles e os administradores veem)</span>
            </label>
          </div>

          {!escritorio && (
            <div className="form-group">
              <label className="form-label">Selecione os usuários</label>
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', maxHeight: '220px', overflowY: 'auto', padding: '6px' }}>
                {usuarios.length === 0
                  ? <span style={{ fontSize: '12px', color: '#9ca3af' }}>Carregando...</span>
                  : usuarios.map(u => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 2px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selecionados.includes(u.id)} onChange={() => toggleUsuario(u.id)} />
                      <span style={{ fontSize: '13px' }}>{u.nome}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Modal: histórico (lido das colunas da própria publicação)
// ------------------------------------------------------------
function ModalHistorico({ publicacao, onFechar }) {
  const [dados, setDados] = useState(null);

  useEffect(() => {
    publicacoesAPI.historico(publicacao.id)
      .then(({ data }) => { if (data.ok) setDados(data.dados); })
      .catch(() => toast.error('Erro ao carregar histórico'));
  }, [publicacao.id]);

  function dataHora(d) {
    return d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Histórico da publicação</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {!dados ? <div className="loading">Carregando...</div> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '13px', lineHeight: '1.8' }}>
              <li>
                <strong>Importada/lida por:</strong> {dados.importada_por_nome || '—'}
                <span style={{ color: '#888' }}> · {dataHora(dados.criado_em)}</span>
              </li>
              <li>
                <strong>Direcionamento:</strong>{' '}
                {dados.escritorio
                  ? 'Escritório (todos)'
                  : (dados.direcionada_usuarios && dados.direcionada_usuarios.length
                      ? dados.direcionada_usuarios.join(', ')
                      : '—')}
                {dados.direcionada_por_nome && (
                  <span style={{ color: '#888' }}> · por {dados.direcionada_por_nome} em {dataHora(dados.direcionada_em)}</span>
                )}
              </li>
              <li>
                <strong>Tratada:</strong>{' '}
                {dados.tratada
                  ? <>por {dados.tratada_por_nome || '—'} <span style={{ color: '#888' }}>· {dataHora(dados.tratada_em)}</span></>
                  : 'Ainda não tratada'}
              </li>
            </ul>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
