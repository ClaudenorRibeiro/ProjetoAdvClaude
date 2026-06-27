// ============================================================
// CARREGADOR DE BACKUP PARA O S3
// ------------------------------------------------------------
// Recebe o caminho de UM arquivo de backup já gerado localmente
// (ex.: backup_sistema_advocacia_2026-06-26_0200.sql.gz) e o envia
// para a "pasta" BackupBanco/ do MESMO bucket dos modelos .docx.
//
// REAPROVEITA o s3Service do sistema (mesma credencial IAM do .env):
// não há credencial nova nem configuração duplicada aqui.
//
// COMO É CHAMADO (pelo script de backup do servidor, via cron):
//   node src/scripts/uploadBackup.js /home/ubuntu/backups/<arquivo>.sql.gz
//
// A chave (caminho) no S3 é montada AQUI, sempre dentro de BackupBanco/,
// usando só o nome do arquivo — de propósito, para que este utilitário
// NUNCA consiga gravar fora da pasta de backups.
// ============================================================

const path = require('path');
const fs   = require('fs');

// Carrega o .env do backend (dois níveis acima: src/scripts -> backend/.env).
// override:true mantém o mesmo comportamento do server.js (o .env prevalece
// sobre valores antigos que o PM2 possa ter injetado no ambiente).
require('dotenv').config({ path: path.join(__dirname, '../../.env'), override: true });

const s3Service = require('../services/s3Service');

// Pasta (prefixo) onde TODO backup é gravado no bucket. Fixo de propósito.
const PREFIXO_BACKUP = 'BackupBanco/';
// Tipo de conteúdo de um .gz (ajuda a AWS/navegador a tratar o arquivo).
const CONTENT_TYPE_GZIP = 'application/gzip';

async function main() {
  // 1) Lê o caminho do arquivo local passado na linha de comando.
  const caminhoLocal = process.argv[2];
  if (!caminhoLocal) {
    console.error('ERRO: informe o caminho do arquivo de backup. Ex.: node uploadBackup.js /home/ubuntu/backups/arquivo.sql.gz');
    process.exit(1);
  }

  // 2) Confere que o arquivo existe e não está vazio (backup vazio = falha).
  if (!fs.existsSync(caminhoLocal)) {
    console.error(`ERRO: arquivo não encontrado: ${caminhoLocal}`);
    process.exit(1);
  }
  const tamanho = fs.statSync(caminhoLocal).size;
  if (tamanho === 0) {
    console.error(`ERRO: arquivo de backup está vazio (0 bytes): ${caminhoLocal}`);
    process.exit(1);
  }

  // 3) Monta a chave no S3: BackupBanco/<nome-do-arquivo>.
  //    path.basename garante que só o NOME do arquivo é usado (sem pastas locais).
  const nomeArquivo = path.basename(caminhoLocal);
  const chaveS3 = PREFIXO_BACKUP + nomeArquivo;

  // 4) Lê o arquivo e envia ao S3 reaproveitando o serviço já existente.
  const buffer = fs.readFileSync(caminhoLocal);
  await s3Service.enviarArquivo(chaveS3, buffer, CONTENT_TYPE_GZIP);

  // 5) Mensagem de sucesso (aparece no log do cron) com tamanho em MB.
  const tamanhoMB = (tamanho / (1024 * 1024)).toFixed(2);
  console.log(`OK: backup enviado para s3://${process.env.AWS_S3_BUCKET}/${chaveS3} (${tamanhoMB} MB)`);
}

// Executa e trata erro: qualquer falha sai com código 1 para o script de
// backup do servidor saber que NÃO deve considerar o backup concluído.
main().catch((err) => {
  console.error('ERRO ao enviar backup para o S3:', err.message);
  process.exit(1);
});
