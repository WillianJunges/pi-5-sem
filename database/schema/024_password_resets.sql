-- 024 - Recuperação de senha ("Esqueci minha senha") — módulo base (Ricardo)
--
-- Fluxo: o cliente informa o e-mail → o backend gera um código de 6 dígitos (vale 15 min)
-- → com o código, ele escolhe uma senha nova.
-- SIMULAÇÃO (decisão da equipe): o projeto não tem serviço de e-mail, então o código volta
-- na resposta da API e o app mostra na tela, como se tivesse chegado por e-mail. Em produção
-- (NODE_ENV=production) o código NUNCA volta na resposta.
--
-- password_resets: um código por pedido. Guardamos só o hash SHA-256 (como nos refresh
-- tokens): quem ler o banco não descobre o código.
--   attempts → códigos errados digitados; no 5º o código deixa de valer
--   used_at  → quando foi usado (NULL = ainda não); pedir um código novo invalida os antigos
--
-- sp_complete_password_reset(usuário, código usado, novo hash da senha)
--     Numa transação: troca a senha, marca o código como usado, tira o bloqueio de login
--     (script 023), encerra todas as sessões abertas (refresh tokens) e registra na
--     auditoria. Ou faz tudo, ou nada.

CREATE TABLE IF NOT EXISTS password_resets (
  id          CHAR(36)  NOT NULL,
  user_id     CHAR(36)  NOT NULL,
  code_hash   CHAR(64)  NOT NULL,
  attempts    INT       NOT NULL DEFAULT 0,
  expires_at  DATETIME  NOT NULL,
  used_at     DATETIME  NULL,
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_password_resets_user (user_id, created_at),
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_complete_password_reset $$
CREATE PROCEDURE sp_complete_password_reset(
  IN p_user_id       CHAR(36),
  IN p_reset_id      CHAR(36),
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

  -- o código precisa ser deste usuário e ainda valer (outro pedido pode ter usado antes)
  UPDATE password_resets
     SET used_at = UTC_TIMESTAMP()
   WHERE id = p_reset_id
     AND user_id = p_user_id
     AND used_at IS NULL
     AND expires_at > UTC_TIMESTAMP();

  IF ROW_COUNT() = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Código expirado ou já usado. Peça um novo código.';
  END IF;

  UPDATE users
     SET password_hash = p_password_hash,
         failed_login_attempts = 0,
         locked_until = NULL
   WHERE id = p_user_id;

  UPDATE refresh_tokens
     SET revoked_at = UTC_TIMESTAMP()
   WHERE user_id = p_user_id
     AND revoked_at IS NULL;

  INSERT INTO user_audit (user_id, field, old_value, new_value)
  VALUES (p_user_id, 'password', NULL, 'reset');

  COMMIT;
END $$

DELIMITER ;
