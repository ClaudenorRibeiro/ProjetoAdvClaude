// ============================================================
// PÁGINA DE PESSOAS — Lista e cadastro de PF e PJ
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { pessoasAPI } from '../../services/api';
import { formatarCPF, formatarCNPJ, formatarData, mascaraCPF, validarCPF, mascaraCNPJ, validarCNPJ, toTitleCase } from '../../utils/formatters';
import { toast } from 'react-toastify';
import GerarDocumentoBotao from '../../components/GerarDocumento';
import GerarDocumentoPartesBotao from '../../components/GerarDocumentoPartes';
import { useAuth } from '../../context/AuthContext';
import NumeroProcessoCopiavel from '../../components/NumeroProcessoCopiavel';

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
  const { ehAdmin } = useAuth(); // admin e superadmin (nível <= 1) — controla o botão de unificar
  const [aba, setAba]             = useState('fisicas'); // 'fisicas' | 'juridicas'
  const [lista, setLista]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [busca, setBusca]         = useState('');
  const [pagina, setPagina]       = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [pessoaSelecionada, setPessoaSelecionada] = useState(null);
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
      const { data } = await fn({ busca, pagina, limite: LIMITE });
      if (data.ok) {
        setLista(data.dados.registros);
        setTotal(data.dados.total);
      }
    } catch { toast.error('Erro ao carregar pessoas'); }
    finally { setCarregando(false); }
  }, [aba, busca, pagina]);

  useEffect(() => { carregar(); }, [carregar]);

  function abrirNovoCadastro() { setPessoaSelecionada(null); setModalAberto(true); }
  function abrirEdicao(pessoa) { setPessoaSelecionada(pessoa); setModalAberto(true); }

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
        setModalAberto(true);
      }, 50);
    } else if (recarregar) {
      carregar();
    }
  }

  // Limpa a caixa de busca e volta para a primeira página
  function limparBusca() { setBusca(''); setPagina(1); }

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
            value={busca}
            onChange={e => { setBusca(e.target.value); setPagina(1); }}
          />
          {/* Limpar pesquisa — só aparece quando há algo digitado na busca */}
          {busca && (
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
        {carregando ? <div className="loading">Carregando...</div> : (
          <div className="tabela-wrapper" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            {aba === 'fisicas' ? (
              <TabelaFisicas lista={lista} onEditar={abrirEdicao} onExcluir={pedirConfirmacaoExclusao}
                onVerProcessos={abrirProcessos}
                modoUnificar={modoUnificar} selecionados={selUnificar} onToggleSel={toggleSelUnificar} />
            ) : (
              <TabelaJuridicas lista={lista} onEditar={abrirEdicao} onExcluir={pedirConfirmacaoExclusao}
                onVerProcessos={abrirProcessos}
                modoUnificar={modoUnificar} selecionados={selUnificar} onToggleSel={toggleSelUnificar} />
            )}
            {lista.length === 0 && <p className="lista-vazia">Nenhum registro encontrado</p>}
          </div>
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

function TabelaFisicas({ lista, onEditar, onExcluir, onVerProcessos, modoUnificar, selecionados = [], onToggleSel }) {
  const estaSel = (id) => selecionados.some(x => x.id === id);
  return (
    <table className="tabela tabela-sticky">
      <thead>
        <tr>
          {modoUnificar && <th style={{width:'34px'}}></th>}
          <th>Nome</th><th>CPF</th><th>Telefone</th><th>E-mail</th><th style={{textAlign:'center'}}>Qtde Proc</th><th>Ações</th>
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
            <td><strong>{p.nome}</strong></td>
            <td>{formatarCPF(p.cpf)}</td>
            <td>{p.telefone || '—'}</td>
            <td>{p.email || '—'}</td>
            <CelulaQtdeProc qtde={p.qtde_proc} onClick={() => onVerProcessos(p)} />
            <td style={{display:'flex',gap:'6px'}}>
              <button className="btn btn-outline" style={{fontSize:'12px',padding:'4px 10px'}} onClick={() => onEditar(p)}>
                Editar
              </button>
              <button
                className="btn"
                style={{fontSize:'12px',padding:'4px 10px',background:'#fff',color:'#dc3545',border:'1px solid #dc3545'}}
                onClick={() => onExcluir(p)}
              >
                Excluir
              </button>
              {/* Gerar documento — sempre visível; o modal lista os modelos desta origem (ou avisa se não houver). */}
              <GerarDocumentoBotao ancoraTipo="pessoa_fisica" ancoraId={p.id}
                estilo={{fontSize:'12px',padding:'4px 10px'}} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Tabela de pessoas jurídicas
function TabelaJuridicas({ lista, onEditar, onExcluir, onVerProcessos, modoUnificar, selecionados = [], onToggleSel }) {
  const estaSel = (id) => selecionados.some(x => x.id === id);
  return (
    <table className="tabela tabela-sticky">
      <thead>
        <tr>
          {modoUnificar && <th style={{width:'34px'}}></th>}
          <th>Razão Social</th><th>Nome Fantasia</th><th>CNPJ</th><th>Telefone</th><th style={{textAlign:'center'}}>Qtde Proc</th><th>Ações</th>
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
            <td><strong>{p.razao_social}</strong></td>
            <td>{p.nome_fantasia || '—'}</td>
            <td>{formatarCNPJ(p.cnpj)}</td>
            <td>{p.telefone || '—'}</td>
            <CelulaQtdeProc qtde={p.qtde_proc} onClick={() => onVerProcessos(p)} />
            <td style={{display:'flex',gap:'6px'}}>
              <button className="btn btn-outline" style={{fontSize:'12px',padding:'4px 10px'}} onClick={() => onEditar(p)}>
                Editar
              </button>
              <button
                className="btn"
                style={{fontSize:'12px',padding:'4px 10px',background:'#fff',color:'#dc3545',border:'1px solid #dc3545'}}
                onClick={() => onExcluir(p)}
              >
                Excluir
              </button>
              {/* Gerar documento — sempre visível; o modal lista os modelos desta origem (ou avisa se não houver). */}
              <GerarDocumentoBotao ancoraTipo="pessoa_juridica" ancoraId={p.id}
                estilo={{fontSize:'12px',padding:'4px 10px'}} />
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

  const duplicados = selecionados.filter(p => p.id !== principalId);

  async function confirmar() {
    if (!principalId)            return toast.error('Escolha o cadastro principal');
    if (duplicados.length === 0) return toast.error('Selecione ao menos um duplicado além do principal');
    setSalvando(true);
    try {
      const fn = ehFisica ? pessoasAPI.unificarFisicas : pessoasAPI.unificarJuridicas;
      await fn({ principal_id: principalId, duplicados_ids: duplicados.map(p => p.id) });
      toast.success(ehFisica ? 'Pessoas unificadas com sucesso!' : 'Empresas unificadas com sucesso!');
      onFechar(true);
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao unificar');
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
          <p style={{fontSize:'13px',color:'#555',marginBottom:'12px'}}>
            Escolha o cadastro <strong>principal</strong> (o que vai ficar). Todos os processos e
            vínculos dos outros serão movidos para ele, e os demais serão <strong>excluídos do banco</strong>.
          </p>
          {ehFisica && (
            <p style={{fontSize:'12px',color:'#b45309',marginBottom:'12px'}}>
              Observação: cadastros com <strong>CPFs diferentes</strong> não podem ser unificados
              (o sistema bloqueia — CPFs diferentes indicam pessoas diferentes).
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
function ModalPessoa({ tipo, pessoa, onFechar, onAbrirEdicao }) {
  const [form, setForm]         = useState(pessoa || {});
  const [auxiliares, setAux]    = useState({ estados_civis: [], generos: [], profissoes: [], nacionalidades: [] });
  const [salvando, setSalvando] = useState(false);
  const [telefones, setTelefones] = useState(pessoa?.telefones || [{ numero: '', tipo: '', principal: true }]);
  const [emails, setEmails]       = useState(pessoa?.emails || [{ email: '', principal: true }]);
  // Ref do campo Número — recebe o foco automaticamente após o CEP ser preenchido
  const refNumero = useRef(null);

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

  async function salvar() {
    if (tipo === 'fisicas') {
      // ── Campos obrigatórios de Pessoa Física ──────────────────────────
      if (!form.nome?.trim()) return toast.error('Nome é obrigatório');
      const partes = form.nome.trim().split(/\s+/).filter(Boolean);
      if (partes.length < 2)  return toast.error('Informe o nome completo (nome e sobrenome)');

      if (!form.cpf?.replace(/\D/g, ''))
        return toast.error('CPF é obrigatório');
      if (!form.data_nascimento)
        return toast.error('Data de nascimento é obrigatória');
      if (!form.genero_id)
        return toast.error('Gênero é obrigatório');
      if (!form.estado_civil_id)
        return toast.error('Estado civil é obrigatório');
      if (!form.profissao_id)
        return toast.error('Profissão é obrigatória');
      if (!form.nacionalidade_id)
        return toast.error('Nacionalidade é obrigatória');

      // Primeiro telefone obrigatório
      if (!telefones[0]?.numero?.replace(/\D/g, ''))
        return toast.error('Pelo menos um telefone é obrigatório');

      // Valida formato dos e-mails preenchidos
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const em of emails) {
        if (em.email && !emailRegex.test(em.email.trim())) {
          return toast.error(`E-mail inválido: "${em.email}"`);
        }
      }

      // Valida data de nascimento — não pode ser futura
      const hoje = new Date().toISOString().split('T')[0];
      if (form.data_nascimento > hoje)
        return toast.error('Data de nascimento não pode ser uma data futura');
    }

    if (!form.razao_social && tipo === 'juridicas') return toast.error('Razão social é obrigatória');

    setSalvando(true);
    try {
      const payload = { ...form, telefones, emails };
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
      toast.error(err.response?.data?.mensagem || 'Erro ao salvar');
    } finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box modal-grande">
        <div className="modal-header">
          <h3>{pessoa ? 'Editar' : 'Nova'} {tipo === 'fisicas' ? 'Pessoa Física' : 'Pessoa Jurídica'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>

        <div className="modal-body">
          {tipo === 'fisicas' ? (
            <>
              <div className="grid-2">
                {/* CampoNome exige ao menos duas palavras ao sair do campo */}
                <CampoNomeCompleto value={form.nome||''} onChange={v=>set('nome',v)} />
                {/* CampoCPF aplica máscara, valida algoritmo e verifica duplicata no banco */}
                <CampoCPF
                  value={form.cpf||''}
                  onChange={v=>set('cpf',v)}
                  pessoaIdAtual={pessoa?.id || null}
                  onAbrirEdicao={onAbrirEdicao}
                />
              </div>
              <div className="grid-4">
                <Campo label="RG" value={form.rg||''} onChange={v=>set('rg',v)} />
                {/* Órgão expedidor: SSP/SP, DETRAN/RJ, etc. */}
                <Campo label="Órgão Expedidor" value={form.rg_orgao||''} onChange={v=>set('rg_orgao',v)} placeholder="SSP/SP" />
                {/* CampoData bloqueia datas futuras — ninguém nasce amanhã */}
                <CampoDataNascimento value={form.data_nascimento?.split('T')[0]||''} onChange={v=>set('data_nascimento',v)} />
                <SelectComAdicao
                  label="Gênero" value={form.genero_id||''} onChange={v=>set('genero_id',v)}
                  opcoes={auxiliares.generos} tipo="generos"
                  onNovoItem={item => handleNovoAuxiliar('generos', item)}
                />
              </div>
              {/* Linha 2: PIS + CTPS (Digital/Física com campos condicionais) */}
              <div className="grid-2">
                <Campo label="PIS" value={form.pis||''} onChange={v=>set('pis',v)} placeholder="000.00000.00-0" />
                <CampoCTPS
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
                />
                <SelectComAdicao
                  label="Profissão" value={form.profissao_id||''} onChange={v=>set('profissao_id',v)}
                  opcoes={auxiliares.profissoes} tipo="profissoes"
                  onNovoItem={item => handleNovoAuxiliar('profissoes', item)}
                />
                <SelectComAdicao
                  label="Nacionalidade" value={form.nacionalidade_id||''} onChange={v=>set('nacionalidade_id',v)}
                  opcoes={auxiliares.nacionalidades} tipo="nacionalidades"
                  onNovoItem={item => handleNovoAuxiliar('nacionalidades', item)}
                />
              </div>
              {/* Filiação */}
              <div className="grid-2">
                <Campo label="Pai" value={form.nome_pai||''} onChange={v=>set('nome_pai',v)} onBlur={()=>set('nome_pai', toTitleCase(form.nome_pai))} />
                <Campo label="Mãe" value={form.nome_mae||''} onChange={v=>set('nome_mae',v)} onBlur={()=>set('nome_mae', toTitleCase(form.nome_mae))} />
              </div>
            </>
          ) : (
            <>
              <div className="grid-2">
                <Campo label="Razão Social *" value={form.razao_social||''} onChange={v=>set('razao_social',v)} onBlur={()=>set('razao_social', toTitleCase(form.razao_social))} />
                <Campo label="Nome Fantasia" value={form.nome_fantasia||''} onChange={v=>set('nome_fantasia',v)} onBlur={()=>set('nome_fantasia', toTitleCase(form.nome_fantasia))} />
              </div>
              <div className="grid-2">
                <CampoCNPJ value={form.cnpj||''} onChange={v=>set('cnpj',v)} />
              </div>
            </>
          )}

          {/* Endereço */}
          <h4 style={{margin:'16px 0 8px',color:'#555',fontSize:'13px',fontWeight:600}}>Endereço</h4>
          {/* Linha 1: CEP (busca automática) + Logradouro */}
          <div className="grid-2">
            <CampoCEP value={form.cep||''} onChange={v=>set('cep',v)} onAutoFill={handleCEPAutoFill} />
            <Campo label="Logradouro" value={form.logradouro||''} onChange={v=>set('logradouro',v)} onBlur={()=>set('logradouro', toTitleCase(form.logradouro))} />
          </div>
          {/* Linha 2: Número (recebe foco do CEP) + Complemento + Bairro */}
          <div className="grid-3">
            <Campo label="Número" value={form.numero||''} onChange={v=>set('numero',v)} ref={refNumero} />
            <Campo label="Complemento" value={form.complemento||''} onChange={v=>set('complemento',v)} onBlur={()=>set('complemento', toTitleCase(form.complemento))} placeholder="Apto, sala, bloco..." />
            <Campo label="Bairro" value={form.bairro||''} onChange={v=>set('bairro',v)} onBlur={()=>set('bairro', toTitleCase(form.bairro))} />
          </div>
          {/* Linha 3: Cidade + Estado */}
          <div className="grid-2">
            <Campo label="Cidade" value={form.cidade||''} onChange={v=>set('cidade',v)} onBlur={()=>set('cidade', toTitleCase(form.cidade))} />
            <Campo label="Estado" value={form.estado||''} onChange={v=>set('estado',v)} placeholder="SP" />
          </div>

          {/* Telefones */}
          <h4 style={{margin:'16px 0 8px',color:'#555',fontSize:'13px',fontWeight:600}}>Telefones</h4>
          {telefones.map((tel, i) => (
            <LinhaFone
              key={i}
              tel={tel}
              index={i}
              onChange={v => setTelefones(t => t.map((x,j) => j===i ? v : x))}
              onRemove={() => setTelefones(t => t.filter((_,j) => j!==i))}
            />
          ))}
          <button className="btn btn-outline" style={{fontSize:'12px'}} onClick={() => setTelefones(t=>[...t,{numero:'',tipo:'',principal:false}])}>
            + Adicionar telefone
          </button>

          {/* E-mails */}
          <h4 style={{margin:'16px 0 8px',color:'#555',fontSize:'13px',fontWeight:600}}>E-mails</h4>
          {emails.map((em, i) => (
            <LinhaEmail
              key={i}
              email={em.email}
              index={i}
              onChange={v => setEmails(t => t.map((x,j) => j===i ? {...x, email: v} : x))}
              onRemove={() => setEmails(t => t.filter((_,j) => j!==i))}
            />
          ))}
          <button className="btn btn-outline" style={{fontSize:'12px'}} onClick={() => setEmails(e=>[...e,{email:'',principal:false}])}>
            + Adicionar e-mail
          </button>

          {/* Observações */}
          <div className="form-group" style={{marginTop:'16px'}}>
            <label className="form-label">Observações</label>
            <textarea className="form-control" rows={3} value={form.observacoes||''} onChange={e=>set('observacoes',e.target.value)} onBlur={()=>set('observacoes', toTitleCase(form.observacoes))} />
          </div>
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

// ============================================================
// CAMPO CPF — máscara automática + validação + duplicata
// pessoaIdAtual: id da pessoa em edição (evita alertar sobre ela mesma)
// onAbrirEdicao: callback chamado com { id, nome, cpf } quando usuário quer editar a duplicata
// ============================================================
function CampoCPF({ value, onChange, pessoaIdAtual = null, onAbrirEdicao = null }) {
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
      <label className="form-label">CPF</label>
      <input
        type="text"
        className={`form-control ${erroCpf ? 'is-invalid' : ''}`}
        value={value}
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
function CampoCNPJ({ value, onChange }) {
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
        value={value}
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
function CampoDataNascimento({ value, onChange }) {
  const [erroData, setErroData] = useState('');
  // Calcula "hoje" no formato YYYY-MM-DD para o atributo max
  const hoje = new Date().toISOString().split('T')[0];

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
        type="date"
        className={`form-control ${erroData ? 'is-invalid' : ''}`}
        value={value}
        max={hoje}
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
function SelectComAdicao({ label, value, onChange, opcoes = [], tipo, onNovoItem }) {
  const [miniFormAberto, setMiniFormAberto] = useState(false);
  const [novoNome, setNovoNome]             = useState('');
  const [salvando, setSalvando]             = useState(false);

  // Fecha o mini form e limpa o estado — sem sujeira
  function fecharMiniForm() {
    setMiniFormAberto(false);
    setNovoNome('');
  }

  async function salvarNovo() {
    if (!novoNome.trim()) return toast.error('Digite um nome para cadastrar');
    setSalvando(true);
    try {
      const { data } = await pessoasAPI.criarAuxiliar(tipo, { nome: novoNome.trim() });
      if (data.ok) {
        toast.success(`"${data.dados.nome}" cadastrado com sucesso!`);
        onNovoItem(data.dados); // atualiza lista e auto-seleciona no form pai
        fecharMiniForm();
      }
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao cadastrar');
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
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1 }}
        >
          <option value="">— Selecione —</option>
          {opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        {/* Botão "..." abre mini formulário para cadastrar novo item */}
        <button
          type="button"
          title={`Cadastrar novo(a) ${label} que não está na lista`}
          className="btn btn-outline"
          style={{ padding: '6px 10px', fontSize: '15px', flexShrink: 0, lineHeight: 1 }}
          onClick={() => setMiniFormAberto(v => !v)}
        >
          …
        </button>
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
              onChange={e => setNovoNome(e.target.value)}
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
        </div>
      )}
    </div>
  );
}

// ============================================================
// CAMPO NOME COMPLETO — exige pelo menos duas palavras (nome + sobrenome)
// Avisa ao sair do campo, bloqueia no Salvar também
// ============================================================
function CampoNomeCompleto({ value, onChange }) {
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
        type="text"
        className={`form-control ${erroNome ? 'is-invalid' : ''}`}
        value={value}
        onChange={e => { setErroNome(''); onChange(e.target.value); }}
        onBlur={handleBlur}
        placeholder="Nome e Sobrenome"
      />
      {erroNome && <small style={{ color: '#e74c3c', fontSize: '12px' }}>⚠️ {erroNome}</small>}
    </div>
  );
}

// ============================================================
// LINHA FONE — número com máscara + campo de texto livre para descrição
// O usuário digita o que quiser: "Celular", "esposa Edna", "WhatsApp trabalho", etc.
// ============================================================
function LinhaFone({ tel, index, onChange, onRemove }) {
  // Máscara adaptativa: fixo (xx) xxxx-xxxx ou celular (xx) xxxxx-xxxx
  function mascaraTelefone(value) {
    const limpo = value.replace(/\D/g, '').slice(0, 11);
    if (!limpo) return '';
    if (limpo.length <= 2)  return `(${limpo}`;
    if (limpo.length <= 6)  return `(${limpo.slice(0,2)}) ${limpo.slice(2)}`;
    if (limpo.length <= 10) return `(${limpo.slice(0,2)}) ${limpo.slice(2,6)}-${limpo.slice(6)}`;
    return                         `(${limpo.slice(0,2)}) ${limpo.slice(2,7)}-${limpo.slice(7)}`;
  }

  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
      {/* Número com máscara automática */}
      <input
        className="form-control"
        style={{ flex: 2 }}
        placeholder="(11) 99999-9999"
        value={tel.numero}
        maxLength={15}
        onChange={e => onChange({ ...tel, numero: mascaraTelefone(e.target.value) })}
      />
      {/* Descrição livre: Celular, Comercial, esposa Edna, recado... */}
      <input
        className="form-control"
        style={{ flex: 1 }}
        placeholder="Descrição do Telefone"
        value={tel.tipo || ''}
        onChange={e => onChange({ ...tel, tipo: e.target.value })}
      />
      {/* Botão remover — só aparece a partir da segunda linha */}
      {index > 0 && (
        <button
          type="button"
          className="btn btn-danger"
          style={{ padding: '6px 10px', flexShrink: 0 }}
          onClick={onRemove}
        >✕</button>
      )}
    </div>
  );
}

// ============================================================
// LINHA EMAIL — campo de e-mail com validação de formato no blur
// ============================================================
function LinhaEmail({ email, index, onChange, onRemove }) {
  const [erroEmail, setErroEmail] = useState('');
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function handleBlur() {
    if (email && !emailRegex.test(email.trim())) {
      setErroEmail('E-mail inválido');
    } else {
      setErroEmail('');
    }
  }

  return (
    <div style={{ marginBottom: erroEmail ? '4px' : '8px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          className={`form-control ${erroEmail ? 'is-invalid' : ''}`}
          style={{ flex: 1 }}
          placeholder="email@exemplo.com"
          value={email}
          onChange={e => { setErroEmail(''); onChange(e.target.value); }}
          onBlur={handleBlur}
        />
        {index > 0 && (
          <button
            type="button"
            className="btn btn-danger"
            style={{ padding: '6px 10px', flexShrink: 0 }}
            onClick={onRemove}
          >✕</button>
        )}
      </div>
      {erroEmail && <small style={{ color: '#e74c3c', fontSize: '12px' }}>⚠️ {erroEmail}</small>}
    </div>
  );
}

// ============================================================
// CAMPO CEP — máscara xxxxx-xxx + busca automática via ViaCEP
// onAutoFill: chamado com { logradouro, bairro, cidade, estado }
// após busca bem-sucedida
// ============================================================
function CampoCEP({ value, onChange, onAutoFill }) {
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
function CampoCTPS({ tipo, numero, serie, onChangeTipo, onChangeNumero, onChangeSerie }) {
  const eFisica = tipo !== 'digital';

  return (
    <div className="form-group">
      <label className="form-label">CTPS</label>
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>

        {/* Seleção de tipo: Digital ou Física */}
        <div style={{ display: 'flex', gap: '16px', flexShrink: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
            <input type="radio" checked={!eFisica} onChange={() => onChangeTipo('digital')} />
            Digital
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
            <input type="radio" checked={eFisica} onChange={() => onChangeTipo('fisica')} />
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
              onChange={e => onChangeNumero(e.target.value)}
            />
            <input
              className="form-control" style={{ flex: '0 0 90px' }}
              placeholder="Série"
              value={serie}
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
const Campo = React.forwardRef(function Campo({ label, value, onChange, onBlur, type='text', placeholder='' }, ref) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input ref={ref} type={type} autoComplete="off" className="form-control" value={value} onChange={e=>onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} />
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
