// ============================================================
// CONTROLLER DE CONFIGURAÇÕES
// Escritório, feriados, integrações, usuários e setup inicial
// ============================================================

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const bcrypt = require('bcryptjs');
const auditoria = require('../middleware/auditoria');
const { ehDiaUtil, proximoDiaUtil, calcularVencimento } = require('../services/calendarioService');
const { reagendarCronPrazos } = require('../services/alertasService');
const multer = require('multer');
const { lerTextos, horaDoDia, texto, dataIso } = require('../utils/camposTexto');
const { validarSenha, validarLogin } = require('../utils/credenciais');
const { lerConfig: lerConfigAvisos } = require('../avisos/config');

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
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE configuracoes_escritorio SET logo_base64 = ? LIMIT 1', [dataUri]);
      await auditoria.registrar(req.usuario.id, 'configuracoes_escritorio', 'editar', 1, null, null, conn);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, { logo_base64: dataUri }, 'Logo atualizado com sucesso!');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/configuracoes/logo — Remove o logo (volta ao padrão, que mostra o nome do escritório).
async function removerLogo(req, res) {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE configuracoes_escritorio SET logo_base64 = NULL LIMIT 1');
      await auditoria.registrar(req.usuario.id, 'configuracoes_escritorio', 'editar', 1, null, null, conn);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
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
// Campos de texto do escritório, com os limites das colunas de configuracoes_escritorio.
const CAMPOS_ESCRITORIO = {
  nome: { rotulo: 'Nome do escritório', max: 200, obrigatorio: true }, cnpj_cpf: { rotulo: 'CNPJ/CPF', max: 20 },
  email: { rotulo: 'E-mail', max: 150 }, telefone: { rotulo: 'Telefone', max: 20 }, cep: { rotulo: 'CEP', max: 9 },
  logradouro: { rotulo: 'Logradouro', max: 200 }, numero: { rotulo: 'Número', max: 20, aceitaNumero: true },
  bairro: { rotulo: 'Bairro', max: 100 }, cidade: { rotulo: 'Cidade', max: 100 }, estado: { rotulo: 'Estado', max: 2 },
  cor_principal: { rotulo: 'Cor principal', max: 7 }, titulo_aba: { rotulo: 'Título da aba', max: 100 },
  alerta_emails: { rotulo: 'E-mails de alerta', max: 5000 }, mensagem_aniversario: { rotulo: 'Mensagem de aniversário', max: 5000, feminino: true },
};
// Número inteiro de dias/minutos: ausente, texto ou zero volta ao padrão (como antes); negativo ou acima do teto = erro claro (o banco recusaria).
const TETO_DIAS_ESCRITORIO = 100000;
function inteiroOuPadrao(bruto, padrao, rotulo) {
  const n = parseInt(bruto, 10);
  if (!Number.isFinite(n) || n === 0) return { valor: padrao };
  if (n < 0 || n > TETO_DIAS_ESCRITORIO) return { erro: `${rotulo} inválido (use um número entre 1 e ${TETO_DIAS_ESCRITORIO})` };
  return { valor: n };
}
// Dias de antecedência dos avisos aos clientes: 0 vale ("no mesmo dia"); ausente/texto volta ao padrão; negativo ou acima do teto = erro claro.
function inteiroDiasAviso(bruto, padrao, rotulo) {
  if (bruto === undefined || bruto === null || bruto === '') return { valor: padrao };
  const n = Number(bruto);
  if (!Number.isInteger(n)) return { valor: padrao };
  if (n < 0 || n > TETO_DIAS_ESCRITORIO) return { erro: `${rotulo} inválido (use um número entre 0 e ${TETO_DIAS_ESCRITORIO})` };
  return { valor: n };
}
async function atualizarEscritorio(req, res) {
  try {
    const corpo = req.body || {};
    const textos = lerTextos(corpo, CAMPOS_ESCRITORIO);
    if (textos.erro) return erro(res, textos.erro);
    const { nome, cnpj_cpf, email, telefone, cep, logradouro, numero, bairro, cidade, estado, cor_principal, titulo_aba, alerta_emails, mensagem_aniversario } = textos.dados;
    const {
      horario_alerta_prazos, horario_alerta_prazos_2,
      alerta_atrasado_ativo,
      ata_advogado_obrigatorio,
      advogado_principal_id
    } = corpo;
    const horario1 = horaDoDia(horario_alerta_prazos, { rotulo: 'Horário do alerta de prazos' });
    if (horario1.erro) return erro(res, horario1.erro);
    const horario2 = horaDoDia(horario_alerta_prazos_2, { rotulo: 'Segundo horário do alerta de prazos' });
    if (horario2.erro) return erro(res, horario2.erro);
    const numeros = {};
    // Avisos aos clientes: dias de antecedência (0 = no mesmo dia) e "mostrar antes de enviar" de cada módulo (ausente = mantém o que está).
    const atualAvisos = await lerConfigAvisos();
    for (const [chave, padrao, rotulo] of [
      ['dias_alerta_audiencia', 3, 'Dias de alerta de audiência'], ['dias_alerta_pericia', 2, 'Dias de alerta de perícia'], ['dias_aviso_parabens', 0, 'Dias de aviso dos parabéns'],
    ]) {
      const lido = inteiroDiasAviso(corpo[chave], padrao, rotulo);
      if (lido.erro) return erro(res, lido.erro);
      numeros[chave] = lido.valor;
    }
    const mostrar = (valor, atual) => (valor === undefined || valor === null ? (atual ? 1 : 0) : (valor === true || valor === 1 || valor === '1' ? 1 : 0));
    const avisosMostrar = {
      pericia: mostrar(corpo.avisos_pericia_mostrar, atualAvisos.pericia.mostrar),
      audiencia: mostrar(corpo.avisos_audiencia_mostrar, atualAvisos.audiencia.mostrar),
      parabens: mostrar(corpo.avisos_parabens_mostrar, atualAvisos.parabens.mostrar),
    };
    for (const [chave, padrao, rotulo] of [
      ['dias_sem_movimentacao', 30, 'Dias sem movimentação'], ['dias_processo_parado', 365, 'Dias de processo parado'],
      ['prazo_fazendo_timeout', 60, 'Tempo de "fazendo" do prazo'], ['dias_audiencia_sem_adv', 7, 'Dias de audiência sem advogado'],
    ]) {
      const lido = inteiroOuPadrao(corpo[chave], padrao, rotulo);
      if (lido.erro) return erro(res, lido.erro);
      numeros[chave] = lido.valor;
    }
    // Piso de 15 minutos no tempo de inatividade (defesa no servidor, além da tela).
    const inatividade = inteiroOuPadrao(corpo.tempo_inatividade_min, 15, 'Tempo de inatividade');
    if (inatividade.erro) return erro(res, inatividade.erro);
    const tempoInat = Math.max(15, inatividade.valor);

    // Validação: se os DOIS horários de alerta estiverem preenchidos, eles
    // precisam ter no mínimo 1 hora (60 min) de diferença entre si.
    // (comparação só por horário, dentro do mesmo dia — sem lógica de data)
    if (horario1.valor && horario2.valor) {
      const emMinutos = h => {
        const [hh, mm] = String(h).split(':');
        return parseInt(hh, 10) * 60 + parseInt(mm, 10);
      };
      if (Math.abs(emMinutos(horario1.valor) - emMinutos(horario2.valor)) < 60) {
        return erro(res, 'Os dois horários de alerta devem ter no mínimo 1 hora de diferença');
      }
    }

    const advogadoPrincipalId = advogado_principal_id ? parseInt(advogado_principal_id, 10) : null;
    if (advogadoPrincipalId) {
      const [adv] = await pool.execute(
        'SELECT id FROM usuarios WHERE id = ? AND ativo = 1 AND nivel > 0 LIMIT 1',
        [advogadoPrincipalId]
      );
      if (!adv.length) return erro(res, 'Advogado principal do escritório não encontrado ou inativo');
    }

    // INSERT se não existir registro, UPDATE se já existir (id=1 fixo)
    // Garante funcionamento mesmo em instalações novas sem registro inicial
    const conn = await pool.getConnection();
    try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO configuracoes_escritorio
         (id, nome, cnpj_cpf, email, telefone,
          cep, logradouro, numero, bairro, cidade, estado,
          cor_principal, horario_alerta_prazos, horario_alerta_prazos_2,
          alerta_atrasado_ativo, alerta_emails,
          dias_alerta_audiencia, dias_alerta_pericia, dias_sem_movimentacao, dias_processo_parado,
          prazo_fazendo_timeout, dias_audiencia_sem_adv, titulo_aba, mensagem_aniversario, tempo_inatividade_min,
          ata_advogado_obrigatorio, advogado_principal_id,
          avisos_pericia_mostrar, avisos_audiencia_mostrar, avisos_parabens_mostrar, dias_aviso_parabens, setup_concluido)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         nome=VALUES(nome), cnpj_cpf=VALUES(cnpj_cpf), email=VALUES(email), telefone=VALUES(telefone),
         cep=VALUES(cep), logradouro=VALUES(logradouro), numero=VALUES(numero),
         bairro=VALUES(bairro), cidade=VALUES(cidade), estado=VALUES(estado),
         cor_principal=VALUES(cor_principal), horario_alerta_prazos=VALUES(horario_alerta_prazos),
         horario_alerta_prazos_2=VALUES(horario_alerta_prazos_2),
         alerta_atrasado_ativo=VALUES(alerta_atrasado_ativo), alerta_emails=VALUES(alerta_emails),
         dias_alerta_audiencia=VALUES(dias_alerta_audiencia), dias_alerta_pericia=VALUES(dias_alerta_pericia),
         dias_sem_movimentacao=VALUES(dias_sem_movimentacao), dias_processo_parado=VALUES(dias_processo_parado),
         prazo_fazendo_timeout=VALUES(prazo_fazendo_timeout),
         dias_audiencia_sem_adv=VALUES(dias_audiencia_sem_adv), titulo_aba=VALUES(titulo_aba),
         mensagem_aniversario=VALUES(mensagem_aniversario),
         tempo_inatividade_min=VALUES(tempo_inatividade_min),
         ata_advogado_obrigatorio=VALUES(ata_advogado_obrigatorio),
         advogado_principal_id=VALUES(advogado_principal_id),
         avisos_pericia_mostrar=VALUES(avisos_pericia_mostrar), avisos_audiencia_mostrar=VALUES(avisos_audiencia_mostrar),
         avisos_parabens_mostrar=VALUES(avisos_parabens_mostrar), dias_aviso_parabens=VALUES(dias_aviso_parabens),
         setup_concluido=1`,
      [
        nome, cnpj_cpf, email, telefone,
        cep, logradouro, numero, bairro, cidade, estado,
        cor_principal || '#1a56db', horario1.valor || '18:00:00', horario2.valor,
        alerta_atrasado_ativo ? 1 : 0, alerta_emails,
        numeros.dias_alerta_audiencia, numeros.dias_alerta_pericia, numeros.dias_sem_movimentacao,
        numeros.dias_processo_parado,
        numeros.prazo_fazendo_timeout, numeros.dias_audiencia_sem_adv,
        titulo_aba, mensagem_aniversario, tempoInat,
        ata_advogado_obrigatorio ? 1 : 0,
        advogadoPrincipalId,
        avisosMostrar.pericia, avisosMostrar.audiencia, avisosMostrar.parabens, numeros.dias_aviso_parabens
      ]
    );
    await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }

    // Reagenda o cron de prazos caso o horário tenha mudado
    await reagendarCronPrazos();

    return sucesso(res, null, 'Configurações atualizadas com sucesso');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/configuracoes/documentos-maiusculas — lê o liga/desliga da CAIXA ALTA
// no NOME do autor/réu nos documentos gerados (somente admin). Tolerante à coluna ausente.
async function buscarDocumentosMaiusculas(req, res) {
  try {
    const [rows] = await pool.execute('SELECT documentos_maiusculas FROM configuracoes_escritorio LIMIT 1');
    return sucesso(res, { documentos_maiusculas: !!(rows[0] && rows[0].documentos_maiusculas) });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/configuracoes/documentos-maiusculas — liga/desliga a CAIXA ALTA no NOME
// do autor/réu nos documentos (somente admin). Body: { ativo: true|false }.
// A opção vale para TODO o escritório; afeta só o nome das partes na geração.
async function salvarDocumentosMaiusculas(req, res) {
  try {
    const ativo = req.body && req.body.ativo ? 1 : 0;
    // Mesma abordagem do logo: atualiza a linha única do escritório (id=1).
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE configuracoes_escritorio SET documentos_maiusculas = ? LIMIT 1', [ativo]);
      await auditoria.registrar(req.usuario.id, 'configuracoes_escritorio', 'editar', 1, null, null, conn);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(
      res,
      { documentos_maiusculas: !!ativo },
      ativo
        ? 'Ligado: os documentos passam a usar CAIXA ALTA no nome do autor e do réu.'
        : 'Desligado: os nomes do autor e do réu voltam ao normal nos documentos.'
    );
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

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE configuracoes_escritorio SET setup_concluido = 1');
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
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
  const { data, descricao, tipo } = req.body || {};
  if (!data || !descricao) return erro(res, 'Data e descrição são obrigatórias');
  // Confere TUDO antes de gravar: data que existe, descrição em texto (até 200) e tipo conhecido — nunca "Erro interno" nem lixo gravado.
  const dataLida = dataIso(data, { rotulo: 'Data' });
  if (dataLida.erro) return erro(res, dataLida.erro);
  const descLida = texto(descricao, { rotulo: 'Descrição', max: 200, obrigatorio: true, feminino: true });
  if (descLida.erro) return erro(res, descLida.erro);
  const tipoLido = (tipo === undefined || tipo === null || tipo === '') ? 'nacional' : tipo;
  if (!['nacional', 'local'].includes(tipoLido)) return erro(res, 'Tipo de feriado inválido (use nacional ou local)');

  // Transação: INSERT no feriado + UPDATE no calendário — ambos ou nenhum
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      'INSERT INTO feriados (data, descricao, tipo, criado_por) VALUES (?, ?, ?, ?)',
      [dataLida.valor, descLida.valor, tipoLido, req.usuario.id]
    );

    // Marca o dia como não útil no calendário dentro da mesma transação
    await conn.execute(
      'UPDATE calendario SET dia_util = 0 WHERE data = ?', [dataLida.valor]
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

    // O dia só volta a ser útil se NÃO é fim de semana e NÃO sobrou outro feriado cadastrado na mesma data
    // (a mesma data pode ter dois cadastros: nacional e local, ou cadastro repetido).
    const diaSemana = new Date(fer[0].data + 'T12:00:00').getDay();
    const [[sobrou]] = await conn.execute('SELECT COUNT(*) AS n FROM feriados WHERE data = ?', [fer[0].data]);
    if (diaSemana !== 0 && diaSemana !== 6 && Number(sobrou.n) === 0) {
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

// Níveis que a TELA de usuários pode gravar: 1 = Administrador, 2 = Comum.
// O nível 0 (superusuário) NUNCA vem por aqui — é criado só no setup inicial.
// Sem esta trava, uma chamada direta à API poderia mandar nivel:0 e criar/promover
// um superusuário (que é "invisível para todos" e passa por qualquer permissão).
function normalizarNivel(nivel) {
  if (nivel === undefined || nivel === null || nivel === '') return 2; // padrão: comum
  if (typeof nivel !== 'number' && typeof nivel !== 'string') return null; // lista/objeto: Number([1]) viraria 1 (administrador)
  const n = Number(nivel);
  return [1, 2].includes(n) ? n : null; // null = inválido
}

// "Ativo" do usuário: só 0, 1, verdadeiro ou falso (ausente = ativo). Devolve 0/1, ou null se for inválido.
function normalizarAtivo(ativo) {
  if (ativo === undefined || ativo === null) return 1;
  if (ativo === true || ativo === 1) return 1;
  if (ativo === false || ativo === 0) return 0;
  return null;
}

// Confere os textos do cadastro de usuário com o tamanho real das colunas (nome 150, e-mail 150, OAB 30, tipo 30).
// Tudo precisa ser texto; vazio opcional vira nulo. Devolve { valores } ou { erro }.
function lerDadosUsuario(corpo) {
  const r = lerTextos(corpo, {
    nome:  { rotulo: 'O nome', max: 150, obrigatorio: true },
    email: { rotulo: 'O e-mail', max: 150 },
    oab:   { rotulo: 'A OAB', max: 30, feminino: true },
    tipo:  { rotulo: 'O tipo', max: 30 },
  });
  return r;
}

// Garante que, depois da mudança, ainda sobra OUTRO administrador ativo (nível 0 ou 1). Roda dentro da transação,
// trancando as linhas, para dois administradores não se desativarem ao mesmo tempo.
async function sobraOutroAdministrador(conn, idAtual) {
  const [rest] = await conn.execute('SELECT id FROM usuarios WHERE nivel <= 1 AND ativo = 1 AND id <> ? FOR UPDATE', [idAtual]);
  return rest.length > 0;
}

// POST /api/configuracoes/usuarios — Cria usuário
async function criarUsuario(req, res) {
  try {
    const { login, senha, nivel, ver_todos_processos } = req.body;
    if (!req.body.nome || !login || !senha) return erro(res, 'Nome, login e senha são obrigatórios');
    const lido = lerDadosUsuario(req.body);
    if (lido.erro) return erro(res, lido.erro);
    const { nome, email, oab, tipo } = lido.dados;

    // Login só pode ter letras (sem números, espaços ou símbolos) — regra do sistema
    const errLogin = validarLogin(login);
    if (errLogin) return erro(res, errLogin);

    const errSenha = validarSenha(senha);
    if (errSenha) return erro(res, errSenha);

    const nv = normalizarNivel(nivel);
    if (nv === null) return erro(res, 'Nível de usuário inválido. Escolha Administrador ou Comum.');

    const [dup] = await pool.execute('SELECT id FROM usuarios WHERE login = ?', [login.trim()]);
    if (dup.length) return erro(res, 'Login já está em uso');

    const senhaHash = await bcrypt.hash(senha, 12);

    const conn = await pool.getConnection();
    let result;
    try {
      await conn.beginTransaction();
      [result] = await conn.execute(
        `INSERT INTO usuarios (nome, login, senha_hash, email, oab, tipo, nivel,
          ver_todos_processos, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nome, login.trim(), senhaHash, email, oab,
         tipo || 'advogado', nv, ver_todos_processos ? 1 : 0, req.usuario.id]
      );
      await auditoria.registrar(req.usuario.id, 'usuarios', 'criar', result.insertId, null, null, conn);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }

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
    const { nivel, ativo, ver_todos_processos, senha } = req.body;

    // Não permite alterar o superusuário
    const [usuario] = await pool.execute('SELECT nivel, ativo, tipo FROM usuarios WHERE id = ?', [id]);
    if (!usuario.length) return naoEncontrado(res, 'Usuário não encontrado');
    if (usuario[0].nivel === 0) return erro(res, 'Não é possível alterar o superusuário por aqui', 403);

    // Valida TUDO antes de gravar qualquer coisa (nível e senha, se enviada).
    const lido = lerDadosUsuario(req.body);
    if (lido.erro) return erro(res, lido.erro);
    const { nome, email, oab } = lido.dados;
    const tipo = lido.dados.tipo || usuario[0].tipo || 'advogado';   // tipo em branco = mantém o que já estava

    const nv = normalizarNivel(nivel);
    if (nv === null) return erro(res, 'Nível de usuário inválido. Escolha Administrador ou Comum.');
    const ativoNovo = normalizarAtivo(ativo);
    if (ativoNovo === null) return erro(res, 'Situação do usuário inválida (ativo ou inativo).');

    let novoHash = null;
    if (senha) {
      const errSenha = validarSenha(senha);
      if (errSenha) return erro(res, errSenha);
      novoHash = await bcrypt.hash(senha, 12);
    }

    // As duas escritas (senha + demais dados) em UMA transação: se a segunda falhar por
    // qualquer motivo (rede, e-mail duplicado, etc.), a senha não fica trocada sozinha.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // O último administrador ativo não pode ser desativado nem rebaixado: ninguém mais mexeria em usuários e permissões.
      if (Number(usuario[0].nivel) === 1 && Number(usuario[0].ativo) === 1 && (nv !== 1 || ativoNovo === 0)
          && !(await sobraOutroAdministrador(conn, id))) {
        await conn.rollback();
        return erro(res, 'Este é o último administrador ativo. Torne outro usuário administrador antes de desativar ou rebaixar este.');
      }
      if (novoHash) {
        await conn.execute('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [novoHash, id]);
      }
      await conn.execute(
        `UPDATE usuarios SET nome=?, email=?, oab=?, tipo=?, nivel=?, ativo=?, ver_todos_processos=?
         WHERE id = ?`,
        [nome, email, oab, tipo, nv, ativoNovo, ver_todos_processos ? 1 : 0, id]
      );
      await auditoria.registrar(req.usuario.id, 'usuarios', 'editar', id, null, null, conn);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

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
    const [existe] = await pool.execute('SELECT id FROM usuarios WHERE id = ?', [usuarioId]);
    if (!existe.length) return naoEncontrado(res, 'Usuário não encontrado');
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

// Confere o formato das permissões recebidas (colunas: módulo e sub-módulo até 50, ação até 20). Devolve a mensagem de erro, ou null se estiver certo.
function conferirPermissoes(permissoes) {
  const objeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!objeto(permissoes)) return 'Nenhuma permissão recebida.';
  for (const [chave, acoes] of Object.entries(permissoes)) {
    const partes = chave.split('.');
    if (partes.length > 2 || partes.some(p => p === '' || p.length > 50)) return `Módulo de permissão inválido: "${chave.slice(0, 60)}".`;
    if (!objeto(acoes)) return `As permissões de "${chave}" estão em formato inválido.`;
    for (const [acao, permitido] of Object.entries(acoes)) {
      if (acao === '' || acao.length > 20) return `Ação de permissão inválida em "${chave}".`;
      if (![true, false, 0, 1].includes(permitido)) return `O valor de "${chave}.${acao}" precisa ser verdadeiro ou falso.`;
    }
  }
  return null;
}

// PUT /api/configuracoes/permissoes/:usuarioId — Salva permissões do usuário
// Recebe: { 'pessoas': { visualizar: true }, 'processos.andamentos': { cadastrar: false }, ... }
async function salvarPermissoes(req, res) {
  const { usuarioId } = req.params;
  const { permissoes } = req.body;
  // Confere TUDO antes de apagar qualquer coisa: o corpo precisa ser { 'módulo' ou 'módulo.submódulo': { ação: verdadeiro/falso } }.
  const erroCorpo = conferirPermissoes(permissoes);
  if (erroCorpo) return erro(res, erroCorpo);

  const [alvo] = await pool.execute('SELECT nivel FROM usuarios WHERE id = ?', [usuarioId]);
  if (!alvo.length) return naoEncontrado(res, 'Usuário não encontrado');
  if (alvo[0].nivel === 0) return erro(res, 'O superusuário não tem permissões para editar', 403);

  // Transação: o DELETE das permissões antigas e os INSERT das novas são um bloco
  // ÚNICO. Se qualquer INSERT falhar, o rollback devolve o usuário às permissões
  // que ele tinha — antes ficava sem as antigas e só com parte das novas.
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute('DELETE FROM permissoes WHERE usuario_id = ?', [usuarioId]);

    for (const [chave, acoes] of Object.entries(permissoes)) {
      // Separa 'processos.andamentos' em modulo='processos', submodulo='andamentos'
      const pontoDot   = chave.indexOf('.');
      const modulo    = pontoDot >= 0 ? chave.slice(0, pontoDot)  : chave;
      const submodulo = pontoDot >= 0 ? chave.slice(pontoDot + 1) : null;

      for (const [acao, permitido] of Object.entries(acoes || {})) {
        await conn.execute(
          'INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, ?, ?, ?, ?)',
          [usuarioId, modulo, submodulo, acao, permitido ? 1 : 0]
        );
      }
    }

    await conn.commit();
    return sucesso(res, null, 'Permissões salvas com sucesso');
  } catch (err) {
    await conn.rollback();
    return erroInterno(res, err);
  } finally {
    conn.release();
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
      if (r.modulo === 'ia') {
        // A chave de API NUNCA volta pro navegador (nem mascarada) — só um booleano
        // dizendo se já existe uma salva. Deixar a tela em branco no "Salvar" mantém
        // a chave atual (ver salvarIntegracao); só digitando uma nova ela é trocada.
        const temChave = !!String(cfg.chave || '').trim();
        resultado[r.modulo] = { ativo: !!r.ativo, ...cfg, chave: '', chaveDefinida: temChave };
      } else {
        resultado[r.modulo] = { ativo: !!r.ativo, ...cfg };
      }
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

    // IA (Sugestões por IA): 1 provedor por vez (ou nenhum). Chave obrigatória se ativo.
    if (modulo === 'ia') {
      // A tela nunca recebe a chave de volta (ver buscarIntegracoes) — só o booleano
      // `chaveDefinida`, que não é config de verdade e não pode ir pro JSON salvo.
      delete configuracoes.chaveDefinida;

      const provedoresOk = ['nenhum', 'claude', 'openai', 'mock'];
      if (configuracoes.provedor && !provedoresOk.includes(configuracoes.provedor)) {
        return erro(res, 'Provedor de IA inválido.');
      }
      const prov = configuracoes.provedor || 'nenhum';
      const chaveDigitada = String(configuracoes.chave || '').trim();
      if (chaveDigitada) {
        configuracoes.chave = chaveDigitada;
      } else {
        // Campo veio vazio: NÃO apaga a chave já salva — o front nunca mostra a chave
        // existente (por segurança), então "vazio" aqui significa "não mexi nela".
        const [existente] = await pool.execute(
          `SELECT configuracoes FROM configuracoes_integracoes WHERE modulo = 'ia' LIMIT 1`
        );
        const cfgAtual = (existente.length && existente[0].configuracoes)
          ? (typeof existente[0].configuracoes === 'string' ? JSON.parse(existente[0].configuracoes) : existente[0].configuracoes)
          : {};
        configuracoes.chave = String(cfgAtual.chave || '').trim();
      }
      if (ativo && prov !== 'nenhum' && prov !== 'mock' && !configuracoes.chave) {
        return erro(res, 'Informe a chave de API do provedor de IA escolhido.');
      }
      configuracoes.modelo = String(configuracoes.modelo || '').trim();
    }

    // CNJ (DJEN): defesa no servidor, além da tela.
    if (modulo === 'cnj' && Array.isArray(configuracoes.oabs)) {
      // No máximo 10 OABs por escritório.
      if (configuracoes.oabs.length > 10) {
        return erro(res, 'O CNJ (DJEN) permite no máximo 10 OABs.');
      }
      // Toda OAB precisa ter número E UF — não pode linha incompleta/vazia.
      const temIncompleta = configuracoes.oabs.some(
        o => !String(o?.numero || '').trim() || !String(o?.uf || '').trim()
      );
      if (temIncompleta) {
        return erro(res, 'Cada OAB monitorada precisa ter número e UF.');
      }
    }

    const cfgJson = Object.keys(configuracoes).length ? JSON.stringify(configuracoes) : null;
    // UPDATE-depois-INSERT (sem lock) permitia duas gravações simultâneas criarem DUAS linhas
    // do mesmo módulo (ex.: 'ia'), já que nada travava a linha entre o UPDATE e o INSERT
    // (auditoria 02/09, item 11). Agora tudo roda em UMA transação com SELECT ... FOR UPDATE:
    // a segunda gravação concorrente espera a primeira terminar, em vez de correr em paralelo.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [existe] = await conn.execute(
        `SELECT id FROM configuracoes_integracoes WHERE modulo = ? FOR UPDATE`, [modulo]
      );
      if (existe.length) {
        await conn.execute(
          `UPDATE configuracoes_integracoes SET ativo=?, configuracoes=?, atualizado_em=NOW()
           WHERE modulo=?`,
          [ativo ? 1 : 0, cfgJson, modulo]
        );
      } else {
        await conn.execute(
          `INSERT INTO configuracoes_integracoes (modulo, ativo, configuracoes, atualizado_em)
           VALUES (?, ?, ?, NOW())`,
          [modulo, ativo ? 1 : 0, cfgJson]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    // Zera o cache do serviço de IA para a próxima sugestão já usar a config nova.
    if (modulo === 'ia') { try { require('../services/iaService').limparCacheIa(); } catch {} }

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

    // Grava o novo hash e invalida tokens de reset pendentes em uma única transação.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // sessao_atual = NULL derruba qualquer sessão aberta do usuário (mesma trava de
      // "logou em outro aparelho") — senha redefinida pelo admin exige login de novo.
      await conn.execute('UPDATE usuarios SET senha_hash = ?, sessao_atual = NULL WHERE id = ?', [hash, id]);
      await conn.execute('UPDATE reset_tokens SET usado = 1 WHERE usuario_id = ?', [id]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

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

// Todas as colunas do banco que guardam usuarios.id (auditoria 24/09) — levantadas direto do
// estrutura_banco.sql (101 com chave estrangeira) + 4 sem chave estrangeira, confirmadas no
// código (gravam req.usuario.id): logs_auditoria.usuario_id, parabens_enviados.usuario_id,
// audiencia_responsaveis.criado_por, audiencia_testemunhas.criado_por.
// Regra nº1 do sistema: usuário referenciado em QUALQUER uma delas não pode ser excluído,
// nem o rastro histórico (criado_por/alterado_por) — só "Desativar" (já existe na edição).
const REFS_USUARIO = [
  ["acordo", "alterado_por"],
  ["acordo", "criado_por"],
  ["acordo_parcela", "repasse_cliente_por"],
  ["acordo_parcela", "repasse_parceiro_por"],
  ["acordo_parcela_multa", "criado_por"],
  ["acordo_parcela_multa", "repasse_cliente_por"],
  ["acordo_parcela_multa", "repasse_parceiro_por"],
  ["advogados_freela", "criado_por"],
  ["agenda_compromisso", "concluido_por"],
  ["agenda_compromisso", "delegado_para"],
  ["agenda_compromisso", "usuario_id"],
  ["andamento_processual", "criado_por"],
  ["andamento_processual", "editado_por"],
  ["ata_audiencia", "criado_por"],
  ["ata_audiencia", "advogado_id"],
  ["audiencia", "alterado_por"],
  ["audiencia", "responsavel_id"],
  ["audiencia", "criado_por"],
  ["audiencia_responsaveis", "responsavel_id"],
  ["audiencias_etiquetas", "usuario_id"],
  ["auditoria_audiencia", "usuario_id"],
  ["auditoria_conta_corrente", "usuario_id"],
  ["auditoria_etiqueta_escritorio", "usuario_id"],
  ["auditoria_parcela", "usuario_id"],
  ["auditoria_pericia", "usuario_id"],
  ["auditoria_prazo", "usuario_id"],
  ["configuracoes_escritorio", "advogado_principal_id"],
  ["conta_corrente", "usuario_id"],
  ["etiquetas_definicoes", "usuario_id"],
  ["feriados", "criado_por"],
  ["historico_atendimento", "usuario_id"],
  ["log_comunicacoes", "usuario_id"],
  ["log_documentos_gerados", "usuario_id"],
  ["log_publicacoes", "usuario_id"],
  ["modelo_documento", "alterado_por"],
  ["relatorio_modelo", "dono_id"],
  ["relatorio_modelo", "alterado_por"],
  ["relatorio_modelo_usuario", "usuario_id"],
  ["modelo_documento", "criado_por"],
  ["notificacoes", "usuario_id"],
  ["avisos_cliente", "decidido_por"],
  ["pastas_etiquetas", "usuario_id"],
  ["pendencia_documento", "alterado_por"],
  ["pendencia_documento", "criado_por"],
  ["pendencia_documento", "resolvido_por"],
  ["pendencia_documento_item", "recebido_por"],
  ["pendencia_documento_responsavel", "criado_por"],
  ["pendencia_documento_responsavel", "usuario_id"],
  ["pericia", "alterado_por"],
  ["pericia", "responsavel_id"],
  ["pericia", "assistente_tecnico_id"],
  ["pericia", "criado_por"],
  ["pericias_etiquetas", "usuario_id"],
  ["permissoes", "usuario_id"],
  ["pessoas_avisos_idade", "criado_por"],
  ["pessoas_fisicas", "alterado_por"],
  ["pessoas_fisicas", "criado_por"],
  ["pessoas_fisicas_etiquetas_escritorio", "marcado_por"],
  ["pessoas_juridicas", "alterado_por"],
  ["pessoas_juridicas", "criado_por"],
  ["pessoas_juridicas_etiquetas_escritorio", "marcado_por"],
  ["prazos_etiquetas", "usuario_id"],
  ["prazos_processo", "fazendo_por"],
  ["prazos_processo", "delegado_para"],
  ["prazos_processo", "concluido_por"],
  ["prazos_processo", "status_alterado_por"],
  ["prazos_processo", "criado_por"],
  ["processo_assunto", "criado_por"],
  ["processo_perito", "criado_por"],
  ["processos_etiquetas_escritorio", "marcado_por"],
  ["publicacao_usuario", "usuario_id"],
  ["publicacao_usuario", "atribuida_por"],
  ["publicacao_usuario", "tratada_por"],
  ["publicacoes", "direcionada_por"],
  ["publicacoes", "importada_por"],
  ["publicacoes", "tratada_por"],
  ["publicacoes_etiquetas", "usuario_id"],
  ["publicacoes_lidas", "usuario_id"],
  ["reset_tokens", "usuario_id"],
  ["tarefas", "atribuida_para"],
  ["tarefas", "concluida_por"],
  ["tarefas", "criado_por"],
  ["tarefas_etiquetas", "usuario_id"],
  ["tblassuntoproc", "criado_por"],
  ["tblassuntoproc", "alterado_por"],
  ["tblforum", "criado_por"],
  ["tblforum", "alterado_por"],
  ["tblinstanciaproc", "criado_por"],
  ["tblinstanciaproc", "alterado_por"],
  ["tblpasta", "criado_por"],
  ["tblpasta", "alterado_por"],
  ["tblproc", "responsavel_id"],
  ["tblproc", "criado_por"],
  ["tblproc", "alterado_por"],
  ["processo_oabs", "usuario_id"],
  ["processo_oabs", "criado_por"],
  ["tblstatusproc", "criado_por"],
  ["tblstatusproc", "alterado_por"],
  ["tbltipoproc", "criado_por"],
  ["tbltipoproc", "alterado_por"],
  ["tbltituloprocautor", "criado_por"],
  ["tbltituloprocreu", "criado_por"],
  ["tblvara", "criado_por"],
  ["tblvara", "alterado_por"],
  ["tipo_documento_pendencia", "alterado_por"],
  ["tipo_documento_pendencia", "criado_por"],
  ["usuarios", "criado_por"],
  ["logs_auditoria", "usuario_id"],
  ["parabens_enviados", "usuario_id"],
  ["audiencia_responsaveis", "criado_por"],
  ["audiencia_testemunhas", "criado_por"],
];

// DELETE /api/configuracoes/usuarios/:id — Exclui usuário
async function excluirUsuario(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT nivel, nome FROM usuarios WHERE id = ?', [id]);
    if (!rows.length) return naoEncontrado(res, 'Usuário não encontrado');
    if (rows[0].nivel === 0) return erro(res, 'Não é possível excluir o superusuário', 403);
    if (parseInt(id) === req.usuario.id) return erro(res, 'Você não pode excluir seu próprio usuário', 403);

    // Regra nº1 do sistema: não excluir usuário referenciado em NENHUM lugar do sistema —
    // 1 única consulta (UNION ALL) cobrindo as 105 colunas que guardam usuarios.id.
    const sqlUniao = REFS_USUARIO
      .map(([tabela, coluna]) => `SELECT '${tabela}.${coluna}' AS ref, COUNT(*) AS total FROM \`${tabela}\` WHERE \`${coluna}\` = ?`)
      .join(' UNION ALL ');
    const [usos] = await pool.execute(sqlUniao, REFS_USUARIO.map(() => id));
    const vinculos = usos.filter(u => u.total > 0).map(u => `${u.ref} (${u.total})`);
    if (vinculos.length > 0) {
      return erro(res, `Usuário não pode ser excluído pois está referenciado em: ${vinculos.join(', ')}. Use "Desativar" em vez de excluir.`);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM usuarios WHERE id = ?', [id]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
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
    for (const [valor, rotulo] of [[data_de, 'A data inicial'], [data_ate, 'A data final']]) {
      if (valor === undefined || valor === '') continue;
      const d = dataIso(valor, { rotulo });
      if (d.erro) return erro(res, d.erro);
    }

    // Filtra e limita primeiro (derivada "l"); só então resolve o número da pasta.
    let filtro = 'WHERE usuario_id = ?';
    const params = [id];
    if (data_de) { filtro += ' AND DATE(criado_em) >= ?'; params.push(data_de); }
    if (data_ate) { filtro += ' AND DATE(criado_em) <= ?'; params.push(data_ate); }

    // pasta_num: só leitura, calculada na hora (nada novo é gravado). Cada registro do
    // log aponta, pelo nome da tabela, para algo ligado a um processo (ou direto a uma
    // pasta); o processo aponta para a pasta. Se o registro foi excluído de vez, tenta
    // o processo_id guardado em dados_antigos. Sem vínculo, fica NULL e a tela mostra "#id".
    const sql = `
      SELECT l.id, l.tabela, l.acao, l.registro_id, l.descricao, l.criado_em,
             COALESCE(pa_direta.numPasta, pa_proc.numPasta) AS pasta_num
        FROM (
          SELECT id, tabela, acao, registro_id, descricao, dados_antigos, criado_em
            FROM logs_auditoria
            ${filtro}
           ORDER BY criado_em DESC LIMIT 500
        ) l
        LEFT JOIN tarefas             t   ON l.tabela = 'tarefas'              AND t.id   = l.registro_id
        LEFT JOIN prazos_processo     pz  ON l.tabela = 'prazos_processo'      AND pz.id  = l.registro_id
        LEFT JOIN andamento_processual an ON l.tabela = 'andamento_processual' AND an.id = l.registro_id
        LEFT JOIN audiencia           au  ON l.tabela = 'audiencia'            AND au.id  = l.registro_id
        LEFT JOIN ata_audiencia       at_ ON l.tabela = 'ata_audiencia'        AND at_.id = l.registro_id
        LEFT JOIN audiencia           au2 ON au2.id = at_.audiencia_id
        LEFT JOIN pericia             pe  ON l.tabela = 'pericia'              AND pe.id  = l.registro_id
        LEFT JOIN acordo              ac  ON l.tabela = 'acordo'               AND ac.id  = l.registro_id
        LEFT JOIN acordo_parcela      ap  ON l.tabela = 'acordo_parcela'       AND ap.id  = l.registro_id
        LEFT JOIN acordo              ac2 ON ac2.id = ap.acordo_id
        LEFT JOIN conta_corrente      cc  ON l.tabela = 'conta_corrente'       AND cc.id  = l.registro_id
        LEFT JOIN tblpasta            pa_direta ON pa_direta.id = CASE l.tabela
                                                    WHEN 'tblpasta' THEN l.registro_id
                                                    WHEN 'tarefas'  THEN t.pasta_id
                                                  END
        LEFT JOIN tblproc             pr  ON pr.id = COALESCE(
                                                    CASE l.tabela WHEN 'tblproc' THEN l.registro_id END,
                                                    t.processo_id, pz.processo_id, an.processo_id,
                                                    au.processo_id, au2.processo_id, pe.processo_id,
                                                    ac.processo_id, ac2.processo_id, cc.processo_id,
                                                    CAST(JSON_UNQUOTE(JSON_EXTRACT(l.dados_antigos, '$.processo_id')) AS UNSIGNED))
        LEFT JOIN tblpasta            pa_proc ON pa_proc.id = pr.pasta_id
       ORDER BY l.criado_em DESC`;

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
    const dataLida = dataIso(data, { rotulo: 'Data' });      // "abc", "2026-02-30" etc. não são datas: aviso, em vez de responder "feriado"
    if (dataLida.erro) return erro(res, dataLida.erro);
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

function normalizarModelosEmailPerito(valor) {
  if (Array.isArray(valor)) return valor;
  if (!valor) return [];
  try { return JSON.parse(valor); } catch (_) { return []; }
}

async function listarModelosEmailPerito(req, res) {
  try {
    const [rows] = await pool.execute('SELECT modelos_email_perito FROM configuracoes_escritorio LIMIT 1');
    return sucesso(res, normalizarModelosEmailPerito(rows[0]?.modelos_email_perito));
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR') return sucesso(res, []);
    return erroInterno(res, err);
  }
}

// Mantém os modelos isolados da gravação das demais configurações do escritório.
async function salvarModelosEmailPerito(req, res) {
  const modelos = normalizarModelosEmailPerito(req.body?.modelos)
    .map(m => ({ id: String(m.id || '').trim(), nome: String(m.nome || '').trim(), assunto: String(m.assunto || '').trim(), corpo: String(m.corpo || '').trim() }))
    .filter(m => m.id && m.nome && m.assunto && m.corpo);
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE configuracoes_escritorio SET modelos_email_perito = ? LIMIT 1', [JSON.stringify(modelos)]);
      await auditoria.registrar(req.usuario.id, 'configuracoes_escritorio', 'editar', 1, null, null, conn);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }
    return sucesso(res, modelos, 'Modelos de e-mail atualizados com sucesso');
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR') return erro(res, 'A atualização do banco dos modelos de e-mail ainda não foi aplicada.', 409);
    return erroInterno(res, err);
  }
}

// GET /api/calendario/periodo-util?data=YYYY-MM-DD&quantidade=N
// Retorna um período inclusivo de N dias úteis. Se a data inicial não for útil,
// a contagem começa no próximo dia útil registrado no calendário do escritório.
async function calcularPeriodoUtil(req, res) {
  try {
    const { data, quantidade } = req.query;
    const qtd = Number(quantidade);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) {
      return erro(res, 'Data inicial inválida');
    }
    if (!Number.isInteger(qtd) || qtd <= 0 || qtd > 365) {
      return erro(res, 'Quantidade de dias úteis inválida');
    }

    const dataInicial = await proximoDiaUtil(data);
    const dataFinal = await calcularVencimento(dataInicial, qtd, 'uteis');
    return sucesso(res, { data_inicial: dataInicial, data_final: dataFinal });
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = {
  infoPublica,
  uploadLogo, salvarLogo, removerLogo,
  buscarEscritorio, atualizarEscritorio, marcarSetupConcluido,
  listarModelosEmailPerito, salvarModelosEmailPerito,
  buscarDocumentosMaiusculas, salvarDocumentosMaiusculas,
  listarFeriados, criarFeriado, excluirFeriado,
  listarUsuarios, criarUsuario, atualizarUsuario, redefinirSenhaAdmin, excluirUsuario, historicoUsuario,
  buscarPermissoes, salvarPermissoes,
  buscarIntegracoes, salvarIntegracao,
  horaServidor,
  verificarDiaUtil, calcularPeriodoUtil,
};
