// ============================================================
// RELATÓRIOS — limites do motor (um lugar só, fácil de ajustar)
// ============================================================
module.exports = {
  LIMITE_TELA: 2000,        // máximo de linhas que a tela navega (o resto: refinar filtros ou exportar)
  LIMITE_EXCEL: 50000,      // máximo de linhas numa exportação (acima disso o pedido é recusado)
  LIMITE_DOCUMENTO: 1000,   // máximo de linhas no PDF/Word (são feitos em memória e lidos por gente: acima disso, use Excel)
  IMAGEM_MAX_BYTES: 3 * 1024 * 1024, // gráfico (PNG) enviado pela tela para entrar no PDF/Word
  IMAGEM_MAX_LADO: 6000,    // pixels
  POR_PAGINA_PADRAO: 50,
  POR_PAGINA_MAX: 200,
  LOTE_EXPORTACAO: 2000,    // linhas lidas do banco por vez ao exportar (memória sob controle)
  MAX_COLUNAS: 40,
  MAX_CONDICOES: 25,        // total de condições de filtro numa receita
  MAX_PROFUNDIDADE: 3,      // grupos E/OU aninhados
  MAX_ORDENS: 5,
  MAX_VALORES_LISTA: 50,
  MAX_TEXTO: 200,
  TEMPO_MAX_MS: 20000,      // dica ao MySQL 8 (MAX_EXECUTION_TIME); em versão sem suporte vira só um comentário
  LIMITE_PADRAO_MODELOS: 10, // usado só se a configuração do escritório estiver vazia
  MAX_AGRUPAR: 2,           // níveis de agrupamento
  MAX_METRICAS: 6,          // totais (contagem, soma...) por relatório
  MAX_AGENDAMENTOS: 10,     // envios agendados por usuário
  MAX_DESTINATARIOS: 10,    // pessoas por envio agendado
  FALHAS_PARA_PAUSAR: 3,    // falhas seguidas até o agendamento ser pausado sozinho
  VERSAO_RECEITA: 2,        // a 1 (Fase 1, sem agrupamento) continua sendo aceita
};
