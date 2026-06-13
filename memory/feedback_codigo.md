---
name: feedback-codigo
description: Diretrizes obrigatórias de qualidade e estilo de código para o projeto
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Regras de Trabalho — OBRIGATÓRIAS

**Nunca codificar sem autorização explícita do usuário.**  
O usuário decide quando e o que será desenvolvido. Claude analisa, sugere e explica — mas só executa código quando autorizado.

**Fluxo de trabalho LOCAL-PRIMEIRO (regra absoluta, 12/06/2026):**
O usuário NUNCA fará nenhuma atualização direto no servidor. TODA mudança (código e banco)
é feita primeiro LOCALMENTE — Claude codifica na pasta local, scripts SQL são rodados primeiro
no banco LOCAL via HeidiSQL. Depois o usuário, manualmente e quando quiser, faz o deploy do
sistema (WinSCP) e do banco para a produção. Claude nunca deve propor correção direto na
produção — sempre propor a correção local + instruir o que levar no deploy.
Acesso SSH ao servidor é permitido a Claude SOMENTE para leitura/diagnóstico (logs, conferir deploy).
⚠️ QUALQUER alteração de código/banco feita na instância AWS é EFÊMERA: o deploy do usuário
(`git reset --hard origin/main` + import do SQL no HeidiSQL) SOBRESCREVE tudo. Portanto Claude
NUNCA corrige código/dados direto na AWS — só local. Exceção que sobrevive ao deploy: o `.env`
do servidor (não está no git; editado à parte via WinSCP). pm2 restart/testes na AWS são OK (não são arquivos).

**Git e Banco de Dados: Claude NUNCA executa NADA — o usuário faz TUDO manualmente, SEMPRE.**  
⚠️ REGRA ABSOLUTA (reforçada em 12/06/2026, substitui as regras anteriores):
- Claude **nunca** faz commit, push ou qualquer comando git que altere o repositório — nem da pasta `memory/` (a exceção antiga foi REVOGADA pelo usuário)
- Claude **nunca** executa nada no banco de dados — mudanças de schema/dados são entregues como script SQL para o usuário colar no HeidiSQL
- O fluxo é: Claude codifica local → usuário testa → usuário commita/sobe quando quiser
- Claude pode usar git somente para LEITURA (status, log, diff)

**A pasta local SEMPRE prevalece sobre o git.**  
Arquivos deletados localmente e depois commitados saem do git também.

**Formato obrigatório de commit:** `DDMMYY-HHMM — descrição curta`  
Exemplo: `050626-1430 — deploy: scripts de instalação por partes`

**Sem migrations.** Alterações de schema são feitas via HeidiSQL diretamente no banco local.  
Depois: exportar estrutura → `estrutura_banco.sql` → commit.  
Nunca criar arquivos de migration.

**Tabelas definitivas (nunca criar versões alternativas):**  
`tblForum, tblVara, tblPasta, tblProc, tblStatusProc, tblTipoProc, tblInstanciaProc, tblTituloProcAutor, tblTituloProcReu`

## Atualização de Memória — AUTOMÁTICA E OBRIGATÓRIA

**Ao final de cada sessão de trabalho (ou após qualquer mudança relevante), Claude DEVE:**

1. Atualizar os arquivos `.md` em:  
   `C:\Users\Claudio\.claude\projects\C--Users-Claudio-Downloads-ProjetoAdvClaude\memory\`

2. Sincronizar para a pasta do projeto:  
   `C:\Users\Claudio\Downloads\ProjetoAdvClaude\memory\`  
   (copiar os arquivos atualizados para lá)

3. Fazer commit e push automaticamente (sem pedir autorização):  
   `git add memory/ && git commit -m "DDMMYY-HHMM — atualiza memória do projeto"`

**O que atualizar:**
- Qualquer funcionalidade nova implementada
- Decisões de arquitetura tomadas
- Regras novas definidas pelo usuário
- Scripts e arquivos novos criados
- Mudanças no banco de dados

**Por quê:** O usuário trabalha em múltiplos computadores. A memória no GitHub é a única fonte confiável de contexto entre máquinas. Não atualizar = próxima sessão começa sem contexto.

---

## Código Bem Comentado

Todo código entregue deve ter comentários claros explicando o que cada bloco faz.  
**Why:** Usuário fará manutenções e ajustes diretamente no VSCode — precisa entender o código sem depender de Claude  
**How to apply:** Comentar funções, rotas, queries SQL, lógicas de negócio e qualquer trecho não óbvio. Padrão mínimo: comentário no início de cada função e em cada bloco lógico relevante

## Antes de Implementar Qualquer Campo — Verificar se Já Existe

**Regra obrigatória:** Antes de criar qualquer campo novo numa tela (modal, formulário, etc.), **ler o componente inteiro** e mapear todos os campos já existentes.

**Por quê:** Em 09/06/2026, foi criado o campo "Advogado que conduzirá esta audiência" sem perceber que "Responsável pela condução" já existia no mesmo modal com a mesma finalidade. Resultado: campo duplicado e redundante, retrabalho para desfazer tudo.

**Como aplicar:**
1. Ler o arquivo completo do componente antes de propor qualquer novo campo
2. Listar os campos existentes e seus propósitos
3. Só então confirmar se o campo solicitado é realmente novo ou apenas uma renomeação/ajuste de algo que já existe
4. Se houver dúvida, descrever ao usuário os campos existentes e perguntar qual é o correto

## Auditoria — Gravar Nomes Legíveis na Escrita (regra desde 09/06/2026)

**Regra absoluta:** Ao inserir registros de auditoria campo a campo, **nunca gravar IDs numéricos** — sempre resolver para nomes legíveis no momento da gravação.

**Por quê:** Gravar IDs e resolver na leitura causa N+1 queries. Com 20k clientes e milhares de históricos isso degrada seriamente o desempenho. Resolvendo na escrita, a leitura é sempre 1 query simples.

**Como aplicar:**
- `tipo_audiencia_id` → buscar nome na tabela `tipo_audiencia` antes do INSERT
- `vara_id` → buscar `"abrev — forum"` nas tabelas `tblVara`+`tblForum` antes do INSERT
- `responsavel_id` → buscar nome em `usuarios` ou `advogados_freela` antes do INSERT
- Campos já legíveis (`data`, `hora`, `modalidade`, status como texto, etc.) → gravar direto

**Padrão implementado:** `audienciasController.js` tem as funções `resolverNomeTipo`, `resolverNomeVara`, `resolverNomeResponsavel` como referência. Ao implementar auditoria em outros módulos, seguir o mesmo padrão.

## Pensar à Frente — Evitar Retrabalho

Antes de escrever código, sempre analisar e sugerir:
- Funções/utilitários reutilizáveis que servirão para múltiplos módulos
- Estruturas de dados que evitam refatoração futura
- Padrões que se aplicam ao projeto todo (ex: tratamento de erros, validações, respostas da API)
- Avisar quando uma decisão agora pode gerar retrabalho depois

## Manutenção via VSCode

Usuário mantém o sistema diretamente no VSCode.  
**How to apply:** Estrutura de pastas clara e intuitiva, nomes de arquivos e variáveis autoexplicativos, sem "magia" desnecessária no código

## Performance — Processamento Máximo

O sistema deve ser o mais rápido possível em todas as camadas.  
**How to apply:**
- Queries SQL com índices nas colunas usadas em WHERE, JOIN e ORDER BY
- Nunca buscar mais dados do que o necessário (SELECT * apenas quando realmente precisa de todos os campos)
- Paginação obrigatória em todas as listagens
- Subqueries evitadas quando JOIN resolve mais eficiente
- No frontend: evitar re-renders desnecessários (useCallback, useMemo onde fizer diferença real)
- Respostas da API enxutas — não carregar dados relacionados que o cliente não pediu

## Transações — Tudo ou Nada

**Regra absoluta:** Toda operação que envolva mais de um passo no banco (INSERT + INSERT, INSERT + UPDATE, etc.) DEVE usar transação com commit/rollback.

**Padrão obrigatório no Node.js/MySQL:**
```javascript
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  // ... todos os INSERTs/UPDATEs/DELETEs da operação
  await conn.commit();
  return sucesso(res, ...);
} catch (err) {
  await conn.rollback();
  return erroInterno(res, err);
} finally {
  conn.release();
}
```

## Banco de Dados — Apenas Repositório de Dados

**Regra absoluta:** O banco de dados NÃO deve conter nenhuma regra de negócio.  
**O que NUNCA colocar no banco:** `UNIQUE`, `ENUM`, `CHECK`, triggers com lógica, stored procedures com regras  
**O que É permitido:** `PRIMARY KEY`, `FOREIGN KEY`, `INDEX` simples, `NOT NULL` estrutural, tipos de dados adequados

## Datas e Crons — SEMPRE Fuso de Brasília (regra desde 12/06/2026)

**Problema:** o servidor (Ubuntu/Lightsail) roda em UTC. `new Date().toISOString()` retorna a data UTC —
após as 21h de Brasília já é "amanhã", e crons sem timezone disparam 3h adiantados.

**Como aplicar:**
- "Hoje" no backend: SEMPRE `hojeBrasilia()` de `utils/helpers.js` (aceita offset: `hojeBrasilia(1)` = amanhã)
- NUNCA `new Date().toISOString().split('T')[0]` para data de negócio
- Todo `cron.schedule` DEVE receber `{ timezone: 'America/Sao_Paulo' }` (em alertasService: constante `OPCOES_CRON`)
- O pool MySQL já está em `-03:00` (`CURDATE()`/`NOW()` do MySQL são consistentes com Brasília)

## Auditoria Dentro de Transação — Padrão (desde 12/06/2026)

`auditoria.registrar()` aceita um 7º parâmetro opcional `conn`:
- Com `conn`: o INSERT em logs_auditoria participa da transação do chamador — falha provoca rollback (tudo ou nada)
- Sem `conn`: comportamento tolerante antigo (loga erro, não derruba a operação)
- Em toda operação de escrita + auditoria: usar o padrão transacional com `conn`
- Referência do padrão: `tarefasController.js`, `periciasController.js`, `financeiroController.js`

## Limpeza de Memória — Sem Sujeira

**Regra absoluta:** Se abriu, fecha. Sem nada pendurado em memória.  
- Todo `useEffect` com listener deve ter cleanup
- Modais fechados devem ter estados resetados
- Conexões de banco sempre devolvidas ao pool

## Interface — Padrões Obrigatórios

- **Sem `window.confirm`** — usar sempre o componente `ModalConfirmar`
- **Botões padronizados** — seguir o estilo já estabelecido no projeto
- **Separador de tabela:** `border-bottom: 1px solid #9ca3af` (cinza médio visível)

## Deploy no Servidor — SEMPRE o Usuário, NUNCA Claude

**Regra absoluta:** O deploy para o servidor AWS é SEMPRE feito manualmente pelo usuário.  
**Why:** O usuário tem controle total do que vai para produção e quando.  
**How to apply:** Claude nunca deve sugerir fazer o deploy, nunca deve executar comandos de envio ao servidor, nunca deve mencionar "vou fazer o deploy" — apenas avisar o que precisa ser enviado e o usuário decide quando.

## Scripts de Deploy — Padrões

- Nunca usar `set -euo pipefail` — usar apenas `set -e` para evitar falhas silenciosas
- Sempre usar `export DEBIAN_FRONTEND=noninteractive` para suprimir telas interativas
- Sempre usar `export NEEDRESTART_MODE=a` para suprimir a tela roxa de restart de serviços
- Seeds com tratamento de erro tolerante: `if node seeds/run.js; then ok; else warn; fi`
- Scripts de instalação devem ser 100% silenciosos — zero interatividade com o usuário
