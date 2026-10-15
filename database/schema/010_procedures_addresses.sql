-- 010 - Procedures de endereços
--
-- sp_set_default_address(user, address)
--   Troca o endereço principal do cliente em transação: desmarca o atual e marca o novo.
--   A ordem importa por causa do índice UNIQUE uq_addresses_one_default.
--
-- sp_delete_address(user, address)
--   Exclusão lógica. Se o endereço excluído era o principal, o endereço mais recente
--   que sobrou vira o principal (o cliente nunca fica sem principal tendo endereços).
--
-- Consistências (as duas): o endereço precisa existir, pertencer ao cliente e não estar
-- excluído. Senão: SIGNAL com MYSQL_ERRNO 5404 (o backend devolve HTTP 404).

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_set_default_address $$
CREATE PROCEDURE sp_set_default_address(
  IN p_user_id    CHAR(36),
  IN p_address_id CHAR(36)
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  IF NOT EXISTS (
    SELECT 1 FROM addresses
     WHERE id = p_address_id AND user_id = p_user_id AND deleted_at IS NULL
     FOR UPDATE
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Endereço não encontrado', MYSQL_ERRNO = 5404;
  END IF;

  UPDATE addresses SET is_default = FALSE
   WHERE user_id = p_user_id AND is_default = TRUE AND id <> p_address_id;

  UPDATE addresses SET is_default = TRUE WHERE id = p_address_id;

  COMMIT;
END $$

DROP PROCEDURE IF EXISTS sp_delete_address $$
CREATE PROCEDURE sp_delete_address(
  IN p_user_id    CHAR(36),
  IN p_address_id CHAR(36)
)
BEGIN
  DECLARE v_was_default BOOLEAN;
  DECLARE v_next_id CHAR(36) DEFAULT NULL;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT is_default INTO v_was_default
    FROM addresses
   WHERE id = p_address_id AND user_id = p_user_id AND deleted_at IS NULL
   FOR UPDATE;

  IF v_was_default IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Endereço não encontrado', MYSQL_ERRNO = 5404;
  END IF;

  UPDATE addresses SET deleted_at = UTC_TIMESTAMP(), is_default = FALSE WHERE id = p_address_id;

  IF v_was_default THEN
    SELECT id INTO v_next_id
      FROM addresses
     WHERE user_id = p_user_id AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_next_id IS NOT NULL THEN
      UPDATE addresses SET is_default = TRUE WHERE id = v_next_id;
    END IF;
  END IF;

  COMMIT;
END $$

DELIMITER ;
