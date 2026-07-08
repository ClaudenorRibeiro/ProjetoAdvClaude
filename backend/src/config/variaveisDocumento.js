// ============================================================
// CATÁLOGO CENTRAL DE VARIÁVEIS DOS MODELOS DE DOCUMENTO
// ------------------------------------------------------------
// Fonte única da verdade das variáveis {{tag}} que um modelo .docx
// pode usar. Cada variável pertence a um BLOCO. O bloco define de qual
// "âncora" (tela de origem) a variável pode ser preenchida:
//   cliente   -> dados da pessoa/cliente
//   processo  -> dados do processo/pasta
//   pagamento -> dados da parcela/acordo (recibos)
//   audiencia -> dados da audiência
//   pericia   -> dados da perícia
//   escritorio-> dados do escritório (SEMPRE disponível; não restringe a âncora)
//
// Usado em:
//   - validação ao subir um modelo (avisa variáveis desconhecidas);
//   - derivação dos "blocos exigidos" do modelo (quais âncoras servem);
//   - catálogo exibido na tela de modelos (botão "copiar");
//   - preenchimento na geração (Fase 2).
// ============================================================

const CATALOGO = {
  cliente: {
    label: 'Cliente / Pessoa',
    variaveis: [
      { tag: 'nome_cliente',         descricao: 'Nome (pessoa física) ou razão social (pessoa jurídica)' },
      { tag: 'nome_fantasia',        descricao: 'Nome fantasia (pessoa jurídica)' },
      { tag: 'documento_cliente',    descricao: 'CPF (PF) ou CNPJ (PJ), conforme o tipo' },
      { tag: 'cpf_cliente',          descricao: 'CPF (pessoa física)' },
      { tag: 'cnpj_cliente',         descricao: 'CNPJ (pessoa jurídica)' },
      { tag: 'rg_cliente',           descricao: 'RG (pessoa física)' },
      { tag: 'rg_orgao',             descricao: 'Órgão emissor do RG' },
      { tag: 'pis_cliente',          descricao: 'PIS (pessoa física)' },
      { tag: 'ctps_cliente',         descricao: 'CTPS (número e série)' },
      { tag: 'nome_pai',             descricao: 'Nome do pai' },
      { tag: 'nome_mae',             descricao: 'Nome da mãe' },
      { tag: 'data_nascimento',      descricao: 'Data de nascimento' },
      { tag: 'estado_civil',         descricao: 'Estado civil' },
      { tag: 'profissao',            descricao: 'Profissão' },
      { tag: 'genero',               descricao: 'Gênero' },
      { tag: 'nacionalidade_cliente',descricao: 'Nacionalidade' },
      { tag: 'inscricao_estadual',   descricao: 'Inscrição estadual (pessoa jurídica)' },
      { tag: 'endereco_cliente',     descricao: 'Endereço completo montado' },
      { tag: 'cep',                  descricao: 'CEP' },
      { tag: 'logradouro',           descricao: 'Logradouro' },
      { tag: 'numero',               descricao: 'Número' },
      { tag: 'complemento',          descricao: 'Complemento' },
      { tag: 'bairro',               descricao: 'Bairro' },
      { tag: 'cidade',               descricao: 'Cidade' },
      { tag: 'estado',               descricao: 'Estado (UF)' },
    ],
  },
  processo: {
    label: 'Processo',
    variaveis: [
      { tag: 'numero_processo',   descricao: 'Número do processo (CNJ)' },
      { tag: 'titulo_processo',   descricao: 'Título do processo (Autor X Réu)' },
      { tag: 'numero_pasta',      descricao: 'Número da pasta (0000)' },
      { tag: 'area_direito',      descricao: 'Área do direito da pasta' },
      { tag: 'vara',              descricao: 'Vara' },
      { tag: 'forum',             descricao: 'Fórum' },
      { tag: 'tipo_processo',     descricao: 'Tipo do processo' },
      { tag: 'status_processo',   descricao: 'Status/fase do processo' },
      { tag: 'instancia',         descricao: 'Instância' },
      { tag: 'data_distribuicao', descricao: 'Data de distribuição' },
      { tag: 'parte_adversa',          descricao: 'Nome da parte contrária (polo oposto ao cliente)' },
      { tag: 'parte_adversa_documento',descricao: 'CPF/CNPJ da parte contrária' },
    ],
  },
  pagamento: {
    label: 'Pagamento (recibos)',
    variaveis: [
      { tag: 'valor_pago',          descricao: 'Valor do recibo (líquido p/ cliente ou parceria p/ parceiro)' },
      { tag: 'valor_pago_extenso',  descricao: 'Valor do recibo por extenso' },
      { tag: 'valor_bruto',         descricao: 'Valor bruto da parcela' },
      { tag: 'valor_honorario',     descricao: 'Valor do honorário' },
      { tag: 'valor_liquido',       descricao: 'Valor líquido (bruto − honorário)' },
      { tag: 'valor_parceria',      descricao: 'Valor do repasse de parceria' },
      { tag: 'forma_pagamento',     descricao: 'Forma do repasse (apelido de forma_repasse — ótica do recibo)' },
      { tag: 'forma_repasse',       descricao: 'Forma com que o escritório pagou o cliente/parceiro' },
      { tag: 'forma_recebimento',   descricao: 'Forma com que o réu pagou o escritório' },
      { tag: 'identificacao_pagamento',  descricao: 'Identificação do recebimento do réu (extrato)' },
      { tag: 'identificacao_recebimento', descricao: 'Identificação do recebimento do réu (extrato)' },
      { tag: 'data_pagamento',      descricao: 'Data do pagamento' },
      { tag: 'numero_parcela',      descricao: 'Número da parcela' },
      { tag: 'total_parcelas',      descricao: 'Total de parcelas do acordo' },
      { tag: 'vencimento',          descricao: 'Vencimento da parcela' },
      { tag: 'descricao_acordo',    descricao: 'Descrição do acordo' },
      { tag: 'valor_total_acordo',  descricao: 'Valor total do acordo' },
    ],
  },
  audiencia: {
    label: 'Audiência',
    variaveis: [
      { tag: 'data_audiencia',        descricao: 'Data da audiência' },
      { tag: 'hora_audiencia',        descricao: 'Hora da audiência' },
      { tag: 'tipo_audiencia',        descricao: 'Tipo da audiência' },
      { tag: 'local_audiencia',       descricao: 'Nome/referência do local (campo livre da audiência)' },
      { tag: 'vara_audiencia',        descricao: 'Vara da audiência' },
      { tag: 'forum_audiencia',       descricao: 'Fórum da audiência' },
      { tag: 'endereco_audiencia',    descricao: 'Endereço completo do fórum da audiência (montado)' },
      { tag: 'cep_audiencia',         descricao: 'CEP do fórum' },
      { tag: 'logradouro_audiencia',  descricao: 'Logradouro do fórum' },
      { tag: 'numero_audiencia',      descricao: 'Número do endereço do fórum' },
      { tag: 'complemento_audiencia', descricao: 'Complemento do endereço do fórum' },
      { tag: 'bairro_audiencia',      descricao: 'Bairro do fórum' },
      { tag: 'cidade_audiencia',      descricao: 'Cidade do fórum' },
      { tag: 'estado_audiencia',      descricao: 'UF do fórum' },
      { tag: 'modalidade_audiencia',  descricao: 'Modalidade (presencial/virtual)' },
      { tag: 'link_audiencia',        descricao: 'Link da audiência virtual' },
      { tag: 'plataforma_audiencia',  descricao: 'Plataforma virtual (Zoom, etc.)' },
    ],
  },
  pericia: {
    label: 'Perícia',
    variaveis: [
      { tag: 'data_pericia',  descricao: 'Data da perícia' },
      { tag: 'hora_pericia',  descricao: 'Hora da perícia' },
      { tag: 'local_pericia', descricao: 'Local da perícia' },
      { tag: 'tipo_pericia',  descricao: 'Tipo da perícia' },
      { tag: 'perito',        descricao: 'Perito' },
    ],
  },
  escritorio: {
    label: 'Escritório (sempre disponível)',
    variaveis: [
      { tag: 'nome_escritorio',     descricao: 'Nome do escritório' },
      { tag: 'cnpj_escritorio',     descricao: 'CNPJ/CPF do escritório' },
      { tag: 'endereco_escritorio', descricao: 'Endereço do escritório' },
      { tag: 'nome_advogado',       descricao: 'Nome do usuário que gerou o documento' },
      { tag: 'data_hoje',           descricao: 'Data de hoje' },
      { tag: 'cidade_hoje',         descricao: 'Cidade (para fecho do documento)' },
    ],
  },
};

// ============================================================
// CATÁLOGO DAS VARIÁVEIS POR PESSOA — modelos "Documento de partes" (multipessoas)
// ------------------------------------------------------------
// Estes modelos têm REGIÕES que se repetem: tudo entre {{#autores}} e {{/autores}}
// é gerado uma vez para CADA autor escolhido; idem {{#reus}}...{{/reus}} para os réus.
// DENTRO dessas regiões usam-se as tags abaixo (sem sufixo), que valem para a
// pessoa "da vez" (física ou jurídica). Telefones/e-mails podem repetir também,
// com sub-regiões {{#telefones}}{{numero}} – {{tipo}}{{/telefones}} e {{#emails}}{{email}}{{/emails}}.
// As variáveis de Escritório (data_hoje, cidade_hoje, nome_escritorio...) também valem aqui.
// ============================================================
const CATALOGO_PARTE = {
  label: 'Pessoa (dentro de {{#autores}}…{{/autores}} ou {{#reus}}…{{/reus}})',
  variaveis: [
    { tag: 'nome',                descricao: 'Nome (PF) ou razão social (PJ)' },
    { tag: 'nome_fantasia',       descricao: 'Nome fantasia (PJ)' },
    { tag: 'documento',           descricao: 'CPF (PF) ou CNPJ (PJ), conforme o tipo' },
    { tag: 'cpf',                 descricao: 'CPF (PF)' },
    { tag: 'cnpj',                descricao: 'CNPJ (PJ)' },
    { tag: 'rg',                  descricao: 'RG (PF)' },
    { tag: 'rg_orgao',            descricao: 'Órgão emissor do RG' },
    { tag: 'pis',                 descricao: 'PIS (PF)' },
    { tag: 'ctps',                descricao: 'CTPS (número e série)' },
    { tag: 'nacionalidade',       descricao: 'Nacionalidade' },
    { tag: 'estado_civil',        descricao: 'Estado civil' },
    { tag: 'profissao',           descricao: 'Profissão' },
    { tag: 'genero',              descricao: 'Gênero' },
    { tag: 'data_nascimento',     descricao: 'Data de nascimento' },
    { tag: 'nome_mae',            descricao: 'Nome da mãe' },
    { tag: 'nome_pai',            descricao: 'Nome do pai' },
    { tag: 'inscricao_estadual',  descricao: 'Inscrição estadual (PJ)' },
    { tag: 'telefone',            descricao: 'Telefone principal' },
    { tag: 'telefone_tipo',       descricao: 'Tipo do telefone principal (Celular, Comercial...)' },
    { tag: 'email',               descricao: 'E-mail principal' },
    { tag: 'endereco',            descricao: 'Endereço completo montado' },
    { tag: 'cep',                 descricao: 'CEP' },
    { tag: 'logradouro',          descricao: 'Logradouro' },
    { tag: 'numero',              descricao: 'Número do endereço' },
    { tag: 'complemento',         descricao: 'Complemento' },
    { tag: 'bairro',              descricao: 'Bairro' },
    { tag: 'cidade',              descricao: 'Cidade' },
    { tag: 'estado',              descricao: 'Estado (UF)' },
  ],
};

// Mapa derivado: tag -> bloco. E conjunto de todas as tags conhecidas.
const BLOCO_DE_TAG = {};
const TAGS_CONHECIDAS = new Set();
for (const [bloco, grupo] of Object.entries(CATALOGO)) {
  grupo.variaveis.forEach(v => {
    BLOCO_DE_TAG[v.tag] = bloco;
    TAGS_CONHECIDAS.add(v.tag);
  });
}

// Conjunto de tags válidas DENTRO de um modelo multipessoas:
// as variáveis por pessoa + 'tipo' (usada na sub-região de telefones) +
// as variáveis de escritório (sempre disponíveis).
const TAGS_PARTE = new Set(CATALOGO_PARTE.variaveis.map(v => v.tag));
TAGS_PARTE.add('tipo'); // {{tipo}} dentro de {{#telefones}}
CATALOGO.escritorio.variaveis.forEach(v => TAGS_PARTE.add(v.tag));

module.exports = { CATALOGO, BLOCO_DE_TAG, TAGS_CONHECIDAS, CATALOGO_PARTE, TAGS_PARTE };
