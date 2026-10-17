-- 020 - View do histórico de pedidos — módulo do Cliente (Willian)
--
-- vw_customer_orders: uma linha por pedido, já com o resumo dos itens, para a aba
-- "Pedidos" do app (GET /orders) sem buscar os itens de cada pedido separadamente.
--   item_count    → total de unidades (2 marmitas + 1 refri = 3)
--   items_summary → "2x Marmita de Frango (Média), 1x Coca-Cola (Lata 350 ml)"
--   is_active     → TRUE enquanto o pedido está em andamento (CASE sobre o status)

CREATE OR REPLACE VIEW vw_customer_orders AS
SELECT
  o.id,
  o.customer_id,
  o.status,
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
