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

## Git — Formato Obrigatório de Commit

Todo commit deve começar com data e hora no formato `DDMMYY-HHMM`.  
**Why:** Padrão do projeto para rastreabilidade cronológica — ex: `260527-1430 — descrição`  
**How to apply:** Sempre verificar a hora atual antes de criar o commit e incluir no início da mensagem. Nunca omitir a data/hora, mesmo em commits pequenos.

## Banco de Dados — Sem Migrations

O projeto NÃO usa migrations. Alterações no banco são feitas diretamente no HeidiSQL.

**Arquivo de estrutura:** `estrutura_banco.sql` (raiz do projeto)
  - Contém o CREATE TABLE de todas as 46 tabelas do sistema
  - É usado pelo deploy no servidor (substitui as migrations)
  - Deve ser atualizado após qualquer ALTER TABLE no HeidiSQL:
      HeidiSQL → Ferramentas → Exportar → Estrutura SQL → salvar como estrutura_banco.sql
  - Depois de atualizar, commit no Git

**Nunca criar arquivos de migration** (pasta backend/database/migrations foi deletada).
Se precisar de nova tabela ou coluna → faz direto no HeidiSQL e exporta o estrutura_banco.sql.

## Modelo de Banco — Nunca Duplicar Tabelas

O sistema tem UM único modelo de banco de dados. Nunca criar tabela paralela para o mesmo conceito.
Se uma tabela existente precisar de novos campos, faça ALTER TABLE — não crie uma "tbl*" nova ao lado da antiga.

**Tabelas definitivas do modelo atual:**
  tblForum, tblVara, tblPasta, tblProc, tblStatusProc, tblTipoProc,
  tblInstanciaProc, tblTituloProcAutor, tblTituloProcReu

**Tabelas antigas removidas (NÃO recriar):**
  forum, vara, pasta, processo, partes_processo, status_processo,
  processo_responsaveis (migration 007 e 008)

**Why:** Em maio/2026 o sistema tinha dois modelos paralelos gerando bugs e confusão.
A migration 008 eliminou as tabelas antigas e atualizou todos os controllers.

## Código — Nunca Escrever sem Autorização Explícita

Nunca criar, editar ou modificar arquivos de código sem que o usuário autorize explicitamente.  
**Why:** Existem situações em que o usuário está apenas conversando, tirando dúvidas ou planejando — e não quer que o Claude saia codando.  
**How to apply:** Se o assunto envolver código, apenas discutir, analisar ou propor a solução em texto. Só partir para a implementação quando o usuário disser claramente "pode fazer", "implementa", "vai lá" ou expressão equivalente. Em caso de dúvida, perguntar antes de codar.

## Git — Nunca Commitar sem Permissão

Nunca executar `git add`, `git commit`, `git push` ou qualquer operação destrutiva no Git sem permissão explícita do usuário.  
**Why:** Usuário prefere fazer commits manualmente — palavras exatas: "o Git, nunca faça atualização sem minha permissão, de preferencia deixa que eu faço manualmente"  
**How to apply:** Após qualquer alteração de código, apenas listar os arquivos modificados e aguardar instrução. Nunca usar `--no-verify` ou forçar operações.
