-- Para quem usa MySQL instalado na máquina (sem Docker).
-- Rode UMA vez como root (MySQL Workbench ou: mysql -u root -p < database/setup-local.sql)
-- Depois crie as tabelas com: cd backend && npm run db:migrate

CREATE DATABASE IF NOT EXISTS marmitaria CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'marmitaria'@'localhost' IDENTIFIED BY 'marmitaria';
GRANT ALL PRIVILEGES ON marmitaria.* TO 'marmitaria'@'localhost';
FLUSH PRIVILEGES;
