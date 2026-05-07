BEGIN;

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
      VALUES (
        v_adj_id,
        v_item.inventory_item_id,
        'decrease',
        v_change,
        v_prev_qty,
        v_new_qty,
        'Auto-adjusted: shipped via transfer ' || NEW.id,
        NEW.shipped_by
      );
    END LOOP;
  END IF;

  IF NEW.status_value IN ('completed', 'exception') THEN
    v_dest_loc := NEW.destination_location_value;

    SELECT label INTO v_dest_loc_label FROM locations WHERE value = v_dest_loc;
    SELECT label INTO v_dest_project_label FROM projects WHERE value = NEW.project_value;

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
        AND COALESCE(project_value, '') = COALESCE(NEW.project_value, '')
        AND lifecycle_status = 'active'
      LIMIT 1
      FOR UPDATE;

      v_change := v_item.received_quantity;

      IF v_dest_item_id IS NULL THEN
        v_prev_qty := 0;
        v_new_qty := v_change;
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
          NEW.project_value,
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
      VALUES (
        v_adj_id,
        v_dest_item_id,
        'increase',
        v_change,
        v_prev_qty,
        v_new_qty,
        'Auto-adjusted: received via transfer ' || NEW.id,
        NEW.received_by
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

COMMIT;
