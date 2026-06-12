---
name: agenda-calendario
description: Módulo de agenda e calendário — tela inicial do dia e navegação por datas
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Bloco 13 — Agenda / Calendário

## Tela Inicial ao Logar

- Primeira tela que o usuário vê ao entrar no sistema
- Exibe de forma explícita e destacada todos os eventos do dia atual:
  - Prazos do dia
  - Tarefas do dia
  - Audiências do dia
- Padrão: eventos do próprio usuário logado
- Com permissão: pode visualizar eventos de outros usuários ou do escritório (sem usuário definido)

## Calendário

- Visões disponíveis: **Dia, Semana e Mês**
- Padrão: eventos do usuário logado
- Filtros: por usuário (com permissão), por tipo (audiência / prazo / tarefa)
- Clicar num evento → abre diretamente o processo/prazo/audiência relacionado (navegação direta)
- Clicar numa data vazia → permite cadastrar prazo ou tarefa diretamente pelo calendário
- ❌ Sem impressão ou exportação (Google Calendar, Outlook, etc.)

## Filtro por Usuário e Modo Escritório (implementado 11/06/2026)

### Comportamento padrão
- Ao entrar na Agenda, mostra **somente os eventos do usuário logado**
- Título exibido acima dos filtros: nome do usuário logado (ex: `"Claudio"`)

### Checkbox "Escritório"
- Aparece ao lado dos demais checkboxes de tipo (Audiências, Prazos, Tarefas)
- Ao marcar → mostra eventos de **todos os usuários do escritório**
- Ao marcar → título muda para `"Escritório"`
- Ao desmarcar → volta a mostrar apenas os eventos do usuário logado, título volta ao nome

### Implementação técnica (Agenda.js)
```javascript
const { usuario } = useAuth();
const [filtros, setFiltros] = useState({ ..., escritorio: false });

const titulo   = filtros.escritorio ? 'Escritório' : (usuario?.nome || '');
const usuarioId = filtros.escritorio ? null : usuario?.id;

// Cada chamada de API recebe o filtro quando aplicável:
audienciasAPI.listar({ ..., responsavel_id: usuarioId || undefined })
prazosAPI.listar({ ..., usuario_id: usuarioId || undefined })
tarefasAPI.listar({ ..., usuario_id: usuarioId || undefined })
periciasAPI.listar({ ..., assistente_id: usuarioId || undefined })
```

### Filtros nas APIs de backend
- `audienciasController.listar()` aceita `responsavel_id`
- `periciasController.listar()` aceita `assistente_id`
- `prazosController.listar()` e `tarefasController.listar()` já aceitavam `usuario_id`

## Permissões

- Usuário vê somente seus próprios eventos por padrão
- Com permissão habilitada: visualiza eventos de usuários específicos ou de todo o escritório

**Relacionado:** [[prazos]], [[tarefas]], [[audiencias]], [[pericias]], [[user-permissions]]
