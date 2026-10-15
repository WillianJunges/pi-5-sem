-- 010 - Cardápios e itens do cardápio — módulo da Proprietária (Lucas)
--
-- O cardápio escolhe, do catálogo, o que está à venda em um dia (escopo, seção 8).
-- Estados: DRAFT (rascunho) → ACTIVE (clientes veem) → CLOSED (encerrado).
-- Cada item pode ter um preço especial temporário, que NÃO altera o preço padrão.

CREATE TABLE IF NOT EXISTS menus (
  id           CHAR(36)     NOT NULL,
  name         VARCHAR(120) NOT NULL,
  menu_date    DATE         NOT NULL,
  status       ENUM('DRAFT', 'ACTIVE', 'CLOSED') NOT NULL DEFAULT 'DRAFT',
  activated_at DATETIME     NULL,
  closed_at    DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_menus_status_date (status, menu_date)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_items (
  id            CHAR(36)      NOT NULL,
  menu_id       CHAR(36)      NOT NULL,
  variant_id    CHAR(36)      NOT NULL,
  special_price DECIMAL(10,2) NULL,               -- NULL = usa o preço padrão da variação
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_menu_items_variant (menu_id, variant_id),
  CONSTRAINT fk_menu_items_menu FOREIGN KEY (menu_id) REFERENCES menus (id) ON DELETE CASCADE,
  -- RESTRICT: não deixa apagar uma variação que está em algum cardápio
  CONSTRAINT fk_menu_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE RESTRICT,
  CONSTRAINT ck_menu_items_special_price CHECK (special_price IS NULL OR special_price > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
