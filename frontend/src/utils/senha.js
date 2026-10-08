// Regras de senha do sistema — a MESMA conferência do servidor (backend/src/utils/credenciais.js).
// Usada nas telas de usuário (Configurações) e de redefinição de senha (link do e-mail).

// Devolve a mensagem de erro, ou null se a senha é válida.
export function validarSenha(senha) {
  if (!senha || senha.length < 8)   return 'A senha deve ter no mínimo 8 caracteres';
  if (senha.length > 20)            return 'A senha deve ter no máximo 20 caracteres';
  if (!/[A-Z]/.test(senha))         return 'A senha deve conter pelo menos 1 letra maiúscula';
  if (!/[a-z]/.test(senha))         return 'A senha deve conter pelo menos 1 letra minúscula';
  if (!/[0-9]/.test(senha))         return 'A senha deve conter pelo menos 1 número';
  if (!/[^A-Za-z0-9]/.test(senha))  return 'A senha deve conter pelo menos 1 caractere especial';
  return null;
}

export const DICA_SENHA = 'Entre 8 e 20 caracteres, com letra maiúscula, minúscula, número e caractere especial.';
