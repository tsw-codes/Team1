BEGIN;

DROP TRIGGER IF EXISTS manifest_items_sync_reservation ON manifest_items;

DROP FUNCTION IF EXISTS sync_manifest_item_reservation();
DROP FUNCTION IF EXISTS adjust_manifest_item_reservation(TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS compute_inventory_status(INTEGER, INTEGER);

DROP VIEW IF EXISTS inventory_view;

CREATE VIEW inventory_view WITH (security_invoker = true) AS
SELECT
  i.id, i.name, i.sku, i.quantity, i.unit,
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

  NEW.updated_at = now();
  NEW.total_cost = NEW.quantity * NEW.unit_cost;
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
  v_prev_qty   INTEGER;
  v_new_qty    INTEGER;
  v_change     INTEGER;
  v_new_status TEXT;
  v_adj_id     TEXT;
BEGIN
  SELECT quantity INTO v_prev_qty
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

  v_new_status := CASE
    WHEN v_new_qty <= 0  THEN 'Out of Stock'
    WHEN v_new_qty <= 10 THEN 'Low Stock'
    ELSE 'Available'
  END;

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

CREATE OR REPLACE FUNCTION auto_adjust_inventory_on_transfer()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_adj_id TEXT;
  v_prev_qty INTEGER;
  v_new_qty INTEGER;
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
      SELECT ti.inventory_item_id, ti.shipped_quantity
      FROM transfer_items ti
      WHERE ti.transfer_id = NEW.id
        AND ti.shipped_quantity IS NOT NULL
        AND ti.shipped_quantity > 0
    LOOP
      SELECT quantity INTO v_prev_qty
      FROM inventory_items
      WHERE id = v_item.inventory_item_id
      FOR UPDATE;

      v_change := v_item.shipped_quantity;
      v_new_qty := GREATEST(v_prev_qty - v_change, 0);

      v_new_status := CASE
        WHEN v_new_qty <= 0  THEN 'Out of Stock'
        WHEN v_new_qty <= 10 THEN 'Low Stock'
        ELSE 'Available'
      END;

      UPDATE inventory_items
      SET quantity = v_new_qty, status = v_new_status
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

      SELECT id, quantity INTO v_dest_item_id, v_prev_qty
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
        v_new_qty  := v_change;
        v_new_status := CASE
          WHEN v_new_qty <= 0  THEN 'Out of Stock'
          WHEN v_new_qty <= 10 THEN 'Low Stock'
          ELSE 'Available'
        END;

        INSERT INTO inventory_items (
          name, sku, quantity, unit, project, project_value,
          location_value, location_detail, status, category, unit_cost
        ) VALUES (
          v_src_row.name,
          v_src_row.sku,
          v_new_qty,
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
        v_new_status := CASE
          WHEN v_new_qty <= 0  THEN 'Out of Stock'
          WHEN v_new_qty <= 10 THEN 'Low Stock'
          ELSE 'Available'
        END;

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

ALTER TABLE inventory_items
  DROP COLUMN IF EXISTS reserved_quantity;

COMMIT;
