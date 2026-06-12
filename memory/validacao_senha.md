---
name: validacao-senha
description: Regras e implementação de validação de senha forte em todo o sistema
metadata: 
  node_type: memory
  type: project
  originSessionId: a17aec30-7d20-496a-81a0-792eca6b27e8
---

## Regras de Senha (definidas em 11/06/2026)

| Critério | Valor |
|----------|-------|
| Mínimo de caracteres | 8 |
| Máximo de caracteres | 20 |
| Letra maiúscula | obrigatória (pelo menos 1) |
| Letra minúscula | obrigatória (pelo menos 1) |
| Número | obrigatório (pelo menos 1) |
| Caractere especial | obrigatório (pelo menos 1) |

## Onde está implementado

### Backend — authController.js
```javascript
function validarSenha(senha) {
  if (!senha || senha.length < 8)   return 'A senha deve ter no mínimo 8 caracteres';
  if (senha.length > 20)            return 'A senha deve ter no máximo 20 caracteres';
  if (!/[A-Z]/.test(senha))         return 'A senha deve conter pelo menos 1 letra maiúscula';
  if (!/[a-z]/.test(senha))         return 'A senha deve conter pelo menos 1 letra minúscula';
  if (!/[0-9]/.test(senha))         return 'A senha deve conter pelo menos 1 número';
  if (!/[^A-Za-z0-9]/.test(senha))  return 'A senha deve conter pelo menos 1 caractere especial';
  return null;
}
```
Usada em: `criarPrimeiroAdmin`, `redefinirSenha`, `trocarSenha`

### Backend — configuracaoController.js
Mesma função `validarSenha()` duplicada localmente.
Usada em: `criarUsuario`, `atualizarUsuario` (quando senha presente), `redefinirSenhaAdmin`

### Frontend — Configuracoes.js
```javascript
const DICA_SENHA = 'Mínimo 8, máximo 20 caracteres. Deve conter: maiúscula, minúscula, número e caractere especial.';

function validarSenha(senha) { /* mesma lógica */ }
```
Usada em: `ModalUsuario` (criar/editar), `ModalRedefinirSenha`
- Dica exibida abaixo do campo de senha
- Campo senha com `autocomplete="new-password"`

## Verificação da Senha do Usuário Logado

Separada da validação de formato — serve para **confirmar identidade** em operações sensíveis.

### Rota
```
POST /api/auth/verificar-senha
Header: Authorization Bearer {token}
Body: { senha: "..." }
```

### Backend — authController.verificarSenha()
- Busca `senha_hash` do usuário logado via `req.usuario.id`
- `bcrypt.compare(senha, hash)` → se incorreta: retorna 401
- Se correta: retorna 200

### Frontend — authAPI.verificarSenha()
```javascript
authAPI.verificarSenha: (dados) => api.post('/auth/verificar-senha', dados)
```

### Uso atual
- `ModalConfirmarSenhaDiaUtil` em `Audiencias.js` — confirmar cadastro de audiência em dia não útil

## Importante: Senhas Não São Reveladas
- Superusuário (nivel=0) também deve usar senha forte
- O sistema **nunca revela a senha** — só verifica via bcrypt.compare
- Mensagem genérica no login: "Login ou senha incorretos" (não revela qual está errado)

**Relacionado:** [[user-permissions]], [[configuracoes-escritorio]], [[audiencias]]
