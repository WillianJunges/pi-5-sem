-- 025 - Perfil editável — módulo base (Ricardo)
--
-- O usuário passa a editar o próprio nome e telefone e a trocar a senha na tela "Meu perfil".
-- O telefone vira obrigatório no cadastro do app (validado no backend; a coluna continua
-- aceitando NULL porque contas antigas e motoboys criados pela proprietária podem não ter).
--
-- trg_users_after_update (mesmo trigger do script 004, agora também com nome e telefone)
--     Registra em user_audit toda mudança de perfil, e-mail, status, NOME e TELEFONE, e
--     continua revogando as sessões ao desativar o usuário.
--
-- sp_change_password(usuário, novo hash)
--     Troca a senha pelo perfil e registra na auditoria, numa transação. As outras sessões
--     continuam abertas (o aparelho em uso não precisa entrar de novo).
--     A troca pelo "Esqueci minha senha" fica na sp_complete_password_reset (script 024).

DELIMITER $$

DROP TRIGGER IF EXISTS trg_users_after_update $$
CREATE TRIGGER trg_users_after_update
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
  IF NOT (OLD.role <=> NEW.role) THEN
    INSERT INTO user_audit (user_id, field, old_value, new_value)
    VALUES (NEW.id, 'role', OLD.role, NEW.role);
  END IF;

  IF NOT (OLD.email <=> NEW.email) THEN
    INSERT INTO user_audit (user_id, field, old_value, new_value)
    VALUES (NEW.id, 'email', OLD.email, NEW.email);
  END IF;

  IF NOT (OLD.name <=> NEW.name) THEN
    INSERT INTO user_audit (user_id, field, old_value, new_value)
    VALUES (NEW.id, 'name', OLD.name, NEW.name);
  END IF;

  IF NOT (OLD.phone <=> NEW.phone) THEN
    INSERT INTO user_audit (user_id, field, old_value, new_value)
    VALUES (NEW.id, 'phone', OLD.phone, NEW.phone);
  END IF;

  IF NOT (OLD.active <=> NEW.active) THEN
    INSERT INTO user_audit (user_id, field, old_value, new_value)
    VALUES (NEW.id, 'active', OLD.active, NEW.active);

    IF NEW.active = FALSE THEN
      UPDATE refresh_tokens
         SET revoked_at = UTC_TIMESTAMP()
       WHERE user_id = NEW.id
         AND revoked_at IS NULL;
    END IF;
  END IF;
END $$

DROP PROCEDURE IF EXISTS sp_change_password $$
CREATE PROCEDURE sp_change_password(
  IN p_user_id       CHAR(36),
  IN p_password_hash VARCHAR(255)
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_password_hash IS NULL OR p_password_hash = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Senha não informada';
  END IF;

  START TRANSACTION;

  UPDATE users SET password_hash = p_password_hash WHERE id = p_user_id;

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Usuário não encontrado';
  END IF;

  -- a senha nunca vai para a auditoria, só o registro de que mudou
  INSERT INTO user_audit (user_id, field, old_value, new_value)
  VALUES (p_user_id, 'password', NULL, 'changed');

  COMMIT;
END $$

DELIMITER ;
