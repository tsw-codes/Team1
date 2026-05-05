-- ============================================================
-- MEC2 Inventory Management System - Purchase Orders + Receipts
-- ============================================================
-- Additive migration only:
--   - Adds purchase order and receipt schema
--   - Adds supporting views, functions, triggers, and RLS
--   - Does not modify existing tables, views, or workflows
-- ============================================================

BEGIN;


-- --------------------------------------------------------
-- ID FUNCTIONS
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_purchase_order_id()
RETURNS TEXT AS $$
DECLARE next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS INTEGER)), 1000) + 1
  INTO next_num
  FROM purchase_orders
  WHERE id LIKE 'PO-%';

  RETURN 'PO-' || next_num;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION generate_receipt_id()
RETURNS TEXT AS $$
DECLARE next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS INTEGER)), 1000) + 1
  INTO next_num
  FROM receipts
  WHERE id LIKE 'RC-%';

  RETURN 'RC-' || next_num;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- --------------------------------------------------------
-- TABLES
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS purchase_orders (
  id                     TEXT PRIMARY KEY DEFAULT generate_purchase_order_id(),
  po_number              TEXT NOT NULL,
  vendor                 TEXT NOT NULL,
  status_value           TEXT NOT NULL DEFAULT 'entered' CHECK (status_value IN (
    'entered',
    'partially_received',
    'received',
    'closed_with_discrepancies',
    'cancelled'
  )),
  expected_delivery_date DATE,
  entered_by             TEXT NOT NULL,
  entered_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  location_value         TEXT REFERENCES locations(value),
  project_value          TEXT REFERENCES projects(value),
  notes                  TEXT NOT NULL DEFAULT '',
  po_document_name       TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                SERIAL PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_number       INTEGER NOT NULL,
  material_name     TEXT NOT NULL,
  sku               TEXT NOT NULL,
  category          TEXT NOT NULL,
  ordered_quantity  INTEGER NOT NULL CHECK (ordered_quantity >= 0),
  unit              TEXT NOT NULL,
  unit_cost         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_id, line_number)
);

CREATE TABLE IF NOT EXISTS receipts (
  id                TEXT PRIMARY KEY DEFAULT generate_receipt_id(),
  purchase_order_id TEXT REFERENCES purchase_orders(id),
  vendor            TEXT NOT NULL,
  po_number         TEXT NOT NULL,
  delivery_date     DATE NOT NULL,
  received_by       TEXT NOT NULL,
  location_value    TEXT REFERENCES locations(value),
  project_value     TEXT REFERENCES projects(value),
  status_value      TEXT NOT NULL DEFAULT 'confirmed'
                     CHECK (status_value IN ('confirmed')),
  has_discrepancy   BOOLEAN NOT NULL DEFAULT false,
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipt_items (
  id                        SERIAL PRIMARY KEY,
  receipt_id                TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  purchase_order_item_id    INTEGER REFERENCES purchase_order_items(id),
  material_name             TEXT NOT NULL,
  sku                       TEXT NOT NULL,
  category                  TEXT NOT NULL,
  ordered_quantity_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (ordered_quantity_snapshot >= 0),
  packing_slip_quantity     INTEGER NOT NULL DEFAULT 0 CHECK (packing_slip_quantity >= 0),
  received_quantity         INTEGER NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit                      TEXT NOT NULL,
  condition                 TEXT NOT NULL DEFAULT 'Good'
                             CHECK (condition IN ('Good', 'Damaged', 'Partial')),
  variance_reason           TEXT NOT NULL DEFAULT '',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- --------------------------------------------------------
-- FUNCTIONS
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION update_purchase_order_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION validate_purchase_order_item_link()
RETURNS TRIGGER AS $$
DECLARE
  v_receipt_po_id TEXT;
  v_item_po_id TEXT;
BEGIN
  IF NEW.purchase_order_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT purchase_order_id INTO v_receipt_po_id
  FROM receipts
  WHERE id = NEW.receipt_id;

  SELECT purchase_order_id INTO v_item_po_id
  FROM purchase_order_items
  WHERE id = NEW.purchase_order_item_id;

  IF v_item_po_id IS NULL THEN
    RAISE EXCEPTION 'Purchase order item % does not exist.', NEW.purchase_order_item_id;
  END IF;

  IF v_receipt_po_id IS NULL THEN
    RAISE EXCEPTION 'Cannot attach purchase order item % to a manual receipt with no purchase order.', NEW.purchase_order_item_id;
  END IF;

  IF v_receipt_po_id <> v_item_po_id THEN
    RAISE EXCEPTION 'Receipt item does not belong to the same purchase order as receipt %.', NEW.receipt_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION validate_receipt_role()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_location_type TEXT;
BEGIN
  SELECT role INTO v_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found. Please contact an administrator.';
  END IF;

  IF v_role = 'admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.location_value IS NULL THEN
    RAISE EXCEPTION 'Receipt location is required.';
  END IF;

  SELECT type INTO v_location_type
  FROM locations
  WHERE value = NEW.location_value;

  IF v_location_type IS NULL THEN
    RAISE EXCEPTION 'Receipt location % does not exist.', NEW.location_value;
  END IF;

  IF v_location_type = 'warehouse' AND v_role NOT IN ('warehouseManager') THEN
    RAISE EXCEPTION 'Only Warehouse Managers can receive inventory at warehouse locations.';
  END IF;

  IF v_location_type = 'site' AND v_role NOT IN ('logisticsAssociate', 'logisticsForeman') THEN
    RAISE EXCEPTION 'Only Logistics Associates and Foremen can receive inventory at job site locations.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION recalculate_purchase_order_status(p_purchase_order_id TEXT)
RETURNS VOID AS $$
DECLARE
  v_has_items BOOLEAN;
  v_total_ordered INTEGER;
  v_total_received INTEGER;
  v_any_receipts BOOLEAN;
  v_any_discrepancies BOOLEAN;
  v_any_over_receipt BOOLEAN;
  v_new_status TEXT;
BEGIN
  IF p_purchase_order_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id
  ) INTO v_has_items;

  IF NOT v_has_items THEN
    UPDATE purchase_orders
    SET status_value = 'entered'
    WHERE id = p_purchase_order_id
      AND status_value <> 'cancelled';
    RETURN;
  END IF;

  SELECT COALESCE(SUM(ordered_quantity), 0)
  INTO v_total_ordered
  FROM purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id;

  SELECT COALESCE(SUM(ri.received_quantity), 0)
  INTO v_total_received
  FROM receipt_items ri
  JOIN receipts r ON r.id = ri.receipt_id
  WHERE r.purchase_order_id = p_purchase_order_id;

  SELECT EXISTS (
    SELECT 1
    FROM receipts
    WHERE purchase_order_id = p_purchase_order_id
  ) INTO v_any_receipts;

  SELECT EXISTS (
    SELECT 1
    FROM receipts
    WHERE purchase_order_id = p_purchase_order_id
      AND has_discrepancy = true
  ) INTO v_any_discrepancies;

  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT
        poi.id,
        poi.ordered_quantity,
        COALESCE(SUM(ri.received_quantity), 0) AS received_total
      FROM purchase_order_items poi
      LEFT JOIN receipt_items ri
        ON ri.purchase_order_item_id = poi.id
      WHERE poi.purchase_order_id = p_purchase_order_id
      GROUP BY poi.id, poi.ordered_quantity
    ) line_totals
    WHERE received_total > ordered_quantity
  ) INTO v_any_over_receipt;

  IF NOT v_any_receipts OR v_total_received = 0 THEN
    v_new_status := 'entered';
  ELSIF v_total_received < v_total_ordered THEN
    v_new_status := 'partially_received';
  ELSIF v_any_discrepancies OR v_any_over_receipt THEN
    v_new_status := 'closed_with_discrepancies';
  ELSE
    v_new_status := 'received';
  END IF;

  UPDATE purchase_orders
  SET status_value = v_new_status
  WHERE id = p_purchase_order_id
    AND status_value <> 'cancelled';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION sync_receipt_discrepancy_and_po_status()
RETURNS TRIGGER AS $$
DECLARE
  v_receipt_id TEXT;
  v_receipt_po_id TEXT;
  v_has_discrepancy BOOLEAN;
BEGIN
  v_receipt_id := COALESCE(NEW.receipt_id, OLD.receipt_id);

  SELECT purchase_order_id INTO v_receipt_po_id
  FROM receipts
  WHERE id = v_receipt_id;

  SELECT EXISTS (
    SELECT 1
    FROM receipt_items
    WHERE receipt_id = v_receipt_id
      AND (
        packing_slip_quantity <> ordered_quantity_snapshot
        OR received_quantity <> packing_slip_quantity
      )
  ) INTO v_has_discrepancy;

  UPDATE receipts
  SET has_discrepancy = v_has_discrepancy
  WHERE id = v_receipt_id;

  PERFORM recalculate_purchase_order_status(v_receipt_po_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION apply_confirmed_receipt_item_to_inventory()
RETURNS TRIGGER AS $$
DECLARE
  v_receipt RECORD;
  v_project_label TEXT;
  v_location_label TEXT;
  v_existing_item RECORD;
  v_new_quantity INTEGER;
  v_new_status TEXT;
BEGIN
  SELECT *
  INTO v_receipt
  FROM receipts
  WHERE id = NEW.receipt_id;

  IF v_receipt.status_value <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT label INTO v_project_label
  FROM projects
  WHERE value = v_receipt.project_value;

  SELECT label INTO v_location_label
  FROM locations
  WHERE value = v_receipt.location_value;

  SELECT *
  INTO v_existing_item
  FROM inventory_items
  WHERE sku = NEW.sku
    AND location_value = v_receipt.location_value
    AND COALESCE(project, '') = COALESCE(v_project_label, '')
  ORDER BY id
  LIMIT 1
  FOR UPDATE;

  IF v_existing_item.id IS NULL THEN
    v_new_quantity := NEW.received_quantity;
    v_new_status := CASE
      WHEN v_new_quantity <= 0 THEN 'Out of Stock'
      WHEN v_new_quantity <= 10 THEN 'Low Stock'
      ELSE 'Available'
    END;

    INSERT INTO inventory_items (
      name,
      sku,
      quantity,
      unit,
      project,
      location_value,
      location_detail,
      status,
      category,
      unit_cost
    ) VALUES (
      NEW.material_name,
      NEW.sku,
      NEW.received_quantity,
      NEW.unit,
      COALESCE(v_project_label, ''),
      v_receipt.location_value,
      COALESCE(v_location_label, v_receipt.location_value),
      v_new_status,
      NEW.category,
      COALESCE((
        SELECT unit_cost
        FROM purchase_order_items
        WHERE id = NEW.purchase_order_item_id
      ), 0)
    );
  ELSE
    v_new_quantity := v_existing_item.quantity + NEW.received_quantity;
    v_new_status := CASE
      WHEN v_new_quantity <= 0 THEN 'Out of Stock'
      WHEN v_new_quantity <= 10 THEN 'Low Stock'
      ELSE 'Available'
    END;

    UPDATE inventory_items
    SET quantity = v_new_quantity,
        status = v_new_status
    WHERE id = v_existing_item.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- --------------------------------------------------------
-- TRIGGERS
-- --------------------------------------------------------

DROP TRIGGER IF EXISTS purchase_orders_set_updated_at ON purchase_orders;
CREATE TRIGGER purchase_orders_set_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_purchase_order_updated_at();

DROP TRIGGER IF EXISTS receipts_validate_role ON receipts;
CREATE TRIGGER receipts_validate_role
  BEFORE INSERT ON receipts
  FOR EACH ROW EXECUTE FUNCTION validate_receipt_role();

DROP TRIGGER IF EXISTS receipt_items_validate_po_link ON receipt_items;
CREATE TRIGGER receipt_items_validate_po_link
  BEFORE INSERT ON receipt_items
  FOR EACH ROW EXECUTE FUNCTION validate_purchase_order_item_link();

DROP TRIGGER IF EXISTS receipt_items_sync_receipt_and_po_status_insert ON receipt_items;
CREATE TRIGGER receipt_items_sync_receipt_and_po_status_insert
  AFTER INSERT ON receipt_items
  FOR EACH ROW EXECUTE FUNCTION sync_receipt_discrepancy_and_po_status();

DROP TRIGGER IF EXISTS receipt_items_sync_receipt_and_po_status_update ON receipt_items;
CREATE TRIGGER receipt_items_sync_receipt_and_po_status_update
  AFTER UPDATE ON receipt_items
  FOR EACH ROW EXECUTE FUNCTION sync_receipt_discrepancy_and_po_status();

DROP TRIGGER IF EXISTS receipt_items_sync_receipt_and_po_status_delete ON receipt_items;
CREATE TRIGGER receipt_items_sync_receipt_and_po_status_delete
  AFTER DELETE ON receipt_items
  FOR EACH ROW EXECUTE FUNCTION sync_receipt_discrepancy_and_po_status();

DROP TRIGGER IF EXISTS receipt_items_apply_to_inventory ON receipt_items;
CREATE TRIGGER receipt_items_apply_to_inventory
  AFTER INSERT ON receipt_items
  FOR EACH ROW EXECUTE FUNCTION apply_confirmed_receipt_item_to_inventory();


-- --------------------------------------------------------
-- VIEWS
-- --------------------------------------------------------

CREATE OR REPLACE VIEW purchase_orders_view WITH (security_invoker = true) AS
SELECT
  po.id,
  po.po_number,
  po.vendor,
  po.status_value,
  po.expected_delivery_date,
  po.entered_by,
  po.entered_at,
  po.location_value,
  po.project_value,
  po.notes,
  po.po_document_name,
  po.created_at,
  po.updated_at,
  loc.label AS location,
  proj.label AS project,
  CASE po.status_value
    WHEN 'entered' THEN 'Entered'
    WHEN 'partially_received' THEN 'Partially Received'
    WHEN 'received' THEN 'Received'
    WHEN 'closed_with_discrepancies' THEN 'Closed with Discrepancies'
    WHEN 'cancelled' THEN 'Cancelled'
    ELSE po.status_value
  END AS status,
  COALESCE(item_totals.line_count, 0) AS line_count,
  COALESCE(item_totals.total_ordered_quantity, 0) AS total_ordered_quantity,
  COALESCE(item_totals.total_received_quantity, 0) AS total_received_quantity,
  COALESCE(item_totals.open_item_count, 0) AS open_item_count
FROM purchase_orders po
LEFT JOIN locations loc
  ON po.location_value = loc.value
LEFT JOIN projects proj
  ON po.project_value = proj.value
LEFT JOIN (
  SELECT
    poi.purchase_order_id,
    COUNT(*) AS line_count,
    COALESCE(SUM(poi.ordered_quantity), 0) AS total_ordered_quantity,
    COALESCE(SUM(COALESCE(receipt_totals.received_quantity_total, 0)), 0) AS total_received_quantity,
    COUNT(*) FILTER (
      WHERE COALESCE(receipt_totals.received_quantity_total, 0) < poi.ordered_quantity
    ) AS open_item_count
  FROM purchase_order_items poi
  LEFT JOIN (
    SELECT
      purchase_order_item_id,
      COALESCE(SUM(received_quantity), 0) AS received_quantity_total
    FROM receipt_items
    WHERE purchase_order_item_id IS NOT NULL
    GROUP BY purchase_order_item_id
  ) receipt_totals
    ON receipt_totals.purchase_order_item_id = poi.id
  GROUP BY poi.purchase_order_id
) item_totals
  ON item_totals.purchase_order_id = po.id;

CREATE OR REPLACE VIEW purchase_order_items_view WITH (security_invoker = true) AS
SELECT
  poi.id,
  poi.purchase_order_id,
  poi.line_number,
  poi.material_name,
  poi.sku,
  poi.category,
  poi.ordered_quantity,
  poi.unit,
  poi.unit_cost,
  poi.created_at,
  COALESCE(receipt_totals.received_quantity_total, 0) AS received_quantity_total,
  GREATEST(poi.ordered_quantity - COALESCE(receipt_totals.received_quantity_total, 0), 0) AS remaining_quantity,
  GREATEST(COALESCE(receipt_totals.received_quantity_total, 0) - poi.ordered_quantity, 0) AS over_received_quantity,
  (COALESCE(receipt_totals.received_quantity_total, 0) >= poi.ordered_quantity) AS is_fully_received
FROM purchase_order_items poi
LEFT JOIN (
  SELECT
    purchase_order_item_id,
    COALESCE(SUM(received_quantity), 0) AS received_quantity_total
  FROM receipt_items
  WHERE purchase_order_item_id IS NOT NULL
  GROUP BY purchase_order_item_id
) receipt_totals
  ON receipt_totals.purchase_order_item_id = poi.id;

CREATE OR REPLACE VIEW receipts_view WITH (security_invoker = true) AS
SELECT
  r.id,
  r.purchase_order_id,
  r.vendor,
  r.po_number,
  r.delivery_date,
  r.received_by,
  r.location_value,
  r.project_value,
  r.status_value,
  r.has_discrepancy,
  r.notes,
  r.created_at,
  loc.label AS location,
  proj.label AS project,
  CASE r.status_value
    WHEN 'confirmed' THEN 'Confirmed'
    ELSE r.status_value
  END AS status
FROM receipts r
LEFT JOIN locations loc
  ON r.location_value = loc.value
LEFT JOIN projects proj
  ON r.project_value = proj.value;


-- --------------------------------------------------------
-- RLS
-- --------------------------------------------------------

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_orders_select" ON purchase_orders;
CREATE POLICY "purchase_orders_select" ON purchase_orders
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "purchase_orders_insert" ON purchase_orders;
CREATE POLICY "purchase_orders_insert" ON purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'projectManager')
  ));

DROP POLICY IF EXISTS "purchase_orders_update" ON purchase_orders;
CREATE POLICY "purchase_orders_update" ON purchase_orders
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'projectManager')
  ));

DROP POLICY IF EXISTS "purchase_order_items_select" ON purchase_order_items;
CREATE POLICY "purchase_order_items_select" ON purchase_order_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "purchase_order_items_insert" ON purchase_order_items;
CREATE POLICY "purchase_order_items_insert" ON purchase_order_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'projectManager')
  ));

DROP POLICY IF EXISTS "purchase_order_items_update" ON purchase_order_items;
CREATE POLICY "purchase_order_items_update" ON purchase_order_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'projectManager')
  ));

DROP POLICY IF EXISTS "purchase_order_items_delete" ON purchase_order_items;
CREATE POLICY "purchase_order_items_delete" ON purchase_order_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'projectManager')
  ));

DROP POLICY IF EXISTS "receipts_select" ON receipts;
CREATE POLICY "receipts_select" ON receipts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "receipts_insert" ON receipts;
CREATE POLICY "receipts_insert" ON receipts
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

DROP POLICY IF EXISTS "receipt_items_select" ON receipt_items;
CREATE POLICY "receipt_items_select" ON receipt_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "receipt_items_insert" ON receipt_items;
CREATE POLICY "receipt_items_insert" ON receipt_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

COMMIT;
