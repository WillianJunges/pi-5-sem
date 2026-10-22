-- Uma linha por entrega: posição atual, sem armazenar o trajeto do motoboy.
CREATE TABLE IF NOT EXISTS delivery_last_locations (
  delivery_id CHAR(36) NOT NULL PRIMARY KEY,
  sample_id CHAR(36) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy FLOAT NOT NULL,
  captured_at DATETIME(3) NOT NULL,
  received_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_location_delivery FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
  CONSTRAINT chk_location_latitude CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT chk_location_longitude CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT chk_location_accuracy CHECK (accuracy BETWEEN 0 AND 100)
) ENGINE=InnoDB;
