-- 009 - Endereços de entrega do cliente
--
-- Exclusão lógica (deleted_at): o endereço some da lista do cliente, mas continua no
-- banco porque pedidos antigos apontam para ele.
--
-- Consistência: no máximo UM endereço principal por cliente. A coluna gerada
-- default_user_id só tem valor no endereço principal ativo, e o índice UNIQUE nela
-- impede um segundo principal (NULL pode repetir).
--
-- latitude/longitude: preenchidas pelo backend (Photon/OpenStreetMap) para o cálculo
-- da taxa de entrega por distância. Ficam NULL se o endereço não for encontrado no mapa.

CREATE TABLE IF NOT EXISTS addresses (
  id              CHAR(36)      NOT NULL,             -- UUID gerado pela aplicação
  user_id         CHAR(36)      NOT NULL,
  label           VARCHAR(40)   NULL,                 -- "Casa", "Trabalho"...
  cep             CHAR(8)       NOT NULL,             -- só dígitos
  street          VARCHAR(160)  NOT NULL,
  number          VARCHAR(20)   NOT NULL,             -- texto: aceita "S/N", "120A"
  complement      VARCHAR(80)   NULL,
  district        VARCHAR(100)  NOT NULL,
  city            VARCHAR(100)  NOT NULL,
  state           CHAR(2)       NOT NULL,
  latitude        DECIMAL(9, 6) NULL,
  longitude       DECIMAL(9, 6) NULL,
  is_default      BOOLEAN       NOT NULL DEFAULT FALSE,
  deleted_at      DATETIME      NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  default_user_id CHAR(36) AS (IF(is_default AND deleted_at IS NULL, user_id, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_addresses_one_default (default_user_id),
  KEY idx_addresses_user (user_id, deleted_at),
  CONSTRAINT fk_addresses_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT chk_addresses_cep CHECK (cep REGEXP '^[0-9]{8}$')
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
