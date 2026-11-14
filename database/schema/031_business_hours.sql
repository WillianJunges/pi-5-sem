-- Horários informativos do estabelecimento; não ativam cardápios automaticamente.
CREATE TABLE IF NOT EXISTS business_hours (
  weekday TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  opens_at TIME NULL,
  closes_at TIME NULL,
  CONSTRAINT chk_business_weekday CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT chk_business_hours CHECK ((opens_at IS NULL AND closes_at IS NULL) OR (opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
