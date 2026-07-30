// ============================================================
// SERVIÇO DE ENVIO DE SMS (Comtele — API V4 / Painel Novo)
// ------------------------------------------------------------
// Contrato oficial (developers.comtele.com.br):
//   POST https://api.comtele.com.br/messages/sms/send
//   header: x-api-key: <chave>  |  Content-Type: application/json
//   body JSON: {
//     receivers: string[]  (55 + DDD + número, ex.: "5516988887777"),
//     contactGroups: number[],
//     message: string,
//     route: string        (ROTA de envio — específica da conta do escritório),
//     tag: string, custom: string,
//     scheduleDate: string|null  (null = envio imediato)
//   }
//   resposta: { hasError: bool, message, totalRecords, errors, object }
//
// A chave (api_key) e a rota (route) ficam em configuracoes_integracoes
// (modulo='comtele'), NUNCA no código nem no .env. O controller lê a config
// e passa para cá — mesmo padrão do aaspService.
// ============================================================

const axios = require('axios');

const URL_COMTELE = 'https://api.comtele.com.br/messages/sms/send';

// Normaliza o telefone para o formato exigido pela Comtele V4: 55 + DDD + número.
// Lança erro amigável se o número não tiver DDD (8/9 dígitos = só o número local).
function normalizarNumeroSMS(numero) {
  let d = String(numero || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2); // remove 55 se já veio (padroniza)
  if (d.length !== 10 && d.length !== 11) {
    throw new Error('Telefone sem DDD (ou inválido). Complete o cadastro com DDD para enviar SMS.');
  }
  return '55' + d; // a API V4 exige 55 + DDD + número
}

// Envia 1 SMS. api_key é obrigatória. A route (rota) é específica da conta —
// se não for informada, é omitida do corpo (a Comtele usa a rota padrão, se houver;
// se exigir rota, ela retorna erro e a mensagem nos guia).
// Lança erro com mensagem clara em caso de falha.
async function enviarSMS(apiKey, numero, mensagem, route = '') {
  if (!apiKey) throw new Error('SMS não configurado (chave da Comtele ausente).');
  const conteudo = String(mensagem || '').trim();
  if (!conteudo) throw new Error('A mensagem do SMS está vazia.');
  const receiver = normalizarNumeroSMS(numero);

  const body = {
    receivers: [receiver],
    contactGroups: [],
    message: conteudo,
    tag: 'NovoJud',
    custom: '',
    scheduleDate: null,
  };
  // Só inclui a rota se o escritório tiver preenchido (senão deixa a Comtele decidir).
  if (route) body.route = String(route);

  let resp;
  try {
    resp = await axios.post(URL_COMTELE, body, {
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      timeout: 30000,
    });
  } catch (e) {
    // Quando a Comtele responde com erro HTTP (ex.: 400), o motivo real vem no corpo
    // (message / errors). Repassamos esse texto para saber exatamente o que corrigir.
    if (e.response) {
      const d = e.response.data || {};
      const motivo = d.message
        || (Array.isArray(d.errors) ? d.errors.join('; ')
            : (d.errors ? JSON.stringify(d.errors) : ''))
        || (typeof d === 'string' ? d : JSON.stringify(d));
      throw new Error(`Falha ao enviar SMS pela Comtele (HTTP ${e.response.status})${motivo ? ': ' + motivo : ''}`);
    }
    throw new Error('Falha ao enviar SMS pela Comtele (' + (e.code || e.message) + ')');
  }

  const dados = resp.data || {};
  if (dados.hasError) {
    const msgErro = dados.message
      || (Array.isArray(dados.errors) ? dados.errors.join('; ') : (dados.errors ? JSON.stringify(dados.errors) : ''))
      || 'A Comtele recusou o envio do SMS.';
    throw new Error(msgErro);
  }
  return { ok: true };
}

module.exports = { enviarSMS, normalizarNumeroSMS };
