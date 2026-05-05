-- ============================================================
-- MEC2 Inventory Management System - Receipt Serials + Attachments
-- ============================================================
-- Additive migration only:
--   - Adds serial tracking for receipt items
--   - Adds shared receipt attachment support
--   - Adds validation triggers and RLS for the new tables
--   - Does not modify existing tables, views, or workflows
-- ============================================================

BEGIN;


-- --------------------------------------------------------
-- TABLES
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS receipt_attachments (
  id                     SERIAL PRIMARY KEY,
  receipt_id             TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  receipt_item_id        INTEGER REFERENCES receipt_items(id) ON DELETE CASCADE,
  receipt_item_serial_id INTEGER,
  attachment_type        TEXT NOT NULL CHECK (attachment_type IN (
    'delivery_photo',
    'item_photo',
    'label_photo'
  )),
  file_name              TEXT NOT NULL,
  file_path              TEXT NOT NULL,
  content_type           TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipt_item_serials (
  id                        SERIAL PRIMARY KEY,
  receipt_id                TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  receipt_item_id           INTEGER NOT NULL REFERENCES receipt_items(id) ON DELETE CASCADE,
  purchase_order_item_id    INTEGER REFERENCES purchase_order_items(id),
  project_value             TEXT REFERENCES projects(value),
  location_value            TEXT REFERENCES locations(value),
  serial_number             TEXT NOT NULL CHECK (btrim(serial_number) <> ''),
  label_photo_attachment_id INTEGER,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (receipt_item_id, serial_number)
);

ALTER TABLE receipt_attachments
  ADD CONSTRAINT receipt_attachments_serial_fk
  FOREIGN KEY (receipt_item_serial_id) REFERENCES receipt_item_serials(id) ON DELETE CASCADE;

ALTER TABLE receipt_item_serials
  ADD CONSTRAINT receipt_item_serials_label_attachment_fk
  FOREIGN KEY (label_photo_attachment_id) REFERENCES receipt_attachments(id) ON DELETE SET NULL;


-- --------------------------------------------------------
-- FUNCTIONS
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_receipt_attachment_scope()
RETURNS TRIGGER AS $$
BEGIN
  CASE NEW.attachment_type
    WHEN 'delivery_photo' THEN
      IF NEW.receipt_item_id IS NOT NULL OR NEW.receipt_item_serial_id IS NOT NULL THEN
        RAISE EXCEPTION 'Delivery photos cannot be attached to a receipt item or serial entry.';
      END IF;

    WHEN 'item_photo' THEN
      IF NEW.receipt_item_id IS NULL OR NEW.receipt_item_serial_id IS NOT NULL THEN
        RAISE EXCEPTION 'Item photos must belong to a receipt item and cannot target a serial entry.';
      END IF;

    WHEN 'label_photo' THEN
      IF NEW.receipt_item_serial_id IS NULL THEN
        RAISE EXCEPTION 'Label photos must belong to a receipt item serial entry.';
      END IF;

    ELSE
      RAISE EXCEPTION 'Unsupported attachment type: %.', NEW.attachment_type;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION validate_receipt_attachment_receipt_consistency()
RETURNS TRIGGER AS $$
DECLARE
  v_item_receipt_id TEXT;
  v_serial_receipt_id TEXT;
BEGIN
  IF NEW.receipt_item_id IS NOT NULL THEN
    SELECT receipt_id INTO v_item_receipt_id
    FROM receipt_items
    WHERE id = NEW.receipt_item_id;

    IF v_item_receipt_id IS NULL THEN
      RAISE EXCEPTION 'Receipt item % does not exist.', NEW.receipt_item_id;
    END IF;

    IF v_item_receipt_id <> NEW.receipt_id THEN
      RAISE EXCEPTION 'Attachment receipt does not match the selected receipt item.';
    END IF;
  END IF;

  IF NEW.receipt_item_serial_id IS NOT NULL THEN
    SELECT receipt_id INTO v_serial_receipt_id
    FROM receipt_item_serials
    WHERE id = NEW.receipt_item_serial_id;

    IF v_serial_receipt_id IS NULL THEN
      RAISE EXCEPTION 'Receipt item serial % does not exist.', NEW.receipt_item_serial_id;
    END IF;

    IF v_serial_receipt_id <> NEW.receipt_id THEN
      RAISE EXCEPTION 'Attachment receipt does not match the selected serial entry.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION validate_receipt_item_serial_context()
RETURNS TRIGGER AS $$
DECLARE
  v_receipt_po_id TEXT;
  v_receipt_project_value TEXT;
  v_receipt_location_value TEXT;
  v_receipt_item_receipt_id TEXT;
  v_receipt_item_po_item_id INTEGER;
BEGIN
  SELECT purchase_order_id, project_value, location_value
  INTO v_receipt_po_id, v_receipt_project_value, v_receipt_location_value
  FROM receipts
  WHERE id = NEW.receipt_id;

  IF v_receipt_po_id IS NULL AND NEW.purchase_order_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'Manual receipts cannot attach purchase order item context to a serial entry.';
  END IF;

  SELECT receipt_id, purchase_order_item_id
  INTO v_receipt_item_receipt_id, v_receipt_item_po_item_id
  FROM receipt_items
  WHERE id = NEW.receipt_item_id;

  IF v_receipt_item_receipt_id IS NULL THEN
    RAISE EXCEPTION 'Receipt item % does not exist.', NEW.receipt_item_id;
  END IF;

  IF v_receipt_item_receipt_id <> NEW.receipt_id THEN
    RAISE EXCEPTION 'Serial entry receipt does not match the selected receipt item.';
  END IF;

  IF NEW.purchase_order_item_id IS NOT NULL THEN
    IF v_receipt_item_po_item_id IS NOT NULL
       AND NEW.purchase_order_item_id <> v_receipt_item_po_item_id THEN
      RAISE EXCEPTION 'Serial entry purchase order item does not match the selected receipt item.';
    END IF;
  ELSIF v_receipt_item_po_item_id IS NOT NULL THEN
    NEW.purchase_order_item_id := v_receipt_item_po_item_id;
  END IF;

  IF NEW.project_value IS NULL THEN
    NEW.project_value := v_receipt_project_value;
  END IF;

  IF NEW.location_value IS NULL THEN
    NEW.location_value := v_receipt_location_value;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- --------------------------------------------------------
-- TRIGGERS
-- --------------------------------------------------------

DROP TRIGGER IF EXISTS receipt_attachments_validate_scope ON receipt_attachments;
CREATE TRIGGER receipt_attachments_validate_scope
  BEFORE INSERT OR UPDATE ON receipt_attachments
  FOR EACH ROW EXECUTE FUNCTION validate_receipt_attachment_scope();

DROP TRIGGER IF EXISTS receipt_attachments_validate_receipt_consistency ON receipt_attachments;
CREATE TRIGGER receipt_attachments_validate_receipt_consistency
  BEFORE INSERT OR UPDATE ON receipt_attachments
  FOR EACH ROW EXECUTE FUNCTION validate_receipt_attachment_receipt_consistency();

DROP TRIGGER IF EXISTS receipt_item_serials_validate_context ON receipt_item_serials;
CREATE TRIGGER receipt_item_serials_validate_context
  BEFORE INSERT OR UPDATE ON receipt_item_serials
  FOR EACH ROW EXECUTE FUNCTION validate_receipt_item_serial_context();


-- --------------------------------------------------------
-- RLS
-- --------------------------------------------------------

ALTER TABLE receipt_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_item_serials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipt_attachments_select" ON receipt_attachments;
CREATE POLICY "receipt_attachments_select" ON receipt_attachments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "receipt_attachments_insert" ON receipt_attachments;
CREATE POLICY "receipt_attachments_insert" ON receipt_attachments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

DROP POLICY IF EXISTS "receipt_attachments_update" ON receipt_attachments;
CREATE POLICY "receipt_attachments_update" ON receipt_attachments
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

DROP POLICY IF EXISTS "receipt_item_serials_select" ON receipt_item_serials;
CREATE POLICY "receipt_item_serials_select" ON receipt_item_serials
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "receipt_item_serials_insert" ON receipt_item_serials;
CREATE POLICY "receipt_item_serials_insert" ON receipt_item_serials
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

DROP POLICY IF EXISTS "receipt_item_serials_update" ON receipt_item_serials;
CREATE POLICY "receipt_item_serials_update" ON receipt_item_serials
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

COMMIT;
