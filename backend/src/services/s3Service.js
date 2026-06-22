// ============================================================
// SERVIÇO DE ARMAZENAMENTO S3
// ------------------------------------------------------------
// Guarda/recupera os arquivos .docx dos MODELOS de documento.
// O bucket é PRIVADO: o sistema acessa por credencial (usuário IAM)
// definida no .env e os arquivos NUNCA são públicos.
//
// Variáveis necessárias no .env do backend:
//   AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
// ============================================================

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.AWS_S3_BUCKET;

// Cria o cliente S3 uma única vez (reaproveitado em todas as chamadas).
// As credenciais vêm do .env; se não estiverem definidas, as chamadas falham
// com erro claro (ver garantirConfig()).
const client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Garante que o S3 está configurado antes de qualquer operação.
// Evita erro genérico e deixa claro o que falta no .env.
function garantirConfig() {
  if (!BUCKET || !process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('Armazenamento S3 não configurado. Defina AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY no .env.');
  }
}

// Envia um arquivo (buffer) para o S3 sob a chave informada.
async function enviarArquivo(key, buffer, contentType) {
  garantirConfig();
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return key;
}

// Baixa um arquivo do S3 e retorna o conteúdo como Buffer.
async function baixarArquivo(key) {
  garantirConfig();
  const resposta = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  // No SDK v3 (Node), Body é um stream com o helper transformToByteArray().
  const bytes = await resposta.Body.transformToByteArray();
  return Buffer.from(bytes);
}

// Remove um arquivo do S3.
async function excluirArquivo(key) {
  garantirConfig();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = { enviarArquivo, baixarArquivo, excluirArquivo };
