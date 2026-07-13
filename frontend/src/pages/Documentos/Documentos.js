// ============================================================
// PÁGINA DE DOCUMENTOS — Gestão de MODELOS (.docx)
// ------------------------------------------------------------
// FASE 1: cadastrar/listar/editar/desativar modelos de documento.
// O modelo é um arquivo .docx (com marcadores {{variavel}}) guardado
// no S3. A geração de documentos a partir dos modelos vem na Fase 2.
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { documentosAPI } from '../../services/api';
import { toTitleCase } from '../../utils/formatters';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import ModalConfirmar from '../../components/ui/ModalConfirmar';

// Rótulo amigável do "destino" do modelo (a que situação ele se aplica).
function rotuloDestino(m) {
  const mod = m.modalidade === 'virtual' ? 'Virtual' : (m.modalidade === 'presencial' ? 'Presencial' : '');
  switch (m.destino) {
    case 'recibo_cliente':  return { texto: 'Recibo: Cliente',  cor: 'badge-roxo' };
    case 'recibo_parceria': return { texto: 'Recibo: Parceria', cor: 'badge-roxo' };
    case 'multipessoas':    return { texto: 'Partes (autores/réus)', cor: 'badge-verde' };
    case 'audiencia': return { texto: `Audiência: ${m.tipo_audiencia_nome || '—'}${mod ? ' · ' + mod : ''}`, cor: 'badge-azul' };
    case 'pericia':   return { texto: `Perícia: ${m.tipo_pericia_nome || '—'}`, cor: 'badge-azul' };
    case 'prazo':     return { texto: `Prazo: ${m.subtipo_prazo_nome || '—'}`, cor: 'badge-azul' };
    default:          return { texto: 'Comum', cor: 'badge-cinza' };
  }
}

export default function Documentos() {
  const { temPermissao } = useAuth();
  const podeVer        = temPermissao('documentos.modelos', 'visualizar');
  const podeCadastrar  = temPermissao('documentos.modelos', 'cadastrar');
  const podeAlterar    = temPermissao('documentos.modelos', 'alterar');
  const podeExcluir    = temPermissao('documentos.modelos', 'excluir');
  const podeHistorico  = temPermissao('documentos', 'historico');

  const [modelos, setModelos]       = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [modeloEditando, setModeloEditando] = useState(null);
  const [modeloExcluir, setModeloExcluir] = useState(null); // modelo aguardando confirmação de exclusão

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      // incluir_inativos: a tela de gestão mostra também os desativados (para reativar)
      const { data } = await documentosAPI.listarModelos(true);
      if (data.ok) setModelos(data.dados);
    } catch {
      toast.error('Erro ao carregar modelos');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { if (podeVer) carregar(); }, [podeVer, carregar]);

  // Baixa o .docx original do modelo (para editar no Word e re-subir).
  async function baixar(m) {
    try {
      const resp = await documentosAPI.baixarModelo(m.id);
      const url = URL.createObjectURL(new Blob([resp.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${m.nome}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao baixar o modelo');
    }
  }

  async function desativar(m) {
    try {
      await documentosAPI.desativarModelo(m.id);
      toast.success('Modelo desativado');
      carregar();
    } catch { toast.error('Erro ao desativar'); }
  }
  async function reativar(m) {
    try {
      await documentosAPI.reativarModelo(m.id);
      toast.success('Modelo reativado');
      carregar();
    } catch { toast.error('Erro ao reativar'); }
  }
  // Exclusão DEFINITIVA (após confirmação no ModalConfirmar). Diferente de "Desativar": é permanente.
  async function excluir(m) {
    try {
      await documentosAPI.excluirModelo(m.id);
      toast.success('Modelo excluído definitivamente');
      carregar();
    } catch { toast.error('Erro ao excluir'); }
  }

  if (!podeVer) {
    return <div className="card"><p className="lista-vazia">Você não tem permissão para ver os modelos de documento.</p></div>;
  }

  return (
    <div>
      {/* ===== MODELOS ===== */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', gap: '8px', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Modelos de documento</h3>
          {podeCadastrar && (
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }}
              onClick={() => { setModeloEditando(null); setModalAberto(true); }}>
              + Novo Modelo
            </button>
          )}
        </div>

        {carregando ? <div className="loading">Carregando...</div> : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Modelo</th><th>Tipo</th><th>Dados que usa</th>
                  <th>Status</th><th>Criado em</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {modelos.map(m => {
                  const tipo = rotuloDestino(m);
                  return (
                    <tr key={m.id} style={m.ativo ? {} : { opacity: 0.55 }}>
                      <td>
                        <strong>{m.nome}</strong>
                        {m.descricao && <div style={{ fontSize: '11px', color: '#888' }}>{m.descricao}</div>}
                      </td>
                      <td><span className={`badge ${tipo.cor}`}>{tipo.texto}</span></td>
                      <td style={{ fontSize: '12px', color: '#555' }}>
                        {m.blocos_exigidos
                          ? m.blocos_exigidos.split(',').join(', ')
                          : 'Só dados do escritório'}
                      </td>
                      <td>
                        {m.ativo
                          ? <span className="badge badge-verde">Ativo</span>
                          : <span className="badge badge-cinza">Desativado</span>}
                      </td>
                      {/* criado_em é DATETIME ('YYYY-MM-DD HH:MM:SS'); formatamos como data pt-BR */}
                      <td>{m.criado_em ? new Date(m.criado_em).toLocaleDateString('pt-BR') : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 10px' }}
                            onClick={() => baixar(m)}>Baixar</button>
                          {podeAlterar && (
                            <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 10px' }}
                              onClick={() => { setModeloEditando(m); setModalAberto(true); }}>Editar</button>
                          )}
                          {m.ativo
                            ? (podeExcluir && (
                                <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 10px', color: '#d97706', borderColor: '#d97706' }}
                                  onClick={() => desativar(m)}>Desativar</button>
                              ))
                            : (podeAlterar && (
                                <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 10px', color: '#059669', borderColor: '#059669' }}
                                  onClick={() => reativar(m)}>Reativar</button>
                              ))}
                          {/* Exclusão DEFINITIVA — permanente (apaga do banco e do S3); pede confirmação */}
                          {podeExcluir && (
                            <button className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 10px', color: '#dc2626', borderColor: '#dc2626' }}
                              onClick={() => setModeloExcluir(m)}>Excluir</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {modelos.length === 0 && (
              <p className="lista-vazia">
                Nenhum modelo cadastrado. Crie o .docx no Word com os marcadores
                {' '}{'{{variavel}}'} (veja o catálogo abaixo) e clique em "Novo Modelo".
              </p>
            )}
          </div>
        )}
      </div>

      {/* ===== CATÁLOGO DE VARIÁVEIS ===== */}
      <CatalogoVariaveis />

      {/* ===== VARIÁVEIS DO "DOCUMENTO DE PARTES" (multipessoas) ===== */}
      <CatalogoVariaveisPartes />

      {/* ===== HISTÓRICO DE DOCUMENTOS GERADOS ===== */}
      {podeHistorico && <HistoricoDocumentos />}

      {/* Modal criar/editar */}
      {modalAberto && (
        <ModalModelo
          modelo={modeloEditando}
          onBaixar={baixar}
          onFechar={(recarregar) => { setModalAberto(false); if (recarregar) carregar(); }}
        />
      )}

      {/* Confirmação de exclusão DEFINITIVA do modelo */}
      {modeloExcluir && (
        <ModalConfirmar
          titulo="Excluir modelo definitivamente"
          mensagem={`O modelo "${modeloExcluir.nome}" será apagado permanentemente, junto com o arquivo .docx. Esta ação NÃO pode ser desfeita.\n\nO histórico de documentos já gerados é mantido. Se quiser apenas tirar o modelo de uso, use "Desativar".`}
          textoBotao="Excluir definitivamente"
          tipo="perigo"
          acao={async () => { await excluir(modeloExcluir); }}
          onCancelar={() => setModeloExcluir(null)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Catálogo de variáveis disponíveis (referência para montar o .docx).
// Cada variável tem um botão "copiar" que copia {{tag}} para a área de transferência.
// ------------------------------------------------------------
function CatalogoVariaveis() {
  const [catalogo, setCatalogo] = useState(null);
  const [aberto, setAberto] = useState(true);

  useEffect(() => {
    documentosAPI.catalogoVariaveis()
      .then(({ data }) => { if (data.ok) setCatalogo(data.dados); })
      .catch(() => {});
  }, []);

  function copiar(tag) {
    const texto = `{{${tag}}}`;
    navigator.clipboard?.writeText(texto)
      .then(() => toast.success(`Copiado: ${texto}`))
      .catch(() => toast.error('Não foi possível copiar'));
  }

  if (!catalogo) return null;

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setAberto(a => !a)}>
        <h3 style={{ margin: 0 }}>{aberto ? '▼' : '▶'} Variáveis disponíveis nos modelos</h3>
      </div>
      {aberto && (
        <>
          <p style={{ fontSize: '12px', color: '#666', margin: '8px 0 14px' }}>
            Escreva o modelo no Word usando estes marcadores. Clique para copiar.
            O sistema preenche automaticamente conforme a tela onde o documento for gerado.
          </p>
          <div className="grid-2">
            {Object.entries(catalogo).map(([chave, grupo]) => (
              <div key={chave} style={{ marginBottom: '12px' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#1e2a3a' }}>{grupo.label}</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {grupo.variaveis.map(v => (
                    <button key={v.tag} title={v.descricao}
                      onClick={() => copiar(v.tag)}
                      style={{
                        fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer',
                        background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px',
                        padding: '3px 8px', color: '#334155',
                      }}>
                      {`{{${v.tag}}}`}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Catálogo das variáveis do "Documento de partes" (multipessoas) + explicação
// das regiões que se repetem. Card recolhível, começa fechado.
// ------------------------------------------------------------
function CatalogoVariaveisPartes() {
  const [catalogo, setCatalogo] = useState(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    documentosAPI.catalogoVariaveisPartes()
      .then(({ data }) => { if (data.ok) setCatalogo(data.dados); })
      .catch(() => {});
  }, []);

  function copiar(texto) {
    navigator.clipboard?.writeText(texto)
      .then(() => toast.success(`Copiado: ${texto}`))
      .catch(() => toast.error('Não foi possível copiar'));
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setAberto(a => !a)}>
        <h3 style={{ margin: 0 }}>{aberto ? '▼' : '▶'} Variáveis do "Documento de partes" (autores e réus)</h3>
      </div>
      {aberto && catalogo && (
        <>
          <p style={{ fontSize: '12px', color: '#666', margin: '8px 0 6px' }}>
            Use estes modelos para documentos com VÁRIOS autores e/ou réus (ex.: contrato de honorários,
            procuração, declaração). No Word, marque as regiões que se repetem — tudo entre elas é gerado
            uma vez para cada pessoa:
          </p>
          <pre style={{
            background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px',
            padding: '10px', fontSize: '12px', overflowX: 'auto', color: '#334155',
          }}>{`{{#autores}}
  {{nome}}, {{nacionalidade}}, {{estado_civil}}, {{profissao}}, CPF {{cpf}},
  residente em {{endereco}}. Telefones: {{#telefones}}{{numero}} ({{tipo}}); {{/telefones}}
{{/autores}}

{{#reus}}
  {{nome}}, inscrita no CNPJ {{cnpj}}, com sede em {{endereco}}.
{{/reus}}`}</pre>
          <p style={{ fontSize: '12px', color: '#666', margin: '8px 0 8px' }}>
            Dentro de <code>{'{{#autores}}…{{/autores}}'}</code> ou <code>{'{{#reus}}…{{/reus}}'}</code> use as
            variáveis abaixo (clique para copiar). Para listar todos os telefones/e-mails de cada pessoa, use
            as sub-regiões de telefones e e-mails.
          </p>
          {/* Marcadores de região (abrem/fecham os blocos que repetem) — clique para copiar */}
          <div style={{ marginBottom: '10px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#1e2a3a' }}>Marcadores de região (clique para copiar)</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {['{{#autores}}', '{{/autores}}', '{{#reus}}', '{{/reus}}',
                '{{#telefones}}', '{{/telefones}}', '{{#emails}}', '{{/emails}}'].map(marc => (
                <button key={marc} title="Abre/fecha um bloco que se repete"
                  onClick={() => copiar(marc)}
                  style={{
                    fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer',
                    background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '4px',
                    padding: '3px 8px', color: '#3730a3',
                  }}>
                  {marc}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#1e2a3a' }}>{catalogo.label}</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {catalogo.variaveis.map(v => (
                <button key={v.tag} title={v.descricao}
                  onClick={() => copiar(`{{${v.tag}}}`)}
                  style={{
                    fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer',
                    background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px',
                    padding: '3px 8px', color: '#334155',
                  }}>
                  {`{{${v.tag}}}`}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Histórico de documentos gerados (card recolhível, com filtro por período).
// ------------------------------------------------------------
const HIST_POR_PAGINA = 50;
function HistoricoDocumentos() {
  const [aberto, setAberto] = useState(false);
  const [registros, setRegistros] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState({ de: '', ate: '' });
  const totalPaginas = Math.max(1, Math.ceil(total / HIST_POR_PAGINA));

  const carregar = useCallback(() => {
    setCarregando(true);
    documentosAPI.historico({ ...filtro, pagina, limite: HIST_POR_PAGINA })
      .then(({ data }) => { if (data.ok) { setRegistros(data.dados.registros); setTotal(data.dados.total); } })
      .catch(() => toast.error('Erro ao carregar histórico'))
      .finally(() => setCarregando(false));
  }, [filtro, pagina]);

  // Carrega ao abrir o card e sempre que o filtro/página mudarem.
  useEffect(() => { if (aberto) carregar(); }, [aberto, carregar]);

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setAberto(a => !a)}>
        <h3 style={{ margin: 0 }}>{aberto ? '▼' : '▶'} Histórico de documentos gerados</h3>
      </div>
      {aberto && (
        <>
          <div style={{ display: 'flex', gap: '10px', margin: '12px 0', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="form-label">De</label>
              <input type="date" className="form-control" value={filtro.de}
                onChange={e => { setFiltro(f => ({ ...f, de: e.target.value })); setPagina(1); }} />
            </div>
            <div>
              <label className="form-label">Até</label>
              <input type="date" className="form-control" value={filtro.ate}
                onChange={e => { setFiltro(f => ({ ...f, ate: e.target.value })); setPagina(1); }} />
            </div>
            <button className="btn btn-outline" onClick={() => { setPagina(1); carregar(); }}>Filtrar</button>
          </div>
          {carregando ? <div className="loading">Carregando...</div> : (
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr><th>Quando</th><th>Modelo</th><th>Formato</th><th>Origem</th><th>Referência</th><th>Arquivo</th><th>Usuário</th></tr>
                </thead>
                <tbody>
                  {registros.map(r => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(r.gerado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td>{r.modelo_nome}</td>
                      <td><span className="badge badge-azul">{(r.formato || '').toUpperCase()}</span></td>
                      <td>{r.ancora_tipo || '—'}</td>
                      <td style={{ fontSize: '12px', color: '#555' }}>{r.referencia || '—'}</td>
                      <td style={{ fontSize: '12px' }}>{r.nome_arquivo}</td>
                      <td>{r.usuario_nome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {registros.length === 0 && <p className="lista-vazia">Nenhum documento gerado no período.</p>}
            </div>
          )}
          {/* Paginação (50 por página) */}
          {total > HIST_POR_PAGINA && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'center', alignItems: 'center' }}>
              <button className="btn btn-outline" disabled={pagina === 1 || carregando} onClick={() => setPagina(p => p - 1)}>
                ← Anterior
              </button>
              <span style={{ padding: '8px 12px', fontSize: '13px' }}>
                Página {pagina} de {totalPaginas} · {total} registros
              </span>
              <button className="btn btn-outline" disabled={pagina >= totalPaginas || carregando} onClick={() => setPagina(p => p + 1)}>
                Próxima →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Modal de criar/editar modelo.
// ------------------------------------------------------------
function ModalModelo({ modelo, onFechar, onBaixar }) {
  const editando = !!modelo;
  const [form, setForm] = useState({
    nome: modelo?.nome || '',
    descricao: modelo?.descricao || '',
    destino: modelo?.destino || 'comum',
    tipo_audiencia_id: modelo?.tipo_audiencia_id || '',
    modalidade: modelo?.modalidade || '',
    tipo_pericia_id: modelo?.tipo_pericia_id || '',
    subtipo_prazo_id: modelo?.subtipo_prazo_id || '',
    minutos_antes: modelo?.minutos_antes ?? 0,
  });
  const [opcoes, setOpcoes] = useState(null);
  const [arquivo, setArquivo] = useState(null);
  const [salvando, setSalvando] = useState(false);

  // Carrega as listas (tipos de audiência/perícia, subtipos de prazo) para o seletor de destino.
  useEffect(() => {
    documentosAPI.destinosOpcoes()
      .then(({ data }) => { if (data.ok) setOpcoes(data.dados); })
      .catch(() => {});
  }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function salvar() {
    if (!form.nome.trim())  return toast.error('Informe o nome do modelo');
    if (!editando && !arquivo) return toast.error('Escolha o arquivo .docx do modelo');
    if (arquivo && !arquivo.name.toLowerCase().endsWith('.docx')) {
      return toast.error('O arquivo precisa ser um .docx');
    }
    // Validação da classificação conforme o destino.
    if (form.destino === 'audiencia' && (!form.tipo_audiencia_id || !form.modalidade))
      return toast.error('Escolha o tipo de audiência e a modalidade');
    if (form.destino === 'pericia' && !form.tipo_pericia_id)
      return toast.error('Escolha o tipo de perícia');
    if (form.destino === 'prazo' && !form.subtipo_prazo_id)
      return toast.error('Escolha o subtipo de prazo');

    // Monta o multipart (campos + arquivo opcional)
    const fd = new FormData();
    fd.append('nome', form.nome.trim());
    fd.append('descricao', form.descricao || '');
    fd.append('destino', form.destino || 'comum');
    fd.append('tipo_audiencia_id', form.tipo_audiencia_id || '');
    fd.append('modalidade', form.modalidade || '');
    fd.append('tipo_pericia_id', form.tipo_pericia_id || '');
    fd.append('subtipo_prazo_id', form.subtipo_prazo_id || '');
    fd.append('minutos_antes', form.minutos_antes || 0);
    if (arquivo) fd.append('arquivo', arquivo);

    setSalvando(true);
    try {
      const resp = editando
        ? await documentosAPI.atualizarModelo(modelo.id, fd)
        : await documentosAPI.criarModelo(fd);

      // Aviso (não bloqueante) de variáveis que não existem no catálogo.
      const desconhecidas = resp.data?.dados?.variaveis_desconhecidas || [];
      if (desconhecidas.length) {
        toast.warn(`Atenção: variáveis não reconhecidas (ficarão vazias): ${desconhecidas.map(d => `{{${d}}}`).join(', ')}`);
      }
      toast.success(editando ? 'Modelo atualizado!' : 'Modelo criado!');
      onFechar(true);
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao salvar o modelo');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h3>{editando ? 'Editar Modelo' : 'Novo Modelo de Documento'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Nome do modelo *</label>
            <input className="form-control" value={form.nome}
              onChange={e => set('nome', e.target.value)}
              onBlur={() => set('nome', toTitleCase(form.nome))}
              placeholder="Ex: Procuração Trabalhista" />
          </div>

          <div className="form-group">
            <label className="form-label">Descrição (opcional)</label>
            <input className="form-control" value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              placeholder="Breve descrição do modelo" />
          </div>

          <div className="form-group">
            <label className="form-label">Destino do modelo</label>
            <select className="form-control" value={form.destino}
              onChange={e => set('destino', e.target.value)}>
              <option value="comum">Comum (procuração, contrato, declaração…)</option>
              <option value="multipessoas">Documento de partes (autores e réus)</option>
              <option value="recibo_cliente">Recibo de cliente</option>
              <option value="recibo_parceria">Recibo de parceria</option>
              <option value="audiencia">Comunicado de audiência</option>
              <option value="pericia">Documento de perícia</option>
              <option value="prazo">Documento de prazo</option>
            </select>
            <small style={{ color: '#888' }}>
              Define em qual situação o modelo aparece ao gerar. "Audiência/Perícia/Prazo" só aparecem na tela correspondente, no tipo certo.
            </small>
          </div>

          {/* Classificação conforme o destino */}
          {form.destino === 'audiencia' && (
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Tipo de audiência *</label>
                <select className="form-control" value={form.tipo_audiencia_id}
                  onChange={e => set('tipo_audiencia_id', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {(opcoes?.tipos_audiencia || []).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Modalidade *</label>
                <select className="form-control" value={form.modalidade}
                  onChange={e => set('modalidade', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {(opcoes?.modalidades || []).map(m => <option key={m.valor} value={m.valor}>{m.nome}</option>)}
                </select>
              </div>
            </div>
          )}
          {form.destino === 'pericia' && (
            <div className="form-group">
              <label className="form-label">Tipo de perícia *</label>
              <select className="form-control" value={form.tipo_pericia_id}
                onChange={e => set('tipo_pericia_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {(opcoes?.tipos_pericia || []).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
          )}
          {form.destino === 'prazo' && (
            <div className="form-group">
              <label className="form-label">Subtipo de prazo *</label>
              <select className="form-control" value={form.subtipo_prazo_id}
                onChange={e => set('subtipo_prazo_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {(opcoes?.subtipos_prazo || []).map(s => (
                  <option key={s.id} value={s.id}>{s.tipo_prazo_nome ? `${s.tipo_prazo_nome} — ` : ''}{s.nome}</option>
                ))}
              </select>
            </div>
          )}

          {/* "Minutos antes": só para destinos com horário (audiência/perícia). 0 = horário real. */}
          {(form.destino === 'audiencia' || form.destino === 'pericia') && (
            <div className="form-group">
              <label className="form-label">Imprimir o horário quantos minutos antes?</label>
              <input type="number" min="0" step="5" className="form-control"
                value={form.minutos_antes}
                onChange={e => set('minutos_antes', e.target.value)} />
              <small style={{ color: '#888' }}>
                0 = horário real. Ex.: 60 faz uma audiência das 09:00 sair como 08:00 no documento.
                O horário real continua disponível em {'{{hora_audiencia_real}}'} / {'{{hora_pericia_real}}'}.
              </small>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">
              Arquivo .docx {editando ? '(opcional — só envie se quiser trocar)' : '*'}
            </label>
            <input type="file" className="form-control" accept=".docx"
              onChange={e => setArquivo(e.target.files[0] || null)} />
            {editando && (
              <small style={{ color: '#888' }}>
                Sem novo arquivo, o atual é mantido.{' '}
                <button type="button"
                  onClick={() => onBaixar(modelo)}
                  style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontSize: '12px' }}>
                  Baixar o atual
                </button>
              </small>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar Modelo'}
          </button>
        </div>
      </div>
    </div>
  );
}
