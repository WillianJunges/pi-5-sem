-- 007 - Procedure sp_create_user
-- Cria um usuário validando os dados e registrando a criação na auditoria, tudo em uma
-- única transação (ou grava os dois, ou nenhum).
--
-- Consistências:
--   * nome com pelo menos 2 caracteres
--   * e-mail em formato válido e ainda não cadastrado
--   * perfil entre CUSTOMER, OWNER e COURIER
--
-- Erros (tratados pelo backend em shared/errors/databaseErrors.ts):
--   * SQLSTATE 45000 → dado inválido   (HTTP 400)
--   * SQLSTATE 23000 / errno 1062 → e-mail duplicado (HTTP 409)

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_create_user $$
CREATE PROCEDURE sp_create_user(
  IN p_id            CHAR(36),
  IN p_name          VARCHAR(120),
  IN p_email         VARCHAR(160),
  IN p_phone         VARCHAR(20),
  IN p_password_hash VARCHAR(255),
  IN p_role          VARCHAR(20)
)
BEGIN
  DECLARE v_email VARCHAR(160) DEFAULT LOWER(TRIM(p_email));

  -- Qualquer erro (inclusive os SIGNAL abaixo): desfaz a transação e repassa o erro.
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_name IS NULL OR CHAR_LENGTH(TRIM(p_name)) < 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Nome deve ter pelo menos 2 caracteres';
  END IF;

  IF v_email IS NULL OR v_email NOT REGEXP '^[^@ ]+@[^@ ]+\\.[^@ ]+$' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'E-mail inválido';
  END IF;

  IF p_role IS NULL OR p_role NOT IN ('CUSTOMER', 'OWNER', 'COURIER') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Perfil inválido';
  END IF;

  IF p_password_hash IS NULL OR p_password_hash = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Senha não informada';
  END IF;

  START TRANSACTION;

  IF EXISTS (SELECT 1 FROM users WHERE email = v_email FOR UPDATE) THEN
    SIGNAL SQLSTATE '23000' SET MESSAGE_TEXT = 'E-mail já cadastrado', MYSQL_ERRNO = 1062;
  END IF;

  INSERT INTO users (id, name, email, phone, password_hash, role)
  VALUES (p_id, p_name, v_email, NULLIF(TRIM(p_phone), ''), p_password_hash, p_role);

  INSERT INTO user_audit (user_id, field, old_value, new_value)
  VALUES (p_id, 'created', NULL, p_role);

  COMMIT;
END $$

DELIMITER ;
