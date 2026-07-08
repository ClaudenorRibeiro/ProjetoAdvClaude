// ============================================================
// CLIENTE DA API — Instância axios com autenticação automática
// Todas as chamadas ao backend passam por aqui
// ============================================================

import axios from 'axios';

// Cria instância do axios apontando para o backend
export const api = axios.create({
  baseURL: '/api',
  timeout: 30000, // 30 segundos de timeout
  headers: { 'Content-Type': 'application/json' },
});

// Interceptor de REQUEST — adiciona token JWT em toda requisição automaticamente
api.interceptors.request.use(
  config => {
    const token = sessionStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Para uploads (FormData), remove o Content-Type JSON padrão: assim o
    // navegador define automaticamente o multipart/form-data com o boundary correto.
    if (config.data instanceof FormData) {
      if (config.headers && typeof config.headers.delete === 'function') {
        config.headers.delete('Content-Type');
      } else if (config.headers) {
        delete config.headers['Content-Type'];
      }
    }
    return config;
  },
  error => Promise.reject(error)
);

// Interceptor de RESPONSE — trata erros globais (ex: token expirado)
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // Token inválido ou expirado — redireciona para login
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('usuario');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ============================================================
// FUNÇÕES DE AUTENTICAÇÃO
// ============================================================
export const authAPI = {
  infoPublica:    () => api.get('/public/info'),           // nome, logo, titulo_aba — sem autenticação
  login:          (dados) => api.post('/auth/login', dados),
  verificar:      () => api.get('/auth/verificar'),
  criarAdmin:     (dados) => api.post('/auth/criar-admin', dados),
  esqueciSenha:   (dados) => api.post('/auth/esqueci-senha', dados),
  validarToken:   (token) => api.get(`/auth/validar-token/${token}`),
  redefinirSenha: (dados) => api.post('/auth/redefinir-senha', dados),
  trocarSenha:    (dados) => api.put('/auth/trocar-senha', dados),
  verificarSenha: (dados) => api.post('/auth/verificar-senha', dados),
};

// ============================================================
// DASHBOARD
// ============================================================
export const dashboardAPI = {
  buscarDados: () => api.get('/dashboard'),
};

// ============================================================
// PESSOAS
// ============================================================
export const pessoasAPI = {
  // Físicas
  listarFisicas:   (params) => api.get('/pessoas/fisicas', { params }),
  buscarFisica:    (id) => api.get(`/pessoas/fisicas/${id}`),
  criarFisica:     (dados) => api.post('/pessoas/fisicas', dados),
  atualizarFisica: (id, dados) => api.put(`/pessoas/fisicas/${id}`, dados),
  excluirFisica:   (id) => api.delete(`/pessoas/fisicas/${id}`),
  adicionarHistorico: (id, dados) => api.post(`/pessoas/fisicas/${id}/historico`, dados),
  // Verifica se CPF já existe — retorna { existe: false } ou { existe: true, pessoa: { id, nome, cpf } }
  verificarCPF: (cpf) => api.get(`/pessoas/fisicas/cpf/${cpf}`),
  // Cria novo item em tabela auxiliar: tipo = 'generos' | 'estados_civis' | 'profissoes'
  criarAuxiliar: (tipo, dados) => api.post(`/pessoas/auxiliares/${tipo}`, dados),
  // Exportação para Excel (.xlsx) — respeita a busca atual; campos escolhidos na tela
  exportarFisicas:   (params) => api.get('/pessoas/fisicas/exportar',   { params, responseType: 'blob', timeout: 120000 }),
  exportarJuridicas: (params) => api.get('/pessoas/juridicas/exportar', { params, responseType: 'blob', timeout: 120000 }),
  // Jurídicas
  listarJuridicas:  (params) => api.get('/pessoas/juridicas', { params }),
  criarJuridica:    (dados) => api.post('/pessoas/juridicas', dados),
  excluirJuridica:  (id) => api.delete(`/pessoas/juridicas/${id}`),
  // Auxiliares (estados civis, gêneros, profissões)
  auxiliares: () => api.get('/pessoas/auxiliares'),
};

// ============================================================
// PROCESSOS E PASTAS — Novo modelo (tblPasta + tblProc)
// ============================================================
export const processosAPI = {
  // Pastas
  listarPastas:      (params) => api.get('/processos/pastas', { params }),
  buscarPasta:       (id) => api.get(`/processos/pastas/${id}`),
  renumerarPasta:    (id, dados) => api.put(`/processos/pastas/${id}/renumerar`, dados),
  sugerirPasta:      () => api.get('/processos/sugerir-pasta'),
  buscarPorNumero:   (q) => api.get('/processos/buscar', { params: { q } }),
  // Processos
  criarProcesso:     (dados) => api.post('/processos', dados),
  atualizarProcesso: (id, dados) => api.put(`/processos/${id}`, dados),
  excluirProcesso:   (id) => api.delete(`/processos/${id}`),
  // Auxiliares (leitura)
  auxiliares:        () => api.get('/processos/auxiliares'),
  // Auxiliares — CRUD completo (permissão por ação)
  criarForum:        (dados) => api.post('/processos/auxiliares/foruns', dados),
  atualizarForum:    (id, dados) => api.put(`/processos/auxiliares/foruns/${id}`, dados),
  excluirForum:      (id) => api.delete(`/processos/auxiliares/foruns/${id}`),
  criarVara:         (dados) => api.post('/processos/auxiliares/varas', dados),
  atualizarVara:     (id, dados) => api.put(`/processos/auxiliares/varas/${id}`, dados),
  excluirVara:       (id) => api.delete(`/processos/auxiliares/varas/${id}`),
  criarTipo:         (dados) => api.post('/processos/auxiliares/tipos', dados),
  atualizarTipo:     (id, dados) => api.put(`/processos/auxiliares/tipos/${id}`, dados),
  excluirTipo:       (id) => api.delete(`/processos/auxiliares/tipos/${id}`),
  criarStatus:       (dados) => api.post('/processos/auxiliares/status', dados),
  atualizarStatus:   (id, dados) => api.put(`/processos/auxiliares/status/${id}`, dados),
  excluirStatus:     (id) => api.delete(`/processos/auxiliares/status/${id}`),
  criarInstancia:    (dados) => api.post('/processos/auxiliares/instancias', dados),
  atualizarInstancia:(id, dados) => api.put(`/processos/auxiliares/instancias/${id}`, dados),
  excluirInstancia:  (id) => api.delete(`/processos/auxiliares/instancias/${id}`),
};

// ============================================================
// PRAZOS
// ============================================================
export const prazosAPI = {
  listar:           (params)    => api.get('/prazos', { params }),
  criar:            (dados)     => api.post('/prazos', dados),
  editar:           (id, dados) => api.put(`/prazos/${id}`, dados),
  excluir:          (id)        => api.delete(`/prazos/${id}`),
  mudarStatus:      (id, dados) => api.put(`/prazos/${id}/status`, dados),
  marcarFazendo:    (id)        => api.put(`/prazos/${id}/fazendo`),
  liberarFazendo:   (id)        => api.put(`/prazos/${id}/liberar-fazendo`),
  tipos:            ()          => api.get('/prazos/tipos'),
  vencemHoje:       ()          => api.get('/prazos/hoje'),
  // Calcula data final consultando o calendário real do banco (inclui feriados)
  calcularDataFinal: (data_inicio, quantidade, tipo_dias) =>
    api.get('/prazos/calcular', { params: { data_inicio, quantidade, tipo_dias } }),
  // Histórico completo: criação + todas as mudanças de status
  historico: (id) => api.get(`/prazos/${id}/historico`),
};

// ============================================================
// NOTIFICAÇÕES
// ============================================================
export const notificacoesAPI = {
  listar:      () => api.get('/notificacoes'),
  contagem:    () => api.get('/notificacoes/contagem'),
  marcarLidas: () => api.put('/notificacoes/marcar-lidas'),
};

// ============================================================
// TAREFAS
// ============================================================
export const tarefasAPI = {
  listar:   (params) => api.get('/tarefas', { params }),
  criar:    (dados) => api.post('/tarefas', dados),
  atualizar:(id, dados) => api.put(`/tarefas/${id}`, dados),
  concluir: (id) => api.put(`/tarefas/${id}/concluir`),
  reabrir:  (id) => api.put(`/tarefas/${id}/reabrir`),
  excluir:  (id) => api.delete(`/tarefas/${id}`),
  historico:(id) => api.get(`/tarefas/${id}/historico`),
};

// ============================================================
// AUDIÊNCIAS
// ============================================================
export const audienciasAPI = {
  listar:            (params) => api.get('/audiencias', { params }),
  buscar:            (id) => api.get(`/audiencias/${id}`),
  criar:             (dados) => api.post('/audiencias', dados),
  atualizar:         (id, dados) => api.put(`/audiencias/${id}`, dados),
  excluir:           (id) => api.delete(`/audiencias/${id}`),
  cancelar:          (id, dados) => api.put(`/audiencias/${id}/cancelar`, dados),
  remarcar:          (id, dados) => api.put(`/audiencias/${id}/remarcar`, dados),
  registrarAta:      (id, dados) => api.post(`/audiencias/${id}/ata`, dados),
  marcarAtaImpressa: (id) => api.put(`/audiencias/${id}/ata-impressa`),
  historico:         (id) => api.get(`/audiencias/${id}/historico`),
  advogados:         () => api.get('/audiencias/advogados'),
  // Partes do processo — para filtrar testemunhas inválidas
  partesProcesso:    (processoId) => api.get('/audiencias/partes-processo', { params: { processo_id: processoId } }),
  // Testemunhas — CRUD individual (gerenciamento independente da audiência)
  adicionarTestemunha: (audienciaId, dados) => api.post(`/audiencias/${audienciaId}/testemunhas`, dados),
  editarTestemunha:    (audienciaId, testId, dados) => api.put(`/audiencias/${audienciaId}/testemunhas/${testId}`, dados),
  excluirTestemunha:   (audienciaId, testId) => api.delete(`/audiencias/${audienciaId}/testemunhas/${testId}`),
  // Tipos
  tipos:             () => api.get('/audiencias/tipos'),
  criarTipo:         (dados) => api.post('/audiencias/tipos', dados),
  atualizarTipo:     (id, dados) => api.put(`/audiencias/tipos/${id}`, dados),
  excluirTipo:       (id) => api.delete(`/audiencias/tipos/${id}`),
  // Freelancers
  listarFreelas:     (q) => api.get('/audiencias/freelas', { params: { q } }),
  criarFreela:       (dados) => api.post('/audiencias/freelas', dados),
  atualizarFreela:   (id, dados) => api.put(`/audiencias/freelas/${id}`, dados),
  excluirFreela:     (id) => api.delete(`/audiencias/freelas/${id}`),
};

// ============================================================
// FINANCEIRO
// ============================================================
// Financeiro POR PROCESSO (reescrito 15/06): conta corrente + acordo parcelado + baixa
export const financeiroAPI = {
  // Conta corrente
  buscarConta:     (processoId, params) => api.get(`/financeiro/processo/${processoId}`, { params }),
  lancar:          (processoId, dados) => api.post(`/financeiro/processo/${processoId}/lancamento`, dados),
  editarLanc:      (id, dados) => api.put(`/financeiro/lancamento/${id}`, dados),
  excluirLanc:     (id) => api.delete(`/financeiro/lancamento/${id}`),
  // Acordo + parcelas
  listarAcordos:   (processoId) => api.get(`/financeiro/processo/${processoId}/acordos`),
  previaParcelas:  (dados) => api.post('/financeiro/acordo/previa', dados),
  criarAcordo:     (processoId, dados) => api.post(`/financeiro/processo/${processoId}/acordo`, dados),
  buscarAcordo:    (id) => api.get(`/financeiro/acordo/${id}`),
  atualizarAcordo: (id, dados) => api.put(`/financeiro/acordo/${id}`, dados),
  excluirAcordo:   (id) => api.delete(`/financeiro/acordo/${id}`),
  cancelarAcordo:  (id, dados) => api.put(`/financeiro/acordo/${id}/cancelar`, dados),
  // Baixa
  pagarParcela:    (id, dados) => api.put(`/financeiro/parcela/${id}/pagar`, dados),
  desfazerParcela: (id) => api.put(`/financeiro/parcela/${id}/desfazer`),
  // Histórico da parcela
  historicoParcela: (id) => api.get(`/financeiro/parcela/${id}/historico`),
  // Histórico do lançamento da conta corrente
  historicoLancamento: (id) => api.get(`/financeiro/lancamento/${id}/historico`),
  // Repasses ao cliente/parceiro (2º tempo) + worklist global
  repassesPendentes:  () => api.get('/financeiro/repasses-pendentes'),
  repassesConcluidos: () => api.get('/financeiro/repasses-concluidos'),
  // Consulta / relatório
  consultaFinanceiro: (params) => api.get('/financeiro/consulta', { params }),
  exportarConsulta:   (params) => api.get('/financeiro/consulta/exportar', { params, responseType: 'blob', timeout: 120000 }),
  registrarRepasse:   (id, dados) => api.put(`/financeiro/parcela/${id}/repasse`, dados),
  desfazerRepasse:    (id, tipo) => api.put(`/financeiro/parcela/${id}/repasse/desfazer`, { tipo }),
  // Formas de pagamento (cadastro no Controle + select do recebimento/repasse)
  formasPagamento:        () => api.get('/financeiro/formas-pagamento'),
  criarFormaPagamento:    (dados) => api.post('/financeiro/formas-pagamento', dados),
  atualizarFormaPagamento:(id, dados) => api.put(`/financeiro/formas-pagamento/${id}`, dados),
  excluirFormaPagamento:  (id) => api.delete(`/financeiro/formas-pagamento/${id}`),
};

// ============================================================
// ANDAMENTO PROCESSUAL
// ============================================================
export const andamentoAPI = {
  listar:  (processoId) => api.get(`/andamento/${processoId}`),
  criar:   (processoId, dados) => api.post(`/andamento/${processoId}`, dados),
  editar:  (id, dados) => api.put(`/andamento/${id}`, dados),
  excluir: (id) => api.delete(`/andamento/${id}`),
};

// ============================================================
// DOCUMENTOS
// ============================================================
export const documentosAPI = {
  // Catálogo de variáveis (referência para montar o modelo no Word)
  catalogoVariaveis: () => api.get('/documentos/variaveis'),
  // Catálogo das variáveis POR PESSOA (modelos "Documento de partes")
  catalogoVariaveisPartes: () => api.get('/documentos/variaveis-partes'),
  // Modelos — listar (incluirInativos=true traz também os desativados, para a tela de gestão)
  listarModelos:    (incluirInativos = false) =>
    api.get('/documentos/modelos', { params: incluirInativos ? { incluir_inativos: 1 } : {} }),
  buscarModelo:     (id) => api.get(`/documentos/modelos/${id}`),
  baixarModelo:     (id) => api.get(`/documentos/modelos/${id}/arquivo`, { responseType: 'blob' }),
  // criar/atualizar recebem um FormData (campos + arquivo .docx)
  criarModelo:      (formData) => api.post('/documentos/modelos', formData),
  atualizarModelo:  (id, formData) => api.put(`/documentos/modelos/${id}`, formData),
  desativarModelo:  (id) => api.put(`/documentos/modelos/${id}/desativar`),
  reativarModelo:   (id) => api.put(`/documentos/modelos/${id}/reativar`),
  // Exclusão DEFINITIVA (apaga do banco + arquivo do S3; não dá para reativar)
  excluirModelo:    (id) => api.delete(`/documentos/modelos/${id}`),
  // Opções para o "destino" do modelo (tipos de audiência/perícia, subtipos de prazo)
  destinosOpcoes:   () => api.get('/documentos/destinos-opcoes'),
  // Geração de documentos a partir de uma âncora (audiência, processo, etc.)
  modelosParaGerar: (ancora, ancoraId, beneficiario) => api.get('/documentos/modelos-gerar', { params: { ancora, ancora_id: ancoraId, beneficiario } }),
  gerar:            (dados) => api.post('/documentos/gerar', dados, { responseType: 'blob' }),
  // Geração de "Documento de partes" (vários autores × réus; sem âncora). Devolve blob (docx/pdf).
  gerarMultipessoas: (dados) => api.post('/documentos/gerar-multipessoas', dados, { responseType: 'blob' }),
  // Geração em LOTE (audiências/perícias):
  // 1) preparar: agrupa os selecionados por tipo e devolve os modelos disponíveis de cada grupo
  prepararLote:     (ancora_tipo, ancora_ids) => api.post('/documentos/lote/preparar', { ancora_tipo, ancora_ids }),
  // 2) gerar: devolve um ZIP. Timeout estendido (10 min) — um lote de PDFs pode levar minutos.
  gerarLote:        (dados) => api.post('/documentos/lote/gerar', dados, { responseType: 'blob', timeout: 600000 }),
  // Histórico de documentos gerados
  historico:        (params) => api.get('/documentos/historico', { params }),
};

// ============================================================
// PUBLICAÇÕES AASP
// ============================================================
export const publicacoesAPI = {
  statusAasp:   () => api.get('/publicacoes/aasp/status'),
  usuarios:     () => api.get('/publicacoes/usuarios'),
  listar:       (params) => api.get('/publicacoes', { params }),
  importar:     (dados) => api.post('/publicacoes/importar', dados),
  direcionar:   (id, dados) => api.put(`/publicacoes/${id}/direcionar`, dados),
  tratar:       (id, dados) => api.put(`/publicacoes/${id}/tratar`, dados),
  historico:    (id) => api.get(`/publicacoes/${id}/historico`),
  excluir:      (id) => api.delete(`/publicacoes/${id}`),
};

// ============================================================
// PERÍCIAS
// ============================================================
export const periciasAPI = {
  listar:            (params) => api.get('/pericias', { params }),
  buscar:            (id) => api.get(`/pericias/${id}`),
  criar:             (dados) => api.post('/pericias', dados),
  atualizar:         (id, dados) => api.put(`/pericias/${id}`, dados),
  tipos:             () => api.get('/pericias/tipos'),
  criarTipo:         (dados) => api.post('/pericias/tipos', dados),
  atualizarTipo:     (id, dados) => api.put(`/pericias/tipos/${id}`, dados),
  excluirTipo:       (id) => api.delete(`/pericias/tipos/${id}`),
  peritosProcesso:   (processoId) => api.get('/pericias/peritos-processo', { params: { processo_id: processoId } }),
  marcarRealizada:   (id) => api.put(`/pericias/${id}/realizada`),
  cancelar:          (id, motivo) => api.put(`/pericias/${id}/cancelar`, { motivo }),
  remarcar:          (id, dados) => api.put(`/pericias/${id}/remarcar`, dados),
  excluir:           (id) => api.delete(`/pericias/${id}`),
  historico:         (id) => api.get(`/pericias/${id}/historico`),
  enviarComunicado:  (id) => api.post(`/pericias/${id}/comunicado`),
};

// ============================================================
// CONFIGURAÇÕES
// ============================================================
export const configuracaoAPI = {
  buscarEscritorio:    () => api.get('/configuracoes/escritorio'),
  atualizarEscritorio: (dados) => api.put('/configuracoes/escritorio', dados),
  concluirSetup:       () => api.put('/configuracoes/setup-concluido'),
  listarFeriados:      (params) => api.get('/configuracoes/feriados', { params }),
  criarFeriado:        (dados) => api.post('/configuracoes/feriados', dados),
  excluirFeriado:      (id) => api.delete(`/configuracoes/feriados/${id}`),
  listarUsuarios:      () => api.get('/configuracoes/usuarios'),
  criarUsuario:        (dados) => api.post('/configuracoes/usuarios', dados),
  atualizarUsuario:    (id, dados) => api.put(`/configuracoes/usuarios/${id}`, dados),
  redefinirSenhaAdmin: (id, dados) => api.put(`/configuracoes/usuarios/${id}/senha`, dados),
  excluirUsuario:      (id) => api.delete(`/configuracoes/usuarios/${id}`),
  historicoUsuario:    (id, params) => api.get(`/configuracoes/usuarios/${id}/historico`, { params }),
  buscarPermissoes:    (id) => api.get(`/configuracoes/permissoes/${id}`),
  salvarPermissoes:    (id, dados) => api.put(`/configuracoes/permissoes/${id}`, dados),
  buscarIntegracoes:   () => api.get('/configuracoes/integracoes'),
  salvarIntegracao:    (modulo, dados) => api.put(`/configuracoes/integracoes/${modulo}`, dados),
  horaServidor:        () => api.get('/configuracoes/servidor-hora'),
};

export const calendarioAPI = {
  verificarDiaUtil: (data) => api.get('/calendario/dia-util', { params: { data } }),
};

// Manutenção do sistema — ações restritas ao superusuário
export const manutencaoAPI = {
  limparDadosTeste: (dados) => api.post('/manutencao/limpar-dados-teste', dados),
};

// ============================================================
// AGENDA — compromissos pessoais/avulsos
// ============================================================
export const agendaAPI = {
  listarCompromissos:   (params) => api.get('/agenda/compromissos', { params }),
  criarCompromisso:     (dados) => api.post('/agenda/compromissos', dados),
  atualizarCompromisso: (id, dados) => api.put(`/agenda/compromissos/${id}`, dados),
  excluirCompromisso:   (id) => api.delete(`/agenda/compromissos/${id}`),
};

export default api;
