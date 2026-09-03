-- =====================================================================
-- ESTRUTURA DO BANCO — Sistema de Advocacia (NovoJud)
-- ---------------------------------------------------------------------
-- Gerado em 31/08/2026 a partir do banco LOCAL (sistema_advocacia), via:
--   mysqldump --no-data --databases --add-drop-database
--             --routines --triggers --events sistema_advocacia
-- Contém 79 tabelas — SOMENTE A ESTRUTURA, sem nenhum dado.
-- O banco não possui procedures, triggers, views nem events.
-- Os dados de partida (feriados, varas, tipos etc.) ficam em scripts/.
--
-- Conferido em 31/08/2026: estrutura idêntica às 3 instâncias em uso
-- (local, AWS-Antônio e AWS-Erick).
--
-- ATENÇÃO: este arquivo COMEÇA APAGANDO o banco inteiro
-- (DROP DATABASE IF EXISTS). Use apenas para montar uma INSTÂNCIA NOVA,
-- do zero. NUNCA rode em uma instância que já esteja em uso.
--
-- Versão anterior era de 18/08/2026 com 74 tabelas: faltavam parentesco,
-- pessoas_avisos_idade, pericia_local_reu, tblassuntoproc e
-- processo_assunto, além das colunas responsavel_id/parentesco_id em
-- pessoas_fisicas, pessoa_id em notificacoes e em_recuperacao_judicial
-- em pessoas_juridicas — uma instância criada por ela nasceria incompleta.
-- =====================================================================

-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: sistema_advocacia
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `sistema_advocacia`
--

/*!40000 DROP DATABASE IF EXISTS `sistema_advocacia`*/;

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `sistema_advocacia` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `sistema_advocacia`;

--
-- Table structure for table `acordo`
--

DROP TABLE IF EXISTS `acordo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `acordo` (
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
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `acordo_parcela`
--

DROP TABLE IF EXISTS `acordo_parcela`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `acordo_parcela` (
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
) ENGINE=InnoDB AUTO_INCREMENT=184 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `advogados_freela`
--

DROP TABLE IF EXISTS `advogados_freela`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `advogados_freela` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(200) NOT NULL,
  `oab` varchar(30) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `agenda_compromisso`
--

DROP TABLE IF EXISTS `agenda_compromisso`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agenda_compromisso` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `delegado_para` int DEFAULT NULL,
  `titulo` varchar(150) NOT NULL,
  `descricao` text,
  `publicacao_id` int DEFAULT NULL,
  `data` date NOT NULL,
  `hora_inicio` time DEFAULT NULL,
  `hora_fim` time DEFAULT NULL,
  `dia_todo` tinyint(1) NOT NULL DEFAULT '0',
  `escritorio` tinyint(1) NOT NULL DEFAULT '0',
  `concluido` tinyint(1) NOT NULL DEFAULT '0',
  `concluido_por` int DEFAULT NULL,
  `concluido_em` datetime DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `alterado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `data` (`data`),
  KEY `idx_agcomp_delegado` (`delegado_para`),
  KEY `idx_agcomp_concluido_por` (`concluido_por`),
  KEY `idx_agcomp_publicacao` (`publicacao_id`),
  CONSTRAINT `fk_agcomp_concluido_por` FOREIGN KEY (`concluido_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_agcomp_delegado` FOREIGN KEY (`delegado_para`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_agcomp_publicacao` FOREIGN KEY (`publicacao_id`) REFERENCES `publicacoes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_agcomp_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `andamento_processual`
--

DROP TABLE IF EXISTS `andamento_processual`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `andamento_processual` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processo_id` int NOT NULL,
  `data` date NOT NULL,
  `data_hora` datetime DEFAULT NULL,
  `descricao` text NOT NULL,
  `fonte` varchar(10) NOT NULL DEFAULT 'manual',
  `codigo_movimento` int DEFAULT NULL,
  `hash_movimento` char(40) DEFAULT NULL,
  `criado_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `editado_por` int DEFAULT NULL,
  `editado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_andamento_hash` (`hash_movimento`),
  KEY `processo_id` (`processo_id`),
  KEY `criado_por` (`criado_por`),
  KEY `editado_por` (`editado_por`),
  CONSTRAINT `andamento_processual_ibfk_2` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `andamento_processual_ibfk_3` FOREIGN KEY (`editado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_andamento_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5433 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ata_audiencia`
--

DROP TABLE IF EXISTS `ata_audiencia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ata_audiencia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `audiencia_id` int NOT NULL,
  `resultado` text,
  `houve_acordo` tinyint(1) DEFAULT '0',
  `valor_acordo` decimal(15,2) DEFAULT NULL,
  `parcelas` int DEFAULT NULL,
  `valor_parcela` decimal(15,2) DEFAULT NULL,
  `data_primeiro_pagamento` date DEFAULT NULL,
  `nova_audiencia` tinyint(1) DEFAULT '0',
  `teve_prazo` tinyint DEFAULT '0',
  `teve_pericia` tinyint DEFAULT '0',
  `teve_alvara` tinyint DEFAULT '0',
  `teve_desistencia` tinyint DEFAULT '0',
  `teve_retorno_autos` tinyint DEFAULT '0',
  `observacoes` text,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int NOT NULL,
  `advogado_id` int DEFAULT NULL,
  `advogado_freela_id` int DEFAULT NULL,
  `sem_advogado` tinyint DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `criado_por` (`criado_por`),
  KEY `idx_audiencia_id` (`audiencia_id`),
  KEY `fk_ata_advogado` (`advogado_id`),
  KEY `fk_ata_advogado_freela` (`advogado_freela_id`),
  CONSTRAINT `ata_audiencia_ibfk_1` FOREIGN KEY (`audiencia_id`) REFERENCES `audiencia` (`id`),
  CONSTRAINT `ata_audiencia_ibfk_2` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_ata_advogado` FOREIGN KEY (`advogado_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ata_advogado_freela` FOREIGN KEY (`advogado_freela_id`) REFERENCES `advogados_freela` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audiencia`
--

DROP TABLE IF EXISTS `audiencia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audiencia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processo_id` int NOT NULL,
  `tipo_audiencia_id` int NOT NULL,
  `data` date NOT NULL,
  `hora` time NOT NULL,
  `modalidade` varchar(30) DEFAULT 'presencial',
  `local` varchar(300) DEFAULT NULL,
  `observacoes` text,
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
  `publicacao_id` int DEFAULT NULL,
  `horario_ativo` tinyint GENERATED ALWAYS AS (CASE WHEN `status` IN ('agendada','adiada') THEN 1 ELSE NULL END) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_audiencia_horario_ativo` (`processo_id`,`data`,`hora`,`horario_ativo`),
  KEY `processo_id` (`processo_id`),
  KEY `tipo_audiencia_id` (`tipo_audiencia_id`),
  KEY `criado_por` (`criado_por`),
  KEY `aud_ibfk_alterado_por` (`alterado_por`),
  KEY `aud_ibfk_responsavel` (`responsavel_id`),
  KEY `aud_ibfk_resp_freela` (`responsavel_freela_id`),
  KEY `idx_aud_data_status` (`data`,`status`),
  KEY `fk_audiencia_publicacao` (`publicacao_id`),
  KEY `fk_audiencia_vara` (`vara_id`),
  CONSTRAINT `aud_ibfk_alterado_por` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `aud_ibfk_resp_freela` FOREIGN KEY (`responsavel_freela_id`) REFERENCES `advogados_freela` (`id`) ON DELETE SET NULL,
  CONSTRAINT `aud_ibfk_responsavel` FOREIGN KEY (`responsavel_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `audiencia_ibfk_2` FOREIGN KEY (`tipo_audiencia_id`) REFERENCES `tipo_audiencia` (`id`),
  CONSTRAINT `audiencia_ibfk_3` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_audiencia_publicacao` FOREIGN KEY (`publicacao_id`) REFERENCES `publicacoes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_audiencia_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`),
  CONSTRAINT `fk_audiencia_vara` FOREIGN KEY (`vara_id`) REFERENCES `tblvara` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audiencia_testemunhas`
--

DROP TABLE IF EXISTS `audiencia_testemunhas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audiencia_testemunhas` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audiencias_etiquetas`
--

DROP TABLE IF EXISTS `audiencias_etiquetas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audiencias_etiquetas` (
  `audiencia_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `slot` tinyint NOT NULL,
  PRIMARY KEY (`audiencia_id`,`usuario_id`),
  KEY `idx_aude_usuario` (`usuario_id`),
  CONSTRAINT `fk_aude_reg` FOREIGN KEY (`audiencia_id`) REFERENCES `audiencia` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_aude_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auditoria_audiencia`
--

DROP TABLE IF EXISTS `auditoria_audiencia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditoria_audiencia` (
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
) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auditoria_conta_corrente`
--

DROP TABLE IF EXISTS `auditoria_conta_corrente`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditoria_conta_corrente` (
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
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auditoria_etiqueta_escritorio`
--

DROP TABLE IF EXISTS `auditoria_etiqueta_escritorio`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditoria_etiqueta_escritorio` (
  `id` int NOT NULL AUTO_INCREMENT,
  `modulo` varchar(20) NOT NULL COMMENT 'processos | pessoas_fisicas | pessoas_juridicas',
  `registro_id` int NOT NULL COMMENT 'id do processo (tblproc) ou da pessoa, conforme o modulo',
  `slot_anterior` tinyint DEFAULT NULL COMMENT 'cor/etiqueta antes da acao (nulo = nao tinha nenhuma)',
  `slot_novo` tinyint DEFAULT NULL COMMENT 'cor/etiqueta depois da acao (nulo = foi removida)',
  `usuario_id` int NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_aee_modulo_registro` (`modulo`,`registro_id`),
  KEY `idx_aee_usuario` (`usuario_id`),
  KEY `idx_aee_data` (`criado_em`),
  CONSTRAINT `fk_aee_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auditoria_parcela`
--

DROP TABLE IF EXISTS `auditoria_parcela`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditoria_parcela` (
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
) ENGINE=InnoDB AUTO_INCREMENT=172 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auditoria_pericia`
--

DROP TABLE IF EXISTS `auditoria_pericia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditoria_pericia` (
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
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auditoria_prazo`
--

DROP TABLE IF EXISTS `auditoria_prazo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditoria_prazo` (
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
) ENGINE=InnoDB AUTO_INCREMENT=331 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `calendario`
--

DROP TABLE IF EXISTS `calendario`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calendario` (
  `data` date NOT NULL,
  `dia_util` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`data`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `configuracoes_escritorio`
--

DROP TABLE IF EXISTS `configuracoes_escritorio`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuracoes_escritorio` (
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
  `dias_processo_parado` int DEFAULT '365',
  `dias_audiencia_sem_adv` int DEFAULT '7',
  `setup_concluido` tinyint(1) DEFAULT '0',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `alerta_atrasado_ativo` tinyint(1) DEFAULT '1',
  `alerta_emails` text,
  `prazo_fazendo_timeout` int NOT NULL DEFAULT '60',
  `titulo_aba` varchar(100) DEFAULT NULL COMMENT 'Título exibido na aba do navegador',
  `mensagem_aniversario` text,
  `documentos_maiusculas` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Se 1, o nome do autor/reu sai em CAIXA ALTA nos documentos',
  `tempo_inatividade_min` int NOT NULL DEFAULT '15' COMMENT 'Minutos de inatividade ate o logout automatico (minimo 15)',
  `ata_advogado_obrigatorio` tinyint DEFAULT '0',
  `advogado_principal_id` int DEFAULT NULL,
  `oab_principal` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_config_advogado_principal` (`advogado_principal_id`),
  CONSTRAINT `fk_config_advogado_principal` FOREIGN KEY (`advogado_principal_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `configuracoes_integracoes`
--

DROP TABLE IF EXISTS `configuracoes_integracoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuracoes_integracoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `modulo` varchar(50) NOT NULL,
  `ativo` tinyint(1) DEFAULT '0',
  `configuracoes` json DEFAULT NULL,
  `atualizado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_configuracoes_integracoes_modulo` (`modulo`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `conta_corrente`
--

DROP TABLE IF EXISTS `conta_corrente`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conta_corrente` (
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
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `controle_versao_banco`
--

DROP TABLE IF EXISTS `controle_versao_banco`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `controle_versao_banco` (
  `numero` int NOT NULL,
  `descricao` varchar(300) NOT NULL,
  `sql_aplicado` mediumtext,
  `aplicado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`numero`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `emails_pf`
--

DROP TABLE IF EXISTS `emails_pf`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `emails_pf` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pessoa_id` int NOT NULL,
  `email` varchar(150) NOT NULL,
  `principal` tinyint(1) DEFAULT '0',
  `ativo` tinyint(1) DEFAULT '1',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `pessoa_id` (`pessoa_id`),
  CONSTRAINT `emails_pf_ibfk_1` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_fisicas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1782 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `emails_pj`
--

DROP TABLE IF EXISTS `emails_pj`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `emails_pj` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `estado_civil`
--

DROP TABLE IF EXISTS `estado_civil`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `estado_civil` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `etiquetas_definicoes`
--

DROP TABLE IF EXISTS `etiquetas_definicoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `etiquetas_definicoes` (
  `usuario_id` int NOT NULL,
  `modulo` varchar(20) NOT NULL,
  `slot` tinyint NOT NULL,
  `cor` varchar(20) NOT NULL,
  `significado` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`usuario_id`,`modulo`,`slot`),
  CONSTRAINT `fk_etqdef_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `etiquetas_escritorio_catalogo`
--

DROP TABLE IF EXISTS `etiquetas_escritorio_catalogo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `etiquetas_escritorio_catalogo` (
  `modulo` varchar(20) NOT NULL,
  `slot` tinyint NOT NULL,
  `cor` varchar(20) NOT NULL,
  `significado` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`modulo`,`slot`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `feriados`
--

DROP TABLE IF EXISTS `feriados`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `feriados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `data` date NOT NULL,
  `descricao` varchar(200) NOT NULL,
  `tipo` varchar(30) DEFAULT 'nacional',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_feriados_criado_por` (`criado_por`),
  CONSTRAINT `fk_feriados_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=544 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `forma_pagamento`
--

DROP TABLE IF EXISTS `forma_pagamento`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `forma_pagamento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(60) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `genero`
--

DROP TABLE IF EXISTS `genero`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `genero` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `historico_atendimento`
--

DROP TABLE IF EXISTS `historico_atendimento`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `historico_atendimento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo_pessoa` varchar(20) DEFAULT 'fisica',
  `pessoa_id` int NOT NULL,
  `descricao` text NOT NULL,
  `usuario_id` int NOT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `historico_atendimento_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `log_comunicacoes`
--

DROP TABLE IF EXISTS `log_comunicacoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `log_comunicacoes` (
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
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `log_documentos_gerados`
--

DROP TABLE IF EXISTS `log_documentos_gerados`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `log_documentos_gerados` (
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
) ENGINE=InnoDB AUTO_INCREMENT=66 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `log_emails`
--

DROP TABLE IF EXISTS `log_emails`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `log_emails` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `publicacao_id` int DEFAULT NULL,
  `enviado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `para` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `destinatario_nome` varchar(200) DEFAULT NULL,
  `mensagem` text,
  `assunto` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `status` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `erro` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  PRIMARY KEY (`id`),
  KEY `idx_log_emails_enviado_em` (`enviado_em`),
  KEY `idx_log_emails_status` (`status`),
  KEY `idx_log_emails_publicacao` (`publicacao_id`),
  CONSTRAINT `fk_log_emails_pub` FOREIGN KEY (`publicacao_id`) REFERENCES `publicacoes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=554 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `log_publicacoes`
--

DROP TABLE IF EXISTS `log_publicacoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `log_publicacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `quantidade` int NOT NULL,
  `data_publicacao` date DEFAULT NULL,
  `acao_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `usuario_id` (`usuario_id`),
  CONSTRAINT `log_publicacoes_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=156 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `logs_auditoria`
--

DROP TABLE IF EXISTS `logs_auditoria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `logs_auditoria` (
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
) ENGINE=InnoDB AUTO_INCREMENT=2293 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `modelo_documento`
--

DROP TABLE IF EXISTS `modelo_documento`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `modelo_documento` (
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
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `nacionalidade`
--

DROP TABLE IF EXISTS `nacionalidade`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `nacionalidade` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notificacoes`
--

DROP TABLE IF EXISTS `notificacoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notificacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `prazo_id` int DEFAULT NULL,
  `tarefa_id` int DEFAULT NULL,
  `pessoa_id` int DEFAULT NULL,
  `mensagem` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `lida` tinyint(1) DEFAULT '0',
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `prazo_id` (`prazo_id`),
  KEY `idx_notif_tarefa` (`tarefa_id`),
  KEY `idx_notif_pessoa` (`pessoa_id`),
  CONSTRAINT `fk_notif_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_fisicas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notif_prazo` FOREIGN KEY (`prazo_id`) REFERENCES `prazos_processo` (`id`),
  CONSTRAINT `fk_notif_tarefa` FOREIGN KEY (`tarefa_id`) REFERENCES `tarefas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notif_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=128 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `parabens_enviados`
--

DROP TABLE IF EXISTS `parabens_enviados`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parabens_enviados` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pessoa_id` int NOT NULL,
  `ano` smallint NOT NULL,
  `canal` varchar(10) NOT NULL,
  `usuario_id` int NOT NULL,
  `enviado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pessoa_ano` (`pessoa_id`,`ano`),
  CONSTRAINT `fk_parabens_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_fisicas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `parentesco`
--

DROP TABLE IF EXISTS `parentesco`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parentesco` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pastas_etiquetas`
--

DROP TABLE IF EXISTS `pastas_etiquetas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pastas_etiquetas` (
  `pasta_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `slot` tinyint NOT NULL,
  PRIMARY KEY (`pasta_id`,`usuario_id`),
  KEY `idx_paset_usuario` (`usuario_id`),
  CONSTRAINT `fk_paset_pasta` FOREIGN KEY (`pasta_id`) REFERENCES `tblpasta` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_paset_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pericia`
--

DROP TABLE IF EXISTS `pericia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pericia` (
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
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pericia_local_reu`
--

DROP TABLE IF EXISTS `pericia_local_reu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pericia_local_reu` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pericia_id` int NOT NULL,
  `tipo_pessoa` enum('fisica','juridica') NOT NULL,
  `pessoa_id` int NOT NULL,
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pericia_local_reu` (`pericia_id`,`tipo_pessoa`,`pessoa_id`),
  KEY `idx_pericia_local_reu_pericia` (`pericia_id`),
  KEY `idx_pericia_local_reu_pessoa` (`tipo_pessoa`,`pessoa_id`),
  CONSTRAINT `fk_pericia_local_reu_pericia` FOREIGN KEY (`pericia_id`) REFERENCES `pericia` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pericias_etiquetas`
--

DROP TABLE IF EXISTS `pericias_etiquetas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pericias_etiquetas` (
  `pericia_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `slot` tinyint NOT NULL,
  PRIMARY KEY (`pericia_id`,`usuario_id`),
  KEY `idx_perie_usuario` (`usuario_id`),
  CONSTRAINT `fk_perie_reg` FOREIGN KEY (`pericia_id`) REFERENCES `pericia` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_perie_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `permissoes`
--

DROP TABLE IF EXISTS `permissoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `usuario_id` int NOT NULL,
  `modulo` varchar(50) NOT NULL,
  `submodulo` varchar(50) DEFAULT NULL COMMENT 'Sub-módulo opcional — ex: andamentos, prazos, tarefas, audiencias, pericias',
  `acao` varchar(20) NOT NULL,
  `permitido` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_usuario_modulo` (`usuario_id`,`modulo`,`submodulo`,`acao`),
  CONSTRAINT `permissoes_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10638 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pessoas_avisos_idade`
--

DROP TABLE IF EXISTS `pessoas_avisos_idade`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pessoas_avisos_idade` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pessoa_id` int NOT NULL,
  `idade` tinyint unsigned NOT NULL,
  `avisado_em` datetime DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_aviso_pessoa_idade` (`pessoa_id`,`idade`),
  KEY `idx_aviso_pendente` (`avisado_em`),
  KEY `fk_aviso_criado_por` (`criado_por`),
  CONSTRAINT `fk_aviso_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_aviso_pessoa` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_fisicas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pessoas_fisicas`
--

DROP TABLE IF EXISTS `pessoas_fisicas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pessoas_fisicas` (
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
  `responsavel_id` int DEFAULT NULL,
  `parentesco_id` int DEFAULT NULL,
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
  KEY `idx_pf_responsavel` (`responsavel_id`),
  KEY `fk_pf_parentesco` (`parentesco_id`),
  CONSTRAINT `fk_pf_alterado_por` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_pf_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_pf_parentesco` FOREIGN KEY (`parentesco_id`) REFERENCES `parentesco` (`id`),
  CONSTRAINT `fk_pf_responsavel` FOREIGN KEY (`responsavel_id`) REFERENCES `pessoas_fisicas` (`id`),
  CONSTRAINT `pessoas_fisicas_ibfk_1` FOREIGN KEY (`estado_civil_id`) REFERENCES `estado_civil` (`id`),
  CONSTRAINT `pessoas_fisicas_ibfk_2` FOREIGN KEY (`profissao_id`) REFERENCES `profissao` (`id`),
  CONSTRAINT `pessoas_fisicas_ibfk_3` FOREIGN KEY (`genero_id`) REFERENCES `genero` (`id`),
  CONSTRAINT `pessoas_fisicas_ibfk_4` FOREIGN KEY (`nacionalidade_id`) REFERENCES `nacionalidade` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5094 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pessoas_fisicas_etiquetas_escritorio`
--

DROP TABLE IF EXISTS `pessoas_fisicas_etiquetas_escritorio`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pessoas_fisicas_etiquetas_escritorio` (
  `pessoa_id` int NOT NULL,
  `slot` tinyint NOT NULL,
  `marcado_por` int DEFAULT NULL,
  `marcado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`pessoa_id`),
  KEY `idx_pfee_marcado_por` (`marcado_por`),
  CONSTRAINT `fk_pfee_reg` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_fisicas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pfee_usuario` FOREIGN KEY (`marcado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pessoas_juridicas`
--

DROP TABLE IF EXISTS `pessoas_juridicas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pessoas_juridicas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `razao_social` varchar(200) NOT NULL,
  `nome_fantasia` varchar(200) DEFAULT NULL,
  `cnpj` varchar(18) DEFAULT NULL,
  `em_recuperacao_judicial` tinyint(1) NOT NULL DEFAULT '0',
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
) ENGINE=InnoDB AUTO_INCREMENT=2983 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `pessoas_juridicas_etiquetas_escritorio`
--

DROP TABLE IF EXISTS `pessoas_juridicas_etiquetas_escritorio`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pessoas_juridicas_etiquetas_escritorio` (
  `pessoa_id` int NOT NULL,
  `slot` tinyint NOT NULL,
  `marcado_por` int DEFAULT NULL,
  `marcado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`pessoa_id`),
  KEY `idx_pjee_marcado_por` (`marcado_por`),
  CONSTRAINT `fk_pjee_reg` FOREIGN KEY (`pessoa_id`) REFERENCES `pessoas_juridicas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pjee_usuario` FOREIGN KEY (`marcado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `prazo_subtipo`
--

DROP TABLE IF EXISTS `prazo_subtipo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prazo_subtipo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tipo_prazo_id` int NOT NULL,
  `nome` varchar(150) NOT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `tipo_prazo_id` (`tipo_prazo_id`),
  CONSTRAINT `prazo_subtipo_ibfk_1` FOREIGN KEY (`tipo_prazo_id`) REFERENCES `tipo_prazo` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=63 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `prazos_etiquetas`
--

DROP TABLE IF EXISTS `prazos_etiquetas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prazos_etiquetas` (
  `prazo_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `slot` tinyint NOT NULL,
  PRIMARY KEY (`prazo_id`,`usuario_id`),
  KEY `idx_praze_usuario` (`usuario_id`),
  CONSTRAINT `fk_praze_reg` FOREIGN KEY (`prazo_id`) REFERENCES `prazos_processo` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_praze_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `prazos_processo`
--

DROP TABLE IF EXISTS `prazos_processo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prazos_processo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processo_id` int NOT NULL,
  `publicacao_id` int DEFAULT NULL,
  `subtipo_id` int DEFAULT NULL,
  `descricao` varchar(1000) DEFAULT NULL,
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
  `notificar_conclusao` tinyint(1) NOT NULL DEFAULT '0',
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
  KEY `idx_pp_publicacao` (`publicacao_id`),
  CONSTRAINT `fk_pp_fazendo_por` FOREIGN KEY (`fazendo_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pp_publicacao` FOREIGN KEY (`publicacao_id`) REFERENCES `publicacoes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_prazos_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`),
  CONSTRAINT `prazos_processo_ibfk_2` FOREIGN KEY (`subtipo_id`) REFERENCES `prazo_subtipo` (`id`),
  CONSTRAINT `prazos_processo_ibfk_3` FOREIGN KEY (`delegado_para`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `prazos_processo_ibfk_4` FOREIGN KEY (`concluido_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `prazos_processo_ibfk_5` FOREIGN KEY (`status_alterado_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `prazos_processo_ibfk_6` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=244 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `processo_assunto`
--

DROP TABLE IF EXISTS `processo_assunto`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `processo_assunto` (
  `id` int NOT NULL AUTO_INCREMENT,
  `processo_id` int NOT NULL,
  `assunto_id` int NOT NULL,
  `criado_por` int DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_processo_assunto` (`processo_id`,`assunto_id`),
  KEY `idx_processo_assunto_assunto` (`assunto_id`),
  KEY `idx_processo_assunto_criado_por` (`criado_por`),
  CONSTRAINT `processo_assunto_ibfk_1` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`) ON DELETE CASCADE,
  CONSTRAINT `processo_assunto_ibfk_2` FOREIGN KEY (`assunto_id`) REFERENCES `tblassuntoproc` (`id`),
  CONSTRAINT `processo_assunto_ibfk_3` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `processo_perito`
--

DROP TABLE IF EXISTS `processo_perito`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `processo_perito` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `processos_etiquetas_escritorio`
--

DROP TABLE IF EXISTS `processos_etiquetas_escritorio`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `processos_etiquetas_escritorio` (
  `processo_id` int NOT NULL,
  `slot` tinyint NOT NULL,
  `marcado_por` int DEFAULT NULL,
  `marcado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`processo_id`),
  KEY `idx_pee_marcado_por` (`marcado_por`),
  CONSTRAINT `fk_pee_proc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pee_usuario` FOREIGN KEY (`marcado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `profissao`
--

DROP TABLE IF EXISTS `profissao`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `profissao` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=99 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `publicacao_usuario`
--

DROP TABLE IF EXISTS `publicacao_usuario`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `publicacao_usuario` (
  `id` int NOT NULL AUTO_INCREMENT,
  `publicacao_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `atribuida_por` int DEFAULT NULL,
  `atribuida_em` datetime DEFAULT NULL,
  `tratada` tinyint(1) NOT NULL DEFAULT '0',
  `tratada_em` datetime DEFAULT NULL,
  `tratada_por` int DEFAULT NULL,
  `motivo_sem_acao` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pu_pub_user` (`publicacao_id`,`usuario_id`),
  KEY `idx_pu_pub` (`publicacao_id`),
  KEY `idx_pu_user` (`usuario_id`),
  KEY `idx_pu_atribuida_por` (`atribuida_por`),
  KEY `idx_pu_tratada_por` (`tratada_por`),
  CONSTRAINT `fk_pu_pub` FOREIGN KEY (`publicacao_id`) REFERENCES `publicacoes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pu_user` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pu_atribuida_por` FOREIGN KEY (`atribuida_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pu_tratada_por` FOREIGN KEY (`tratada_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `publicacoes`
--

DROP TABLE IF EXISTS `publicacoes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `publicacoes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fonte` varchar(20) NOT NULL DEFAULT 'aasp',
  `id_cnj` bigint DEFAULT NULL,
  `data_publicacao` date NOT NULL,
  `numero_processo` varchar(45) DEFAULT NULL,
  `tribunal` varchar(20) DEFAULT NULL,
  `oab` varchar(20) DEFAULT NULL,
  `titulo` text,
  `cabecalho` text,
  `numero_publicacao` varchar(30) DEFAULT NULL,
  `numero_arquivo` varchar(30) DEFAULT NULL,
  `texto` mediumtext NOT NULL,
  `texto_hash` char(64) NOT NULL,
  `hash_cnj` varchar(255) DEFAULT NULL,
  `escritorio` tinyint(1) NOT NULL DEFAULT '1',
  `importada_por` int DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `direcionada_por` int DEFAULT NULL,
  `direcionada_em` datetime DEFAULT NULL,
  `tratada` tinyint(1) NOT NULL DEFAULT '0',
  `tratada_por` int DEFAULT NULL,
  `tratada_em` datetime DEFAULT NULL,
  `motivo_sem_acao` varchar(500) DEFAULT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=2195 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `publicacoes_etiquetas`
--

DROP TABLE IF EXISTS `publicacoes_etiquetas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `publicacoes_etiquetas` (
  `publicacao_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `slot` tinyint NOT NULL,
  PRIMARY KEY (`publicacao_id`,`usuario_id`),
  KEY `idx_pube_usuario` (`usuario_id`),
  CONSTRAINT `fk_pube_reg` FOREIGN KEY (`publicacao_id`) REFERENCES `publicacoes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pube_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `publicacoes_lidas`
--

DROP TABLE IF EXISTS `publicacoes_lidas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `publicacoes_lidas` (
  `publicacao_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `lida_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`publicacao_id`,`usuario_id`),
  KEY `idx_pl_usuario` (`usuario_id`),
  CONSTRAINT `fk_pl_pub` FOREIGN KEY (`publicacao_id`) REFERENCES `publicacoes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pl_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `reset_tokens`
--

DROP TABLE IF EXISTS `reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reset_tokens` (
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
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tarefas`
--

DROP TABLE IF EXISTS `tarefas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tarefas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `titulo` varchar(300) NOT NULL,
  `descricao` text,
  `prioridade` varchar(20) DEFAULT 'normal',
  `processo_id` int DEFAULT NULL,
  `pasta_id` int DEFAULT NULL,
  `prazo_id` int DEFAULT NULL,
  `publicacao_id` int DEFAULT NULL,
  `atribuida_para` int DEFAULT NULL,
  `data_vencimento` date DEFAULT NULL,
  `concluida` tinyint(1) DEFAULT '0',
  `concluida_por` int DEFAULT NULL,
  `concluida_em` datetime DEFAULT NULL,
  `criado_em` datetime DEFAULT CURRENT_TIMESTAMP,
  `criado_por` int NOT NULL,
  `notificar_conclusao` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `processo_id` (`processo_id`),
  KEY `pasta_id` (`pasta_id`),
  KEY `prazo_id` (`prazo_id`),
  KEY `atribuida_para` (`atribuida_para`),
  KEY `concluida_por` (`concluida_por`),
  KEY `criado_por` (`criado_por`),
  KEY `idx_concluida_vencimento` (`concluida`,`data_vencimento`),
  KEY `idx_tarefas_publicacao` (`publicacao_id`),
  CONSTRAINT `fk_tarefas_publicacao` FOREIGN KEY (`publicacao_id`) REFERENCES `publicacoes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tarefas_tblpasta` FOREIGN KEY (`pasta_id`) REFERENCES `tblpasta` (`id`),
  CONSTRAINT `fk_tarefas_tblproc` FOREIGN KEY (`processo_id`) REFERENCES `tblproc` (`id`),
  CONSTRAINT `tarefas_ibfk_3` FOREIGN KEY (`prazo_id`) REFERENCES `prazos_processo` (`id`),
  CONSTRAINT `tarefas_ibfk_4` FOREIGN KEY (`atribuida_para`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `tarefas_ibfk_5` FOREIGN KEY (`concluida_por`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `tarefas_ibfk_6` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=254 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tarefas_etiquetas`
--

DROP TABLE IF EXISTS `tarefas_etiquetas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tarefas_etiquetas` (
  `tarefa_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `slot` tinyint NOT NULL,
  PRIMARY KEY (`tarefa_id`,`usuario_id`),
  KEY `idx_tare_usuario` (`usuario_id`),
  CONSTRAINT `fk_tare_reg` FOREIGN KEY (`tarefa_id`) REFERENCES `tarefas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tare_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tblassuntoproc`
--

DROP TABLE IF EXISTS `tblassuntoproc`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tblassuntoproc` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(150) NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_por` int DEFAULT NULL,
  `criado_em` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `alterado_por` int DEFAULT NULL,
  `alterado_em` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tblassuntoproc_nome` (`nome`),
  KEY `idx_tblassuntoproc_ativo_nome` (`ativo`,`nome`),
  KEY `idx_tblassuntoproc_criado_por` (`criado_por`),
  KEY `idx_tblassuntoproc_alterado_por` (`alterado_por`),
  CONSTRAINT `tblassuntoproc_ibfk_1` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblassuntoproc_ibfk_2` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tblforum`
--

DROP TABLE IF EXISTS `tblforum`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tblforum` (
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
) ENGINE=InnoDB AUTO_INCREMENT=149 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tblinstanciaproc`
--

DROP TABLE IF EXISTS `tblinstanciaproc`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tblinstanciaproc` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tblpasta`
--

DROP TABLE IF EXISTS `tblpasta`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tblpasta` (
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
) ENGINE=InnoDB AUTO_INCREMENT=8880 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tblproc`
--

DROP TABLE IF EXISTS `tblproc`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tblproc` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pasta_id` int NOT NULL,
  `numProc` varchar(45) DEFAULT NULL,
  `protocolo` varchar(60) DEFAULT NULL,
  `datajud_sincronizado_em` datetime DEFAULT NULL,
  `cliente_polo` varchar(10) DEFAULT NULL,
  `NomeTituloProc` varchar(300) DEFAULT NULL,
  `vara_id` int DEFAULT NULL,
  `tipo_id` int DEFAULT NULL,
  `status_id` int DEFAULT NULL,
  `instancia_id` int DEFAULT NULL,
  `data_distribuicao` date DEFAULT NULL,
  `observacoes` text,
  `responsavel_id` int DEFAULT NULL,
  `oab_processo` varchar(30) DEFAULT NULL,
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
  KEY `idx_proc_protocolo` (`protocolo`),
  KEY `fk_tblproc_responsavel` (`responsavel_id`),
  CONSTRAINT `fk_tblproc_responsavel` FOREIGN KEY (`responsavel_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_1` FOREIGN KEY (`pasta_id`) REFERENCES `tblpasta` (`id`),
  CONSTRAINT `tblproc_ibfk_2` FOREIGN KEY (`vara_id`) REFERENCES `tblvara` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_3` FOREIGN KEY (`tipo_id`) REFERENCES `tbltipoproc` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_4` FOREIGN KEY (`status_id`) REFERENCES `tblstatusproc` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_5` FOREIGN KEY (`instancia_id`) REFERENCES `tblinstanciaproc` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_6` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tblproc_ibfk_7` FOREIGN KEY (`alterado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6146 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tblstatusproc`
--

DROP TABLE IF EXISTS `tblstatusproc`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tblstatusproc` (
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
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbltipoproc`
--

DROP TABLE IF EXISTS `tbltipoproc`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbltipoproc` (
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
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbltituloprocautor`
--

DROP TABLE IF EXISTS `tbltituloprocautor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbltituloprocautor` (
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
) ENGINE=InnoDB AUTO_INCREMENT=6168 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tbltituloprocreu`
--

DROP TABLE IF EXISTS `tbltituloprocreu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tbltituloprocreu` (
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
) ENGINE=InnoDB AUTO_INCREMENT=6178 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tblvara`
--

DROP TABLE IF EXISTS `tblvara`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tblvara` (
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
) ENGINE=InnoDB AUTO_INCREMENT=659 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `telefones_pf`
--

DROP TABLE IF EXISTS `telefones_pf`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `telefones_pf` (
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
) ENGINE=InnoDB AUTO_INCREMENT=22429 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `telefones_pj`
--

DROP TABLE IF EXISTS `telefones_pj`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `telefones_pj` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tipo_audiencia`
--

DROP TABLE IF EXISTS `tipo_audiencia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tipo_audiencia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tipo_pericia`
--

DROP TABLE IF EXISTS `tipo_pericia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tipo_pericia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tipo_prazo`
--

DROP TABLE IF EXISTS `tipo_prazo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tipo_prazo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nome` varchar(100) NOT NULL,
  `ativo` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
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
  `sessao_atual` varchar(64) DEFAULT NULL,
  `cores_agenda` varchar(255) DEFAULT NULL,
  `cores_menu` varchar(255) DEFAULT NULL,
  `cor_linha` varchar(20) DEFAULT NULL,
  `cor_linha_lida` varchar(20) DEFAULT NULL,
  `google_agenda_ativo` tinyint(1) NOT NULL DEFAULT '0',
  `google_agenda_email` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_login` (`login`),
  KEY `fk_usuarios_criado_por` (`criado_por`),
  CONSTRAINT `fk_usuarios_criado_por` FOREIGN KEY (`criado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping events for database 'sistema_advocacia'
--

--
-- Dumping routines for database 'sistema_advocacia'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-31 10:27:59
