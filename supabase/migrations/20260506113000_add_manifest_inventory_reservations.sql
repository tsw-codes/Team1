BEGIN;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION compute_inventory_status(
  p_quantity INTEGER,
  p_reserved_quantity INTEGER DEFAULT 0
)
RETURNS TEXT AS $$
DECLARE
  v_quantity INTEGER := GREATEST(COALESCE(p_quantity, 0), 0);
  v_reserved INTEGER := GREATEST(COALESCE(p_reserved_quantity, 0), 0);
  v_available INTEGER := GREATEST(v_quantity - v_reserved, 0);
BEGIN
  IF v_quantity <= 0 THEN
    RETURN 'Out of Stock';
  END IF;

  IF v_available <= 0 THEN
    RETURN 'Reserved';
  END IF;

  IF v_available <= 10 THEN
    RETURN 'Low Stock';
  END IF;

  RETURN 'Available';
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

DROP VIEW IF EXISTS inventory_view;

CREATE VIEW inventory_view WITH (security_invoker = true) AS
SELECT
  i.id, i.name, i.sku, i.quantity, i.reserved_quantity,
  GREATEST(i.quantity - i.reserved_quantity, 0) AS available_quantity,
  i.unit,
  COALESCE(proj.label, i.project) AS project,
  i.project_value,
  i.location_value,
  i.location_detail AS location,
  i.status, i.category,
  i.unit_cost, i.total_cost, i.updated_at
FROM inventory_items i
LEFT JOIN projects proj ON i.project_value = proj.value
WHERE i.lifecycle_status = 'active';

CREATE OR REPLACE FUNCTION update_inventory_computed_fields()
RETURNS TRIGGER AS $$
DECLARE
  v_project_label TEXT;
BEGIN
  IF NEW.project_value IS NOT NULL THEN
    SELECT label INTO v_project_label
    FROM projects
    WHERE value = NEW.project_value;

    IF v_project_label IS NULL THEN
      RAISE EXCEPTION 'Project % does not exist.', NEW.project_value;
    END IF;

    NEW.project = v_project_label;
  END IF;

  NEW.quantity := GREATEST(COALESCE(NEW.quantity, 0), 0);
  NEW.reserved_quantity := GREATEST(COALESCE(NEW.reserved_quantity, 0), 0);

  IF NEW.reserved_quantity > NEW.quantity THEN
    RAISE EXCEPTION 'Reserved quantity (%) cannot exceed on-hand quantity (%) for inventory item %.',
      NEW.reserved_quantity,
      NEW.quantity,
      COALESCE(NEW.id::TEXT, NEW.sku, NEW.name, 'new item');
  END IF;

  NEW.updated_at = now();
  NEW.total_cost = NEW.quantity * NEW.unit_cost;
  NEW.status = compute_inventory_status(NEW.quantity, NEW.reserved_quantity);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION create_inventory_adjustment(
  p_inventory_item_id INTEGER,
  p_adjustment_type   TEXT,
  p_quantity_value    INTEGER,
  p_reason            TEXT,
  p_adjusted_by       TEXT
)
RETURNS JSON AS $$
DECLARE
  v_prev_qty      INTEGER;
  v_reserved_qty  INTEGER;
  v_new_qty       INTEGER;
  v_change        INTEGER;
  v_new_status    TEXT;
  v_adj_id        TEXT;
BEGIN
  SELECT quantity, reserved_quantity INTO v_prev_qty, v_reserved_qty
  FROM inventory_items
  WHERE id = p_inventory_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % not found', p_inventory_item_id;
  END IF;

  CASE p_adjustment_type
    WHEN 'increase' THEN
      v_new_qty := v_prev_qty + p_quantity_value;
      v_change  := p_quantity_value;
    WHEN 'decrease' THEN
      v_new_qty := GREATEST(v_prev_qty - p_quantity_value, 0);
      v_change  := v_prev_qty - v_new_qty;
    WHEN 'set' THEN
      v_new_qty := p_quantity_value;
      v_change  := p_quantity_value - v_prev_qty;
    WHEN 'returned' THEN
      v_new_qty := GREATEST(v_prev_qty - p_quantity_value, 0);
      v_change  := v_prev_qty - v_new_qty;
    ELSE
      RAISE EXCEPTION 'Invalid adjustment type: %', p_adjustment_type;
  END CASE;

  IF v_new_qty < v_reserved_qty THEN
    RAISE EXCEPTION 'Cannot reduce inventory item % below its reserved quantity of %.',
      p_inventory_item_id,
      v_reserved_qty;
  END IF;

  v_new_status := compute_inventory_status(v_new_qty, v_reserved_qty);

  UPDATE inventory_items
  SET quantity = v_new_qty,
      status   = v_new_status
  WHERE id = p_inventory_item_id;

  v_adj_id := generate_adjustment_id();

  INSERT INTO inventory_adjustments (
    id, inventory_item_id, adjustment_type,
    quantity_change, previous_quantity, new_quantity,
    reason, adjusted_by
  ) VALUES (
    v_adj_id, p_inventory_item_id, p_adjustment_type,
    v_change, v_prev_qty, v_new_qty,
    p_reason, p_adjusted_by
  );

  RETURN json_build_object(
    'adjustmentId', v_adj_id,
    'previousQuantity', v_prev_qty,
    'newQuantity', v_new_qty,
    'newStatus', v_new_status
  );
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION adjust_manifest_item_reservation(
  p_manifest_id TEXT,
  p_inventory_item_id INTEGER,
  p_reservation_delta INTEGER
)
RETURNS VOID AS $$
DECLARE
  v_inventory_row RECORD;
  v_transfer_status TEXT;
  v_new_reserved_quantity INTEGER;
BEGIN
  IF COALESCE(p_reservation_delta, 0) = 0 THEN
    RETURN;
  END IF;

  SELECT status_value
  INTO v_transfer_status
  FROM transfers
  WHERE manifest_id = p_manifest_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_transfer_status IS NOT NULL AND v_transfer_status <> 'ready_to_ship' THEN
    RAISE EXCEPTION 'Cannot modify manifest item reservation after transfer processing has started.';
  END IF;

  SELECT id, quantity, reserved_quantity, lifecycle_status
  INTO v_inventory_row
  FROM inventory_items
  WHERE id = p_inventory_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % does not exist.', p_inventory_item_id;
  END IF;

  IF v_inventory_row.lifecycle_status <> 'active' THEN
    RAISE EXCEPTION 'Inventory item % is not active and cannot be manifested.', p_inventory_item_id;
  END IF;

  IF p_reservation_delta > 0
    AND GREATEST(v_inventory_row.quantity - v_inventory_row.reserved_quantity, 0) < p_reservation_delta THEN
    RAISE EXCEPTION 'Manifest quantity exceeds available inventory for item %.', p_inventory_item_id;
  END IF;

  v_new_reserved_quantity := GREATEST(v_inventory_row.reserved_quantity + p_reservation_delta, 0);

  UPDATE inventory_items
  SET reserved_quantity = v_new_reserved_quantity,
      status = compute_inventory_status(quantity, v_new_reserved_quantity)
  WHERE id = p_inventory_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION sync_manifest_item_reservation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM adjust_manifest_item_reservation(OLD.manifest_id, OLD.inventory_item_id, -OLD.manifest_quantity);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    PERFORM adjust_manifest_item_reservation(OLD.manifest_id, OLD.inventory_item_id, -OLD.manifest_quantity);
    PERFORM adjust_manifest_item_reservation(NEW.manifest_id, NEW.inventory_item_id, NEW.manifest_quantity);
    RETURN NEW;
  END IF;

  PERFORM adjust_manifest_item_reservation(NEW.manifest_id, NEW.inventory_item_id, NEW.manifest_quantity);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS manifest_items_sync_reservation ON manifest_items;

CREATE TRIGGER manifest_items_sync_reservation
  AFTER INSERT OR UPDATE OR DELETE ON manifest_items
  FOR EACH ROW EXECUTE FUNCTION sync_manifest_item_reservation();

CREATE OR REPLACE FUNCTION auto_adjust_inventory_on_transfer()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_adj_id TEXT;
  v_prev_qty INTEGER;
  v_prev_reserved_qty INTEGER;
  v_new_qty INTEGER;
  v_new_reserved_qty INTEGER;
  v_change INTEGER;
  v_new_status TEXT;
  v_source_loc TEXT;
  v_dest_loc TEXT;
  v_dest_loc_label TEXT;
  v_dest_loc_type TEXT;
  v_effective_dest_project_value TEXT;
  v_dest_project_label TEXT;
  v_dest_item_id INTEGER;
  v_src_row RECORD;
BEGIN
  IF OLD.status_value = NEW.status_value THEN
    RETURN NEW;
  END IF;

  IF NEW.status_value = 'in_transit' THEN
    v_source_loc := NEW.source_location_value;

    FOR v_item IN
      SELECT ti.inventory_item_id, ti.manifest_quantity, ti.shipped_quantity
      FROM transfer_items ti
      WHERE ti.transfer_id = NEW.id
        AND ti.shipped_quantity IS NOT NULL
        AND ti.shipped_quantity > 0
    LOOP
      SELECT quantity, reserved_quantity INTO v_prev_qty, v_prev_reserved_qty
      FROM inventory_items
      WHERE id = v_item.inventory_item_id
      FOR UPDATE;

      v_change := v_item.shipped_quantity;
      v_new_qty := GREATEST(v_prev_qty - v_change, 0);
      v_new_reserved_qty := GREATEST(v_prev_reserved_qty - COALESCE(v_item.manifest_quantity, 0), 0);
      v_new_status := compute_inventory_status(v_new_qty, v_new_reserved_qty);

      UPDATE inventory_items
      SET quantity = v_new_qty,
          reserved_quantity = v_new_reserved_qty,
          status = v_new_status
      WHERE id = v_item.inventory_item_id;

      v_adj_id := generate_adjustment_id();
      INSERT INTO inventory_adjustments (id, inventory_item_id, adjustment_type, quantity_change, previous_quantity, new_quantity, reason, adjusted_by)
      VALUES (v_adj_id, v_item.inventory_item_id, 'decrease', v_change, v_prev_qty, v_new_qty,
              'Auto-adjusted: shipped via transfer ' || NEW.id, NEW.shipped_by);
    END LOOP;
  END IF;

  IF NEW.status_value IN ('completed', 'exception') THEN
    v_dest_loc := NEW.destination_location_value;

    SELECT label, type
    INTO v_dest_loc_label, v_dest_loc_type
    FROM locations
    WHERE value = v_dest_loc;

    IF v_dest_loc_type = 'warehouse' THEN
      SELECT value, label
      INTO v_effective_dest_project_value, v_dest_project_label
      FROM projects
      WHERE location_value = v_dest_loc
        AND status_value = 'active'
      ORDER BY value
      LIMIT 1;
    ELSE
      v_effective_dest_project_value := NEW.project_value;
      SELECT label INTO v_dest_project_label FROM projects WHERE value = v_effective_dest_project_value;
    END IF;

    FOR v_item IN
      SELECT ti.inventory_item_id, ti.received_quantity
      FROM transfer_items ti
      WHERE ti.transfer_id = NEW.id
        AND ti.received_quantity IS NOT NULL
        AND ti.received_quantity > 0
    LOOP
      SELECT name, sku, unit, category, unit_cost
      INTO v_src_row
      FROM inventory_items
      WHERE id = v_item.inventory_item_id;

      SELECT id, quantity, reserved_quantity INTO v_dest_item_id, v_prev_qty, v_prev_reserved_qty
      FROM inventory_items
      WHERE sku = v_src_row.sku
        AND location_value = v_dest_loc
        AND COALESCE(project_value, '') = COALESCE(v_effective_dest_project_value, '')
        AND lifecycle_status = 'active'
      LIMIT 1
      FOR UPDATE;

      v_change := v_item.received_quantity;

      IF v_dest_item_id IS NULL THEN
        v_prev_qty := 0;
        v_prev_reserved_qty := 0;
        v_new_qty  := v_change;
        v_new_status := compute_inventory_status(v_new_qty, 0);

        INSERT INTO inventory_items (
          name, sku, quantity, reserved_quantity, unit, project, project_value,
          location_value, location_detail, status, category, unit_cost
        ) VALUES (
          v_src_row.name,
          v_src_row.sku,
          v_new_qty,
          0,
          v_src_row.unit,
          COALESCE(v_dest_project_label, v_dest_loc_label, v_dest_loc),
          v_effective_dest_project_value,
          v_dest_loc,
          COALESCE(NULLIF(NEW.destination_detail, ''), v_dest_loc_label, v_dest_loc),
          v_new_status,
          v_src_row.category,
          v_src_row.unit_cost
        )
        RETURNING id INTO v_dest_item_id;
      ELSE
        v_new_qty := v_prev_qty + v_change;
        v_new_status := compute_inventory_status(v_new_qty, v_prev_reserved_qty);

        UPDATE inventory_items
        SET quantity = v_new_qty, status = v_new_status
        WHERE id = v_dest_item_id;
      END IF;

      v_adj_id := generate_adjustment_id();
      INSERT INTO inventory_adjustments (id, inventory_item_id, adjustment_type, quantity_change, previous_quantity, new_quantity, reason, adjusted_by)
      VALUES (v_adj_id, v_dest_item_id, 'increase', v_change, v_prev_qty, v_new_qty,
              'Auto-adjusted: received via transfer ' || NEW.id, NEW.received_by);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

UPDATE inventory_items
SET reserved_quantity = 0;

WITH reserved_inventory AS (
  SELECT
    mi.inventory_item_id,
    COALESCE(SUM(mi.manifest_quantity), 0) AS reserved_quantity
  FROM manifest_items mi
  LEFT JOIN transfers t ON t.manifest_id = mi.manifest_id
  WHERE t.id IS NULL OR t.status_value = 'ready_to_ship'
  GROUP BY mi.inventory_item_id
)
UPDATE inventory_items i
SET reserved_quantity = reserved_inventory.reserved_quantity
FROM reserved_inventory
WHERE i.id = reserved_inventory.inventory_item_id;

UPDATE inventory_items
SET status = compute_inventory_status(quantity, reserved_quantity);

COMMIT;
