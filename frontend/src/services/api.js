// ============================================================
// CLIENTE DA API — Instância axios com autenticação automática
// Todas as chamadas ao backend passam por aqui
// ============================================================

import axios from 'axios';

// Cria instância do axios apontando para o backend
const api = axios.create({
  baseURL: '/api',
  timeout: 30000, // 30 segundos de timeout
  headers: { 'Content-Type': 'application/json' },
});

// Interceptor de REQUEST — adiciona token JWT em toda requisição automaticamente
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ============================================================
// FUNÇÕES DE AUTENTICAÇÃO
// ============================================================
export const authAPI = {
  login: (dados) => api.post('/auth/login', dados),
  verificar: () => api.get('/auth/verificar'),
  criarAdmin: (dados) => api.post('/auth/criar-admin', dados),
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
  adicionarHistorico: (id, dados) => api.post(`/pessoas/fisicas/${id}/historico`, dados),
  // Verifica se CPF já existe — retorna { existe: false } ou { existe: true, pessoa: { id, nome, cpf } }
  verificarCPF: (cpf) => api.get(`/pessoas/fisicas/cpf/${cpf}`),
  // Jurídicas
  listarJuridicas:  (params) => api.get('/pessoas/juridicas', { params }),
  criarJuridica:    (dados) => api.post('/pessoas/juridicas', dados),
  // Auxiliares (estados civis, gêneros, profissões)
  auxiliares: () => api.get('/pessoas/auxiliares'),
};

// ============================================================
// PROCESSOS E PASTAS
// ============================================================
export const processosAPI = {
  listarPastas:       (params) => api.get('/processos/pastas', { params }),
  buscarPasta:        (id) => api.get(`/processos/pastas/${id}`),
  criarPasta:         (dados) => api.post('/processos/pastas', dados),
  buscarProcesso:     (id) => api.get(`/processos/${id}`),
  criarProcesso:      (dados) => api.post('/processos', dados),
  atualizarProcesso:  (id, dados) => api.put(`/processos/${id}`, dados),
  auxiliares:         () => api.get('/processos/auxiliares'),
};

// ============================================================
// PRAZOS
// ============================================================
export const prazosAPI = {
  listar:      (params) => api.get('/prazos', { params }),
  criar:       (dados) => api.post('/prazos', dados),
  mudarStatus: (id, dados) => api.put(`/prazos/${id}/status`, dados),
  tipos:       () => api.get('/prazos/tipos'),
  vencemHoje:  () => api.get('/prazos/hoje'),
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
};

// ============================================================
// AUDIÊNCIAS
// ============================================================
export const audienciasAPI = {
  listar:          (params) => api.get('/audiencias', { params }),
  buscar:          (id) => api.get(`/audiencias/${id}`),
  criar:           (dados) => api.post('/audiencias', dados),
  registrarAta:    (id, dados) => api.post(`/audiencias/${id}/ata`, dados),
  marcarAtaImpressa: (id) => api.put(`/audiencias/${id}/ata-impressa`),
  tipos:           () => api.get('/audiencias/tipos'),
};

// ============================================================
// FINANCEIRO
// ============================================================
export const financeiroAPI = {
  buscarConta:   (pastaId, params) => api.get(`/financeiro/pasta/${pastaId}`, { params }),
  lancar:        (pastaId, dados) => api.post(`/financeiro/pasta/${pastaId}/lancamento`, dados),
  excluirLanc:   (id) => api.delete(`/financeiro/lancamento/${id}`),
  salvarHonorarios: (pastaId, dados) => api.post(`/financeiro/pasta/${pastaId}/honorarios`, dados),
  gerarRecibo:   (pastaId) => api.get(`/financeiro/pasta/${pastaId}/recibo`, { responseType: 'blob' }),
  relatorio:     (params) => api.get('/financeiro/relatorio', { params }),
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
  listarModelos:    () => api.get('/documentos/modelos'),
  buscarModelo:     (id) => api.get(`/documentos/modelos/${id}`),
  criarModelo:      (dados) => api.post('/documentos/modelos', dados),
  atualizarModelo:  (id, dados) => api.put(`/documentos/modelos/${id}`, dados),
  gerar:            (dados) => api.post('/documentos/gerar', dados, { responseType: 'blob' }),
};

// ============================================================
// PUBLICAÇÕES AASP
// ============================================================
export const publicacoesAPI = {
  listar:       (params) => api.get('/publicacoes', { params }),
  buscarAasp:   (dados) => api.post('/publicacoes/buscar-aasp', dados),
  marcarTratada:(id) => api.put(`/publicacoes/${id}/tratar`),
  excluir:      (id) => api.delete(`/publicacoes/${id}`),
};

// ============================================================
// PERÍCIAS
// ============================================================
export const periciasAPI = {
  listar:           (params) => api.get('/pericias', { params }),
  buscar:           (id) => api.get(`/pericias/${id}`),
  criar:            (dados) => api.post('/pericias', dados),
  atualizar:        (id, dados) => api.put(`/pericias/${id}`, dados),
  tipos:            () => api.get('/pericias/tipos'),
  marcarEmailPerito:(id) => api.put(`/pericias/${id}/email-perito`),
  marcarComunicado: (id) => api.put(`/pericias/${id}/comunicado`),
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
  buscarPermissoes:    (id) => api.get(`/configuracoes/permissoes/${id}`),
  salvarPermissoes:    (id, dados) => api.put(`/configuracoes/permissoes/${id}`, dados),
  buscarIntegracoes:   () => api.get('/configuracoes/integracoes'),
  salvarIntegracao:    (modulo, dados) => api.put(`/configuracoes/integracoes/${modulo}`, dados),
};

export default api;
