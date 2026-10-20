-- 022 - Retirada no local — módulo do Cliente (Willian)
--
-- Além da entrega, o cliente pode escolher retirar o pedido na marmitaria (decisão da
-- equipe; o escopo não trata). Pedido de retirada:
--   * não tem endereço nem distância (colunas address_* e distance_meters ficam NULL)
--   * não tem taxa: delivery_fee = 0, então total = subtotal
--   * não gera entrega para o motoboy (seção 12)
--   * termina em DELIVERED, como o de entrega; o app mostra "Retirado"
--
-- fulfillment → DELIVERY (entrega, o padrão: pedidos antigos continuam iguais) ou PICKUP
--
-- Ciclo de vida (seção 11 + retirada):
--   entrega:  ... → READY → OUT_FOR_DELIVERY → DELIVERED   (motoboy)
--   retirada: ... → READY → DELIVERED                      (proprietária marca "retirado")
-- fn_order_status_allowed passa a aceitar READY → DELIVERED; o trigger
-- trg_orders_fulfillment confere o tipo do pedido:
--   * retirada não pode ir para OUT_FOR_DELIVERY
--   * entrega não pode pular de READY direto para DELIVERED
--   * o tipo do pedido não muda depois de feito

ALTER TABLE orders
  ADD COLUMN fulfillment ENUM('DELIVERY', 'PICKUP') NOT NULL DEFAULT 'DELIVERY' AFTER status,
  MODIFY COLUMN address_id        CHAR(36)     NULL,
  MODIFY COLUMN address_cep       CHAR(8)      NULL,
  MODIFY COLUMN address_street    VARCHAR(160) NULL,
  MODIFY COLUMN address_number    VARCHAR(20)  NULL,
  MODIFY COLUMN address_district  VARCHAR(100) NULL,
  MODIFY COLUMN address_city      VARCHAR(100) NULL,
  MODIFY COLUMN address_state     CHAR(2)      NULL,
  MODIFY COLUMN address_latitude  DECIMAL(9,6) NULL,
  MODIFY COLUMN address_longitude DECIMAL(9,6) NULL,
  MODIFY COLUMN distance_meters   INT          NULL,
  -- entrega precisa do endereço completo e da distância; retirada não tem nenhum dos
  -- dois e não cobra taxa
  ADD CONSTRAINT chk_orders_fulfillment CHECK (
    (fulfillment = 'DELIVERY'
      AND address_id IS NOT NULL AND address_cep IS NOT NULL AND address_street IS NOT NULL
      AND address_number IS NOT NULL AND address_district IS NOT NULL AND address_city IS NOT NULL
      AND address_state IS NOT NULL AND address_latitude IS NOT NULL AND address_longitude IS NOT NULL
      AND distance_meters IS NOT NULL)
    OR
    (fulfillment = 'PICKUP'
      AND address_id IS NULL AND address_latitude IS NULL AND address_longitude IS NULL
      AND distance_meters IS NULL AND delivery_fee = 0)
  );

CREATE OR REPLACE VIEW vw_customer_orders AS
SELECT
  o.id,
  o.customer_id,
  o.status,
  o.fulfillment,
  CASE WHEN o.status IN ('DELIVERED', 'CANCELLED') THEN FALSE ELSE TRUE END AS is_active,
  o.payment_method,
  o.address_label,
  o.address_street,
  o.address_number,
  o.subtotal,
  o.delivery_fee,
  o.total,
  o.created_at,
  o.delivered_at,
  o.cancelled_at,
  SUM(oi.quantity) AS item_count,
  GROUP_CONCAT(
    CONCAT(oi.quantity, 'x ', oi.product_name, ' (', oi.variant_name, ')')
    ORDER BY oi.product_name, oi.variant_name
    SEPARATOR ', '
  ) AS items_summary
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id;

DELIMITER $$

-- Mesma função do script 019, agora com READY → DELIVERED (só retirada; ver o trigger abaixo).
DROP FUNCTION IF EXISTS fn_order_status_allowed $$
CREATE FUNCTION fn_order_status_allowed(p_from VARCHAR(20), p_to VARCHAR(20))
RETURNS BOOLEAN
DETERMINISTIC
NO SQL
BEGIN
  RETURN CASE p_from
    WHEN 'PENDING'          THEN p_to IN ('CONFIRMED', 'CANCELLED')
    WHEN 'CONFIRMED'        THEN p_to IN ('PREPARING', 'CANCELLED')
    WHEN 'PREPARING'        THEN p_to IN ('READY', 'CANCELLED')
    WHEN 'READY'            THEN p_to IN ('OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED')
    WHEN 'OUT_FOR_DELIVERY' THEN p_to = 'DELIVERED'
    ELSE FALSE -- DELIVERED e CANCELLED são finais
  END;
END $$

DROP TRIGGER IF EXISTS trg_orders_fulfillment $$
CREATE TRIGGER trg_orders_fulfillment
BEFORE UPDATE ON orders
FOR EACH ROW
FOLLOWS trg_orders_cancelled_by
BEGIN
  IF NEW.fulfillment <> OLD.fulfillment THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'O tipo do pedido (entrega ou retirada) não pode ser alterado';
  END IF;

  IF NEW.status <> OLD.status THEN
    IF NEW.fulfillment = 'PICKUP' AND NEW.status = 'OUT_FOR_DELIVERY' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pedido para retirada no local não sai para entrega';
    END IF;
    IF NEW.fulfillment = 'DELIVERY' AND OLD.status = 'READY' AND NEW.status = 'DELIVERED' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Mudança de status inválida: pedido de entrega precisa sair para entrega antes de ser entregue';
    END IF;
  END IF;
END $$

DELIMITER ;
