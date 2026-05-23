-- ============================================================
-- CRIAÇÃO COMPLETA DO BANCO DE DADOS — SISTEMA DE ADVOCACIA
-- Execute este arquivo uma única vez na instalação
-- ============================================================

CREATE DATABASE IF NOT EXISTS sistema_advocacia
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sistema_advocacia;

-- ============================================================
-- 1. CONFIGURAÇÕES DO ESCRITÓRIO
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracoes_escritorio (
  id                        INT PRIMARY KEY AUTO_INCREMENT,
  nome                      VARCHAR(200) NOT NULL,
  cnpj_cpf                  VARCHAR(20),
  email                     VARCHAR(150),
  telefone                  VARCHAR(20),
  endereco                  VARCHAR(300),
  logo_path                 VARCHAR(300),         -- Caminho do arquivo de logo
  cor_principal             VARCHAR(7) DEFAULT '#1a56db',  -- Cor hex do tema
  horario_alerta_prazos     TIME DEFAULT '18:00', -- Hora de enviar alerta de prazos pendentes
  dias_alerta_audiencia     INT DEFAULT 3,        -- Dias úteis antes da audiência para avisar cliente
  dias_alerta_pericia       INT DEFAULT 2,        -- Dias úteis antes da perícia para avisar cliente
  dias_sem_movimentacao     INT DEFAULT 30,       -- Dias sem andamento para aparecer no dashboard
  setup_concluido           TINYINT(1) DEFAULT 0, -- 0 = setup não concluído (sistema bloqueado)
  criado_em                 DATETIME DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insere registro inicial vazio (sempre haverá apenas 1 linha nesta tabela)
INSERT INTO configuracoes_escritorio (nome, setup_concluido)
VALUES ('', 0);

-- ============================================================
-- 2. USUÁRIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  nome          VARCHAR(150) NOT NULL,
  login         VARCHAR(80) NOT NULL UNIQUE,
  senha_hash    VARCHAR(255) NOT NULL,
  email         VARCHAR(150),
  oab           VARCHAR(30),                       -- Número da OAB (só para advogados)
  tipo          ENUM('advogado','estagiario','secretario','socio','administrador') NOT NULL,
  nivel         TINYINT NOT NULL DEFAULT 2,        -- 0=super, 1=admin, 2=usuário
  ativo         TINYINT(1) DEFAULT 1,
  ver_todos_processos TINYINT(1) DEFAULT 0,        -- 1 = vê processos de todos os usuários
  criado_em     DATETIME DEFAULT NOW(),
  criado_por    INT,                               -- ID do usuário que criou
  ultimo_acesso DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 3. PERMISSÕES GRANULARES
-- ============================================================
CREATE TABLE IF NOT EXISTS permissoes (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id  INT NOT NULL,
  modulo      VARCHAR(50) NOT NULL,   -- Ex: 'pessoas', 'processos', 'prazos', 'financeiro'
  acao        VARCHAR(20) NOT NULL,   -- 'visualizar', 'cadastrar', 'alterar', 'excluir'
  permitido   TINYINT(1) DEFAULT 0,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  UNIQUE KEY uq_permissao (usuario_id, modulo, acao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 4. TABELAS AUXILIARES DE CADASTRO
-- ============================================================
CREATE TABLE IF NOT EXISTS estado_civil (
  id    INT PRIMARY KEY AUTO_INCREMENT,
  nome  VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO estado_civil (nome) VALUES
  ('Solteiro(a)'), ('Casado(a)'), ('Divorciado(a)'),
  ('Viúvo(a)'), ('União Estável'), ('Separado(a)');

CREATE TABLE IF NOT EXISTS genero (
  id    INT PRIMARY KEY AUTO_INCREMENT,
  nome  VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO genero (nome) VALUES
  ('Masculino'), ('Feminino'), ('Não informado');

CREATE TABLE IF NOT EXISTS profissao (
  id    INT PRIMARY KEY AUTO_INCREMENT,
  nome  VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO profissao (nome) VALUES
  ('Advogado'), ('Médico'), ('Engenheiro'), ('Professor'), ('Empresário'),
  ('Funcionário Público'), ('Motorista'), ('Comerciante'), ('Agricultor'),
  ('Aposentado'), ('Desempregado'), ('Doméstica'), ('Operário'), ('Técnico');

-- ============================================================
-- 5. FÓRUM E VARA
-- ============================================================
CREATE TABLE IF NOT EXISTS forum (
  id        INT PRIMARY KEY AUTO_INCREMENT,
  nome      VARCHAR(200) NOT NULL,
  cidade    VARCHAR(100),
  estado    CHAR(2),
  ativo     TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vara (
  id        INT PRIMARY KEY AUTO_INCREMENT,
  forum_id  INT NOT NULL,
  nome      VARCHAR(200) NOT NULL,
  ativo     TINYINT(1) DEFAULT 1,
  FOREIGN KEY (forum_id) REFERENCES forum(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 6. PESSOAS FÍSICAS E JURÍDICAS
-- ============================================================
CREATE TABLE IF NOT EXISTS pessoas_fisicas (
  id                  INT PRIMARY KEY AUTO_INCREMENT,
  nome                VARCHAR(200) NOT NULL,
  cpf                 VARCHAR(14) UNIQUE,
  rg                  VARCHAR(20),
  data_nascimento     DATE,
  estado_civil_id     INT,
  profissao_id        INT,
  genero_id           INT,
  cep                 VARCHAR(9),
  logradouro          VARCHAR(200),
  numero              VARCHAR(10),
  complemento         VARCHAR(100),
  bairro              VARCHAR(100),
  cidade              VARCHAR(100),
  estado              CHAR(2),
  foto_path           VARCHAR(300),
  observacoes         TEXT,
  ativo               TINYINT(1) DEFAULT 1,
  criado_em           DATETIME DEFAULT NOW(),
  criado_por          INT,
  FOREIGN KEY (estado_civil_id) REFERENCES estado_civil(id),
  FOREIGN KEY (profissao_id)    REFERENCES profissao(id),
  FOREIGN KEY (genero_id)       REFERENCES genero(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pessoas_juridicas (
  id                    INT PRIMARY KEY AUTO_INCREMENT,
  razao_social          VARCHAR(200) NOT NULL,
  nome_fantasia         VARCHAR(200),
  cnpj                  VARCHAR(18) UNIQUE,
  inscricao_estadual    VARCHAR(30),
  representante_legal   VARCHAR(200),
  cep                   VARCHAR(9),
  logradouro            VARCHAR(200),
  numero                VARCHAR(10),
  complemento           VARCHAR(100),
  bairro                VARCHAR(100),
  cidade                VARCHAR(100),
  estado                CHAR(2),
  observacoes           TEXT,
  ativo                 TINYINT(1) DEFAULT 1,
  criado_em             DATETIME DEFAULT NOW(),
  criado_por            INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Telefones — suportam múltiplos por pessoa, nunca excluídos (apenas inativados)
CREATE TABLE IF NOT EXISTS telefones_pf (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  pessoa_id       INT NOT NULL,
  numero          VARCHAR(20) NOT NULL,
  tipo            ENUM('celular','residencial','comercial','whatsapp') DEFAULT 'celular',
  principal       TINYINT(1) DEFAULT 0,
  ativo           TINYINT(1) DEFAULT 1,
  criado_em       DATETIME DEFAULT NOW(),
  FOREIGN KEY (pessoa_id) REFERENCES pessoas_fisicas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS telefones_pj (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  pessoa_id       INT NOT NULL,
  numero          VARCHAR(20) NOT NULL,
  tipo            ENUM('celular','comercial','whatsapp') DEFAULT 'comercial',
  principal       TINYINT(1) DEFAULT 0,
  ativo           TINYINT(1) DEFAULT 1,
  criado_em       DATETIME DEFAULT NOW(),
  FOREIGN KEY (pessoa_id) REFERENCES pessoas_juridicas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS emails_pf (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  pessoa_id       INT NOT NULL,
  email           VARCHAR(150) NOT NULL,
  principal       TINYINT(1) DEFAULT 0,
  ativo           TINYINT(1) DEFAULT 1,
  criado_em       DATETIME DEFAULT NOW(),
  FOREIGN KEY (pessoa_id) REFERENCES pessoas_fisicas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS emails_pj (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  pessoa_id       INT NOT NULL,
  email           VARCHAR(150) NOT NULL,
  principal       TINYINT(1) DEFAULT 0,
  ativo           TINYINT(1) DEFAULT 1,
  criado_em       DATETIME DEFAULT NOW(),
  FOREIGN KEY (pessoa_id) REFERENCES pessoas_juridicas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Histórico de atendimentos — data e hora automáticas, texto livre
CREATE TABLE IF NOT EXISTS historico_atendimento (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  tipo_pessoa ENUM('fisica','juridica') NOT NULL,
  pessoa_id   INT NOT NULL,
  descricao   TEXT NOT NULL,
  usuario_id  INT NOT NULL,
  criado_em   DATETIME DEFAULT NOW(),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 7. PASTAS E PROCESSOS
-- ============================================================
CREATE TABLE IF NOT EXISTS pasta (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  numero          INT NOT NULL UNIQUE,             -- Número sequencial (0001, 0002...)
  titulo          VARCHAR(300) NOT NULL,            -- "Autor vs Réu"
  area_direito    ENUM('trabalhista','previdenciario','familia','outro') NOT NULL,
  tipo_pessoa     ENUM('fisica','juridica') NOT NULL,
  cliente_id      INT NOT NULL,                    -- ID da pessoa (física ou jurídica)
  ativa           TINYINT(1) DEFAULT 1,
  criado_em       DATETIME DEFAULT NOW(),
  criado_por      INT,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS status_processo (
  id    INT PRIMARY KEY AUTO_INCREMENT,
  nome  VARCHAR(100) NOT NULL,
  ativo TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO status_processo (nome) VALUES
  ('Em andamento'), ('Suspenso'), ('Arquivado'), ('Baixado'), ('Acordo'), ('Recurso');

CREATE TABLE IF NOT EXISTS processo (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  pasta_id      INT NOT NULL,
  numero        VARCHAR(30),                       -- Número CNJ do processo
  vara_id       INT,
  status_id     INT,
  data_inicio   DATE,
  observacoes   TEXT,
  criado_em     DATETIME DEFAULT NOW(),
  criado_por    INT,
  FOREIGN KEY (pasta_id)   REFERENCES pasta(id),
  FOREIGN KEY (vara_id)    REFERENCES vara(id),
  FOREIGN KEY (status_id)  REFERENCES status_processo(id),
  FOREIGN KEY (criado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Partes do processo (autor, réu, testemunha, perito, advogado adverso, etc.)
CREATE TABLE IF NOT EXISTS partes_processo (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  processo_id INT NOT NULL,
  tipo_pessoa ENUM('fisica','juridica') NOT NULL,
  pessoa_id   INT NOT NULL,
  polo        ENUM('ativo','passivo','testemunha','perito','adv_adverso','assistente','outro') NOT NULL,
  criado_em   DATETIME DEFAULT NOW(),
  FOREIGN KEY (processo_id) REFERENCES processo(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Responsável pelo processo (qual usuário cuida deste processo)
CREATE TABLE IF NOT EXISTS processo_responsaveis (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  processo_id INT NOT NULL,
  usuario_id  INT NOT NULL,
  FOREIGN KEY (processo_id) REFERENCES processo(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 8. CALENDÁRIO — 30 anos de datas pré-cadastradas
-- Preenchido pelo seed, não manualmente
-- ============================================================
CREATE TABLE IF NOT EXISTS calendario (
  data        DATE PRIMARY KEY,
  dia_util    TINYINT(1) NOT NULL DEFAULT 1  -- 1=útil, 0=não útil (fim de semana/feriado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS feriados (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  data        DATE NOT NULL UNIQUE,
  descricao   VARCHAR(200) NOT NULL,
  tipo        ENUM('nacional','estadual','municipal','facultativo') DEFAULT 'nacional',
  criado_em   DATETIME DEFAULT NOW(),
  criado_por  INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 9. PRAZOS
-- ============================================================
CREATE TABLE IF NOT EXISTS tipo_prazo (
  id    INT PRIMARY KEY AUTO_INCREMENT,
  nome  VARCHAR(100) NOT NULL,
  ativo TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tipo_prazo (nome) VALUES
  ('Processual'), ('Recursal'), ('Judicial'), ('Execução');

CREATE TABLE IF NOT EXISTS prazo_subtipo (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  tipo_prazo_id INT NOT NULL,
  nome          VARCHAR(150) NOT NULL,
  dias_padrao   INT,
  tipo_dias     ENUM('uteis','corridos') DEFAULT 'uteis',
  ativo         TINYINT(1) DEFAULT 1,
  FOREIGN KEY (tipo_prazo_id) REFERENCES tipo_prazo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Prazos processuais mais comuns (42 tipos)
INSERT INTO prazo_subtipo (tipo_prazo_id, nome, dias_padrao, tipo_dias) VALUES
  (1, 'Contestação', 15, 'uteis'),
  (1, 'Defesa', 5, 'uteis'),
  (1, 'Réplica', 15, 'uteis'),
  (1, 'Memoriais', 15, 'uteis'),
  (1, 'Impugnação', 15, 'uteis'),
  (1, 'Manifestação', 15, 'uteis'),
  (1, 'Prazo para juntar documentos', 5, 'uteis'),
  (1, 'Prazo para indicar testemunhas', 5, 'uteis'),
  (1, 'Prazo para pagar custas', 5, 'uteis'),
  (1, 'Resposta ao recurso', 15, 'uteis'),
  (2, 'Recurso Ordinário', 8, 'dias'),
  (2, 'Recurso de Revista', 8, 'dias'),
  (2, 'Agravo de Instrumento', 8, 'dias'),
  (2, 'Agravo de Petição', 8, 'dias'),
  (2, 'Recurso Adesivo', 8, 'dias'),
  (2, 'Embargos de Declaração', 5, 'dias'),
  (2, 'Embargos de Divergência', 8, 'dias'),
  (2, 'Recurso Inominado', 15, 'uteis'),
  (2, 'Apelação', 15, 'uteis'),
  (2, 'Agravo Interno', 15, 'uteis'),
  (2, 'Recurso Especial', 15, 'uteis'),
  (2, 'Recurso Extraordinário', 15, 'uteis'),
  (3, 'Pagar acordo', 30, 'corridos'),
  (3, 'Cumprir sentença', 15, 'uteis'),
  (3, 'Apresentar cálculo', 15, 'uteis'),
  (3, 'Impugnação ao cálculo', 15, 'uteis'),
  (3, 'Notificação extrajudicial', 5, 'uteis'),
  (3, 'Audiência marcada', NULL, 'uteis'),
  (3, 'Perícia marcada', NULL, 'uteis'),
  (4, 'Penhora online', 1, 'uteis'),
  (4, 'Impenhorabilidade', 5, 'uteis'),
  (4, 'Arrematação', 30, 'corridos'),
  (4, 'Exceção de pré-executividade', 5, 'uteis'),
  (4, 'Embargos à execução', 15, 'uteis'),
  (4, 'Habilitação de crédito', 15, 'uteis'),
  (4, 'Nomeação de bens', 5, 'uteis'),
  (4, 'Prazo para pagamento espontâneo', 3, 'uteis'),
  (4, 'Pedido de parcelamento', 15, 'uteis'),
  (4, 'Oposição à arrematação', 5, 'uteis'),
  (4, 'Recurso da arrematação', 15, 'uteis'),
  (1, 'Prazo geral', NULL, 'uteis'),
  (3, 'Prazo determinado pelo juiz', NULL, 'uteis');

-- Tabela principal de prazos por processo
CREATE TABLE IF NOT EXISTS prazos_processo (
  id                INT PRIMARY KEY AUTO_INCREMENT,
  processo_id       INT NOT NULL,
  subtipo_id        INT,
  descricao         VARCHAR(300),
  data_inicio       DATE NOT NULL,
  quantidade        INT,
  tipo_dias         ENUM('uteis','corridos') DEFAULT 'uteis',
  data_vencimento   DATE NOT NULL,
  delegado_para     INT,                            -- usuário_id (null = prazo do escritório)
  status            ENUM('aberto','fazendo','pendente','agendado','concluido') DEFAULT 'aberto',
  status_alterado_por INT,
  status_alterado_em  DATETIME,
  concluido_por     INT,
  concluido_em      DATETIME,
  criado_em         DATETIME DEFAULT NOW(),
  criado_por        INT NOT NULL,
  FOREIGN KEY (processo_id)       REFERENCES processo(id),
  FOREIGN KEY (subtipo_id)        REFERENCES prazo_subtipo(id),
  FOREIGN KEY (delegado_para)     REFERENCES usuarios(id),
  FOREIGN KEY (concluido_por)     REFERENCES usuarios(id),
  FOREIGN KEY (status_alterado_por) REFERENCES usuarios(id),
  FOREIGN KEY (criado_por)        REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Auditoria de mudanças de status dos prazos
CREATE TABLE IF NOT EXISTS auditoria_prazo (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  prazo_id        INT NOT NULL,
  status_anterior VARCHAR(20),
  status_novo     VARCHAR(20),
  usuario_id      INT NOT NULL,
  alterado_em     DATETIME DEFAULT NOW(),
  observacao      VARCHAR(300),
  FOREIGN KEY (prazo_id)   REFERENCES prazos_processo(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 10. TAREFAS
-- ============================================================
CREATE TABLE IF NOT EXISTS tarefas (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  titulo          VARCHAR(300) NOT NULL,
  descricao       TEXT,
  prioridade      ENUM('urgente','normal','baixa') DEFAULT 'normal',
  processo_id     INT,                             -- Vínculo opcional com processo
  pasta_id        INT,                             -- Vínculo opcional com pasta
  prazo_id        INT,                             -- Vínculo opcional com prazo
  atribuida_para  INT,                             -- usuário_id (null = escritório)
  data_vencimento DATE,
  concluida       TINYINT(1) DEFAULT 0,
  concluida_por   INT,
  concluida_em    DATETIME,
  criado_em       DATETIME DEFAULT NOW(),
  criado_por      INT NOT NULL,
  FOREIGN KEY (processo_id)   REFERENCES processo(id),
  FOREIGN KEY (pasta_id)      REFERENCES pasta(id),
  FOREIGN KEY (prazo_id)      REFERENCES prazos_processo(id),
  FOREIGN KEY (atribuida_para) REFERENCES usuarios(id),
  FOREIGN KEY (concluida_por)  REFERENCES usuarios(id),
  FOREIGN KEY (criado_por)     REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 11. AUDIÊNCIAS
-- ============================================================
CREATE TABLE IF NOT EXISTS tipo_audiencia (
  id    INT PRIMARY KEY AUTO_INCREMENT,
  nome  VARCHAR(100) NOT NULL,
  ativo TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tipo_audiencia (nome) VALUES
  ('Una'), ('Instrução'), ('Inicial'), ('Conciliação'),
  ('Julgamento'), ('Oitiva'), ('Ratificação');

CREATE TABLE IF NOT EXISTS modelo_comunicado (
  id                INT PRIMARY KEY AUTO_INCREMENT,
  tipo_audiencia_id INT,                           -- null = modelo genérico
  nome              VARCHAR(150) NOT NULL,
  conteudo          TEXT NOT NULL,                 -- Texto do comunicado com variáveis {{...}}
  ativo             TINYINT(1) DEFAULT 1,
  criado_em         DATETIME DEFAULT NOW(),
  criado_por        INT,
  FOREIGN KEY (tipo_audiencia_id) REFERENCES tipo_audiencia(id),
  FOREIGN KEY (criado_por)        REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audiencia (
  id                      INT PRIMARY KEY AUTO_INCREMENT,
  processo_id             INT NOT NULL,
  tipo_audiencia_id       INT,
  data                    DATE NOT NULL,
  hora                    TIME NOT NULL,
  modalidade              ENUM('presencial','virtual') DEFAULT 'presencial',
  local                   VARCHAR(300),
  plataforma_virtual      VARCHAR(100),            -- Zoom, Teams, Meet...
  link_virtual            VARCHAR(500),
  comunicado_enviado      TINYINT(1) DEFAULT 0,
  ata_impressa            TINYINT(1) DEFAULT 0,    -- "Ata já impressa" no dashboard
  criado_em               DATETIME DEFAULT NOW(),
  criado_por              INT NOT NULL,
  FOREIGN KEY (processo_id)       REFERENCES processo(id),
  FOREIGN KEY (tipo_audiencia_id) REFERENCES tipo_audiencia(id),
  FOREIGN KEY (criado_por)        REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ata_audiencia (
  id                INT PRIMARY KEY AUTO_INCREMENT,
  audiencia_id      INT NOT NULL UNIQUE,
  resultado         TEXT,
  houve_acordo      TINYINT(1) DEFAULT 0,
  valor_acordo      DECIMAL(15,2),
  parcelas          INT,
  valor_parcela     DECIMAL(15,2),
  data_primeiro_pagamento DATE,
  nova_audiencia    TINYINT(1) DEFAULT 0,
  observacoes       TEXT,
  criado_em         DATETIME DEFAULT NOW(),
  criado_por        INT NOT NULL,
  FOREIGN KEY (audiencia_id) REFERENCES audiencia(id),
  FOREIGN KEY (criado_por)   REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 12. PERÍCIAS
-- ============================================================
CREATE TABLE IF NOT EXISTS tipo_pericia (
  id    INT PRIMARY KEY AUTO_INCREMENT,
  nome  VARCHAR(100) NOT NULL,
  ativo TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tipo_pericia (nome) VALUES
  ('Médica'), ('Contábil'), ('Insalubridade'), ('Periculosidade'),
  ('Ergonômica'), ('Ambiental'), ('Técnica');

CREATE TABLE IF NOT EXISTS pericia (
  id                      INT PRIMARY KEY AUTO_INCREMENT,
  processo_id             INT NOT NULL,
  tipo_pericia_id         INT,
  data                    DATE NOT NULL,
  hora                    TIME,
  local                   VARCHAR(300),
  perito_tipo             ENUM('fisica','juridica'),
  perito_id               INT,                     -- ID do perito na tabela de pessoas
  assistente_tecnico_id   INT,                     -- Assistente técnico do escritório (usuário)
  comunicado_enviado      TINYINT(1) DEFAULT 0,
  email_perito_enviado    TINYINT(1) DEFAULT 0,
  criado_em               DATETIME DEFAULT NOW(),
  criado_por              INT NOT NULL,
  FOREIGN KEY (processo_id)         REFERENCES processo(id),
  FOREIGN KEY (tipo_pericia_id)     REFERENCES tipo_pericia(id),
  FOREIGN KEY (assistente_tecnico_id) REFERENCES usuarios(id),
  FOREIGN KEY (criado_por)          REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 13. FINANCEIRO
-- ============================================================
CREATE TABLE IF NOT EXISTS honorarios (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  pasta_id        INT NOT NULL UNIQUE,
  tipo            ENUM('percentual','fixo','sem_honorarios') DEFAULT 'sem_honorarios',
  percentual      DECIMAL(5,2),                    -- Ex: 30.00 para 30%
  valor_fixo      DECIMAL(15,2),
  observacoes     TEXT,
  criado_em       DATETIME DEFAULT NOW(),
  FOREIGN KEY (pasta_id) REFERENCES pasta(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS conta_corrente_pasta (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  pasta_id    INT NOT NULL,
  data        DATE NOT NULL,
  descricao   VARCHAR(300) NOT NULL,
  valor       DECIMAL(15,2) NOT NULL,
  tipo        ENUM('debito','credito') NOT NULL,
  usuario_id  INT NOT NULL,
  criado_em   DATETIME DEFAULT NOW(),
  FOREIGN KEY (pasta_id)  REFERENCES pasta(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS parcerias (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  processo_id INT NOT NULL,
  descricao   VARCHAR(200) NOT NULL,              -- Com quem é a parceria
  tipo        ENUM('percentual','fixo') DEFAULT 'percentual',
  percentual  DECIMAL(5,2),
  valor_fixo  DECIMAL(15,2),
  criado_em   DATETIME DEFAULT NOW(),
  criado_por  INT,
  FOREIGN KEY (processo_id) REFERENCES processo(id),
  FOREIGN KEY (criado_por)  REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 14. ANDAMENTO PROCESSUAL
-- ============================================================
CREATE TABLE IF NOT EXISTS andamento_processual (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  processo_id   INT NOT NULL,
  data          DATE NOT NULL,
  descricao     TEXT NOT NULL,
  criado_por    INT NOT NULL,
  criado_em     DATETIME DEFAULT NOW(),
  editado_por   INT,
  editado_em    DATETIME,
  FOREIGN KEY (processo_id) REFERENCES processo(id),
  FOREIGN KEY (criado_por)  REFERENCES usuarios(id),
  FOREIGN KEY (editado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 15. DOCUMENTOS E MODELOS
-- ============================================================
CREATE TABLE IF NOT EXISTS modelo_documento (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  nome        VARCHAR(150) NOT NULL,
  descricao   VARCHAR(300),
  conteudo    LONGTEXT NOT NULL,                  -- Texto do modelo com variáveis {{...}}
  ativo       TINYINT(1) DEFAULT 1,
  criado_em   DATETIME DEFAULT NOW(),
  criado_por  INT,
  FOREIGN KEY (criado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS log_documentos_gerados (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  modelo_id       INT NOT NULL,
  processo_id     INT,
  pasta_id        INT,
  formato         ENUM('docx','pdf') NOT NULL,
  usuario_id      INT NOT NULL,
  gerado_em       DATETIME DEFAULT NOW(),
  FOREIGN KEY (modelo_id)  REFERENCES modelo_documento(id),
  FOREIGN KEY (processo_id) REFERENCES processo(id),
  FOREIGN KEY (pasta_id)   REFERENCES pasta(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 16. COMUNICAÇÕES (WhatsApp e E-mail)
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracoes_integracoes (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  modulo      VARCHAR(50) NOT NULL UNIQUE,        -- 'whatsapp_zapi', 'email_smtp', 'aasp', etc.
  ativo       TINYINT(1) DEFAULT 0,
  configuracoes JSON,                             -- Credenciais e settings do módulo (JSON)
  atualizado_em DATETIME DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insere os módulos disponíveis (desativados por padrão)
INSERT INTO configuracoes_integracoes (modulo, ativo) VALUES
  ('whatsapp_zapi', 0),
  ('email_smtp', 0),
  ('aasp', 0),
  ('cnj_datajud', 0);

CREATE TABLE IF NOT EXISTS log_comunicacoes (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  canal           ENUM('whatsapp','email') NOT NULL,
  destinatario    VARCHAR(200) NOT NULL,           -- Número ou e-mail
  assunto         VARCHAR(200),
  conteudo        TEXT,
  enviado         TINYINT(1) DEFAULT 0,
  erro_msg        TEXT,                            -- Mensagem de erro se falhou
  tipo_pessoa     ENUM('fisica','juridica'),
  pessoa_id       INT,
  processo_id     INT,
  usuario_id      INT,
  enviado_em      DATETIME DEFAULT NOW(),
  FOREIGN KEY (processo_id) REFERENCES processo(id),
  FOREIGN KEY (usuario_id)  REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 17. PUBLICAÇÕES AASP
-- ============================================================
CREATE TABLE IF NOT EXISTS publicacoes (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  data_publicacao DATE NOT NULL,
  oab             VARCHAR(30) NOT NULL,            -- OAB que originou a busca
  numero_processo VARCHAR(30),
  texto           LONGTEXT NOT NULL,
  tratada         TINYINT(1) DEFAULT 0,
  tratada_por     INT,
  tratada_em      DATETIME,
  criado_em       DATETIME DEFAULT NOW(),
  FOREIGN KEY (tratada_por) REFERENCES usuarios(id),
  INDEX idx_data (data_publicacao),
  INDEX idx_processo (numero_processo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS log_publicacoes (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id      INT NOT NULL,
  quantidade      INT NOT NULL,
  data_publicacao DATE,
  acao_em         DATETIME DEFAULT NOW(),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 18. PESQUISAS SALVAS
-- ============================================================
CREATE TABLE IF NOT EXISTS pesquisas_salvas (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id  INT NOT NULL,
  modulo      VARCHAR(50) NOT NULL,
  nome        VARCHAR(150) NOT NULL,
  filtros     JSON NOT NULL,                      -- Filtros salvos em JSON
  colunas     JSON,                               -- Colunas visíveis salvas em JSON
  criado_em   DATETIME DEFAULT NOW(),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 19. LOG DE AUDITORIA GERAL
-- ============================================================
CREATE TABLE IF NOT EXISTS logs_auditoria (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id    INT,
  tabela        VARCHAR(50) NOT NULL,
  acao          VARCHAR(20) NOT NULL,             -- 'criar', 'editar', 'excluir'
  registro_id   INT,
  dados_antigos JSON,
  dados_novos   JSON,
  criado_em     DATETIME DEFAULT NOW(),
  INDEX idx_tabela (tabela),
  INDEX idx_usuario (usuario_id),
  INDEX idx_data (criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- FIM DO SCRIPT DE CRIAÇÃO
-- ============================================================
