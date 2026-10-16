-- 011 - Produtos e variações (catálogo da marmitaria) — módulo da Proprietária (Lucas)
--
-- Um produto (ex.: "Marmita de Frango") tem uma ou mais variações (ex.: Pequena, Média,
-- Grande), cada uma com seu preço padrão (escopo, seção 7).
-- Produtos já usados em pedidos são desativados, não excluídos, para preservar o histórico.

CREATE TABLE IF NOT EXISTS products (
  id          CHAR(36)      NOT NULL,             -- UUID gerado pela aplicação
  name        VARCHAR(120)  NOT NULL,
  description VARCHAR(500)  NULL,
  category    VARCHAR(60)   NULL,                 -- ex.: marmitas, assados, bebidas
  active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_name (name)              -- a collation ignora maiúsculas e acentos
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_variants (
  id          CHAR(36)      NOT NULL,
  product_id  CHAR(36)      NOT NULL,
  name        VARCHAR(80)   NOT NULL,
  price       DECIMAL(10,2) NOT NULL,             -- preço padrão
  active      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_variant_name_per_product (product_id, name),
  CONSTRAINT fk_variants_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT ck_variants_price CHECK (price > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
