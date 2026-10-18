-- 021 - Cancelamento do pedido — módulo do Cliente (Willian, ponto 9)
--
-- Escopo, seção 11: o cliente só cancela enquanto o pedido está PENDING (aguardando
-- confirmação); depois disso, só a proprietária (até READY). O fluxo já é conferido por
-- fn_order_status_allowed e trg_orders_before_update (script 019).
--
-- cancelled_by        → quem cancelou: CUSTOMER (pelo app) ou OWNER (administração)
-- cancellation_reason → motivo opcional informado pelo cliente
--
-- trg_orders_cancelled_by
--     Roda depois de trg_orders_before_update. Se o pedido foi cancelado sem informar
--     quem cancelou, grava OWNER: pelo fluxo da seção 11 só cliente e proprietária
--     cancelam, e o backend do Cliente sempre manda CUSTOMER. Assim a rota da
--     proprietária (POST /owner/orders/:id/cancel) não precisa mudar.

ALTER TABLE orders
  ADD COLUMN cancelled_by        ENUM('CUSTOMER', 'OWNER') NULL AFTER cancelled_at,
  ADD COLUMN cancellation_reason VARCHAR(200)              NULL AFTER cancelled_by;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_orders_cancelled_by $$
CREATE TRIGGER trg_orders_cancelled_by
BEFORE UPDATE ON orders
FOR EACH ROW
FOLLOWS trg_orders_before_update
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED' AND NEW.cancelled_by IS NULL THEN
    SET NEW.cancelled_by = 'OWNER';
  END IF;
END $$

DELIMITER ;
