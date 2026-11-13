-- Modelos recorrentes permanecem em rascunho e são copiados para cada dia.
-- 0 = domingo, 1 = segunda, ..., 6 = sábado. NULL indica cardápio por data.
ALTER TABLE menus ADD COLUMN weekday TINYINT UNSIGNED NULL DEFAULT NULL;
ALTER TABLE menus ADD UNIQUE KEY uq_menus_weekday (weekday);
