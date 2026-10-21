-- 023 - Limite de tentativas de login — módulo base (Ricardo)
--
-- Proteção contra quem tenta adivinhar a senha:
--   * a partir da 6ª senha errada seguida, o app avisa quantas tentativas restam
--   * na 10ª, a conta fica bloqueada por 10 minutos (nem a senha certa entra)
--   * acertar a senha zera o contador
--
-- failed_login_attempts → senhas erradas seguidas desde o último login certo (ou bloqueio)
-- locked_until          → até quando o login está bloqueado (UTC); NULL = liberado
--
-- sp_register_login_failure(usuário, limite, minutos de bloqueio)
--     Soma uma tentativa errada e, se chegou ao limite, bloqueia e zera o contador (depois
--     do bloqueio a pessoa ganha as 10 tentativas de novo). Tudo num UPDATE só, então duas
--     tentativas ao mesmo tempo não se perdem. Devolve o contador e o bloqueio atualizados.
--
-- sp_reset_login_failures(usuário)
--     Login certo: zera o contador e tira o bloqueio.

ALTER TABLE users
  ADD COLUMN failed_login_attempts INT      NOT NULL DEFAULT 0 AFTER active,
  ADD COLUMN locked_until          DATETIME NULL               AFTER failed_login_attempts;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_register_login_failure $$
CREATE PROCEDURE sp_register_login_failure(
  IN p_user_id      CHAR(36),
  IN p_max_attempts INT,
  IN p_lock_minutes INT
)
BEGIN
  -- No MySQL o SET é avaliado da esquerda para a direita: locked_until vem primeiro para
  -- ainda enxergar o contador ANTES de somar.
  UPDATE users
     SET locked_until = CASE
           WHEN failed_login_attempts + 1 >= p_max_attempts
             THEN UTC_TIMESTAMP() + INTERVAL p_lock_minutes MINUTE
           ELSE locked_until
         END,
         failed_login_attempts = CASE
           WHEN failed_login_attempts + 1 >= p_max_attempts THEN 0
           ELSE failed_login_attempts + 1
         END
   WHERE id = p_user_id;

  SELECT failed_login_attempts, locked_until FROM users WHERE id = p_user_id;
END $$

DROP PROCEDURE IF EXISTS sp_reset_login_failures $$
CREATE PROCEDURE sp_reset_login_failures(IN p_user_id CHAR(36))
BEGIN
  UPDATE users
     SET failed_login_attempts = 0,
         locked_until = NULL
   WHERE id = p_user_id
     AND (failed_login_attempts <> 0 OR locked_until IS NOT NULL);
END $$

DELIMITER ;
