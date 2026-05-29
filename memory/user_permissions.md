---
name: user-permissions
description: "Hierarquia de usuários, perfis e permissões granulares do sistema"
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Hierarquia de Usuários

| Nível | Perfil | Acesso |
|-------|--------|--------|
| 👑 Nível 0 | Superusuário (dono) | Acesso total, **invisível para todos** |
| 🔧 Nível 1 | Administrador | Gerencia todos exceto o superusuário |
| 👤 Nível 2 | Demais usuários | Permissões definidas pelo admin |

## Regras Importantes

- Permissões granulares por usuário em cada módulo: cadastrar, alterar, excluir, visualizar
- Visibilidade de processos configurável por usuário — vê só os seus ou vê de todos
- **Superusuário não aparece na listagem de usuários para ninguém — em nenhuma tela, em nenhum log visível**
- **Superusuário pode logar em qualquer instância e fazer ou desfazer qualquer coisa no sistema**
- **Superusuário é o dono do sistema (Claudio) — credenciais definidas diretamente no banco/código, nunca expostas na interface**
- Tipos de usuário: advogados, estagiários, secretários, sócios, administradores

## Sub-módulos de Permissão (implementado 29/05/2026)

Módulo **Processos** tem sub-itens configuráveis individualmente:
- `processos.andamentos` — Andamentos processuais
- `processos.prazos` — Prazos dentro do processo
- `processos.tarefas` — Tarefas dentro do processo
- `processos.audiencias` — Audiências dentro do processo
- `processos.pericias` — Perícias dentro do processo

**Estrutura no banco:** tabela `permissoes` tem coluna `submodulo VARCHAR(50) NULL`  
**Chave composta:** `processos.andamentos` → `modulo='processos', submodulo='andamentos'`  
**Middleware:** `verificarPermissao('processos','andamentos','excluir')` — 3 parâmetros  
**Frontend:** Tela de Permissões tem accordion — clica em Processos para expandir sub-itens  
**Ao carregar:** todos os módulos e sub-módulos são pré-populados com `false` como padrão — garante que o save sempre grava registros explícitos no banco  
**Comparação:** usa `Number(rows[0].permitido) !== 1` e `Number(req.usuario.nivel) <= 1` (type-safe contra variações do MySQL2)

**Relacionado:** [[project-overview]]
