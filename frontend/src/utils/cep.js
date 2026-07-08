// ============================================================
// BUSCA DE ENDEREÇO POR CEP — via ViaCEP (API pública, gratuita, sem chave)
// Função compartilhada: recebe um CEP e devolve o endereço já normalizado.
// Uso: const r = await buscarEnderecoPorCep(cep);
//      if (r.ok) { ...preenche com r.endereco... } else { ...mostra r.motivo... }
// ============================================================

import { toTitleCase } from './formatters';

// Busca o endereço de um CEP na ViaCEP.
// Retorna sempre um objeto (nunca lança erro) para o chamador tratar de forma simples:
//   { ok: true,  endereco: { logradouro, bairro, cidade, uf } }
//   { ok: false, motivo: 'incompleto' | 'nao_encontrado' | 'erro' }
export async function buscarEnderecoPorCep(cep) {
  // Deixa só os dígitos — o CEP precisa ter exatamente 8
  const limpo = (cep || '').replace(/\D/g, '');
  if (limpo.length !== 8) return { ok: false, motivo: 'incompleto' };

  try {
    const resp = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
    const dados = await resp.json();

    // A ViaCEP responde { erro: true } quando o CEP não existe
    if (dados.erro) return { ok: false, motivo: 'nao_encontrado' };

    // A ViaCEP costuma devolver os textos em maiúsculas → aplica Title Case.
    // "localidade" é a cidade; "uf" fica em maiúsculas.
    return {
      ok: true,
      endereco: {
        logradouro: toTitleCase(dados.logradouro || ''),
        bairro:     toTitleCase(dados.bairro     || ''),
        cidade:     toTitleCase(dados.localidade || ''),
        uf:         (dados.uf || '').toUpperCase(),
      },
    };
  } catch {
    // Falha de rede / API fora do ar
    return { ok: false, motivo: 'erro' };
  }
}
