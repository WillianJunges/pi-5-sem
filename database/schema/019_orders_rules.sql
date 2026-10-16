-- 019 - Regras do pedido no banco — módulo do Cliente (Willian)
--
-- fn_order_status_allowed(status atual, novo status)
--     → TRUE se a mudança segue o ciclo de vida do escopo (seção 11), escrito com CASE:
--         PENDING → CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED
--         cancelamento: de PENDING (cliente ou proprietária) até READY (proprietária)
--       DELIVERED e CANCELLED são finais.
--       A confirmar com a equipe: cancelar depois de OUT_FOR_DELIVERY (entrega que falhou)
--       ficou de fora; se precisar, é só incluir aqui.
--
-- trg_orders_before_update
--     * recusa mudança de status fora do fluxo (SQLSTATE 45000 → HTTP 400 no backend)
--     * preenche sozinho o horário da mudança (confirmed_at... cancelled_at), em UTC como o
--       resto do banco (o backend usa time_zone +00:00), mesmo se o UPDATE vier do Workbench
--     * impede alterar valores, cliente e endereço de um pedido já feito (seções 9, 10 e 18)
--     Assim, o módulo da Proprietária e o do Motoboy só precisam de
--     UPDATE orders SET status = '...' WHERE id = ?
--
-- trg_order_items_before_update
--     Os itens guardam o preço aplicado na compra e não podem ser alterados (seção 9).

DELIMITER $$

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
    WHEN 'READY'            THEN p_to IN ('OUT_FOR_DELIVERY', 'CANCELLED')
    WHEN 'OUT_FOR_DELIVERY' THEN p_to = 'DELIVERED'
    ELSE FALSE -- DELIVERED e CANCELLED são finais
  END;
END $$

DROP TRIGGER IF EXISTS trg_orders_before_update $$
CREATE TRIGGER trg_orders_before_update
BEFORE UPDATE ON orders
FOR EACH ROW
BEGIN
  DECLARE v_message VARCHAR(200);

  IF NEW.customer_id <> OLD.customer_id
     OR NEW.menu_id <> OLD.menu_id
     OR NEW.subtotal <> OLD.subtotal
     OR NEW.delivery_fee <> OLD.delivery_fee
     OR NEW.total <> OLD.total
     OR NEW.distance_meters <> OLD.distance_meters
     OR NEW.address_id <> OLD.address_id
     OR NEW.address_latitude <> OLD.address_latitude
     OR NEW.address_longitude <> OLD.address_longitude THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Valores e endereço de um pedido já feito não podem ser alterados';
  END IF;

  IF NEW.status <> OLD.status THEN
    IF NOT fn_order_status_allowed(OLD.status, NEW.status) THEN
      SET v_message = CONCAT('Mudança de status inválida: ', OLD.status, ' → ', NEW.status);
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    CASE NEW.status
      WHEN 'CONFIRMED'        THEN SET NEW.confirmed_at = UTC_TIMESTAMP();
      WHEN 'PREPARING'        THEN SET NEW.preparing_at = UTC_TIMESTAMP();
      WHEN 'READY'            THEN SET NEW.ready_at = UTC_TIMESTAMP();
      WHEN 'OUT_FOR_DELIVERY' THEN SET NEW.out_for_delivery_at = UTC_TIMESTAMP();
      WHEN 'DELIVERED'        THEN SET NEW.delivered_at = UTC_TIMESTAMP();
      WHEN 'CANCELLED'        THEN SET NEW.cancelled_at = UTC_TIMESTAMP();
      ELSE BEGIN END;
    END CASE;
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_order_items_before_update $$
CREATE TRIGGER trg_order_items_before_update
BEFORE UPDATE ON order_items
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Os itens de um pedido já feito não podem ser alterados';
END $$

DELIMITER ;
