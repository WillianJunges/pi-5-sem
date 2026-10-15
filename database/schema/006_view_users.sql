-- 006 - View vw_users
-- Dados públicos dos usuários (SEM password_hash), com o nome do perfil em português e a
-- quantidade de sessões ativas. Usada na listagem de usuários da proprietária (GET /users).
CREATE OR REPLACE VIEW vw_users AS
SELECT
  u.id,
  u.name,
  u.email,
  u.phone,
  u.role,
  fn_role_label(u.role)    AS role_label,
  u.active,
  fn_active_sessions(u.id) AS active_sessions,
  u.created_at,
  u.updated_at
FROM users u;
