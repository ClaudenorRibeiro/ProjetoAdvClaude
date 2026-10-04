-- IMPORTANTE — NÃO APAGAR. Cria as tabelas de contas bancárias das pessoas (contas_bancarias_pf e contas_bancarias_pj),
-- caso o banco ainda não as tenha. Quem roda: o usuário, no HeidiSQL, com o BANCO DO SISTEMA selecionado, em CADA instância
-- (local, AWS-Antônio, AWS-Erick) que acuse "Table ... contas_bancarias_pf doesn't exist" ou "Erro ao carregar contas do beneficiário".
-- Seguro para rodar mais de uma vez: só cria o que não existe (CREATE TABLE IF NOT EXISTS); não apaga nem altera dados.
-- Pré-requisito: já existirem pessoas_fisicas, pessoas_juridicas e instituicao_financeira. Se faltar alguma, o MySQL
-- recusa com erro de chave estrangeira e NADA é criado por essa tabela (rode o sql_diagnostico_estrutura_para_heidi.sql para ver o que falta).
-- As definições são cópia fiel do estrutura_banco.sql (por isso esse arquivo NÃO muda).
-- ============================================================================

CREATE TABLE IF NOT EXISTS `contas_bancarias_pf` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pessoa_id` int NOT NULL,
  `instituicao_financeira_id` int NOT NULL,
  `tipo` varchar(20) NOT NULL COMMENT 'corrente ou poupanca',
  `agencia` varchar(20) DEFAULT NULL,
  `numero` varchar(30) DEFAULT NULL,
  `digito` varchar(5) DEFAULT NULL,
  `chave_pix` varchar(150) DEFAULT NULL,
  `conta_terceiro` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0 = conta da propria pessoa; 1 = conta de outra pessoa (autorizacao)',
  `titular` varchar(200) NOT NULL,
  `documento_titular` varchar(18) NOT NULL,
  `observacao` text,
  `principal` tinyint(1) NOT NULL DEFAULT '0',
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pessoa_id` (`pessoa_id`),
  KEY `idx_cbpf_instituicao` (`instituicao_financeira_id`),
  CONSTRAINT `fk_cbpf_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_fisicas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cbpf_instituicao` FOREIGN KEY (`instituicao_financeira_id`) REFERENCES `instituicao_financeira` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_cbpf_tipo` CHECK ((`tipo` in (_utf8mb4'corrente',_utf8mb4'poupanca')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `contas_bancarias_pj` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pessoa_id` int NOT NULL,
  `instituicao_financeira_id` int NOT NULL,
  `tipo` varchar(20) NOT NULL COMMENT 'corrente ou poupanca',
  `agencia` varchar(20) DEFAULT NULL,
  `numero` varchar(30) DEFAULT NULL,
  `digito` varchar(5) DEFAULT NULL,
  `chave_pix` varchar(150) DEFAULT NULL,
  `conta_terceiro` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0 = conta da propria empresa; 1 = conta de outra pessoa/empresa (autorizacao)',
  `titular` varchar(200) NOT NULL,
  `documento_titular` varchar(18) NOT NULL,
  `observacao` text,
  `principal` tinyint(1) NOT NULL DEFAULT '0',
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pessoa_id` (`pessoa_id`),
  KEY `idx_cbpj_instituicao` (`instituicao_financeira_id`),
  CONSTRAINT `fk_cbpj_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_juridicas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cbpj_instituicao` FOREIGN KEY (`instituicao_financeira_id`) REFERENCES `instituicao_financeira` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_cbpj_tipo` CHECK ((`tipo` in (_utf8mb4'corrente',_utf8mb4'poupanca')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Conferência (só leitura): deve listar as duas tabelas.
SHOW TABLES LIKE 'contas_bancarias%';
