// Script para gerar o manual do módulo de Prazos em .docx
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  Header, Footer, PageNumber, LevelFormat, PageBreak
} = require('docx');
const fs = require('fs');

// ── Helpers ────────────────────────────────────────────────────────────────

const AZUL       = '1a56db';
const AZUL_CLARO = 'dbeafe';
const CINZA      = 'f1f5f9';
const VERDE      = '16a34a';
const VERMELHO   = 'dc2626';
const LARANJA    = 'd97706';
const ROXO       = '7c3aed';

const bordaCelula = (cor = 'CCCCCC') => ({
  top:    { style: BorderStyle.SINGLE, size: 1, color: cor },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: cor },
  left:   { style: BorderStyle.SINGLE, size: 1, color: cor },
  right:  { style: BorderStyle.SINGLE, size: 1, color: cor },
});

function h1(texto) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text: texto, bold: true, color: AZUL, size: 32, font: 'Arial' })],
  });
}

function h2(texto) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text: texto, bold: true, color: '1e3a5f', size: 26, font: 'Arial' })],
  });
}

function h3(texto) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 180, after: 80 },
    children: [new TextRun({ text: texto, bold: true, color: '374151', size: 24, font: 'Arial' })],
  });
}

function p(texto, opcoes = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text: texto, size: 22, font: 'Arial', ...opcoes })],
  });
}

function negrito(texto) {
  return new TextRun({ text: texto, bold: true, size: 22, font: 'Arial' });
}

function paragrafo(...runs) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: runs,
  });
}

function bullet(texto, nivel = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: nivel },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text: texto, size: 22, font: 'Arial' })],
  });
}

function separador() {
  return new Paragraph({
    spacing: { before: 160, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'e2e8f0' } },
    children: [],
  });
}

function caixaDestaque(titulo, texto, cor = AZUL_CLARO, corBorda = AZUL) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    margins: { top: 120, bottom: 120 },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 9360, type: WidthType.DXA },
            borders: {
              top:    { style: BorderStyle.SINGLE, size: 6, color: corBorda },
              bottom: { style: BorderStyle.NONE },
              left:   { style: BorderStyle.NONE },
              right:  { style: BorderStyle.NONE },
            },
            shading: { fill: cor, type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 180, right: 180 },
            children: [
              ...(titulo ? [new Paragraph({
                spacing: { before: 0, after: 60 },
                children: [new TextRun({ text: titulo, bold: true, size: 22, font: 'Arial', color: corBorda })],
              })] : []),
              new Paragraph({
                spacing: { before: 0, after: 0 },
                children: [new TextRun({ text: texto, size: 22, font: 'Arial' })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// ── Tabela de status ───────────────────────────────────────────────────────

function tabelaStatus() {
  const cabecalho = (txt) => new TableCell({
    width: { size: 2340, type: WidthType.DXA },
    borders: bordaCelula(AZUL),
    shading: { fill: AZUL, type: ShadingType.CLEAR },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: txt, bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })],
    })],
  });

  const linha = (status, cor, corTexto, descricao, acao) => new TableRow({
    children: [
      new TableCell({
        width: { size: 1560, type: WidthType.DXA },
        borders: bordaCelula(),
        shading: { fill: cor, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: status, bold: true, color: corTexto, size: 20, font: 'Arial' })],
        })],
      }),
      new TableCell({
        width: { size: 3900, type: WidthType.DXA },
        borders: bordaCelula(),
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: descricao, size: 20, font: 'Arial' })] })],
      }),
      new TableCell({
        width: { size: 3900, type: WidthType.DXA },
        borders: bordaCelula(),
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: acao, size: 20, font: 'Arial' })] })],
      }),
    ],
  });

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1560, 3900, 3900],
    rows: [
      new TableRow({
        children: [
          cabecalho('Status'),
          cabecalho('Significado'),
          cabecalho('O que fazer'),
        ],
      }),
      linha('Agendado',  'dbeafe', '1d4ed8', 'Prazo futuro — ainda há tempo.',                    'Acompanhar. Pode clicar em Fazer quando iniciar o trabalho.'),
      linha('Pendente',  'fef3c7', '92400e', 'Vence hoje. Atenção máxima.',                        'Clicar em Fazer imediatamente e concluir no mesmo dia.'),
      linha('Atrasado',  'fee2e2', '991b1b', 'Já passou do prazo e não foi concluído.',            'Resolver com urgência e registrar o motivo do atraso.'),
      linha('Fazendo',   'ede9fe', '6d28d9', 'Alguém está trabalhando neste prazo agora.',         'Aguardar. Somente quem está fazendo ou o admin pode alterá-lo.'),
      linha('Concluído', 'd1fae5', '065f46', 'Prazo encerrado com sucesso.',                       'Nenhuma ação necessária. Registro mantido para histórico.'),
      linha('Cancelado', 'f3f4f6', '374151', 'Prazo cancelado com registro do motivo.',             'Nenhuma ação necessária. Motivo salvo no sistema.'),
    ],
  });
}

// ── Tabela de botões ───────────────────────────────────────────────────────

function tabelaBotoes() {
  const cab = (txt, largura) => new TableCell({
    width: { size: largura, type: WidthType.DXA },
    borders: bordaCelula(AZUL),
    shading: { fill: AZUL, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text: txt, bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })] })],
  });
  const cel = (txt, largura, cor = 'ffffff') => new TableCell({
    width: { size: largura, type: WidthType.DXA },
    borders: bordaCelula(),
    shading: { fill: cor, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text: txt, size: 20, font: 'Arial' })] })],
  });

  const linhas = [
    ['▶ Fazer',     'Roxo',   'Indica que você começou a trabalhar neste prazo. Bloqueia ações de outros usuários.'],
    ['◀ Liberar',   'Cinza',  'Desfaz o "Fazendo". Disponível apenas para quem clicou em Fazer ou para o administrador.'],
    ['✅ Concluir',  'Verde',  'Encerra o prazo com sucesso. Remove automaticamente o status "Fazendo".'],
    ['✖ Cancelar',  'Cinza',  'Cancela o prazo. O sistema exige que você informe o motivo antes de confirmar.'],
    ['✏️ Editar',    'Azul',   'Abre o formulário de edição para ajustar datas, tipo, subtipo ou responsável.'],
    ['🗑️ Excluir',   'Vermelho','Remove o prazo permanentemente. Não é permitido excluir prazos já concluídos ou cancelados.'],
  ];

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1560, 1200, 6600],
    rows: [
      new TableRow({ children: [cab('Botão', 1560), cab('Cor', 1200), cab('O que faz', 6600)] }),
      ...linhas.map(([btn, cor, desc]) => new TableRow({
        children: [cel(btn, 1560, 'f8fafc'), cel(cor, 1200), cel(desc, 6600)],
      })),
    ],
  });
}

// ── Documento ─────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
        ],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: 'Arial', size: 22 } },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'e2e8f0' } },
              children: [new TextRun({ text: 'Sistema de Advocacia — Manual do Módulo de Prazos', size: 18, color: '94a3b8', font: 'Arial' })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'e2e8f0' } },
              children: [
                new TextRun({ text: 'Página ', size: 18, color: '94a3b8', font: 'Arial' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '94a3b8', font: 'Arial' }),
                new TextRun({ text: ' de ', size: 18, color: '94a3b8', font: 'Arial' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '94a3b8', font: 'Arial' }),
              ],
            }),
          ],
        }),
      },
      children: [

        // ── CAPA ─────────────────────────────────────────────────────────
        new Paragraph({ spacing: { before: 1440, after: 0 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: '⚖️', size: 80 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 80, after: 40 },
          children: [new TextRun({ text: 'Sistema de Advocacia', bold: true, size: 48, color: AZUL, font: 'Arial' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 320 },
          children: [new TextRun({ text: 'Manual do Usuário', size: 28, color: '64748b', font: 'Arial' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: AZUL } },
          spacing: { before: 0, after: 0 },
          children: [],
        }),
        new Paragraph({ spacing: { before: 80, after: 80 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 40 },
          children: [new TextRun({ text: 'Módulo de Prazos', bold: true, size: 52, color: '1e3a5f', font: 'Arial' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 1440 },
          children: [new TextRun({ text: 'Controle, acompanhamento e gestão de prazos processuais', size: 24, color: '64748b', font: 'Arial', italics: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: 'Versão 1.0  ·  2026', size: 20, color: '94a3b8', font: 'Arial' })],
        }),

        // Quebra de página após a capa
        new Paragraph({ children: [new PageBreak()] }),

        // ── 1. INTRODUÇÃO ────────────────────────────────────────────────
        h1('1. O que é o Módulo de Prazos?'),
        p('O módulo de Prazos é o coração do controle jurídico do escritório. Ele centraliza todos os prazos processuais — datas-limite para entregar petições, recursos, contestações, documentos e qualquer outra obrigação vinculada a um processo judicial.'),
        p('Cada prazo está ligado a um processo específico e pode ser atribuído a um advogado, estagiário ou ao escritório como um todo. O sistema calcula automaticamente a data de vencimento a partir da data de início e da quantidade de dias úteis ou corridos, consultando o calendário de feriados cadastrado.'),

        new Paragraph({ spacing: { before: 120, after: 120 }, children: [] }),
        caixaDestaque(
          '⚠️  Por que o controle de prazos é tão importante?',
          'O prazo perdido é uma das faltas mais graves no exercício da advocacia. Além de prejudicar o cliente, pode resultar em processo disciplinar na OAB, indenizações por danos causados e até perda da licença profissional. Este sistema foi desenhado para que nenhum prazo passe despercebido.',
          'fff7ed', 'd97706'
        ),

        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),
        separador(),

        // ── 2. COMO ACESSAR ──────────────────────────────────────────────
        h1('2. Como acessar os Prazos'),
        p('Existem três formas de acessar os prazos no sistema:'),
        bullet('Menu lateral → clique em Prazos para ver todos os prazos do escritório (conforme sua permissão).'),
        bullet('Dashboard → na seção "Prazos atrasados" ou "Prazos vencendo hoje", clique no número do processo para ir diretamente à tela da pasta já na aba Prazos, com o processo correto já selecionado.'),
        bullet('Pasta do Processo → acesse um processo, clique na aba Prazos para ver somente os prazos daquele processo.'),

        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),
        separador(),

        // ── 3. STATUS ───────────────────────────────────────────────────
        h1('3. Status dos Prazos'),
        p('Cada prazo possui um status que indica sua situação atual. Os status são calculados automaticamente pelo sistema com base na data de vencimento — você não precisa alterá-los manualmente (exceto ao concluir ou cancelar).'),
        new Paragraph({ spacing: { before: 120, after: 120 }, children: [] }),
        tabelaStatus(),
        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),

        caixaDestaque(
          '💡 Dica: Filtro por status',
          'Na tela de Prazos, use o filtro de Status no topo para visualizar somente os prazos atrasados, pendentes, agendados ou em andamento. Isso facilita muito o trabalho diário de priorização.',
          CINZA, '64748b'
        ),

        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),
        separador(),

        // ── 4. CRIANDO UM PRAZO ─────────────────────────────────────────
        h1('4. Criando um Novo Prazo'),
        p('Para cadastrar um prazo, clique no botão + Novo Prazo. O formulário possui os seguintes campos:'),

        new Paragraph({ spacing: { before: 120, after: 80 }, children: [] }),
        h3('4.1 Campos obrigatórios'),
        bullet('Número do Processo: digite o número CNJ para localizar a pasta. O sistema busca automaticamente enquanto você digita.'),
        bullet('Tipo de prazo: categoria geral (ex: Penal, Cível, Trabalhista).'),
        bullet('Subtipo: especificação dentro do tipo (ex: Recurso Ordinário, Contestação).'),
        bullet('Data de início: data a partir da qual a contagem começa.'),

        new Paragraph({ spacing: { before: 80, after: 80 }, children: [] }),
        h3('4.2 Campos opcionais'),
        bullet('Quantidade de dias: informe o número de dias para o sistema calcular a data final automaticamente.'),
        bullet('Tipo de dias: Dias úteis (pula fins de semana e feriados) ou Dias corridos (conta todos os dias).'),
        bullet('Data final: calculada automaticamente, mas pode ser ajustada manualmente se necessário.'),
        bullet('Delegar para: escolha um advogado ou deixe em branco para atribuir ao escritório.'),
        bullet('Descrição: anotações adicionais sobre o prazo.'),

        new Paragraph({ spacing: { before: 120, after: 80 }, children: [] }),
        caixaDestaque(
          '📅 Cálculo de dias úteis',
          'O sistema consulta o calendário de feriados cadastrado em Configurações → Feriados. Por isso, é fundamental manter os feriados atualizados. Se um feriado não estiver cadastrado, o sistema pode calcular uma data incorreta.',
          AZUL_CLARO, AZUL
        ),
        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),
        separador(),

        // ── 5. BOTÕES E AÇÕES ────────────────────────────────────────────
        h1('5. Botões de Ação'),
        p('Cada prazo na listagem possui botões de ação conforme seu status e as permissões do usuário:'),
        new Paragraph({ spacing: { before: 120, after: 120 }, children: [] }),
        tabelaBotoes(),
        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),

        caixaDestaque(
          '🔒 Regra importante: prazos concluídos e cancelados',
          'Prazos com status Concluído ou Cancelado não podem ser editados nem excluídos. Os botões de ação são removidos automaticamente da tela. Isso garante a integridade do histórico do processo.',
          'fff7ed', LARANJA
        ),

        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),
        separador(),

        // ── 6. FUNCIONALIDADE FAZENDO ────────────────────────────────────
        new Paragraph({ children: [new PageBreak()] }),
        h1('6. Funcionalidade "Fazendo" — Controle de Quem Está Trabalhando'),

        caixaDestaque(
          '🎯 Para que serve?',
          'Quando mais de um usuário pode ver os mesmos prazos, existe o risco de dois advogados começarem a trabalhar no mesmo prazo ao mesmo tempo sem saber. A funcionalidade "Fazendo" resolve isso: ao clicar em Fazer, você avisa a todos que está trabalhando naquele prazo.',
          'ede9fe', ROXO
        ),

        new Paragraph({ spacing: { before: 120, after: 80 }, children: [] }),
        h2('Como funciona na prática'),

        h3('Passo 1 — Iniciar'),
        p('Localize o prazo que você vai trabalhar. Clique no botão ▶ Fazer (roxo). O prazo aparecerá na coluna "Quem faz" com o seu nome para todos os outros usuários. Os botões de ação daquele prazo desaparecem para os demais usuários — eles só poderão visualizar.'),

        h3('Passo 2 — Trabalhar'),
        p('Enquanto o prazo estiver como "Fazendo", seu nome fica visível na listagem de todos. Outros usuários sabem que não devem pegar aquele prazo.'),

        h3('Passo 3 — Concluir'),
        p('Ao terminar, clique em ✅ Concluir. O prazo muda para Concluído e o status "Fazendo" é removido automaticamente.'),

        h3('Passo 4 — Liberar (se precisar cancelar)'),
        p('Se clicou em Fazer por engano ou precisou parar, clique em ◀ Liberar. O prazo volta ao status anterior (Atrasado, Pendente ou Agendado) e fica disponível para qualquer usuário novamente.'),

        new Paragraph({ spacing: { before: 120, after: 80 }, children: [] }),
        h2('Regras do "Fazendo"'),
        bullet('Somente você e o administrador podem liberar um prazo que você colocou como "Fazendo".'),
        bullet('O administrador pode liberar qualquer prazo de qualquer usuário.'),
        bullet('Se o prazo ficar em "Fazendo" por mais tempo do que o configurado (padrão: 60 minutos), o sistema libera automaticamente e o prazo volta ao status anterior.'),
        bullet('Prazos em "Fazendo" continuam aparecendo nos e-mails de alerta — o fato de alguém estar fazendo não cancela o aviso.'),
        bullet('A permissão "Ver prazos de todos" em Configurações → Permissões determina se o usuário vê os prazos de todos ou apenas os seus e os do escritório.'),

        new Paragraph({ spacing: { before: 120, after: 80 }, children: [] }),
        caixaDestaque(
          '⚙️  Configurando o tempo de liberação automática',
          'O administrador pode ajustar o tempo limite em Configurações → Escritório → seção "Controle Fazendo em prazos". O padrão é 60 minutos. Recomenda-se entre 30 e 120 minutos, dependendo da complexidade típica dos prazos do escritório.',
          CINZA, '64748b'
        ),

        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),
        separador(),

        // ── 7. ALERTAS POR E-MAIL ────────────────────────────────────────
        h1('7. Alertas Automáticos por E-mail'),
        p('O sistema envia e-mails automáticos para os destinatários configurados em Configurações → Escritório → "Alertas de prazos".'),

        new Paragraph({ spacing: { before: 80, after: 80 }, children: [] }),
        h2('Tipos de e-mail enviados'),

        h3('📋 PRAZO PENDENTE HOJE'),
        p('Enviado no horário configurado (ex: 10h00) listando todos os prazos que vencem naquele dia e ainda não foram concluídos. Inclui: número do processo, tipo do prazo e responsável.'),

        h3('🚨 PRAZO ATRASADO'),
        p('Enviado no mesmo horário, listando todos os prazos com data de vencimento já passada e não concluídos. Inclui: processo, prazo, data de vencimento e quantos dias de atraso.'),

        h3('🔔 Notificação ao ser delegado'),
        p('Quando um prazo é atribuído a um usuário, ele recebe imediatamente um e-mail informando: nome do prazo, data de vencimento e escritório responsável. Essa notificação é individual e instantânea.'),

        new Paragraph({ spacing: { before: 120, after: 80 }, children: [] }),
        caixaDestaque(
          '📧 Como configurar os e-mails',
          'Acesse Configurações → Escritório → "Alertas de prazos — e-mail coletivo". Informe o horário de envio e os endereços dos destinatários separados por vírgula. O administrador também pode ativar ou desativar o envio de PRAZO ATRASADO.',
          AZUL_CLARO, AZUL
        ),

        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),
        separador(),

        // ── 8. ORDENAÇÃO E PAGINAÇÃO ─────────────────────────────────────
        h1('8. Ordenação e Paginação'),
        h2('Ordenação automática'),
        p('A lista de prazos é sempre ordenada por dois critérios:'),
        bullet('Primeiro: data de vencimento — do mais antigo para o mais recente.'),
        bullet('Segundo (mesmo dia): prioridade do status — Atrasado → Pendente → Fazendo → Agendado → Concluído → Cancelado.'),
        p('Isso garante que os prazos mais urgentes apareçam sempre no topo da lista.'),

        new Paragraph({ spacing: { before: 80, after: 80 }, children: [] }),
        h2('Paginação'),
        p('A lista exibe 100 prazos por página. Quando o escritório tiver mais de 100 prazos, botões de navegação aparecerão no rodapé da lista:'),
        bullet('◀ Anterior — volta para a página anterior.'),
        bullet('Página X de Y · Z registro(s) — indicador de posição.'),
        bullet('Próximo ▶ — avança para a próxima página.'),
        p('Ao mudar qualquer filtro (status, datas), a lista volta automaticamente para a página 1.'),

        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),
        separador(),

        // ── 9. FILTROS ───────────────────────────────────────────────────
        h1('9. Filtros de Pesquisa'),
        p('Na parte superior da tela de Prazos, estão disponíveis os seguintes filtros:'),
        bullet('Status: filtra por Todos, Agendado, Pendente, Atrasado, Fazendo, Concluído ou Cancelado.'),
        bullet('Vencimento de / Até: filtra por intervalo de datas de vencimento.'),
        bullet('Limpar filtros: restaura todos os filtros para o estado padrão.'),
        p('Os filtros são cumulativos — você pode combinar status + intervalo de datas ao mesmo tempo.'),

        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),
        separador(),

        // ── 10. PERMISSÕES ───────────────────────────────────────────────
        h1('10. Permissões de Acesso'),
        p('O acesso ao módulo de Prazos é controlado pelo administrador em Configurações → Permissões. Cada usuário pode ter um conjunto diferente de permissões:'),

        new Paragraph({ spacing: { before: 80, after: 80 }, children: [] }),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [2400, 6960],
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 2400, type: WidthType.DXA },
                  borders: bordaCelula(AZUL),
                  shading: { fill: AZUL, type: ShadingType.CLEAR },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [new Paragraph({ children: [new TextRun({ text: 'Permissão', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })] })],
                }),
                new TableCell({
                  width: { size: 6960, type: WidthType.DXA },
                  borders: bordaCelula(AZUL),
                  shading: { fill: AZUL, type: ShadingType.CLEAR },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [new Paragraph({ children: [new TextRun({ text: 'O que permite', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })] })],
                }),
              ],
            }),
            ...[
              ['Visualizar',              'Ver a lista de prazos e acessar os detalhes.'],
              ['Cadastrar',               'Criar novos prazos.'],
              ['Alterar',                 'Editar prazos existentes (datas, tipo, responsável).'],
              ['Excluir',                 'Remover prazos ativos. Não se aplica a concluídos/cancelados.'],
              ['Ver prazos de todos',     'Visualizar prazos de todos os usuários, não apenas os próprios e os do escritório.'],
            ].map(([perm, desc], i) => new TableRow({
              children: [
                new TableCell({
                  width: { size: 2400, type: WidthType.DXA },
                  borders: bordaCelula(),
                  shading: { fill: i % 2 === 0 ? 'f8fafc' : 'ffffff', type: ShadingType.CLEAR },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [new Paragraph({ children: [new TextRun({ text: perm, bold: true, size: 20, font: 'Arial' })] })],
                }),
                new TableCell({
                  width: { size: 6960, type: WidthType.DXA },
                  borders: bordaCelula(),
                  shading: { fill: i % 2 === 0 ? 'f8fafc' : 'ffffff', type: ShadingType.CLEAR },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [new Paragraph({ children: [new TextRun({ text: desc, size: 20, font: 'Arial' })] })],
                }),
              ],
            })),
          ],
        }),

        new Paragraph({ spacing: { before: 120, after: 80 }, children: [] }),
        caixaDestaque(
          '👤 Administradores têm acesso total',
          'Usuários com nível Administrador têm acesso irrestrito a todos os prazos e todas as ações, independentemente das permissões configuradas. Eles também podem liberar qualquer prazo que esteja em status "Fazendo".',
          'd1fae5', VERDE
        ),

        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),
        separador(),

        // ── 11. DICAS PRÁTICAS ───────────────────────────────────────────
        new Paragraph({ children: [new PageBreak()] }),
        h1('11. Dicas Práticas para o Dia a Dia'),

        h2('🌅 Rotina matinal recomendada'),
        bullet('Acesse o Dashboard logo ao entrar no sistema.'),
        bullet('Verifique os cards "Prazos Hoje" e "Prazos Atrasados".'),
        bullet('Clique nos processos atrasados para ir direto à aba Prazos.'),
        bullet('Clique em Fazer nos prazos que você vai trabalhar naquele dia.'),
        bullet('Ao concluir cada um, clique em Concluir para atualizar o status.'),

        new Paragraph({ spacing: { before: 80, after: 80 }, children: [] }),
        h2('✅ Boas práticas'),
        bullet('Sempre clique em Fazer antes de começar a trabalhar em um prazo — isso evita que dois advogados façam o mesmo trabalho.'),
        bullet('Se não conseguiu concluir no dia, clique em Liberar para que outro colega possa continuar.'),
        bullet('Mantenha os feriados atualizados em Configurações → Feriados para garantir o cálculo correto de dias úteis.'),
        bullet('Use o campo Descrição para anotações importantes sobre o prazo (ex: "Aguardando documentos do cliente").'),
        bullet('Para criar um novo prazo dentro de um processo, prefira usar o botão + Novo Prazo na aba Prazos da pasta — o processo já virá pré-selecionado.'),

        new Paragraph({ spacing: { before: 80, after: 80 }, children: [] }),
        h2('⚠️ O que não fazer'),
        bullet('Não deixe prazos em "Fazendo" ao fim do dia sem concluir ou liberar — o timeout automático vai liberar, mas é melhor manter a organização.'),
        bullet('Não cancele um prazo sem escrever um motivo claro — esse registro é importante para o histórico do processo.'),
        bullet('Não tente excluir prazos concluídos — o sistema não permite, pois eles fazem parte do histórico.'),

        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),
        separador(),

        // ── 12. PERGUNTAS FREQUENTES ─────────────────────────────────────
        h1('12. Perguntas Frequentes'),

        h3('Por que a data calculada ficou diferente do que eu esperava?'),
        p('Verifique se o tipo de dias está correto (úteis ou corridos). Para dias úteis, o sistema pula fins de semana e feriados cadastrados. Se a data está errada, pode ser que falte algum feriado em Configurações → Feriados.'),

        h3('Posso criar um prazo sem saber a data final?'),
        p('Sim. Preencha o campo Data Final manualmente sem usar a contagem automática de dias. O campo de quantidade de dias é opcional.'),

        h3('O prazo está em "Atrasado" mas já foi resolvido. O que faço?'),
        p('Clique em ✅ Concluir. O sistema vai registrar a conclusão com a data e o usuário. O prazo ficará em "Concluído" no histórico.'),

        h3('Por que não consigo editar ou excluir um prazo?'),
        p('Existem duas possibilidades: (1) o prazo está com status Concluído ou Cancelado — nesses casos, nenhuma alteração é permitida para preservar o histórico; (2) outro usuário está com o prazo em "Fazendo" — aguarde ele concluir ou liberar, ou peça ao administrador que libere.'),

        h3('Como saber se outro usuário está trabalhando em um prazo?'),
        p('Olhe a coluna "Quem faz" na lista de prazos. Se aparecer um nome com o ícone ▶, aquele prazo está sendo trabalhado por essa pessoa.'),

        h3('Posso ver os prazos de todos os advogados do escritório?'),
        p('Somente se o administrador tiver habilitado a permissão "Ver prazos de todos" para o seu usuário em Configurações → Permissões. Caso contrário, você verá apenas os prazos atribuídos a você e os prazos do escritório (sem responsável).'),

        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),
        separador(),

        // ── RODAPÉ DO DOCUMENTO ──────────────────────────────────────────
        new Paragraph({ spacing: { before: 240, after: 80 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Sistema de Advocacia  ·  Módulo de Prazos  ·  Versão 1.0', size: 18, color: '94a3b8', font: 'Arial', italics: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Este documento destina-se ao uso interno do escritório.', size: 18, color: '94a3b8', font: 'Arial', italics: true })],
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('Manual_Modulo_Prazos.docx', buffer);
  console.log('✅ Manual_Modulo_Prazos.docx gerado com sucesso!');
});
