-- 017 - Triggers do catálogo — módulo da Proprietária (Lucas)
--
-- trg_menu_items_before_insert / _before_update / _before_delete
--     Bloqueiam qualquer alteração nos itens de um cardápio ENCERRADO: ele vira histórico.
--
-- trg_fee_ranges_before_insert / _before_update
--     Impedem faixas de taxa ativas que se sobreponham (encostar na ponta é permitido).
--     Garante a regra no banco mesmo que alguém insira direto pelo Workbench.
--
-- Erros: SQLSTATE 45000 → HTTP 400 no backend.

DELIMITER $$

DROP TRIGGER IF EXISTS trg_menu_items_before_insert $$
CREATE TRIGGER trg_menu_items_before_insert
BEFORE INSERT ON menu_items
FOR EACH ROW
BEGIN
  IF (SELECT status FROM menus WHERE id = NEW.menu_id) = 'CLOSED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cardápios encerrados não podem ser alterados';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_menu_items_before_update $$
CREATE TRIGGER trg_menu_items_before_update
BEFORE UPDATE ON menu_items
FOR EACH ROW
BEGIN
  IF (SELECT status FROM menus WHERE id = OLD.menu_id) = 'CLOSED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cardápios encerrados não podem ser alterados';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_menu_items_before_delete $$
CREATE TRIGGER trg_menu_items_before_delete
BEFORE DELETE ON menu_items
FOR EACH ROW
BEGIN
  IF (SELECT status FROM menus WHERE id = OLD.menu_id) = 'CLOSED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cardápios encerrados não podem ser alterados';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_fee_ranges_before_insert $$
CREATE TRIGGER trg_fee_ranges_before_insert
BEFORE INSERT ON delivery_fee_ranges
FOR EACH ROW
BEGIN
  IF NEW.active AND EXISTS (
    SELECT 1 FROM delivery_fee_ranges r
     WHERE r.active = TRUE
       AND r.min_meters < NEW.max_meters
       AND NEW.min_meters < r.max_meters
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Essa faixa se sobrepõe a outra faixa ativa';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_fee_ranges_before_update $$
CREATE TRIGGER trg_fee_ranges_before_update
BEFORE UPDATE ON delivery_fee_ranges
FOR EACH ROW
BEGIN
  IF NEW.active AND EXISTS (
    SELECT 1 FROM delivery_fee_ranges r
     WHERE r.active = TRUE
       AND r.id <> NEW.id
       AND r.min_meters < NEW.max_meters
       AND NEW.min_meters < r.max_meters
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Essa faixa se sobrepõe a outra faixa ativa';
  END IF;
END $$

DELIMITER ;
