-- 001 - Tabela de usuários (todos os perfis: cliente, proprietária e motoboy)
CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)      NOT NULL,             -- UUID gerado pela aplicação
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(160)  NOT NULL,
  phone         VARCHAR(20)   NULL,
  password_hash VARCHAR(255)  NOT NULL,
  role          ENUM('CUSTOMER', 'OWNER', 'COURIER') NOT NULL DEFAULT 'CUSTOMER',
  active        BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
