// ============================================================
// PÁGINA DE PUBLICAÇÕES
// ------------------------------------------------------------
// Abas por FONTE (hoje só "AASP"; outras fontes entram no futuro).
// Fluxo da AASP: escolher um dia e baixar as publicações (só as novas são
// salvas — dedup pelo texto). Pesquisar por conteúdo, direcionar (escritório
// ou usuários), marcar tratada, ver histórico e excluir.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { publicacoesAPI, agendaAPI, periciasAPI, audienciasAPI, processosAPI } from '../../services/api';
import { formatarData, formatarDataHora, hojeLocal, textoLimpo } from '../../utils/formatters';
import { analisarPublicacao } from '../../utils/sugestoesPublicacao';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import MenuAcoes from '../../components/MenuAcoes';
import NumeroProcessoCopiavel from '../../components/NumeroProcessoCopiavel';
import { EtiquetaCelula, LegendaEtiquetasPessoais, itemEtiquetasSubmenu, useEtiquetasPessoais } from '../../components/Etiquetas';
import useEscFechar from '../../hooks/useEscFechar';
// Reuso dos modais de criação já existentes (sem duplicar código): a partir de uma
// publicação o usuário cria Prazo, Tarefa ou Compromisso, já com o vínculo de origem.
import { ModalNovoPrazo } from '../Prazos/Prazos';
import { ModalTarefa } from '../Tarefas/Tarefas';
import { ModalCompromisso } from '../Agenda/Agenda';
import { ModalPericia } from '../Pericias/Pericias';
import { ModalNovaAudiencia } from '../Audiencias/Audiencias';

const POR_PAGINA = 30;

// "Dobra" um texto para comparação: remove acentos e ignora maiúsc./minúsc.
// Ex.: "Audiência" -> "audiencia". Assim "audiencia" casa com "audiência" e vice-versa.
function dobrarTexto(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Realça, dentro de `texto`, as ocorrências de vários termos ao mesmo tempo.
// `needles` = [{ termo, cor, alvo? }]. A comparação ignora ACENTOS, maiúsc./minúsc.
// E DIFERENÇAS DE ESPAÇO/QUEBRA DE LINHA (colapsa qualquer espaço em um só) — assim
// um trecho vindo do texto "achatado" casa com o texto exibido (que tem quebras).
// O primeiro <mark> de um needle com `alvo:true` recebe `alvoRef` (para dar scroll até ele).
function realcarVarios(texto, needles, alvoRef) {
  const txt = String(texto);
  const ativos = (needles || [])
    .map(n => ({ ...n, fold: dobrarTexto(String(n.termo || '').replace(/\s+/g, ' ').trim()) }))
    .filter(n => n.fold);
  if (!ativos.length) return txt;

  // Versão "dobrada" do texto (espaços colapsados), com mapa posição-dobrada -> índice original.
  let foldStr = '';
  const mapa = [];
  let ultimoEspaco = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (/\s/.test(ch)) {
      if (!ultimoEspaco) { foldStr += ' '; mapa.push(i); ultimoEspaco = true; }
      continue;
    }
    ultimoEspaco = false;
    const f = dobrarTexto(ch);
    for (let k = 0; k < f.length; k++) { foldStr += f[k]; mapa.push(i); }
  }

  // Coleta as faixas (início/fim no texto ORIGINAL) de todas as ocorrências de todos os termos.
  const faixas = [];
  for (const n of ativos) {
    let from = 0, pos;
    while ((pos = foldStr.indexOf(n.fold, from)) !== -1) {
      faixas.push({
        oIni: mapa[pos], oFim: mapa[pos + n.fold.length - 1] + 1,
        cor: n.cor, alvo: !!n.alvo, ref: n.ref, prioridade: n.prioridade || 0,
      });
      from = pos + n.fold.length;
    }
  }
  if (!faixas.length) return txt;

  // A busca digitada no modal tem prioridade sobre um trecho azul de sugestão que
  // ocupe a mesma parte do texto. Os demais destaques continuam aparecendo normalmente.
  const escolhidas = [];
  faixas
    .sort((a, b) => b.prioridade - a.prioridade || a.oIni - b.oIni || b.oFim - a.oFim)
    .forEach(f => {
      if (!escolhidas.some(e => f.oIni < e.oFim && f.oFim > e.oIni)) escolhidas.push(f);
    });
  escolhidas.sort((a, b) => a.oIni - b.oIni || b.oFim - a.oFim);

  const out = [];
  let cursor = 0, key = 0, primeiroAlvo = true;
  const refsUsadas = new Set();
  for (const f of escolhidas) {
    if (f.oIni < cursor) continue; // sobreposição: a primeira faixa ganha
    if (f.oIni > cursor) out.push(<React.Fragment key={key++}>{txt.slice(cursor, f.oIni)}</React.Fragment>);
    const refFaixa = f.ref || (f.alvo && primeiroAlvo ? alvoRef : null);
    const usaRef = refFaixa && !refsUsadas.has(refFaixa);
    if (usaRef) {
      refsUsadas.add(refFaixa);
      if (f.alvo && refFaixa === alvoRef) primeiroAlvo = false;
    }
    out.push(
      <mark key={key++} ref={usaRef ? refFaixa : undefined}
        style={{ background: f.cor, padding: 0, borderRadius: '2px' }}>
        {txt.slice(f.oIni, f.oFim)}
      </mark>,
    );
    cursor = f.oFim;
  }
  if (cursor < txt.length) out.push(<React.Fragment key={key++}>{txt.slice(cursor)}</React.Fragment>);
  return out;
}

// Compat: realce simples de um termo (fundo amarelo).
function realcarTexto(texto, termo) {
  const t = (termo || '').trim();
  return t ? realcarVarios(texto, [{ termo: t, cor: '#fde047' }]) : texto;
}

// Conta ocorrências sem diferenciar acentos, maiúsculas ou quebras de linha.
function contarOcorrencias(texto, termo) {
  const alvo = dobrarTexto(String(termo || '').replace(/\s+/g, ' ').trim());
  if (!alvo) return 0;
  const base = dobrarTexto(String(texto || '').replace(/\s+/g, ' '));
  let total = 0, pos = 0;
  while ((pos = base.indexOf(alvo, pos)) !== -1) {
    total++;
    pos += alvo.length;
  }
  return total;
}

// Campo compartilhado pelos modais AASP e CNJ.
function CampoBuscaPublicacao({ valor, onChange, total }) {
  const ativa = valor.trim();
  return (
    <div className="busca-publicacao-modal">
      <input type="search" value={valor} onChange={e => onChange(e.target.value)}
        placeholder="Localizar no texto..." aria-label="Localizar conteúdo nesta publicação" />
      {ativa && (
        <span className={total ? '' : 'sem-resultado'}>
          {total} {total === 1 ? 'ocorrência' : 'ocorrências'}
        </span>
      )}
    </div>
  );
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
// A partir de uma publicação: cria Prazo, Tarefa, Compromisso ou Perícia reusando os modais
// existentes, já injetando o vínculo de origem (publicacao_id). No Prazo, o número do
// processo da publicação já dispara a busca da pasta (o usuário escolhe qual é).
// Compartilhado pelas duas abas (AASP e CNJ).
// ------------------------------------------------------------
function ModalAcaoDaPublicacao({ acao, usuariosAgenda, usuarioLogadoId, ehAdmin, onFechar }) {
  const { tipo, pub, sugestao } = acao;
  const numero = pub.numero_processo || '';
  // Sugestão de AUDIÊNCIA abre a Audiência de verdade (não o Compromisso).
  const ehSugestaoAudiencia = tipo === 'compromisso' && sugestao?.subtipo === 'audiencia';
  const [tiposPericia, setTiposPericia] = useState([]);
  const [carregandoTiposPericia, setCarregandoTiposPericia] = useState(false);
  const [avisoPericia, setAvisoPericia] = useState('');
  const [tiposAudiencia, setTiposAudiencia] = useState([]);
  const [carregandoTiposAudiencia, setCarregandoTiposAudiencia] = useState(false);
  const [avisoAudiencia, setAvisoAudiencia] = useState('');
  // Processo COMPLETO (id, numProc, NomeTituloProc, numPasta, vara_id) — a Nova Audiência
  // precisa da PASTA e da vara; a publicação só tem o id, então buscamos pelo número.
  const [processoAud, setProcessoAud] = useState(null);
  const [carregandoProcAud, setCarregandoProcAud] = useState(false);

  const soDigitos = (s) => String(s || '').replace(/\D/g, '');
  // Prioridade: o processo_id que a publicação JÁ TEM (busca exata por ID, sem ambiguidade).
  // Só cai pra busca por TEXTO quando não há processo_id — e, nesse caso, exige o número
  // normalizado batendo (nunca aceita "sobrou só 1 resultado" às cegas — ver auditoria 02/09,
  // item 7: aceitar o único resultado podia vincular a audiência a um processo errado).
  const carregarProcessoAudiencia = useCallback(async () => {
    setCarregandoProcAud(true);
    setAvisoAudiencia('');
    try {
      if (pub.processo_id) {
        const { data } = await processosAPI.buscarPorId(pub.processo_id);
        if (data && data.ok && data.dados) { setProcessoAud(data.dados); return; }
        setAvisoAudiencia('Não foi possível localizar a pasta do processo cadastrado. Abra a audiência pela pasta do processo.');
        return;
      }
      const { data } = await processosAPI.buscarPorNumero(pub.processo_numero || numero);
      const lista = (data && data.ok) ? (data.dados || []) : [];
      const alvo = soDigitos(pub.processo_numero || numero);
      const match = lista.find(p => soDigitos(p.numProc) === alvo);
      if (match) setProcessoAud(match);
      else setAvisoAudiencia('Não foi possível localizar a pasta do processo cadastrado. Abra a audiência pela pasta do processo.');
    } catch (err) {
      setAvisoAudiencia(err.response?.data?.mensagem || 'Não foi possível carregar o processo da audiência.');
    } finally {
      setCarregandoProcAud(false);
    }
  }, [pub.processo_id, pub.processo_numero, numero]);

  const processoInicialPericia = pub.processo_id
    ? {
        processo_id: pub.processo_id,
        processo_numero: pub.processo_numero || numero,
        pasta_titulo: pub.pasta_titulo || '',
      }
    : null;

  const carregarTiposPericia = useCallback(async () => {
    setCarregandoTiposPericia(true);
    setAvisoPericia('');
    try {
      const { data } = await periciasAPI.tipos();
      if (data.ok) setTiposPericia(data.dados || []);
      else setAvisoPericia(data.mensagem || 'Não foi possível carregar os tipos de perícia.');
    } catch (err) {
      setAvisoPericia(err.response?.data?.mensagem || 'Não foi possível carregar os tipos de perícia.');
    } finally {
      setCarregandoTiposPericia(false);
    }
  }, []);

  const carregarTiposAudiencia = useCallback(async () => {
    setCarregandoTiposAudiencia(true);
    setAvisoAudiencia('');
    try {
      const { data } = await audienciasAPI.tipos();
      if (data.ok) setTiposAudiencia(data.dados || []);
      else setAvisoAudiencia(data.mensagem || 'Não foi possível carregar os tipos de audiência.');
    } catch (err) {
      setAvisoAudiencia(err.response?.data?.mensagem || 'Não foi possível carregar os tipos de audiência.');
    } finally {
      setCarregandoTiposAudiencia(false);
    }
  }, []);

  useEffect(() => {
    if (tipo === 'pericia') carregarTiposPericia();
    if (ehSugestaoAudiencia && pub.processo_id) { carregarTiposAudiencia(); carregarProcessoAudiencia(); }
  }, [tipo, ehSugestaoAudiencia, pub.processo_id, carregarTiposPericia, carregarTiposAudiencia, carregarProcessoAudiencia]);

  if (tipo === 'prazo') {
    // Da sugestão: dias + descrição já preenchidos (a data de início o usuário confere).
    return <ModalNovoPrazo tipos={{ tipos: [], subtipos: [] }}
      buscaInicial={numero} publicacaoId={pub.id}
      descricaoInicial={sugestao?.descricaoInicial}
      quantidadeInicial={sugestao?.quantidadeInicial}
      tipoDiasInicial={sugestao?.tipoDiasInicial}
      onFechar={onFechar} />;
  }
  if (tipo === 'tarefa') {
    // Da sugestão: título/descrição já preenchidos (objeto SEM id = nova tarefa).
    return <ModalTarefa
      preSelecao={numero ? { tipo: 'processo', processo_numero: numero } : undefined}
      tarefa={sugestao ? { titulo: sugestao.titulo, descricao: sugestao.descricao } : undefined}
      publicacaoId={pub.id} onFechar={onFechar} />;
  }
  if (tipo === 'pericia') {
    if (!processoInicialPericia) {
      return (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Criar perícia</h3>
              <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alerta alerta-aviso">
                Esta publicação ainda não está vinculada a um processo cadastrado. Cadastre ou vincule o processo antes de criar a perícia.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => onFechar(false)}>Fechar</button>
            </div>
          </div>
        </div>
      );
    }
    if (carregandoTiposPericia) {
      return (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Criar perícia</h3>
              <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
            </div>
            <div className="modal-body">Carregando cadastro da perícia...</div>
          </div>
        </div>
      );
    }
    if (avisoPericia) {
      return (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Criar perícia</h3>
              <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alerta alerta-erro">{avisoPericia}</div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => onFechar(false)}>Fechar</button>
            </div>
          </div>
        </div>
      );
    }
    return <ModalPericia
      tipos={tiposPericia}
      processoInicial={processoInicialPericia}
      dataInicial={sugestao?.data}
      horaInicial={sugestao?.hora}
      onTiposChange={carregarTiposPericia}
      onFechar={onFechar} />;
  }

  // SUGESTÃO DE AUDIÊNCIA -> abre a Audiência de verdade (módulo Audiências).
  // Exige processo cadastrado; sem ele, apenas informa (mesmo comportamento da perícia).
  if (ehSugestaoAudiencia) {
    if (!pub.processo_id) {
      return (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Agendar audiência</h3>
              <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alerta alerta-aviso">
                Esta publicação ainda não está vinculada a um processo cadastrado. Cadastre ou vincule o processo antes de agendar a audiência.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => onFechar(false)}>Fechar</button>
            </div>
          </div>
        </div>
      );
    }
    if (carregandoTiposAudiencia || carregandoProcAud) {
      return (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Agendar audiência</h3>
              <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
            </div>
            <div className="modal-body">Carregando cadastro da audiência...</div>
          </div>
        </div>
      );
    }
    if (avisoAudiencia) {
      return (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Agendar audiência</h3>
              <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
            </div>
            <div className="modal-body"><div className="alerta alerta-erro">{avisoAudiencia}</div></div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => onFechar(false)}>Fechar</button>
            </div>
          </div>
        </div>
      );
    }
    if (!processoAud) {
      return (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Agendar audiência</h3>
              <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
            </div>
            <div className="modal-body">Carregando cadastro da audiência...</div>
          </div>
        </div>
      );
    }
    // processoAud = { id, numProc, NomeTituloProc, numPasta, vara_id } — objeto COMPLETO,
    // igual ao que o modal recebe quando aberto pela pasta (mostra a Pasta e a vara).
    return <ModalNovaAudiencia
      tipos={tiposAudiencia}
      processoInicial={processoAud}
      publicacaoId={pub.id}
      valoresIniciais={{
        data: sugestao.data || '',
        hora: sugestao.hora || '',
        modalidade: /tele|video|semi/i.test(sugestao.modalidade || '') ? 'virtual' : 'presencial',
        observacoes: sugestao.descricao || '',
        vara_id: processoAud.vara_id ?? null,
      }}
      onTiposChange={carregarTiposAudiencia}
      onFechar={onFechar} />;
  }

  // "Criar compromisso" MANUAL (sem sugestão): abre o Novo Compromisso normal.
  return <ModalCompromisso
    usuarios={usuariosAgenda} usuarioLogadoId={usuarioLogadoId}
    ehAdmin={ehAdmin} publicacaoId={pub.id} onFechar={onFechar} />;
}

// Barra com os mesmos botões de ação do menu ⋮, para usar DENTRO da janela de leitura
// da publicação. Compartilhada pelas duas abas.
function BarraAcoesPublicacao({ pub, podeAgir, podeCriarPericia, podeAtribuir, onCriar, onTratar, onEmail, onAtribuir }) {
  if (!podeAgir && !podeCriarPericia && !podeAtribuir) return null;
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      {podeAgir && (
        <>
          <button className="btn btn-outline" onClick={() => onCriar('prazo', pub)}>📌 Criar prazo</button>
          <button className="btn btn-outline" onClick={() => onCriar('tarefa', pub)}>✓ Criar tarefa</button>
          <button className="btn btn-outline" onClick={() => onCriar('compromisso', pub)}>📅 Criar compromisso</button>
          <button className="btn btn-outline" onClick={() => onEmail(pub)}>📧 Enviar por e-mail</button>
        </>
      )}
      {podeAtribuir && (
        <button className="btn btn-outline" onClick={() => onAtribuir(pub)}>👤 Atribuir</button>
      )}
      {podeCriarPericia && (
        <span style={{ display: 'inline-flex' }}
          title={pub.processo_cadastrado ? undefined : 'Processo não está cadastrado !'}>
          <button className="btn btn-outline" disabled={!pub.processo_cadastrado}
            onClick={() => onCriar('pericia', pub)}>🔬 Criar perícia</button>
        </span>
      )}
      {/* Só pode marcar tratada com o processo cadastrado; Reabrir é sempre permitido.
          Quando não pode, o botão fica VISÍVEL porém desabilitado, com aviso no hover.
          (o <span> em volta garante o tooltip mesmo com o botão desabilitado) */}
      {podeAgir && (() => {
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

// Rótulo do botão de cada sugestão, por tipo de ação.
const ROTULO_SUGESTAO = {
  compromisso: '📅 Agendar audiência',
  pericia:     '🔬 Criar perícia',
  prazo:       '⏰ Criar prazo',
  tarefa:      '✓ Criar tarefa',
};

// Painel "Sugestão" DENTRO da janela de leitura da publicação. Lê o texto (função
// pura `analisarPublicacao`) e, para cada providência reconhecida (audiência,
// perícia, prazo ou tarefa), oferece um botão que abre o cadastro já preenchido.
// Nada é criado sozinho. Compartilhado pelas duas abas (AASP e CNJ).
// `trechosMostrar` (Set) + `onToggleMostrar(trecho)`: checkbox "mostrar na public."
// que liga/desliga o realce da origem da sugestão dentro do texto da publicação.
// `permissoesDestino`: { pericia, prazo, tarefa, audiencia } — se o usuário PODE CADASTRAR
// no módulo de destino de cada tipo de sugestão. Sem isso, o cartão oferecia "Criar perícia"
// (etc.) mesmo pra quem não tinha permissão lá, e o 403 só aparecia ao salvar (auditoria
// 02/09, item 13). "compromisso" (audiência à parte) não tem permissão própria — qualquer
// usuário logado já pode criar (mesma regra do botão "+ Novo compromisso" da Agenda).
function PainelSugestoes({ pub, sugestoes: sugestoesProp, iaHabilitada, onUsar, trechosMostrar, onToggleMostrar, permissoesDestino }) {
  const sugestoesInternas = useMemo(
    () => analisarPublicacao(textoLimpo(pub.texto), {
      dataPublicacao: pub.data_publicacao,
      numeroProcesso: pub.numero_processo,
      numeroPublicacao: pub.numero_publicacao,
    }),
    [pub],
  );
  const regras = sugestoesProp || sugestoesInternas;
  const [compromissosVinc, setCompromissosVinc] = useState([]); // já criados desta publicação
  const [confirmarDup, setConfirmarDup]         = useState(null); // sugestão aguardando "abrir mesmo assim?"
  const [sugestoesIa, setSugestoesIa]           = useState([]);
  const [consultandoIa, setConsultandoIa]       = useState(false);

  // IA como PLANO B: só consulta quando o escritório tem IA ligada E as regras
  // não acharam nada / nenhuma com confiança "alta". Falha na IA -> fica só as regras.
  const fraco = regras.length === 0 || !regras.some(s => s.confianca === 'alta');
  useEffect(() => {
    setSugestoesIa([]);
    if (!iaHabilitada || !fraco) { setConsultandoIa(false); return; }
    let vivo = true;
    setConsultandoIa(true);
    publicacoesAPI.sugestoesIa(pub.id)
      .then(({ data }) => { if (vivo && data.ok) setSugestoesIa(data.dados?.sugestoes || []); })
      .catch(() => {})
      .finally(() => { if (vivo) setConsultandoIa(false); });
    return () => { vivo = false; };
  }, [pub.id, iaHabilitada, fraco]);

  // Lista final = regras + IA (deduplicando por tipo+data).
  const sugestoes = [
    ...regras.map(s => ({ ...s, origem: s.origem || 'regra' })),
    ...sugestoesIa.filter(si => !regras.some(sr => sr.tipo === si.tipo && (sr.data || '') === (si.data || ''))),
  ];

  // Só consulta o histórico se houver sugestão (para o aviso de duplicidade).
  useEffect(() => {
    let vivo = true;
    if (regras.length) {
      publicacoesAPI.historico(pub.id)
        .then(({ data }) => { if (vivo && data.ok) setCompromissosVinc(data.dados?.acoes?.compromissos || []); })
        .catch(() => {});
    } else {
      setCompromissosVinc([]);
    }
    return () => { vivo = false; };
  }, [pub.id, regras.length]);

  if (!sugestoes.length) {
    return (
      <div style={{ marginTop: '12px', fontSize: '12px', color: '#94a3b8' }}>
        {consultandoIa
          ? '✨ Consultando IA…'
          : '✨ Nenhuma sugestão automática nesta publicação — use os botões de ação abaixo.'}
      </div>
    );
  }

  function acionar(sug) {
    // Aviso de duplicidade só para COMPROMISSO manual gerado de sugestão (não audiência,
    // que agora abre o módulo Audiências) — casa pela data.
    if (sug.tipo === 'compromisso' && sug.subtipo !== 'audiencia' && sug.data) {
      const dup = compromissosVinc.find(c => String(c.data).slice(0, 10) === sug.data);
      if (dup) { setConfirmarDup(sug); return; }
    }
    onUsar(sug);
  }

  // O usuário pode cadastrar no módulo de DESTINO desta sugestão? Sem `permissoesDestino`
  // (chamada antiga) não bloqueia nada, pra não quebrar quem ainda não passa a prop.
  function podeUsar(sug) {
    if (!permissoesDestino) return true;
    if (sug.tipo === 'pericia') return permissoesDestino.pericia !== false;
    if (sug.tipo === 'prazo') return permissoesDestino.prazo !== false;
    if (sug.tipo === 'tarefa') return permissoesDestino.tarefa !== false;
    if (sug.tipo === 'compromisso' && sug.subtipo === 'audiencia') return permissoesDestino.audiencia !== false;
    return true; // compromisso comum: sem permissão própria (igual ao botão da Agenda)
  }

  return (
    <div style={{ marginTop: '14px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px', letterSpacing: '0.5px' }}>
        ✨ SUGESTÃO
      </div>
      {sugestoes.map((sug, i) => (
        <div key={i} style={{ border: '1px solid #bae6fd', background: '#f0f9ff',
          borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#0c4a6e' }}>{sug.resumo}</span>
            <span style={{ fontSize: '11px', padding: '1px 8px', borderRadius: '10px', fontWeight: 700,
              background: sug.confianca === 'alta' ? '#dcfce7' : '#fef9c3',
              color: sug.confianca === 'alta' ? '#166534' : '#854d0e' }}>
              {sug.confianca === 'alta' ? 'Alta' : 'Conferir'}
            </span>
            <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '10px', fontWeight: 600,
              background: sug.origem === 'ia' ? '#ede9fe' : '#e2e8f0',
              color: sug.origem === 'ia' ? '#6d28d9' : '#475569' }}
              title={sug.origem === 'ia' ? 'Sugestão gerada por IA' : 'Sugestão gerada pelas regras internas'}>
              {sug.origem === 'ia' ? 'IA' : 'regra'}
            </span>
          </div>
          {sug.trechoOrigem && (
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '6px', fontStyle: 'italic',
              whiteSpace: 'pre-wrap', maxHeight: '80px', overflowY: 'auto' }}>
              “{sug.trechoOrigem}”
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
            <span style={{ display: 'inline-flex' }}
              title={podeUsar(sug) ? undefined : 'Você não tem permissão de cadastro neste módulo — peça a um administrador.'}>
              <button className="btn btn-primary" disabled={!podeUsar(sug)} onClick={() => acionar(sug)}>
                {ROTULO_SUGESTAO[sug.tipo] || 'Criar'}{sug.data ? ` — ${sug.dataBR}${sug.hora ? ' ' + sug.hora : ''}` : ''}
              </button>
            </span>
            {sug.trechoDestaque && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px',
                color: '#0c4a6e', cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox"
                  checked={!!trechosMostrar && trechosMostrar.has(sug.trechoDestaque)}
                  onChange={() => onToggleMostrar && onToggleMostrar(sug.trechoDestaque)} />
                mostrar na public.
              </label>
            )}
          </div>
        </div>
      ))}
      {consultandoIa && (
        <div style={{ fontSize: '12px', color: '#6d28d9', marginTop: '2px' }}>✨ Consultando IA…</div>
      )}
      {confirmarDup && (
        <div style={{ position: 'relative', zIndex: 2000 }}>
          <ModalConfirmar
            titulo="Já existe um compromisso desta publicação"
            tipo="aviso"
            mensagem={`Esta publicação já gerou um compromisso na mesma data (${confirmarDup.dataBR}). Deseja abrir o cadastro mesmo assim?`}
            textoBotao="Abrir mesmo assim"
            acao={async () => { const s = confirmarDup; setConfirmarDup(null); onUsar(s); }}
            onCancelar={() => setConfirmarDup(null)}
          />
        </div>
      )}
    </div>
  );
}

// Mini-modal: justificar a marcação MANUAL "Tratada / sem ação". O motivo é obrigatório
// (validação em faixa interna, nunca toast). Compartilhado pelas duas abas.
function ModalJustificarSemAcao({ pub, onFechar, onSucesso }) {
  const overlayRef = useEscFechar(onFechar); // ESC fecha esta janela (só quando é a de cima)
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
    <div className="modal-overlay" ref={overlayRef}>
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
  const overlayRef = useEscFechar(onFechar); // ESC fecha esta janela (só quando é a de cima)
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
    <div className="modal-overlay" style={{ zIndex: 1100 }} ref={overlayRef}>
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

function AvisoFalhaTratamento({ publicacao, onFechar }) {
  if (!publicacao) return null;
  const referencia = publicacao.numero_processo
    ? ` do processo ${publicacao.numero_processo}`
    : publicacao.numero_publicacao
      ? ` nº ${publicacao.numero_publicacao}`
      : '';

  return (
    <div className="card" role="alert"
      style={{ marginBottom: '16px', borderLeft: '4px solid #dc2626', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <p style={{ margin: 0, color: '#991b1b', fontSize: '14px', flex: 1 }}>
        ⚠️ A ação foi criada, mas a publicação{referencia} continua pendente porque não foi possível marcá-la
        automaticamente como tratada. Marque-a manualmente para concluir o atendimento.
      </p>
      <button type="button" className="btn btn-outline" onClick={onFechar}
        aria-label="Fechar aviso" style={{ flexShrink: 0 }}>
        Fechar
      </button>
    </div>
  );
}

export default function Publicacoes() {
  // Duas fontes, TELAS SEPARADAS: AASP e CNJ/DJEN. Cada aba é independente
  // (busca e listagem próprias). As ações de direcionar/tratar/histórico/excluir
  // são as mesmas por baixo (compartilhadas por id da publicação).
  const [aba, setAba] = useState('aasp');
  const [avisosTratamento, setAvisosTratamento] = useState({ aasp: null, cnj: null });

  function registrarFalhaTratamento(fonte, publicacao) {
    setAvisosTratamento(avisos => ({ ...avisos, [fonte]: publicacao }));
  }

  function limparFalhaTratamento(fonte, publicacaoId) {
    setAvisosTratamento(avisos => {
      const atual = avisos[fonte];
      if (publicacaoId && atual?.id !== publicacaoId) return avisos;
      return { ...avisos, [fonte]: null };
    });
  }

  return (
    <div>
      <div className="abas" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button className={'btn ' + (aba === 'aasp' ? 'btn-primary' : 'btn-outline')}
          onClick={() => setAba('aasp')}>AASP</button>
        <button className={'btn ' + (aba === 'cnj' ? 'btn-primary' : 'btn-outline')}
          onClick={() => setAba('cnj')}>CNJ / DJEN</button>
      </div>
      {aba === 'aasp' && <PublicacoesAASP
        avisoTratamento={avisosTratamento.aasp}
        onFalhaTratamento={(pub) => registrarFalhaTratamento('aasp', pub)}
        onLimparFalhaTratamento={(id) => limparFalhaTratamento('aasp', id)} />}
      {aba === 'cnj'  && <PublicacoesCNJ
        avisoTratamento={avisosTratamento.cnj}
        onFalhaTratamento={(pub) => registrarFalhaTratamento('cnj', pub)}
        onLimparFalhaTratamento={(id) => limparFalhaTratamento('cnj', id)} />}
    </div>
  );
}

// ------------------------------------------------------------
// Aba AASP
// ------------------------------------------------------------
function PublicacoesAASP({ avisoTratamento, onFalhaTratamento, onLimparFalhaTratamento }) {
  const { temPermissao, usuario, ehAdmin } = useAuth();
  const podeImportar = temPermissao('publicacoes', 'cadastrar');
  const podeAlterar  = temPermissao('publicacoes', 'alterar');
  const podeExcluir  = temPermissao('publicacoes', 'excluir');
  const podeCriarPericia = temPermissao('pericias', 'cadastrar');
  // Permissão de CADASTRO no módulo de destino de cada tipo de sugestão (item 13 da
  // auditoria 02/09) — o painel de sugestão passa a respeitar as mesmas regras que já
  // valem pro botão manual de cada módulo.
  const permissoesDestinoSugestao = {
    pericia: podeCriarPericia,
    prazo: temPermissao('prazos', 'cadastrar'),
    tarefa: temPermissao('tarefas', 'cadastrar'),
    audiencia: temPermissao('audiencias', 'cadastrar'),
  };

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
  const [iaHabilitada, setIaHabilitada]       = useState(false); // Sugestoes por IA ligadas neste escritorio?
  const [historicoAberto, setHistoricoAberto]   = useState(null);
  const [justificando, setJustificando]         = useState(null); // publicação aguardando justificativa de "sem ação"
  const [enviandoEmailPub, setEnviandoEmailPub] = useState(null); // publicação a enviar por e-mail
  const [atribuindoPub, setAtribuindoPub]       = useState(null); // publicação a atribuir a alguém
  const [buscaModal, setBuscaModal]             = useState(''); // pesquisa somente na publicação aberta
  // Trechos de origem das sugestões marcados p/ realçar no texto da publicação ("mostrar na public.").
  const [trechosSug, setTrechosSug]            = useState(() => new Set());
  const alvoDestaqueRef = useRef(null); // 1º <mark> destacado — para rolar até ele
  const primeiraBuscaRef = useRef(null); // 1ª ocorrência da pesquisa dentro do modal
  const textoModalRef = useRef(null); // área rolável do conteúdo da publicação
  const painelSugRef = useRef(null);   // wrapper do painel "Sugestão" — o atalho do cabeçalho rola até aqui
  // Sugestões da publicação aberta (calculadas uma vez; o painel reusa via prop).
  const sugestoesPub = useMemo(
    () => (textoAberto
      ? analisarPublicacao(textoLimpo(textoAberto.texto), {
          dataPublicacao: textoAberto.data_publicacao,
          numeroProcesso: textoAberto.numero_processo,
          numeroPublicacao: textoAberto.numero_publicacao,
        })
      : []),
    [textoAberto],
  );

  const totalBuscaModal = useMemo(
    () => contarOcorrencias(textoLimpo(textoAberto?.texto), buscaModal),
    [textoAberto?.texto, buscaModal],
  );

  // Ao trocar/fechar a publicação aberta, zera a pesquisa e os realces de sugestão.
  useEffect(() => { setBuscaModal(''); setTrechosSug(new Set()); }, [textoAberto?.id]);
  // A cada pesquisa, posiciona somente a área de texto na primeira ocorrência.
  useEffect(() => {
    if (!buscaModal.trim() || !primeiraBuscaRef.current || !textoModalRef.current) return;
    const area = textoModalRef.current, marca = primeiraBuscaRef.current;
    area.scrollTop += marca.getBoundingClientRect().top - area.getBoundingClientRect().top - 40;
  }, [buscaModal, totalBuscaModal]);
  // Ao (des)marcar um "mostrar na public.", rola o texto até o 1º trecho realçado.
  useEffect(() => {
    if (trechosSug.size && alvoDestaqueRef.current) {
      alvoDestaqueRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [trechosSug]);

  // Fecha a janela de leitura da publicação com a tecla Esc — só quando NÃO há outra
  // janela por cima (criar prazo/tarefa/compromisso/perícia, justificar "sem ação",
  // enviar por e-mail ou atribuir). Senão o ESC fecharia esta, que é a de trás.
  useEffect(() => {
    if (!textoAberto || acaoAberta || justificando || enviandoEmailPub || atribuindoPub) return;
    function handleKey(e) { if (e.key === 'Escape') setTextoAberto(null); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [textoAberto, acaoAberta, justificando, enviandoEmailPub, atribuindoPub]);
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
    publicacoesAPI.iaStatus()
      .then(({ data }) => { if (data.ok) setIaHabilitada(!!data.dados?.habilitada); })
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
      <AvisoFalhaTratamento publicacao={avisoTratamento}
        onFechar={() => onLimparFalhaTratamento()} />

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
                  // Fundo (não lida): branco na 1ª busca do dia, amarelo-claro da 2ª busca em diante
                  // (buscada_novamente, calculado no backend). Lida = sempre verde, não muda.
                  <tr key={p.id}
                    style={{ background: p.lida ? 'var(--linha-lida, #cdebd6)' : (p.buscada_novamente ? '#fff8db' : '#fff') }}>
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
                          oculto: !p.pode_agir,
                          onClick: () => setAcaoAberta({ tipo: 'prazo', pub: p }) },
                        { label: 'Criar tarefa', icone: '✓',
                          oculto: !p.pode_agir,
                          onClick: () => setAcaoAberta({ tipo: 'tarefa', pub: p }) },
                        { label: 'Criar compromisso', icone: '📅',
                          oculto: !p.pode_agir,
                          onClick: () => setAcaoAberta({ tipo: 'compromisso', pub: p }) },
                        { label: 'Criar perícia', icone: '🔬',
                          oculto: !podeCriarPericia || !p.processo_cadastrado,
                          onClick: () => setAcaoAberta({ tipo: 'pericia', pub: p }) },
                        { label: 'Enviar por e-mail', icone: '📧',
                          oculto: !p.pode_agir,
                          onClick: () => setEnviandoEmailPub(p) },
                        { label: 'Atribuir', icone: '👤',
                          oculto: !podeImportar,   // "Atribuir" é ação do BUSCADOR (permissão de baixar)
                          onClick: () => setAtribuindoPub(p) },
                        { label: p.tratada ? 'Reabrir' : 'Tratada / sem ação',
                          icone: p.tratada ? '↩️' : '✔️',
                          // Só pode marcar tratada com o processo cadastrado; Reabrir é sempre permitido.
                          oculto: !p.pode_agir || (!p.tratada && !p.processo_cadastrado),
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
              <div className="modal-header modal-publicacao-header">
                <h3>
                  Publicação — {formatarData(textoAberto.data_publicacao)}
                  {idx >= 0 && <span style={{ color: '#888', fontWeight: 'normal', fontSize: '13px' }}> ({idx + 1} de {lista.length})</span>}
                  {/* Polo do cliente do escritório no processo desta publicação (vem do cadastro
                      do processo, campo "Cliente do escritório"). Processo não cadastrado ou sem
                      o campo preenchido → não mostra nada. */}
                  {['autor', 'reu'].includes(textoAberto.cliente_polo) && (
                    <span style={{
                      marginLeft: '10px', padding: '2px 10px', borderRadius: '12px',
                      background: '#e0e7ff', border: '1px solid #a5b4fc', color: '#3730a3',
                      fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px', verticalAlign: 'middle',
                    }}>
                      {textoAberto.cliente_polo === 'autor' ? 'AUTOR' : 'RÉU'}
                    </span>
                  )}
                  {(podeAlterar || !!textoAberto.pode_agir) && sugestoesPub.length > 0 && (
                    <button type="button" title="Ir para as sugestões"
                      onClick={() => painelSugRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
                      style={{ marginLeft: '10px', padding: '2px 10px', borderRadius: '12px', cursor: 'pointer',
                        background: '#e0f2fe', border: '1px solid #7dd3fc', color: '#0369a1',
                        fontSize: '12px', fontWeight: 700, verticalAlign: 'middle' }}>
                      ✨ {sugestoesPub.length} sugest{sugestoesPub.length > 1 ? 'ões' : 'ão'}
                    </button>
                  )}
                </h3>
                <CampoBuscaPublicacao valor={buscaModal} onChange={setBuscaModal} total={totalBuscaModal} />
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
                {(textoAberto.atribuida_nomes || '').trim() && (
                  <div style={{ fontSize: '13px', color: '#3730a3', background: '#eef2ff',
                    border: '1px solid #c7d2fe', borderRadius: '6px', padding: '6px 10px', marginBottom: '12px' }}>
                    👤 Atribuída a: {textoAberto.atribuida_nomes}
                  </div>
                )}
                <div ref={textoModalRef} style={{
                  background: '#f8fafc', padding: '16px', borderRadius: '8px',
                  fontSize: '14px', lineHeight: '1.7', whiteSpace: 'pre-wrap', maxHeight: '420px', overflowY: 'auto',
                }}>
                  {realcarVarios(
                    textoLimpo(textoAberto.texto),
                    [
                      ...[...trechosSug].map(t => ({ termo: t, cor: '#bfdbfe', alvo: true })),
                      ...(buscaModal.trim() ? [{ termo: buscaModal, cor: '#fde047', ref: primeiraBuscaRef, prioridade: 10 }] : []),
                    ],
                    alvoDestaqueRef,
                  )}
                </div>
                <div ref={painelSugRef}>
                {(podeAlterar || !!textoAberto.pode_agir) && (
                  <PainelSugestoes pub={textoAberto} sugestoes={sugestoesPub} iaHabilitada={iaHabilitada}
                    permissoesDestino={permissoesDestinoSugestao}
                    trechosMostrar={trechosSug}
                    onToggleMostrar={(t) => setTrechosSug(s =>
                      s.has(t) ? new Set() : new Set([t]) // só UM realce por vez — o último clicado prevalece
                    )}
                    onUsar={(sug) => setAcaoAberta({ tipo: sug.tipo, pub: textoAberto, sugestao: sug })} />
                )}
                </div>
              </div>
              <div className="modal-footer">
                <BarraAcoesPublicacao pub={textoAberto}
                  podeAgir={podeAlterar || !!textoAberto.pode_agir}
                  podeCriarPericia={podeCriarPericia}
                  podeAtribuir={podeImportar}
                  onCriar={(tipo, p) => setAcaoAberta({ tipo, pub: p })}
                  onTratar={(p) => alternarTratada(p)}
                  onEmail={(p) => setEnviandoEmailPub(p)}
                  onAtribuir={(p) => setAtribuindoPub(p)} />
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
              // A ação (prazo/tarefa/audiência/perícia) JÁ FOI CRIADA nesse ponto — se marcar
              // como tratada falhar, avisa (não pode sumir silenciosamente, senão a publicação
              // fica pendente pra sempre sem ninguém saber o motivo — auditoria 02/09, item 4).
              if (pub.processo_cadastrado) {
                try {
                  await publicacoesAPI.tratar(pub.id, { tratada: true });
                  onLimparFalhaTratamento(pub.id);
                } catch {
                  onFalhaTratamento(pub);
                }
              }
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
          onSucesso={() => {
            onLimparFalhaTratamento(justificando.id);
            setJustificando(null);
            toast.success('Publicação marcada como tratada');
            carregar();
          }} />
      )}
      {enviandoEmailPub && (
        <ModalEnviarPublicacaoEmail pub={enviandoEmailPub}
          onFechar={() => setEnviandoEmailPub(null)}
          onSucesso={() => setEnviandoEmailPub(null)} />
      )}
      {atribuindoPub && (
        <ModalAtribuir publicacao={atribuindoPub}
          onFechar={() => setAtribuindoPub(null)}
          onSucesso={(msg) => { setAtribuindoPub(null); setTextoAberto(null); toast.success(msg || 'Atribuição atualizada'); carregar(); }} />
      )}

      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

// ------------------------------------------------------------
// Aba CNJ / DJEN (Diário de Justiça Eletrônico Nacional)
// Tela separada da AASP. Busca por PERÍODO, usando as OABs cadastradas em
// Configurações → Integrações → CNJ. Direcionamento manual (igual à AASP).
// Reaproveita os modais ModalAtribuir/ModalHistorico e o helper realcarTexto.
// ------------------------------------------------------------
// Base para baixar a certidão oficial (PDF) de uma comunicação do CNJ.
const CNJ_CERTIDAO_BASE = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';

function PublicacoesCNJ({ avisoTratamento, onFalhaTratamento, onLimparFalhaTratamento }) {
  const { temPermissao, usuario, ehAdmin } = useAuth();
  const podeImportar = temPermissao('publicacoes', 'cadastrar');
  const podeAlterar  = temPermissao('publicacoes', 'alterar');
  const podeExcluir  = temPermissao('publicacoes', 'excluir');
  const podeCriarPericia = temPermissao('pericias', 'cadastrar');
  // Permissão de CADASTRO no módulo de destino de cada tipo de sugestão (item 13 da
  // auditoria 02/09) — o painel de sugestão passa a respeitar as mesmas regras que já
  // valem pro botão manual de cada módulo.
  const permissoesDestinoSugestao = {
    pericia: podeCriarPericia,
    prazo: temPermissao('prazos', 'cadastrar'),
    tarefa: temPermissao('tarefas', 'cadastrar'),
    audiencia: temPermissao('audiencias', 'cadastrar'),
  };

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
  const [iaHabilitada, setIaHabilitada]       = useState(false); // Sugestoes por IA ligadas neste escritorio?
  const [historicoAberto, setHistoricoAberto]   = useState(null);
  const [justificando, setJustificando]         = useState(null); // publicação aguardando justificativa de "sem ação"
  const [enviandoEmailPub, setEnviandoEmailPub] = useState(null); // publicação a enviar por e-mail
  const [atribuindoPub, setAtribuindoPub]       = useState(null); // publicação a atribuir a alguém
  const [buscaModal, setBuscaModal]             = useState(''); // pesquisa somente na publicação aberta
  // Trechos de origem das sugestões marcados p/ realçar no texto da publicação ("mostrar na public.").
  const [trechosSug, setTrechosSug]            = useState(() => new Set());
  const alvoDestaqueRef = useRef(null); // 1º <mark> destacado — para rolar até ele
  const primeiraBuscaRef = useRef(null); // 1ª ocorrência da pesquisa dentro do modal
  const textoModalRef = useRef(null); // área rolável do conteúdo da publicação
  const painelSugRef = useRef(null);   // wrapper do painel "Sugestão" — o atalho do cabeçalho rola até aqui
  // Sugestões da publicação aberta (calculadas uma vez; o painel reusa via prop).
  const sugestoesPub = useMemo(
    () => (textoAberto
      ? analisarPublicacao(textoLimpo(textoAberto.texto), {
          dataPublicacao: textoAberto.data_publicacao,
          numeroProcesso: textoAberto.numero_processo,
          numeroPublicacao: textoAberto.numero_publicacao,
        })
      : []),
    [textoAberto],
  );

  const totalBuscaModal = useMemo(
    () => contarOcorrencias(textoLimpo(textoAberto?.texto), buscaModal),
    [textoAberto?.texto, buscaModal],
  );

  // Ao trocar/fechar a publicação aberta, zera a pesquisa e os realces de sugestão.
  useEffect(() => { setBuscaModal(''); setTrechosSug(new Set()); }, [textoAberto?.id]);
  // A cada pesquisa, posiciona somente a área de texto na primeira ocorrência.
  useEffect(() => {
    if (!buscaModal.trim() || !primeiraBuscaRef.current || !textoModalRef.current) return;
    const area = textoModalRef.current, marca = primeiraBuscaRef.current;
    area.scrollTop += marca.getBoundingClientRect().top - area.getBoundingClientRect().top - 40;
  }, [buscaModal, totalBuscaModal]);
  // Ao (des)marcar um "mostrar na public.", rola o texto até o 1º trecho realçado.
  useEffect(() => {
    if (trechosSug.size && alvoDestaqueRef.current) {
      alvoDestaqueRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [trechosSug]);

  // Fecha a janela de leitura da publicação com a tecla Esc — só quando NÃO há outra
  // janela por cima (criar prazo/tarefa/compromisso/perícia, justificar "sem ação",
  // enviar por e-mail ou atribuir). Senão o ESC fecharia esta, que é a de trás.
  useEffect(() => {
    if (!textoAberto || acaoAberta || justificando || enviandoEmailPub || atribuindoPub) return;
    function handleKey(e) { if (e.key === 'Escape') setTextoAberto(null); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [textoAberto, acaoAberta, justificando, enviandoEmailPub, atribuindoPub]);
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
    publicacoesAPI.iaStatus()
      .then(({ data }) => { if (data.ok) setIaHabilitada(!!data.dados?.habilitada); })
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
      <AvisoFalhaTratamento publicacao={avisoTratamento}
        onFechar={() => onLimparFalhaTratamento()} />

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
                          oculto: !p.pode_agir,
                          onClick: () => setAcaoAberta({ tipo: 'prazo', pub: p }) },
                        { label: 'Criar tarefa', icone: '✓',
                          oculto: !p.pode_agir,
                          onClick: () => setAcaoAberta({ tipo: 'tarefa', pub: p }) },
                        { label: 'Criar compromisso', icone: '📅',
                          oculto: !p.pode_agir,
                          onClick: () => setAcaoAberta({ tipo: 'compromisso', pub: p }) },
                        { label: 'Criar perícia', icone: '🔬',
                          oculto: !podeCriarPericia || !p.processo_cadastrado,
                          onClick: () => setAcaoAberta({ tipo: 'pericia', pub: p }) },
                        { label: 'Enviar por e-mail', icone: '📧',
                          oculto: !p.pode_agir,
                          onClick: () => setEnviandoEmailPub(p) },
                        { label: 'Atribuir', icone: '👤',
                          oculto: !podeImportar,   // "Atribuir" é ação do BUSCADOR (permissão de baixar)
                          onClick: () => setAtribuindoPub(p) },
                        { label: p.tratada ? 'Reabrir' : 'Tratada / sem ação',
                          icone: p.tratada ? '↩️' : '✔️',
                          // Só pode marcar tratada com o processo cadastrado; Reabrir é sempre permitido.
                          oculto: !p.pode_agir || (!p.tratada && !p.processo_cadastrado),
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
              <div className="modal-header modal-publicacao-header">
                <h3>
                  Publicação — {formatarData(textoAberto.data_publicacao)}
                  {idx >= 0 && <span style={{ color: '#888', fontWeight: 'normal', fontSize: '13px' }}> ({idx + 1} de {lista.length})</span>}
                  {/* Polo do cliente do escritório no processo desta publicação (vem do cadastro
                      do processo, campo "Cliente do escritório"). Processo não cadastrado ou sem
                      o campo preenchido → não mostra nada. */}
                  {['autor', 'reu'].includes(textoAberto.cliente_polo) && (
                    <span style={{
                      marginLeft: '10px', padding: '2px 10px', borderRadius: '12px',
                      background: '#e0e7ff', border: '1px solid #a5b4fc', color: '#3730a3',
                      fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px', verticalAlign: 'middle',
                    }}>
                      {textoAberto.cliente_polo === 'autor' ? 'AUTOR' : 'RÉU'}
                    </span>
                  )}
                  {(podeAlterar || !!textoAberto.pode_agir) && sugestoesPub.length > 0 && (
                    <button type="button" title="Ir para as sugestões"
                      onClick={() => painelSugRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
                      style={{ marginLeft: '10px', padding: '2px 10px', borderRadius: '12px', cursor: 'pointer',
                        background: '#e0f2fe', border: '1px solid #7dd3fc', color: '#0369a1',
                        fontSize: '12px', fontWeight: 700, verticalAlign: 'middle' }}>
                      ✨ {sugestoesPub.length} sugest{sugestoesPub.length > 1 ? 'ões' : 'ão'}
                    </button>
                  )}
                </h3>
                <CampoBuscaPublicacao valor={buscaModal} onChange={setBuscaModal} total={totalBuscaModal} />
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
                {(textoAberto.atribuida_nomes || '').trim() && (
                  <div style={{ fontSize: '13px', color: '#3730a3', background: '#eef2ff',
                    border: '1px solid #c7d2fe', borderRadius: '6px', padding: '6px 10px', marginBottom: '12px' }}>
                    👤 Atribuída a: {textoAberto.atribuida_nomes}
                  </div>
                )}
                <div ref={textoModalRef} style={{
                  background: '#f8fafc', padding: '16px', borderRadius: '8px',
                  fontSize: '14px', lineHeight: '1.7', whiteSpace: 'pre-wrap', maxHeight: '420px', overflowY: 'auto',
                }}>
                  {realcarVarios(
                    textoLimpo(textoAberto.texto),
                    [
                      ...[...trechosSug].map(t => ({ termo: t, cor: '#bfdbfe', alvo: true })),
                      ...(buscaModal.trim() ? [{ termo: buscaModal, cor: '#fde047', ref: primeiraBuscaRef, prioridade: 10 }] : []),
                    ],
                    alvoDestaqueRef,
                  )}
                </div>
                <div ref={painelSugRef}>
                {(podeAlterar || !!textoAberto.pode_agir) && (
                  <PainelSugestoes pub={textoAberto} sugestoes={sugestoesPub} iaHabilitada={iaHabilitada}
                    permissoesDestino={permissoesDestinoSugestao}
                    trechosMostrar={trechosSug}
                    onToggleMostrar={(t) => setTrechosSug(s =>
                      s.has(t) ? new Set() : new Set([t]) // só UM realce por vez — o último clicado prevalece
                    )}
                    onUsar={(sug) => setAcaoAberta({ tipo: sug.tipo, pub: textoAberto, sugestao: sug })} />
                )}
                </div>
              </div>
              <div className="modal-footer">
                <BarraAcoesPublicacao pub={textoAberto}
                  podeAgir={podeAlterar || !!textoAberto.pode_agir}
                  podeCriarPericia={podeCriarPericia}
                  podeAtribuir={podeImportar}
                  onCriar={(tipo, p) => setAcaoAberta({ tipo, pub: p })}
                  onTratar={(p) => alternarTratada(p)}
                  onEmail={(p) => setEnviandoEmailPub(p)}
                  onAtribuir={(p) => setAtribuindoPub(p)} />
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
              // A ação (prazo/tarefa/audiência/perícia) JÁ FOI CRIADA nesse ponto — se marcar
              // como tratada falhar, avisa (não pode sumir silenciosamente, senão a publicação
              // fica pendente pra sempre sem ninguém saber o motivo — auditoria 02/09, item 4).
              if (pub.processo_cadastrado) {
                try {
                  await publicacoesAPI.tratar(pub.id, { tratada: true });
                  onLimparFalhaTratamento(pub.id);
                } catch {
                  onFalhaTratamento(pub);
                }
              }
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
          onSucesso={() => {
            onLimparFalhaTratamento(justificando.id);
            setJustificando(null);
            toast.success('Publicação marcada como tratada');
            carregar();
          }} />
      )}
      {enviandoEmailPub && (
        <ModalEnviarPublicacaoEmail pub={enviandoEmailPub}
          onFechar={() => setEnviandoEmailPub(null)}
          onSucesso={() => setEnviandoEmailPub(null)} />
      )}
      {atribuindoPub && (
        <ModalAtribuir publicacao={atribuindoPub}
          onFechar={() => setAtribuindoPub(null)}
          onSucesso={(msg) => { setAtribuindoPub(null); setTextoAberto(null); toast.success(msg || 'Atribuição atualizada'); carregar(); }} />
      )}

      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

// ------------------------------------------------------------
// Modal: gerenciar QUEM fica com a publicação (só o BUSCADOR usa).
// Abre com os já atribuídos MARCADOS. Marcar = adicionar; desmarcar = remover.
// Quem JÁ TRATOU aparece travado (não dá para remover). Ao salvar, manda a lista
// COMPLETA para o backend, que aplica a diferença. Se não sobrar ninguém, a
// publicação volta a pendente para o buscador.
// Validação em faixa interna (nunca toast). Compartilhado pelas duas abas.
// ------------------------------------------------------------
function ModalAtribuir({ publicacao, onFechar, onSucesso }) {
  const overlayRef = useEscFechar(onFechar); // ESC fecha esta janela (só quando é a de cima)
  const [usuarios, setUsuarios]     = useState([]);      // todos os usuários (checklist)
  const [atuais, setAtuais]         = useState([]);      // [{usuario_id, nome, tratada}]
  const [marcados, setMarcados]     = useState(() => new Set());
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando]     = useState(false);
  const [aviso, setAviso]           = useState('');

  useEffect(() => {
    Promise.all([publicacoesAPI.usuarios(), publicacoesAPI.atribuicoes(publicacao.id)])
      .then(([u, a]) => {
        setUsuarios((u.data.ok && u.data.dados) || []);
        const at = (a.data.ok && a.data.dados) || [];
        setAtuais(at);
        setMarcados(new Set(at.map(x => x.usuario_id))); // começa com os já atribuídos marcados
      })
      .catch(() => setAviso('Não foi possível carregar. Tente novamente.'))
      .finally(() => setCarregando(false));
  }, [publicacao.id]);

  // usuario_id -> já tratou? (esses ficam travados: não dá para desmarcar)
  const tratouPorId = new Map(atuais.map(a => [a.usuario_id, !!a.tratada]));

  function toggle(id) {
    if (tratouPorId.get(id)) return; // já tratou → travado
    setMarcados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function salvar() {
    setSalvando(true); setAviso('');
    try {
      const { data } = await publicacoesAPI.atribuir(publicacao.id, { usuario_ids: [...marcados] });
      onSucesso(data.mensagem);
    } catch (err) {
      setAviso(err.response?.data?.mensagem || 'Não foi possível salvar. Tente novamente.');
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} ref={overlayRef}>
      <div className="modal-box">
        <div className="modal-header">
          <h3>Atribuir publicação</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {aviso && (
            <div style={{ background: '#fff4e5', border: '1px solid #ffcf99', color: '#8a5300',
              padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '12px' }}>
              {aviso}
            </div>
          )}
          <p style={{ fontSize: '13px', color: '#555', marginTop: 0 }}>
            Marque quem deve receber a publicação. Quem sair da lista deixa de vê-la
            (e é avisado). Quem <strong>já tratou</strong> fica travado. Se não sobrar
            ninguém, a publicação volta para você como pendente.
          </p>
          <div className="form-group">
            <label className="form-label">Pessoas</label>
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', maxHeight: '260px', overflowY: 'auto', padding: '6px' }}>
              {carregando
                ? <span style={{ fontSize: '12px', color: '#9ca3af' }}>Carregando...</span>
                : usuarios.length === 0
                  ? <span style={{ fontSize: '12px', color: '#9ca3af' }}>Nenhum usuário disponível.</span>
                  : usuarios.map(u => {
                    const tratou = tratouPorId.get(u.id);
                    return (
                      <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '4px 2px', cursor: tratou ? 'not-allowed' : 'pointer', opacity: tratou ? 0.75 : 1 }}>
                        <input type="checkbox" checked={marcados.has(u.id)} disabled={tratou}
                          onChange={() => toggle(u.id)} />
                        <span style={{ fontSize: '13px' }}>
                          {u.nome}
                          {tratou && <span style={{ color: '#15803d', marginLeft: '6px' }}>✓ já tratou — não pode remover</span>}
                        </span>
                      </label>
                    );
                  })}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando || carregando}>
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
  const overlayRef = useEscFechar(onFechar); // ESC fecha esta janela (só quando é a de cima)
  const [dados, setDados] = useState(null);

  useEffect(() => {
    publicacoesAPI.historico(publicacao.id)
      .then(({ data }) => { if (data.ok) setDados(data.dados); })
      .catch(() => toast.error('Erro ao carregar histórico'));
  }, [publicacao.id]);

  function dataHora(d) {
    return formatarDataHora(d);
  }

  return (
    <div className="modal-overlay" ref={overlayRef}>
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
                <strong>Atribuída a:</strong>{' '}
                {Array.isArray(dados.atribuicoes) && dados.atribuicoes.length
                  ? (
                    <ul style={{ margin: '4px 0 0', paddingLeft: '18px', lineHeight: '1.7' }}>
                      {dados.atribuicoes.map((a, i) => (
                        <li key={i}>
                          👤 {a.nome} — {a.tratada ? 'tratada' : 'pendente'}
                          {a.tratada && a.tratada_em && (
                            <span style={{ color: '#888' }}> em {dataHora(a.tratada_em)}</span>
                          )}
                          {a.atribuida_por_nome && (
                            <span style={{ color: '#888' }}> · atribuída por {a.atribuida_por_nome} em {dataHora(a.atribuida_em)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )
                  : ' ninguém'}
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
                const { prazos = [], tarefas = [], compromissos = [], audiencias = [] } = dados.acoes;
                const total = prazos.length + tarefas.length + compromissos.length + audiencias.length;
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
                        {audiencias.map(a => (
                          <li key={'a' + a.id}>⚖️ Audiência: {formatarData(a.data)}{a.hora ? ` ${String(a.hora).slice(0, 5)}` : ''}
                            {a.processo_numero ? ` · proc. ${a.processo_numero}` : ''}
                            {a.status && a.status !== 'agendada' ? ` (${a.status})` : ''}
                            <span style={{ color: '#1a56db' }}> · 👤 {a.direcionado_nome || 'Escritório'}</span></li>
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
