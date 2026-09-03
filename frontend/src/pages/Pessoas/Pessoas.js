// ============================================================
// PÁGINA DE PESSOAS — Lista e cadastro de PF e PJ
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { pessoasAPI } from '../../services/api';
import { formatarCPF, formatarCNPJ, formatarTelefone, formatarData, formatarDataHora, hojeLocal, mascaraCPF, validarCPF, mascaraCNPJ, validarCNPJ, toTitleCase } from '../../utils/formatters';
import { toast } from 'react-toastify';
import GerarDocumentoPartesBotao from '../../components/GerarDocumentoPartes';
import MenuAcoes from '../../components/MenuAcoes';
import { useAuth } from '../../context/AuthContext';
import NumeroProcessoCopiavel from '../../components/NumeroProcessoCopiavel';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import { LinhaFone, LinhaEmail } from '../../components/LinhasContato';
import { EtiquetaCelula, LegendaEtiquetasPessoais, useEtiquetasEscritorio, itemEtiquetaEscritorioSubmenu, ModalHistoricoEtiquetaEscritorio } from '../../components/Etiquetas';
import { linkWhatsApp } from '../../utils/whatsapp';
import ModalCadastroRapidoParte from '../../components/ModalCadastroRapidoParte';
import useEscFechar from '../../hooks/useEscFechar';

// Campos disponíveis para exportar em Excel (mesmas chaves do backend; sem campos de auditoria)
const CAMPOS_EXPORT_FISICA = [
  { key: 'nome', label: 'Nome' }, { key: 'cpf', label: 'CPF' }, { key: 'rg', label: 'RG' },
  { key: 'rg_orgao', label: 'Órgão RG' }, { key: 'pis', label: 'PIS' },
  { key: 'ctps_numero', label: 'CTPS Nº' }, { key: 'ctps_serie', label: 'CTPS Série' },
  { key: 'nome_pai', label: 'Nome do pai' }, { key: 'nome_mae', label: 'Nome da mãe' },
  { key: 'data_nascimento', label: 'Data de nascimento' }, { key: 'estado_civil', label: 'Estado civil' },
  { key: 'profissao', label: 'Profissão' }, { key: 'genero', label: 'Gênero' },
  { key: 'nacionalidade', label: 'Nacionalidade' },
  { key: 'cep', label: 'CEP' }, { key: 'logradouro', label: 'Logradouro' }, { key: 'numero', label: 'Número' },
  { key: 'complemento', label: 'Complemento' }, { key: 'bairro', label: 'Bairro' }, { key: 'cidade', label: 'Cidade' },
  { key: 'estado', label: 'UF' }, { key: 'telefone', label: 'Telefone' }, { key: 'email', label: 'E-mail' },
  { key: 'observacoes', label: 'Observações' },
];
const CAMPOS_EXPORT_JURIDICA = [
  { key: 'razao_social', label: 'Razão social' }, { key: 'nome_fantasia', label: 'Nome fantasia' },
  { key: 'cnpj', label: 'CNPJ' }, { key: 'inscricao_estadual', label: 'Inscrição estadual' },
  { key: 'cep', label: 'CEP' }, { key: 'logradouro', label: 'Logradouro' }, { key: 'numero', label: 'Número' },
  { key: 'complemento', label: 'Complemento' }, { key: 'bairro', label: 'Bairro' }, { key: 'cidade', label: 'Cidade' },
  { key: 'estado', label: 'UF' }, { key: 'telefone', label: 'Telefone' }, { key: 'email', label: 'E-mail' },
  { key: 'observacoes', label: 'Observações' },
];

export default function Pessoas() {
  const { ehAdmin, temPermissao } = useAuth(); // admin e superadmin (nível <= 1) — controla o botão de unificar
  const [aba, setAba]             = useState('fisicas'); // 'fisicas' | 'juridicas'
  const [lista, setLista]         = useState([]);
  // Etiqueta DO ESCRITÓRIO em Pessoas (catálogo único "pessoas"; PF e PJ gravam em tabelas próprias).
  const moduloMarcarPessoa = aba === 'fisicas' ? 'pessoas_fisicas' : 'pessoas_juridicas';
  const { catalogo: catEscritorio, marcar: marcarEtqEsc } = useEtiquetasEscritorio('pessoas', moduloMarcarPessoa, lista, setLista);
  const podeEtiquetarPessoa = temPermissao('pessoas.etiqueta_escritorio', 'alterar');
  const [historicoEtiquetaAberto, setHistoricoEtiquetaAberto] = useState(null); // { modulo, registroId } | null
  const [filtroEsc, setFiltroEsc] = useState(null); // filtro pela etiqueta do escritório (slot)
  const [total, setTotal]         = useState(0);
  const [busca, setBusca]         = useState('');       // termo já aplicado (usado na consulta)
  const [buscaInput, setBuscaInput] = useState('');     // texto digitado na caixa (instantâneo)
  const [pagina, setPagina]       = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [pessoaSelecionada, setPessoaSelecionada] = useState(null);
  const [modalLeitura, setModalLeitura] = useState(false); // abre o form travado (só ver) ao clicar no nome
  const [confirmarExclusao, setConfirmarExclusao] = useState(null); // { id, nome } da pessoa a excluir
  const [excluindo, setExcluindo] = useState(false);
  const [modalExport, setModalExport] = useState(false);   // modal de seleção de campos p/ exportar
  const [camposExport, setCamposExport] = useState({});    // { chave: true/false }
  const [exportando, setExportando] = useState(false);
  // Unificação de empresas duplicadas (só na aba Jurídicas)
  const [modoUnificar, setModoUnificar]   = useState(false);
  const [selUnificar, setSelUnificar]     = useState([]);   // objetos PJ marcados
  const [modalUnificar, setModalUnificar] = useState(false);

  const LIMITE = 20;

  // Janela com a lista de processos de uma pessoa (ao clicar na "Qtde Proc")
  const [verProcessosDe, setVerProcessosDe] = useState(null); // { pessoa, tipo }
  function abrirProcessos(pessoa) { setVerProcessosDe({ pessoa, tipo: aba }); }

  const [verAnotacoesDe, setVerAnotacoesDe] = useState(null); // { pessoa, tipo } — Anotações de atendimento
  function abrirAnotacoes(pessoa) { setVerAnotacoesDe({ pessoa, tipo: aba }); }

  // "Enviar Email" e "Enviar WhatsApp" do menu ⋮ — os contatos são buscados só ao clicar (sob demanda).
  const [enviarEmailDe, setEnviarEmailDe] = useState(null); // { pessoa, emails: [] }  — janela de envio de e-mail
  const [enviarSmsDe, setEnviarSmsDe]     = useState(null); // { pessoa, telefones: [] } — janela de envio de SMS
  const [smsAtivo, setSmsAtivo]           = useState(false); // integração Comtele (SMS) ativa?
  const [escolherZapDe, setEscolherZapDe] = useState(null); // { pessoa, telefones: [] } — janela de escolha (só com 2+ telefones)

  // Abre um número no WhatsApp (wa.me). O 55 (Brasil) é adicionado pela função linkWhatsApp quando falta.
  // ctx (opcional) = { pessoa, tipo } → registra no log "usuário abriu zap para a pessoa".
  function abrirZap(numero, ctx) {
    const link = linkWhatsApp(numero);
    if (!link) { toast.error('Telefone inválido para o WhatsApp'); return; }
    window.open(link, '_blank', 'noopener');
    if (ctx?.pessoa) {
      const tipo_pessoa = ctx.tipo === 'juridicas' ? 'juridica' : 'fisica';
      pessoasAPI.registrarZap({ telefone: numero, tipo_pessoa, pessoa_id: ctx.pessoa.id }).catch(() => {});
    }
  }

  // "Enviar WhatsApp": busca os telefones da pessoa; 1 abre direto, vários abrem a janela de escolha.
  async function abrirEnviarZap(pessoa) {
    try {
      const fn = aba === 'fisicas' ? pessoasAPI.buscarFisica : pessoasAPI.buscarJuridica;
      const { data } = await fn(pessoa.id);
      const telefones = (data.dados?.telefones || []).filter(t => t.ativo !== 0).map(t => t.numero).filter(Boolean);
      if (telefones.length === 0) { toast.info('Esta pessoa não tem telefone cadastrado'); return; }
      if (telefones.length === 1) { abrirZap(telefones[0], { pessoa, tipo: aba }); return; }
      setEscolherZapDe({ pessoa, telefones });
    } catch { toast.error('Erro ao buscar os telefones da pessoa'); }
  }

  // "Enviar Email": busca os e-mails da pessoa; se não houver, avisa; senão abre a janela de envio.
  async function abrirEnviarEmail(pessoa) {
    try {
      const fn = aba === 'fisicas' ? pessoasAPI.buscarFisica : pessoasAPI.buscarJuridica;
      const { data } = await fn(pessoa.id);
      const emails = (data.dados?.emails || []).filter(e => e.ativo !== 0).map(e => e.email).filter(Boolean);
      if (emails.length === 0) { toast.info('Esta pessoa não tem e-mail cadastrado'); return; }
      setEnviarEmailDe({ pessoa, emails, tipo: aba });
    } catch { toast.error('Erro ao buscar os e-mails da pessoa'); }
  }

  // "Enviar SMS": busca os telefones da pessoa; se não houver, avisa; senão abre a janela de envio.
  async function abrirEnviarSMS(pessoa) {
    try {
      const fn = aba === 'fisicas' ? pessoasAPI.buscarFisica : pessoasAPI.buscarJuridica;
      const { data } = await fn(pessoa.id);
      const telefones = (data.dados?.telefones || []).filter(t => t.ativo !== 0).map(t => t.numero).filter(Boolean);
      if (telefones.length === 0) { toast.info('Esta pessoa não tem telefone cadastrado'); return; }
      setEnviarSmsDe({ pessoa, telefones, tipo: aba });
    } catch { toast.error('Erro ao buscar os telefones da pessoa'); }
  }

  // "Copiar telefone" (do TelefoneCopiavel): a pessoa tem mais de um telefone → abre o modal de escolha.
  const [copiarTelDe, setCopiarTelDe] = useState(null); // { pessoa, telefones: [] }
  function abrirCopiarMultiplos(pessoa, telefones) { setCopiarTelDe({ pessoa, telefones }); }

  // "Copiar e-mail" (do EmailCopiavel): a pessoa tem mais de um e-mail → abre o modal de escolha.
  const [copiarEmailDe, setCopiarEmailDe] = useState(null); // { pessoa, emails: [] }
  function abrirCopiarEmailMultiplos(pessoa, emails) { setCopiarEmailDe({ pessoa, emails }); }

  // Sai do modo de unificação e limpa a seleção
  function sairModoUnificar() { setModoUnificar(false); setSelUnificar([]); }

  // Marca/desmarca um cadastro na seleção de unificação
  function toggleSelUnificar(p) {
    setSelUnificar(prev => prev.some(x => x.id === p.id)
      ? prev.filter(x => x.id !== p.id)
      : [...prev, p]);
  }

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const fn = aba === 'fisicas' ? pessoasAPI.listarFisicas : pessoasAPI.listarJuridicas;
      const { data } = await fn({ busca, pagina, limite: LIMITE, etiquetaEscritorio: filtroEsc || undefined });
      if (data.ok) {
        setLista(data.dados.registros);
        setTotal(data.dados.total);
      }
    } catch { toast.error('Erro ao carregar pessoas'); }
    finally { setCarregando(false); }
  }, [aba, busca, pagina, filtroEsc]);

  useEffect(() => { carregar(); }, [carregar]);

  // Descobre se o envio de SMS está ativo (para mostrar/ocultar o item "Enviar SMS" no menu).
  useEffect(() => { pessoasAPI.smsAtivo().then(r => setSmsAtivo(!!r.data?.dados?.ativo)).catch(() => {}); }, []);

  // Debounce da busca: consulta só 350ms após parar de digitar (evita 1 consulta por tecla)
  useEffect(() => {
    const t = setTimeout(() => { setBusca(buscaInput); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [buscaInput]);

  function abrirNovoCadastro() { setPessoaSelecionada(null); setModalLeitura(false); setModalAberto(true); }
  function abrirEdicao(pessoa) { setPessoaSelecionada(pessoa); setModalLeitura(false); setModalAberto(true); }
  // Clique no nome: abre o mesmo form, porém travado (só visualização) com botão "Editar".
  function abrirDetalhes(pessoa) { setPessoaSelecionada(pessoa); setModalLeitura(true); setModalAberto(true); }

  // Abre o modal de confirmação de exclusão
  function pedirConfirmacaoExclusao(pessoa) {
    const nome = pessoa.nome || pessoa.razao_social;
    setConfirmarExclusao({ id: pessoa.id, nome });
  }

  // Executa a exclusão após confirmação — bloqueada pelo backend se houver vínculos
  async function confirmarEExcluir() {
    if (!confirmarExclusao) return;
    setExcluindo(true);
    try {
      const fn = aba === 'fisicas' ? pessoasAPI.excluirFisica : pessoasAPI.excluirJuridica;
      await fn(confirmarExclusao.id);
      toast.success('Pessoa excluída com sucesso');
      setConfirmarExclusao(null);
      carregar();
    } catch (err) {
      // Exibe a mensagem específica retornada pelo backend (ex: "possui 2 pasta(s) de processo")
      const mensagem = err.response?.data?.mensagem || 'Erro ao excluir pessoa';
      toast.error(mensagem);
      setConfirmarExclusao(null); // Fecha o modal mesmo no bloqueio
    } finally {
      setExcluindo(false);
    }
  }

  function fecharModal(recarregar, pessoaParaEditar = null) {
    setModalAberto(false);
    if (pessoaParaEditar) {
      // CPF duplicado: fecha o form de cadastro e abre o form de edição da pessoa encontrada
      // Pequeno delay para o React processar o fechamento antes de reabrir
      setTimeout(() => {
        setPessoaSelecionada(pessoaParaEditar);
        setModalLeitura(false);
        setModalAberto(true);
      }, 50);
    } else if (recarregar) {
      carregar();
    }
  }

  // Limpa a caixa de busca e volta para a primeira página
  function limparBusca() { setBuscaInput(''); setBusca(''); setPagina(1); }

  // Abre o modal de exportação com apenas o "Nome" (ou "Razão social") marcado por padrão
  function abrirExport() {
    const chaveNome = aba === 'fisicas' ? 'nome' : 'razao_social';
    setCamposExport({ [chaveNome]: true });
    setModalExport(true);
  }

  // Liga/desliga um campo no modal de exportação
  function toggleCampo(key) {
    setCamposExport(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // Gera e baixa o Excel da busca atual (ou de tudo, se não houver busca)
  async function exportar() {
    const campos = Object.keys(camposExport).filter(k => camposExport[k]);
    if (!campos.length) { toast.error('Selecione ao menos um campo'); return; }
    setExportando(true);
    try {
      const fn = aba === 'fisicas' ? pessoasAPI.exportarFisicas : pessoasAPI.exportarJuridicas;
      const resp = await fn({ busca, campos: campos.join(',') });
      // Monta o download a partir do arquivo retornado (mesmo padrão do Financeiro)
      const url = URL.createObjectURL(new Blob([resp.data], { type: resp.headers['content-type'] }));
      const cd = resp.headers['content-disposition'] || '';
      const m = cd.match(/filename="(.+?)"/);
      const link = document.createElement('a');
      link.href = url;
      link.download = m ? m[1] : 'Pessoas.xlsx';
      link.click();
      URL.revokeObjectURL(url);
      setModalExport(false);
    } catch { toast.error('Erro ao exportar'); }
    finally { setExportando(false); }
  }

  const totalPaginas = Math.ceil(total / LIMITE);

  return (
    <div>
      {/* Abas */}
      <div className="abas" style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
        <button className={`btn ${aba==='fisicas'?'btn-primary':'btn-outline'}`} onClick={() => { setAba('fisicas'); setPagina(1); sairModoUnificar(); }}>
          Pessoas Físicas
        </button>
        <button className={`btn ${aba==='juridicas'?'btn-primary':'btn-outline'}`} onClick={() => { setAba('juridicas'); setPagina(1); sairModoUnificar(); }}>
          Pessoas Jurídicas
        </button>
      </div>

      <div className="card">
        {/* Barra de ações */}
        <div style={{display:'flex',gap:'12px',marginBottom:'16px',alignItems:'center',flexWrap:'wrap'}}>
          <input
            className="form-control" style={{maxWidth:'300px'}}
            placeholder={aba==='fisicas' ? 'Buscar por nome, CPF, RG, PIS, telefone, endereço...' : 'Buscar por razão social, CNPJ, telefone, endereço...'}
            value={buscaInput}
            onChange={e => setBuscaInput(e.target.value)}
          />
          {/* Limpar pesquisa — só aparece quando há algo digitado na busca */}
          {buscaInput && (
            <button className="btn btn-outline" onClick={limparBusca}>Limpar pesquisa</button>
          )}
          <button className="btn btn-primary" onClick={abrirNovoCadastro}>
            + {aba==='fisicas' ? 'Nova Pessoa Física' : 'Nova Pessoa Jurídica'}
          </button>
          {/* Gera documento que usa várias pessoas (autores × réus); só aparece com permissão de documentos */}
          <GerarDocumentoPartesBotao />
          {/* Exporta a busca atual (ou tudo) para Excel — abre modal para escolher os campos */}
          <button className="btn btn-outline" onClick={abrirExport}>Exportar Excel</button>
          {/* Unificar cadastros duplicados — nas duas abas (física e jurídica), só para admin/superadmin */}
          {ehAdmin && !modoUnificar && (
            <button className="btn btn-outline" onClick={() => setModoUnificar(true)}>
              Unificar duplicadas
            </button>
          )}
          {modoUnificar && (
            <>
              <span style={{fontSize:'13px',color:'#555'}}>{selUnificar.length} selecionado(s)</span>
              <button className="btn btn-primary" disabled={selUnificar.length < 2}
                onClick={() => setModalUnificar(true)}>
                Continuar →
              </button>
              <button className="btn btn-outline" onClick={sairModoUnificar}>Cancelar</button>
            </>
          )}
          <span style={{marginLeft:'auto',color:'#888',fontSize:'13px'}}>{total} registro(s)</span>
        </div>

        {/* Tabela */}
        <LegendaEtiquetasPessoais definicoes={catEscritorio} titulo="Etiquetas do escritório"
          filtroAtivo={filtroEsc} onFiltrar={(slot) => { setFiltroEsc(slot); setPagina(1); }} />
        {carregando ? <div className="loading">Carregando...</div> : (
          <div className="tabela-wrapper" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            {aba === 'fisicas' ? (
              <TabelaFisicas lista={lista} onEditar={abrirEdicao} onVerDetalhes={abrirDetalhes} onExcluir={pedirConfirmacaoExclusao}
                onVerProcessos={abrirProcessos} onAnotacoes={abrirAnotacoes}
                onEnviarEmail={abrirEnviarEmail} onEnviarZap={abrirEnviarZap} onEnviarSMS={abrirEnviarSMS} smsAtivo={smsAtivo}
                onCopiarMultiplos={abrirCopiarMultiplos} onCopiarEmailMultiplos={abrirCopiarEmailMultiplos}
                catEscritorio={catEscritorio} podeEtiquetar={podeEtiquetarPessoa} onEtiquetar={marcarEtqEsc}
                modulo={moduloMarcarPessoa} onAbrirHistorico={setHistoricoEtiquetaAberto}
                modoUnificar={modoUnificar} selecionados={selUnificar} onToggleSel={toggleSelUnificar} />
            ) : (
              <TabelaJuridicas lista={lista} onEditar={abrirEdicao} onVerDetalhes={abrirDetalhes} onExcluir={pedirConfirmacaoExclusao}
                onVerProcessos={abrirProcessos} onAnotacoes={abrirAnotacoes}
                onEnviarEmail={abrirEnviarEmail} onEnviarZap={abrirEnviarZap} onCopiarMultiplos={abrirCopiarMultiplos} onCopiarEmailMultiplos={abrirCopiarEmailMultiplos}
                catEscritorio={catEscritorio} podeEtiquetar={podeEtiquetarPessoa} onEtiquetar={marcarEtqEsc}
                modulo={moduloMarcarPessoa} onAbrirHistorico={setHistoricoEtiquetaAberto}
                modoUnificar={modoUnificar} selecionados={selUnificar} onToggleSel={toggleSelUnificar} />
            )}
            {lista.length === 0 && <p className="lista-vazia">Nenhum registro encontrado</p>}
          </div>
        )}

        {historicoEtiquetaAberto && (
          <ModalHistoricoEtiquetaEscritorio
            modulo={historicoEtiquetaAberto.modulo}
            registroId={historicoEtiquetaAberto.registroId}
            catalogo={catEscritorio}
            onFechar={() => setHistoricoEtiquetaAberto(null)}
          />
        )}

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div style={{display:'flex',gap:'8px',marginTop:'16px',justifyContent:'center'}}>
            <button className="btn btn-outline" disabled={pagina===1} onClick={() => setPagina(p=>p-1)}>← Anterior</button>
            <span style={{padding:'8px 12px',fontSize:'13px'}}>Página {pagina} de {totalPaginas}</span>
            <button className="btn btn-outline" disabled={pagina===totalPaginas} onClick={() => setPagina(p=>p+1)}>Próxima →</button>
          </div>
        )}
      </div>

      {/* Modal de cadastro/edição */}
      {modalAberto && (
        <ModalPessoa
          tipo={aba}
          pessoa={pessoaSelecionada}
          somenteLeitura={modalLeitura}
          onFechar={fecharModal}
          onAbrirEdicao={(p) => fecharModal(false, p)}
        />
      )}

      {/* Janela com a lista de processos da pessoa (clicou na Qtde Proc) */}
      {verProcessosDe && (
        <ModalProcessosDaPessoa
          pessoa={verProcessosDe.pessoa}
          tipo={verProcessosDe.tipo}
          onFechar={() => setVerProcessosDe(null)}
        />
      )}

      {/* Janela de Anotações de atendimento da pessoa (item do menu ⋮) */}
      {verAnotacoesDe && (
        <ModalAnotacoes
          pessoa={verAnotacoesDe.pessoa}
          tipo={verAnotacoesDe.tipo}
          onFechar={() => setVerAnotacoesDe(null)}
        />
      )}

      {/* Janela "Enviar Email" (item do menu ⋮) */}
      {enviarEmailDe && (
        <ModalEnviarEmail
          pessoa={enviarEmailDe.pessoa}
          emails={enviarEmailDe.emails}
          tipo={enviarEmailDe.tipo}
          onFechar={() => setEnviarEmailDe(null)}
        />
      )}

      {/* Janela "Enviar SMS" (item do menu ⋮ — Pessoas Físicas) */}
      {enviarSmsDe && (
        <ModalEnviarSMS
          pessoa={enviarSmsDe.pessoa}
          telefones={enviarSmsDe.telefones}
          tipo={enviarSmsDe.tipo}
          onFechar={() => setEnviarSmsDe(null)}
        />
      )}

      {/* Janela "Enviar WhatsApp" — só aparece quando a pessoa tem mais de um telefone */}
      {escolherZapDe && (
        <ModalEscolherWhatsapp
          pessoa={escolherZapDe.pessoa}
          telefones={escolherZapDe.telefones}
          onEscolher={(numero) => { const p = escolherZapDe.pessoa; setEscolherZapDe(null); abrirZap(numero, { pessoa: p, tipo: aba }); }}
          onFechar={() => setEscolherZapDe(null)}
        />
      )}

      {/* Janela "Copiar telefone" — só aparece quando a pessoa tem mais de um telefone */}
      {copiarTelDe && (
        <ModalCopiarTelefone
          pessoa={copiarTelDe.pessoa}
          telefones={copiarTelDe.telefones}
          onFechar={() => setCopiarTelDe(null)}
        />
      )}

      {/* Janela "Copiar e-mail" — só aparece quando a pessoa tem mais de um e-mail */}
      {copiarEmailDe && (
        <ModalCopiarEmail
          pessoa={copiarEmailDe.pessoa}
          emails={copiarEmailDe.emails}
          onFechar={() => setCopiarEmailDe(null)}
        />
      )}

      {/* Modal de unificação de cadastros duplicados (física ou jurídica) */}
      {modalUnificar && (
        <ModalUnificarPessoas
          tipo={aba}
          selecionados={selUnificar}
          onFechar={(reload) => {
            setModalUnificar(false);
            if (reload) { sairModoUnificar(); carregar(); }
          }}
        />
      )}

      {/* Modal de confirmação de exclusão */}
      {confirmarExclusao && (
        <div className="modal-overlay">
          <div className="modal" style={{maxWidth:'420px'}}>
            <h3 style={{marginBottom:'12px'}}>Confirmar exclusão</h3>
            <p style={{marginBottom:'20px',color:'#555',lineHeight:'1.5'}}>
              Tem certeza que deseja excluir <strong>{confirmarExclusao.nome}</strong>?
              <br />
              <span style={{fontSize:'12px',color:'#888'}}>
                O registro ficará inativo e não aparecerá mais nas listagens.
              </span>
            </p>
            <div style={{display:'flex',gap:'12px',justifyContent:'flex-end'}}>
              <button className="btn btn-outline" onClick={() => setConfirmarExclusao(null)} disabled={excluindo}>
                Cancelar
              </button>
              <button
                className="btn"
                style={{background:'#dc3545',color:'#fff',border:'none'}}
                onClick={confirmarEExcluir}
                disabled={excluindo}
              >
                {excluindo ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de exportação para Excel — escolher os campos */}
      {modalExport && (
        <div className="modal-overlay">
          <div className="modal-box" style={{maxWidth:'520px'}}>
            <div className="modal-header">
              <h3>Exportar para Excel</h3>
              <button className="modal-fechar" onClick={() => setModalExport(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{margin:'0 0 14px',fontSize:'13px',color:'#666'}}>
                Marque os campos que quer no arquivo. {busca ? 'Será exportada a busca atual.' : 'Será exportada a lista inteira.'}
              </p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:'8px 16px'}}>
                {(aba === 'fisicas' ? CAMPOS_EXPORT_FISICA : CAMPOS_EXPORT_JURIDICA).map(c => (
                  <label key={c.key} style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'14px',cursor:'pointer'}}>
                    <input type="checkbox" checked={!!camposExport[c.key]} onChange={() => toggleCampo(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setModalExport(false)} disabled={exportando}>Cancelar</button>
              <button className="btn btn-primary" onClick={exportar} disabled={exportando}>
                {exportando ? 'Gerando...' : 'Exportar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tabela de pessoas físicas
// ============================================================
// MODAL — Processos de uma pessoa (abre ao clicar na "Qtde Proc")
// Lista os processos (autor + réu, sem repetir) com o número copiável.
// ============================================================
function ModalProcessosDaPessoa({ pessoa, tipo, onFechar }) {
  const [lista, setLista]         = useState([]);
  const [carregando, setCarregando] = useState(true);
  const nomePessoa = pessoa.nome || pessoa.razao_social || 'Pessoa';

  useEffect(() => {
    let ativo = true;
    pessoasAPI.processosDaPessoa(tipo, pessoa.id)
      .then(r => { if (ativo && r.data.ok) setLista(r.data.dados); })
      .catch(() => toast.error('Erro ao carregar os processos'))
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [tipo, pessoa.id]);

  // Fecha com Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onFechar(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onFechar]);

  // Monta o rótulo "vara / fórum" preferindo a abreviação, tratando vazios
  function varaForum(p) {
    const vara  = p.vara_abrev_nome  || p.vara_nome  || '';
    const forum = p.forum_abrev_nome || p.forum_nome || '';
    const txt = [vara, forum].filter(Boolean).join(' / ');
    return txt || '—';
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>Processos — {nomePessoa}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {carregando ? (
            <p style={{color:'#888',textAlign:'center',padding:'20px'}}>Carregando...</p>
          ) : lista.length === 0 ? (
            <p className="lista-vazia">Nenhum processo encontrado</p>
          ) : (
            <>
              <p style={{fontSize:'13px',color:'#666',margin:'0 0 10px'}}>
                {lista.length} processo(s). Clique no número para copiar.
              </p>
              <div className="tabela-wrapper" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <table className="tabela tabela-sticky">
                  <thead>
                    <tr>
                      <th>Nº do Processo</th><th>Pasta</th><th>Título</th>
                      <th>Status</th><th>Tipo</th><th>Vara / Fórum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map(p => (
                      <tr key={p.id}>
                        <td><NumeroProcessoCopiavel numero={p.numProc} /></td>
                        <td>{p.pasta_numero_fmt || '—'}</td>
                        <td>{p.titulo || '—'}</td>
                        <td>{p.status_nome ? <span className="badge badge-cinza">{p.status_nome}</span> : '—'}</td>
                        <td>{p.tipo_nome ? <span className="badge badge-azul">{p.tipo_nome}</span> : '—'}</td>
                        <td style={{fontSize:'12px'}}>{varaForum(p)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL "Anotações de atendimento" — histórico de contatos da pessoa (PF ou PJ).
// Qualquer usuário logado registra; a lista mostra autor + data/hora, mais recente em cima.
// Editar/excluir: usuário comum só a PRÓPRIA anotação e só de hoje; admin qualquer uma.
// O backend é a autoridade da regra — aqui só escondemos botões e confirmamos ações.
// ============================================================
export function ModalAnotacoes({ pessoa, tipo, onFechar }) {
  const { usuario, ehAdmin } = useAuth();
  const [lista, setLista]           = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [novoTexto, setNovoTexto]   = useState('');
  const [salvando, setSalvando]     = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [editTexto, setEditTexto]   = useState('');
  const [ajuda, setAjuda]           = useState(false);
  const [confirmar, setConfirmar]   = useState(null);

  const tipoPessoa = tipo === 'juridicas' ? 'juridica' : 'fisica';
  const nomePessoa = pessoa.nome || pessoa.razao_social || 'Pessoa';

  const carregar = useCallback(() => {
    setCarregando(true);
    const req = tipo === 'juridicas'
      ? pessoasAPI.buscarJuridica(pessoa.id)
      : pessoasAPI.buscarFisica(pessoa.id);
    return req
      .then(r => { if (r.data.ok) setLista(r.data.dados.historico || []); })
      .catch(() => toast.error('Erro ao carregar as anotações'))
      .finally(() => setCarregando(false));
  }, [tipo, pessoa.id]);

  useEffect(() => { carregar(); }, [carregar]);

  // Fecha com Escape (não fecha o modal de fundo enquanto a confirmação estiver aberta)
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !confirmar) onFechar(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onFechar, confirmar]);

  // "Hoje" aqui serve só para MOSTRAR/esconder os botões; quem decide de verdade é o servidor.
  function ehDeHoje(criadoEm) {
    if (!criadoEm) return false;
    const d = new Date(criadoEm);
    if (isNaN(d.getTime())) return false;
    const fmt = (x) => x.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    return fmt(d) === fmt(new Date());
  }
  function podeMexer(nota) {
    return ehAdmin || (Number(nota.usuario_id) === Number(usuario?.id) && ehDeHoje(nota.criado_em));
  }

  async function adicionar() {
    const texto = novoTexto.trim();
    if (!texto) return;
    setSalvando(true);
    try {
      await pessoasAPI.adicionarHistorico(tipo, pessoa.id, { descricao: texto, tipo_pessoa: tipoPessoa });
      setNovoTexto('');
      await carregar();
      toast.success('Anotação registrada');
    } catch (e) {
      toast.error(e.response?.data?.mensagem || 'Erro ao registrar a anotação');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(nota) { setEditandoId(nota.id); setEditTexto(nota.descricao); }
  function cancelarEdicao()    { setEditandoId(null); setEditTexto(''); }

  async function gravarEdicao(nota) {
    await pessoasAPI.editarHistorico(nota.id, { descricao: editTexto.trim() });
    cancelarEdicao();
    await carregar();
    toast.success('Anotação atualizada');
  }
  function salvarEdicao(nota) {
    if (!editTexto.trim()) { toast.error('A anotação não pode ficar em branco'); return; }
    // Admin mexendo em anotação de outro dia ou de outro usuário → confirma antes.
    const precisaConfirmar = ehAdmin && !(Number(nota.usuario_id) === Number(usuario?.id) && ehDeHoje(nota.criado_em));
    if (precisaConfirmar) {
      setConfirmar({
        titulo: 'Editar anotação',
        mensagem: 'Você está alterando uma anotação de outro dia ou de outro usuário. Deseja continuar?',
        textoBotao: 'Salvar', tipo: 'aviso',
        acao: () => gravarEdicao(nota),
      });
    } else {
      gravarEdicao(nota).catch(e => toast.error(e.response?.data?.mensagem || 'Erro ao salvar a anotação'));
    }
  }

  function pedirExcluir(nota) {
    setConfirmar({
      titulo: 'Excluir anotação',
      mensagem: 'Esta anotação será excluída definitivamente. Esta ação não tem volta.',
      textoBotao: 'Excluir', tipo: 'perigo',
      acao: async () => {
        await pessoasAPI.excluirHistorico(nota.id);
        await carregar();
        toast.success('Anotação excluída');
      },
    });
  }

  const btnAcao = { background:'none', border:'none', cursor:'pointer', fontSize:'12px', padding:0, textDecoration:'underline' };

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3 style={{display:'flex',alignItems:'center',gap:'8px'}}>
            Anotações de atendimento — {nomePessoa}
            <button type="button" onClick={() => setAjuda(a => !a)}
              title="Anote aqui informações referentes ao atendimento realizado."
              aria-label="Ajuda sobre as anotações de atendimento"
              style={{width:'20px',height:'20px',borderRadius:'50%',border:'1px solid #bbb',
                      background:'#f3f3f3',color:'#555',fontSize:'12px',cursor:'pointer',lineHeight:1,padding:0}}>?</button>
          </h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {ajuda && (
            <p style={{background:'#eef4ff',border:'1px solid #cfe0ff',borderRadius:'6px',
                       padding:'8px 12px',fontSize:'13px',color:'#33518a',margin:'0 0 12px'}}>
              Anote aqui informações referentes ao atendimento realizado.
            </p>
          )}

          {/* Caixa para registrar uma nova anotação */}
          <div style={{marginBottom:'16px'}}>
            <textarea value={novoTexto} onChange={e => setNovoTexto(e.target.value)}
              placeholder="Escreva o que foi tratado neste atendimento..."
              rows={3} style={{width:'100%',resize:'vertical',padding:'8px',fontSize:'14px',
                               border:'1px solid #ccc',borderRadius:'6px',boxSizing:'border-box'}} />
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:'8px'}}>
              <button className="btn btn-primary" onClick={adicionar} disabled={salvando || !novoTexto.trim()}>
                {salvando ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
          </div>

          {/* Lista de anotações — mais recente em cima */}
          {carregando ? (
            <p style={{color:'#888',textAlign:'center',padding:'20px'}}>Carregando...</p>
          ) : lista.length === 0 ? (
            <p className="lista-vazia">Nenhuma anotação registrada ainda</p>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'10px',maxHeight:'50vh',overflowY:'auto'}}>
              {lista.map(nota => (
                <div key={nota.id} style={{border:'1px solid #eee',borderRadius:'8px',padding:'10px 12px',background:'#fafafa'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px',gap:'8px'}}>
                    <span style={{fontSize:'14px',color:'#333'}}>
                      <strong style={{color:'#111',fontWeight:700}}>{nota.usuario_nome || '—'}</strong>
                      <span style={{color:'#333'}}> · {formatarDataHora(nota.criado_em)}</span>
                    </span>
                    {podeMexer(nota) && editandoId !== nota.id && (
                      <span style={{display:'flex',gap:'10px',flexShrink:0}}>
                        <button onClick={() => iniciarEdicao(nota)} style={{...btnAcao,color:'#1a56db'}}>Editar</button>
                        <button onClick={() => pedirExcluir(nota)} style={{...btnAcao,color:'#dc3545'}}>Excluir</button>
                      </span>
                    )}
                  </div>
                  {editandoId === nota.id ? (
                    <div>
                      <textarea value={editTexto} onChange={e => setEditTexto(e.target.value)} rows={3}
                        style={{width:'100%',resize:'vertical',padding:'8px',fontSize:'14px',border:'1px solid #ccc',borderRadius:'6px',boxSizing:'border-box'}} />
                      <div style={{display:'flex',justifyContent:'flex-end',gap:'8px',marginTop:'6px'}}>
                        <button className="btn btn-outline" onClick={cancelarEdicao}>Cancelar</button>
                        <button className="btn btn-primary" onClick={() => salvarEdicao(nota)}>Salvar</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{fontSize:'14px',color:'#333',whiteSpace:'pre-wrap',lineHeight:1.5}}>{nota.descricao}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>

      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

// ============================================================
// MODAL "Enviar Email" — mensagem avulsa digitada na hora + anexos opcionais do PC.
// Escolhe o e-mail (o principal já vem selecionado quando há mais de um), assunto e
// mensagem, pode anexar um ou mais arquivos (até 20 MB somando tudo) e envia pelo SMTP
// do escritório. Antes de enviar, mostra um aviso: o sistema registra que o envio ocorreu,
// mas NÃO guarda cópia do e-mail nem dos anexos.
// ============================================================
const LIMITE_TOTAL_ANEXOS = 20 * 1024 * 1024; // 20 MB somando todos os anexos (teto do Gmail)
// Lista branca de anexos: o Gmail bloqueia executáveis (.bat/.exe/.js...), então só
// deixamos passar tipos seguros e comuns. Mesma lista é validada no backend.
const ANEXOS_PERMITIDOS = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
const MSG_TIPO_INVALIDO = 'Tipo de arquivo não permitido. Aceita somente PDF, DOC, DOCX, JPG, JPEG ou PNG.';
const extDe = (nome) => String(nome || '').split('.').pop().toLowerCase();
const fmtTamanho = (b) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

// ============================================================
// MODAL "Enviar SMS" (Comtele) — só Pessoas Físicas. Escolhe o telefone,
// escreve a mensagem (com contador de caracteres/segmentos) e confirma o envio
// (custa crédito). O backend valida o DDD e loga em log_comunicacoes.
// ============================================================
export function ModalEnviarSMS({ pessoa, telefones, tipo, onFechar }) {
  const nomePessoa = pessoa.nome || pessoa.razao_social || 'Pessoa';
  const [numero, setNumero]       = useState(telefones[0] || ''); // número cru (com DDD)
  const [mensagem, setMensagem]   = useState('');
  const [enviando, setEnviando]   = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso]         = useState('');

  // Esc: se estiver no passo de confirmação, volta; senão fecha o modal.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape' || enviando) return;
      if (confirmar) setConfirmar(false); else onFechar();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onFechar, enviando, confirmar]);

  const len = mensagem.trim().length;
  const segmentos = len === 0 ? 0 : Math.ceil(len / 160);

  function pedirConfirmacao() {
    if (!numero)          { setAviso('Selecione um telefone.'); return; }
    if (!mensagem.trim()) { setAviso('Escreva a mensagem do SMS.'); return; }
    setAviso('');
    setConfirmar(true);
  }

  async function enviar() {
    setConfirmar(false);
    setEnviando(true);
    try {
      const tipo_pessoa = tipo === 'juridicas' ? 'juridica' : 'fisica';
      await pessoasAPI.enviarSMS({ numero, mensagem: mensagem.trim(), tipo_pessoa, pessoa_id: pessoa.id });
      toast.success('SMS enviado com sucesso');
      onFechar();
    } catch (e) {
      setAviso(e.response?.data?.mensagem || 'Não foi possível enviar o SMS.');
    } finally {
      setEnviando(false);
    }
  }

  const rotulo = { display:'block', fontSize:'13px', color:'#555', margin:'0 0 4px' };
  const campo  = { width:'100%', padding:'8px', fontSize:'14px', border:'1px solid #ccc', borderRadius:'6px', boxSizing:'border-box', marginBottom:'12px' };

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Enviar SMS — {nomePessoa}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {aviso && (
            <div style={{ background:'#fff4e5', border:'1px solid #ffcf99', color:'#8a5300',
              padding:'8px 12px', borderRadius:'6px', fontSize:'13px', marginBottom:'12px' }}>
              {aviso}
            </div>
          )}

          <label style={rotulo}>Telefone</label>
          {telefones.length > 1 ? (
            <select style={campo} value={numero} onChange={e => setNumero(e.target.value)}>
              {telefones.map((t, i) => <option key={i} value={t}>{formatarTelefone(t)}</option>)}
            </select>
          ) : (
            <input style={campo} value={formatarTelefone(numero)} disabled />
          )}

          <label style={rotulo}>Mensagem</label>
          <textarea style={{ ...campo, resize:'vertical', minHeight:'90px' }}
            value={mensagem} onChange={e => setMensagem(e.target.value)}
            placeholder="Escreva o SMS..." />
          <small style={{ color: segmentos > 1 ? '#c0392b' : '#888', fontSize:'12px' }}>
            {len} caractere(s){segmentos > 1
              ? ` — ${segmentos} SMS (cada 160 caracteres = 1 crédito)`
              : ' — 1 SMS (até 160 caracteres = 1 crédito)'}
          </small>

          {confirmar && (
            <div style={{ marginTop:'12px', background:'#eef4ff', border:'1px solid #c5d0e6',
              padding:'10px 12px', borderRadius:'6px', fontSize:'13px' }}>
              Enviar SMS para <strong>{formatarTelefone(numero)}</strong>? Isso consome crédito da conta Comtele configurada.
            </div>
          )}
        </div>
        <div className="modal-footer">
          {confirmar ? (
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmar(false)} disabled={enviando}>Voltar</button>
              <button className="btn btn-primary" onClick={enviar} disabled={enviando}>
                {enviando ? 'Enviando...' : 'Confirmar envio'}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
              <button className="btn btn-primary" onClick={pedirConfirmacao} disabled={enviando}>Enviar SMS</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ModalEnviarEmail({ pessoa, emails, tipo, onFechar }) {
  const nomePessoa = pessoa.nome || pessoa.razao_social || 'Pessoa';
  const [para, setPara]         = useState(emails[0] || ''); // principal (emails vêm ordenados: principal primeiro)
  const [assunto, setAssunto]   = useState('');
  const [mensagem, setMensagem] = useState('');
  const [anexos, setAnexos]     = useState([]);    // File[] escolhidos do PC
  const [mostrarAviso, setMostrarAviso] = useState(false); // janela de confirmação antes do envio
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso]       = useState('');    // faixa de aviso DENTRO do modal (substitui o toast do canto)

  // Fecha com Escape: se o aviso estiver aberto, fecha só o aviso; senão fecha o modal.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape' || enviando) return;
      if (mostrarAviso) setMostrarAviso(false);
      else onFechar();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onFechar, enviando, mostrarAviso]);

  // Adiciona arquivos escolhidos, validando o total (20 MB). Limpa o input para
  // permitir reescolher o mesmo arquivo depois de remover.
  function adicionarArquivos(fileList, inputEl) {
    const novos = Array.from(fileList || []);
    if (!novos.length) return;
    // Lista branca de tipos (evita o bloqueio do Gmail a executáveis).
    if (novos.some(f => !ANEXOS_PERMITIDOS.includes(extDe(f.name)))) {
      setAviso(MSG_TIPO_INVALIDO);
      if (inputEl) inputEl.value = '';
      return;
    }
    const juntos = [...anexos, ...novos];
    const total = juntos.reduce((s, f) => s + f.size, 0);
    if (total > LIMITE_TOTAL_ANEXOS) {
      setAviso(`Os anexos somariam ${fmtTamanho(total)}. O limite total é 20 MB (limite do Gmail). Remova ou troque algum arquivo.`);
    } else {
      setAnexos(juntos);
      setAviso('');
    }
    if (inputEl) inputEl.value = '';
  }
  function removerArquivo(idx) {
    setAnexos(anexos.filter((_, i) => i !== idx));
    setAviso('');
  }

  // Passo 1: valida os campos e abre o aviso (a confirmação de envio).
  function abrirAviso() {
    if (!assunto.trim())  { setAviso('Informe o assunto do e-mail.'); return; }
    if (!mensagem.trim()) { setAviso('Escreva a mensagem do e-mail.'); return; }
    setAviso('');
    setMostrarAviso(true);
  }

  // Passo 2: envia de verdade (após o usuário confirmar no aviso).
  async function enviar() {
    setMostrarAviso(false);
    setEnviando(true);
    try {
      const tipo_pessoa = tipo === 'juridicas' ? 'juridica' : 'fisica';
      const fd = new FormData();
      fd.append('para', para);
      fd.append('assunto', assunto.trim());
      fd.append('mensagem', mensagem.trim());
      fd.append('tipo_pessoa', tipo_pessoa);
      fd.append('pessoa_id', pessoa.id);
      anexos.forEach(f => fd.append('anexos', f, f.name));
      await pessoasAPI.enviarEmail(fd);
      toast.success('E-mail enviado com sucesso');
      onFechar();
    } catch (e) {
      setAviso(e.response?.data?.mensagem || 'Não foi possível enviar o e-mail.');
    } finally {
      setEnviando(false);
    }
  }

  const rotulo = { display:'block', fontSize:'13px', color:'#555', margin:'0 0 4px' };
  const campo  = { width:'100%', padding:'8px', fontSize:'14px', border:'1px solid #ccc', borderRadius:'6px', boxSizing:'border-box', marginBottom:'12px' };

  return (
    <>
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Enviar e-mail — {nomePessoa}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {/* Faixa de aviso do próprio sistema (no lugar da notificação do canto) */}
          {aviso && (
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', color:'#b91c1c',
              borderRadius:'6px', padding:'8px 10px', marginBottom:'12px', fontSize:'13px',
              display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px' }}>
              <span>⚠️ {aviso}</span>
              <button type="button" onClick={() => setAviso('')}
                style={{ background:'none', border:'none', color:'#b91c1c', cursor:'pointer', fontSize:'15px', lineHeight:1 }}
                title="Fechar">✕</button>
            </div>
          )}

          {/* Destinatário: se houver mais de um e-mail, permite escolher; o principal já vem selecionado */}
          <label style={rotulo}>Para</label>
          {emails.length > 1 ? (
            <select value={para} onChange={e => setPara(e.target.value)} style={campo}>
              {emails.map((em, i) => <option key={i} value={em}>{em}</option>)}
            </select>
          ) : (
            <div style={{...campo, background:'#f5f5f5', color:'#333'}}>{para}</div>
          )}

          <label style={rotulo}>Assunto</label>
          <input value={assunto} onChange={e => setAssunto(e.target.value)} maxLength={200}
            placeholder="Assunto do e-mail" style={campo} />

          <label style={rotulo}>Mensagem</label>
          <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={7}
            placeholder="Escreva a mensagem..."
            style={{...campo, resize:'vertical'}} />

          {/* Anexos do PC (opcional) — até 20 MB somando tudo */}
          <label style={rotulo}>Anexos (opcional)</label>
          <div style={{ marginBottom: '4px' }}>
            <label className="btn btn-outline" style={{ fontSize:'13px', padding:'6px 12px', cursor:'pointer', display:'inline-block' }}>
              📎 Escolher arquivos
              <input type="file" multiple style={{ display:'none' }}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={e => adicionarArquivos(e.target.files, e.target)} />
            </label>
            <span style={{ fontSize:'12px', color:'#888', marginLeft:'8px' }}>Até 20 MB no total</span>
          </div>
          {anexos.length > 0 && (
            <ul style={{ listStyle:'none', margin:'6px 0 0', padding:0 }}>
              {anexos.map((f, i) => (
                <li key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  fontSize:'13px', color:'#333', background:'#f5f7fa', border:'1px solid #e2e8f0',
                  borderRadius:'6px', padding:'6px 8px', marginBottom:'4px' }}>
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    📄 {f.name} <span style={{ color:'#888' }}>({fmtTamanho(f.size)})</span>
                  </span>
                  <button type="button" onClick={() => removerArquivo(i)} disabled={enviando}
                    style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:'16px', lineHeight:1, marginLeft:'8px' }}
                    title="Remover">✕</button>
                </li>
              ))}
              <li style={{ fontSize:'12px', color:'#666', marginTop:'2px' }}>
                Total: {fmtTamanho(anexos.reduce((s, f) => s + f.size, 0))}
              </li>
            </ul>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar} disabled={enviando}>Cancelar</button>
          <button className="btn btn-primary" onClick={abrirAviso} disabled={enviando || !assunto.trim() || !mensagem.trim()}>
            {enviando ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>

    {/* Aviso antes de enviar: o sistema NÃO arquiva o e-mail nem os anexos (só o log). */}
    {mostrarAviso && (
      <div className="modal-overlay" style={{ zIndex: 1100 }}>
        <div className="modal-box" style={{ maxWidth: '480px' }}>
          <div className="modal-header">
            <h3>Confirmar envio</h3>
            <button className="modal-fechar" onClick={() => setMostrarAviso(false)} disabled={enviando}>✕</button>
          </div>
          <div className="modal-body">
            <p style={{ margin:0, fontSize:'14px', color:'#334155', lineHeight:1.6 }}>
              Este e-mail será enviado agora. O sistema registra apenas que o envio aconteceu
              (quem enviou, para quem, assunto e data) — mas <strong>não guarda uma cópia do
              e-mail nem dos anexos</strong>. Se você precisa manter um arquivo/comprovante do
              que foi enviado, use também um serviço de e-mail próprio (Gmail etc.), que mantém
              a pasta "Enviados".
            </p>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setMostrarAviso(false)} disabled={enviando}>Cancelar</button>
            <button className="btn btn-primary" onClick={enviar} disabled={enviando}>
              {enviando ? 'Enviando...' : 'Enviar assim mesmo'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ============================================================
// MODAL "Escolher telefone" — aparece só quando a pessoa tem MAIS DE UM telefone.
// O principal já vem selecionado; ao confirmar, abre a conversa no WhatsApp (wa.me).
// ============================================================
export function ModalEscolherWhatsapp({ pessoa, telefones, onEscolher, onFechar }) {
  const nomePessoa = pessoa.nome || pessoa.razao_social || 'Pessoa';
  const [numero, setNumero] = useState(telefones[0] || ''); // principal primeiro

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onFechar(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onFechar]);

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Enviar WhatsApp — {nomePessoa}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{fontSize:'13px', color:'#555', marginTop:0}}>
            Esta pessoa tem mais de um telefone. Escolha para qual abrir a conversa:
          </p>
          <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
            {telefones.map((tel, i) => (
              <label key={i} style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'14px', cursor:'pointer'}}>
                <input type="radio" name="zap-tel" value={tel} checked={numero === tel} onChange={() => setNumero(tel)} />
                {tel}
              </label>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onEscolher(numero)}>Abrir WhatsApp</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CÓPIA DE TELEFONE (só o número local) — usado no "Copiar?" da lista.
// soNumeroLocal: tira símbolos, o código do país (55) e o DDD. Ex.: "(11) 94685-0741" -> "946850741".
// Se não houver DDD (8 ou 9 dígitos), mantém como está.
// ============================================================
export function soNumeroLocal(telefone) {
  let d = String(telefone || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2); // remove o código do país (Brasil), se houver
  if (d.length === 10 || d.length === 11) d = d.slice(2);   // remove o DDD (2 dígitos)
  return d;
}

// Copia um texto para a área de transferência. Usa a API moderna (localhost/HTTPS) e,
// se ela falhar, cai no método antigo (textarea + execCommand) — assim funciona sempre.
export function copiarParaAreaTransferencia(texto, onOk) {
  if (!texto) return;
  const feito = () => { if (onOk) onOk(); };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(texto).then(feito).catch(() => copiaLegado(texto, feito));
  } else {
    copiaLegado(texto, feito);
  }
}
function copiaLegado(texto, feito) {
  try {
    const ta = document.createElement('textarea');
    ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    feito && feito();
  } catch (_) { /* silencioso */ }
}

// ============================================================
// TELEFONE DA LISTA COM "Copiar?" (igual ao número do processo).
// Ao clicar: busca os telefones da pessoa (sob demanda). Se houver 1, copia direto
// (só o número, sem DDD/símbolos) e mostra "Copiado!!". Se houver vários, abre o
// modal de escolha (onMultiplos) — o modal copia ao clicar no telefone escolhido.
// ============================================================
function TelefoneCopiavel({ telefone, pessoaId, tipo, onMultiplos }) {
  const [copiado, setCopiado] = useState(false);
  const [hover, setHover]     = useState(false);
  const [ocupado, setOcupado] = useState(false);

  if (!telefone) return <span>—</span>;

  async function aoClicar() {
    if (ocupado) return;
    setOcupado(true);
    try {
      const fn = tipo === 'juridicas' ? pessoasAPI.buscarJuridica : pessoasAPI.buscarFisica;
      const { data } = await fn(pessoaId);
      const nums = (data.dados?.telefones || []).filter(t => t.ativo !== 0).map(t => t.numero).filter(Boolean);
      if (nums.length > 1) {
        onMultiplos(nums);
      } else {
        copiarParaAreaTransferencia(soNumeroLocal(nums[0] || telefone),
          () => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); });
      }
    } catch {
      // Falhou buscar: copia ao menos o principal que já está na tela
      copiarParaAreaTransferencia(soNumeroLocal(telefone),
        () => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); });
    } finally {
      setOcupado(false);
    }
  }

  const mostrarBalao = hover || copiado;
  return (
    <span style={{ position:'relative', display:'inline-block' }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span onClick={aoClicar} style={{ cursor:'pointer', borderBottom:'1px dotted #94a3b8' }}>
        {formatarTelefone(telefone)}
      </span>
      {mostrarBalao && (
        <span style={{ position:'absolute', bottom:'100%', left:'50%', transform:'translateX(-50%)',
          marginBottom:'4px', whiteSpace:'nowrap', background: copiado ? '#16a34a' : '#334155',
          color:'#fff', fontSize:'11px', fontWeight:600, padding:'3px 8px', borderRadius:'4px',
          zIndex:20, pointerEvents:'none', boxShadow:'0 2px 6px rgba(0,0,0,0.2)' }}>
          {copiado ? 'Copiado!!' : 'Copiar?'}
        </span>
      )}
    </span>
  );
}

// ============================================================
// MODAL "Copiar telefone" — aparece quando a pessoa tem MAIS DE UM telefone.
// Clicar num telefone copia SÓ o número (sem DDD e sem "-") e fecha o modal.
// ============================================================
export function ModalCopiarTelefone({ pessoa, telefones, onFechar }) {
  const nomePessoa = pessoa.nome || pessoa.razao_social || 'Pessoa';

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onFechar(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onFechar]);

  function copiar(num) {
    copiarParaAreaTransferencia(soNumeroLocal(num), () => {
      toast.success('Telefone copiado (só o número)');
      onFechar();
    });
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Copiar telefone — {nomePessoa}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{fontSize:'13px', color:'#555', marginTop:0}}>
            Clique no telefone para copiar (só o número, sem DDD e sem traço):
          </p>
          <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
            {telefones.map((tel, i) => (
              <button key={i} type="button" onClick={() => copiar(tel)}
                style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px',
                  padding:'10px 12px', fontSize:'14px', border:'1px solid #ddd', borderRadius:'6px',
                  background:'#fff', cursor:'pointer', textAlign:'left'}}
                onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                <span>{tel}</span>
                <span style={{fontSize:'12px', color:'#2563eb', fontWeight:600}}>Copiar</span>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// E-MAIL DA LISTA COM "Copiar?" (igual ao do telefone, mas copia o endereço inteiro).
// Ao clicar: busca os e-mails da pessoa. Se houver 1, copia direto e mostra "Copiado!!".
// Se houver vários, abre o modal de escolha (onMultiplos).
// ============================================================
function EmailCopiavel({ email, pessoaId, tipo, onMultiplos }) {
  const [copiado, setCopiado] = useState(false);
  const [hover, setHover]     = useState(false);
  const [ocupado, setOcupado] = useState(false);

  if (!email) return <span>—</span>;

  async function aoClicar() {
    if (ocupado) return;
    setOcupado(true);
    try {
      const fn = tipo === 'juridicas' ? pessoasAPI.buscarJuridica : pessoasAPI.buscarFisica;
      const { data } = await fn(pessoaId);
      const emails = (data.dados?.emails || []).filter(e => e.ativo !== 0).map(e => e.email).filter(Boolean);
      if (emails.length > 1) {
        onMultiplos(emails);
      } else {
        copiarParaAreaTransferencia(emails[0] || email,
          () => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); });
      }
    } catch {
      // Falhou buscar: copia ao menos o principal que já está na tela
      copiarParaAreaTransferencia(email,
        () => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); });
    } finally {
      setOcupado(false);
    }
  }

  const mostrarBalao = hover || copiado;
  return (
    <span style={{ position:'relative', display:'inline-block' }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span onClick={aoClicar} style={{ cursor:'pointer', borderBottom:'1px dotted #94a3b8' }}>
        {email}
      </span>
      {mostrarBalao && (
        <span style={{ position:'absolute', bottom:'100%', left:'50%', transform:'translateX(-50%)',
          marginBottom:'4px', whiteSpace:'nowrap', background: copiado ? '#16a34a' : '#334155',
          color:'#fff', fontSize:'11px', fontWeight:600, padding:'3px 8px', borderRadius:'4px',
          zIndex:20, pointerEvents:'none', boxShadow:'0 2px 6px rgba(0,0,0,0.2)' }}>
          {copiado ? 'Copiado!!' : 'Copiar?'}
        </span>
      )}
    </span>
  );
}

// ============================================================
// MODAL "Copiar e-mail" — aparece quando a pessoa tem MAIS DE UM e-mail.
// Clicar num e-mail copia o endereço inteiro e fecha o modal.
// ============================================================
export function ModalCopiarEmail({ pessoa, emails, onFechar }) {
  const nomePessoa = pessoa.nome || pessoa.razao_social || 'Pessoa';

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onFechar(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onFechar]);

  function copiar(em) {
    copiarParaAreaTransferencia(em, () => {
      toast.success('E-mail copiado');
      onFechar();
    });
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>Copiar e-mail — {nomePessoa}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{fontSize:'13px', color:'#555', marginTop:0}}>
            Clique no e-mail para copiar:
          </p>
          <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
            {emails.map((em, i) => (
              <button key={i} type="button" onClick={() => copiar(em)}
                style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px',
                  padding:'10px 12px', fontSize:'14px', border:'1px solid #ddd', borderRadius:'6px',
                  background:'#fff', cursor:'pointer', textAlign:'left'}}
                onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                <span>{em}</span>
                <span style={{fontSize:'12px', color:'#2563eb', fontWeight:600}}>Copiar</span>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Célula clicável da coluna "Qtde Proc": abre a lista de processos (só quando > 0)
function CelulaQtdeProc({ qtde, onClick }) {
  const n = qtde ?? 0;
  if (n === 0) return <td style={{textAlign:'center'}}>0</td>;
  return (
    <td style={{textAlign:'center'}}>
      <span onClick={onClick} title="Ver os processos"
        style={{color:'#2563eb', fontWeight:600, cursor:'pointer', textDecoration:'underline'}}>
        {n}
      </span>
    </td>
  );
}

function TabelaFisicas({ lista, onEditar, onVerDetalhes, onExcluir, onVerProcessos, onAnotacoes, onEnviarEmail, onEnviarZap, onEnviarSMS, smsAtivo, onCopiarMultiplos, onCopiarEmailMultiplos, catEscritorio = [], podeEtiquetar = false, onEtiquetar, modulo = 'pessoas_fisicas', onAbrirHistorico, modoUnificar, selecionados = [], onToggleSel }) {
  const { temPermissao } = useAuth();
  const estaSel = (id) => selecionados.some(x => x.id === id);
  return (
    <table className="tabela tabela-sticky">
      <thead>
        <tr>
          {modoUnificar && <th style={{width:'34px'}}></th>}
          <th>Nome</th><th>CPF</th><th>Telefone</th><th>E-mail</th><th style={{textAlign:'center'}}>Qtde Proc</th><th style={{textAlign:'center'}}>Etiq. Escrit.</th><th>Ações</th>
        </tr>
      </thead>
      <tbody>
        {lista.map(p => (
          <tr key={p.id} style={modoUnificar && estaSel(p.id) ? {background:'#eef4ff'} : undefined}>
            {/* Modo unificar: caixa para marcar cadastros duplicados da mesma pessoa */}
            {modoUnificar && (
              <td style={{textAlign:'center'}}>
                <input type="checkbox" checked={estaSel(p.id)} onChange={() => onToggleSel(p)} />
              </td>
            )}
            <td><strong onClick={() => onVerDetalhes(p)} title="Ver detalhes"
                  style={{cursor:'pointer'}}>{p.nome}</strong></td>
            <td>{formatarCPF(p.cpf)}</td>
            <td><TelefoneCopiavel telefone={p.telefone} pessoaId={p.id} tipo="fisicas" onMultiplos={(nums) => onCopiarMultiplos(p, nums)} /></td>
            <td><EmailCopiavel email={p.email} pessoaId={p.id} tipo="fisicas" onMultiplos={(ems) => onCopiarEmailMultiplos(p, ems)} /></td>
            <CelulaQtdeProc qtde={p.qtde_proc} onClick={() => onVerProcessos(p)} />
            <td style={{ textAlign: 'center' }}>
              <EtiquetaCelula slot={p.etiqueta_escritorio} definicoes={catEscritorio} />
            </td>
            <td>
              {/* Gerar documento — o modal lista os modelos desta origem (ou avisa se não houver). */}
              <MenuAcoes itens={[
                itemEtiquetaEscritorioSubmenu({
                  definicoes: catEscritorio, slotAtual: p.etiqueta_escritorio,
                  podeAplicar: podeEtiquetar,
                  onMarcar: (slot) => onEtiquetar(p.id, slot),
                  modulo, registroId: p.id,
                  onAbrirHistorico,
                }),
                { label: 'Gerar documento', icone: '📄',
                  oculto: !temPermissao('documentos','cadastrar'),
                  gerarDoc: { ancoraTipo: 'pessoa_fisica', ancoraId: p.id } },
                { label: 'Anotações de atendimento', icone: '📝', onClick: () => onAnotacoes(p) },
                { label: 'Enviar Email', icone: '✉️', onClick: () => onEnviarEmail(p) },
                { label: 'Enviar WhatsApp', icone: '🟢', onClick: () => onEnviarZap(p) },
                { label: 'Enviar SMS', icone: '📱',
                  oculto: !smsAtivo || !temPermissao('sms','cadastrar'),
                  onClick: () => onEnviarSMS(p) },
                { label: 'Editar',  icone: '✏️', onClick: () => onEditar(p) },
                { label: 'Excluir', icone: '🗑️', perigo: true, onClick: () => onExcluir(p) },
              ]} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Tabela de pessoas jurídicas
function TabelaJuridicas({ lista, onEditar, onVerDetalhes, onExcluir, onVerProcessos, onAnotacoes, onEnviarEmail, onEnviarZap, onCopiarMultiplos, onCopiarEmailMultiplos, catEscritorio = [], podeEtiquetar = false, onEtiquetar, modulo = 'pessoas_juridicas', onAbrirHistorico, modoUnificar, selecionados = [], onToggleSel }) {
  const { temPermissao } = useAuth();
  const estaSel = (id) => selecionados.some(x => x.id === id);
  return (
    <table className="tabela tabela-sticky">
      <thead>
        <tr>
          {modoUnificar && <th style={{width:'34px'}}></th>}
          <th>Razão Social</th><th>Nome Fantasia</th><th>CNPJ</th><th>Telefone</th><th style={{textAlign:'center'}}>Qtde Proc</th><th style={{textAlign:'center'}}>Etiq. Escrit.</th><th>Ações</th>
        </tr>
      </thead>
      <tbody>
        {lista.map(p => (
          <tr key={p.id} style={modoUnificar && estaSel(p.id) ? {background:'#eef4ff'} : undefined}>
            {/* Modo unificar: caixa para marcar cadastros duplicados da mesma empresa */}
            {modoUnificar && (
              <td style={{textAlign:'center'}}>
                <input type="checkbox" checked={estaSel(p.id)} onChange={() => onToggleSel(p)} />
              </td>
            )}
            <td><strong onClick={() => onVerDetalhes(p)} title="Ver detalhes"
                  style={{cursor:'pointer'}}>{p.razao_social}</strong></td>
            <td>{p.nome_fantasia || '—'}</td>
            <td>{formatarCNPJ(p.cnpj)}</td>
            <td><TelefoneCopiavel telefone={p.telefone} pessoaId={p.id} tipo="juridicas" onMultiplos={(nums) => onCopiarMultiplos(p, nums)} /></td>
            <CelulaQtdeProc qtde={p.qtde_proc} onClick={() => onVerProcessos(p)} />
            <td style={{ textAlign: 'center' }}>
              <EtiquetaCelula slot={p.etiqueta_escritorio} definicoes={catEscritorio} />
            </td>
            <td>
              {/* Gerar documento — o modal lista os modelos desta origem (ou avisa se não houver). */}
              <MenuAcoes itens={[
                itemEtiquetaEscritorioSubmenu({
                  definicoes: catEscritorio, slotAtual: p.etiqueta_escritorio,
                  podeAplicar: podeEtiquetar,
                  onMarcar: (slot) => onEtiquetar(p.id, slot),
                  modulo, registroId: p.id,
                  onAbrirHistorico,
                }),
                { label: 'Gerar documento', icone: '📄',
                  oculto: !temPermissao('documentos','cadastrar'),
                  gerarDoc: { ancoraTipo: 'pessoa_juridica', ancoraId: p.id } },
                { label: 'Anotações de atendimento', icone: '📝', onClick: () => onAnotacoes(p) },
                { label: 'Enviar Email', icone: '✉️', onClick: () => onEnviarEmail(p) },
                { label: 'Enviar WhatsApp', icone: '🟢', onClick: () => onEnviarZap(p) },
                { label: 'Editar',  icone: '✏️', onClick: () => onEditar(p) },
                { label: 'Excluir', icone: '🗑️', perigo: true, onClick: () => onExcluir(p) },
              ]} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ============================================================
// MODAL — Unificar cadastros duplicados (pessoa física OU empresa)
// Move TODOS os vínculos dos duplicados para o PRINCIPAL escolhido e apaga os
// duplicados. Ação irreversível (confirma antes). Para física, o backend BLOQUEIA
// se houver CPFs diferentes e o principal HERDA o CPF se estiver sem.
// ============================================================
function ModalUnificarPessoas({ tipo, selecionados, onFechar }) {
  const ehFisica = tipo === 'fisicas';
  const nomeDe = (p) => ehFisica ? p.nome : p.razao_social;
  // Sugere como principal o cadastro com MAIS processos
  const sugerido = [...selecionados].sort((a, b) => (b.qtde_proc ?? 0) - (a.qtde_proc ?? 0))[0];
  const [principalId, setPrincipalId] = useState(sugerido?.id);
  const [salvando, setSalvando]       = useState(false);
  const [aviso, setAviso]             = useState(''); // faixa interna — nunca a notificação do canto

  const duplicados = selecionados.filter(p => p.id !== principalId);

  async function confirmar() {
    setAviso('');
    if (!principalId)            { setAviso('Escolha o cadastro principal.'); return; }
    if (duplicados.length === 0) { setAviso('Selecione ao menos um duplicado além do principal.'); return; }
    setSalvando(true);
    try {
      const fn = ehFisica ? pessoasAPI.unificarFisicas : pessoasAPI.unificarJuridicas;
      await fn({ principal_id: principalId, duplicados_ids: duplicados.map(p => p.id) });
      toast.success(ehFisica ? 'Pessoas unificadas com sucesso!' : 'Empresas unificadas com sucesso!');
      onFechar(true);
    } catch (err) {
      // Aqui caem também as travas do servidor (CPFs diferentes, responsável legal),
      // que são mensagens longas — por isso ficam na faixa, não na notificação do canto
      setAviso(err.response?.data?.mensagem || 'Não foi possível unificar os cadastros.');
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{maxWidth:'560px'}}>
        <div className="modal-header">
          <h3>{ehFisica ? 'Unificar pessoas duplicadas' : 'Unificar empresas duplicadas'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          {aviso && (
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', color:'#b91c1c',
              borderRadius:'6px', padding:'8px 10px', marginBottom:'12px', fontSize:'13px',
              display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px' }}>
              <span>⚠️ {aviso}</span>
              <button type="button" onClick={() => setAviso('')}
                style={{ background:'none', border:'none', color:'#b91c1c', cursor:'pointer', fontSize:'15px', lineHeight:1 }}
                title="Fechar">✕</button>
            </div>
          )}
          <p style={{fontSize:'13px',color:'#555',marginBottom:'12px'}}>
            Escolha o cadastro <strong>principal</strong> (o que vai ficar). Todos os processos e
            vínculos dos outros serão movidos para ele, e os demais serão <strong>excluídos do banco</strong>.
          </p>
          {ehFisica && (
            <p style={{fontSize:'12px',color:'#b45309',marginBottom:'12px'}}>
              Observação: cadastros com <strong>CPFs diferentes</strong> não podem ser unificados
              (o sistema bloqueia — CPFs diferentes indicam pessoas diferentes). Cadastros com
              <strong> responsável legal</strong> — de qualquer um dos dois lados — também são
              bloqueados: desfaça o vínculo, unifique e refaça o vínculo.
            </p>
          )}
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            {selecionados.map(p => {
              const ehPrincipal = p.id === principalId;
              return (
                <label key={p.id} style={{
                  display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',
                  border:'1px solid ' + (ehPrincipal ? '#2563eb' : '#e2e8f0'),
                  background: ehPrincipal ? '#eef4ff' : '#fff',
                  borderRadius:'6px',cursor:'pointer'
                }}>
                  <input type="radio" name="principal" checked={ehPrincipal}
                    onChange={() => setPrincipalId(p.id)} />
                  <span style={{flex:1}}>
                    <strong>{nomeDe(p)}</strong>
                    {ehFisica && p.cpf && (
                      <span style={{color:'#888',fontSize:'12px',marginLeft:'6px'}}>CPF {formatarCPF(p.cpf)}</span>
                    )}
                    <span style={{color:'#888',fontSize:'12px',marginLeft:'6px'}}>
                      ({p.qtde_proc ?? 0} processo(s))
                    </span>
                  </span>
                  <span style={{fontSize:'12px',fontWeight:600,
                    color: ehPrincipal ? '#2563eb' : '#b91c1c'}}>
                    {ehPrincipal ? 'PRINCIPAL (fica)' : 'será excluído'}
                  </span>
                </label>
              );
            })}
          </div>
          <p style={{fontSize:'12px',color:'#b91c1c',marginTop:'14px'}}>
            ⚠️ Esta ação não pode ser desfeita. {duplicados.length} cadastro(s) será(ão) apagado(s) do banco.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={() => onFechar(false)} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={salvando}>
            {salvando ? 'Unificando...' : 'Unificar agora'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal de cadastro / edição de pessoa
export function ModalPessoa({ tipo, pessoa, onFechar, onAbrirEdicao, somenteLeitura = false }) {
  // leitura = true → todos os campos travados e rodapé só com "Editar"/"Fechar".
  // Ao clicar em "Editar", destrava para o modo de edição normal.
  const [leitura, setLeitura]   = useState(somenteLeitura);
  const [form, setForm]         = useState(pessoa || {});
  const [auxiliares, setAux]    = useState({ estados_civis: [], generos: [], profissoes: [], nacionalidades: [], parentescos: [] });
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState(null); // modal de aviso "campos sem informação"
  const [avisoDup, setAvisoDup]   = useState('');   // faixa interna: telefone/e-mail repetido no próprio cadastro
  const [telefones, setTelefones] = useState(pessoa?.telefones || [{ numero: '', tipo: '', principal: true }]);
  const [emails, setEmails]       = useState(pessoa?.emails || [{ email: '', principal: true }]);
  const [avisosIdade, setAvisosIdade] = useState(pessoa?.avisos_idade || []); // "avise aos X anos"
  // Ref do campo Número — recebe o foco automaticamente após o CEP ser preenchido
  const refNumero = useRef(null);
  // Refs dos campos obrigatórios: o aviso devolve o foco a quem causou o erro
  const refNome     = useRef(null);
  const refCpf      = useRef(null);
  const refDataNasc = useRef(null);
  const refRazao    = useRef(null);
  const refsEmail   = useRef([]);
  const overlayRef  = useEscFechar(() => onFechar(false));

  // Todo alerta/erro deste modal aparece na FAIXA interna (nunca na notificação
  // do canto) e o cursor volta para o campo que originou o problema.
  function avisar(mensagem, campo) {
    setAvisoDup(mensagem);
    setTimeout(() => { if (campo) campo.focus(); }, 0);
  }

  useEffect(() => {
    pessoasAPI.auxiliares().then(r => setAux(r.data.dados));
    // Se editando, busca dados completos (inclui telefones/e-mails) — física OU jurídica
    if (pessoa?.id) {
      const buscar = tipo === 'fisicas' ? pessoasAPI.buscarFisica : pessoasAPI.buscarJuridica;
      buscar(pessoa.id).then(r => {
        if (r.data.ok) {
          setForm(r.data.dados);
          const tels = r.data.dados.telefones || [];
          setTelefones(tels.length ? tels : [{ numero: '', tipo: '', principal: true }]);
          const mails = r.data.dados.emails || [];
          setEmails(mails.length ? mails : [{ email: '', principal: true }]);
          setAvisosIdade(r.data.dados.avisos_idade || []);
        }
      });
    }
  }, []);

  function set(campo, valor) { setForm(f => ({...f, [campo]: valor})); }

  // Chamado pelo SelectComAdicao quando o usuário cadastra um novo item auxiliar
  // Adiciona o novo item na lista local já ordenado e auto-seleciona no form
  function handleNovoAuxiliar(tipo, novoItem) {
    const campoPorTipo = {
      generos:       'genero_id',
      estados_civis: 'estado_civil_id',
      profissoes:    'profissao_id',
      nacionalidades:'nacionalidade_id',
      parentescos:   'parentesco_id',
    };
    // Insere na lista do tipo correto, mantendo ordem alfabética
    setAux(a => ({
      ...a,
      [tipo]: [...a[tipo], novoItem].sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')),
    }));
    // Auto-seleciona o item recém-criado
    set(campoPorTipo[tipo], String(novoItem.id));
  }

  // Chamado pelo CampoCEP após buscar o endereço na ViaCEP
  // Preenche logradouro, bairro, cidade e estado — e move o cursor para Número
  // ViaCEP pode retornar tudo maiúsculo; aplica Title Case automaticamente
  function handleCEPAutoFill(dados) {
    setForm(f => ({
      ...f,
      logradouro: toTitleCase(dados.logradouro || f.logradouro || ''),
      bairro:     toTitleCase(dados.bairro     || f.bairro     || ''),
      cidade:     toTitleCase(dados.cidade     || f.cidade     || ''),
      estado:     dados.estado     || f.estado     || '',
    }));
    // Pequeno delay para o React renderizar os campos antes de focar
    setTimeout(() => refNumero.current?.focus(), 100);
  }

  // Grava de fato (chamado direto ou após o usuário confirmar o aviso de campos vazios).
  async function executarSalvar() {
    setSalvando(true);
    try {
      const payload = { ...form, telefones, emails, avisos_idade: avisosIdade };
      if (pessoa?.id) {
        // Edição: usa a atualização correta conforme o tipo (antes chamava sempre a de física — bug)
        const fnAtualizar = tipo === 'fisicas' ? pessoasAPI.atualizarFisica : pessoasAPI.atualizarJuridica;
        await fnAtualizar(pessoa.id, payload);
        toast.success('Pessoa atualizada com sucesso!');
      } else {
        const fn = tipo === 'fisicas' ? pessoasAPI.criarFisica : pessoasAPI.criarJuridica;
        await fn(payload);
        toast.success('Pessoa cadastrada com sucesso!');
      }
      onFechar(true);
    } catch (err) {
      avisar(err.response?.data?.mensagem || 'Não foi possível salvar o cadastro. Tente novamente.', null);
    } finally { setSalvando(false); }
  }

  async function salvar() {
    // ── Bloqueio: mesmo telefone ou mesmo e-mail repetido no MESMO cadastro (PF e PJ) ──
    // Telefone compara só os dígitos (ignora máscara); e-mail compara em minúsculas. Linhas em branco não contam.
    setAvisoDup('');
    const telsDigitos = telefones.map(t => (t.numero || '').replace(/\D/g, '')).filter(Boolean);
    const telRepetido = telsDigitos.find((n, i) => telsDigitos.indexOf(n) !== i);
    if (telRepetido) {
      setAvisoDup(`O telefone ${formatarTelefone(telRepetido)} está repetido. Cada telefone só pode aparecer uma vez neste cadastro — remova o duplicado.`);
      return;
    }
    const emailsNorm = emails.map(e => (e.email || '').trim().toLowerCase()).filter(Boolean);
    const emailRepetido = emailsNorm.find((e, i) => emailsNorm.indexOf(e) !== i);
    if (emailRepetido) {
      setAvisoDup(`O e-mail ${emailRepetido} está repetido. Cada e-mail só pode aparecer uma vez neste cadastro — remova o duplicado.`);
      return;
    }

    if (tipo === 'fisicas') {
      // ── Únicos OBRIGATÓRIOS de Pessoa Física: nome completo + CPF ──────
      // O CPF é DISPENSADO quando a pessoa tem responsável legal: menor e incapaz
      // muitas vezes não têm CPF, e é justamente esse o caso que o vínculo cobre.
      if (!form.nome?.trim()) { avisar('Nome é obrigatório.', refNome.current); return; }
      const partes = form.nome.trim().split(/\s+/).filter(Boolean);
      if (partes.length < 2)  { avisar('Informe o nome completo (nome e sobrenome).', refNome.current); return; }
      if (!form.cpf?.replace(/\D/g, '') && !form.responsavel_id) {
        avisar('CPF é obrigatório. Se for menor ou incapaz sem CPF, informe o responsável legal.', refCpf.current);
        return;
      }

      // ── Validações de FORMATO (mantidas — só disparam se o campo estiver preenchido) ──
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (let i = 0; i < emails.length; i++) {
        const valor = (emails[i].email || '').trim();
        if (valor && !emailRegex.test(valor)) {
          avisar(`E-mail inválido: "${valor}". Corrija antes de salvar.`, refsEmail.current[i]);
          return;
        }
      }
      const hoje = hojeLocal();
      if (form.data_nascimento && form.data_nascimento > hoje) {
        avisar('Data de nascimento não pode ser uma data futura.', refDataNasc.current);
        return;
      }

      // ── Campos que agora são OPCIONAIS: avisa antes de salvar se ficarem vazios ──
      const vazios = [];
      if (!form.data_nascimento)                       vazios.push('Data de nascimento');
      if (!form.genero_id)                             vazios.push('Gênero');
      if (!form.estado_civil_id)                       vazios.push('Estado civil');
      if (!form.profissao_id)                          vazios.push('Profissão');
      if (!form.nacionalidade_id)                      vazios.push('Nacionalidade');
      if (!telefones[0]?.numero?.replace(/\D/g, ''))   vazios.push('Telefone');
      // Menor de 18 sem responsável legal: só lembra, não impede de salvar
      if (!form.responsavel_id && idadeEmAnos(form.data_nascimento) !== null && idadeEmAnos(form.data_nascimento) < 18)
        vazios.push('Responsável legal (esta pessoa tem menos de 18 anos)');

      if (vazios.length) {
        setConfirmar({
          titulo: 'Campos sem informação',
          mensagem: `Os campos ${vazios.join(', ')} ficarão sem informação. Deseja salvar assim mesmo?`,
          textoBotao: 'Salvar assim',
          tipo: 'aviso',
          acao: executarSalvar,
        });
        return;
      }
      return executarSalvar();
    }

    // Jurídica
    if (!form.razao_social) { avisar('Razão social é obrigatória.', refRazao.current); return; }
    return executarSalvar();
  }

  return (
    <div className="modal-overlay" ref={overlayRef}>
      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>{leitura ? 'Detalhes da' : (pessoa ? 'Editar' : 'Nova')} {tipo === 'fisicas' ? 'Pessoa Física' : 'Pessoa Jurídica'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>

        <div className="modal-body">
          {/* Faixa de aviso do próprio sistema (no lugar da notificação do canto) */}
          {avisoDup && (
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', color:'#b91c1c',
              borderRadius:'6px', padding:'8px 10px', marginBottom:'12px', fontSize:'13px',
              display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px',
              position:'sticky', top:0, zIndex:5, boxShadow:'0 2px 6px rgba(0,0,0,0.12)' }}>
              <span>⚠️ {avisoDup}</span>
              <button type="button" onClick={() => setAvisoDup('')}
                style={{ background:'none', border:'none', color:'#b91c1c', cursor:'pointer', fontSize:'15px', lineHeight:1 }}
                title="Fechar">✕</button>
            </div>
          )}
          {tipo === 'fisicas' ? (
            <>
              <div className="grid-2">
                {/* CampoNome exige ao menos duas palavras ao sair do campo */}
                <CampoNomeCompleto value={form.nome||''} onChange={v=>set('nome',v)} somenteLeitura={leitura} refCampo={refNome} />
                {/* CampoCPF aplica máscara, valida algoritmo e verifica duplicata no banco */}
                <CampoCPF
                  value={form.cpf||''}
                  onChange={v=>set('cpf',v)}
                  pessoaIdAtual={pessoa?.id || null}
                  onAbrirEdicao={onAbrirEdicao}
                  somenteLeitura={leitura}
                  refCampo={refCpf}
                  dispensado={!!form.responsavel_id}
                />
              </div>
              <div className="grid-4">
                <Campo label="RG" value={form.rg||''} onChange={v=>set('rg',v)} somenteLeitura={leitura} />
                {/* Órgão expedidor: SSP/SP, DETRAN/RJ, etc. */}
                <Campo label="Órgão Expedidor" value={form.rg_orgao||''} onChange={v=>set('rg_orgao',v)} placeholder="SSP/SP" somenteLeitura={leitura} />
                {/* CampoData bloqueia datas futuras — ninguém nasce amanhã */}
                <CampoDataNascimento value={form.data_nascimento?.split('T')[0]||''} onChange={v=>set('data_nascimento',v)} somenteLeitura={leitura} refCampo={refDataNasc} />
                <SelectComAdicao
                  label="Gênero" value={form.genero_id||''} onChange={v=>set('genero_id',v)}
                  opcoes={auxiliares.generos} tipo="generos"
                  onNovoItem={item => handleNovoAuxiliar('generos', item)}
                  somenteLeitura={leitura}
                />
              </div>
              {/* Linha 2: PIS + CTPS (Digital/Física com campos condicionais) */}
              <div className="grid-2">
                <Campo label="PIS" value={form.pis||''} onChange={v=>set('pis',v)} placeholder="000.00000.00-0" somenteLeitura={leitura} />
                <CampoCTPS
                  somenteLeitura={leitura}
                  // Tipo derivado do valor salvo: "Digital" no campo = digital, qualquer outro = física
                  tipo={form.ctps_numero === 'Digital' ? 'digital' : 'fisica'}
                  numero={form.ctps_numero === 'Digital' ? '' : (form.ctps_numero||'')}
                  serie={form.ctps_serie||''}
                  onChangeTipo={tipo => {
                    // Digital: salva "Digital" no banco e limpa série
                    // Física: limpa para o usuário digitar o número
                    if (tipo === 'digital') { set('ctps_numero', 'Digital'); set('ctps_serie', null); }
                    else { set('ctps_numero', ''); set('ctps_serie', ''); }
                  }}
                  onChangeNumero={v => set('ctps_numero', v)}
                  onChangeSerie={v => set('ctps_serie', v)}
                />
              </div>
              <div className="grid-3">
                <SelectComAdicao
                  label="Estado civil" value={form.estado_civil_id||''} onChange={v=>set('estado_civil_id',v)}
                  opcoes={auxiliares.estados_civis} tipo="estados_civis"
                  onNovoItem={item => handleNovoAuxiliar('estados_civis', item)}
                  somenteLeitura={leitura}
                />
                <SelectComAdicao
                  label="Profissão" value={form.profissao_id||''} onChange={v=>set('profissao_id',v)}
                  opcoes={auxiliares.profissoes} tipo="profissoes"
                  onNovoItem={item => handleNovoAuxiliar('profissoes', item)}
                  somenteLeitura={leitura}
                />
                <SelectComAdicao
                  label="Nacionalidade" value={form.nacionalidade_id||''} onChange={v=>set('nacionalidade_id',v)}
                  opcoes={auxiliares.nacionalidades} tipo="nacionalidades"
                  onNovoItem={item => handleNovoAuxiliar('nacionalidades', item)}
                  somenteLeitura={leitura}
                />
              </div>
              {/* Filiação */}
              <div className="grid-2">
                <Campo label="Pai" value={form.nome_pai||''} onChange={v=>set('nome_pai',v)} onBlur={()=>set('nome_pai', toTitleCase(form.nome_pai))} somenteLeitura={leitura} />
                <Campo label="Mãe" value={form.nome_mae||''} onChange={v=>set('nome_mae',v)} onBlur={()=>set('nome_mae', toTitleCase(form.nome_mae))} somenteLeitura={leitura} />
              </div>

              {/* Responsável legal — vínculo com quem representa o menor/incapaz */}
              <CampoResponsavelLegal
                form={form}
                set={set}
                opcoesParentesco={auxiliares.parentescos}
                onNovoParentesco={item => handleNovoAuxiliar('parentescos', item)}
                somenteLeitura={leitura}
                pessoaIdAtual={pessoa?.id || null}
              />

              {/* Avisos de idade — 16 anos (vira assistido), 18 (cessa a representação), etc. */}
              <CampoAvisosIdade
                avisos={avisosIdade}
                setAvisos={setAvisosIdade}
                dataNascimento={form.data_nascimento}
                somenteLeitura={leitura}
              />
            </>
          ) : (
            <>
              <div className="grid-2">
                <Campo label="Razão Social *" value={form.razao_social||''} onChange={v=>set('razao_social',v)} onBlur={()=>set('razao_social', toTitleCase(form.razao_social))} somenteLeitura={leitura} ref={refRazao} />
                <Campo label="Nome Fantasia" value={form.nome_fantasia||''} onChange={v=>set('nome_fantasia',v)} onBlur={()=>set('nome_fantasia', toTitleCase(form.nome_fantasia))} somenteLeitura={leitura} />
              </div>
              <div className="grid-2">
                <CampoCNPJ value={form.cnpj||''} onChange={v=>set('cnpj',v)} somenteLeitura={leitura} />
                {/* Marca da EMPRESA: uma vez marcada, o aviso vermelho aparece sozinho na
                    pasta de TODO processo em que ela é parte (autor ou réu). Não muda nada
                    no processo — é só informação. Respeita o modo "só leitura" dos Detalhes. */}
                <div style={{ display:'flex', alignItems:'center', gap:'8px', paddingTop:'22px' }}>
                  <input
                    type="checkbox"
                    id="pj-em-rj"
                    checked={!!form.em_recuperacao_judicial}
                    disabled={leitura}
                    onChange={e => set('em_recuperacao_judicial', e.target.checked ? 1 : 0)}
                    style={{ width:'16px', height:'16px', cursor: leitura ? 'default' : 'pointer' }}
                  />
                  <label htmlFor="pj-em-rj"
                    style={{ fontSize:'13px', color: leitura ? '#777' : '#333',
                             cursor: leitura ? 'default' : 'pointer', userSelect:'none' }}>
                    Em Recuperação Judicial
                  </label>
                </div>
              </div>
            </>
          )}

          {/* Endereço */}
          <h4 style={{margin:'16px 0 8px',color:'#555',fontSize:'13px',fontWeight:600}}>Endereço</h4>
          {/* Linha 1: CEP (busca automática) + Logradouro */}
          <div className="grid-2">
            <CampoCEP value={form.cep||''} onChange={v=>set('cep',v)} onAutoFill={handleCEPAutoFill} somenteLeitura={leitura} />
            <Campo label="Logradouro" value={form.logradouro||''} onChange={v=>set('logradouro',v)} onBlur={()=>set('logradouro', toTitleCase(form.logradouro))} somenteLeitura={leitura} />
          </div>
          {/* Linha 2: Número (recebe foco do CEP) + Complemento + Bairro */}
          <div className="grid-3">
            <Campo label="Número" value={form.numero||''} onChange={v=>set('numero',v)} ref={refNumero} somenteLeitura={leitura} />
            <Campo label="Complemento" value={form.complemento||''} onChange={v=>set('complemento',v)} onBlur={()=>set('complemento', toTitleCase(form.complemento))} placeholder="Apto, sala, bloco..." somenteLeitura={leitura} />
            <Campo label="Bairro" value={form.bairro||''} onChange={v=>set('bairro',v)} onBlur={()=>set('bairro', toTitleCase(form.bairro))} somenteLeitura={leitura} />
          </div>
          {/* Linha 3: Cidade + Estado */}
          <div className="grid-2">
            <Campo label="Cidade" value={form.cidade||''} onChange={v=>set('cidade',v)} onBlur={()=>set('cidade', toTitleCase(form.cidade))} somenteLeitura={leitura} />
            <Campo label="Estado" value={form.estado||''} onChange={v=>set('estado',v)} placeholder="SP" somenteLeitura={leitura} />
          </div>

          {/* Telefones */}
          <h4 style={{margin:'16px 0 8px',color:'#555',fontSize:'13px',fontWeight:600}}>Telefones</h4>
          {telefones.map((tel, i) => (
            <LinhaFone
              key={i}
              tel={tel}
              index={i}
              somenteLeitura={leitura}
              onChange={v => setTelefones(t => t.map((x,j) => j===i ? v : x))}
              onRemove={() => setTelefones(t => t.filter((_,j) => j!==i))}
            />
          ))}
          {!leitura && (
            <button className="btn btn-outline" style={{fontSize:'12px'}} onClick={() => setTelefones(t=>[...t,{numero:'',tipo:'',principal:false}])}>
              + Adicionar telefone
            </button>
          )}

          {/* E-mails */}
          <h4 style={{margin:'16px 0 8px',color:'#555',fontSize:'13px',fontWeight:600}}>E-mails</h4>
          {emails.map((em, i) => (
            <LinhaEmail
              key={i}
              email={em.email}
              index={i}
              somenteLeitura={leitura}
              refEmail={el => { refsEmail.current[i] = el; }}
              onChange={v => setEmails(t => t.map((x,j) => j===i ? {...x, email: v} : x))}
              onRemove={() => setEmails(t => t.filter((_,j) => j!==i))}
            />
          ))}
          {!leitura && (
            <button className="btn btn-outline" style={{fontSize:'12px'}} onClick={() => setEmails(e=>[...e,{email:'',principal:false}])}>
              + Adicionar e-mail
            </button>
          )}

          {/* Observações */}
          <div className="form-group" style={{marginTop:'16px'}}>
            <label className="form-label">Observações</label>
            <textarea className="form-control" rows={3} value={form.observacoes||''} disabled={leitura} onChange={e=>set('observacoes',e.target.value)} onBlur={()=>set('observacoes', toTitleCase(form.observacoes))} />
          </div>
        </div>

        <div className="modal-footer">
          {leitura ? (
            <>
              <button className="btn btn-secondary" onClick={() => onFechar(false)}>Fechar</button>
              <button className="btn btn-primary" onClick={() => setLeitura(false)}>Editar</button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CAMPO CPF — máscara automática + validação + duplicata
// pessoaIdAtual: id da pessoa em edição (evita alertar sobre ela mesma)
// onAbrirEdicao: callback chamado com { id, nome, cpf } quando usuário quer editar a duplicata
// ============================================================
function CampoCPF({ value, onChange, pessoaIdAtual = null, onAbrirEdicao = null, somenteLeitura = false, refCampo, dispensado = false }) {
  const [erroCpf, setErroCpf]       = useState('');
  const [verificando, setVerificando] = useState(false);
  const [duplicata, setDuplicata]   = useState(null); // { id, nome, cpf } se já existe no banco

  // Aplica máscara enquanto o usuário digita
  function handleChange(e) {
    const mascarado = mascaraCPF(e.target.value);
    setErroCpf('');
    setDuplicata(null);
    onChange(mascarado);
  }

  // Ao sair do campo: valida algoritmo e consulta o banco
  async function handleBlur() {
    const limpo = (value || '').replace(/\D/g, '');

    // Campo vazio — sem mensagem de erro
    if (!limpo) { setErroCpf(''); return; }

    // CPF incompleto
    if (limpo.length < 11) { setErroCpf('CPF incompleto'); return; }

    // Algoritmo dos dígitos verificadores
    if (!validarCPF(limpo)) { setErroCpf('CPF inválido'); return; }

    // CPF matematicamente válido — verifica se já existe no banco
    setErroCpf('');
    setVerificando(true);
    try {
      const { data } = await pessoasAPI.verificarCPF(limpo);
      if (data.ok && data.dados.existe) {
        const encontrado = data.dados.pessoa;
        // Ignora se for a própria pessoa que está sendo editada
        if (pessoaIdAtual && encontrado.id === pessoaIdAtual) return;
        setDuplicata(encontrado);
      }
    } catch {
      // Falha silenciosa — não bloqueia o cadastro se a verificação der erro
    } finally {
      setVerificando(false);
    }
  }

  return (
    <div className="form-group">
      <label className="form-label">{dispensado ? 'CPF (não obrigatório — pessoa com responsável legal)' : 'CPF *'}</label>
      <input
        ref={refCampo}
        type="text"
        className={`form-control ${erroCpf ? 'is-invalid' : ''}`}
        value={mascaraCPF(value || '')}
        disabled={somenteLeitura}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="000.000.000-00"
        maxLength={14}
      />
      {/* Exibe feedback abaixo do campo */}
      {verificando && (
        <small style={{ color: '#888', fontSize: '12px' }}>⏳ Verificando CPF...</small>
      )}
      {erroCpf && (
        <small style={{ color: '#e74c3c', fontSize: '12px' }}>⚠️ {erroCpf}</small>
      )}
      {/* Alerta de CPF duplicado com opção de abrir edição */}
      {duplicata && (
        <div style={{
          marginTop: '6px', padding: '10px 12px',
          background: '#fff3cd', border: '1px solid #ffc107',
          borderRadius: '4px', fontSize: '13px', lineHeight: '1.5'
        }}>
          <strong>⚠️ CPF já cadastrado</strong> para <strong>{duplicata.nome}</strong>.
          {onAbrirEdicao ? (
            <>
              <br />Deseja abrir o cadastro para edição?
              <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontSize: '12px', padding: '4px 14px' }}
                  onClick={() => { setDuplicata(null); onAbrirEdicao(duplicata); }}
                >
                  Sim, editar
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: '12px', padding: '4px 14px' }}
                  onClick={() => setDuplicata(null)}
                >
                  Não
                </button>
              </div>
            </>
          ) : (
            <span> Use o botão <em>Editar</em> na lista para alterar.</span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// CAMPO CNPJ — máscara automática + validação do algoritmo ao perder foco
// ============================================================
function CampoCNPJ({ value, onChange, somenteLeitura = false }) {
  const [erroCnpj, setErroCnpj] = useState('');

  // Aplica máscara enquanto o usuário digita
  function handleChange(e) {
    setErroCnpj('');
    onChange(mascaraCNPJ(e.target.value));
  }

  // Ao sair do campo: valida o algoritmo dos dígitos verificadores
  function handleBlur() {
    const limpo = (value || '').replace(/\D/g, '');
    if (!limpo) { setErroCnpj(''); return; }
    if (limpo.length < 14) { setErroCnpj('CNPJ incompleto'); return; }
    if (!validarCNPJ(limpo)) { setErroCnpj('CNPJ inválido'); return; }
    setErroCnpj('');
  }

  return (
    <div className="form-group">
      <label className="form-label">CNPJ</label>
      <input
        type="text"
        className={`form-control ${erroCnpj ? 'is-invalid' : ''}`}
        value={mascaraCNPJ(value || '')}
        disabled={somenteLeitura}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="00.000.000/0000-00"
        maxLength={18}
      />
      {erroCnpj && (
        <small style={{ color: '#e74c3c', fontSize: '12px' }}>⚠️ {erroCnpj}</small>
      )}
    </div>
  );
}

// ============================================================
// CAMPO DATA NASCIMENTO — impede datas futuras
// ============================================================
function CampoDataNascimento({ value, onChange, somenteLeitura = false, refCampo }) {
  const [erroData, setErroData] = useState('');
  // Calcula "hoje" no formato YYYY-MM-DD para o atributo max
  const hoje = hojeLocal();

  function handleChange(v) {
    if (v && v > hoje) {
      setErroData('Data de nascimento não pode ser futura');
    } else {
      setErroData('');
    }
    onChange(v);
  }

  return (
    <div className="form-group">
      <label className="form-label">Data de nascimento</label>
      <input
        ref={refCampo}
        type="date"
        className={`form-control ${erroData ? 'is-invalid' : ''}`}
        value={value}
        max={hoje}
        disabled={somenteLeitura}
        onChange={e => handleChange(e.target.value)}
      />
      {erroData && <small style={{ color: '#e74c3c', fontSize: '12px' }}>⚠️ {erroData}</small>}
    </div>
  );
}

// ============================================================
// SELECT COM ADIÇÃO — select normal + botão "..." para cadastrar
// novo item diretamente na tela, sem abrir outra página
// tipo: 'generos' | 'estados_civis' | 'profissoes'
// onNovoItem: callback chamado com { id, nome } após salvar
// ============================================================
function SelectComAdicao({ label, value, onChange, opcoes = [], tipo, onNovoItem, somenteLeitura = false }) {
  const [miniFormAberto, setMiniFormAberto] = useState(false);
  const [novoNome, setNovoNome]             = useState('');
  const [salvando, setSalvando]             = useState(false);
  const [erroMini, setErroMini]             = useState(''); // aviso DENTRO do mini formulário

  // Fecha o mini form e limpa o estado — sem sujeira
  function fecharMiniForm() {
    setMiniFormAberto(false);
    setNovoNome('');
    setErroMini('');
  }

  async function salvarNovo() {
    setErroMini('');
    if (!novoNome.trim()) { setErroMini('Digite um nome para cadastrar.'); return; }
    setSalvando(true);
    try {
      const { data } = await pessoasAPI.criarAuxiliar(tipo, { nome: novoNome.trim() });
      if (data.ok) {
        toast.success(`"${data.dados.nome}" cadastrado com sucesso!`);
        onNovoItem(data.dados); // atualiza lista e auto-seleciona no form pai
        fecharMiniForm();
      }
    } catch (err) {
      setErroMini(err.response?.data?.mensagem || 'Não foi possível cadastrar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <select
          className="form-control"
          value={value}
          disabled={somenteLeitura}
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1 }}
        >
          <option value="">— Selecione —</option>
          {opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        {/* Botão "..." abre mini formulário para cadastrar novo item */}
        {!somenteLeitura && (
          <button
            type="button"
            title={`Cadastrar novo(a) ${label} que não está na lista`}
            className="btn btn-outline"
            style={{ padding: '6px 10px', fontSize: '15px', flexShrink: 0, lineHeight: 1 }}
            onClick={() => setMiniFormAberto(v => !v)}
          >
            …
          </button>
        )}
      </div>

      {/* Mini formulário inline — aparece abaixo do select quando "..." é clicado */}
      {miniFormAberto && (
        <div style={{
          marginTop: '8px', padding: '10px 12px',
          background: '#f0f4ff', border: '1px solid #c5d0e6',
          borderRadius: '4px'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#444' }}>
            Novo(a) {label}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              autoFocus
              className="form-control"
              placeholder={`Ex.: ${label === 'Profissão' ? 'Pedreiro' : label === 'Gênero' ? 'Não binário' : 'Viúvo(a)'}`}
              value={novoNome}
              onChange={e => { setErroMini(''); setNovoNome(e.target.value); }}
              onKeyDown={e => { if (e.key === 'Enter') salvarNovo(); if (e.key === 'Escape') fecharMiniForm(); }}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: '12px', padding: '6px 14px', flexShrink: 0 }}
              onClick={salvarNovo}
              disabled={salvando}
            >
              {salvando ? '...' : 'Salvar'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ fontSize: '12px', padding: '6px 10px', flexShrink: 0 }}
              onClick={fecharMiniForm}
            >
              ✕
            </button>
          </div>
          {erroMini && (
            <div style={{ marginTop: '6px', color: '#b91c1c', fontSize: '12px' }}>⚠️ {erroMini}</div>
          )}
        </div>
      )}
    </div>
  );
}

// Idade em anos completos a partir da data de nascimento (aceita "1990-05-10"
// ou o ISO com horário que o backend às vezes devolve). Devolve null sem data.
function idadeEmAnos(dataISO) {
  if (!dataISO) return null;
  const d = new Date(String(dataISO).slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - d.getFullYear();
  const meses = hoje.getMonth() - d.getMonth();
  if (meses < 0 || (meses === 0 && hoje.getDate() < d.getDate())) anos--;
  return anos;
}

// ============================================================
// AVISOS DE IDADE — "me avise quando esta pessoa completar X anos"
// Pode ter mais de um por pessoa: aos 16 o menor deixa de ser representado e
// passa a ser assistido; aos 18 a representação cessa. Quem avisa é o cron
// diário, no sino dos administradores — o sistema SÓ avisa, não altera nada.
// ============================================================
function CampoAvisosIdade({ avisos, setAvisos, dataNascimento, somenteLeitura = false }) {
  const [novaIdade, setNovaIdade] = useState('');
  const [erro, setErro]           = useState('');

  function adicionar() {
    const n = parseInt(novaIdade, 10);
    if (!Number.isInteger(n) || n < 0 || n > 120) { setErro('Informe uma idade de 0 a 120.'); return; }
    if (avisos.some(a => Number(a.idade) === n)) { setErro(`Já existe um aviso para ${n} anos.`); return; }
    setAvisos([...avisos, { idade: n, avisado_em: null }].sort((a, b) => a.idade - b.idade));
    setNovaIdade('');
    setErro('');
  }

  function remover(idade) {
    setAvisos(avisos.filter(a => Number(a.idade) !== Number(idade)));
    setErro('');
  }

  return (
    <div style={{ marginTop: '4px', marginBottom: '8px' }}>
      <h4 style={{ margin: '12px 0 6px', color: '#555', fontSize: '13px', fontWeight: 600 }}>
        Avisos de idade <span style={{ fontWeight: 400, color: '#888' }}>— opcional</span>
      </h4>
      <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 8px' }}>
        No dia em que a pessoa completar a idade marcada, os administradores recebem um aviso no sino.
        O sistema apenas avisa — não muda nada no cadastro nem nos processos.
      </p>

      {!dataNascimento && (
        <div style={{ padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a',
          borderRadius: '6px', fontSize: '12px', color: '#92400e', marginBottom: '8px' }}>
        ⚠️ Sem a data de nascimento preenchida o sistema não tem como calcular a idade, e o aviso nunca vai disparar.
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
        {avisos.map(a => (
          <span key={a.idade} style={{
            background: a.avisado_em ? '#e2e8f0' : '#dcfce7',
            color:      a.avisado_em ? '#475569' : '#166534',
            borderRadius: '20px', padding: '4px 12px', fontSize: '13px',
            display: 'flex', alignItems: 'center', gap: '6px' }}>
            {a.idade} anos
            {a.avisado_em && (
              <span style={{ fontSize: '11px', opacity: 0.9 }}>
                ✓ avisado em {formatarData(a.avisado_em)}
              </span>
            )}
            {!somenteLeitura && (
              <button type="button" onClick={() => remover(a.idade)} title="Remover este aviso"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit',
                  fontWeight: 'bold', padding: 0, lineHeight: 1, fontSize: '14px' }}>×</button>
            )}
          </span>
        ))}
        {avisos.length === 0 && (
          <span style={{ color: '#9ca3af', fontSize: '13px' }}>Nenhum aviso configurado</span>
        )}
      </div>

      {!somenteLeitura && (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input className="form-control" type="number" min="0" max="120" placeholder="Idade"
            style={{ width: '110px' }} value={novaIdade}
            onChange={e => { setErro(''); setNovaIdade(e.target.value); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }} />
          <button type="button" className="btn btn-outline" style={{ fontSize: '12px' }} onClick={adicionar}>
            + Adicionar aviso
          </button>
        </div>
      )}
      {erro && <div style={{ marginTop: '6px', color: '#b91c1c', fontSize: '12px' }}>⚠️ {erro}</div>}
    </div>
  );
}

// ============================================================
// RESPONSÁVEL LEGAL — quem representa o menor/incapaz nos atos do processo
// Regra do escritório: SEMPRE UM responsável. Por isso o vínculo mora no
// cadastro do REPRESENTADO (um campo, nunca uma lista) — assim o próprio
// banco impede dois responsáveis, sem depender de ninguém lembrar da regra.
// A lista "Representa" do outro lado é montada a partir deste mesmo vínculo,
// então as duas pontas nunca podem discordar.
// ============================================================
function CampoResponsavelLegal({ form, set, opcoesParentesco, onNovoParentesco, somenteLeitura = false, pessoaIdAtual = null }) {
  const [busca, setBusca]         = useState('');
  const [resultados, setResult]   = useState([]);
  const [buscando, setBuscando]   = useState(false);
  const [cadastroAberto, setCadastroAberto] = useState(false);

  const temResponsavel = !!form.responsavel_id;
  const ehResponsavel  = (form.representados?.length || 0) > 0;

  async function buscar(termo) {
    setBusca(termo);
    if (termo.trim().length < 2) { setResult([]); return; }
    setBuscando(true);
    try {
      // selecao: 1 → só nome/CPF, quem começa pelo termo primeiro (ver pessoasController).
      const { data } = await pessoasAPI.listarFisicas({ busca: termo.trim(), limite: 8, selecao: 1 });
      // Ninguém é responsável por si mesmo — o próprio cadastro sai da lista
      if (data.ok) setResult((data.dados.registros || []).filter(p => p.id !== pessoaIdAtual));
    } catch {
      // Busca é auxiliar: se falhar, não trava o cadastro
    } finally {
      setBuscando(false);
    }
  }

  function escolher(p) {
    set('responsavel_id', p.id);
    set('responsavel_nome', p.nome);
    setBusca('');
    setResult([]);
  }

  function limpar() {
    set('responsavel_id', null);
    set('responsavel_nome', '');
    set('parentesco_id', '');
  }

  return (
    <>
      <h4 style={{margin:'16px 0 8px',color:'#555',fontSize:'13px',fontWeight:600}}>
        Responsável legal <span style={{fontWeight:400,color:'#888'}}>— para menor ou incapaz</span>
      </h4>

      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Responsável</label>

          {temResponsavel ? (
            <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
              <div style={{ flex:1, padding:'8px 12px', background:'#eef2ff', border:'1px solid #c7d2fe',
                borderRadius:'6px', fontSize:'13px' }}>
                {form.responsavel_nome || 'Pessoa selecionada'}
              </div>
              {!somenteLeitura && (
                <button type="button" className="btn btn-outline" title="Remover o responsável legal"
                  style={{ padding:'6px 10px', flexShrink:0 }} onClick={limpar}>✕</button>
              )}
            </div>
          ) : ehResponsavel ? (
            <div style={{ padding:'8px 12px', background:'#f8fafc', border:'1px solid #e2e8f0',
              borderRadius:'6px', fontSize:'12px', color:'#475569' }}>
              Esta pessoa já é responsável legal de outra(s) — por isso ela mesma não pode ter um responsável.
            </div>
          ) : somenteLeitura ? (
            <div style={{ padding:'8px 12px', color:'#6b7280', fontSize:'13px' }}>—</div>
          ) : (
            <div style={{ display:'flex', gap:'6px' }}>
              <div style={{ flex:1, position:'relative' }}>
                <input className="form-control" placeholder="Buscar pessoa já cadastrada..."
                  value={busca} onChange={e => buscar(e.target.value)} />
                {resultados.length > 0 && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff',
                    border:'1px solid #ddd', borderRadius:'6px', zIndex:20, maxHeight:'160px',
                    overflowY:'auto', boxShadow:'0 4px 12px rgba(0,0,0,0.1)' }}>
                    {resultados.map(p => (
                      <div key={p.id}
                        style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid #f0f0f0', fontSize:'13px' }}
                        onClick={() => escolher(p)}>
                        {p.nome}{p.cpf ? ` — ${mascaraCPF(p.cpf)}` : ''}
                      </div>
                    ))}
                  </div>
                )}
                {busca.trim().length >= 2 && !buscando && resultados.length === 0 && (
                  <small style={{ color:'#6b7280', fontSize:'12px' }}>
                    Ninguém encontrado com esse nome. Use o … para cadastrar agora.
                  </small>
                )}
              </div>
              <button type="button" className="btn btn-outline"
                title="Cadastrar uma pessoa que ainda não está no sistema"
                style={{ padding:'0 12px', fontSize:'16px', flexShrink:0 }}
                onClick={() => setCadastroAberto(true)}>…</button>
            </div>
          )}
        </div>

        {/* Parentesco só faz sentido depois de escolher o responsável */}
        <SelectComAdicao
          label="Parentesco"
          value={form.parentesco_id || ''}
          onChange={v => set('parentesco_id', v)}
          opcoes={opcoesParentesco}
          tipo="parentescos"
          onNovoItem={onNovoParentesco}
          somenteLeitura={somenteLeitura || !temResponsavel}
        />
      </div>

      {/* Quem esta pessoa representa — vem do vínculo, não é digitado aqui */}
      {ehResponsavel && (
        <div style={{ marginTop:'4px', marginBottom:'8px', padding:'10px 12px', background:'#f8fafc',
          border:'1px solid #e2e8f0', borderRadius:'6px' }}>
          <div style={{ fontSize:'12px', fontWeight:600, color:'#475569', marginBottom:'6px' }}>
            Representa
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
            {form.representados.map(r => (
              <span key={r.id} style={{ background:'#e0e7ff', color:'#3730a3', borderRadius:'20px',
                padding:'4px 12px', fontSize:'13px' }}>
                {r.nome}{r.parentesco_nome ? ` — ${r.parentesco_nome}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {cadastroAberto && (
        <ModalCadastroRapidoParte
          tipo="fisica"
          onFechar={() => setCadastroAberto(false)}
          onSalvo={p => { escolher({ id: p.id, nome: p.nome }); setCadastroAberto(false); }}
        />
      )}
    </>
  );
}

// ============================================================
// CAMPO NOME COMPLETO — exige pelo menos duas palavras (nome + sobrenome)
// Avisa ao sair do campo, bloqueia no Salvar também
// ============================================================
function CampoNomeCompleto({ value, onChange, somenteLeitura = false, refCampo }) {
  const [erroNome, setErroNome] = useState('');

  function handleBlur() {
    // Aplica Title Case ao sair do campo e atualiza o valor no formulário pai
    if (value) onChange(toTitleCase(value));
    const partes = (value || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 1) {
      setErroNome('Informe o nome completo (nome e sobrenome)');
    } else {
      setErroNome('');
    }
  }

  return (
    <div className="form-group">
      <label className="form-label">Nome completo *</label>
      <input
        ref={refCampo}
        type="text"
        className={`form-control ${erroNome ? 'is-invalid' : ''}`}
        value={value}
        disabled={somenteLeitura}
        onChange={e => { setErroNome(''); onChange(e.target.value); }}
        onBlur={handleBlur}
        placeholder="Nome e Sobrenome"
      />
      {erroNome && <small style={{ color: '#e74c3c', fontSize: '12px' }}>⚠️ {erroNome}</small>}
    </div>
  );
}

// ============================================================
// CAMPO CEP — máscara xxxxx-xxx + busca automática via ViaCEP
// onAutoFill: chamado com { logradouro, bairro, cidade, estado }
// após busca bem-sucedida
// ============================================================
function CampoCEP({ value, onChange, onAutoFill, somenteLeitura = false }) {
  const [buscando, setBuscando] = useState(false);
  const [erroCep, setErroCep]   = useState('');

  // Aplica máscara xxxxx-xxx durante a digitação
  function mascaraCEP(v) {
    const limpo = v.replace(/\D/g, '').slice(0, 8);
    return limpo.replace(/(\d{5})(\d)/, '$1-$2');
  }

  function handleChange(e) {
    setErroCep('');
    onChange(mascaraCEP(e.target.value));
  }

  // Ao sair do campo: busca endereço na API ViaCEP (gratuita, sem autenticação)
  async function handleBlur() {
    const limpo = (value || '').replace(/\D/g, '');
    if (!limpo) return;
    if (limpo.length < 8) { setErroCep('CEP incompleto'); return; }

    setBuscando(true);
    setErroCep('');
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const dados = await resp.json();

      if (dados.erro) {
        setErroCep('CEP não encontrado');
        return;
      }

      // Repassa os dados para o formulário pai preencher os campos
      onAutoFill({
        logradouro: dados.logradouro || '',
        bairro:     dados.bairro     || '',
        cidade:     dados.localidade || '',
        estado:     dados.uf         || '',
      });
    } catch {
      setErroCep('Erro ao consultar CEP — verifique a conexão');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="form-group">
      <label className="form-label">CEP</label>
      <input
        type="text"
        autoComplete="off"
        className={`form-control ${erroCep ? 'is-invalid' : ''}`}
        value={value}
        disabled={somenteLeitura}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="00000-000"
        maxLength={9}
      />
      {buscando && <small style={{ color: '#888', fontSize: '12px' }}>🔍 Buscando endereço...</small>}
      {erroCep  && <small style={{ color: '#e74c3c', fontSize: '12px' }}>⚠️ {erroCep}</small>}
    </div>
  );
}

// ============================================================
// CAMPO CTPS — radio Digital/Física + campos condicionais
// Quando Digital: oculta Núm/Série e persiste "Digital" no banco
// Quando Física: exibe campos Núm. e Série para preenchimento
// ============================================================
function CampoCTPS({ tipo, numero, serie, onChangeTipo, onChangeNumero, onChangeSerie, somenteLeitura = false }) {
  const eFisica = tipo !== 'digital';

  return (
    <div className="form-group">
      <label className="form-label">CTPS</label>
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>

        {/* Seleção de tipo: Digital ou Física */}
        <div style={{ display: 'flex', gap: '16px', flexShrink: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
            <input type="radio" checked={!eFisica} disabled={somenteLeitura} onChange={() => onChangeTipo('digital')} />
            Digital
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
            <input type="radio" checked={eFisica} disabled={somenteLeitura} onChange={() => onChangeTipo('fisica')} />
            Física
          </label>
        </div>

        {/* Campos Núm. e Série — só exibidos quando Física */}
        {eFisica && (
          <>
            <input
              className="form-control" style={{ flex: 1, minWidth: '100px' }}
              placeholder="Núm. CTPS"
              value={numero}
              disabled={somenteLeitura}
              onChange={e => onChangeNumero(e.target.value)}
            />
            <input
              className="form-control" style={{ flex: '0 0 90px' }}
              placeholder="Série"
              value={serie}
              disabled={somenteLeitura}
              onChange={e => onChangeSerie(e.target.value)}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// COMPONENTES AUXILIARES BÁSICOS
// Campo usa forwardRef para permitir que o pai passe um ref
// (usado pelo CampoCEP para mover o cursor para o campo Número)
// ============================================================
// onBlur opcional — usado para aplicar Title Case ao sair do campo
const Campo = React.forwardRef(function Campo({ label, value, onChange, onBlur, type='text', placeholder='', somenteLeitura=false }, ref) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input ref={ref} type={type} autoComplete="off" className="form-control" value={value} disabled={somenteLeitura} onChange={e=>onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} />
    </div>
  );
});
function Select({ label, value, onChange, opcoes=[] }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <select className="form-control" value={value} onChange={e=>onChange(e.target.value)}>
        <option value="">— Selecione —</option>
        {opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
      </select>
    </div>
  );
}
