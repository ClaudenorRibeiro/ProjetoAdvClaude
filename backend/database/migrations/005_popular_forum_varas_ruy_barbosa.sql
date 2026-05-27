-- ============================================================
-- MIGRAÇÃO 005 — Popular tblForum e tblVara
-- Fórum Trabalhista Ruy Barbosa (TRT-2 São Paulo)
-- Fonte: https://ww2.trt2.jus.br/contato/telefones-e-enderecos/forum-trabalhista-ruy-barbosa
-- Data: 2026-05-27
--
-- PADRÕES IDENTIFICADOS:
--   E-mail:        vtspNN@trtsp.jus.br   (NN = número da vara, 2 dígitos)
--   Fone:          (11) 3525-91NN        (NN = número da vara, 2 dígitos)
--   codVaraNoProc: 50200NN               (NN = número da vara, 2 dígitos)
--   Bloco:         varas  1–45 → Bloco A | varas 46–90 → Bloco B
--   Andar:         3 varas por andar, 3º ao 18º (sem 10º)
--
-- EXECUTE APÓS: 004_reset_tokens.sql
-- ATENÇÃO: Execute apenas uma vez — não possui verificação de duplicatas
-- ============================================================

USE sistema_advocacia;

-- ============================================================
-- 1. Inserir o fórum
-- ============================================================
INSERT INTO tblForum (abrev_nome, nome, cidade, uf, cep, logradouro, num_end, compl_end, bairro, ativo)
VALUES (
  'FT/Ruy Barbosa',
  'Fórum Trabalhista Ruy Barbosa',
  'São Paulo',
  'SP',
  '01139001',
  'Av. Marquês de São Vicente',
  '235',
  NULL,
  'Barra Funda',
  1
);

-- Captura o ID do fórum recém-inserido
SET @forum_id = LAST_INSERT_ID();

-- ============================================================
-- 2. Inserir as 90 Varas do Trabalho
-- Colunas: abrev_nome, forum_id, nome, codVaraNoProc, compl_end, tel, email, ativo
-- ============================================================
INSERT INTO tblVara (abrev_nome, forum_id, nome, codVaraNoProc, compl_end, tel, email, ativo) VALUES

-- ── 3º ANDAR ──────────────────────────────────────────────
-- Bloco A
('1ªVT/SP',  @forum_id, '1ª Vara do Trabalho',  '5020001', '3º andar Bloco A', '(11) 3525-9101', 'vtsp01@trtsp.jus.br', 1),
('2ªVT/SP',  @forum_id, '2ª Vara do Trabalho',  '5020002', '3º andar Bloco A', '(11) 3525-9102', 'vtsp02@trtsp.jus.br', 1),
('3ªVT/SP',  @forum_id, '3ª Vara do Trabalho',  '5020003', '3º andar Bloco A', '(11) 3525-9103', 'vtsp03@trtsp.jus.br', 1),
-- Bloco B
('46ªVT/SP', @forum_id, '46ª Vara do Trabalho', '5020046', '3º andar Bloco B', '(11) 3525-9146', 'vtsp46@trtsp.jus.br', 1),
('47ªVT/SP', @forum_id, '47ª Vara do Trabalho', '5020047', '3º andar Bloco B', '(11) 3525-9147', 'vtsp47@trtsp.jus.br', 1),
('48ªVT/SP', @forum_id, '48ª Vara do Trabalho', '5020048', '3º andar Bloco B', '(11) 3525-9148', 'vtsp48@trtsp.jus.br', 1),

-- ── 4º ANDAR ──────────────────────────────────────────────
-- Bloco A
('4ªVT/SP',  @forum_id, '4ª Vara do Trabalho',  '5020004', '4º andar Bloco A', '(11) 3525-9104', 'vtsp04@trtsp.jus.br', 1),
('5ªVT/SP',  @forum_id, '5ª Vara do Trabalho',  '5020005', '4º andar Bloco A', '(11) 3525-9105', 'vtsp05@trtsp.jus.br', 1),
('6ªVT/SP',  @forum_id, '6ª Vara do Trabalho',  '5020006', '4º andar Bloco A', '(11) 3525-9106', 'vtsp06@trtsp.jus.br', 1),
-- Bloco B
('49ªVT/SP', @forum_id, '49ª Vara do Trabalho', '5020049', '4º andar Bloco B', '(11) 3525-9149', 'vtsp49@trtsp.jus.br', 1),
('50ªVT/SP', @forum_id, '50ª Vara do Trabalho', '5020050', '4º andar Bloco B', '(11) 3525-9150', 'vtsp50@trtsp.jus.br', 1),
('51ªVT/SP', @forum_id, '51ª Vara do Trabalho', '5020051', '4º andar Bloco B', '(11) 3525-9151', 'vtsp51@trtsp.jus.br', 1),

-- ── 5º ANDAR ──────────────────────────────────────────────
-- Bloco A
('7ªVT/SP',  @forum_id, '7ª Vara do Trabalho',  '5020007', '5º andar Bloco A', '(11) 3525-9107', 'vtsp07@trtsp.jus.br', 1),
('8ªVT/SP',  @forum_id, '8ª Vara do Trabalho',  '5020008', '5º andar Bloco A', '(11) 3525-9108', 'vtsp08@trtsp.jus.br', 1),
('9ªVT/SP',  @forum_id, '9ª Vara do Trabalho',  '5020009', '5º andar Bloco A', '(11) 3525-9109', 'vtsp09@trtsp.jus.br', 1),
-- Bloco B
('52ªVT/SP', @forum_id, '52ª Vara do Trabalho', '5020052', '5º andar Bloco B', '(11) 3525-9152', 'vtsp52@trtsp.jus.br', 1),
('53ªVT/SP', @forum_id, '53ª Vara do Trabalho', '5020053', '5º andar Bloco B', '(11) 3525-9153', 'vtsp53@trtsp.jus.br', 1),
('54ªVT/SP', @forum_id, '54ª Vara do Trabalho', '5020054', '5º andar Bloco B', '(11) 3525-9154', 'vtsp54@trtsp.jus.br', 1),

-- ── 6º ANDAR ──────────────────────────────────────────────
-- Bloco A
('10ªVT/SP', @forum_id, '10ª Vara do Trabalho', '5020010', '6º andar Bloco A', '(11) 3525-9110', 'vtsp10@trtsp.jus.br', 1),
('11ªVT/SP', @forum_id, '11ª Vara do Trabalho', '5020011', '6º andar Bloco A', '(11) 3525-9111', 'vtsp11@trtsp.jus.br', 1),
('12ªVT/SP', @forum_id, '12ª Vara do Trabalho', '5020012', '6º andar Bloco A', '(11) 3525-9112', 'vtsp12@trtsp.jus.br', 1),
-- Bloco B
('55ªVT/SP', @forum_id, '55ª Vara do Trabalho', '5020055', '6º andar Bloco B', '(11) 3525-9155', 'vtsp55@trtsp.jus.br', 1),
('56ªVT/SP', @forum_id, '56ª Vara do Trabalho', '5020056', '6º andar Bloco B', '(11) 3525-9156', 'vtsp56@trtsp.jus.br', 1),
('57ªVT/SP', @forum_id, '57ª Vara do Trabalho', '5020057', '6º andar Bloco B', '(11) 3525-9157', 'vtsp57@trtsp.jus.br', 1),

-- ── 7º ANDAR ──────────────────────────────────────────────
-- Bloco A
('13ªVT/SP', @forum_id, '13ª Vara do Trabalho', '5020013', '7º andar Bloco A', '(11) 3525-9113', 'vtsp13@trtsp.jus.br', 1),
('14ªVT/SP', @forum_id, '14ª Vara do Trabalho', '5020014', '7º andar Bloco A', '(11) 3525-9114', 'vtsp14@trtsp.jus.br', 1),
('15ªVT/SP', @forum_id, '15ª Vara do Trabalho', '5020015', '7º andar Bloco A', '(11) 3525-9115', 'vtsp15@trtsp.jus.br', 1),
-- Bloco B
('58ªVT/SP', @forum_id, '58ª Vara do Trabalho', '5020058', '7º andar Bloco B', '(11) 3525-9158', 'vtsp58@trtsp.jus.br', 1),
('59ªVT/SP', @forum_id, '59ª Vara do Trabalho', '5020059', '7º andar Bloco B', '(11) 3525-9159', 'vtsp59@trtsp.jus.br', 1),
('60ªVT/SP', @forum_id, '60ª Vara do Trabalho', '5020060', '7º andar Bloco B', '(11) 3525-9160', 'vtsp60@trtsp.jus.br', 1),

-- ── 8º ANDAR ──────────────────────────────────────────────
-- Bloco A
('16ªVT/SP', @forum_id, '16ª Vara do Trabalho', '5020016', '8º andar Bloco A', '(11) 3525-9116', 'vtsp16@trtsp.jus.br', 1),
('17ªVT/SP', @forum_id, '17ª Vara do Trabalho', '5020017', '8º andar Bloco A', '(11) 3525-9117', 'vtsp17@trtsp.jus.br', 1),
('18ªVT/SP', @forum_id, '18ª Vara do Trabalho', '5020018', '8º andar Bloco A', '(11) 3525-9118', 'vtsp18@trtsp.jus.br', 1),
-- Bloco B
('61ªVT/SP', @forum_id, '61ª Vara do Trabalho', '5020061', '8º andar Bloco B', '(11) 3525-9161', 'vtsp61@trtsp.jus.br', 1),
('62ªVT/SP', @forum_id, '62ª Vara do Trabalho', '5020062', '8º andar Bloco B', '(11) 3525-9162', 'vtsp62@trtsp.jus.br', 1),
('63ªVT/SP', @forum_id, '63ª Vara do Trabalho', '5020063', '8º andar Bloco B', '(11) 3525-9163', 'vtsp63@trtsp.jus.br', 1),

-- ── 9º ANDAR ──────────────────────────────────────────────
-- Bloco A
('19ªVT/SP', @forum_id, '19ª Vara do Trabalho', '5020019', '9º andar Bloco A', '(11) 3525-9119', 'vtsp19@trtsp.jus.br', 1),
('20ªVT/SP', @forum_id, '20ª Vara do Trabalho', '5020020', '9º andar Bloco A', '(11) 3525-9120', 'vtsp20@trtsp.jus.br', 1),
('21ªVT/SP', @forum_id, '21ª Vara do Trabalho', '5020021', '9º andar Bloco A', '(11) 3525-9121', 'vtsp21@trtsp.jus.br', 1),
-- Bloco B
('64ªVT/SP', @forum_id, '64ª Vara do Trabalho', '5020064', '9º andar Bloco B', '(11) 3525-9164', 'vtsp64@trtsp.jus.br', 1),
('65ªVT/SP', @forum_id, '65ª Vara do Trabalho', '5020065', '9º andar Bloco B', '(11) 3525-9165', 'vtsp65@trtsp.jus.br', 1),
('66ªVT/SP', @forum_id, '66ª Vara do Trabalho', '5020066', '9º andar Bloco B', '(11) 3525-9166', 'vtsp66@trtsp.jus.br', 1),

-- ── 11º ANDAR (sem 10º) ───────────────────────────────────
-- Bloco A
('22ªVT/SP', @forum_id, '22ª Vara do Trabalho', '5020022', '11º andar Bloco A', '(11) 3525-9122', 'vtsp22@trtsp.jus.br', 1),
('23ªVT/SP', @forum_id, '23ª Vara do Trabalho', '5020023', '11º andar Bloco A', '(11) 3525-9123', 'vtsp23@trtsp.jus.br', 1),
('24ªVT/SP', @forum_id, '24ª Vara do Trabalho', '5020024', '11º andar Bloco A', '(11) 3525-9124', 'vtsp24@trtsp.jus.br', 1),
-- Bloco B
('67ªVT/SP', @forum_id, '67ª Vara do Trabalho', '5020067', '11º andar Bloco B', '(11) 3525-9167', 'vtsp67@trtsp.jus.br', 1),
('68ªVT/SP', @forum_id, '68ª Vara do Trabalho', '5020068', '11º andar Bloco B', '(11) 3525-9168', 'vtsp68@trtsp.jus.br', 1),
('69ªVT/SP', @forum_id, '69ª Vara do Trabalho', '5020069', '11º andar Bloco B', '(11) 3525-9169', 'vtsp69@trtsp.jus.br', 1),

-- ── 12º ANDAR ─────────────────────────────────────────────
-- Bloco A
('25ªVT/SP', @forum_id, '25ª Vara do Trabalho', '5020025', '12º andar Bloco A', '(11) 3525-9125', 'vtsp25@trtsp.jus.br', 1),
('26ªVT/SP', @forum_id, '26ª Vara do Trabalho', '5020026', '12º andar Bloco A', '(11) 3525-9126', 'vtsp26@trtsp.jus.br', 1),
('27ªVT/SP', @forum_id, '27ª Vara do Trabalho', '5020027', '12º andar Bloco A', '(11) 3525-9127', 'vtsp27@trtsp.jus.br', 1),
-- Bloco B
('70ªVT/SP', @forum_id, '70ª Vara do Trabalho', '5020070', '12º andar Bloco B', '(11) 3525-9170', 'vtsp70@trtsp.jus.br', 1),
('71ªVT/SP', @forum_id, '71ª Vara do Trabalho', '5020071', '12º andar Bloco B', '(11) 3525-9171', 'vtsp71@trtsp.jus.br', 1),
('72ªVT/SP', @forum_id, '72ª Vara do Trabalho', '5020072', '12º andar Bloco B', '(11) 3525-9172', 'vtsp72@trtsp.jus.br', 1),

-- ── 13º ANDAR ─────────────────────────────────────────────
-- Bloco A
('28ªVT/SP', @forum_id, '28ª Vara do Trabalho', '5020028', '13º andar Bloco A', '(11) 3525-9128', 'vtsp28@trtsp.jus.br', 1),
('29ªVT/SP', @forum_id, '29ª Vara do Trabalho', '5020029', '13º andar Bloco A', '(11) 3525-9129', 'vtsp29@trtsp.jus.br', 1),
('30ªVT/SP', @forum_id, '30ª Vara do Trabalho', '5020030', '13º andar Bloco A', '(11) 3525-9130', 'vtsp30@trtsp.jus.br', 1),
-- Bloco B
('73ªVT/SP', @forum_id, '73ª Vara do Trabalho', '5020073', '13º andar Bloco B', '(11) 3525-9173', 'vtsp73@trtsp.jus.br', 1),
('74ªVT/SP', @forum_id, '74ª Vara do Trabalho', '5020074', '13º andar Bloco B', '(11) 3525-9174', 'vtsp74@trtsp.jus.br', 1),
('75ªVT/SP', @forum_id, '75ª Vara do Trabalho', '5020075', '13º andar Bloco B', '(11) 3525-9175', 'vtsp75@trtsp.jus.br', 1),

-- ── 14º ANDAR ─────────────────────────────────────────────
-- Bloco A
('31ªVT/SP', @forum_id, '31ª Vara do Trabalho', '5020031', '14º andar Bloco A', '(11) 3525-9131', 'vtsp31@trtsp.jus.br', 1),
('32ªVT/SP', @forum_id, '32ª Vara do Trabalho', '5020032', '14º andar Bloco A', '(11) 3525-9132', 'vtsp32@trtsp.jus.br', 1),
('33ªVT/SP', @forum_id, '33ª Vara do Trabalho', '5020033', '14º andar Bloco A', '(11) 3525-9133', 'vtsp33@trtsp.jus.br', 1),
-- Bloco B
('76ªVT/SP', @forum_id, '76ª Vara do Trabalho', '5020076', '14º andar Bloco B', '(11) 3525-9176', 'vtsp76@trtsp.jus.br', 1),
('77ªVT/SP', @forum_id, '77ª Vara do Trabalho', '5020077', '14º andar Bloco B', '(11) 3525-9177', 'vtsp77@trtsp.jus.br', 1),
('78ªVT/SP', @forum_id, '78ª Vara do Trabalho', '5020078', '14º andar Bloco B', '(11) 3525-9178', 'vtsp78@trtsp.jus.br', 1),

-- ── 15º ANDAR ─────────────────────────────────────────────
-- Bloco A
('34ªVT/SP', @forum_id, '34ª Vara do Trabalho', '5020034', '15º andar Bloco A', '(11) 3525-9134', 'vtsp34@trtsp.jus.br', 1),
('35ªVT/SP', @forum_id, '35ª Vara do Trabalho', '5020035', '15º andar Bloco A', '(11) 3525-9135', 'vtsp35@trtsp.jus.br', 1),
('36ªVT/SP', @forum_id, '36ª Vara do Trabalho', '5020036', '15º andar Bloco A', '(11) 3525-9136', 'vtsp36@trtsp.jus.br', 1),
-- Bloco B
('79ªVT/SP', @forum_id, '79ª Vara do Trabalho', '5020079', '15º andar Bloco B', '(11) 3525-9179', 'vtsp79@trtsp.jus.br', 1),
('80ªVT/SP', @forum_id, '80ª Vara do Trabalho', '5020080', '15º andar Bloco B', '(11) 3525-9180', 'vtsp80@trtsp.jus.br', 1),
('81ªVT/SP', @forum_id, '81ª Vara do Trabalho', '5020081', '15º andar Bloco B', '(11) 3525-9181', 'vtsp81@trtsp.jus.br', 1),

-- ── 16º ANDAR ─────────────────────────────────────────────
-- Bloco A
('37ªVT/SP', @forum_id, '37ª Vara do Trabalho', '5020037', '16º andar Bloco A', '(11) 3525-9137', 'vtsp37@trtsp.jus.br', 1),
('38ªVT/SP', @forum_id, '38ª Vara do Trabalho', '5020038', '16º andar Bloco A', '(11) 3525-9138', 'vtsp38@trtsp.jus.br', 1),
('39ªVT/SP', @forum_id, '39ª Vara do Trabalho', '5020039', '16º andar Bloco A', '(11) 3525-9139', 'vtsp39@trtsp.jus.br', 1),
-- Bloco B
('82ªVT/SP', @forum_id, '82ª Vara do Trabalho', '5020082', '16º andar Bloco B', '(11) 3525-9182', 'vtsp82@trtsp.jus.br', 1),
('83ªVT/SP', @forum_id, '83ª Vara do Trabalho', '5020083', '16º andar Bloco B', '(11) 3525-9183', 'vtsp83@trtsp.jus.br', 1),
('84ªVT/SP', @forum_id, '84ª Vara do Trabalho', '5020084', '16º andar Bloco B', '(11) 3525-9184', 'vtsp84@trtsp.jus.br', 1),

-- ── 17º ANDAR ─────────────────────────────────────────────
-- Bloco A
('40ªVT/SP', @forum_id, '40ª Vara do Trabalho', '5020040', '17º andar Bloco A', '(11) 3525-9140', 'vtsp40@trtsp.jus.br', 1),
('41ªVT/SP', @forum_id, '41ª Vara do Trabalho', '5020041', '17º andar Bloco A', '(11) 3525-9141', 'vtsp41@trtsp.jus.br', 1),
('42ªVT/SP', @forum_id, '42ª Vara do Trabalho', '5020042', '17º andar Bloco A', '(11) 3525-9142', 'vtsp42@trtsp.jus.br', 1),
-- Bloco B
('85ªVT/SP', @forum_id, '85ª Vara do Trabalho', '5020085', '17º andar Bloco B', '(11) 3525-9185', 'vtsp85@trtsp.jus.br', 1),
('86ªVT/SP', @forum_id, '86ª Vara do Trabalho', '5020086', '17º andar Bloco B', '(11) 3525-9186', 'vtsp86@trtsp.jus.br', 1),
('87ªVT/SP', @forum_id, '87ª Vara do Trabalho', '5020087', '17º andar Bloco B', '(11) 3525-9187', 'vtsp87@trtsp.jus.br', 1),

-- ── 18º ANDAR ─────────────────────────────────────────────
-- Bloco A
('43ªVT/SP', @forum_id, '43ª Vara do Trabalho', '5020043', '18º andar Bloco A', '(11) 3525-9143', 'vtsp43@trtsp.jus.br', 1),
('44ªVT/SP', @forum_id, '44ª Vara do Trabalho', '5020044', '18º andar Bloco A', '(11) 3525-9144', 'vtsp44@trtsp.jus.br', 1),
('45ªVT/SP', @forum_id, '45ª Vara do Trabalho', '5020045', '18º andar Bloco A', '(11) 3525-9145', 'vtsp45@trtsp.jus.br', 1),
-- Bloco B
('88ªVT/SP', @forum_id, '88ª Vara do Trabalho', '5020088', '18º andar Bloco B', '(11) 3525-9188', 'vtsp88@trtsp.jus.br', 1),
('89ªVT/SP', @forum_id, '89ª Vara do Trabalho', '5020089', '18º andar Bloco B', '(11) 3525-9189', 'vtsp89@trtsp.jus.br', 1),
('90ªVT/SP', @forum_id, '90ª Vara do Trabalho', '5020090', '18º andar Bloco B', '(11) 3525-9190', 'vtsp90@trtsp.jus.br', 1);

-- ============================================================
-- VERIFICAÇÃO (opcional — rode após executar para conferir)
-- SELECT COUNT(*) FROM tblVara WHERE forum_id = @forum_id;  -- deve retornar 90
-- SELECT v.nome, v.codVaraNoProc, v.compl_end, v.tel, v.email
--   FROM tblVara v JOIN tblForum f ON f.id = v.forum_id
--   WHERE f.nome = 'Fórum Trabalhista Ruy Barbosa'
--   ORDER BY CAST(v.codVaraNoProc AS UNSIGNED);
-- ============================================================
