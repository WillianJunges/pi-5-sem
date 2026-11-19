-- Valores para entregas grátis e cópia histórica do ganho de cada entrega.
ALTER TABLE store_preferences ADD COLUMN free_delivery_courier_fee DECIMAL(10,2) NOT NULL DEFAULT 7.00;
ALTER TABLE deliveries ADD COLUMN courier_earnings DECIMAL(10,2) NULL;

-- Pedidos pagos já registram a taxa; entregas grátis antigas concluídas continuam
-- sem valor conhecido. Em entregas já atribuídas e ainda ativas, usa-se o padrão.
UPDATE deliveries d JOIN orders o ON o.id = d.order_id
SET d.courier_earnings = CASE
  WHEN o.delivery_fee > 0 THEN o.delivery_fee
  WHEN d.status IN ('ASSIGNED', 'IN_PROGRESS') THEN 7.00
  ELSE NULL END
WHERE d.courier_id IS NOT NULL;
