-- ============================================================
-- PROCESSOS — NOVO MODELO (9 novas tabelas)
-- Sistema de Advocacia — migração 002
-- Execute no banco `sistema_advocacia` após a migração 001
-- As tabelas antigas (forum, vara, pasta, processo, partes_processo)
-- são MANTIDAS para compatibilidade com prazos/audiências/andamentos
-- ============================================================

USE sistema_advocacia;

-- ============================================================
-- 1. tblForum — Fóruns (substitui a tabela `forum`)
-- ============================================================
CREATE TABLE IF NOT EXISTS tblForum (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  nome         VARCHAR(150) NOT NULL,
  cidade       VARCHAR(100),
  estado       VARCHAR(2),
  ativo        TINYINT(1) DEFAULT 1,
  criado_por   INT,
  criado_em    DATETIME DEFAULT NOW(),
  alterado_por INT,
  alterado_em  DATETIME,
  FOREIGN KEY (criado_por)   REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (alterado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 2. tblVara — Varas vinculadas a fóruns
-- ============================================================
CREATE TABLE IF NOT EXISTS tblVara (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  forum_id      INT NOT NULL,
  nome          VARCHAR(150) NOT NULL,
  codVaraNoProc VARCHAR(15),   -- Segmento CNJ que identifica a vara: ex. 5.02.0001
  ativo         TINYINT(1) DEFAULT 1,
  criado_por    INT,
  criado_em     DATETIME DEFAULT NOW(),
  alterado_por  INT,
  alterado_em   DATETIME,
  FOREIGN KEY (forum_id)     REFERENCES tblForum(id),
  FOREIGN KEY (criado_por)   REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (alterado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 3. tblTipoProc — Tipo/área do processo (cadastrável pelo admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS tblTipoProc (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  nome         VARCHAR(100) NOT NULL,
  ativo        TINYINT(1) DEFAULT 1,
  criado_por   INT,
  criado_em    DATETIME DEFAULT NOW(),
  alterado_por INT,
  alterado_em  DATETIME,
  FOREIGN KEY (criado_por)   REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (alterado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tblTipoProc (nome) VALUES
  ('Trabalhista'), ('Previdenciário'), ('Família'),
  ('Cível'), ('Criminal'), ('Tributário'), ('Outro');

-- ============================================================
-- 4. tblStatusProc — Status do processo (cadastrável pelo admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS tblStatusProc (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  nome         VARCHAR(100) NOT NULL,
  ativo        TINYINT(1) DEFAULT 1,
  criado_por   INT,
  criado_em    DATETIME DEFAULT NOW(),
  alterado_por INT,
  alterado_em  DATETIME,
  FOREIGN KEY (criado_por)   REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (alterado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tblStatusProc (nome) VALUES
  ('Ativo'), ('Suspenso'), ('Arquivado'), ('Encerrado'), ('Recursal'), ('Execução');

-- ============================================================
-- 5. tblInstanciaProc — Instâncias do processo (cadastrável pelo admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS tblInstanciaProc (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  nome         VARCHAR(100) NOT NULL,
  ativo        TINYINT(1) DEFAULT 1,
  criado_por   INT,
  criado_em    DATETIME DEFAULT NOW(),
  alterado_por INT,
  alterado_em  DATETIME,
  FOREIGN KEY (criado_por)   REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (alterado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tblInstanciaProc (nome) VALUES
  ('1ª Instância'), ('2ª Instância'), ('TST'), ('STF'), ('STJ'), ('TRT'), ('TRF');

-- ============================================================
-- 6. tblPasta — Pasta (número sequencial com gap-finding no backend)
-- ============================================================
CREATE TABLE IF NOT EXISTS tblPasta (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  numPasta     INT NOT NULL UNIQUE,  -- Ex: 1, 2, 3, 5 (4 foi excluído — gap)
  criado_por   INT,
  criado_em    DATETIME DEFAULT NOW(),
  alterado_por INT,
  alterado_em  DATETIME,
  FOREIGN KEY (criado_por)   REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (alterado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 7. tblProc — Processo (vinculado a uma pasta)
-- ============================================================
CREATE TABLE IF NOT EXISTS tblProc (
  id                INT PRIMARY KEY AUTO_INCREMENT,
  pasta_id          INT NOT NULL,
  numProc           VARCHAR(45),         -- Número CNJ: 0001234-12.2023.5.02.0001
  NomeTituloProc    VARCHAR(300),        -- Ex: "João Silva(+2) X Empresa XYZ" — gerado no frontend
  vara_id           INT,
  tipo_id           INT,
  status_id         INT,
  instancia_id      INT,
  data_distribuicao DATE,
  observacoes       TEXT,
  ativo             TINYINT(1) DEFAULT 1,
  criado_por        INT,
  criado_em         DATETIME DEFAULT NOW(),
  alterado_por      INT,
  alterado_em       DATETIME,
  FOREIGN KEY (pasta_id)     REFERENCES tblPasta(id),
  FOREIGN KEY (vara_id)      REFERENCES tblVara(id)        ON DELETE SET NULL,
  FOREIGN KEY (tipo_id)      REFERENCES tblTipoProc(id)    ON DELETE SET NULL,
  FOREIGN KEY (status_id)    REFERENCES tblStatusProc(id)  ON DELETE SET NULL,
  FOREIGN KEY (instancia_id) REFERENCES tblInstanciaProc(id) ON DELETE SET NULL,
  FOREIGN KEY (criado_por)   REFERENCES usuarios(id)       ON DELETE SET NULL,
  FOREIGN KEY (alterado_por) REFERENCES usuarios(id)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 8. tblTituloProcAutor — Autores do processo (polo ativo)
-- Apagam em CASCADE quando o processo é excluído
-- ============================================================
CREATE TABLE IF NOT EXISTS tblTituloProcAutor (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  proc_id     INT NOT NULL,
  tipo_pessoa ENUM('fisica','juridica') NOT NULL,
  pessoa_id   INT NOT NULL,             -- Referencia pessoas_fisicas.id ou pessoas_juridicas.id
  criado_por  INT,
  criado_em   DATETIME DEFAULT NOW(),
  FOREIGN KEY (proc_id)    REFERENCES tblProc(id) ON DELETE CASCADE,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 9. tblTituloProcReu — Réus do processo (polo passivo)
-- ============================================================
CREATE TABLE IF NOT EXISTS tblTituloProcReu (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  proc_id     INT NOT NULL,
  tipo_pessoa ENUM('fisica','juridica') NOT NULL,
  pessoa_id   INT NOT NULL,
  criado_por  INT,
  criado_em   DATETIME DEFAULT NOW(),
  FOREIGN KEY (proc_id)    REFERENCES tblProc(id) ON DELETE CASCADE,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- NOTA IMPORTANTE: Andamentos, Prazos e Audiências
-- ============================================================
-- As tabelas andamento_processual, prazos_processo e audiencia
-- possuem FK para a tabela `processo` (modelo antigo).
-- Quando você for testar andamentos em processos novos (tblProc),
-- o banco vai rejeitar o INSERT por causa dessa FK.
--
-- Para corrigir, execute SHOW CREATE TABLE em cada tabela:
--   SHOW CREATE TABLE andamento_processual;
--   SHOW CREATE TABLE prazos_processo;
--   SHOW CREATE TABLE audiencia;
--
-- Identifique o nome da FK que referencia `processo` e rode:
--   ALTER TABLE andamento_processual DROP FOREIGN KEY <nome_da_fk>;
--   ALTER TABLE prazos_processo      DROP FOREIGN KEY <nome_da_fk>;
--   ALTER TABLE audiencia            DROP FOREIGN KEY <nome_da_fk>;
--
-- Isso remove apenas a CONSTRAINT (não a coluna). Os dados existentes
-- continuam intactos e novos processos (tblProc.id) passam a ser aceitos.
-- ============================================================
