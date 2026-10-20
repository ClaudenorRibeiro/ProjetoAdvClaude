// O status "Acordo" é do SISTEMA: a etiqueta automática "Acordo" depende dele (reconhecido pelo NOME, sem diferenciar
// maiúscula/acento/espaços nas pontas — igual ao `statusEhAcordo` da tela). Por isso ninguém renomeia nem exclui esse status,
// e ele nunca "encerra o processo".
const MENSAGEM_STATUS_ACORDO = 'O status "Acordo" é do sistema e não pode ser renomeado nem excluído';

function ehStatusAcordo(nome) {
  return String(nome || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'acordo';
}

module.exports = { ehStatusAcordo, MENSAGEM_STATUS_ACORDO };
