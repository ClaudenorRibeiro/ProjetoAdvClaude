---
name: feedback-codigo
description: Diretrizes obrigatórias de qualidade e estilo de código para o projeto
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Código Bem Comentado

Todo código entregue deve ter comentários claros explicando o que cada bloco faz.  
**Why:** Usuário fará manutenções e ajustes diretamente no VSCode — precisa entender o código sem depender de Claude  
**How to apply:** Comentar funções, rotas, queries SQL, lógicas de negócio e qualquer trecho não óbvio. Padrão mínimo: comentário no início de cada função e em cada bloco lógico relevante

## Pensar à Frente — Evitar Retrabalho

Antes de escrever código, sempre analisar e sugerir:
- Funções/utilitários reutilizáveis que servirão para múltiplos módulos
- Estruturas de dados que evitam refatoração futura
- Padrões que se aplicam ao projeto todo (ex: tratamento de erros, validações, respostas da API)
- Avisar quando uma decisão agora pode gerar retrabalho depois

**Why:** Sistema grande com muitos módulos — código duplicado ou mal estruturado no início custa caro no final  
**How to apply:** Ao iniciar cada módulo, revisar o que já existe e reaproveitar. Sempre perguntar "isso vai ser necessário em outro lugar?" antes de implementar de forma isolada

## Manutenção via VSCode

Usuário mantém o sistema diretamente no VSCode.  
**How to apply:** Estrutura de pastas clara e intuitiva, nomes de arquivos e variáveis autoexplicativos, sem "magia" desnecessária no código

## Performance — Processamento Máximo

O sistema deve ser o mais rápido possível em todas as camadas.  
**Why:** Exigência direta do dono do sistema  
**How to apply:**
- Queries SQL com índices nas colunas usadas em WHERE, JOIN e ORDER BY
- Nunca buscar mais dados do que o necessário (SELECT * apenas quando realmente precisa de todos os campos)
- Paginação obrigatória em todas as listagens
- Subqueries evitadas quando JOIN resolve mais eficiente
- No frontend: evitar re-renders desnecessários (useCallback, useMemo onde fizer diferença real)
- Respostas da API enxutas — não carregar dados relacionados que o cliente não pediu

## Transações — Tudo ou Nada

**Regra absoluta:** Toda operação que envolva mais de um passo no banco (INSERT + INSERT, INSERT + UPDATE, etc.) DEVE usar transação com commit/rollback.  
**Why:** Queda de energia, erro de rede ou qualquer falha no meio do caminho não pode deixar dados parciais/corrompidos no banco  

**Padrão obrigatório no Node.js/MySQL:**
```javascript
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();

  // ... todos os INSERTs/UPDATEs/DELETEs da operação

  await conn.commit();         // só grava se TUDO deu certo
  return sucesso(res, ...);
} catch (err) {
  await conn.rollback();       // desfaz tudo se qualquer passo falhou
  return erroInterno(res, err);
} finally {
  conn.release();              // SEMPRE devolve a conexão ao pool
}
```

**Quando usar transação:**
- Criar pessoa com telefones e e-mails (3+ tabelas)
- Criar processo com partes e responsáveis
- Registrar ata de audiência (gera prazos, tarefas, lançamento financeiro)
- Qualquer operação que toque 2 ou mais tabelas em sequência

**Quando NÃO precisa de transação:**
- SELECT simples (leitura)
- UPDATE ou DELETE em uma única tabela sem dependências

**Atenção:** Usar `conn` (conexão individual) em vez de `pool.execute()` dentro da transação — o pool pode usar conexões diferentes para cada chamada, o que quebraria a transação

**Esta regra é permanente e vale para TODO código novo criado daqui em diante.** Nenhuma operação multi-tabela pode ser escrita sem transação.

## Banco de Dados — Apenas Repositório de Dados

**Regra absoluta:** O banco de dados NÃO deve conter nenhuma regra de negócio.  
**Why:** Exigência direta do dono do sistema — toda validação e regra de negócio fica no código (frontend e backend), nunca no banco  
**O que NUNCA colocar no banco:**
- `UNIQUE` constraints (ex: CPF único, login único) — validar no código antes de salvar
- `ENUM` — usar `VARCHAR` com o tamanho adequado; o código valida os valores permitidos
- `CHECK` constraints — validar no código
- Triggers com lógica de negócio
- Stored procedures com regras de negócio

**O que É permitido no banco (estrutural):**
- `PRIMARY KEY` — identificação de registro
- `FOREIGN KEY` — **os relacionamentos entre tabelas DEVEM existir e ser mantidos normalmente.** Ex: processo.pasta_id → pasta.id, telefones_pf.pessoa_id → pessoas_fisicas.id, etc. Isso é estrutura, não regra de negócio
- `INDEX` simples — apenas para performance de busca (não para unicidade)
- `NOT NULL` — apenas em campos verdadeiramente obrigatórios pelo sistema
- Tipos de dados adequados (`VARCHAR`, `INT`, `DECIMAL`, `DATE`, etc.)

**Como aplicar em novos campos/tabelas:**
- Sempre usar `VARCHAR` em vez de `ENUM`
- Nunca adicionar `UNIQUE KEY` — a verificação de duplicidade é feita via `SELECT` no controller antes do `INSERT`
- Ao criar migration ou nova tabela, revisar e remover qualquer constraint de regra de negócio

## Limpeza de Memória — Sem Sujeira

**Regra absoluta:** Se abriu, fecha. Se fechou, abre. Sem nada pendurado em memória.  
**Why:** Exigência direta do dono do sistema — sistema precisa ser limpo e sem vazamentos  
**How to apply no React (frontend):**
- Todo `useEffect` que cria listener, timer, subscription ou conexão **deve** ter função de cleanup (`return () => { ... }`)
- Timers com `setTimeout`/`setInterval` devem ter o ID armazenado e cancelados no cleanup
- States de modais, alertas e overlays devem ser resetados quando fechados (não deixar dados "sujos" para próxima abertura)
- Componentes desmontados não devem tentar fazer `setState` — cancelar requisições pendentes no cleanup
- Ao fechar um modal, limpar: formulário, erros, estados de loading, duplicatas encontradas

**How to apply no Node.js (backend):**
- Conexões com banco obtidas via pool (nunca conexão manual sem devolução ao pool)
- `pool.execute()` fecha o statement automaticamente — preferir sempre ao `pool.query()` para prepared statements
- Nunca deixar variáveis globais acumulando dados entre requisições
- Logs de erro: registrar e deixar o processo continuar limpo (sem crash silencioso nem acúmulo)
