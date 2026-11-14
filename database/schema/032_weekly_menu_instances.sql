-- Cada modelo gera no máximo uma cópia diária, inclusive em chamadas simultâneas.
ALTER TABLE menus
  ADD COLUMN source_weekly_id CHAR(36) NULL,
  ADD UNIQUE KEY uq_menus_weekly_instance (source_weekly_id, menu_date);
