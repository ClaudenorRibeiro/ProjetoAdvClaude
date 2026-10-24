// ============================================================
// O E-MAIL DO RESUMO DE ANDAMENTOS. Todo texto que veio do cadastro ou do CNJ passa por escaparHtml.
// ============================================================
const { escaparHtml } = require('../services/notificacaoService');
const { formatarNumeroPasta } = require('../utils/helpers');

const LIMITE_DE_PROCESSOS_NO_EMAIL = 30;
const LIMITE_DE_ANDAMENTOS_POR_PROCESSO = 3;

const dataBr = (iso) => String(iso).split('-').reverse().join('/');

function assuntoDoResumo(total) {
  return total === 1 ? 'Andamentos novos em 1 processo' : `Andamentos novos em ${total} processos`;
}

function mensagemDoSino(total) {
  return total === 1
    ? '1 processo com andamentos novos. Veja em Novidades dos processos.'
    : `${total} processos com andamentos novos. Veja em Novidades dos processos.`;
}

// novidades = [{ numPasta, numero, titulo, andamentos: [{ data, descricao }] }]
function htmlDoResumo(novidades, escritorio) {
  const mostrados = novidades.slice(0, LIMITE_DE_PROCESSOS_NO_EMAIL);
  const linhas = mostrados.map((n) => {
    const itens = n.andamentos.slice(0, LIMITE_DE_ANDAMENTOS_POR_PROCESSO)
      .map((a) => `<li>${escaparHtml(dataBr(a.data))} — ${escaparHtml(a.descricao)}</li>`).join('');
    const resto = n.andamentos.length - LIMITE_DE_ANDAMENTOS_POR_PROCESSO;
    return `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top">
        <strong>Pasta ${escaparHtml(formatarNumeroPasta(n.numPasta))}</strong> · ${escaparHtml(n.numero || 'sem número')}<br>
        ${escaparHtml(n.titulo || '')}
        <ul style="margin:6px 0 0;padding-left:18px">${itens}${resto > 0 ? `<li>e mais ${resto}</li>` : ''}</ul>
      </td></tr>`;
  }).join('');
  const faltam = novidades.length - mostrados.length;
  return `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <div style="background:#1a56db;padding:20px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">📚 Andamentos novos</h1>
      <p style="color:#fff;margin:8px 0 0;font-size:14px">${escaparHtml(escritorio || 'Sistema de Advocacia')}</p>
    </div>
    <div style="padding:24px">
      <p>${escaparHtml(assuntoDoResumo(novidades.length))}:</p>
      <table style="width:100%;border-collapse:collapse"><tbody>${linhas}</tbody></table>
      ${faltam > 0 ? `<p>e mais ${faltam} processo(s). Veja todos em <strong>Novidades dos processos</strong>.</p>` : ''}
    </div>
  </div>`;
}

module.exports = { assuntoDoResumo, mensagemDoSino, htmlDoResumo, LIMITE_DE_PROCESSOS_NO_EMAIL };
