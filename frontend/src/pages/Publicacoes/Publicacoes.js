// ============================================================
// PÁGINA DE PUBLICAÇÕES
// ------------------------------------------------------------
// Abas por FONTE (hoje só "AASP"; outras fontes entram no futuro).
// Fluxo da AASP: escolher um dia e baixar as publicações (só as novas são
// salvas — dedup pelo texto). Pesquisar por conteúdo, direcionar (escritório
// ou usuários), marcar tratada, ver histórico e excluir.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { publicacoesAPI, agendaAPI } from '../../services/api';
import { formatarData, hojeLocal, textoLimpo } from '../../utils/formatters';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import MenuAcoes from '../../components/MenuAcoes';
import NumeroProcessoCopiavel from '../../components/NumeroProcessoCopiavel';
import { EtiquetaCelula, LegendaEtiquetasPessoais, itemEtiquetasSubmenu, useEtiquetasPessoais } from '../../components/Etiquetas';
// Reuso dos modais de criação já existentes (sem duplicar código): a partir de uma
// publicação o usuário cria Prazo, Tarefa ou Compromisso, já com o vínculo de origem.
import { ModalNovoPrazo } from '../Prazos/Prazos';
import { ModalTarefa } from '../Tarefas/Tarefas';
import { ModalCompromisso } from '../Agenda/Agenda';

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

// Célula "Resp": responsáveis das ações da publicação. Campo estreito → corta com "…".
// Passar o mouse mostra o tooltip; clicar alterna entre cortado e completo.
function CelulaResp({ texto }) {
  const [aberto, setAberto] = useState(false);
  const t = (texto || '').trim();
  if (!t) return <td style={{ color: '#c9ccd1' }}>—</td>;
  return (
    <td style={{ fontSize: '13px', maxWidth: '160px', cursor: 'pointer' }}
      title={t} onClick={() => setAberto(a => !a)}>
      <span style={aberto
        ? { whiteSpace: 'normal', wordBreak: 'break-word' }
        : { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {t}
      </span>
    </td>
  );
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

// ------------------------------------------------------------
// A partir de uma publicação: cria Prazo, Tarefa ou Compromisso reusando os modais
// existentes, já injetando o vínculo de origem (publicacao_id). No Prazo, o número do
// processo da publicação já dispara a busca da pasta (o usuário escolhe qual é).
// Compartilhado pelas duas abas (AASP e CNJ).
// ------------------------------------------------------------
function ModalAcaoDaPublicacao({ acao, usuariosAgenda, usuarioLogadoId, ehAdmin, onFechar }) {
  const { tipo, pub } = acao;
  const numero = pub.numero_processo || '';
  if (tipo === 'prazo') {
    return <ModalNovoPrazo tipos={{ tipos: [], subtipos: [] }}
      buscaInicial={numero} publicacaoId={pub.id} onFechar={onFechar} />;
  }
  if (tipo === 'tarefa') {
    return <ModalTarefa
      preSelecao={numero ? { tipo: 'processo', processo_numero: numero } : undefined}
      publicacaoId={pub.id} onFechar={onFechar} />;
  }
  return <ModalCompromisso usuarios={usuariosAgenda} usuarioLogadoId={usuarioLogadoId}
    ehAdmin={ehAdmin} publicacaoId={pub.id} onFechar={onFechar} />;
}

// Barra com os mesmos botões de ação do menu ⋮, para usar DENTRO da janela de leitura
// da publicação. Só aparece para quem pode alterar. Compartilhada pelas duas abas.
function BarraAcoesPublicacao({ pub, podeAlterar, onCriar, onTratar, onEmail }) {
  if (!podeAlterar) return null;
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      <button className="btn btn-outline" onClick={() => onCriar('prazo', pub)}>📌 Criar prazo</button>
      <button className="btn btn-outline" onClick={() => onCriar('tarefa', pub)}>✓ Criar tarefa</button>
      <button className="btn btn-outline" onClick={() => onCriar('compromisso', pub)}>📅 Criar compromisso</button>
      <button className="btn btn-outline" onClick={() => onEmail(pub)}>📧 Enviar por e-mail</button>
      {/* Só pode marcar tratada com o processo cadastrado; Reabrir é sempre permitido.
          Quando não pode, o botão fica VISÍVEL porém desabilitado, com aviso no hover.
          (o <span> em volta garante o tooltip mesmo com o botão desabilitado) */}
      {(() => {
        const podeTratar = !!(pub.tratada || pub.processo_cadastrado);
        return (
          <span style={{ display: 'inline-flex' }}
            title={podeTratar ? undefined : 'Processo não está cadastrado !'}>
            <button className="btn btn-outline" disabled={!podeTratar}
              onClick={() => onTratar(pub)}>
              {pub.tratada ? '↩️ Reabrir' : '✔️ Tratada / sem ação'}
            </button>
          </span>
        );
      })()}
    </div>
  );
}

// Mini-modal: justificar a marcação MANUAL "Tratada / sem ação". O motivo é obrigatório
// (validação em faixa interna, nunca toast). Compartilhado pelas duas abas.
function ModalJustificarSemAcao({ pub, onFechar, onSucesso }) {
  const [motivo, setMotivo]     = useState('');
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso]       = useState('');

  async function confirmar() {
    if (!motivo.trim()) {
      setAviso('Escreva o motivo para marcar esta publicação como tratada sem ação.');
      return;
    }
    setSalvando(true);
    try {
      await publicacoesAPI.tratar(pub.id, { tratada: true, sem_acao: true, motivo: motivo.trim() });
      onSucesso();
    } catch (err) {
      setAviso(err.response?.data?.mensagem || 'Não foi possível marcar como tratada. Tente novamente.');
    } finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Tratar sem ação</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {aviso && (
            <div style={{ background:'#fff4e5', border:'1px solid #ffcf99', color:'#8a5300',
              padding:'8px 12px', borderRadius:'6px', fontSize:'13px', marginBottom:'12px' }}>
              {aviso}
            </div>
          )}
          <p style={{ fontSize:'13px', color:'#555', marginTop:0 }}>
            Explique por que esta publicação está sendo marcada como tratada sem gerar prazo,
            tarefa ou compromisso.
          </p>
          <div className="form-group">
            <label className="form-label">Motivo *</label>
            <textarea className="form-control" rows={4} value={motivo} maxLength={500}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ex.: publicação meramente informativa, sem providência a tomar." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Marcar como tratada'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal: enviar a publicação por e-mail para usuários do sistema e/ou advogados
// freelancers (vários de uma vez). Quem não tem e-mail cadastrado fica desabilitado.
// Compartilhado pelas duas abas.
function ModalEnviarPublicacaoEmail({ pub, onFechar, onSucesso }) {
  const [dados, setDados]           = useState(null);   // { usuarios, freelancers }
  const [sel, setSel]               = useState(new Set());
  const [incluirOutro, setIncluirOutro] = useState(false); // checkbox "Outro"
  const [emailOutro, setEmailOutro]     = useState('');    // e-mail avulso
  const [mensagem, setMensagem]     = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando]     = useState(false);
  const [aviso, setAviso]           = useState('');

  useEffect(() => {
    publicacoesAPI.destinatariosEmail()
      .then(({ data }) => { if (data.ok) setDados(data.dados); else setAviso('Não foi possível carregar os destinatários.'); })
      .catch(() => setAviso('Não foi possível carregar os destinatários.'))
      .finally(() => setCarregando(false));
  }, []);

  function toggle(chave) {
    setSel(prev => { const n = new Set(prev); n.has(chave) ? n.delete(chave) : n.add(chave); return n; });
  }

  async function enviar() {
    const destinatarios = [...sel].map(k => { const [tipo, id] = k.split(':'); return { tipo, id: Number(id) }; });
    // Inclui o e-mail avulso do "Outro", se marcado (validando o formato).
    if (incluirOutro) {
      const em = emailOutro.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setAviso('Informe um e-mail válido no campo "Outro".'); return; }
      destinatarios.push({ tipo: 'outro', email: em });
    }
    if (!destinatarios.length) { setAviso('Selecione ao menos um destinatário.'); return; }
    setEnviando(true); setAviso('');
    try {
      const { data } = await publicacoesAPI.enviarEmail(pub.id, { destinatarios, mensagem: mensagem.trim() });
      const falhas = data.dados?.falhas || [];
      if (falhas.length) {
        setAviso(`Enviado para ${data.dados.enviados}. Não enviado para: ${falhas.map(f => f.nome).join(', ')}.`);
        setEnviando(false);
        return;
      }
      toast.success(`${data.dados.enviados} e-mail(s) enviado(s).`);
      onSucesso();
    } catch (err) {
      setAviso(err.response?.data?.mensagem || 'Não foi possível enviar. Tente novamente.');
      setEnviando(false);
    }
  }

  function Linha({ tipo, p }) {
    const chave = `${tipo}:${p.id}`;
    const semEmail = !p.email;
    return (
      <label style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 4px',
        opacity: semEmail ? 0.55 : 1, cursor: semEmail ? 'not-allowed' : 'pointer' }}>
        <input type="checkbox" disabled={semEmail} checked={sel.has(chave)} onChange={() => toggle(chave)} />
        <span style={{ fontSize:'13px' }}>
          {p.nome}{p.oab ? ` — OAB ${p.oab}` : ''}
          <span style={{ color: semEmail ? '#b45309' : '#888', fontSize:'12px' }}>
            {semEmail ? '  (sem e-mail cadastrado)' : `  ·  ${p.email}`}
          </span>
        </span>
      </label>
    );
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box" style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h3>Enviar publicação por e-mail</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {aviso && (
            <div style={{ background:'#fff4e5', border:'1px solid #ffcf99', color:'#8a5300',
              padding:'8px 12px', borderRadius:'6px', fontSize:'13px', marginBottom:'12px' }}>
              {aviso}
            </div>
          )}
          {carregando ? <div className="loading">Carregando destinatários...</div> : dados && (
            <>
              <p style={{ fontSize:'13px', color:'#555', marginTop:0 }}>
                Marque para quem enviar o <strong>conteúdo completo</strong> desta publicação.
              </p>
              <div className="form-group">
                <label className="form-label">Mensagem (opcional)</label>
                <textarea className="form-control" rows={4} value={mensagem}
                  onChange={e => setMensagem(e.target.value)}
                  placeholder="Ex.: Boa tarde, segue a publicação que ficou para você resolver..." />
                <small style={{ color:'#888' }}>Aparece no topo do e-mail e fica registrada no histórico.</small>
              </div>
              <div style={{ fontWeight:600, fontSize:'13px', margin:'8px 0 2px' }}>Usuários do sistema</div>
              {dados.usuarios.length ? dados.usuarios.map(u => <Linha key={`u${u.id}`} tipo="usuario" p={u} />)
                : <div style={{ fontSize:'12px', color:'#888' }}>Nenhum usuário.</div>}
              <div style={{ fontWeight:600, fontSize:'13px', margin:'14px 0 2px' }}>Advogados freelancers</div>
              {dados.freelancers.length ? dados.freelancers.map(f => <Linha key={`f${f.id}`} tipo="freela" p={f} />)
                : <div style={{ fontSize:'12px', color:'#888' }}>Nenhum freelancer cadastrado.</div>}
              <div style={{ marginTop:'14px', borderTop:'1px solid #eef2f7', paddingTop:'10px' }}>
                <label style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 4px', cursor:'pointer' }}>
                  <input type="checkbox" checked={incluirOutro} onChange={e => setIncluirOutro(e.target.checked)} />
                  <span style={{ fontSize:'13px' }}>Outro (digitar 1 e-mail avulso)</span>
                </label>
                {incluirOutro && (
                  <input className="form-control" type="email" style={{ marginTop:'6px' }}
                    placeholder="nome@exemplo.com" value={emailOutro}
                    onChange={e => setEmailOutro(e.target.value)} />
                )}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={enviar} disabled={enviando || carregando}>
            {enviando ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
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
  const { temPermissao, usuario, ehAdmin } = useAuth();
  const podeImportar = temPermissao('publicacoes', 'cadastrar');
  const podeAlterar  = temPermissao('publicacoes', 'alterar');
  const podeExcluir  = temPermissao('publicacoes', 'excluir');

  const [configurado, setConfigurado] = useState(null); // null = ainda verificando
  const [dataImport, setDataImport]   = useState(hojeLocal());
  const [importando, setImportando]   = useState(false);

  const [lista, setLista]       = useState([]);
  const { defs: etqDefs, marcar: marcarEtq } = useEtiquetasPessoais('publicacoes', lista, setLista);
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
  const [acaoAberta, setAcaoAberta]           = useState(null); // { tipo:'prazo'|'tarefa'|'compromisso', pub }
  const [usuariosAgenda, setUsuariosAgenda]   = useState([]);   // p/ "Delegar para" do compromisso
  const [historicoAberto, setHistoricoAberto]   = useState(null);
  const [justificando, setJustificando]         = useState(null); // publicação aguardando justificativa de "sem ação"
  const [enviandoEmailPub, setEnviandoEmailPub] = useState(null); // publicação a enviar por e-mail

  // Fecha a janela de leitura da publicação com a tecla Esc — só quando não há outro
  // modal por cima (Criar prazo/tarefa/compromisso ou a justificativa de "sem ação").
  useEffect(() => {
    if (!textoAberto || acaoAberta || justificando) return;
    function handleKey(e) { if (e.key === 'Escape') setTextoAberto(null); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [textoAberto, acaoAberta, justificando]);
  const [confirmar, setConfirmar]             = useState(null);

  // Verifica se a AASP está configurada (para mostrar o aviso, sem quebrar a tela).
  useEffect(() => {
    publicacoesAPI.statusAasp()
      .then(({ data }) => { if (data.ok) setConfigurado(!!data.dados.configurado); })
      .catch(() => setConfigurado(false));
  }, []);

  // Lista de usuários para o "Delegar para" do compromisso (criado a partir da publicação).
  useEffect(() => {
    agendaAPI.listarUsuarios()
      .then(({ data }) => { if (data.ok) setUsuariosAgenda(data.dados || []); })
      .catch(() => {});
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
        etiqueta: filtros.etiqueta || undefined,
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
          dataInicio: f.dataInicio || hojeLocal(), dataFim: f.dataFim || hojeLocal() });
  }

  // ---- Seleção e exclusão em lote (age só na fonte AASP) ----
  const idsPagina = lista.filter(p => !p.tratada).map(p => p.id); // tratadas não entram na seleção/lote
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

  // "Buscar publicações do dia": importa direto (sem confirmação). A importação só traz as
  // publicações cujo número de processo ainda não existe no banco naquele dia (dedup no backend),
  // então re-rodar o dia não duplica nem apaga nada.
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
    // Marcar "sem ação" (manual) exige justificativa -> abre o mini-modal.
    if (!p.tratada) { setJustificando(p); return; }
    // Reabrir é direto (e o backend limpa o motivo).
    try {
      await publicacoesAPI.tratar(p.id, { tratada: false });
      toast.success('Publicação reaberta');
      carregar();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao atualizar'); }
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
                <label className="form-label">Dia da Disponibilização (AASP)</label>
                <input type="date" className="form-control" value={dataImport}
                  onChange={e => setDataImport(e.target.value)} />
              </div>
              <button className="btn btn-primary" style={{ marginBottom: '1px' }}
                onClick={importarDia} disabled={importando}>
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
          </div>
        )}
        {/* Legenda da pintura de duplicadas */}
        <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#888' }}>
          <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#fde8e8',
            border: '1px solid #f0c0c0', borderRadius: '2px', verticalAlign: 'middle', marginRight: '6px' }} />
          Número do processo em vermelho-claro = o mesmo processo aparece mais de uma vez no mesmo dia. Exclua manualmente as que não quiser.
        </p>
        <LegendaEtiquetasPessoais definicoes={etqDefs} filtroAtivo={filtros.etiqueta} onFiltrar={(slot) => setFiltro('etiqueta', slot)} />
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
                  {thOrder('status', 'Status')}
                  <th>Resp</th>
                  <th style={{ textAlign: 'center' }}>Etiq. Pessoal</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(p => (
                  // Linha pintada (vermelho claro) = publicação repetida: existe outra de texto
                  // idêntico no mesmo dia. Fica pintada uma cópia; a mais antiga não é pintada.
                  <tr key={p.id}
                    style={{ background: p.lida ? 'var(--linha-lida, #cdebd6)' : '#fff8db' }}>
                    {podeExcluir && (
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={selecionados.includes(p.id)}
                          onChange={() => toggleSel(p.id)}
                          disabled={p.tratada} title={p.tratada ? 'Publicação tratada não pode ser excluída' : undefined} />
                      </td>
                    )}
                    <td style={{ whiteSpace: 'nowrap' }}>{formatarData(p.data_publicacao)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {p.duplicada
                        ? <span style={{ background: '#fde8e8', padding: '1px 5px', borderRadius: '3px' }}
                            title="O mesmo processo aparece mais de uma vez neste dia (repetida)">
                            <NumeroProcessoCopiavel numero={p.numero_processo} />
                          </span>
                        : <NumeroProcessoCopiavel numero={p.numero_processo} />}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.numero_publicacao || '—'}</td>
                    <td style={{ maxWidth: '360px' }}>
                      <div style={{
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontSize: '13px', cursor: 'pointer', color: '#1a56db',
                      }}
                        onClick={() => { setTextoAberto(p); if (!p.lida) { publicacoesAPI.marcarLida(p.id).catch(() => {}); setLista(ls => ls.map(x => x.id === p.id ? { ...x, lida: 1 } : x)); } }} title="Clique para ler o texto completo">
                        {textoLimpo(p.texto)}
                      </div>
                    </td>
                    <td>
                      {p.tratada
                        ? <span className="badge badge-verde"
                            title={p.motivo_sem_acao ? `Sem ação — motivo: ${p.motivo_sem_acao}` : undefined}>Tratada</span>
                        : <span className="badge badge-laranja">Pendente</span>}
                    </td>
                    <CelulaResp texto={p.resp_acoes} />
                    <td style={{ textAlign: 'center' }}>
                      <EtiquetaCelula slot={p.etiqueta_pessoal} definicoes={etqDefs} />
                    </td>
                    <td>
                      <MenuAcoes itens={[
                        itemEtiquetasSubmenu({ definicoes: etqDefs, slotAtual: p.etiqueta_pessoal,
                          onMarcar: (slot) => marcarEtq(p.id, slot) }),
                        { label: 'Criar prazo', icone: '📌',
                          oculto: !podeAlterar,
                          onClick: () => setAcaoAberta({ tipo: 'prazo', pub: p }) },
                        { label: 'Criar tarefa', icone: '✓',
                          oculto: !podeAlterar,
                          onClick: () => setAcaoAberta({ tipo: 'tarefa', pub: p }) },
                        { label: 'Criar compromisso', icone: '📅',
                          oculto: !podeAlterar,
                          onClick: () => setAcaoAberta({ tipo: 'compromisso', pub: p }) },
                        { label: 'Enviar por e-mail', icone: '📧',
                          oculto: !podeAlterar,
                          onClick: () => setEnviandoEmailPub(p) },
                        { label: p.tratada ? 'Reabrir' : 'Tratada / sem ação',
                          icone: p.tratada ? '↩️' : '✔️',
                          // Só pode marcar tratada com o processo cadastrado; Reabrir é sempre permitido.
                          oculto: !podeAlterar || (!p.tratada && !p.processo_cadastrado),
                          onClick: () => alternarTratada(p) },
                        { label: 'Histórico', icone: '📋',
                          onClick: () => setHistoricoAberto(p) },
                        { label: 'Excluir', icone: '🗑️', perigo: true,
                          oculto: !podeExcluir || p.tratada,   // tratada não pode ser excluída
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  gap: '12px', marginBottom: '12px', fontSize: '13px', color: '#555' }}>
                  <div>
                    {textoAberto.titulo && <div>{textoAberto.titulo}</div>}
                    {textoAberto.numero_processo && <div><strong>Processo:</strong> {textoAberto.numero_processo}</div>}
                  </div>
                  {textoAberto.numero_publicacao && (
                    <div style={{ whiteSpace: 'nowrap' }}><strong>Nº da publicação:</strong> {textoAberto.numero_publicacao}</div>
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
                <BarraAcoesPublicacao pub={textoAberto} podeAlterar={podeAlterar}
                  onCriar={(tipo, p) => setAcaoAberta({ tipo, pub: p })}
                  onTratar={(p) => alternarTratada(p)}
                  onEmail={(p) => setEnviandoEmailPub(p)} />
                <button className="btn btn-secondary" style={{ marginLeft: 'auto' }}
                  onClick={() => setTextoAberto(null)}>Fechar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modais de ação (Prazo/Tarefa/Compromisso) criados a partir da publicação.
          Ao salvar, a publicação é marcada como tratada automaticamente. */}
      {acaoAberta && (
        <ModalAcaoDaPublicacao
          acao={acaoAberta}
          usuariosAgenda={usuariosAgenda}
          usuarioLogadoId={usuario?.id}
          ehAdmin={ehAdmin}
          onFechar={async (salvou) => {
            const pub = acaoAberta.pub;
            setAcaoAberta(null);
            if (salvou) {
              // Só marca Tratada se o processo estiver cadastrado (regra). Sem processo
              // cadastrado, a publicação continua Pendente mesmo tendo gerado uma ação.
              if (pub.processo_cadastrado) { try { await publicacoesAPI.tratar(pub.id, { tratada: true }); } catch {} }
              carregar();
            }
          }} />
      )}

      {/* Modal: histórico */}
      {historicoAberto && (
        <ModalHistorico publicacao={historicoAberto} onFechar={() => setHistoricoAberto(null)} />
      )}
      {justificando && (
        <ModalJustificarSemAcao pub={justificando}
          onFechar={() => setJustificando(null)}
          onSucesso={() => { setJustificando(null); toast.success('Publicação marcada como tratada'); carregar(); }} />
      )}
      {enviandoEmailPub && (
        <ModalEnviarPublicacaoEmail pub={enviandoEmailPub}
          onFechar={() => setEnviandoEmailPub(null)}
          onSucesso={() => setEnviandoEmailPub(null)} />
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
  const { temPermissao, usuario, ehAdmin } = useAuth();
  const podeImportar = temPermissao('publicacoes', 'cadastrar');
  const podeAlterar  = temPermissao('publicacoes', 'alterar');
  const podeExcluir  = temPermissao('publicacoes', 'excluir');

  const [configurado, setConfigurado] = useState(null); // null = ainda verificando
  const [qtdOabs, setQtdOabs]         = useState(0);     // nº de OABs cadastradas (col. OAB só aparece com >1)
  const [dataInicio, setDataInicio]   = useState(hojeLocal());
  const [dataFim, setDataFim]         = useState(hojeLocal());
  const [importando, setImportando]   = useState(false);

  const [lista, setLista]       = useState([]);
  const { defs: etqDefs, marcar: marcarEtq } = useEtiquetasPessoais('publicacoes', lista, setLista);
  const [total, setTotal]       = useState(0);
  const [filtros, setFiltros]   = useState({
    dataInicio: '', dataFim: '', todasDatas: true,
    escopo: 'todas', tratada: '0', busca: '', pagina: 1,
    ordenar: null, direcao: null,
  });
  const [carregando, setCarregando] = useState(false);
  const [selecionados, setSelecionados] = useState([]); // ids marcados na página atual

  const [textoAberto, setTextoAberto]           = useState(null);
  const [acaoAberta, setAcaoAberta]           = useState(null); // { tipo:'prazo'|'tarefa'|'compromisso', pub }
  const [usuariosAgenda, setUsuariosAgenda]   = useState([]);   // p/ "Delegar para" do compromisso
  const [historicoAberto, setHistoricoAberto]   = useState(null);
  const [justificando, setJustificando]         = useState(null); // publicação aguardando justificativa de "sem ação"
  const [enviandoEmailPub, setEnviandoEmailPub] = useState(null); // publicação a enviar por e-mail

  // Fecha a janela de leitura da publicação com a tecla Esc — só quando não há outro
  // modal por cima (Criar prazo/tarefa/compromisso ou a justificativa de "sem ação").
  useEffect(() => {
    if (!textoAberto || acaoAberta || justificando) return;
    function handleKey(e) { if (e.key === 'Escape') setTextoAberto(null); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [textoAberto, acaoAberta, justificando]);
  const [confirmar, setConfirmar]               = useState(null);

  // Verifica se o CNJ está configurado (para mostrar o aviso, sem quebrar a tela).
  useEffect(() => {
    publicacoesAPI.statusCnj()
      .then(({ data }) => {
        if (data.ok) {
          setConfigurado(!!data.dados.configurado);
          setQtdOabs(Number(data.dados.qtdOabs) || 0);
        }
      })
      .catch(() => setConfigurado(false));
  }, []);

  // Lista de usuários para o "Delegar para" do compromisso (criado a partir da publicação).
  useEffect(() => {
    agendaAPI.listarUsuarios()
      .then(({ data }) => { if (data.ok) setUsuariosAgenda(data.dados || []); })
      .catch(() => {});
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
        etiqueta: filtros.etiqueta || undefined,
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
          dataInicio: f.dataInicio || hojeLocal(), dataFim: f.dataFim || hojeLocal() });
  }

  // ---- Seleção e exclusão em lote (age só na fonte CNJ) ----
  const idsPagina = lista.filter(p => !p.tratada).map(p => p.id); // tratadas não entram na seleção/lote
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
    // Marcar "sem ação" (manual) exige justificativa -> abre o mini-modal.
    if (!p.tratada) { setJustificando(p); return; }
    // Reabrir é direto (e o backend limpa o motivo).
    try {
      await publicacoesAPI.tratar(p.id, { tratada: false });
      toast.success('Publicação reaberta');
      carregar();
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao atualizar'); }
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
          </div>
        )}
        <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#888' }}>
          <span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#fde8e8',
            border: '1px solid #f0c0c0', borderRadius: '2px', verticalAlign: 'middle', marginRight: '6px' }} />
          Número do processo em vermelho-claro = o mesmo processo aparece mais de uma vez no mesmo dia. Exclua manualmente as que não quiser.
        </p>
        <LegendaEtiquetasPessoais definicoes={etqDefs} filtroAtivo={filtros.etiqueta} onFiltrar={(slot) => setFiltro('etiqueta', slot)} />
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
                  {qtdOabs > 1 && <th style={{ whiteSpace: 'nowrap' }}>OAB</th>}
                  {thOrder('processo', 'Processo')}
                  {thOrder('conteudo', 'Conteúdo')}
                  {thOrder('status', 'Status')}
                  <th>Resp</th>
                  <th style={{ textAlign: 'center' }}>Etiq. Pessoal</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(p => (
                  <tr key={p.id}
                    style={{ background: p.lida ? 'var(--linha-lida, #cdebd6)' : '#fff8db' }}>
                    {podeExcluir && (
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={selecionados.includes(p.id)}
                          onChange={() => toggleSel(p.id)}
                          disabled={p.tratada} title={p.tratada ? 'Publicação tratada não pode ser excluída' : undefined} />
                      </td>
                    )}
                    <td style={{ whiteSpace: 'nowrap' }}>{formatarData(p.data_publicacao)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.tribunal || '—'}</td>
                    {qtdOabs > 1 && <td style={{ whiteSpace: 'nowrap' }}>{p.oab || '—'}</td>}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {p.duplicada
                        ? <span style={{ background: '#fde8e8', padding: '1px 5px', borderRadius: '3px' }}
                            title="O mesmo processo aparece mais de uma vez neste dia (repetida)">
                            <NumeroProcessoCopiavel numero={p.numero_processo} />
                          </span>
                        : <NumeroProcessoCopiavel numero={p.numero_processo} />}
                    </td>
                    <td style={{ maxWidth: '360px' }}>
                      <div style={{
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontSize: '13px', cursor: 'pointer', color: '#1a56db',
                      }}
                        onClick={() => { setTextoAberto(p); if (!p.lida) { publicacoesAPI.marcarLida(p.id).catch(() => {}); setLista(ls => ls.map(x => x.id === p.id ? { ...x, lida: 1 } : x)); } }} title="Clique para ler o texto completo">
                        {textoLimpo(p.texto)}
                      </div>
                    </td>
                    <td>
                      {p.tratada
                        ? <span className="badge badge-verde"
                            title={p.motivo_sem_acao ? `Sem ação — motivo: ${p.motivo_sem_acao}` : undefined}>Tratada</span>
                        : <span className="badge badge-laranja">Pendente</span>}
                    </td>
                    <CelulaResp texto={p.resp_acoes} />
                    <td style={{ textAlign: 'center' }}>
                      <EtiquetaCelula slot={p.etiqueta_pessoal} definicoes={etqDefs} />
                    </td>
                    <td>
                      <MenuAcoes itens={[
                        itemEtiquetasSubmenu({ definicoes: etqDefs, slotAtual: p.etiqueta_pessoal,
                          onMarcar: (slot) => marcarEtq(p.id, slot) }),
                        { label: 'Criar prazo', icone: '📌',
                          oculto: !podeAlterar,
                          onClick: () => setAcaoAberta({ tipo: 'prazo', pub: p }) },
                        { label: 'Criar tarefa', icone: '✓',
                          oculto: !podeAlterar,
                          onClick: () => setAcaoAberta({ tipo: 'tarefa', pub: p }) },
                        { label: 'Criar compromisso', icone: '📅',
                          oculto: !podeAlterar,
                          onClick: () => setAcaoAberta({ tipo: 'compromisso', pub: p }) },
                        { label: 'Enviar por e-mail', icone: '📧',
                          oculto: !podeAlterar,
                          onClick: () => setEnviandoEmailPub(p) },
                        { label: p.tratada ? 'Reabrir' : 'Tratada / sem ação',
                          icone: p.tratada ? '↩️' : '✔️',
                          // Só pode marcar tratada com o processo cadastrado; Reabrir é sempre permitido.
                          oculto: !podeAlterar || (!p.tratada && !p.processo_cadastrado),
                          onClick: () => alternarTratada(p) },
                        { label: 'Histórico', icone: '📋',
                          onClick: () => setHistoricoAberto(p) },
                        { label: 'Excluir', icone: '🗑️', perigo: true,
                          oculto: !podeExcluir || p.tratada,   // tratada não pode ser excluída
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  gap: '12px', marginBottom: '12px', fontSize: '13px', color: '#555' }}>
                  {textoAberto.numero_publicacao && (
                    <div style={{ whiteSpace: 'nowrap', order: 2 }}><strong>Nº da publicação:</strong> {textoAberto.numero_publicacao}</div>
                  )}
                  <div style={{ order: 1 }}>
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
                </div>
                <div style={{
                  background: '#f8fafc', padding: '16px', borderRadius: '8px',
                  fontSize: '14px', lineHeight: '1.7', whiteSpace: 'pre-wrap', maxHeight: '420px', overflowY: 'auto',
                }}>
                  {realcarTexto(textoLimpo(textoAberto.texto), filtros.busca)}
                </div>
              </div>
              <div className="modal-footer">
                <BarraAcoesPublicacao pub={textoAberto} podeAlterar={podeAlterar}
                  onCriar={(tipo, p) => setAcaoAberta({ tipo, pub: p })}
                  onTratar={(p) => alternarTratada(p)}
                  onEmail={(p) => setEnviandoEmailPub(p)} />
                <button className="btn btn-secondary" style={{ marginLeft: 'auto' }}
                  onClick={() => setTextoAberto(null)}>Fechar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modais de ação (Prazo/Tarefa/Compromisso) criados a partir da publicação.
          Ao salvar, a publicação é marcada como tratada automaticamente. */}
      {acaoAberta && (
        <ModalAcaoDaPublicacao
          acao={acaoAberta}
          usuariosAgenda={usuariosAgenda}
          usuarioLogadoId={usuario?.id}
          ehAdmin={ehAdmin}
          onFechar={async (salvou) => {
            const pub = acaoAberta.pub;
            setAcaoAberta(null);
            if (salvou) {
              // Só marca Tratada se o processo estiver cadastrado (regra). Sem processo
              // cadastrado, a publicação continua Pendente mesmo tendo gerado uma ação.
              if (pub.processo_cadastrado) { try { await publicacoesAPI.tratar(pub.id, { tratada: true }); } catch {} }
              carregar();
            }
          }} />
      )}

      {/* Modal: histórico (compartilhado com a AASP) */}
      {historicoAberto && (
        <ModalHistorico publicacao={historicoAberto} onFechar={() => setHistoricoAberto(null)} />
      )}
      {justificando && (
        <ModalJustificarSemAcao pub={justificando}
          onFechar={() => setJustificando(null)}
          onSucesso={() => { setJustificando(null); toast.success('Publicação marcada como tratada'); carregar(); }} />
      )}
      {enviandoEmailPub && (
        <ModalEnviarPublicacaoEmail pub={enviandoEmailPub}
          onFechar={() => setEnviandoEmailPub(null)}
          onSucesso={() => setEnviandoEmailPub(null)} />
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
                {dados.tratada && dados.motivo_sem_acao && (
                  <div style={{ color: '#8a5300', marginTop: '2px' }}>
                    ✔️ Sem ação — motivo: {dados.motivo_sem_acao}
                  </div>
                )}
              </li>
              {dados.acoes && (() => {
                const { prazos = [], tarefas = [], compromissos = [] } = dados.acoes;
                const total = prazos.length + tarefas.length + compromissos.length;
                return (
                  <li style={{ marginTop: '10px', borderTop: '1px solid #eef2f7', paddingTop: '8px' }}>
                    <strong>Ações criadas a partir desta publicação:</strong>{' '}
                    {total === 0 ? 'nenhuma ainda.' : (
                      <ul style={{ margin: '6px 0 0', paddingLeft: '18px', lineHeight: '1.7' }}>
                        {prazos.map(a => (
                          <li key={'p' + a.id}>📌 Prazo: {a.titulo || 'Prazo'} — vence {formatarData(a.data_vencimento)}
                            {a.processo_numero ? ` · proc. ${a.processo_numero}` : ''}
                            {a.status === 'cancelado' ? ' (cancelado)' : a.status === 'concluido' ? ' (concluído)' : ''}
                            <span style={{ color: '#1a56db' }}> · 👤 {a.direcionado_nome || 'Escritório'}</span></li>
                        ))}
                        {tarefas.map(a => (
                          <li key={'t' + a.id}>✓ Tarefa: {a.titulo}
                            {a.data_vencimento ? ` — vence ${formatarData(a.data_vencimento)}` : ''}
                            {a.concluida ? ' (concluída)' : ''}
                            <span style={{ color: '#1a56db' }}> · 👤 {a.direcionado_nome || 'Escritório'}</span></li>
                        ))}
                        {compromissos.map(a => (
                          <li key={'c' + a.id}>📅 Compromisso: {a.titulo} — {formatarData(a.data)}
                            {a.concluido ? ' (concluído)' : ''}
                            <span style={{ color: '#1a56db' }}> · 👤 {a.direcionado_nome || (a.escritorio ? 'Escritório' : '—')}</span></li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })()}
              {Array.isArray(dados.emails) && dados.emails.length > 0 && (
                <li style={{ marginTop: '10px', borderTop: '1px solid #eef2f7', paddingTop: '8px' }}>
                  <strong>E-mails enviados desta publicação:</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px', lineHeight: '1.7' }}>
                    {dados.emails.map((e, i) => (
                      <li key={i}>📧 {e.destinatario_nome || e.para}
                        <span style={{ color: '#888' }}> · {dataHora(e.enviado_em)}</span>
                        {e.status !== 'sucesso' && <span style={{ color: '#b91c1c' }}> · falhou</span>}
                        {e.mensagem && <div style={{ color: '#555', fontSize: '12px' }}>💬 {e.mensagem}</div>}
                      </li>
                    ))}
                  </ul>
                </li>
              )}
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
