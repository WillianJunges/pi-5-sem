-- 016 - Procedure sp_activate_menu — módulo da Proprietária (Lucas)
--
-- Publica um cardápio (DRAFT → ACTIVE) em uma única transação.
--
-- Consistências:
--   * o cardápio existe e está em rascunho
--   * tem ao menos um item
--   * todos os itens estão disponíveis (produto e variação ativos)
--   * não existe outro cardápio ativo (só um por vez)
--
-- O SELECT ... FOR UPDATE nos cardápios ativos impede que duas ativações ao mesmo tempo
-- deixem dois cardápios ativos.
--
-- Erros (tratados em shared/errors/databaseErrors.ts):
--   * SQLSTATE 45000 → regra não atendida (HTTP 400)

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_activate_menu $$
CREATE PROCEDURE sp_activate_menu(IN p_menu_id CHAR(36))
BEGIN
  DECLARE v_status VARCHAR(10) DEFAULT NULL;
  DECLARE v_items INT DEFAULT 0;
  DECLARE v_unavailable INT DEFAULT 0;
  DECLARE v_active_name VARCHAR(120) DEFAULT NULL;
  DECLARE v_message VARCHAR(255);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT status INTO v_status FROM menus WHERE id = p_menu_id FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cardápio não encontrado';
  END IF;

  IF v_status <> 'DRAFT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Só cardápios em rascunho podem ser ativados';
  END IF;

  SELECT COUNT(*),
         SUM(CASE WHEN available THEN 0 ELSE 1 END)
    INTO v_items, v_unavailable
    FROM vw_menu_items
   WHERE menu_id = p_menu_id;

  IF v_items = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Adicione ao menos um item antes de ativar o cardápio';
  END IF;

  IF v_unavailable > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'O cardápio tem itens desativados. Retire-os ou reative-os';
  END IF;

  SELECT name INTO v_active_name FROM menus WHERE status = 'ACTIVE' AND id <> p_menu_id LIMIT 1 FOR UPDATE;

  IF v_active_name IS NOT NULL THEN
    SET v_message = CONCAT('O cardápio "', v_active_name, '" ainda está ativo. Encerre-o antes de ativar outro');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
  END IF;

  UPDATE menus SET status = 'ACTIVE', activated_at = UTC_TIMESTAMP() WHERE id = p_menu_id;

  COMMIT;
END $$

DELIMITER ;
