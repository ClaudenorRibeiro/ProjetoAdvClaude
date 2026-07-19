// ============================================================
// CONTROLLER DE CONFIGURAÇÕES
// Escritório, feriados, integrações, usuários e setup inicial
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const bcrypt = require('bcryptjs');
const auditoria = require('../middleware/auditoria');
const { ehDiaUtil } = require('../services/calendarioService');
const { reagendarCronPrazos } = require('../services/alertasService');
const multer = require('multer');

// ============================================================
// UPLOAD DO LOGO DO ESCRITÓRIO
// A imagem é guardada NO BANCO (base64), na tabela configuracoes_escritorio,
// então cada instância/escritório tem o seu próprio logo e ele sobrevive às
// atualizações do sistema (o deploy não mexe no banco).
// SEGURANÇA: só aceitamos imagens PNG, JPG/JPEG ou WEBP, no máximo 512 KB.
// A validação REAL é feita aqui no servidor, pelos primeiros bytes do arquivo
// (a "assinatura" da imagem) — NÃO pela extensão/nome — para que um arquivo
// perigoso renomeado como ".png" seja recusado.
// ============================================================
const LOGO_MAX_BYTES = 512 * 1024; // 512 KB

// Recebe o arquivo em memória (não grava em disco) e limita o tamanho.
const uploadLogoMemoria = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX_BYTES },
});

// Middleware de upload: devolve mensagem amigável em vez do erro cru do multer.
function uploadLogo(req, res, next) {
  uploadLogoMemoria.single('logo')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'A imagem é muito grande. O tamanho máximo do logo é 512 KB.'
        : (err.message || 'Falha ao enviar a imagem.');
      return erro(res, msg);
    }
    next();
  });
}

// Descobre o tipo REAL da imagem pelos primeiros bytes (assinatura), ignorando a
// extensão/nome do arquivo. Retorna 'image/png' | 'image/jpeg' | 'image/webp' ou null.
function tipoImagemReal(buffer) {
  if (!buffer || buffer.length < 12) return null;
  // PNG começa com: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
  // JPEG começa com: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  // WEBP: "RIFF" nos bytes 0-3 e "WEBP" nos bytes 8-11
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null; // qualquer outra coisa (inclusive SVG, que pode conter script) é recusada
}

// GET /api/public/info — Retorna nome, logo e título da aba (sem autenticação)
// Usado na tela de login e para definir document.title no frontend
async function infoPublica(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT nome, logo_base64, titulo_aba FROM configuracoes_escritorio LIMIT 1'
    );
    return sucesso(res, rows[0] || { nome: 'Sistema de Advocacia', logo_base64: null, titulo_aba: null });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/configuracoes/logo — Recebe a imagem do logo, valida e guarda no banco (base64).
// Só admin/super. Aceita apenas PNG, JPG/JPEG ou WEBP, até 512 KB (validado pelo conteúdo).
async function salvarLogo(req, res) {
  try {
    if (!req.file || !req.file.buffer || !req.file.buffer.length) {
      return erro(res, 'Nenhuma imagem foi enviada. Selecione um arquivo PNG, JPG ou WEBP.');
    }
    // Confere o tipo REAL pelo conteúdo (não confia na extensão) — barra arquivos disfarçados.
    const mime = tipoImagemReal(req.file.buffer);
    if (!mime) {
      return erro(res, 'Arquivo inválido. Envie uma imagem PNG, JPG ou WEBP de verdade (outros tipos são bloqueados por segurança).');
    }
    // Monta a imagem no formato que o navegador exibe direto (data URI) e guarda no banco.
    const dataUri = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
    await pool.execute('UPDATE configuracoes_escritorio SET logo_base64 = ? LIMIT 1', [dataUri]);
    await auditoria.registrar(req.usuario.id, 'configuracoes_escritorio', 'editar', 1);
    return sucesso(res, { logo_base64: dataUri }, 'Logo atualizado com sucesso!');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/configuracoes/logo — Remove o logo (volta ao padrão, que mostra o nome do escritório).
async function removerLogo(req, res) {
  try {
    await pool.execute('UPDATE configuracoes_escritorio SET logo_base64 = NULL LIMIT 1');
    await auditoria.registrar(req.usuario.id, 'configuracoes_escritorio', 'editar', 1);
    return sucesso(res, {}, 'Logo removido.');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/configuracoes/escritorio — Busca dados do escritório
async function buscarEscritorio(req, res) {
  try {
    const [rows] = await pool.execute('SELECT * FROM configuracoes_escritorio LIMIT 1');
    return sucesso(res, rows[0] || {});
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/configuracoes/escritorio — Atualiza dados do escritório
async function atualizarEscritorio(req, res) {
  try {
    const {
      nome, cnpj_cpf, email, telefone,
      cep, logradouro, numero, bairro, cidade, estado,
      cor_principal, horario_alerta_prazos, horario_alerta_prazos_2,
      alerta_atrasado_ativo, alerta_emails,
      dias_alerta_audiencia, dias_alerta_pericia, dias_sem_movimentacao,
      prazo_fazendo_timeout, dias_audiencia_sem_adv,
      titulo_aba
    } = req.body;

    if (!nome) return erro(res, 'Nome do escritório é obrigatório');

    // Validação: se os DOIS horários de alerta estiverem preenchidos, eles
    // precisam ter no mínimo 1 hora (60 min) de diferença entre si.
    // (comparação só por horário, dentro do mesmo dia — sem lógica de data)
    if (horario_alerta_prazos && horario_alerta_prazos_2) {
      const emMinutos = h => {
        const [hh, mm] = String(h).split(':');
        return parseInt(hh, 10) * 60 + parseInt(mm, 10);
      };
      if (Math.abs(emMinutos(horario_alerta_prazos) - emMinutos(horario_alerta_prazos_2)) < 60) {
        return erro(res, 'Os dois horários de alerta devem ter no mínimo 1 hora de diferença');
      }
    }

    // INSERT se não existir registro, UPDATE se já existir (id=1 fixo)
    // Garante funcionamento mesmo em instalações novas sem registro inicial
    await pool.execute(
      `INSERT INTO configuracoes_escritorio
         (id, nome, cnpj_cpf, email, telefone,
          cep, logradouro, numero, bairro, cidade, estado,
          cor_principal, horario_alerta_prazos, horario_alerta_prazos_2,
          alerta_atrasado_ativo, alerta_emails,
          dias_alerta_audiencia, dias_alerta_pericia, dias_sem_movimentacao,
          prazo_fazendo_timeout, dias_audiencia_sem_adv, titulo_aba, setup_concluido)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         nome=VALUES(nome), cnpj_cpf=VALUES(cnpj_cpf), email=VALUES(email), telefone=VALUES(telefone),
         cep=VALUES(cep), logradouro=VALUES(logradouro), numero=VALUES(numero),
         bairro=VALUES(bairro), cidade=VALUES(cidade), estado=VALUES(estado),
         cor_principal=VALUES(cor_principal), horario_alerta_prazos=VALUES(horario_alerta_prazos),
         horario_alerta_prazos_2=VALUES(horario_alerta_prazos_2),
         alerta_atrasado_ativo=VALUES(alerta_atrasado_ativo), alerta_emails=VALUES(alerta_emails),
         dias_alerta_audiencia=VALUES(dias_alerta_audiencia), dias_alerta_pericia=VALUES(dias_alerta_pericia),
         dias_sem_movimentacao=VALUES(dias_sem_movimentacao), prazo_fazendo_timeout=VALUES(prazo_fazendo_timeout),
         dias_audiencia_sem_adv=VALUES(dias_audiencia_sem_adv), titulo_aba=VALUES(titulo_aba),
         setup_concluido=1`,
      [
        nome, cnpj_cpf || null, email || null, telefone || null,
        cep || null, logradouro || null, numero || null, bairro || null, cidade || null, estado || null,
        cor_principal || '#1a56db', horario_alerta_prazos || '18:00:00', horario_alerta_prazos_2 || null,
        alerta_atrasado_ativo ? 1 : 0, alerta_emails || null,
        dias_alerta_audiencia || 3, dias_alerta_pericia || 2, dias_sem_movimentacao || 30,
        parseInt(prazo_fazendo_timeout) || 60, parseInt(dias_audiencia_sem_adv) || 7,
        titulo_aba || null
      ]
    );

    // Reagenda o cron de prazos caso o horário tenha mudado
    await reagendarCronPrazos();

    return sucesso(res, null, 'Configurações atualizadas com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/configuracoes/setup-concluido — Marca setup como concluído
async function marcarSetupConcluido(req, res) {
  try {
    // Verifica os requisitos mínimos antes de liberar o sistema
    const [config] = await pool.execute('SELECT * FROM configuracoes_escritorio LIMIT 1');
    const cfg = config[0];

    if (!cfg.nome)     return erro(res, 'Nome do escritório é obrigatório');
    if (!cfg.cnpj_cpf) return erro(res, 'CNPJ/CPF é obrigatório');
    if (!cfg.email)    return erro(res, 'E-mail é obrigatório');

    // Verifica se tem pelo menos 1 usuário admin
    const [admin] = await pool.execute('SELECT id FROM usuarios WHERE nivel = 1 LIMIT 1');
    if (!admin.length) return erro(res, 'Crie pelo menos 1 usuário administrador antes de concluir o setup');

    // Verifica se tem pelo menos 1 advogado com OAB
    const [advogado] = await pool.execute(
      "SELECT id FROM usuarios WHERE tipo = 'advogado' AND oab IS NOT NULL AND oab != '' LIMIT 1"
    );
    if (!advogado.length) {
      return erro(res, 'Cadastre pelo menos 1 advogado com número de OAB antes de concluir o setup');
    }

    await pool.execute('UPDATE configuracoes_escritorio SET setup_concluido = 1');
    return sucesso(res, null, 'Setup concluído! Sistema liberado para uso.');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// ---- FERIADOS ----

// GET /api/configuracoes/feriados — Lista feriados cadastrados
async function listarFeriados(req, res) {
  try {
    const { ano } = req.query;
    let where = 'WHERE 1=1';
    const params = [];

    if (ano) { where += ' AND YEAR(f.data) = ?'; params.push(ano); }

    const [rows] = await pool.execute(
      `SELECT f.*, u.nome AS criado_por_nome FROM feriados f
       LEFT JOIN usuarios u ON f.criado_por = u.id
       ${where} ORDER BY f.data ASC`,
      params
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/configuracoes/feriados — Cadastra feriado e atualiza calendário
async function criarFeriado(req, res) {
  const { data, descricao, tipo } = req.body;
  if (!data || !descricao) return erro(res, 'Data e descrição são obrigatórias');

  // Transação: INSERT no feriado + UPDATE no calendário — ambos ou nenhum
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      'INSERT INTO feriados (data, descricao, tipo, criado_por) VALUES (?, ?, ?, ?)',
      [data, descricao.trim(), tipo || 'nacional', req.usuario.id]
    );

    // Marca o dia como não útil no calendário dentro da mesma transação
    await conn.execute(
      'UPDATE calendario SET dia_util = 0 WHERE data = ?', [data]
    );

    await conn.commit();         // Grava feriado + calendário de uma vez
    return sucesso(res, null, 'Feriado cadastrado e calendário atualizado', 201);
  } catch (err) {
    await conn.rollback();       // Desfaz ambos se qualquer um falhou
    return erroInterno(res, err);
  } finally {
    conn.release();              // SEMPRE devolve a conexão ao pool
  }
}

// DELETE /api/configuracoes/feriados/:id — Remove feriado
async function excluirFeriado(req, res) {
  const { id } = req.params;
  const [fer] = await pool.execute('SELECT data FROM feriados WHERE id = ?', [id]);
  if (!fer.length) return naoEncontrado(res, 'Feriado não encontrado');

  // Transação: DELETE do feriado + UPDATE no calendário — ambos ou nenhum
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute('DELETE FROM feriados WHERE id = ?', [id]);

    // Se o dia não é fim de semana, volta a ser útil no calendário
    const diaSemana = new Date(fer[0].data + 'T12:00:00').getDay();
    if (diaSemana !== 0 && diaSemana !== 6) {
      await conn.execute('UPDATE calendario SET dia_util = 1 WHERE data = ?', [fer[0].data]);
    }

    await conn.commit();         // Remove feriado + restaura calendário de uma vez
    return sucesso(res, null, 'Feriado removido');
  } catch (err) {
    await conn.rollback();       // Desfaz ambos se qualquer um falhou
    return erroInterno(res, err);
  } finally {
    conn.release();              // SEMPRE devolve a conexão ao pool
  }
}

// ---- USUÁRIOS ----

// GET /api/configuracoes/usuarios — Lista usuários (exceto superusuário)
async function listarUsuarios(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.nome, u.login, u.email, u.oab, u.tipo, u.nivel,
              u.ativo, u.ver_todos_processos, u.ultimo_acesso,
              uc.nome AS criado_por_nome
       FROM usuarios u
       LEFT JOIN usuarios uc ON u.criado_por = uc.id
       WHERE u.nivel > 0   -- Nunca mostra o superusuário
       ORDER BY u.nivel ASC, u.nome ASC`
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// Valida requisitos de senha — retorna mensagem de erro ou null se válida
function validarSenha(senha) {
  if (!senha || senha.length < 8)   return 'A senha deve ter no mínimo 8 caracteres';
  if (senha.length > 20)            return 'A senha deve ter no máximo 20 caracteres';
  if (!/[A-Z]/.test(senha))         return 'A senha deve conter pelo menos 1 letra maiúscula';
  if (!/[a-z]/.test(senha))         return 'A senha deve conter pelo menos 1 letra minúscula';
  if (!/[0-9]/.test(senha))         return 'A senha deve conter pelo menos 1 número';
  if (!/[^A-Za-z0-9]/.test(senha))  return 'A senha deve conter pelo menos 1 caractere especial';
  return null;
}

// POST /api/configuracoes/usuarios — Cria usuário
async function criarUsuario(req, res) {
  try {
    const { nome, login, senha, email, oab, tipo, nivel, ver_todos_processos } = req.body;
    if (!nome || !login || !senha) return erro(res, 'Nome, login e senha são obrigatórios');

    const errSenha = validarSenha(senha);
    if (errSenha) return erro(res, errSenha);

    const [dup] = await pool.execute('SELECT id FROM usuarios WHERE login = ?', [login]);
    if (dup.length) return erro(res, 'Login já está em uso');

    const senhaHash = await bcrypt.hash(senha, 12);

    const [result] = await pool.execute(
      `INSERT INTO usuarios (nome, login, senha_hash, email, oab, tipo, nivel,
        ver_todos_processos, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome.trim(), login.trim(), senhaHash, email || null, oab || null,
       tipo || 'advogado', nivel || 2, ver_todos_processos ? 1 : 0, req.usuario.id]
    );

    await auditoria.registrar(req.usuario.id, 'usuarios', 'criar', result.insertId);
    return sucesso(res, { id: result.insertId }, 'Usuário criado com sucesso', 201);
  } catch (err) {
    // Rede de segurança da trava de unicidade do login (cadastros simultâneos do mesmo login).
    if (err.code === 'ER_DUP_ENTRY') return erro(res, 'Login já está em uso');
    return erroInterno(res, err);
  }
}

// PUT /api/configuracoes/usuarios/:id — Atualiza usuário
async function atualizarUsuario(req, res) {
  try {
    const { id } = req.params;
    const { nome, email, oab, tipo, nivel, ativo, ver_todos_processos, senha } = req.body;

    // Não permite alterar o superusuário
    const [usuario] = await pool.execute('SELECT nivel FROM usuarios WHERE id = ?', [id]);
    if (!usuario.length) return naoEncontrado(res, 'Usuário não encontrado');
    if (usuario[0].nivel === 0) return erro(res, 'Não é possível alterar o superusuário por aqui', 403);

    // Se foi enviada nova senha, valida e atualiza o hash
    if (senha) {
      const errSenha = validarSenha(senha);
      if (errSenha) return erro(res, errSenha);
      const novoHash = await bcrypt.hash(senha, 12);
      await pool.execute(
        'UPDATE usuarios SET senha_hash = ? WHERE id = ?', [novoHash, id]
      );
    }

    await pool.execute(
      `UPDATE usuarios SET nome=?, email=?, oab=?, tipo=?, nivel=?, ativo=?, ver_todos_processos=?
       WHERE id = ?`,
      [nome, email || null, oab || null, tipo, nivel || 2,
       ativo !== undefined ? ativo : 1, ver_todos_processos ? 1 : 0, id]
    );

    await auditoria.registrar(req.usuario.id, 'usuarios', 'editar', id);
    return sucesso(res, null, 'Usuário atualizado');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/configuracoes/permissoes/:usuarioId — Busca permissões do usuário
// Retorna objeto com chave composta para sub-módulos: 'processos.andamentos'
async function buscarPermissoes(req, res) {
  try {
    const { usuarioId } = req.params;
    const [rows] = await pool.execute(
      'SELECT modulo, submodulo, acao, permitido FROM permissoes WHERE usuario_id = ?',
      [usuarioId]
    );
    const permissoes = {};
    rows.forEach(r => {
      // Sub-módulos usam chave composta: 'processos.andamentos'
      const chave = r.submodulo ? `${r.modulo}.${r.submodulo}` : r.modulo;
      if (!permissoes[chave]) permissoes[chave] = {};
      permissoes[chave][r.acao] = r.permitido === 1;
    });
    return sucesso(res, permissoes);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/configuracoes/permissoes/:usuarioId — Salva permissões do usuário
// Recebe: { 'pessoas': { visualizar: true }, 'processos.andamentos': { cadastrar: false }, ... }
async function salvarPermissoes(req, res) {
  try {
    const { usuarioId } = req.params;
    const { permissoes } = req.body;

    // Deleta e recria todas as permissões do usuário
    await pool.execute('DELETE FROM permissoes WHERE usuario_id = ?', [usuarioId]);

    for (const [chave, acoes] of Object.entries(permissoes)) {
      // Separa 'processos.andamentos' em modulo='processos', submodulo='andamentos'
      const pontoDot   = chave.indexOf('.');
      const modulo    = pontoDot >= 0 ? chave.slice(0, pontoDot)  : chave;
      const submodulo = pontoDot >= 0 ? chave.slice(pontoDot + 1) : null;

      for (const [acao, permitido] of Object.entries(acoes)) {
        await pool.execute(
          'INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, ?, ?, ?, ?)',
          [usuarioId, modulo, submodulo, acao, permitido ? 1 : 0]
        );
      }
    }

    return sucesso(res, null, 'Permissões salvas com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET/PUT /api/configuracoes/integracoes — Gerencia integrações externas
async function buscarIntegracoes(req, res) {
  try {
    const [rows] = await pool.execute('SELECT modulo, ativo, configuracoes FROM configuracoes_integracoes');
    // Retorna um objeto por módulo (ativo + campos de configuração) para preencher os formulários.
    // Tela é admin-only e protegida por JWT — por isso devolvemos os valores salvos.
    const resultado = {};
    for (const r of rows) {
      const cfg = r.configuracoes
        ? (typeof r.configuracoes === 'string' ? JSON.parse(r.configuracoes) : r.configuracoes)
        : {};
      resultado[r.modulo] = { ativo: !!r.ativo, ...cfg };
    }
    return sucesso(res, resultado);
  } catch (err) {
    return erroInterno(res, err);
  }
}

async function salvarIntegracao(req, res) {
  try {
    const { modulo } = req.params;
    // O frontend envia o objeto "plano" do módulo: { ativo, ...campos de configuração }.
    // Separamos o "ativo" do resto (que vira o JSON de configurações).
    const { ativo, ...configuracoes } = req.body || {};

    // CNJ (DJEN): no máximo 10 OABs por escritório (defesa no servidor, além da tela).
    if (modulo === 'cnj' && Array.isArray(configuracoes.oabs) && configuracoes.oabs.length > 10) {
      return erro(res, 'O CNJ (DJEN) permite no máximo 10 OABs.');
    }

    await pool.execute(
      `UPDATE configuracoes_integracoes SET ativo=?, configuracoes=?, atualizado_em=NOW()
       WHERE modulo=?`,
      [ativo ? 1 : 0, Object.keys(configuracoes).length ? JSON.stringify(configuracoes) : null, modulo]
    );

    return sucesso(res, null, 'Integração atualizada');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/configuracoes/usuarios/:id/senha — Admin redefine a senha de um usuário
async function redefinirSenhaAdmin(req, res) {
  try {
    const { id } = req.params;
    const { senha } = req.body;
    if (!senha) return erro(res, 'A senha é obrigatória');
    const errSenha = validarSenha(senha);
    if (errSenha) return erro(res, errSenha);

    const [rows] = await pool.execute('SELECT id, nivel FROM usuarios WHERE id = ? AND ativo = 1', [id]);
    if (!rows.length) return naoEncontrado(res, 'Usuário não encontrado');
    // Blindagem do superusuário: nem o admin pode redefinir a senha do super (nivel 0).
    // Mesma trava já usada em atualizarUsuario/excluirUsuario — fecha o vetor de takeover
    // (admin resetava a senha do super por id e logava como ele).
    if (rows[0].nivel === 0) return erro(res, 'Não é possível redefinir a senha do superusuário', 403);

    const hash = await bcrypt.hash(senha, 12);
    await pool.execute('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [hash, id]);

    // Invalida eventuais tokens de reset pendentes deste usuário
    await pool.execute('UPDATE reset_tokens SET usado = 1 WHERE usuario_id = ?', [id]);

    return sucesso(res, null, 'Senha redefinida com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// Retorna a data/hora atual do servidor e o fuso horário configurado
function horaServidor(req, res) {
  const agora    = new Date();
  const fusoHora = Intl.DateTimeFormat('pt-BR', { timeZoneName: 'short' })
                       .formatToParts(agora)
                       .find(p => p.type === 'timeZoneName')?.value || '';

  return sucesso(res, {
    iso:          agora.toISOString(),       // ex: "2026-06-10T16:54:23.000Z"
    fuso_horario: Intl.DateTimeFormat().resolvedOptions().timeZone, // ex: "America/Sao_Paulo"
    fuso_abrev:   fusoHora,                  // ex: "BRT"
  });
}

// DELETE /api/configuracoes/usuarios/:id — Exclui usuário
async function excluirUsuario(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT nivel, nome FROM usuarios WHERE id = ?', [id]);
    if (!rows.length) return naoEncontrado(res, 'Usuário não encontrado');
    if (rows[0].nivel === 0) return erro(res, 'Não é possível excluir o superusuário', 403);
    if (parseInt(id) === req.usuario.id) return erro(res, 'Você não pode excluir seu próprio usuário', 403);

    await pool.execute('DELETE FROM usuarios WHERE id = ?', [id]);
    return sucesso(res, null, `Usuário "${rows[0].nome}" excluído com sucesso`);
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return erro(res, 'Este usuário não pode ser excluído pois possui registros vinculados no sistema');
    }
    return erroInterno(res, err);
  }
}

// GET /api/configuracoes/usuarios/:id/historico — Histórico de ações do usuário
async function historicoUsuario(req, res) {
  try {
    const { id } = req.params;
    const { data_de, data_ate } = req.query;

    const [usuario] = await pool.execute('SELECT nome FROM usuarios WHERE id = ?', [id]);
    if (!usuario.length) return naoEncontrado(res, 'Usuário não encontrado');

    let sql = `
      SELECT id, tabela, acao, registro_id, descricao, criado_em
      FROM logs_auditoria
      WHERE usuario_id = ?`;
    const params = [id];

    if (data_de) { sql += ' AND DATE(criado_em) >= ?'; params.push(data_de); }
    if (data_ate) { sql += ' AND DATE(criado_em) <= ?'; params.push(data_ate); }
    sql += ' ORDER BY criado_em DESC LIMIT 500';

    const [rows] = await pool.execute(sql, params);
    return sucesso(res, { usuario: usuario[0].nome, registros: rows });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/calendario/dia-util?data=YYYY-MM-DD
async function verificarDiaUtil(req, res) {
  try {
    const { data } = req.query;
    if (!data) return erro(res, 'Data é obrigatória');
    const util = await ehDiaUtil(data);
    // Busca descrição do feriado se não for dia útil
    let descricao = null;
    if (!util) {
      const d = new Date(data + 'T12:00:00');
      const diaSemana = d.getDay();
      if (diaSemana === 0) descricao = 'domingo';
      else if (diaSemana === 6) descricao = 'sábado';
      else {
        const [rows] = await pool.execute(
          'SELECT descricao FROM feriados WHERE data = ? LIMIT 1', [data]
        );
        descricao = rows[0]?.descricao || 'feriado';
      }
    }
    return sucesso(res, { dia_util: util, descricao });
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = {
  infoPublica,
  uploadLogo, salvarLogo, removerLogo,
  buscarEscritorio, atualizarEscritorio, marcarSetupConcluido,
  listarFeriados, criarFeriado, excluirFeriado,
  listarUsuarios, criarUsuario, atualizarUsuario, redefinirSenhaAdmin, excluirUsuario, historicoUsuario,
  buscarPermissoes, salvarPermissoes,
  buscarIntegracoes, salvarIntegracao,
  horaServidor,
  verificarDiaUtil,
};
