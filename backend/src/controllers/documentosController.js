// ============================================================
// CONTROLLER DE DOCUMENTOS — Gestão de MODELOS (.docx)
// ------------------------------------------------------------
// FASE 1: cadastrar/listar/editar/desativar modelos de documento.
// Os arquivos .docx ficam no S3 (privado); o banco guarda só os
// metadados + a chave do arquivo no S3 (modelo_documento.arquivo_s3_key).
// A geração de documentos a partir dos modelos vem na Fase 2.
// ============================================================

const crypto = require('crypto');
const multer = require('multer');
const PizZip = require('pizzip');

const { pool } = require('../config/database');
const { sucesso, erro, naoEncontrado, erroInterno } = require('../utils/response');
const { hojeBrasilia } = require('../utils/helpers');
const s3Service = require('../services/s3Service');
const docxModeloService = require('../services/docxModeloService');
const variaveisResolver = require('../services/variaveisResolver');
const pdfConvertService = require('../services/pdfConvertService');
const { CATALOGO, CATALOGO_PARTE } = require('../config/variaveisDocumento');

const CONTENT_TYPE_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// --- Upload em memória (o arquivo vai direto para o S3, não toca o disco) ---
const uploadMemoria = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB por modelo
});

// Middleware de upload com tratamento de erro em JSON (em vez de erro genérico do multer).
function uploadModelo(req, res, next) {
  uploadMemoria.single('arquivo')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'Arquivo acima do limite de 5 MB'
        : (err.message || 'Falha no upload do arquivo');
      return erro(res, msg);
    }
    next();
  });
}

// Normaliza o "destino" do modelo (a que situação ele se aplica) e limpa a classificação
// (tipo/modalidade) conforme o destino. Destinos: comum | recibo_cliente | recibo_parceria |
// audiencia (tipo+modalidade) | pericia (tipo) | prazo (subtipo).
function normalizarDestino(body) {
  const validos = ['comum', 'recibo_cliente', 'recibo_parceria', 'audiencia', 'pericia', 'prazo', 'multipessoas'];
  const destino = validos.includes(body.destino) ? body.destino : 'comum';
  const intOrNull = v => (v !== undefined && v !== null && v !== '' && !isNaN(parseInt(v, 10))) ? parseInt(v, 10) : null;
  const out = { destino, tipo_audiencia_id: null, modalidade: null, tipo_pericia_id: null, subtipo_prazo_id: null };
  if (destino === 'audiencia') {
    out.tipo_audiencia_id = intOrNull(body.tipo_audiencia_id);
    out.modalidade = ['presencial', 'virtual'].includes(body.modalidade) ? body.modalidade : null;
  } else if (destino === 'pericia') {
    out.tipo_pericia_id = intOrNull(body.tipo_pericia_id);
  } else if (destino === 'prazo') {
    out.subtipo_prazo_id = intOrNull(body.subtipo_prazo_id);
  }
  return out;
}

// Valida a classificação obrigatória conforme o destino. Retorna mensagem de erro ou null.
function validarDestino(d) {
  if (d.destino === 'audiencia' && (!d.tipo_audiencia_id || !d.modalidade))
    return 'Para modelo de audiência, informe o tipo de audiência e a modalidade';
  if (d.destino === 'pericia' && !d.tipo_pericia_id)
    return 'Para modelo de perícia, informe o tipo de perícia';
  if (d.destino === 'prazo' && !d.subtipo_prazo_id)
    return 'Para modelo de prazo, informe o subtipo do prazo';
  return null;
}

// GET /api/documentos/destinos-opcoes — listas para o cadastro do "destino" do modelo
async function destinosOpcoes(req, res) {
  try {
    const [tiposAud] = await pool.execute('SELECT id, nome FROM tipo_audiencia WHERE ativo = 1 ORDER BY nome');
    const [tiposPer] = await pool.execute('SELECT id, nome FROM tipo_pericia WHERE ativo = 1 ORDER BY nome');
    const [subPrazo] = await pool.execute(
      `SELECT sp.id, sp.nome, tp.nome AS tipo_prazo_nome
       FROM prazo_subtipo sp LEFT JOIN tipo_prazo tp ON sp.tipo_prazo_id = tp.id
       WHERE sp.ativo = 1 ORDER BY tp.nome, sp.nome`
    );
    return sucesso(res, {
      tipos_audiencia: tiposAud,
      modalidades: [{ valor: 'presencial', nome: 'Presencial' }, { valor: 'virtual', nome: 'Virtual' }],
      tipos_pericia: tiposPer,
      subtipos_prazo: subPrazo,
    });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/documentos/variaveis — catálogo de variáveis (referência para montar o modelo)
function catalogoVariaveis(req, res) {
  return sucesso(res, CATALOGO);
}

// GET /api/documentos/variaveis-partes — catálogo das variáveis POR PESSOA
// (usadas dentro de {{#autores}}/{{#reus}} nos modelos "Documento de partes").
function catalogoVariaveisPartes(req, res) {
  return sucesso(res, CATALOGO_PARTE);
}

// GET /api/documentos/modelos — lista modelos (metadados; NUNCA traz o arquivo)
// ?incluir_inativos=1 traz também os desativados (tela de gestão).
async function listarModelos(req, res) {
  try {
    const where = req.query.incluir_inativos === '1' ? '' : 'WHERE m.ativo = 1';
    const [rows] = await pool.execute(
      `SELECT m.id, m.nome, m.descricao, m.destino,
              m.tipo_audiencia_id, m.modalidade, m.tipo_pericia_id, m.subtipo_prazo_id,
              m.blocos_exigidos, m.ativo, m.criado_em, u.nome AS criado_por_nome,
              ta.nome AS tipo_audiencia_nome, tp.nome AS tipo_pericia_nome, sp.nome AS subtipo_prazo_nome
       FROM modelo_documento m
       LEFT JOIN usuarios u ON m.criado_por = u.id
       LEFT JOIN tipo_audiencia ta ON m.tipo_audiencia_id = ta.id
       LEFT JOIN tipo_pericia tp ON m.tipo_pericia_id = tp.id
       LEFT JOIN prazo_subtipo sp ON m.subtipo_prazo_id = sp.id
       ${where}
       ORDER BY m.ativo DESC, m.nome ASC`
    );
    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/documentos/modelos/:id — metadados de um modelo
async function buscarModelo(req, res) {
  try {
    const [rows] = await pool.execute(
      `SELECT id, nome, descricao, destino, tipo_audiencia_id, modalidade, tipo_pericia_id, subtipo_prazo_id,
              blocos_exigidos, variaveis_usadas, ativo, criado_em
       FROM modelo_documento WHERE id = ?`,
      [req.params.id]
    );
    if (!rows.length) return naoEncontrado(res, 'Modelo não encontrado');
    return sucesso(res, rows[0]);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/documentos/modelos/:id/arquivo — baixa o .docx original (para editar e re-subir)
async function baixarModelo(req, res) {
  try {
    const [rows] = await pool.execute(
      'SELECT nome, arquivo_s3_key FROM modelo_documento WHERE id = ?', [req.params.id]
    );
    if (!rows.length) return naoEncontrado(res, 'Modelo não encontrado');

    const buffer = await s3Service.baixarArquivo(rows[0].arquivo_s3_key);
    res.setHeader('Content-Type', CONTENT_TYPE_DOCX);
    res.setHeader('Content-Disposition', `attachment; filename="${rows[0].nome}.docx"`);
    return res.send(buffer);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/documentos/modelos — cria um modelo (recebe o .docx via multipart)
async function criarModelo(req, res) {
  try {
    const { nome, descricao } = req.body;
    if (!nome || !nome.trim()) return erro(res, 'O nome do modelo é obrigatório');
    if (!req.file) return erro(res, 'Envie o arquivo .docx do modelo');
    if (!docxModeloService.ehDocxValido(req.file.buffer)) {
      return erro(res, 'Arquivo inválido: envie um documento .docx válido');
    }

    // Destino do modelo (a que situação se aplica) + validação da classificação.
    const d = normalizarDestino(req.body);
    const erroDest = validarDestino(d);
    if (erroDest) return erro(res, erroDest);

    // Lê as variáveis do .docx: deriva blocos exigidos e detecta variáveis desconhecidas.
    // Modelos "multipessoas" validam contra o catálogo POR PESSOA (autores/réus), não por âncora.
    const analise = d.destino === 'multipessoas'
      ? docxModeloService.analisarMultipessoas(req.file.buffer)
      : docxModeloService.analisar(req.file.buffer);

    // Sobe primeiro ao S3 (chave única). Se o banco falhar depois, removemos o arquivo.
    const key = `modelos/${crypto.randomUUID()}.docx`;
    await s3Service.enviarArquivo(key, req.file.buffer, CONTENT_TYPE_DOCX);

    try {
      const [result] = await pool.execute(
        `INSERT INTO modelo_documento
           (nome, descricao, destino, tipo_audiencia_id, modalidade, tipo_pericia_id, subtipo_prazo_id,
            arquivo_s3_key, blocos_exigidos, variaveis_usadas, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nome.trim(),
          descricao && descricao.trim() ? descricao.trim() : null,
          d.destino, d.tipo_audiencia_id, d.modalidade, d.tipo_pericia_id, d.subtipo_prazo_id,
          key,
          analise.blocos.join(',') || null,
          analise.conhecidas.join(',') || null,
          req.usuario.id,
        ]
      );
      // variaveis_desconhecidas vai como AVISO (não bloqueia) para a tela alertar o admin.
      return sucesso(res, {
        id: result.insertId,
        variaveis_desconhecidas: analise.desconhecidas,
      }, 'Modelo criado com sucesso', 201);
    } catch (dbErr) {
      // Mantém a consistência: se o INSERT falhar, apaga o arquivo já enviado ao S3.
      await s3Service.excluirArquivo(key).catch(() => {});
      throw dbErr;
    }
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/documentos/modelos/:id — edita metadados e (opcional) troca o .docx
async function atualizarModelo(req, res) {
  try {
    const { id } = req.params;
    const { nome, descricao } = req.body;
    if (!nome || !nome.trim()) return erro(res, 'O nome do modelo é obrigatório');

    const [rows] = await pool.execute(
      'SELECT arquivo_s3_key FROM modelo_documento WHERE id = ?', [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Modelo não encontrado');

    const d = normalizarDestino(req.body);
    const erroDest = validarDestino(d);
    if (erroDest) return erro(res, erroDest);
    const desc = descricao && descricao.trim() ? descricao.trim() : null;
    let desconhecidas = [];

    if (req.file) {
      // Trocou o arquivo: valida, analisa, sobe o novo e remove o antigo do S3.
      if (!docxModeloService.ehDocxValido(req.file.buffer)) {
        return erro(res, 'Arquivo inválido: envie um documento .docx válido');
      }
      const analise = d.destino === 'multipessoas'
        ? docxModeloService.analisarMultipessoas(req.file.buffer)
        : docxModeloService.analisar(req.file.buffer);
      desconhecidas = analise.desconhecidas;

      const novaKey = `modelos/${crypto.randomUUID()}.docx`;
      await s3Service.enviarArquivo(novaKey, req.file.buffer, CONTENT_TYPE_DOCX);

      try {
        await pool.execute(
          `UPDATE modelo_documento
             SET nome=?, descricao=?, destino=?, tipo_audiencia_id=?, modalidade=?, tipo_pericia_id=?, subtipo_prazo_id=?,
                 arquivo_s3_key=?, blocos_exigidos=?, variaveis_usadas=?, alterado_por=?, alterado_em=NOW()
           WHERE id=?`,
          [
            nome.trim(), desc, d.destino, d.tipo_audiencia_id, d.modalidade, d.tipo_pericia_id, d.subtipo_prazo_id,
            novaKey,
            analise.blocos.join(',') || null,
            analise.conhecidas.join(',') || null,
            req.usuario.id, id,
          ]
        );
      } catch (dbErr) {
        await s3Service.excluirArquivo(novaKey).catch(() => {});
        throw dbErr;
      }

      // Remove o arquivo antigo (best-effort; não derruba a operação se falhar).
      if (rows[0].arquivo_s3_key && rows[0].arquivo_s3_key !== novaKey) {
        await s3Service.excluirArquivo(rows[0].arquivo_s3_key).catch(() => {});
      }
    } else {
      // Só metadados (mantém o arquivo atual).
      await pool.execute(
        `UPDATE modelo_documento
           SET nome=?, descricao=?, destino=?, tipo_audiencia_id=?, modalidade=?, tipo_pericia_id=?, subtipo_prazo_id=?,
               alterado_por=?, alterado_em=NOW()
         WHERE id=?`,
        [nome.trim(), desc, d.destino, d.tipo_audiencia_id, d.modalidade, d.tipo_pericia_id, d.subtipo_prazo_id, req.usuario.id, id]
      );
    }

    return sucesso(res, { variaveis_desconhecidas: desconhecidas }, 'Modelo atualizado');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/documentos/modelos/:id/desativar — soft-delete (ativo=0). NUNCA apaga de verdade.
async function desativarModelo(req, res) {
  try {
    await pool.execute(
      'UPDATE modelo_documento SET ativo=0, alterado_por=?, alterado_em=NOW() WHERE id=?',
      [req.usuario.id, req.params.id]
    );
    return sucesso(res, null, 'Modelo desativado');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// PUT /api/documentos/modelos/:id/reativar — volta um modelo desativado (ativo=1)
async function reativarModelo(req, res) {
  try {
    await pool.execute(
      'UPDATE modelo_documento SET ativo=1, alterado_por=?, alterado_em=NOW() WHERE id=?',
      [req.usuario.id, req.params.id]
    );
    return sucesso(res, null, 'Modelo reativado');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// DELETE /api/documentos/modelos/:id — EXCLUSÃO DEFINITIVA do modelo (diferente de "Desativar").
// Apaga a linha do banco e o arquivo .docx do S3. O histórico de documentos gerados NÃO quebra:
// a FK log_documentos_gerados.modelo_id é ON DELETE SET NULL e o nome do modelo já fica gravado
// por extenso no log. Operação permanente (sem reativar) — a tela confirma antes.
async function excluirModelo(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT arquivo_s3_key FROM modelo_documento WHERE id = ?', [id]
    );
    if (!rows.length) return naoEncontrado(res, 'Modelo não encontrado');

    // Apaga do banco primeiro (a FK do log faz SET NULL automaticamente).
    await pool.execute('DELETE FROM modelo_documento WHERE id = ?', [id]);

    // Remove o .docx do S3 (best-effort: se falhar, o registro já saiu — não desfaz a exclusão).
    if (rows[0].arquivo_s3_key) {
      await s3Service.excluirArquivo(rows[0].arquivo_s3_key).catch(() => {});
    }

    return sucesso(res, null, 'Modelo excluído definitivamente');
  } catch (err) {
    return erroInterno(res, err);
  }
}

// Remove caracteres inválidos para nome de arquivo e normaliza espaços.
function sanitizarNome(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

// Monta o nome do arquivo: "{Modelo} - {Cliente} - Proc {XXX}.{ext}"
// (XXX = número do processo só com dígitos; partes ausentes são omitidas).
function montarNomeArquivo(modeloNome, clienteNome, numProcDigitos, ext) {
  let base = sanitizarNome(modeloNome);
  if (clienteNome) base += ` - ${sanitizarNome(clienteNome)}`;
  if (numProcDigitos) base += ` - Proc ${numProcDigitos}`;
  return `${base || 'documento'}.${ext}`;
}

// GET /api/documentos/modelos-gerar?ancora=audiencia&ancora_id=123
// Lista os modelos ATIVOS destinados ÀQUELE registro (ex.: audiência → modelos do mesmo
// tipo de audiência + modalidade). As demais âncoras entram na Fase 3.
async function modelosParaGerar(req, res) {
  try {
    const { ancora, ancora_id } = req.query;
    let rows = [];

    if (ancora === 'audiencia' && ancora_id) {
      const [aud] = await pool.execute(
        'SELECT tipo_audiencia_id, modalidade FROM audiencia WHERE id = ?', [ancora_id]
      );
      if (aud.length) {
        // <=> é igualdade que considera NULL (audiência sem tipo casa com modelo sem tipo).
        [rows] = await pool.execute(
          `SELECT id, nome FROM modelo_documento
           WHERE ativo = 1 AND destino = 'audiencia'
             AND tipo_audiencia_id <=> ? AND modalidade <=> ?
           ORDER BY nome ASC`,
          [aud[0].tipo_audiencia_id, aud[0].modalidade]
        );
      }
    }
    if (ancora === 'pericia' && ancora_id) {
      const [per] = await pool.execute(
        'SELECT tipo_pericia_id FROM pericia WHERE id = ?', [ancora_id]
      );
      if (per.length) {
        [rows] = await pool.execute(
          `SELECT id, nome FROM modelo_documento
           WHERE ativo = 1 AND destino = 'pericia' AND tipo_pericia_id <=> ?
           ORDER BY nome ASC`,
          [per[0].tipo_pericia_id]
        );
      }
    }
    if (ancora === 'prazo' && ancora_id) {
      const [pz] = await pool.execute(
        'SELECT subtipo_id FROM prazos_processo WHERE id = ?', [ancora_id]
      );
      if (pz.length) {
        [rows] = await pool.execute(
          `SELECT id, nome FROM modelo_documento
           WHERE ativo = 1 AND destino = 'prazo' AND subtipo_prazo_id <=> ?
           ORDER BY nome ASC`,
          [pz[0].subtipo_id]
        );
      }
    }
    if (ancora === 'pagamento' && ancora_id) {
      // Recibo de repasse: o beneficiário define o destino do modelo a listar.
      const destino = req.query.beneficiario === 'parceiro' ? 'recibo_parceria' : 'recibo_cliente';
      [rows] = await pool.execute(
        `SELECT id, nome FROM modelo_documento WHERE ativo = 1 AND destino = ? ORDER BY nome ASC`,
        [destino]
      );
    }
    if (ancora === 'pessoa_fisica' || ancora === 'pessoa_juridica') {
      // Modelos "comum" cujos blocos exigidos cabem numa pessoa sozinha (só bloco cliente).
      const [todos] = await pool.execute(
        `SELECT id, nome, blocos_exigidos FROM modelo_documento
         WHERE ativo = 1 AND destino = 'comum' ORDER BY nome ASC`
      );
      rows = todos
        .filter(m => variaveisResolver.modeloCompativel(m.blocos_exigidos, 'pessoa'))
        .map(m => ({ id: m.id, nome: m.nome }));
    }
    if (ancora === 'multipessoas') {
      // Documento de partes: todos os modelos ativos desse destino (sem âncora de registro).
      [rows] = await pool.execute(
        `SELECT id, nome FROM modelo_documento WHERE ativo = 1 AND destino = 'multipessoas' ORDER BY nome ASC`
      );
    }

    return sucesso(res, rows);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/documentos/gerar — gera o documento preenchido a partir de uma âncora.
// Body: { modelo_id, ancora_tipo, ancora_id, formato }  (FASE 2a: só 'docx')
async function gerar(req, res) {
  try {
    const { modelo_id, ancora_tipo, ancora_id, formato } = req.body;
    if (!modelo_id) return erro(res, 'Modelo é obrigatório');
    if (!ancora_tipo || !ancora_id) return erro(res, 'Origem do documento (âncora) é obrigatória');

    const fmt = formato === 'pdf' ? 'pdf' : 'docx';

    // Busca o modelo (ativo) e seu arquivo no S3.
    const [rows] = await pool.execute(
      'SELECT id, nome, arquivo_s3_key, destino FROM modelo_documento WHERE id = ? AND ativo = 1', [modelo_id]
    );
    if (!rows.length) return naoEncontrado(res, 'Modelo não encontrado ou desativado');
    const modelo = rows[0];

    // Para recibos, o destino do modelo define se o valor é do cliente (líquido) ou do parceiro (repasse).
    const opcoes = { tipoRecibo: modelo.destino === 'recibo_parceria' ? 'parceiro' : 'cliente' };

    // Resolve as variáveis a partir do registro âncora.
    const ctx = await variaveisResolver.resolver(ancora_tipo, ancora_id, req.usuario, opcoes);
    if (!ctx) return erro(res, 'Não foi possível carregar os dados de origem do documento');

    // Baixa o .docx do S3 e preenche os marcadores.
    const original = await s3Service.baixarArquivo(modelo.arquivo_s3_key);
    let preenchido;
    try {
      preenchido = docxModeloService.preencher(original, ctx.dados);
    } catch (e) {
      return erro(res, 'Falha ao preencher o modelo (verifique os marcadores no .docx): ' + (e.message || ''));
    }

    // Saída: DOCX preenchido OU sua conversão para PDF (sem timbre — PDF simples).
    let saida = preenchido;
    let contentType = CONTENT_TYPE_DOCX;
    if (fmt === 'pdf') {
      try {
        saida = await pdfConvertService.docxParaPdf(preenchido);
        contentType = 'application/pdf';
      } catch (e) {
        return erro(res, 'Falha ao converter o documento para PDF: ' + (e.message || ''));
      }
    }

    const nomeArquivo = montarNomeArquivo(modelo.nome, ctx.clienteNome, ctx.numProcDigitos, fmt);

    // Registra o log (nomes legíveis gravados na escrita).
    await pool.execute(
      `INSERT INTO log_documentos_gerados
         (modelo_id, modelo_nome, formato, ancora_tipo, ancora_id, referencia, nome_arquivo, usuario_id, usuario_nome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [modelo.id, modelo.nome, fmt, ancora_tipo, ancora_id, ctx.referencia || null, nomeArquivo, req.usuario.id, req.usuario.nome]
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    return res.send(saida);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/documentos/gerar-multipessoas — gera um "Documento de partes" (vários autores × réus).
// Body: { modelo_id, autores:[{tipo_pessoa,pessoa_id}], reus:[...], formato }. Sem âncora de registro.
async function gerarMultipessoas(req, res) {
  try {
    const { modelo_id, formato } = req.body;
    if (!modelo_id) return erro(res, 'Modelo é obrigatório');

    // Sanitiza as listas: só { tipo: 'fisica'|'juridica', id: inteiro>0 }.
    const limpar = (lista) => (Array.isArray(lista) ? lista : [])
      .map(p => ({ tipo: p.tipo_pessoa, id: Number(p.pessoa_id) }))
      .filter(p => (p.tipo === 'fisica' || p.tipo === 'juridica') && Number.isInteger(p.id) && p.id > 0);
    const autores = limpar(req.body.autores);
    const reus = limpar(req.body.reus);

    if (!autores.length && !reus.length) {
      return erro(res, 'Selecione ao menos uma pessoa (autor ou réu)');
    }
    // A mesma pessoa (mesmo tipo + id) não pode aparecer duas vezes na seleção.
    const vistos = new Set();
    for (const p of [...autores, ...reus]) {
      const chave = `${p.tipo}:${p.id}`;
      if (vistos.has(chave)) return erro(res, 'A mesma pessoa foi selecionada mais de uma vez');
      vistos.add(chave);
    }

    const fmt = formato === 'pdf' ? 'pdf' : 'docx';

    // Busca o modelo (ativo) e confere que é mesmo um "Documento de partes".
    const [rows] = await pool.execute(
      'SELECT id, nome, arquivo_s3_key, destino FROM modelo_documento WHERE id = ? AND ativo = 1', [modelo_id]
    );
    if (!rows.length) return naoEncontrado(res, 'Modelo não encontrado ou desativado');
    const modelo = rows[0];
    if (modelo.destino !== 'multipessoas') {
      return erro(res, 'Este modelo não é um "Documento de partes"');
    }

    // Resolve as variáveis a partir das listas de pessoas escolhidas.
    const ctx = await variaveisResolver.resolverMultipessoas(autores, reus, req.usuario);
    if (!ctx) return erro(res, 'Não foi possível carregar os dados das pessoas');

    // Baixa o .docx do S3 e preenche (autores/réus repetem via {{#autores}}/{{#reus}}).
    const original = await s3Service.baixarArquivo(modelo.arquivo_s3_key);
    let preenchido;
    try {
      preenchido = docxModeloService.preencher(original, ctx.dados);
    } catch (e) {
      return erro(res, 'Falha ao preencher o modelo (verifique os marcadores no .docx): ' + (e.message || ''));
    }

    // Saída: DOCX preenchido OU conversão para PDF.
    let saida = preenchido;
    let contentType = CONTENT_TYPE_DOCX;
    if (fmt === 'pdf') {
      try {
        saida = await pdfConvertService.docxParaPdf(preenchido);
        contentType = 'application/pdf';
      } catch (e) {
        return erro(res, 'Falha ao converter o documento para PDF: ' + (e.message || ''));
      }
    }

    const nomeArquivo = montarNomeArquivo(modelo.nome, ctx.clienteNome, '', fmt);

    // Log: documento "multipessoas" não tem registro-âncora (ancora_id fica NULL).
    await pool.execute(
      `INSERT INTO log_documentos_gerados
         (modelo_id, modelo_nome, formato, ancora_tipo, ancora_id, referencia, nome_arquivo, usuario_id, usuario_nome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [modelo.id, modelo.nome, fmt, 'multipessoas', null, ctx.referencia || null, nomeArquivo, req.usuario.id, req.usuario.nome]
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    return res.send(saida);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// Garante nome de arquivo único dentro do ZIP (dois documentos do mesmo modelo/cliente/processo
// gerariam o mesmo nome). Se repetir, acrescenta " (2)", " (3)"... antes da extensão.
function nomeUnico(nome, usados) {
  if (!usados.has(nome)) { usados.add(nome); return nome; }
  const ponto = nome.lastIndexOf('.');
  const base = ponto > 0 ? nome.slice(0, ponto) : nome;
  const ext  = ponto > 0 ? nome.slice(ponto) : '';
  let i = 2, cand;
  do { cand = `${base} (${i})${ext}`; i++; } while (usados.has(cand));
  usados.add(cand);
  return cand;
}

// 'YYYY-MM-DD' (hoje em Brasília) -> 'DD-MM-YYYY' (para o nome do ZIP).
function dataArquivoBR() {
  const [a, m, d] = hojeBrasilia().split('-');
  return (a && m && d) ? `${d}-${m}-${a}` : 'lote';
}

// POST /api/documentos/lote/preparar
// Body: { ancora_tipo: 'audiencia'|'pericia', ancora_ids: [..] }
// Agrupa os registros selecionados por TIPO (audiência: tipo+modalidade; perícia: tipo) e,
// para cada grupo, lista os modelos disponíveis. Grupos sem modelo voltam com modelos:[] —
// a tela usa isso para avisar quais serão pulados ("pular e avisar").
async function prepararLote(req, res) {
  try {
    const { ancora_tipo } = req.body;
    if (!['audiencia', 'pericia'].includes(ancora_tipo)) return erro(res, 'Tipo de origem inválido para lote');

    // Sanitiza os IDs recebidos (apenas inteiros positivos).
    const ids = (Array.isArray(req.body.ancora_ids) ? req.body.ancora_ids : [])
      .map(Number).filter(n => Number.isInteger(n) && n > 0);
    if (!ids.length) return erro(res, 'Selecione ao menos um registro');
    const ph = ids.map(() => '?').join(',');

    const grupos = new Map();

    if (ancora_tipo === 'audiencia') {
      // Tipo + modalidade de cada audiência selecionada.
      const [regs] = await pool.execute(
        `SELECT a.id, a.tipo_audiencia_id, a.modalidade, ta.nome AS tipo_nome
         FROM audiencia a LEFT JOIN tipo_audiencia ta ON a.tipo_audiencia_id = ta.id
         WHERE a.id IN (${ph})`, ids
      );
      // Todos os modelos de audiência ativos (filtramos por grupo na memória — sem N queries).
      const [mods] = await pool.execute(
        `SELECT id, nome, tipo_audiencia_id, modalidade FROM modelo_documento
         WHERE ativo = 1 AND destino = 'audiencia' ORDER BY nome ASC`
      );
      for (const r of regs) {
        const chave = `${r.tipo_audiencia_id || ''}|${r.modalidade || ''}`;
        if (!grupos.has(chave)) {
          const modal = r.modalidade === 'virtual' ? 'Virtual'
                      : r.modalidade === 'presencial' ? 'Presencial' : 'Sem modalidade';
          grupos.set(chave, {
            chave,
            rotulo: `${r.tipo_nome || 'Sem tipo'} — ${modal}`,
            ancora_ids: [],
            modelos: mods
              .filter(m => (m.tipo_audiencia_id || null) === (r.tipo_audiencia_id || null)
                        && (m.modalidade || null) === (r.modalidade || null))
              .map(m => ({ id: m.id, nome: m.nome })),
          });
        }
        grupos.get(chave).ancora_ids.push(r.id);
      }
    } else {
      // Perícia: agrupa por tipo de perícia.
      const [regs] = await pool.execute(
        `SELECT pe.id, pe.tipo_pericia_id, tp.nome AS tipo_nome
         FROM pericia pe LEFT JOIN tipo_pericia tp ON pe.tipo_pericia_id = tp.id
         WHERE pe.id IN (${ph})`, ids
      );
      const [mods] = await pool.execute(
        `SELECT id, nome, tipo_pericia_id FROM modelo_documento
         WHERE ativo = 1 AND destino = 'pericia' ORDER BY nome ASC`
      );
      for (const r of regs) {
        const chave = `${r.tipo_pericia_id || ''}`;
        if (!grupos.has(chave)) {
          grupos.set(chave, {
            chave,
            rotulo: r.tipo_nome || 'Sem tipo',
            ancora_ids: [],
            modelos: mods
              .filter(m => (m.tipo_pericia_id || null) === (r.tipo_pericia_id || null))
              .map(m => ({ id: m.id, nome: m.nome })),
          });
        }
        grupos.get(chave).ancora_ids.push(r.id);
      }
    }

    return sucesso(res, { grupos: [...grupos.values()] });
  } catch (err) {
    return erroInterno(res, err);
  }
}

// POST /api/documentos/lote/gerar
// Body: { ancora_tipo, formato, itens: [{ ancora_id, modelo_id }] }
// Gera um documento por item (reaproveitando o mesmo motor da geração individual),
// empacota tudo num ZIP e baixa no Downloads. Itens que falharem são pulados (e contados).
// Resumo vai nos headers X-Doc-Gerados / X-Doc-Falhas (a tela soma com os "sem modelo").
async function gerarLote(req, res) {
  try {
    const { ancora_tipo, formato } = req.body;
    if (!['audiencia', 'pericia'].includes(ancora_tipo)) return erro(res, 'Tipo de origem inválido para lote');
    const itens = Array.isArray(req.body.itens) ? req.body.itens : [];
    if (!itens.length) return erro(res, 'Nenhum item para gerar');
    const fmt = formato === 'pdf' ? 'pdf' : 'docx';

    // Cache do modelo (metadados + .docx do S3) por modelo_id — evita rebaixar o mesmo arquivo.
    const modelosCache = new Map();
    async function carregarModelo(modeloId) {
      if (modelosCache.has(modeloId)) return modelosCache.get(modeloId);
      const [r] = await pool.execute(
        'SELECT id, nome, arquivo_s3_key FROM modelo_documento WHERE id = ? AND ativo = 1', [modeloId]
      );
      if (!r.length) { modelosCache.set(modeloId, null); return null; }
      const buffer = await s3Service.baixarArquivo(r[0].arquivo_s3_key);
      const obj = { id: r[0].id, nome: r[0].nome, buffer };
      modelosCache.set(modeloId, obj);
      return obj;
    }

    const arquivos = [];     // { nome, buffer } — entram no ZIP
    const logs = [];         // params do INSERT em log_documentos_gerados
    const usados = new Set(); // nomes já usados no ZIP (dedup)
    let falhas = 0;

    for (const it of itens) {
      const ancoraId = Number(it.ancora_id);
      const modeloId = Number(it.modelo_id);
      if (!ancoraId || !modeloId) { falhas++; continue; }
      try {
        const modelo = await carregarModelo(modeloId);
        if (!modelo) { falhas++; continue; }

        // Resolve as variáveis a partir do registro âncora (mesmo resolvedor da geração individual).
        const ctx = await variaveisResolver.resolver(ancora_tipo, ancoraId, req.usuario);
        if (!ctx) { falhas++; continue; }

        // Preenche o .docx e, se for PDF, converte (LibreOffice — fila serializada interna).
        const preenchido = docxModeloService.preencher(modelo.buffer, ctx.dados);
        const saida = fmt === 'pdf' ? await pdfConvertService.docxParaPdf(preenchido) : preenchido;

        const nome = nomeUnico(montarNomeArquivo(modelo.nome, ctx.clienteNome, ctx.numProcDigitos, fmt), usados);
        arquivos.push({ nome, buffer: saida });
        logs.push([modelo.id, modelo.nome, fmt, ancora_tipo, ancoraId, ctx.referencia || null, nome, req.usuario.id, req.usuario.nome]);
      } catch (e) {
        falhas++; // um item que falha não derruba o lote inteiro
      }
    }

    if (!arquivos.length) {
      return erro(res, 'Nenhum documento pôde ser gerado. Confira os modelos e tente novamente.');
    }

    // Monta o ZIP em memória.
    const zip = new PizZip();
    for (const a of arquivos) zip.file(a.nome, a.buffer);
    const zipBuf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });

    // Grava os logs em transação (tudo ou nada) — vários INSERTs.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const l of logs) {
        await conn.execute(
          `INSERT INTO log_documentos_gerados
             (modelo_id, modelo_nome, formato, ancora_tipo, ancora_id, referencia, nome_arquivo, usuario_id, usuario_nome)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, l
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      return erroInterno(res, e);
    } finally {
      conn.release();
    }

    const nomeZip = `Documentos em lote - ${dataArquivoBR()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeZip}"`);
    res.setHeader('X-Doc-Gerados', String(arquivos.length));
    res.setHeader('X-Doc-Falhas', String(falhas));
    return res.send(zipBuf);
  } catch (err) {
    return erroInterno(res, err);
  }
}

// GET /api/documentos/historico?de=YYYY-MM-DD&ate=YYYY-MM-DD&pagina=1&limite=50
// Lista o histórico de documentos gerados (paginado; nomes legíveis já gravados).
// O índice em log_documentos_gerados.gerado_em mantém o filtro/ordenação rápidos mesmo com milhões de linhas.
async function historicoDocumentos(req, res) {
  try {
    const { de, ate } = req.query;
    const limitInt  = parseInt(req.query.limite) || 50;                 // 50 por página
    const offsetInt = ((parseInt(req.query.pagina) || 1) - 1) * limitInt;
    const cond = [];
    const params = [];
    if (de)  { cond.push('gerado_em >= ?'); params.push(`${de} 00:00:00`); }
    if (ate) { cond.push('gerado_em <= ?'); params.push(`${ate} 23:59:59`); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    // Página de registros (LIMIT/OFFSET inteiros sanitizados — mysql2 execute não aceita placeholder em LIMIT)
    const [rows] = await pool.execute(
      `SELECT id, modelo_nome, formato, ancora_tipo, referencia, nome_arquivo, usuario_nome, gerado_em
       FROM log_documentos_gerados ${where}
       ORDER BY gerado_em DESC
       LIMIT ${limitInt} OFFSET ${offsetInt}`,
      params
    );
    // Total para calcular o número de páginas
    const [totalRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM log_documentos_gerados ${where}`,
      params
    );
    return sucesso(res, { registros: rows, total: totalRows[0].total });
  } catch (err) {
    return erroInterno(res, err);
  }
}

module.exports = {
  uploadModelo,        // middleware de upload (usado nas rotas POST/PUT)
  catalogoVariaveis,
  catalogoVariaveisPartes,
  destinosOpcoes,
  listarModelos,
  buscarModelo,
  baixarModelo,
  criarModelo,
  atualizarModelo,
  desativarModelo,
  reativarModelo,
  excluirModelo,
  modelosParaGerar,
  gerar,
  gerarMultipessoas,
  prepararLote,
  gerarLote,
  historicoDocumentos,
};
