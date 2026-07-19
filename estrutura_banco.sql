-- --------------------------------------------------------
-- Servidor:                     127.0.0.1
-- Versão do servidor:           8.0.46-0ubuntu0.24.04.3 - (Ubuntu)
-- OS do Servidor:               Linux
-- HeidiSQL Versão:              12.5.0.6677
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Copiando estrutura do banco de dados para sistema_advocacia
DROP DATABASE IF EXISTS `sistema_advocacia`;
CREATE DATABASE IF NOT EXISTS `sistema_advocacia` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `sistema_advocacia`;

-- Copiando estrutura para tabela sistema_advocacia.acordo
DROP TABLE IF EXISTS `acordo`;
CREATE TABLE IF NOT EXISTS `acordo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processo_id` int NOT NULL,
  `tipo` varchar(10) NOT NULL DEFAULT 'acordo',
  `descricao` varchar(300) DEFAULT NULL,
  `valor_total` decimal(15,2) NOT NULL,
  `qtd_parcelas` int NOT NULL,
  `data_primeira` date NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ativo',
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `alterado_por` int DEFAULT NULL,
  `alterado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `processo_id` (`processo_id`),
  KEY `criado_por` (`criado_por`),
  KEY `fk_acordo_alterado` (`alterado_por`),
  CONSTRAINT `fk_acordo_alterado` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_acordo_criado` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_acordo_proc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.acordo_parcela
DROP TABLE IF EXISTS `acordo_parcela`;
CREATE TABLE IF NOT EXISTS `acordo_parcela` (
  `id` int NOT NULL AUTO_INCREMENT,
  `acordo_id` int NOT NULL,
  `numero` int NOT NULL,
  `vencimento` date NOT NULL,
  `valor_bruto` decimal(15,2) NOT NULL DEFAULT '0.00',
  `honor_tipo` varchar(10) NOT NULL DEFAULT 'percent',
  `honor_percentual` decimal(5,2) DEFAULT NULL,
  `honor_valor` decimal(15,2) NOT NULL DEFAULT '0.00',
  `valor_liquido` decimal(15,2) NOT NULL DEFAULT '0.00',
  `observacao` varchar(300) DEFAULT NULL,
  `parceria_pessoa_tipo` varchar(20) DEFAULT NULL,
  `parceria_pessoa_id` int DEFAULT NULL,
  `parceria_tipo` varchar(10) DEFAULT NULL,
  `parceria_percentual` decimal(5,2) DEFAULT NULL,
  `parceria_valor` decimal(15,2) DEFAULT NULL,
  `status` varchar(15) NOT NULL DEFAULT 'pendente',
  `recebido_em` date DEFAULT NULL,
  `recebimento_forma_id` int DEFAULT NULL,
  `recebimento_identificacao` varchar(120) DEFAULT NULL,
  `repasse_cliente_em` date DEFAULT NULL,
  `repasse_cliente_forma_id` int DEFAULT NULL,
  `repasse_parceiro_em` date DEFAULT NULL,
  `repasse_parceiro_forma_id` int DEFAULT NULL,
  `repasse_cliente_por` int DEFAULT NULL,
  `repasse_parceiro_por` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `acordo_id` (`acordo_id`),
  KEY `fk_parcela_receb_forma` (`recebimento_forma_id`),
  KEY `fk_parcela_repcli_forma` (`repasse_cliente_forma_id`),
  KEY `fk_parcela_reppar_forma` (`repasse_parceiro_forma_id`),
  KEY `fk_parcela_repcli_por` (`repasse_cliente_por`),
  KEY `fk_parcela_reppar_por` (`repasse_parceiro_por`),
  KEY `idx_parcela_vencimento` (`vencimento`),
  CONSTRAINT `fk_parcela_acordo` FOREIGN KEY (`acordo_id`) REFERENCES `acordo` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_parcela_receb_forma` FOREIGN KEY (`recebimento_forma_id`) REFERENCES `forma_pagamento` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_parcela_repcli_forma` FOREIGN KEY (`repasse_cliente_forma_id`) REFERENCES `forma_pagamento` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_parcela_repcli_por` FOREIGN KEY (`repasse_cliente_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_parcela_reppar_forma` FOREIGN KEY (`repasse_parceiro_forma_id`) REFERENCES `forma_pagamento` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_parcela_reppar_por` FOREIGN KEY (`repasse_parceiro_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=162 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.advogados_freela
DROP TABLE IF EXISTS `advogados_freela`;
CREATE TABLE IF NOT EXISTS `advogados_freela` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(200) NOT NULL,
  `oab` varchar(30) DEFAULT NULL,
  `telefone` varchar(20) DEFAULT NULL,
  `cep` varchar(9) DEFAULT NULL,
  `logradouro` varchar(200) DEFAULT NULL,
  `numero` varchar(10) DEFAULT NULL,
  `complemento` varchar(100) DEFAULT NULL,
  `bairro` varchar(100) DEFAULT NULL,
  `cidade` varchar(100) DEFAULT NULL,
  `estado` char(2) DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `criado_por` (`criado_por`),
  CONSTRAINT `freela_ibfk_1` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.agenda_compromisso
DROP TABLE IF EXISTS `agenda_compromisso`;
CREATE TABLE IF NOT EXISTS `agenda_compromisso` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `titulo` varchar(150) NOT NULL,
  `descricao` text,
  `data` date NOT NULL,
  `hora_inicio` time DEFAULT NULL,
  `hora_fim` time DEFAULT NULL,
  `dia_todo` tinyint(1) NOT NULL DEFAULT '0',
  `escritorio` tinyint(1) NOT NULL DEFAULT '0',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `alterado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `data` (`data`),
  CONSTRAINT `fk_agcomp_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.andamento_processual
DROP TABLE IF EXISTS `andamento_processual`;
CREATE TABLE IF NOT EXISTS `andamento_processual` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processo_id` int NOT NULL,
  `data` date NOT NULL,
  `descricao` text NOT NULL,
  `criado_por` int NOT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `editado_por` int DEFAULT NULL,
  `editado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `processo_id` (`processo_id`),
  KEY `criado_por` (`criado_por`),
  KEY `editado_por` (`editado_por`),
  CONSTRAINT `andamento_processual_ibfk_2` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `andamento_processual_ibfk_3` FOREIGN KEY (`editado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_andamento_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.ata_audiencia
DROP TABLE IF EXISTS `ata_audiencia`;
CREATE TABLE IF NOT EXISTS `ata_audiencia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `audiencia_id` int NOT NULL,
  `resultado` text,
  `houve_acordo` tinyint(1) DEFAULT '0',
  `valor_acordo` decimal(15,2) DEFAULT NULL,
  `parcelas` int DEFAULT NULL,
  `valor_parcela` decimal(15,2) DEFAULT NULL,
  `data_primeiro_pagamento` date DEFAULT NULL,
  `nova_audiencia` tinyint(1) DEFAULT '0',
  `observacoes` text,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `criado_por` (`criado_por`),
  KEY `idx_audiencia_id` (`audiencia_id`),
  CONSTRAINT `ata_audiencia_ibfk_1` FOREIGN KEY (`audiencia_id`) REFERENCES `audiencia` (`id`),
  CONSTRAINT `ata_audiencia_ibfk_2` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.audiencia
DROP TABLE IF EXISTS `audiencia`;
CREATE TABLE IF NOT EXISTS `audiencia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processo_id` int NOT NULL,
  `tipo_audiencia_id` int DEFAULT NULL,
  `data` date NOT NULL,
  `hora` time NOT NULL,
  `modalidade` varchar(30) DEFAULT 'presencial',
  `local` varchar(300) DEFAULT NULL,
  `vara_id` int DEFAULT NULL,
  `plataforma_virtual` varchar(100) DEFAULT NULL,
  `link_virtual` varchar(500) DEFAULT NULL,
  `responsavel_id` int DEFAULT NULL,
  `responsavel_freela_id` int DEFAULT NULL,
  `comunicado_enviado` tinyint(1) DEFAULT '0',
  `ata_impressa` tinyint(1) DEFAULT '0',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int NOT NULL,
  `alterado_por` int DEFAULT NULL,
  `alterado_em` datetime DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'agendada',
  `motivo_status` text,
  PRIMARY KEY (`id`),
  KEY `processo_id` (`processo_id`),
  KEY `tipo_audiencia_id` (`tipo_audiencia_id`),
  KEY `criado_por` (`criado_por`),
  KEY `aud_ibfk_alterado_por` (`alterado_por`),
  KEY `aud_ibfk_responsavel` (`responsavel_id`),
  KEY `aud_ibfk_resp_freela` (`responsavel_freela_id`),
  KEY `idx_aud_data_status` (`data`,`status`),
  CONSTRAINT `aud_ibfk_alterado_por` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `aud_ibfk_resp_freela` FOREIGN KEY (`responsavel_freela_id`) REFERENCES `advogados_freela` (`id`) ON DELETE SET NULL,
  CONSTRAINT `aud_ibfk_responsavel` FOREIGN KEY (`responsavel_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `audiencia_ibfk_2` FOREIGN KEY (`tipo_audiencia_id`) REFERENCES `tipo_audiencia` (`id`),
  CONSTRAINT `audiencia_ibfk_3` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_audiencia_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.audiencia_testemunhas
DROP TABLE IF EXISTS `audiencia_testemunhas`;
CREATE TABLE IF NOT EXISTS `audiencia_testemunhas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `audiencia_id` int NOT NULL,
  `pessoa_id` int NOT NULL,
  `polo` varchar(10) NOT NULL DEFAULT 'autor',
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `audiencia_id` (`audiencia_id`),
  KEY `pessoa_id` (`pessoa_id`),
  CONSTRAINT `aut_ibfk_1` FOREIGN KEY (`audiencia_id`) REFERENCES `audiencia` (`id`) ON DELETE CASCADE,
  CONSTRAINT `aut_ibfk_2` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_fisicas` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.auditoria_audiencia
DROP TABLE IF EXISTS `auditoria_audiencia`;
CREATE TABLE IF NOT EXISTS `auditoria_audiencia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `audiencia_id` int NOT NULL,
  `campo_alterado` varchar(100) DEFAULT NULL,
  `valor_anterior` text,
  `valor_novo` text,
  `usuario_id` int NOT NULL,
  `alterado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `audiencia_id` (`audiencia_id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `audaud_ibfk_1` FOREIGN KEY (`audiencia_id`) REFERENCES `audiencia` (`id`) ON DELETE CASCADE,
  CONSTRAINT `audaud_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=39 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.auditoria_conta_corrente
DROP TABLE IF EXISTS `auditoria_conta_corrente`;
CREATE TABLE IF NOT EXISTS `auditoria_conta_corrente` (
  `id` int NOT NULL AUTO_INCREMENT,
  `lancamento_id` int NOT NULL,
  `acao` varchar(30) NOT NULL,
  `campo_alterado` varchar(100) DEFAULT NULL,
  `valor_anterior` text,
  `valor_novo` text,
  `usuario_id` int NOT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `lancamento_id` (`lancamento_id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `fk_audcc_lanc` FOREIGN KEY (`lancamento_id`) REFERENCES `conta_corrente` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_audcc_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.auditoria_parcela
DROP TABLE IF EXISTS `auditoria_parcela`;
CREATE TABLE IF NOT EXISTS `auditoria_parcela` (
  `id` int NOT NULL AUTO_INCREMENT,
  `parcela_id` int NOT NULL,
  `acao` varchar(30) NOT NULL,
  `campo_alterado` varchar(100) DEFAULT NULL,
  `valor_anterior` text,
  `valor_novo` text,
  `usuario_id` int NOT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `parcela_id` (`parcela_id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `fk_audparcela_parcela` FOREIGN KEY (`parcela_id`) REFERENCES `acordo_parcela` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_audparcela_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=148 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.auditoria_pericia
DROP TABLE IF EXISTS `auditoria_pericia`;
CREATE TABLE IF NOT EXISTS `auditoria_pericia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pericia_id` int NOT NULL,
  `campo_alterado` varchar(100) DEFAULT NULL,
  `valor_anterior` text,
  `valor_novo` text,
  `usuario_id` int NOT NULL,
  `alterado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pericia_id` (`pericia_id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `audper_ibfk_1` FOREIGN KEY (`pericia_id`) REFERENCES `pericia` (`id`) ON DELETE CASCADE,
  CONSTRAINT `audper_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.auditoria_prazo
DROP TABLE IF EXISTS `auditoria_prazo`;
CREATE TABLE IF NOT EXISTS `auditoria_prazo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `prazo_id` int NOT NULL,
  `status_anterior` varchar(20) DEFAULT NULL,
  `status_novo` varchar(20) DEFAULT NULL,
  `usuario_id` int NOT NULL,
  `alterado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `observacao` varchar(300) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `prazo_id` (`prazo_id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `auditoria_prazo_ibfk_1` FOREIGN KEY (`prazo_id`) REFERENCES `prazos_processo` (`id`),
  CONSTRAINT `auditoria_prazo_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=54 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.calendario
DROP TABLE IF EXISTS `calendario`;
CREATE TABLE IF NOT EXISTS `calendario` (
  `data` date NOT NULL,
  `dia_util` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`data`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.configuracoes_escritorio
DROP TABLE IF EXISTS `configuracoes_escritorio`;
CREATE TABLE IF NOT EXISTS `configuracoes_escritorio` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(200) NOT NULL,
  `cnpj_cpf` varchar(20) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `telefone` varchar(20) DEFAULT NULL,
  `cep` varchar(9) DEFAULT NULL,
  `logradouro` varchar(200) DEFAULT NULL,
  `numero` varchar(20) DEFAULT NULL,
  `bairro` varchar(100) DEFAULT NULL,
  `cidade` varchar(100) DEFAULT NULL,
  `estado` varchar(2) DEFAULT NULL,
  `logo_base64` longtext,
  `cor_principal` varchar(7) DEFAULT '#1a56db',
  `horario_alerta_prazos` time DEFAULT '18:00:00',
  `horario_alerta_prazos_2` time DEFAULT NULL,
  `dias_alerta_audiencia` int DEFAULT '3',
  `dias_alerta_pericia` int DEFAULT '2',
  `dias_sem_movimentacao` int DEFAULT '30',
  `dias_audiencia_sem_adv` int DEFAULT '7',
  `setup_concluido` tinyint(1) DEFAULT '0',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `alerta_atrasado_ativo` tinyint(1) DEFAULT '1',
  `alerta_emails` text,
  `prazo_fazendo_timeout` int NOT NULL DEFAULT '60',
  `titulo_aba` varchar(100) DEFAULT NULL COMMENT 'Título exibido na aba do navegador',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.configuracoes_integracoes
DROP TABLE IF EXISTS `configuracoes_integracoes`;
CREATE TABLE IF NOT EXISTS `configuracoes_integracoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `modulo` varchar(50) NOT NULL,
  `ativo` tinyint(1) DEFAULT '0',
  `configuracoes` json DEFAULT NULL,
  `atualizado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.conta_corrente
DROP TABLE IF EXISTS `conta_corrente`;
CREATE TABLE IF NOT EXISTS `conta_corrente` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processo_id` int NOT NULL,
  `parcela_id` int DEFAULT NULL,
  `data` date NOT NULL,
  `descricao` varchar(300) NOT NULL,
  `tipo` varchar(10) NOT NULL,
  `valor` decimal(15,2) NOT NULL,
  `origem` varchar(20) NOT NULL DEFAULT 'manual',
  `usuario_id` int NOT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `processo_id` (`processo_id`),
  KEY `parcela_id` (`parcela_id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `fk_cc_parcela` FOREIGN KEY (`parcela_id`) REFERENCES `acordo_parcela` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cc_processo` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cc_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.controle_versao_banco
DROP TABLE IF EXISTS `controle_versao_banco`;
CREATE TABLE IF NOT EXISTS `controle_versao_banco` (
  `numero` int NOT NULL,
  `descricao` varchar(300) NOT NULL,
  `sql_aplicado` mediumtext,
  `aplicado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`numero`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.emails_pf
DROP TABLE IF EXISTS `emails_pf`;
CREATE TABLE IF NOT EXISTS `emails_pf` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pessoa_id` int NOT NULL,
  `email` varchar(150) NOT NULL,
  `principal` tinyint(1) DEFAULT '0',
  `ativo` tinyint(1) DEFAULT '1',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pessoa_id` (`pessoa_id`),
  CONSTRAINT `emails_pf_ibfk_1` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_fisicas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1700 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.emails_pj
DROP TABLE IF EXISTS `emails_pj`;
CREATE TABLE IF NOT EXISTS `emails_pj` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pessoa_id` int NOT NULL,
  `email` varchar(150) NOT NULL,
  `principal` tinyint(1) DEFAULT '0',
  `ativo` tinyint(1) DEFAULT '1',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pessoa_id` (`pessoa_id`),
  CONSTRAINT `emails_pj_ibfk_1` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_juridicas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.estado_civil
DROP TABLE IF EXISTS `estado_civil`;
CREATE TABLE IF NOT EXISTS `estado_civil` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.feriados
DROP TABLE IF EXISTS `feriados`;
CREATE TABLE IF NOT EXISTS `feriados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `data` date NOT NULL,
  `descricao` varchar(200) NOT NULL,
  `tipo` varchar(30) DEFAULT 'nacional',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_feriados_criado_por` (`criado_por`),
  CONSTRAINT `fk_feriados_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.forma_pagamento
DROP TABLE IF EXISTS `forma_pagamento`;
CREATE TABLE IF NOT EXISTS `forma_pagamento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(60) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.genero
DROP TABLE IF EXISTS `genero`;
CREATE TABLE IF NOT EXISTS `genero` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.historico_atendimento
DROP TABLE IF EXISTS `historico_atendimento`;
CREATE TABLE IF NOT EXISTS `historico_atendimento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo_pessoa` varchar(20) DEFAULT 'fisica',
  `pessoa_id` int NOT NULL,
  `descricao` text NOT NULL,
  `usuario_id` int NOT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `historico_atendimento_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.logs_auditoria
DROP TABLE IF EXISTS `logs_auditoria`;
CREATE TABLE IF NOT EXISTS `logs_auditoria` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int DEFAULT NULL,
  `tabela` varchar(50) NOT NULL,
  `acao` varchar(30) NOT NULL,
  `registro_id` int DEFAULT NULL,
  `descricao` varchar(255) DEFAULT NULL,
  `dados_antigos` json DEFAULT NULL,
  `dados_novos` json DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tabela` (`tabela`),
  KEY `idx_usuario` (`usuario_id`),
  KEY `idx_data` (`criado_em`),
  KEY `idx_usuario_data` (`usuario_id`,`criado_em`)
) ENGINE=InnoDB AUTO_INCREMENT=351 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.log_comunicacoes
DROP TABLE IF EXISTS `log_comunicacoes`;
CREATE TABLE IF NOT EXISTS `log_comunicacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `canal` varchar(20) DEFAULT NULL,
  `destinatario` varchar(200) NOT NULL,
  `assunto` varchar(200) DEFAULT NULL,
  `conteudo` text,
  `enviado` tinyint(1) DEFAULT '0',
  `erro_msg` text,
  `tipo_pessoa` varchar(20) DEFAULT NULL,
  `pessoa_id` int DEFAULT NULL,
  `processo_id` int DEFAULT NULL,
  `usuario_id` int DEFAULT NULL,
  `enviado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `processo_id` (`processo_id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `fk_logcomun_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`),
  CONSTRAINT `log_comunicacoes_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.log_documentos_gerados
DROP TABLE IF EXISTS `log_documentos_gerados`;
CREATE TABLE IF NOT EXISTS `log_documentos_gerados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `modelo_id` int DEFAULT NULL,
  `modelo_nome` varchar(150) NOT NULL,
  `formato` varchar(10) NOT NULL,
  `ancora_tipo` varchar(20) DEFAULT NULL,
  `ancora_id` int DEFAULT NULL,
  `referencia` varchar(300) DEFAULT NULL,
  `nome_arquivo` varchar(300) DEFAULT NULL,
  `usuario_id` int NOT NULL,
  `usuario_nome` varchar(150) NOT NULL,
  `gerado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `modelo_id` (`modelo_id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `gerado_em` (`gerado_em`),
  CONSTRAINT `fk_logdoc_modelo` FOREIGN KEY (`modelo_id`) REFERENCES `modelo_documento` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_logdoc_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.log_emails
DROP TABLE IF EXISTS `log_emails`;
CREATE TABLE IF NOT EXISTS `log_emails` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `enviado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `para` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `assunto` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `status` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `erro` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  PRIMARY KEY (`id`),
  KEY `idx_log_emails_enviado_em` (`enviado_em`),
  KEY `idx_log_emails_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.log_publicacoes
DROP TABLE IF EXISTS `log_publicacoes`;
CREATE TABLE IF NOT EXISTS `log_publicacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `quantidade` int NOT NULL,
  `data_publicacao` date DEFAULT NULL,
  `acao_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `log_publicacoes_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.modelo_documento
DROP TABLE IF EXISTS `modelo_documento`;
CREATE TABLE IF NOT EXISTS `modelo_documento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(150) NOT NULL,
  `descricao` varchar(300) DEFAULT NULL,
  `destino` varchar(20) NOT NULL DEFAULT 'comum',
  `tipo_audiencia_id` int DEFAULT NULL,
  `modalidade` varchar(20) DEFAULT NULL,
  `minutos_antes` int NOT NULL DEFAULT '0',
  `tipo_pericia_id` int DEFAULT NULL,
  `subtipo_prazo_id` int DEFAULT NULL,
  `arquivo_s3_key` varchar(400) NOT NULL,
  `blocos_exigidos` varchar(200) DEFAULT NULL,
  `variaveis_usadas` text,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int DEFAULT NULL,
  `alterado_em` datetime DEFAULT NULL,
  `alterado_por` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `criado_por` (`criado_por`),
  KEY `alterado_por` (`alterado_por`),
  KEY `idx_modelo_tipo_aud` (`tipo_audiencia_id`),
  KEY `idx_modelo_tipo_per` (`tipo_pericia_id`),
  KEY `idx_modelo_subtipo_prazo` (`subtipo_prazo_id`),
  CONSTRAINT `fk_modelo_alterado_por` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_modelo_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_modelo_subtipo_prazo` FOREIGN KEY (`subtipo_prazo_id`) REFERENCES `prazo_subtipo` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_modelo_tipo_aud` FOREIGN KEY (`tipo_audiencia_id`) REFERENCES `tipo_audiencia` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_modelo_tipo_per` FOREIGN KEY (`tipo_pericia_id`) REFERENCES `tipo_pericia` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.nacionalidade
DROP TABLE IF EXISTS `nacionalidade`;
CREATE TABLE IF NOT EXISTS `nacionalidade` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.notificacoes
DROP TABLE IF EXISTS `notificacoes`;
CREATE TABLE IF NOT EXISTS `notificacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `prazo_id` int NOT NULL,
  `mensagem` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `lida` tinyint(1) DEFAULT '0',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `prazo_id` (`prazo_id`),
  CONSTRAINT `fk_notif_prazo` FOREIGN KEY (`prazo_id`) REFERENCES `prazos_processo` (`id`),
  CONSTRAINT `fk_notif_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.pericia
DROP TABLE IF EXISTS `pericia`;
CREATE TABLE IF NOT EXISTS `pericia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processo_id` int NOT NULL,
  `tipo_pericia_id` int DEFAULT NULL,
  `data` date NOT NULL,
  `hora` time DEFAULT NULL,
  `local` varchar(300) DEFAULT NULL,
  `cep` varchar(9) DEFAULT NULL,
  `logradouro` varchar(200) DEFAULT NULL,
  `numero` varchar(20) DEFAULT NULL,
  `complemento` varchar(100) DEFAULT NULL,
  `bairro` varchar(100) DEFAULT NULL,
  `cidade` varchar(100) DEFAULT NULL,
  `estado` varchar(2) DEFAULT NULL,
  `perito_tipo` varchar(20) DEFAULT NULL,
  `perito_id` int DEFAULT NULL,
  `assistente_tecnico_id` int DEFAULT NULL,
  `responsavel_id` int DEFAULT NULL,
  `responsavel_freela_id` int DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'agendada',
  `motivo_status` text,
  `comunicado_enviado` tinyint(1) DEFAULT '0',
  `email_perito_enviado` tinyint(1) DEFAULT '0',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int NOT NULL,
  `alterado_por` int DEFAULT NULL,
  `alterado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `processo_id` (`processo_id`),
  KEY `tipo_pericia_id` (`tipo_pericia_id`),
  KEY `assistente_tecnico_id` (`assistente_tecnico_id`),
  KEY `criado_por` (`criado_por`),
  KEY `idx_per_data` (`data`),
  KEY `fk_pericia_responsavel` (`responsavel_id`),
  KEY `fk_pericia_resp_freela` (`responsavel_freela_id`),
  KEY `fk_pericia_alterado_por` (`alterado_por`),
  CONSTRAINT `fk_pericia_alterado_por` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pericia_resp_freela` FOREIGN KEY (`responsavel_freela_id`) REFERENCES `advogados_freela` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pericia_responsavel` FOREIGN KEY (`responsavel_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pericia_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`),
  CONSTRAINT `pericia_ibfk_2` FOREIGN KEY (`tipo_pericia_id`) REFERENCES `tipo_pericia` (`id`),
  CONSTRAINT `pericia_ibfk_3` FOREIGN KEY (`assistente_tecnico_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `pericia_ibfk_4` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.permissoes
DROP TABLE IF EXISTS `permissoes`;
CREATE TABLE IF NOT EXISTS `permissoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `modulo` varchar(50) NOT NULL,
  `submodulo` varchar(50) DEFAULT NULL COMMENT 'Sub-módulo opcional — ex: andamentos, prazos, tarefas, audiencias, pericias',
  `acao` varchar(20) NOT NULL,
  `permitido` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_usuario_modulo` (`usuario_id`,`modulo`,`submodulo`,`acao`),
  CONSTRAINT `permissoes_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6563 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.pessoas_fisicas
DROP TABLE IF EXISTS `pessoas_fisicas`;
CREATE TABLE IF NOT EXISTS `pessoas_fisicas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(200) NOT NULL,
  `cpf` varchar(14) DEFAULT NULL,
  `rg` varchar(20) DEFAULT NULL,
  `rg_orgao` varchar(20) DEFAULT NULL,
  `pis` varchar(20) DEFAULT NULL,
  `ctps_numero` varchar(30) DEFAULT NULL,
  `ctps_serie` varchar(20) DEFAULT NULL,
  `nome_pai` varchar(200) DEFAULT NULL,
  `nome_mae` varchar(200) DEFAULT NULL,
  `data_nascimento` date DEFAULT NULL,
  `estado_civil_id` int DEFAULT NULL,
  `profissao_id` int DEFAULT NULL,
  `genero_id` int DEFAULT NULL,
  `nacionalidade_id` int DEFAULT NULL,
  `cep` varchar(9) DEFAULT NULL,
  `logradouro` varchar(200) DEFAULT NULL,
  `numero` varchar(10) DEFAULT NULL,
  `complemento` varchar(100) DEFAULT NULL,
  `bairro` varchar(100) DEFAULT NULL,
  `cidade` varchar(100) DEFAULT NULL,
  `estado` char(2) DEFAULT NULL,
  `foto_path` varchar(300) DEFAULT NULL,
  `observacoes` text,
  `ativo` tinyint(1) DEFAULT '1',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int DEFAULT NULL,
  `alterado_por` int DEFAULT NULL,
  `alterado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pf_cpf` (`cpf`),
  KEY `estado_civil_id` (`estado_civil_id`),
  KEY `profissao_id` (`profissao_id`),
  KEY `genero_id` (`genero_id`),
  KEY `fk_pf_criado_por` (`criado_por`),
  KEY `fk_pf_alterado_por` (`alterado_por`),
  KEY `nacionalidade_id` (`nacionalidade_id`),
  KEY `idx_pf_ativo_nome` (`ativo`,`nome`),
  CONSTRAINT `fk_pf_alterado_por` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_pf_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `pessoas_fisicas_ibfk_1` FOREIGN KEY (`estado_civil_id`) REFERENCES `estado_civil` (`id`),
  CONSTRAINT `pessoas_fisicas_ibfk_2` FOREIGN KEY (`profissao_id`) REFERENCES `profissao` (`id`),
  CONSTRAINT `pessoas_fisicas_ibfk_3` FOREIGN KEY (`genero_id`) REFERENCES `genero` (`id`),
  CONSTRAINT `pessoas_fisicas_ibfk_4` FOREIGN KEY (`nacionalidade_id`) REFERENCES `nacionalidade` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4947 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.pessoas_juridicas
DROP TABLE IF EXISTS `pessoas_juridicas`;
CREATE TABLE IF NOT EXISTS `pessoas_juridicas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `razao_social` varchar(200) NOT NULL,
  `nome_fantasia` varchar(200) DEFAULT NULL,
  `cnpj` varchar(18) DEFAULT NULL,
  `inscricao_estadual` varchar(30) DEFAULT NULL,
  `cep` varchar(9) DEFAULT NULL,
  `logradouro` varchar(200) DEFAULT NULL,
  `numero` varchar(10) DEFAULT NULL,
  `complemento` varchar(100) DEFAULT NULL,
  `bairro` varchar(100) DEFAULT NULL,
  `cidade` varchar(100) DEFAULT NULL,
  `estado` char(2) DEFAULT NULL,
  `observacoes` text,
  `ativo` tinyint(1) DEFAULT '1',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int DEFAULT NULL,
  `alterado_por` int DEFAULT NULL,
  `alterado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pj_cnpj` (`cnpj`),
  KEY `fk_pj_criado_por` (`criado_por`),
  KEY `fk_pj_alterado_por` (`alterado_por`),
  KEY `idx_pj_ativo_razao` (`ativo`,`razao_social`),
  CONSTRAINT `fk_pj_alterado_por` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_pj_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2879 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.prazos_processo
DROP TABLE IF EXISTS `prazos_processo`;
CREATE TABLE IF NOT EXISTS `prazos_processo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processo_id` int NOT NULL,
  `subtipo_id` int DEFAULT NULL,
  `descricao` varchar(300) DEFAULT NULL,
  `data_inicio` date NOT NULL,
  `quantidade` int DEFAULT NULL,
  `tipo_dias` varchar(20) DEFAULT 'uteis',
  `data_vencimento` date NOT NULL,
  `delegado_para` int DEFAULT NULL,
  `status` varchar(20) DEFAULT 'aberto',
  `status_alterado_por` int DEFAULT NULL,
  `status_alterado_em` datetime DEFAULT NULL,
  `concluido_por` int DEFAULT NULL,
  `concluido_em` datetime DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int NOT NULL,
  `motivo_cancelamento` varchar(500) DEFAULT NULL,
  `fazendo_por` int DEFAULT NULL,
  `fazendo_desde` datetime DEFAULT NULL,
  `status_antes_fazendo` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `processo_id` (`processo_id`),
  KEY `subtipo_id` (`subtipo_id`),
  KEY `delegado_para` (`delegado_para`),
  KEY `concluido_por` (`concluido_por`),
  KEY `status_alterado_por` (`status_alterado_por`),
  KEY `criado_por` (`criado_por`),
  KEY `fk_pp_fazendo_por` (`fazendo_por`),
  KEY `idx_vencimento_status` (`data_vencimento`,`status`),
  CONSTRAINT `fk_pp_fazendo_por` FOREIGN KEY (`fazendo_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_prazos_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`),
  CONSTRAINT `prazos_processo_ibfk_2` FOREIGN KEY (`subtipo_id`) REFERENCES `prazo_subtipo` (`id`),
  CONSTRAINT `prazos_processo_ibfk_3` FOREIGN KEY (`delegado_para`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `prazos_processo_ibfk_4` FOREIGN KEY (`concluido_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `prazos_processo_ibfk_5` FOREIGN KEY (`status_alterado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `prazos_processo_ibfk_6` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.prazo_subtipo
DROP TABLE IF EXISTS `prazo_subtipo`;
CREATE TABLE IF NOT EXISTS `prazo_subtipo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo_prazo_id` int NOT NULL,
  `nome` varchar(150) NOT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `tipo_prazo_id` (`tipo_prazo_id`),
  CONSTRAINT `prazo_subtipo_ibfk_1` FOREIGN KEY (`tipo_prazo_id`) REFERENCES `tipo_prazo` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=35 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.processo_perito
DROP TABLE IF EXISTS `processo_perito`;
CREATE TABLE IF NOT EXISTS `processo_perito` (
  `id` int NOT NULL AUTO_INCREMENT,
  `proc_id` int NOT NULL,
  `tipo_pessoa` varchar(20) NOT NULL,
  `pessoa_id` int NOT NULL,
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `proc_id` (`proc_id`),
  KEY `criado_por` (`criado_por`),
  CONSTRAINT `fk_procperito_proc` FOREIGN KEY (`proc_id`) REFERENCES `tblproc` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_procperito_usuario` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.profissao
DROP TABLE IF EXISTS `profissao`;
CREATE TABLE IF NOT EXISTS `profissao` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.publicacao_usuario
DROP TABLE IF EXISTS `publicacao_usuario`;
CREATE TABLE IF NOT EXISTS `publicacao_usuario` (
  `id` int NOT NULL AUTO_INCREMENT,
  `publicacao_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pu_pub` (`publicacao_id`),
  KEY `idx_pu_user` (`usuario_id`),
  CONSTRAINT `fk_pu_pub` FOREIGN KEY (`publicacao_id`) REFERENCES `publicacoes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pu_user` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.publicacoes
DROP TABLE IF EXISTS `publicacoes`;
CREATE TABLE IF NOT EXISTS `publicacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fonte` varchar(20) NOT NULL DEFAULT 'aasp',
  `id_cnj` bigint DEFAULT NULL,
  `data_publicacao` date NOT NULL,
  `numero_processo` varchar(45) DEFAULT NULL,
  `tribunal` varchar(20) DEFAULT NULL,
  `titulo` varchar(255) DEFAULT NULL,
  `cabecalho` varchar(100) DEFAULT NULL,
  `numero_publicacao` varchar(30) DEFAULT NULL,
  `numero_arquivo` varchar(30) DEFAULT NULL,
  `texto` mediumtext NOT NULL,
  `texto_hash` char(64) NOT NULL,
  `hash_cnj` varchar(60) DEFAULT NULL,
  `escritorio` tinyint(1) NOT NULL DEFAULT '1',
  `importada_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `direcionada_por` int DEFAULT NULL,
  `direcionada_em` datetime DEFAULT NULL,
  `tratada` tinyint(1) NOT NULL DEFAULT '0',
  `tratada_por` int DEFAULT NULL,
  `tratada_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pub_cnj` (`fonte`,`id_cnj`),
  KEY `idx_pub_data` (`data_publicacao`),
  KEY `idx_pub_hash` (`texto_hash`),
  KEY `idx_pub_processo` (`numero_processo`),
  KEY `idx_pub_fonte` (`fonte`),
  KEY `importada_por` (`importada_por`),
  KEY `direcionada_por` (`direcionada_por`),
  KEY `tratada_por` (`tratada_por`),
  CONSTRAINT `fk_pub_direcionada` FOREIGN KEY (`direcionada_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pub_importada` FOREIGN KEY (`importada_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pub_tratada` FOREIGN KEY (`tratada_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=818 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.reset_tokens
DROP TABLE IF EXISTS `reset_tokens`;
CREATE TABLE IF NOT EXISTS `reset_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `token` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `usado` tinyint(1) NOT NULL DEFAULT '0',
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `reset_tokens_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tarefas
DROP TABLE IF EXISTS `tarefas`;
CREATE TABLE IF NOT EXISTS `tarefas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `titulo` varchar(300) NOT NULL,
  `descricao` text,
  `prioridade` varchar(20) DEFAULT 'normal',
  `processo_id` int DEFAULT NULL,
  `pasta_id` int DEFAULT NULL,
  `prazo_id` int DEFAULT NULL,
  `atribuida_para` int DEFAULT NULL,
  `data_vencimento` date DEFAULT NULL,
  `concluida` tinyint(1) DEFAULT '0',
  `concluida_por` int DEFAULT NULL,
  `concluida_em` datetime DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `processo_id` (`processo_id`),
  KEY `pasta_id` (`pasta_id`),
  KEY `prazo_id` (`prazo_id`),
  KEY `atribuida_para` (`atribuida_para`),
  KEY `concluida_por` (`concluida_por`),
  KEY `criado_por` (`criado_por`),
  KEY `idx_concluida_vencimento` (`concluida`,`data_vencimento`),
  CONSTRAINT `fk_tarefas_tblpasta` FOREIGN KEY (`pasta_id`) REFERENCES `tblpasta` (`id`),
  CONSTRAINT `fk_tarefas_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`),
  CONSTRAINT `tarefas_ibfk_3` FOREIGN KEY (`prazo_id`) REFERENCES `prazos_processo` (`id`),
  CONSTRAINT `tarefas_ibfk_4` FOREIGN KEY (`atribuida_para`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `tarefas_ibfk_5` FOREIGN KEY (`concluida_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `tarefas_ibfk_6` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tblforum
DROP TABLE IF EXISTS `tblforum`;
CREATE TABLE IF NOT EXISTS `tblforum` (
  `id` int NOT NULL AUTO_INCREMENT,
  `abrev_nome` varchar(50) DEFAULT NULL COMMENT 'Abreviação para dropdowns/mensagens — ex: VT/B.Funda',
  `nome` varchar(150) NOT NULL,
  `cidade` varchar(100) DEFAULT NULL,
  `cep` varchar(8) DEFAULT NULL,
  `logradouro` varchar(300) DEFAULT NULL,
  `num_end` varchar(11) DEFAULT NULL,
  `compl_end` varchar(50) DEFAULT NULL,
  `bairro` varchar(100) DEFAULT NULL,
  `uf` varchar(2) DEFAULT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `alterado_por` int DEFAULT NULL,
  `alterado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `criado_por` (`criado_por`),
  KEY `alterado_por` (`alterado_por`),
  CONSTRAINT `tblforum_ibfk_1` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblforum_ibfk_2` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=39 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tblinstanciaproc
DROP TABLE IF EXISTS `tblinstanciaproc`;
CREATE TABLE IF NOT EXISTS `tblinstanciaproc` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `alterado_por` int DEFAULT NULL,
  `alterado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `criado_por` (`criado_por`),
  KEY `alterado_por` (`alterado_por`),
  CONSTRAINT `tblinstanciaproc_ibfk_1` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblinstanciaproc_ibfk_2` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tblpasta
DROP TABLE IF EXISTS `tblpasta`;
CREATE TABLE IF NOT EXISTS `tblpasta` (
  `id` int NOT NULL AUTO_INCREMENT,
  `numPasta` int NOT NULL,
  `area_direito` varchar(50) DEFAULT NULL COMMENT 'Ex: Trabalhista, Previdenciária, Família',
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `alterado_por` int DEFAULT NULL,
  `alterado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `numPasta` (`numPasta`),
  KEY `criado_por` (`criado_por`),
  KEY `alterado_por` (`alterado_por`),
  CONSTRAINT `tblpasta_ibfk_1` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblpasta_ibfk_2` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=8822 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tblproc
DROP TABLE IF EXISTS `tblproc`;
CREATE TABLE IF NOT EXISTS `tblproc` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pasta_id` int NOT NULL,
  `numProc` varchar(45) DEFAULT NULL,
  `cliente_polo` varchar(10) DEFAULT NULL,
  `NomeTituloProc` varchar(300) DEFAULT NULL,
  `vara_id` int DEFAULT NULL,
  `tipo_id` int DEFAULT NULL,
  `status_id` int DEFAULT NULL,
  `instancia_id` int DEFAULT NULL,
  `data_distribuicao` date DEFAULT NULL,
  `observacoes` text,
  `ativo` tinyint(1) DEFAULT '1',
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `alterado_por` int DEFAULT NULL,
  `alterado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `pasta_id` (`pasta_id`),
  KEY `vara_id` (`vara_id`),
  KEY `tipo_id` (`tipo_id`),
  KEY `status_id` (`status_id`),
  KEY `instancia_id` (`instancia_id`),
  KEY `criado_por` (`criado_por`),
  KEY `alterado_por` (`alterado_por`),
  KEY `idx_proc_numproc` (`numProc`),
  KEY `idx_proc_pasta_ativo` (`pasta_id`,`ativo`),
  CONSTRAINT `tblproc_ibfk_1` FOREIGN KEY (`pasta_id`) REFERENCES `tblpasta` (`id`),
  CONSTRAINT `tblproc_ibfk_2` FOREIGN KEY (`vara_id`) REFERENCES `tblvara` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_3` FOREIGN KEY (`tipo_id`) REFERENCES `tbltipoproc` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_4` FOREIGN KEY (`status_id`) REFERENCES `tblstatusproc` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_5` FOREIGN KEY (`instancia_id`) REFERENCES `tblinstanciaproc` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_6` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_7` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6012 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tblstatusproc
DROP TABLE IF EXISTS `tblstatusproc`;
CREATE TABLE IF NOT EXISTS `tblstatusproc` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `alterado_por` int DEFAULT NULL,
  `alterado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `criado_por` (`criado_por`),
  KEY `alterado_por` (`alterado_por`),
  CONSTRAINT `tblstatusproc_ibfk_1` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblstatusproc_ibfk_2` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tbltipoproc
DROP TABLE IF EXISTS `tbltipoproc`;
CREATE TABLE IF NOT EXISTS `tbltipoproc` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `codTipoProc` varchar(1) DEFAULT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `alterado_por` int DEFAULT NULL,
  `alterado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `criado_por` (`criado_por`),
  KEY `alterado_por` (`alterado_por`),
  CONSTRAINT `tbltipoproc_ibfk_1` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tbltipoproc_ibfk_2` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tbltituloprocautor
DROP TABLE IF EXISTS `tbltituloprocautor`;
CREATE TABLE IF NOT EXISTS `tbltituloprocautor` (
  `id` int NOT NULL AUTO_INCREMENT,
  `proc_id` int NOT NULL,
  `tipo_pessoa` enum('fisica','juridica') NOT NULL,
  `pessoa_id` int NOT NULL,
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `proc_id` (`proc_id`),
  KEY `criado_por` (`criado_por`),
  KEY `idx_titautor_pessoa` (`pessoa_id`,`tipo_pessoa`,`proc_id`),
  CONSTRAINT `tbltituloprocautor_ibfk_1` FOREIGN KEY (`proc_id`) REFERENCES `tblproc` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tbltituloprocautor_ibfk_2` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6012 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tbltituloprocreu
DROP TABLE IF EXISTS `tbltituloprocreu`;
CREATE TABLE IF NOT EXISTS `tbltituloprocreu` (
  `id` int NOT NULL AUTO_INCREMENT,
  `proc_id` int NOT NULL,
  `tipo_pessoa` enum('fisica','juridica') NOT NULL,
  `pessoa_id` int NOT NULL,
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `proc_id` (`proc_id`),
  KEY `criado_por` (`criado_por`),
  KEY `idx_titreu_pessoa` (`pessoa_id`,`tipo_pessoa`,`proc_id`),
  CONSTRAINT `tbltituloprocreu_ibfk_1` FOREIGN KEY (`proc_id`) REFERENCES `tblproc` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tbltituloprocreu_ibfk_2` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6015 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tblvara
DROP TABLE IF EXISTS `tblvara`;
CREATE TABLE IF NOT EXISTS `tblvara` (
  `id` int NOT NULL AUTO_INCREMENT,
  `abrev_nome` varchar(50) DEFAULT NULL COMMENT 'Abreviação para dropdowns/mensagens — ex: 04ªVT/SP-ZL',
  `forum_id` int NOT NULL,
  `nome` varchar(150) NOT NULL,
  `codVaraNoProc` varchar(15) DEFAULT NULL,
  `compl_end` varchar(100) DEFAULT NULL,
  `tel` varchar(50) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `alterado_por` int DEFAULT NULL,
  `alterado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `forum_id` (`forum_id`),
  KEY `criado_por` (`criado_por`),
  KEY `alterado_por` (`alterado_por`),
  CONSTRAINT `tblvara_ibfk_1` FOREIGN KEY (`forum_id`) REFERENCES `tblforum` (`id`),
  CONSTRAINT `tblvara_ibfk_2` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblvara_ibfk_3` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=489 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.telefones_pf
DROP TABLE IF EXISTS `telefones_pf`;
CREATE TABLE IF NOT EXISTS `telefones_pf` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pessoa_id` int NOT NULL,
  `numero` varchar(20) NOT NULL,
  `tipo` varchar(100) DEFAULT 'Celular' COMMENT 'Descrição livre: Celular, Comercial, esposa Edna, etc.',
  `principal` tinyint(1) DEFAULT '0',
  `ativo` tinyint(1) DEFAULT '1',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pessoa_id` (`pessoa_id`),
  CONSTRAINT `telefones_pf_ibfk_1` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_fisicas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22252 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.telefones_pj
DROP TABLE IF EXISTS `telefones_pj`;
CREATE TABLE IF NOT EXISTS `telefones_pj` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pessoa_id` int NOT NULL,
  `numero` varchar(20) NOT NULL,
  `tipo` varchar(100) DEFAULT 'Comercial' COMMENT 'Descrição livre: Comercial, Celular do sócio, etc.',
  `principal` tinyint(1) DEFAULT '0',
  `ativo` tinyint(1) DEFAULT '1',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pessoa_id` (`pessoa_id`),
  CONSTRAINT `telefones_pj_ibfk_1` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_juridicas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tipo_audiencia
DROP TABLE IF EXISTS `tipo_audiencia`;
CREATE TABLE IF NOT EXISTS `tipo_audiencia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tipo_pericia
DROP TABLE IF EXISTS `tipo_pericia`;
CREATE TABLE IF NOT EXISTS `tipo_pericia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tipo_prazo
DROP TABLE IF EXISTS `tipo_prazo`;
CREATE TABLE IF NOT EXISTS `tipo_prazo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.usuarios
DROP TABLE IF EXISTS `usuarios`;
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(150) NOT NULL,
  `login` varchar(80) NOT NULL,
  `senha_hash` varchar(255) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `oab` varchar(30) DEFAULT NULL,
  `tipo` varchar(30) DEFAULT 'advogado',
  `nivel` tinyint NOT NULL DEFAULT '2',
  `ativo` tinyint(1) DEFAULT '1',
  `ver_todos_processos` tinyint(1) DEFAULT '0',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int DEFAULT NULL,
  `ultimo_acesso` datetime DEFAULT NULL,
  `notif_email` tinyint(1) DEFAULT '1',
  `notif_tela` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_login` (`login`),
  KEY `fk_usuarios_criado_por` (`criado_por`),
  CONSTRAINT `fk_usuarios_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
