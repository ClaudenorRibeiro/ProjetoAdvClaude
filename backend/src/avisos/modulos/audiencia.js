// Avisos aos clientes — módulo Audiência.
const { criarModuloDeEvento } = require('./fabrica');
const { textoAudiencia } = require('../textos');

module.exports = criarModuloDeEvento({
  modulo: 'audiencia',
  tabela: 'audiencia',
  statusValidos: ['agendada', 'adiada'],
  texto: textoAudiencia,
  ignorar: (audiencia) => audiencia.modalidade === 'sem_comparecimento',   // ato sem comparecimento: o cliente não precisa ir a lugar nenhum
  sqlItens: `
    SELECT x.id, x.processo_id, x.data, x.hora, x.modalidade, x.local, x.plataforma_virtual, x.link_virtual,
           x.status, x.criado_em, ta.nome AS tipo_nome, pr.numProc AS processo_numero
      FROM audiencia x
      LEFT JOIN tipo_audiencia ta ON ta.id = x.tipo_audiencia_id
      LEFT JOIN tblproc pr ON pr.id = x.processo_id`,
});
