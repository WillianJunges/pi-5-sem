-- 005 - Functions
--
-- fn_role_label(role)          → nome do perfil em português ('Cliente', 'Proprietária', 'Motoboy')
-- fn_active_sessions(user_id)  → quantidade de sessões válidas (refresh tokens não revogados
--                                e não expirados) do usuário

DELIMITER $$

DROP FUNCTION IF EXISTS fn_role_label $$
CREATE FUNCTION fn_role_label(p_role VARCHAR(20))
RETURNS VARCHAR(20)
DETERMINISTIC
NO SQL
BEGIN
  RETURN CASE p_role
    WHEN 'CUSTOMER' THEN 'Cliente'
    WHEN 'OWNER'    THEN 'Proprietária'
    WHEN 'COURIER'  THEN 'Motoboy'
    ELSE 'Desconhecido'
  END;
END $$

DROP FUNCTION IF EXISTS fn_active_sessions $$
CREATE FUNCTION fn_active_sessions(p_user_id CHAR(36))
RETURNS INT
READS SQL DATA
BEGIN
  DECLARE v_total INT DEFAULT 0;

  SELECT COUNT(*)
    INTO v_total
    FROM refresh_tokens
   WHERE user_id = p_user_id
     AND revoked_at IS NULL
     AND expires_at > UTC_TIMESTAMP();

  RETURN v_total;
END $$

DELIMITER ;
