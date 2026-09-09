# Análise do banco — redundância e uso no código (09/09/2026)

Varredura **somente leitura** (grep no back + front). Nada foi alterado. Base: `estrutura_banco.sql` (82 tabelas) vs `backend/src` e `frontend/src`.

> ⚠️ Limite do método: "aparece no código" ≠ "a tela existe / o fluxo é alcançável". É uma passada estática, não um teste de cada funcionalidade.

---

## Veredito

O banco está **enxuto**. Das 82 tabelas, **80 estão em uso real**. Não há um monte de tabela/coluna
sobrando. O que existe é:

- **1 tabela 100% morta** (`controle_versao_banco`)
- **1 tabela só-escrita** (`log_publicacoes` — grava e ninguém lê)
- **2 colunas meia-bomba** (`usuarios.notif_email` / `notif_tela`)
- **Redundância estrutural de projeto** (padrão PF/PJ e "vínculo de pessoa" repetidos em N tabelas quase iguais) — funciona, é intencional, mas é a única "gordura" de verdade
- **2 sistemas de auditoria** convivendo

Nada disso está perdendo dado. São itens de limpeza/consistência.

---

## 1. Tabela morta — pode remover

### `controle_versao_banco`
Zero referências em back, front, scripts e deploy. Vazia nas 3 instâncias (já registrado na memória em 31/08). Era um controle de "versão do banco por bloco" que nunca foi usado.

**Ação:** `DROP TABLE controle_versao_banco;` (SQL reaplicável, rodar local → testar → 2 AWS).

---

## 2. Tabela só-escrita — decidir

### `log_publicacoes`
`INSERT` em 2 pontos do `publicacoesController` (na importação de publicações, grava `usuario_id, quantidade, data_publicacao`). **Nenhum `SELECT` em lugar nenhum.** Nenhuma tela ou relatório lê. Cresce para sempre sem servir a nada.

**Ação (escolher):** (a) construir o relatório "quantas publicações cada um importou" que essa tabela claramente foi feita para alimentar; ou (b) parar de gravar e `DROP TABLE`.

---

## 3. Colunas meia-implementadas — `usuarios`

### `usuarios.notif_email` e `usuarios.notif_tela`
Lidas em **um único** caminho: `prazosController` ao delegar um prazo (decide se manda sino/e-mail para o delegado). **Não há tela para o usuário ligar/desligar** (o front nunca toca nessas colunas) e o app nunca as grava — ficam eternamente no default para todo mundo.

**Ação (escolher):** (a) criar o controle no perfil do usuário e passar a respeitar essas flags em todas as notificações (sino, e-mail, alertas); ou (b) remover as 2 colunas e deixar a regra fixa no código.

---

## 4. Redundância estrutural (intencional, mas é a real "gordura")

Não recomendo mexer agora num sistema em produção — o ganho é de elegância, o risco de refatorar é alto. Fica registrado para decisão consciente.

### 4a. "Vínculo de pessoa polimórfico" repetido em 4 tabelas quase idênticas
`tbltituloprocautor`, `tbltituloprocreu`, `processo_perito`, `pericia_local_reu` — todas com a mesma
forma: `(id, <ref>_id, tipo_pessoa, pessoa_id, criado_por, criado_em)`. Poderiam ser **1 tabela**
`vinculo_pessoa(contexto, ref_id, papel, tipo_pessoa, pessoa_id, …)`.
- **Inconsistência concreta:** `processo_perito.tipo_pessoa` é `varchar(20)`; nas outras é `enum('fisica','juridica')`. Se um dia mexer nessa área, padronize para `enum`.

### 4b. Split PF/PJ em pares de tabelas idênticas
`telefones_pf`+`telefones_pj`, `emails_pf`+`emails_pj`,
`pessoas_fisicas_etiquetas_escritorio`+`pessoas_juridicas_etiquetas_escritorio`.
Cada par é igual a menos de um valor `DEFAULT`. É a escolha de modelagem que atravessa o sistema
inteiro (pessoa física e jurídica quase nunca compartilham tabela). Unificar mexeria em dezenas de queries.

### 4c. 6 tabelas `*_etiquetas` (pessoais), uma por módulo
`pastas_etiquetas`, `publicacoes_etiquetas`, `prazos_etiquetas`, `tarefas_etiquetas`,
`audiencias_etiquetas`, `pericias_etiquetas` — mesma estrutura, separadas por módulo. Idem 3 de escritório
(`processos_/pessoas_fisicas_/pessoas_juridicas_etiquetas_escritorio`). Tudo ligado à feature de etiquetas
e em uso — só é muita tabela para um recurso só.

---

## 5. Dois sistemas de auditoria convivendo

- **Genérico:** `logs_auditoria` (via `middleware/auditoria`) — usado por processos, pessoas, tarefas,
  configurações, e pelo recurso novo de hoje (etiqueta → status). Guarda um JSON antes/depois.
- **Dedicado:** `auditoria_audiencia`, `auditoria_pericia`, `auditoria_prazo`,
  `auditoria_conta_corrente`, `auditoria_parcela` — 5 tabelas campo-a-campo, cada uma com tela de
  histórico própria. Todas escritas **e** lidas.

Não é tabela sobrando (as 6 estão ativas), mas é **inconsistência de padrão**: alguns módulos têm
histórico rico por campo, outros só o log genérico. Sugestão: definir 1 direção para daqui pra frente
(o genérico já é o que o trabalho recente usa).

---

## 6. Config a confirmar (não é bug)

`configuracoes_escritorio.dias_sem_movimentacao` (default 30) **e** `dias_processo_parado` (default 365)
— conceitos parecidos ("processo parado há X dias"). Ambos são lidos no código. Confirme que são
2 recursos distintos mesmo (alerta de movimentação × cartão "Processos Parados") e não uma sobra.

Fora isso: **todas** as colunas de `configuracoes_escritorio`, `tblproc`, `tblpasta`, `prazos_processo`
e `usuarios` (fora as 2 do item 3) têm uso real no código.

---

## Resumo de ações sugeridas (menor → maior risco)

| # | Ação | Risco | SQL |
|---|------|-------|-----|
| 1 | `DROP TABLE controle_versao_banco` | ~nulo | 1 linha, reaplicável, 3 instâncias |
| 2 | `log_publicacoes`: fazer o relatório **ou** parar de gravar + drop | baixo | depende da escolha |
| 3 | `notif_email`/`notif_tela`: criar tela + respeitar em tudo **ou** remover as colunas | baixo | depende da escolha |
| 4 | Padronizar `processo_perito.tipo_pessoa` para `enum` (só se for mexer na área) | baixo | `ALTER` 1 coluna |
| 5 | Escolher 1 padrão de auditoria para novos módulos | nulo (decisão) | — |
| 6 | (grande, **não recomendado agora**) unificar tabelas PF/PJ e vínculo-de-pessoa | alto | refatoração ampla |
