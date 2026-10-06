// ============================================================
// BUSCA POR FRASE — peça ÚNICA para os campos de "Pesquisar" das telas (Audiências, Perícias, Prazos).
// A frase digitada vale INTEIRA, como um bloco só ("José e maria" acha o que contém exatamente "José e maria"),
// sem diferenciar maiúscula e acento (as tabelas usam utf8mb4_0900_ai_ci), e "%" e "_" são procurados como texto.
// Cada tela só diz em quais colunas procurar; o nome da coluna vem SEMPRE do código, nunca do pedido.
// ============================================================
const { escaparLike, pastaFormatadaSql } = require('./helpers');
const { texto } = require('./camposTexto');

const MAXIMO_BUSCA = 200;

// Lê o termo que veio na URL: precisa ser TEXTO (?busca[]=a vira lista), sem espaços nas pontas e até 200 caracteres.
// Vazio = sem busca ({ valor: null }). Erro = { erro } com a mensagem para o usuário.
function lerBuscaFrase(bruto) {
  return texto(bruto, { rotulo: 'A busca', max: MAXIMO_BUSCA, feminino: true });
}

// Partes (autores e réus, físicas e jurídicas) do processo de apelido `proc`: procura no nome e, nas empresas,
// também no nome fantasia. 6 condições = 6 parâmetros `?`.
function sqlPartesDoProcesso(proc) {
  const parte = (tabelaVinculo, apelido) => `
    EXISTS (SELECT 1 FROM ${tabelaVinculo} ${apelido}
              JOIN pessoas_fisicas pf ON pf.id = ${apelido}.pessoa_id AND ${apelido}.tipo_pessoa = 'fisica'
             WHERE ${apelido}.proc_id = ${proc}.id AND pf.nome LIKE ?)
    OR EXISTS (SELECT 1 FROM ${tabelaVinculo} ${apelido}
              JOIN pessoas_juridicas pj ON pj.id = ${apelido}.pessoa_id AND ${apelido}.tipo_pessoa = 'juridica'
             WHERE ${apelido}.proc_id = ${proc}.id AND (pj.razao_social LIKE ? OR pj.nome_fantasia LIKE ?))`;
  return `(${parte('tbltituloprocautor', 'bta')} OR ${parte('tbltituloprocreu', 'btr')})`;
}

// Monta a condição `AND (...)` e seus parâmetros.
//   frase     — texto já lido por lerBuscaFrase (não vazio)
//   colunas   — expressões SQL do código ('pr.NomeTituloProc', 'ta.nome', ...) comparadas com LIKE
//   pasta     — apelido da tabela tblpasta (procura no número da pasta, com ou sem zeros à esquerda: "42" e "0042")
//   partesDe  — apelido da tabela tblproc cujas partes (autores e réus) entram na busca
//   numeroProcessoSemMascara — apelido da tblproc: se a frase for um número (só dígitos e . - / espaço, 3 ou mais dígitos),
//                também acha o número do processo gravado COM máscara (comportamento que a tela de Prazos já tinha)
function condBuscaFrase(frase, { colunas = [], pasta = null, partesDe = null, numeroProcessoSemMascara = null } = {}) {
  const padrao = `%${escaparLike(frase)}%`;
  const partes = [];
  const params = [];
  for (const coluna of colunas) { partes.push(`${coluna} LIKE ?`); params.push(padrao); }
  if (pasta) { partes.push(`${pastaFormatadaSql(pasta)} LIKE ?`); params.push(padrao); }
  if (partesDe) {
    partes.push(sqlPartesDoProcesso(partesDe));
    params.push(padrao, padrao, padrao, padrao, padrao, padrao);
  }
  if (numeroProcessoSemMascara) {
    const digitos = frase.replace(/\D/g, '');
    if (/^[\d\s.\-/]+$/.test(frase) && digitos.length >= 3) {
      partes.push(`REPLACE(REPLACE(REPLACE(${numeroProcessoSemMascara}.numProc, '.', ''), '-', ''), ' ', '') LIKE ?`);
      params.push(`%${digitos}%`);
    }
  }
  return { cond: ` AND (${partes.join(' OR ')})`, params };
}

module.exports = { lerBuscaFrase, condBuscaFrase, MAXIMO_BUSCA };
