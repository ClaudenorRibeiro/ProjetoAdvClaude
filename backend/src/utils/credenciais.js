// ============================================================
// REGRAS DE CREDENCIAIS (login, senha e link de redefinição) — uma só cópia, usada por TODO o sistema.
// Tudo que chega da tela como "texto" precisa SER texto: um número, uma lista ou um `true` no lugar do texto pode confundir a
// comparação do banco (o MySQL compara texto com número pelo valor numérico do começo do texto) ou derrubar a rota com "Erro interno".
// ============================================================

// Link de redefinição de senha: exatamente o formato que o sistema gera (32 bytes em hexadecimal = 64 caracteres).
const FORMATO_TOKEN_RESET = /^[0-9a-f]{64}$/;
function tokenResetValido(token) {
  return typeof token === 'string' && FORMATO_TOKEN_RESET.test(token);
}

// Requisitos de senha — retorna a mensagem de erro, ou null se a senha serve.
function validarSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 8) return 'A senha deve ter no mínimo 8 caracteres';
  if (senha.length > 20)            return 'A senha deve ter no máximo 20 caracteres';
  if (!/[A-Z]/.test(senha))         return 'A senha deve conter pelo menos 1 letra maiúscula';
  if (!/[a-z]/.test(senha))         return 'A senha deve conter pelo menos 1 letra minúscula';
  if (!/[0-9]/.test(senha))         return 'A senha deve conter pelo menos 1 número';
  if (!/[^A-Za-z0-9]/.test(senha))  return 'A senha deve conter pelo menos 1 caractere especial';
  return null;
}

// Login de usuário novo: só letras (sem números, espaços ou símbolos) — regra do sistema. Retorna a mensagem de erro, ou null.
function validarLogin(login) {
  if (typeof login !== 'string' || !/^[A-Za-z]+$/.test(login.trim())) {
    return 'O login deve conter apenas letras (sem números, espaços ou símbolos).';
  }
  if (login.trim().length > 80) return 'O login deve ter no máximo 80 letras.';
  return null;
}

module.exports = { tokenResetValido, validarSenha, validarLogin };
