---
name: documentos-modelos
description: Módulo de geração de documentos a partir de modelos com variáveis automáticas
metadata: 
  node_type: memory
  type: project
  originSessionId: c7321425-eb43-40e0-b57f-c2941c1276c6
---

## Bloco 11 — Documentos e Modelos

## 🆕 09/07/2026 — Variável NACIONALIDADE agora com dado real + regra "Partes vs Comum"
- `{{nacionalidade}}` (modelo tipo **Documento de partes**, dentro de `{{#autores}}`/`{{#reus}}`) e
  `{{nacionalidade_cliente}}` (modelo **comum**) ANTES saíam SEMPRE vazias (era "Fase 4" nunca feita). Agora puxam
  o valor real do novo campo de nacionalidade (via LEFT JOIN na tabela `nacionalidade` em `variaveisResolver.js`).
  Empresa/PJ continua sem nacionalidade (correto). ⚠️ Depende do SQL da nacionalidade ter rodado — ver [[cadastro-pessoas]].
- **REGRA que confunde o usuário (dois tipos de modelo têm nomes de variável diferentes):**
  - Modelo **COMUM** (um cliente/processo): tags de pessoa TÊM sufixo `_cliente` → `{{nome_cliente}}`, `{{cpf_cliente}}`,
    `{{nacionalidade_cliente}}`, `{{endereco_cliente}}`, etc.
  - Modelo **"Documento de partes"** (autores/réus): tags de pessoa SEM sufixo → `{{nome}}`, `{{cpf}}`,
    `{{nacionalidade}}`, `{{endereco}}`, e ficam DENTRO de `{{#autores}}`/`{{#reus}}`.
  - Usar a tag errada para o tipo de modelo gera o AVISO amarelo "variáveis não reconhecidas (ficarão vazias)" ao
    subir o .docx — é AVISO, não erro; o modelo salva, mas aquelas variáveis saem em branco.
- E-mails/telefones do autor: só no modelo de PARTES. E-mail principal = `{{email}}`; TODOS = `{{#emails}}{{email}}{{/emails}}`
  (sub-região) dentro de `{{#autores}}`. Telefones idem com `{{#telefones}}{{numero}} ({{tipo}}){{/telefones}}`.
- `{{data_hoje}}` (bloco Escritório) já existe e sai POR EXTENSO ("9 de julho de 2026" — dia sem zero, mês minúsculo).
  Usuário achou o formato e decidiu deixar como está (não quis "09 de Julho").


## 🆕 22/06/2026 — Bucket S3 de TESTE separado da produção
- Os modelos `.docx` ficam num bucket S3 privado, definido por `AWS_S3_BUCKET` no `.env` (nada fixo no código).
- **LOCAL agora usa `modelos-antonio-adv-dev`** (bucket de teste) + usuário IAM próprio `modelos-antonio-adv-dev`
  (policy `AcessoModelosAntonioDev`, restrita só a esse bucket). **PRODUÇÃO usa `modelos-antonio-adv`** + usuário
  `modelos-s3-antonio-adv` (credenciais no `.env` do servidor). Trocar de bucket = só trocar o `.env`, sem código.
- ⚠️ Como o LOCAL apontava para o bucket de PRODUÇÃO até 22/06, a produção acumulou modelos órfãos. Limpeza: manter
  só os arquivos referenciados em `modelo_documento.arquivo_s3_key`; apagar o resto (ver RESUMO_SESSAO_22-06-2026.txt).
- Lembrete: nomes de tabela sempre minúsculos (`modelo_documento`, `log_documentos_gerados`). Ver [[feedback-codigo]].

## Formato

- Gera **Word (.docx)** editável
- Gera **PDF** para exportação
- Usuário escolhe o formato na hora de gerar

## Modelos

- Cadastrados e configurados pelo admin (ou usuário com permissão)
- Contêm variáveis automáticas que o sistema preenche ao gerar:
  - `{{nome_cliente}}`, `{{cpf_cliente}}`, `{{endereco_cliente}}`
  - `{{numero_processo}}`, `{{vara}}`, `{{forum}}`
  - `{{data_hoje}}`, `{{nome_advogado}}`
  - (outras variáveis definidas pelo admin)
- Modelos iniciais: Contrato de honorários, Procuração, Petição inicial, Recurso, Notificação extrajudicial
- Admin pode criar quantos modelos quiser

## Vinculação

- O **documento GERADO não é salvo** no servidor — usuário baixa e gerencia localmente (vai p/ Downloads)
- Salvo apenas o **log da geração:** qual modelo, qual processo/pasta, quem gerou, data e hora (`log_documentos_gerados`)
- ⚠️ Os **MODELOS .docx** SÃO armazenados (ver reforma S3 abaixo) — isto MUDOU em relação à versão antiga desta memória.

## Tabelas do Banco

- `modelo_documento` — modelos cadastrados com variáveis
- `log_documentos_gerados` — registro de geração (modelo, processo, usuário, data/hora). **Paginado (50/pág)** no histórico desde 20/06; tem índice em gerado_em.

## ⚠️ DESATUALIZAÇÃO desta memória — ver reformas recentes (20/06 + reforma S3)

Esta memória é antiga. Mudanças relevantes que já estão no código LOCAL:

### RECIBOS (20/06/2026) — recibo é um MODELO de documento normal
- Modelo cadastrado com destino "Recibo: Cliente" ou "Recibo: Parceria". Âncora `'pagamento'`.
- `variaveisResolver.resolverPagamento(parcelaId, {tipoRecibo})`: valor_pago = líquido (recibo cliente) OU parceria
  (recibo parceiro), derivado do DESTINO do modelo. NOVO `utils/extenso.js` (valor por extenso pt-BR).
- `config/variaveisDocumento.js` ganhou tags de pagamento (valor_parceria, forma_repasse, forma_recebimento,
  identificacao_recebimento, forma_pagamento, identificacao_pagamento). `GerarDocumento.js` ganhou prop `beneficiario`. Ver [[financeiro]].
- Bug corrigido antes (12/06): `pf.endereco` inexistente → CONCAT_WS dos campos reais (PF e PJ); `{{endereco_cliente}}` agora preenchido.

### ⚠️ REFORMA S3 + docx + PDF (NÃO confirmada com o usuário ainda — só observada nos arquivos)
Arquivos NOVOS não rastreados no git: `services/s3Service.js` (modelos .docx num bucket S3 PRIVADO, acesso por
credencial IAM no .env, nunca público), `services/docxModeloService.js` (geração do .docx a partir do modelo),
`services/pdfConvertService.js` (conversão .docx→PDF via LibreOffice/soffice). `.env.example` ganhou `AWS_S3_BUCKET`
e `LIBREOFFICE_PATH`. Novo `GUIA_S3_NOVO_CLIENTE.txt` (passo a passo: 1 cliente = 1 bucket privado + 1 usuário IAM).
Deploy exige instalar LibreOffice no servidor e manter AWS_* no .env. ⚠️ CONFIRMAR estado/decisões com o usuário e detalhar aqui.

### "DOCUMENTO DE PARTES" (multipessoas) — feature NOVA 21/06/2026 (sem SQL)
Modelos que usam VÁRIOS autores × VÁRIOS réus (procuração, contrato de honorários, declaração,
entrevista), todos já cadastrados, SEM precisar de processo/número.
- Novo `destino = 'multipessoas'` em modelo_documento (opção "Documento de partes (autores e réus)").
- No .docx, REGIÕES que se repetem (motor docxtemplater, já instalado):
  `{{#autores}} ...campos da pessoa... {{/autores}}` e `{{#reus}} ... {{/reus}}` — repete por pessoa.
- Variáveis por pessoa (dentro das regiões): nome, nome_fantasia, documento, cpf, cnpj, rg, rg_orgao,
  pis, ctps, nacionalidade, estado_civil, profissao, genero, data_nascimento, nome_mae, nome_pai,
  representante_legal, inscricao_estadual, telefone, telefone_tipo, email, endereco (+cep/logradouro/
  numero/complemento/bairro/cidade/estado). Listas que repetem: `{{#telefones}}{{numero}} – {{tipo}}{{/telefones}}`
  e `{{#emails}}{{email}}{{/emails}}` (só ativos, principal primeiro).
- GERAÇÃO: botão **"Gerar documento de partes" na TELA DE PESSOAS** → modal de 2 lados
  (AUTOR(es) à ESQUERDA, RÉU(s) à DIREITA), busca pessoas cadastradas (PF/PJ), impede repetir a mesma
  pessoa, gera .docx/PDF, registra no histórico (ancora_tipo='multipessoas', sem ancora_id).
- Ajuda na tela de Documentos: bloco "Variáveis do Documento de partes" com marcadores de região e
  variáveis — todos COPIÁVEIS ao clicar.
- Arquivos: backend `config/variaveisDocumento.js` (CATALOGO_PARTE/TAGS_PARTE), `services/docxModeloService.js`
  (analisarMultipessoas), `services/variaveisResolver.js` (resolverMultipessoas/carregarParte),
  `controllers/documentosController.js` (destino multipessoas, gerarMultipessoas, catalogoVariaveisPartes),
  `routes/index.js`; frontend `components/GerarDocumentoPartes.js` (NOVO), `pages/Pessoas/Pessoas.js` (botão),
  `pages/Documentos/Documentos.js` (opção+ajuda), `services/api.js`.
- ⚠️ ZERO alteração no banco. FORA DO ESCOPO (depois): amarrar um modelo a um RÉU específico
  (ex.: questionário só da Via Varejo) p/ o sistema sugerir automaticamente.

**Relacionado:** [[financeiro]], [[processos-pastas]], [[cadastro-pessoas]], [[database-tables]], [[pendencias-proxima-sessao]]
