// ============================================================
// SERVIÇO DE CONVERSÃO .docx -> PDF (via LibreOffice headless)
// ------------------------------------------------------------
// Converte o .docx preenchido em PDF FIEL ao Word (com timbre/logo,
// fontes e diagramação), usando o LibreOffice em modo headless.
//
// Requisito: LibreOffice instalado.
//   - Windows (teste local): instalar de https://libreoffice.org/download
//   - Servidor (Ubuntu/Lightsail): sudo apt install libreoffice-writer
//   - Opcional: definir LIBREOFFICE_PATH no .env apontando para o binário soffice.
//
// DESEMPENHO: usamos um PERFIL persistente compartilhado (criado uma vez e
// reaproveitado) — isso torna as conversões seguintes bem mais rápidas do que
// criar um perfil novo a cada vez. Para evitar conflito de perfil, as conversões
// são SERIALIZADAS (uma por vez) por uma fila interna. Isso atende bem a geração
// em lote (ex.: dezenas de cartas), processando-as em sequência com o perfil quente.
// ============================================================

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Perfil persistente do LibreOffice (UserInstallation) reaproveitado entre conversões.
const PROFILE_DIR = path.join(os.tmpdir(), 'advdoc-loffice-profile');
const PROFILE_URI = 'file:///' + PROFILE_DIR.replace(/\\/g, '/');

// Fila para serializar as conversões (um soffice por vez com o perfil compartilhado).
let fila = Promise.resolve();

// Caminho do soffice resolvido uma única vez (cacheado).
let sofficeCache;

// Descobre o binário do LibreOffice (soffice). Ordem: .env -> locais comuns -> PATH.
function encontrarSoffice() {
  if (sofficeCache !== undefined) return sofficeCache;

  if (process.env.LIBREOFFICE_PATH) {
    sofficeCache = process.env.LIBREOFFICE_PATH;
    return sofficeCache;
  }

  if (process.platform === 'win32') {
    const candidatos = [
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    ];
    sofficeCache = candidatos.find(c => { try { return fs.existsSync(c); } catch { return false; } }) || null;
    return sofficeCache;
  }

  // Linux/Mac: tenta caminhos comuns e, por fim, confia no PATH.
  const candidatos = ['/usr/bin/soffice', '/usr/bin/libreoffice', '/opt/libreoffice/program/soffice'];
  sofficeCache = candidatos.find(c => { try { return fs.existsSync(c); } catch { return false; } }) || 'soffice';
  return sofficeCache;
}

// Faz UMA conversão (chamada pela fila). Usa o perfil compartilhado e uma pasta
// de trabalho temporária só para os arquivos desta conversão.
async function converterUm(docxBuffer) {
  const soffice = encontrarSoffice();
  if (!soffice) {
    throw new Error('LibreOffice não encontrado. Instale o LibreOffice ou defina LIBREOFFICE_PATH no .env.');
  }

  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const work = path.join(os.tmpdir(), 'advdoc-' + crypto.randomUUID());
  fs.mkdirSync(work, { recursive: true });
  const docxPath = path.join(work, 'documento.docx');
  fs.writeFileSync(docxPath, docxBuffer);

  const args = [
    '--headless', '--norestore', '--nolockcheck',
    `-env:UserInstallation=${PROFILE_URI}`,
    '--convert-to', 'pdf:writer_pdf_Export',
    '--outdir', work,
    docxPath,
  ];

  try {
    await new Promise((resolve, reject) => {
      execFile(soffice, args, { timeout: 90000, windowsHide: true }, (err, stdout, stderr) => {
        if (err) {
          if (err.code === 'ENOENT') {
            return reject(new Error('LibreOffice não encontrado. Instale-o ou ajuste LIBREOFFICE_PATH no .env.'));
          }
          return reject(new Error('LibreOffice falhou ao converter: ' + (stderr || err.message || '').toString().trim()));
        }
        resolve();
      });
    });

    const pdfPath = path.join(work, 'documento.pdf');
    if (!fs.existsSync(pdfPath)) {
      throw new Error('A conversão não gerou o PDF (verifique a instalação do LibreOffice).');
    }
    return fs.readFileSync(pdfPath);
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* ignora */ }
  }
}

// Converte um Buffer .docx em um Buffer PDF. Entra na fila (serializado).
function docxParaPdf(docxBuffer) {
  const tarefa = fila.then(() => converterUm(docxBuffer));
  // A fila precisa continuar mesmo se uma conversão falhar.
  fila = tarefa.catch(() => {});
  return tarefa;
}

module.exports = { docxParaPdf };
