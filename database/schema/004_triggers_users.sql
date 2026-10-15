-- 004 - Triggers da tabela users
--
-- trg_users_before_insert / trg_users_before_update
--   Padroniza os dados antes de gravar: e-mail em minúsculas e sem espaços, nome sem
--   espaços nas pontas. Garante consistência mesmo se o INSERT vier de fora da API.
--
-- trg_users_after_update
--   1. Registra em user_audit toda mudança de perfil, e-mail ou status (ativo/inativo).
--   2. Regra de segurança: ao DESATIVAR um usuário, revoga todas as sessões dele
--      (refresh tokens), derrubando o acesso imediatamente em todos os aparelhos.

DELIMITER $$

DROP TRIGGER IF EXISTS trg_users_before_insert $$
CREATE TRIGGER trg_users_before_insert
BEFORE INSERT ON users
FOR EACH ROW
BEGIN
  SET NEW.email = LOWER(TRIM(NEW.email));
  SET NEW.name  = TRIM(NEW.name);
END $$

DROP TRIGGER IF EXISTS trg_users_before_update $$
CREATE TRIGGER trg_users_before_update
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
  SET NEW.email = LOWER(TRIM(NEW.email));
  SET NEW.name  = TRIM(NEW.name);
END $$

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

DELIMITER ;
