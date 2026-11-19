-- Configuracao e dados adicionais dos pedidos.
CREATE TABLE store_preferences (
  id TINYINT NOT NULL PRIMARY KEY,
  estimated_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  CONSTRAINT ck_estimated_minutes CHECK (estimated_minutes BETWEEN 1 AND 1440)
) ENGINE=InnoDB;
INSERT INTO store_preferences (id, estimated_minutes) VALUES (1, 60);
ALTER TABLE orders ADD COLUMN estimated_minutes SMALLINT UNSIGNED NULL,
  ADD COLUMN receipt_confirmed_at DATETIME NULL;
ALTER TABLE order_items ADD COLUMN notes VARCHAR(200) NULL;
ALTER TABLE menu_items ADD COLUMN availability ENUM('AVAILABLE','LOW','SOLD_OUT') NOT NULL DEFAULT 'AVAILABLE';
CREATE TABLE order_reviews (
  order_id CHAR(36) NOT NULL PRIMARY KEY,
  rating TINYINT UNSIGNED NOT NULL,
  comment VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_review_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT ck_review_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE support_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  category ENUM('MISSING','WRONG','OTHER') NOT NULL,
  description VARCHAR(1000) NOT NULL,
  status ENUM('OPEN','RESOLVED') NOT NULL DEFAULT 'OPEN',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  KEY ix_support_order (order_id),
  CONSTRAINT fk_support_order FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
