-- ============================================================
-- MEC2 Inventory Management System — Security Fixes
-- ============================================================
-- Fixes Supabase linter warnings:
--   1. Views: add security_invoker = true (so RLS applies to querying user)
--   2. Functions: add SET search_path = public (prevent search path injection)
-- ============================================================


-- --------------------------------------------------------
-- FIX 1: VIEWS — Enable security_invoker
-- --------------------------------------------------------
-- Without this, views bypass RLS and use the view creator's permissions.

ALTER VIEW inventory_view SET (security_invoker = true);
ALTER VIEW requests_view SET (security_invoker = true);
ALTER VIEW manifests_view SET (security_invoker = true);
ALTER VIEW transfers_view SET (security_invoker = true);


-- --------------------------------------------------------
-- FIX 2: FUNCTIONS — Set search_path = public
-- --------------------------------------------------------
-- handle_new_user already has this. Adding to all others.

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

-- Computed fields trigger
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

-- ID generators
CREATE OR REPLACE FUNCTION generate_request_id()
RETURNS TEXT AS $$
DECLARE next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS INTEGER)), 1000) + 1
  INTO next_num
  FROM requests
  WHERE id LIKE 'RQ-%';
  RETURN 'RQ-' || next_num;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION generate_manifest_id(manifest_type TEXT)
RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  next_num INTEGER;
BEGIN
  prefix := CASE manifest_type
    WHEN 'outbound'           THEN 'MO'
    WHEN 'return'             THEN 'MR'
    WHEN 'warehouse_transfer' THEN 'MW'
    ELSE 'MX'
  END;
  SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS INTEGER)), 1000) + 1
  INTO next_num
  FROM manifests
  WHERE id LIKE prefix || '-%';
  RETURN prefix || '-' || next_num;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION generate_transfer_id(transfer_type TEXT)
RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  next_num INTEGER;
BEGIN
  prefix := CASE transfer_type
    WHEN 'outbound'           THEN 'TO'
    WHEN 'return'             THEN 'TR'
    WHEN 'warehouse_transfer' THEN 'TW'
    ELSE 'TX'
  END;
  SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS INTEGER)), 1000) + 1
  INTO next_num
  FROM transfers
  WHERE id LIKE prefix || '-%';
  RETURN prefix || '-' || next_num;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION generate_adjustment_id()
RETURNS TEXT AS $$
DECLARE next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS INTEGER)), 1000) + 1
  INTO next_num
  FROM inventory_adjustments
  WHERE id LIKE 'ADJ-%';
  RETURN 'ADJ-' || next_num;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Atomic inventory adjustment RPC
CREATE OR REPLACE FUNCTION create_inventory_adjustment(
  p_inventory_item_id INTEGER,
  p_adjustment_type   TEXT,
  p_quantity_value     INTEGER,
  p_reason            TEXT,
  p_adjusted_by       TEXT
)
RETURNS JSON AS $$
DECLARE
  v_prev_qty   INTEGER;
  v_reserved_qty INTEGER;
  v_new_qty    INTEGER;
  v_change     INTEGER;
  v_new_status TEXT;
  v_adj_id     TEXT;
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

-- Workflow validation triggers
CREATE OR REPLACE FUNCTION validate_manifest_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_request_status TEXT;
BEGIN
  IF NEW.request_id IS NOT NULL THEN
    SELECT status_value INTO v_request_status
    FROM requests WHERE id = NEW.request_id;

    IF v_request_status IS NULL THEN
      RAISE EXCEPTION 'Request % does not exist.', NEW.request_id;
    END IF;

    IF v_request_status != 'approved' THEN
      RAISE EXCEPTION 'Cannot create manifest — request % is not approved (current status: %).', NEW.request_id, v_request_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION validate_transfer_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_manifest_status TEXT;
BEGIN
  IF NEW.manifest_id IS NOT NULL THEN
    SELECT status_value INTO v_manifest_status
    FROM manifests WHERE id = NEW.manifest_id;

    IF v_manifest_status IS NULL THEN
      RAISE EXCEPTION 'Manifest % does not exist.', NEW.manifest_id;
    END IF;

    IF v_manifest_status != 'finalized' THEN
      RAISE EXCEPTION 'Cannot create transfer — manifest % is not finalized (current status: %).', NEW.manifest_id, v_manifest_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION validate_transfer_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status_value = NEW.status_value THEN
    RETURN NEW;
  END IF;

  CASE OLD.status_value
    WHEN 'ready_to_ship' THEN
      IF NEW.status_value NOT IN ('in_transit') THEN
        RAISE EXCEPTION 'Cannot change transfer status from "Ready to Ship" to "%". Must ship first.', NEW.status_value;
      END IF;
    WHEN 'in_transit' THEN
      IF NEW.status_value NOT IN ('completed', 'exception') THEN
        RAISE EXCEPTION 'Cannot change transfer status from "In Transit" to "%". Can only be completed or marked as exception.', NEW.status_value;
      END IF;
    WHEN 'completed' THEN
      RAISE EXCEPTION 'Transfer is already completed. Completed transfers cannot be changed.';
    WHEN 'exception' THEN
      IF NEW.status_value NOT IN ('completed') THEN
        RAISE EXCEPTION 'Exception transfers can only be moved to "completed" after resolution.';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unknown transfer status: "%".', OLD.status_value;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION validate_request_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status_value = NEW.status_value THEN
    RETURN NEW;
  END IF;

  CASE OLD.status_value
    WHEN 'pending_approval' THEN
      IF NEW.status_value NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Pending requests can only be approved or rejected, not "%".', NEW.status_value;
      END IF;
    WHEN 'approved' THEN
      RAISE EXCEPTION 'This request has already been approved. Approved requests cannot be changed.';
    WHEN 'rejected' THEN
      RAISE EXCEPTION 'This request has been rejected. Rejected requests cannot be changed.';
    ELSE
      RAISE EXCEPTION 'Unknown request status: "%".', OLD.status_value;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Role validation
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found. Please contact an administrator.';
  END IF;

  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION validate_manifest_role()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := get_current_user_role();

  IF v_role = 'admin' THEN RETURN NEW; END IF;

  CASE NEW.manifest_type_value
    WHEN 'outbound' THEN
      IF v_role NOT IN ('warehouseManager') THEN
        RAISE EXCEPTION 'Only Warehouse Managers can create outbound manifests.';
      END IF;
    WHEN 'return' THEN
      IF v_role NOT IN ('logisticsAssociate', 'logisticsForeman') THEN
        RAISE EXCEPTION 'Only Logistics Associates and Foremen can create return manifests.';
      END IF;
    WHEN 'warehouse_transfer' THEN
      IF v_role NOT IN ('warehouseManager') THEN
        RAISE EXCEPTION 'Only Warehouse Managers can create warehouse transfer manifests.';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unknown manifest type: "%".', NEW.manifest_type_value;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION validate_transfer_role()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status_value = NEW.status_value THEN
    RETURN NEW;
  END IF;

  v_role := get_current_user_role();

  IF v_role = 'admin' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND NEW.status_value = 'in_transit' THEN
    CASE NEW.transfer_type_value
      WHEN 'outbound' THEN
        IF v_role NOT IN ('logisticsAssociate', 'logisticsForeman') THEN
          RAISE EXCEPTION 'Only Logistics Associates and Foremen can ship outbound transfers.';
        END IF;
      WHEN 'return' THEN
        IF v_role NOT IN ('logisticsAssociate', 'logisticsForeman') THEN
          RAISE EXCEPTION 'Only Logistics Associates and Foremen can ship return transfers.';
        END IF;
      WHEN 'warehouse_transfer' THEN
        IF v_role NOT IN ('warehouseManager') THEN
          RAISE EXCEPTION 'Only Warehouse Managers can ship warehouse transfers.';
        END IF;
    END CASE;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status_value IN ('completed', 'exception') THEN
    CASE NEW.transfer_type_value
      WHEN 'outbound' THEN
        IF v_role NOT IN ('logisticsAssociate', 'logisticsForeman') THEN
          RAISE EXCEPTION 'Only Logistics Associates and Foremen can receive outbound deliveries at job sites.';
        END IF;
      WHEN 'return' THEN
        IF v_role NOT IN ('warehouseManager') THEN
          RAISE EXCEPTION 'Only Warehouse Managers can receive returns at the warehouse.';
        END IF;
      WHEN 'warehouse_transfer' THEN
        IF v_role NOT IN ('warehouseManager') THEN
          RAISE EXCEPTION 'Only Warehouse Managers can receive warehouse transfers.';
        END IF;
    END CASE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION validate_adjustment_role()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_location_type TEXT;
BEGIN
  v_role := get_current_user_role();

  IF v_role = 'admin' THEN RETURN NEW; END IF;

  SELECT l.type INTO v_location_type
  FROM inventory_items i
  JOIN locations l ON i.location_value = l.value
  WHERE i.id = NEW.inventory_item_id;

  IF v_location_type = 'warehouse' THEN
    IF v_role NOT IN ('warehouseManager') THEN
      RAISE EXCEPTION 'Only Warehouse Managers can adjust inventory at warehouse locations.';
    END IF;
  ELSIF v_location_type = 'site' THEN
    IF v_role NOT IN ('logisticsAssociate', 'logisticsForeman') THEN
      RAISE EXCEPTION 'Only Logistics Associates and Foremen can adjust inventory at job site locations.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Auto-adjustment on transfer
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
        v_new_qty := v_change;
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
$$ LANGUAGE plpgsql SET search_path = public;
