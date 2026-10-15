-- 008 - Procedure sp_rotate_refresh_token
-- Troca um refresh token por um novo (renovação de sessão) de forma ATÔMICA: o token
-- antigo é bloqueado (SELECT ... FOR UPDATE), validado, revogado e o novo é inserido na
-- mesma transação. Assim duas renovações simultâneas com o mesmo token não geram duas
-- sessões.
--
-- Consistências:
--   * token precisa existir, não estar expirado e o usuário precisa estar ativo
--   * token JÁ USADO sendo reapresentado = possível roubo: revoga TODAS as sessões do
--     usuário (confirma essa revogação com COMMIT antes de devolver o erro)
--
-- Retorno: um result set com a coluna user_id (dono da nova sessão).
-- Erros: MYSQL_ERRNO 5401 → sessão inválida/expirada (HTTP 401)

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_rotate_refresh_token $$
CREATE PROCEDURE sp_rotate_refresh_token(
  IN p_old_hash   CHAR(64),
  IN p_new_id     CHAR(36),
  IN p_new_hash   CHAR(64),
  IN p_expires_at DATETIME
)
BEGIN
  DECLARE v_token_id CHAR(36);
  DECLARE v_user_id  CHAR(36);
  DECLARE v_expires  DATETIME;
  DECLARE v_revoked  DATETIME;
  DECLARE v_active   BOOLEAN;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT id, user_id, expires_at, revoked_at
    INTO v_token_id, v_user_id, v_expires, v_revoked
    FROM refresh_tokens
   WHERE token_hash = p_old_hash
     FOR UPDATE;

  IF v_token_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sessão inválida', MYSQL_ERRNO = 5401;
  END IF;

  IF v_revoked IS NOT NULL THEN
    UPDATE refresh_tokens
       SET revoked_at = UTC_TIMESTAMP()
     WHERE user_id = v_user_id
       AND revoked_at IS NULL;
    COMMIT;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sessão inválida', MYSQL_ERRNO = 5401;
  END IF;

  IF v_expires <= UTC_TIMESTAMP() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sessão expirada', MYSQL_ERRNO = 5401;
  END IF;

  SELECT active INTO v_active FROM users WHERE id = v_user_id;
  IF v_active IS NULL OR v_active = FALSE THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sessão inválida', MYSQL_ERRNO = 5401;
  END IF;

  UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE id = v_token_id;

  INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
  VALUES (p_new_id, v_user_id, p_new_hash, p_expires_at);

  COMMIT;

  SELECT v_user_id AS user_id;
END $$

DELIMITER ;
