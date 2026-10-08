// Avisos aos clientes — nomes fixos usados em todo o módulo.
const MODULOS = ['pericia', 'audiencia', 'parabens'];

// Tipos de aviso de cada módulo: os três primeiros nascem quando o fato acontece (cadastro, remarcação, cancelamento);
// "lembrete" sai alguns dias antes; "aniversario" é o parabéns.
const TIPOS = {
  pericia:   ['agendada', 'remarcada', 'cancelada', 'lembrete'],
  audiencia: ['agendada', 'remarcada', 'cancelada', 'lembrete'],
  parabens:  ['aniversario'],
};

const NOME_MODULO = { pericia: 'Perícia', audiencia: 'Audiência', parabens: 'Parabéns de aniversário' };

// Coluna de avisos_cliente que aponta para o registro de origem (com exclusão em cascata no banco).
const COLUNA_REF = { pericia: 'pericia_id', audiencia: 'audiencia_id', parabens: 'pessoa_fisica_id' };

const CANAIS = ['email', 'sms', 'whatsapp'];

module.exports = { MODULOS, TIPOS, NOME_MODULO, COLUNA_REF, CANAIS };
