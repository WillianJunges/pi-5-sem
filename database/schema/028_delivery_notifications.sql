-- Dispositivo é vinculado por instalação + segredo; versão impede reativação por resposta atrasada.
CREATE TABLE IF NOT EXISTS push_devices (
  id CHAR(36) NOT NULL PRIMARY KEY,
  secret_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) NULL,
  token VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
  platform ENUM('android','ios') NULL,
  binding_version BIGINT UNSIGNED NOT NULL,
  active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  bound_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_push_user (user_id, active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS delivery_notification_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  event_seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  delivery_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  kind ENUM('ASSIGNED','UNASSIGNED','CANCELLED','OUT_FOR_DELIVERY') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_notification_delivery FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_notification_recipient (user_id, created_at),
  KEY idx_notification_latest (delivery_id,user_id,event_seq)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS push_notification_attempts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  event_id CHAR(36) NOT NULL,
  device_id CHAR(36) NOT NULL,
  binding_version BIGINT UNSIGNED NOT NULL,
  status ENUM('PENDING','SENDING','TICKET','CHECKING','DELIVERED','FAILED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  receipt_attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  lease_id CHAR(36) NULL,
  lease_until DATETIME(3) NULL,
  ticket_id VARCHAR(255) NULL,
  error_code VARCHAR(80) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_push_event_device (event_id, device_id),
  KEY idx_push_due (status, next_attempt_at, lease_until),
  CONSTRAINT fk_attempt_event FOREIGN KEY (event_id) REFERENCES delivery_notification_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempt_device FOREIGN KEY (device_id) REFERENCES push_devices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

DELIMITER $$
DROP TRIGGER IF EXISTS trg_deliveries_notifications $$
CREATE TRIGGER trg_deliveries_notifications AFTER UPDATE ON deliveries FOR EACH ROW
BEGIN
  -- Eventos participam da transação da entrega, inclusive cancelamento via trigger de orders.
  IF NEW.status = 'ASSIGNED' AND NOT (NEW.courier_id <=> OLD.courier_id) THEN
    IF OLD.courier_id IS NOT NULL THEN
      INSERT INTO delivery_notification_events (id,delivery_id,user_id,kind)
      VALUES (UUID(),NEW.id,OLD.courier_id,'UNASSIGNED');
    END IF;
    INSERT INTO delivery_notification_events (id,delivery_id,user_id,kind)
    VALUES (UUID(),NEW.id,NEW.courier_id,'ASSIGNED');
  END IF;
  IF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED' AND NEW.courier_id IS NOT NULL THEN
    INSERT INTO delivery_notification_events (id,delivery_id,user_id,kind)
    VALUES (UUID(),NEW.id,NEW.courier_id,'CANCELLED');
  END IF;
  IF NEW.status = 'IN_PROGRESS' AND OLD.status <> 'IN_PROGRESS' THEN
    INSERT INTO delivery_notification_events (id,delivery_id,user_id,kind)
    SELECT UUID(),NEW.id,customer_id,'OUT_FOR_DELIVERY' FROM orders WHERE id = NEW.order_id;
  END IF;
END $$
DELIMITER ;
