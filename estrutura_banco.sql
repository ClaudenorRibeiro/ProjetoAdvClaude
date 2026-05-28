-- --------------------------------------------------------
-- Servidor:                     127.0.0.1
-- Versão do servidor:           8.0.46 - MySQL Community Server - GPL
-- OS do Servidor:               Win64
-- HeidiSQL Versão:              12.7.0.6850
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
CREATE DATABASE IF NOT EXISTS `sistema_advocacia` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `sistema_advocacia`;

-- Copiando estrutura para tabela sistema_advocacia.andamento_processual
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.ata_audiencia
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
CREATE TABLE IF NOT EXISTS `audiencia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processo_id` int NOT NULL,
  `tipo_audiencia_id` int DEFAULT NULL,
  `data` date NOT NULL,
  `hora` time NOT NULL,
  `modalidade` varchar(30) DEFAULT 'presencial',
  `local` varchar(300) DEFAULT NULL,
  `plataforma_virtual` varchar(100) DEFAULT NULL,
  `link_virtual` varchar(500) DEFAULT NULL,
  `comunicado_enviado` tinyint(1) DEFAULT '0',
  `ata_impressa` tinyint(1) DEFAULT '0',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `processo_id` (`processo_id`),
  KEY `tipo_audiencia_id` (`tipo_audiencia_id`),
  KEY `criado_por` (`criado_por`),
  CONSTRAINT `audiencia_ibfk_2` FOREIGN KEY (`tipo_audiencia_id`) REFERENCES `tipo_audiencia` (`id`),
  CONSTRAINT `audiencia_ibfk_3` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_audiencia_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.auditoria_prazo
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.calendario
CREATE TABLE IF NOT EXISTS `calendario` (
  `data` date NOT NULL,
  `dia_util` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`data`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.configuracoes_escritorio
CREATE TABLE IF NOT EXISTS `configuracoes_escritorio` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(200) NOT NULL,
  `cnpj_cpf` varchar(20) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `telefone` varchar(20) DEFAULT NULL,
  `endereco` varchar(300) DEFAULT NULL,
  `logo_path` varchar(300) DEFAULT NULL,
  `cor_principal` varchar(7) DEFAULT '#1a56db',
  `horario_alerta_prazos` time DEFAULT '18:00:00',
  `dias_alerta_audiencia` int DEFAULT '3',
  `dias_alerta_pericia` int DEFAULT '2',
  `dias_sem_movimentacao` int DEFAULT '30',
  `setup_concluido` tinyint(1) DEFAULT '0',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.configuracoes_integracoes
CREATE TABLE IF NOT EXISTS `configuracoes_integracoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `modulo` varchar(50) NOT NULL,
  `ativo` tinyint(1) DEFAULT '0',
  `configuracoes` json DEFAULT NULL,
  `atualizado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.conta_corrente_pasta
CREATE TABLE IF NOT EXISTS `conta_corrente_pasta` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pasta_id` int NOT NULL,
  `data` date NOT NULL,
  `descricao` varchar(300) NOT NULL,
  `valor` decimal(15,2) NOT NULL,
  `tipo` varchar(20) DEFAULT 'credito',
  `usuario_id` int NOT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pasta_id` (`pasta_id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `conta_corrente_pasta_ibfk_2` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_contacorrente_tblpasta` FOREIGN KEY (`pasta_id`) REFERENCES `tblpasta` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.emails_pf
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.emails_pj
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
CREATE TABLE IF NOT EXISTS `estado_civil` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.feriados
CREATE TABLE IF NOT EXISTS `feriados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `data` date NOT NULL,
  `descricao` varchar(200) NOT NULL,
  `tipo` varchar(30) DEFAULT 'nacional',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.genero
CREATE TABLE IF NOT EXISTS `genero` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.historico_atendimento
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

-- Copiando estrutura para tabela sistema_advocacia.honorarios
CREATE TABLE IF NOT EXISTS `honorarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pasta_id` int NOT NULL,
  `tipo` varchar(30) DEFAULT 'fixo',
  `percentual` decimal(5,2) DEFAULT NULL,
  `valor_fixo` decimal(15,2) DEFAULT NULL,
  `observacoes` text,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pasta_id` (`pasta_id`),
  CONSTRAINT `fk_honorarios_tblpasta` FOREIGN KEY (`pasta_id`) REFERENCES `tblpasta` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.logs_auditoria
CREATE TABLE IF NOT EXISTS `logs_auditoria` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int DEFAULT NULL,
  `tabela` varchar(50) NOT NULL,
  `acao` varchar(20) NOT NULL,
  `registro_id` int DEFAULT NULL,
  `dados_antigos` json DEFAULT NULL,
  `dados_novos` json DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tabela` (`tabela`),
  KEY `idx_usuario` (`usuario_id`),
  KEY `idx_data` (`criado_em`)
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.log_comunicacoes
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.log_documentos_gerados
CREATE TABLE IF NOT EXISTS `log_documentos_gerados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `modelo_id` int NOT NULL,
  `processo_id` int DEFAULT NULL,
  `pasta_id` int DEFAULT NULL,
  `formato` varchar(10) DEFAULT 'pdf',
  `usuario_id` int NOT NULL,
  `gerado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `modelo_id` (`modelo_id`),
  KEY `processo_id` (`processo_id`),
  KEY `pasta_id` (`pasta_id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `fk_logdocs_tblpasta` FOREIGN KEY (`pasta_id`) REFERENCES `tblpasta` (`id`),
  CONSTRAINT `fk_logdocs_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`),
  CONSTRAINT `log_documentos_gerados_ibfk_1` FOREIGN KEY (`modelo_id`) REFERENCES `modelo_documento` (`id`),
  CONSTRAINT `log_documentos_gerados_ibfk_4` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.log_publicacoes
CREATE TABLE IF NOT EXISTS `log_publicacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `quantidade` int NOT NULL,
  `data_publicacao` date DEFAULT NULL,
  `acao_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `log_publicacoes_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.modelo_documento
CREATE TABLE IF NOT EXISTS `modelo_documento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(150) NOT NULL,
  `descricao` varchar(300) DEFAULT NULL,
  `conteudo` longtext NOT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `criado_por` (`criado_por`),
  CONSTRAINT `modelo_documento_ibfk_1` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.parcerias
CREATE TABLE IF NOT EXISTS `parcerias` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processo_id` int NOT NULL,
  `descricao` varchar(200) NOT NULL,
  `tipo` varchar(20) DEFAULT 'fixo',
  `percentual` decimal(5,2) DEFAULT NULL,
  `valor_fixo` decimal(15,2) DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `processo_id` (`processo_id`),
  KEY `criado_por` (`criado_por`),
  CONSTRAINT `fk_parcerias_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`),
  CONSTRAINT `parcerias_ibfk_2` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.pericia
CREATE TABLE IF NOT EXISTS `pericia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processo_id` int NOT NULL,
  `tipo_pericia_id` int DEFAULT NULL,
  `data` date NOT NULL,
  `hora` time DEFAULT NULL,
  `local` varchar(300) DEFAULT NULL,
  `perito_tipo` varchar(20) DEFAULT NULL,
  `perito_id` int DEFAULT NULL,
  `assistente_tecnico_id` int DEFAULT NULL,
  `comunicado_enviado` tinyint(1) DEFAULT '0',
  `email_perito_enviado` tinyint(1) DEFAULT '0',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `processo_id` (`processo_id`),
  KEY `tipo_pericia_id` (`tipo_pericia_id`),
  KEY `assistente_tecnico_id` (`assistente_tecnico_id`),
  KEY `criado_por` (`criado_por`),
  CONSTRAINT `fk_pericia_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`),
  CONSTRAINT `pericia_ibfk_2` FOREIGN KEY (`tipo_pericia_id`) REFERENCES `tipo_pericia` (`id`),
  CONSTRAINT `pericia_ibfk_3` FOREIGN KEY (`assistente_tecnico_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `pericia_ibfk_4` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.permissoes
CREATE TABLE IF NOT EXISTS `permissoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `modulo` varchar(50) NOT NULL,
  `acao` varchar(20) NOT NULL,
  `permitido` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_usuario_modulo` (`usuario_id`,`modulo`,`acao`),
  CONSTRAINT `permissoes_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.pessoas_fisicas
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
  KEY `estado_civil_id` (`estado_civil_id`),
  KEY `profissao_id` (`profissao_id`),
  KEY `genero_id` (`genero_id`),
  KEY `fk_pf_criado_por` (`criado_por`),
  KEY `fk_pf_alterado_por` (`alterado_por`),
  CONSTRAINT `fk_pf_alterado_por` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_pf_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `pessoas_fisicas_ibfk_1` FOREIGN KEY (`estado_civil_id`) REFERENCES `estado_civil` (`id`),
  CONSTRAINT `pessoas_fisicas_ibfk_2` FOREIGN KEY (`profissao_id`) REFERENCES `profissao` (`id`),
  CONSTRAINT `pessoas_fisicas_ibfk_3` FOREIGN KEY (`genero_id`) REFERENCES `genero` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.pessoas_juridicas
CREATE TABLE IF NOT EXISTS `pessoas_juridicas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `razao_social` varchar(200) NOT NULL,
  `nome_fantasia` varchar(200) DEFAULT NULL,
  `cnpj` varchar(18) DEFAULT NULL,
  `inscricao_estadual` varchar(30) DEFAULT NULL,
  `representante_legal` varchar(200) DEFAULT NULL,
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.prazos_processo
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
  PRIMARY KEY (`id`),
  KEY `processo_id` (`processo_id`),
  KEY `subtipo_id` (`subtipo_id`),
  KEY `delegado_para` (`delegado_para`),
  KEY `concluido_por` (`concluido_por`),
  KEY `status_alterado_por` (`status_alterado_por`),
  KEY `criado_por` (`criado_por`),
  CONSTRAINT `fk_prazos_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`),
  CONSTRAINT `prazos_processo_ibfk_2` FOREIGN KEY (`subtipo_id`) REFERENCES `prazo_subtipo` (`id`),
  CONSTRAINT `prazos_processo_ibfk_3` FOREIGN KEY (`delegado_para`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `prazos_processo_ibfk_4` FOREIGN KEY (`concluido_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `prazos_processo_ibfk_5` FOREIGN KEY (`status_alterado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `prazos_processo_ibfk_6` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.prazo_subtipo
CREATE TABLE IF NOT EXISTS `prazo_subtipo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo_prazo_id` int NOT NULL,
  `nome` varchar(150) NOT NULL,
  `dias_padrao` int DEFAULT NULL,
  `tipo_dias` varchar(20) DEFAULT 'uteis',
  `ativo` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `tipo_prazo_id` (`tipo_prazo_id`),
  CONSTRAINT `prazo_subtipo_ibfk_1` FOREIGN KEY (`tipo_prazo_id`) REFERENCES `tipo_prazo` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.profissao
CREATE TABLE IF NOT EXISTS `profissao` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.publicacoes
CREATE TABLE IF NOT EXISTS `publicacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `data_publicacao` date NOT NULL,
  `oab` varchar(30) NOT NULL,
  `numero_processo` varchar(30) DEFAULT NULL,
  `texto` longtext NOT NULL,
  `tratada` tinyint(1) DEFAULT '0',
  `tratada_por` int DEFAULT NULL,
  `tratada_em` datetime DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `tratada_por` (`tratada_por`),
  KEY `idx_data` (`data_publicacao`),
  KEY `idx_processo` (`numero_processo`),
  CONSTRAINT `publicacoes_ibfk_1` FOREIGN KEY (`tratada_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.reset_tokens
CREATE TABLE IF NOT EXISTS `reset_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `usado` tinyint(1) NOT NULL DEFAULT '0',
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `reset_tokens_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tarefas
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
  CONSTRAINT `fk_tarefas_tblpasta` FOREIGN KEY (`pasta_id`) REFERENCES `tblpasta` (`id`),
  CONSTRAINT `fk_tarefas_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`),
  CONSTRAINT `tarefas_ibfk_3` FOREIGN KEY (`prazo_id`) REFERENCES `prazos_processo` (`id`),
  CONSTRAINT `tarefas_ibfk_4` FOREIGN KEY (`atribuida_para`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `tarefas_ibfk_5` FOREIGN KEY (`concluida_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `tarefas_ibfk_6` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tblforum
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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tblinstanciaproc
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tblproc
CREATE TABLE IF NOT EXISTS `tblproc` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pasta_id` int NOT NULL,
  `numProc` varchar(45) DEFAULT NULL,
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
  CONSTRAINT `tblproc_ibfk_1` FOREIGN KEY (`pasta_id`) REFERENCES `tblpasta` (`id`),
  CONSTRAINT `tblproc_ibfk_2` FOREIGN KEY (`vara_id`) REFERENCES `tblvara` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_3` FOREIGN KEY (`tipo_id`) REFERENCES `tbltipoproc` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_4` FOREIGN KEY (`status_id`) REFERENCES `tblstatusproc` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_5` FOREIGN KEY (`instancia_id`) REFERENCES `tblinstanciaproc` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_6` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_7` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tblstatusproc
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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tbltipoproc
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
  CONSTRAINT `tbltituloprocautor_ibfk_1` FOREIGN KEY (`proc_id`) REFERENCES `tblproc` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tbltituloprocautor_ibfk_2` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tbltituloprocreu
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
  CONSTRAINT `tbltituloprocreu_ibfk_1` FOREIGN KEY (`proc_id`) REFERENCES `tblproc` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tbltituloprocreu_ibfk_2` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tblvara
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
) ENGINE=InnoDB AUTO_INCREMENT=362 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.telefones_pf
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
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.telefones_pj
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
CREATE TABLE IF NOT EXISTS `tipo_audiencia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tipo_pericia
CREATE TABLE IF NOT EXISTS `tipo_pericia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.tipo_prazo
CREATE TABLE IF NOT EXISTS `tipo_prazo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

-- Copiando estrutura para tabela sistema_advocacia.usuarios
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
  PRIMARY KEY (`id`),
  KEY `idx_login` (`login`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Exportação de dados foi desmarcado.

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
