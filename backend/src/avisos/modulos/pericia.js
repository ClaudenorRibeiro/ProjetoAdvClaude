// Avisos aos clientes — módulo Perícia.
const { criarModuloDeEvento } = require('./fabrica');
const { textoPericia } = require('../textos');

module.exports = criarModuloDeEvento({
  modulo: 'pericia',
  tabela: 'pericia',
  statusValidos: ['agendada'],
  texto: textoPericia,
  sqlItens: `
    SELECT x.id, x.processo_id, x.data, x.hora, x.local, x.logradouro, x.numero, x.complemento, x.bairro, x.cidade, x.estado,
           x.status, x.criado_em, tp.nome AS tipo_nome, pr.numProc AS processo_numero,
           CASE WHEN x.perito_tipo = 'fisica' THEN pf.nome WHEN x.perito_tipo = 'juridica' THEN pj.razao_social END AS perito_nome
      FROM pericia x
      LEFT JOIN tipo_pericia tp ON tp.id = x.tipo_pericia_id
      LEFT JOIN pessoas_fisicas pf ON x.perito_tipo = 'fisica' AND pf.id = x.perito_id
      LEFT JOIN pessoas_juridicas pj ON x.perito_tipo = 'juridica' AND pj.id = x.perito_id
      LEFT JOIN tblproc pr ON pr.id = x.processo_id`,
});
