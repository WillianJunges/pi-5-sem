-- 003 - Auditoria de usuários (preenchida pelos triggers e pela sp_create_user).
-- Sem FK de propósito: o histórico continua existindo mesmo se o usuário for apagado.
CREATE TABLE IF NOT EXISTS user_audit (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     CHAR(36)        NOT NULL,
  field       VARCHAR(30)     NOT NULL,   -- created, role, active, email
  old_value   VARCHAR(255)    NULL,
  new_value   VARCHAR(255)    NULL,
  changed_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_audit_user (user_id, changed_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
