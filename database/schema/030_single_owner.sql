-- Uma única conta OWNER, mesmo desativada. O índice também cobre mudanças de perfil
-- e impede cadastros simultâneos. Bancos com mais de uma OWNER precisam de revisão
-- manual antes da migração; nenhuma conta é alterada ou removida automaticamente.
ALTER TABLE users
  ADD COLUMN single_owner_guard TINYINT GENERATED ALWAYS AS
    (CASE WHEN role = 'OWNER' THEN 1 ELSE NULL END) STORED,
  ADD UNIQUE KEY uq_users_single_owner (single_owner_guard);
