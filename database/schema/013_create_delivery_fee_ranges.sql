-- 013 - Faixas de distância e taxa de entrega — módulo da Proprietária (Lucas)
--
-- A proprietária cadastra as faixas manualmente (escopo, seção 19). Ex.:
--   0 a 5 km → R$ 6,00 · 5 a 10 km → R$ 10,00 · 10 a 15 km → R$ 15,00
--
-- Regra da faixa: cobre distâncias MAIORES que min_meters e ATÉ max_meters (inclusive);
-- a faixa que começa em 0 também cobre a distância 0. Assim, 5 km exatos ficam na primeira.
-- Distância em metros (inteiro) para não depender de arredondamento.
-- Faixas removidas só são desativadas: os pedidos guardam a taxa aplicada.

CREATE TABLE IF NOT EXISTS delivery_fee_ranges (
  id         CHAR(36)      NOT NULL,
  min_meters INT UNSIGNED  NOT NULL,
  max_meters INT UNSIGNED  NOT NULL,
  fee        DECIMAL(10,2) NOT NULL,
  active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_fee_ranges_active (active, min_meters),
  CONSTRAINT ck_fee_ranges_interval CHECK (max_meters > min_meters),
  CONSTRAINT ck_fee_ranges_fee CHECK (fee >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
