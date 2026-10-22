-- 026 - Logística da entrega, separada dos itens e valores do pedido.
-- Localização, notificações e dispositivos serão acrescentados nas etapas próprias.
CREATE TABLE IF NOT EXISTS deliveries (
  id                     CHAR(36) NOT NULL PRIMARY KEY,
  order_id               CHAR(36) NOT NULL,
  courier_id             CHAR(36) NULL,
  status                 ENUM('WAITING_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'WAITING_ASSIGNMENT',
  address_snapshot       JSON NOT NULL,
  created_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  assigned_at            DATETIME(3) NULL,
  started_at             DATETIME(3) NULL,
  completed_at           DATETIME(3) NULL,
  completion_received_at DATETIME(3) NULL,
  completion_key         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  cancelled_at           DATETIME(3) NULL,
  UNIQUE KEY uq_deliveries_order (order_id),
  UNIQUE KEY uq_deliveries_completion (completion_key),
  KEY idx_deliveries_courier (courier_id, status, created_at),
  CONSTRAINT fk_deliveries_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_deliveries_courier FOREIGN KEY (courier_id) REFERENCES users(id),
  -- Uma entrega só pode começar depois de receber um motoboy.
  CONSTRAINT chk_deliveries_assignment CHECK (
    (status = 'WAITING_ASSIGNMENT' AND courier_id IS NULL AND assigned_at IS NULL)
    OR (status IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED') AND courier_id IS NOT NULL AND assigned_at IS NOT NULL)
    OR status = 'CANCELLED'
  ),
  CONSTRAINT chk_deliveries_started CHECK (
    (status IN ('IN_PROGRESS', 'COMPLETED') AND started_at IS NOT NULL)
    OR (status NOT IN ('IN_PROGRESS', 'COMPLETED') AND started_at IS NULL)
  ),
  CONSTRAINT chk_deliveries_completion CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL AND completion_received_at IS NOT NULL AND completion_key IS NOT NULL)
    OR (status <> 'COMPLETED' AND completed_at IS NULL AND completion_received_at IS NULL AND completion_key IS NULL)
  ),
  CONSTRAINT chk_deliveries_cancelled CHECK (
    (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
    OR (status <> 'CANCELLED' AND cancelled_at IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_orders_delivery_logistics $$
CREATE TRIGGER trg_orders_delivery_logistics
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
  IF NEW.fulfillment = 'DELIVERY' AND NEW.status <> OLD.status THEN
    IF NEW.status = 'CONFIRMED' THEN
      -- O trigger participa da transação da confirmação; falhar aqui desfaz o pedido.
      INSERT INTO deliveries (id, order_id, address_snapshot)
      VALUES (UUID(), NEW.id, JSON_OBJECT(
        'label', NEW.address_label, 'street', NEW.address_street, 'number', NEW.address_number,
        'complement', NEW.address_complement, 'district', NEW.address_district,
        'city', NEW.address_city, 'state', NEW.address_state, 'cep', NEW.address_cep,
        'latitude', NEW.address_latitude, 'longitude', NEW.address_longitude));
    END IF;
    IF NEW.status = 'CANCELLED' THEN
      -- O cancelamento permitido até READY também encerra a logística na mesma transação.
      UPDATE deliveries SET status = 'CANCELLED', cancelled_at = UTC_TIMESTAMP(3)
        WHERE order_id = NEW.id AND status IN ('WAITING_ASSIGNMENT', 'ASSIGNED');
    END IF;
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_deliveries_snapshot_immutable $$
CREATE TRIGGER trg_deliveries_snapshot_immutable
BEFORE UPDATE ON deliveries
FOR EACH ROW
BEGIN
  -- O destino pertence ao pedido original, mesmo se o cadastro do cliente mudar.
  IF NEW.id <> OLD.id OR NEW.order_id <> OLD.order_id OR NOT (NEW.address_snapshot <=> OLD.address_snapshot) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'O pedido e o endereço da entrega não podem ser alterados';
  END IF;
END $$

DELIMITER ;

-- Recupera apenas pedidos antigos ainda não iniciados; não inventa motoboy ou conclusão.
INSERT INTO deliveries (id, order_id, address_snapshot)
SELECT UUID(), o.id, JSON_OBJECT(
  'label', o.address_label, 'street', o.address_street, 'number', o.address_number,
  'complement', o.address_complement, 'district', o.address_district, 'city', o.address_city,
  'state', o.address_state, 'cep', o.address_cep, 'latitude', o.address_latitude, 'longitude', o.address_longitude)
FROM orders o LEFT JOIN deliveries d ON d.order_id = o.id
WHERE o.fulfillment = 'DELIVERY' AND o.status IN ('CONFIRMED', 'PREPARING', 'READY') AND d.id IS NULL;
