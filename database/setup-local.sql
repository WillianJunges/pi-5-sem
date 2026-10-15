-- Para quem usa MySQL instalado na máquina (sem Docker).
-- Rode UMA vez como root (MySQL Workbench ou: mysql -u root -p < database/setup-local.sql)
-- Depois crie as tabelas com: cd backend && npm run db:migrate

CREATE DATABASE IF NOT EXISTS marmitaria CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'marmitaria'@'localhost' IDENTIFIED BY 'marmitaria';
GRANT ALL PRIVILEGES ON marmitaria.* TO 'marmitaria'@'localhost';
FLUSH PRIVILEGES;

-- Permite que o usuário da aplicação crie triggers e functions com o log binário ligado
-- (padrão do MySQL 8). Sem isso o db:migrate falha com o erro 1419.
SET PERSIST log_bin_trust_function_creators = 1;
