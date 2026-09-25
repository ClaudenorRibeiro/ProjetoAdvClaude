-- EXECUTAR UMA ÚNICA VEZ NO HEIDISQL, como administrador do MySQL local.
-- Antes de executar, troque a senha entre aspas por uma senha exclusiva de testes.
-- Este usuário recebe acesso SOMENTE ao banco descartável sistema_advocacia_test.

CREATE DATABASE IF NOT EXISTS `sistema_advocacia_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'novojud_test'@'localhost' IDENTIFIED BY 'zaba6566';
ALTER USER 'novojud_test'@'localhost' IDENTIFIED BY 'zaba6566';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'novojud_test'@'localhost';
GRANT ALL PRIVILEGES ON `sistema_advocacia_test`.* TO 'novojud_test'@'localhost';
FLUSH PRIVILEGES;
