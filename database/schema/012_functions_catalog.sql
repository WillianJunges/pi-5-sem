-- 012 - Functions do catálogo — módulo da Proprietária (Lucas)
--
-- fn_effective_price(preço padrão, preço especial)
--     → o preço que vale no pedido. Regra do escopo (seção 8), escrita com CASE:
--       existe preço especial? usa ele; senão, o preço padrão.
--
-- fn_delivery_fee(distância em metros)
--     → a taxa da faixa ativa que cobre a distância, ou NULL se estiver fora da área
--       atendida (escopo, seção 19). Usada pelo módulo de pedidos ao fechar o pedido.

DELIMITER $$

DROP FUNCTION IF EXISTS fn_effective_price $$
CREATE FUNCTION fn_effective_price(p_price DECIMAL(10,2), p_special_price DECIMAL(10,2))
RETURNS DECIMAL(10,2)
DETERMINISTIC
NO SQL
BEGIN
  RETURN CASE
    WHEN p_special_price IS NOT NULL THEN p_special_price
    ELSE p_price
  END;
END $$

DROP FUNCTION IF EXISTS fn_delivery_fee $$
CREATE FUNCTION fn_delivery_fee(p_distance_meters INT)
RETURNS DECIMAL(10,2)
READS SQL DATA
BEGIN
  DECLARE v_fee DECIMAL(10,2) DEFAULT NULL;

  IF p_distance_meters IS NULL OR p_distance_meters < 0 THEN
    RETURN NULL;
  END IF;

  SELECT fee
    INTO v_fee
    FROM delivery_fee_ranges
   WHERE active = TRUE
     AND p_distance_meters <= max_meters
     AND CASE
           WHEN min_meters = 0 THEN p_distance_meters >= 0   -- a primeira faixa inclui o 0
           ELSE p_distance_meters > min_meters
         END
   ORDER BY min_meters
   LIMIT 1;

  RETURN v_fee;
END $$

DELIMITER ;
