// Avisos aos clientes — configuração do escritório: "mostrar antes de enviar" e dias de antecedência de cada módulo.
const { pool } = require('../config/database');

// Inteiro >= 0 (0 = "no mesmo dia"); qualquer outra coisa usa o padrão.
function diasValidos(valor, padrao) {
  const n = Number(valor);
  return valor !== null && valor !== undefined && valor !== '' && Number.isInteger(n) && n >= 0 ? n : padrao;
}

// { escritorio, mensagemAniversario, pericia: { mostrar, dias }, audiencia: { mostrar, dias }, parabens: { mostrar, dias } }
// "mostrar" = true: o aviso espera na tela de conferência; false: sai sozinho (e-mail e SMS).
async function lerConfig(exec = pool) {
  const [rows] = await exec.execute(
    `SELECT nome, mensagem_aniversario, avisos_pericia_mostrar, avisos_audiencia_mostrar, avisos_parabens_mostrar,
            dias_alerta_pericia, dias_alerta_audiencia, dias_aviso_parabens
       FROM configuracoes_escritorio LIMIT 1`
  );
  const c = rows[0] || {};
  const mostrar = (v) => Number(v === null || v === undefined ? 1 : v) === 1;
  return {
    escritorio: c.nome || '',
    mensagemAniversario: c.mensagem_aniversario || '',
    pericia:   { mostrar: mostrar(c.avisos_pericia_mostrar),   dias: diasValidos(c.dias_alerta_pericia, 2) },
    audiencia: { mostrar: mostrar(c.avisos_audiencia_mostrar), dias: diasValidos(c.dias_alerta_audiencia, 3) },
    parabens:  { mostrar: mostrar(c.avisos_parabens_mostrar),  dias: diasValidos(c.dias_aviso_parabens, 0) },
  };
}

module.exports = { lerConfig, diasValidos };
