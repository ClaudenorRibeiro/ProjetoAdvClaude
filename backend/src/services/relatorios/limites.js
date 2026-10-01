// ============================================================
// RELATÓRIOS — limites do motor (um lugar só, fácil de ajustar)
// ============================================================
module.exports = {
  LIMITE_TELA: 2000,        // máximo de linhas que a tela navega (o resto: refinar filtros ou exportar)
  LIMITE_EXCEL: 50000,      // máximo de linhas numa exportação (acima disso o pedido é recusado)
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
  VERSAO_RECEITA: 2,        // a 1 (Fase 1, sem agrupamento) continua sendo aceita
};
