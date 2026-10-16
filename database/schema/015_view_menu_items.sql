-- 015 - View vw_menu_items — módulo da Proprietária (Lucas)
--
-- Junta cardápio, item, variação e produto numa linha só, já com:
--   * effective_price — preço que vale (fn_effective_price: especial ou padrão)
--   * has_special_price — se o item está com preço especial
--   * available — o item ainda pode ser vendido (produto e variação ativos), via CASE
--
-- Usada no cardápio do dia do cliente (GET /menus/today) e na tela de cardápio da
-- proprietária, sem precisar repetir os JOINs no backend.
CREATE OR REPLACE VIEW vw_menu_items AS
SELECT
  m.id                                           AS menu_id,
  m.name                                         AS menu_name,
  m.menu_date,
  m.status                                       AS menu_status,
  mi.id                                          AS item_id,
  p.id                                           AS product_id,
  p.name                                         AS product_name,
  p.description                                  AS product_description,
  p.category                                     AS product_category,
  v.id                                           AS variant_id,
  v.name                                         AS variant_name,
  v.price                                        AS standard_price,
  mi.special_price,
  fn_effective_price(v.price, mi.special_price)  AS effective_price,
  CASE WHEN mi.special_price IS NULL THEN FALSE ELSE TRUE END AS has_special_price,
  CASE WHEN p.active = TRUE AND v.active = TRUE THEN TRUE ELSE FALSE END AS available,
  mi.created_at                                  AS item_created_at
FROM menus m
JOIN menu_items mi      ON mi.menu_id = m.id
JOIN product_variants v ON v.id = mi.variant_id
JOIN products p         ON p.id = v.product_id;
