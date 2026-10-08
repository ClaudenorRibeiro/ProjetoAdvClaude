// ============================================================
// LEITURA SEGURA DOS DADOS DE PESSOA (física e jurídica) VINDOS DA TELA
// Devolve { dados } com tudo já limpo (sem espaços nas pontas, vazio = null) ou { erro } com a mensagem para o usuário.
// Cada limite é o tamanho REAL da coluna em estrutura_banco.sql: acima disso o banco recusaria e o usuário veria "Erro interno".
// Usa o mesmo leitor dos outros módulos (camposTexto.js). Nome/razão social obrigatórios; o resto é opcional.
// ============================================================

const { texto, dataIso, inteiroPositivo } = require('./camposTexto');

const LIMITE_NOME = 200;
// Observações: limite escolhido pelo usuário (05/10/2026): 5.000 caracteres (a coluna é "text", 65.535 bytes: cabe com folga).
const LIMITE_OBSERVACOES = 5000;

// Endereço e observações (iguais na física e na jurídica)
const CAMPOS_ENDERECO = {
  cep:         { rotulo: 'O CEP', max: 9, aceitaNumero: true },
  logradouro:  { rotulo: 'O logradouro', max: 200 },
  numero:      { rotulo: 'O número do endereço', max: 10, aceitaNumero: true },
  complemento: { rotulo: 'O complemento', max: 100, aceitaNumero: true },
  bairro:      { rotulo: 'O bairro', max: 100 },
  cidade:      { rotulo: 'A cidade', max: 100, feminino: true },
  estado:      { rotulo: 'A UF', max: 2, feminino: true },
  observacoes: { rotulo: 'O campo Observações', max: LIMITE_OBSERVACOES },
};

const CAMPOS_FISICA = {
  rg:          { rotulo: 'O RG', max: 20, aceitaNumero: true },
  rg_orgao:    { rotulo: 'O órgão do RG', max: 20 },
  pis:         { rotulo: 'O PIS', max: 20, aceitaNumero: true },
  ctps_numero: { rotulo: 'O número da CTPS', max: 30, aceitaNumero: true },
  ctps_serie:  { rotulo: 'A série da CTPS', max: 20, aceitaNumero: true, feminino: true },
  nome_pai:    { rotulo: 'O nome do pai', max: 200 },
  nome_mae:    { rotulo: 'O nome da mãe', max: 200 },
};

const CAMPOS_JURIDICA = {
  nome_fantasia:      { rotulo: 'O nome fantasia', max: 200 },
  inscricao_estadual: { rotulo: 'A inscrição estadual', max: 30, aceitaNumero: true, feminino: true },
};

// Ids das listas de escolha da ficha (profissão, estado civil...). Vazio ou 0 = não informado.
const IDS_FISICA = {
  estado_civil_id:  'O campo estado civil',
  profissao_id:     'O campo profissão',
  genero_id:        'O campo gênero',
  nacionalidade_id: 'O campo nacionalidade',
  responsavel_id:   'O responsável legal',
  parentesco_id:    'O campo parentesco',
};

// CPF/CNPJ: só texto (número perderia o zero da frente); guarda só os dígitos; no máximo `maxDigitos`.
function lerDocumento(bruto, rotulo, maxDigitos) {
  if (bruto === undefined || bruto === null || bruto === '') return { valor: null };
  if (typeof bruto !== 'string') return { erro: `${rotulo} inválido` };
  const digitos = bruto.replace(/\D/g, '');
  if (digitos.length > maxDigitos) return { erro: `${rotulo} deve ter no máximo ${maxDigitos} números` };
  return { valor: digitos || null };
}

// Data de nascimento: AAAA-MM-DD de um dia que existe. A tela pode mandar com horário (1972-03-27T03:00:00.000Z): vale só o dia.
function lerDataNascimento(bruto) {
  if (bruto === undefined || bruto === null || bruto === '') return { valor: null };
  const rotulo = 'A data de nascimento';
  if (typeof bruto !== 'string') return { erro: `${rotulo} inválida` };
  const m = /^(\d{4}-\d{2}-\d{2})(?:T[0-9:.+Z-]*)?$/.exec(bruto.trim());
  if (!m) return { erro: `${rotulo} inválida (use o formato AAAA-MM-DD)` };
  return dataIso(m[1], { rotulo });
}

function lerId(bruto, rotulo) {
  if (bruto === 0 || bruto === '0') return { valor: null };
  return inteiroPositivo(bruto, { rotulo });
}

// Lê um grupo de campos de texto para dentro de `dados`; devolve a mensagem do primeiro erro ou null.
function lerGrupo(corpo, campos, dados) {
  for (const [chave, opcoes] of Object.entries(campos)) {
    const r = texto(corpo[chave], opcoes);
    if (r.erro) return r.erro;
    dados[chave] = r.valor;
  }
  return null;
}

// Marcador de canal (WhatsApp / SMS) vindo da tela: verdadeiro, 1 ou "1" = marcado.
const marcado = (v) => v === true || v === 1 || v === '1';

// Telefones: lista de { numero, tipo, principal, whatsapp, sms }. Linha sem número é ignorada (como sempre foi).
// WhatsApp e SMS: no máximo UM número de cada por pessoa (o mesmo número pode ser os dois). O mesmo número repetido junta os marcadores.
function lerTelefones(bruto) {
  if (bruto === undefined || bruto === null) return { valor: [] };
  if (!Array.isArray(bruto)) return { erro: 'A lista de telefones é inválida' };
  const saida = [];
  for (const t of bruto) {
    if (t === null || typeof t !== 'object' || Array.isArray(t)) return { erro: 'A lista de telefones é inválida' };
    const numero = texto(t.numero, { rotulo: 'O telefone', max: 20, aceitaNumero: true });
    if (numero.erro) return numero;
    if (!numero.valor) continue;
    const tipo = texto(t.tipo, { rotulo: 'O tipo do telefone', max: 100 });
    if (tipo.erro) return tipo;
    const digitos = numero.valor.replace(/\D/g, '');
    const repetido = digitos && saida.find(x => x.numero.replace(/\D/g, '') === digitos);
    if (repetido) { repetido.whatsapp = repetido.whatsapp || marcado(t.whatsapp); repetido.sms = repetido.sms || marcado(t.sms); continue; }
    saida.push({ numero: numero.valor, tipo: tipo.valor, principal: t.principal, whatsapp: marcado(t.whatsapp), sms: marcado(t.sms) });
  }
  if (saida.filter(x => x.whatsapp).length > 1) return { erro: 'Só um telefone pode ser marcado como WhatsApp' };
  if (saida.filter(x => x.sms).length > 1) return { erro: 'Só um telefone pode ser marcado como SMS' };
  return { valor: saida };
}

// E-mails: lista de { email, principal }. E-mail guardado em minúsculas; linha sem e-mail é ignorada.
function lerEmails(bruto) {
  if (bruto === undefined || bruto === null) return { valor: [] };
  if (!Array.isArray(bruto)) return { erro: 'A lista de e-mails é inválida' };
  const saida = [];
  for (const e of bruto) {
    if (e === null || typeof e !== 'object' || Array.isArray(e)) return { erro: 'A lista de e-mails é inválida' };
    const email = texto(e.email, { rotulo: 'O e-mail', max: 150 });
    if (email.erro) return email;
    if (!email.valor) continue;
    saida.push({ email: email.valor.toLowerCase(), principal: e.principal });
  }
  return { valor: saida };
}

// Contas bancárias: aqui só confere que veio uma lista (os campos de cada conta são conferidos ao gravar).
function lerListaContas(bruto) {
  if (bruto === undefined || bruto === null) return { valor: [] };
  if (!Array.isArray(bruto)) return { erro: 'A lista de contas bancárias é inválida' };
  return { valor: bruto };
}

// Contatos e contas (iguais na física e na jurídica)
function lerContatos(corpo, dados) {
  const tel = lerTelefones(corpo.telefones); if (tel.erro) return tel.erro; dados.telefones = tel.valor;
  const em = lerEmails(corpo.emails); if (em.erro) return em.erro; dados.emails = em.valor;
  const co = lerListaContas(corpo.contasBancarias); if (co.erro) return co.erro; dados.contasBancarias = co.valor;
  return null;
}

function lerDadosFisica(corpo) {
  const b = corpo || {};
  const dados = {};
  const nome = texto(b.nome, { rotulo: 'O nome', max: LIMITE_NOME, obrigatorio: true });
  if (nome.erro) return { erro: nome.erro };
  dados.nome = nome.valor;
  const cpf = lerDocumento(b.cpf, 'O CPF', 11);
  if (cpf.erro) return { erro: cpf.erro };
  dados.cpf = cpf.valor;
  const nasc = lerDataNascimento(b.data_nascimento);
  if (nasc.erro) return { erro: nasc.erro };
  dados.data_nascimento = nasc.valor;
  for (const [chave, rotulo] of Object.entries(IDS_FISICA)) {
    const r = lerId(b[chave], rotulo);
    if (r.erro) return { erro: r.erro };
    dados[chave] = r.valor;
  }
  const erro = lerGrupo(b, CAMPOS_FISICA, dados) || lerGrupo(b, CAMPOS_ENDERECO, dados) || lerContatos(b, dados);
  return erro ? { erro } : { dados };
}

// `atualizando`: na edição da empresa a inscrição estadual não é gravada (não há campo na tela), então não é conferida.
function lerDadosJuridica(corpo, { atualizando = false } = {}) {
  const b = corpo || {};
  const dados = {};
  const razao = texto(b.razao_social, { rotulo: 'A razão social', max: LIMITE_NOME, obrigatorio: true, feminino: true });
  if (razao.erro) return { erro: razao.erro };
  dados.razao_social = razao.valor;
  const cnpj = lerDocumento(b.cnpj, 'O CNPJ', 14);
  if (cnpj.erro) return { erro: cnpj.erro };
  dados.cnpj = cnpj.valor;
  const campos = atualizando ? { nome_fantasia: CAMPOS_JURIDICA.nome_fantasia } : CAMPOS_JURIDICA;
  const erro = lerGrupo(b, campos, dados) || lerGrupo(b, CAMPOS_ENDERECO, dados) || lerContatos(b, dados);
  return erro ? { erro } : { dados };
}

module.exports = { lerDadosFisica, lerDadosJuridica, lerDocumento, lerDataNascimento, LIMITE_NOME, LIMITE_OBSERVACOES };
