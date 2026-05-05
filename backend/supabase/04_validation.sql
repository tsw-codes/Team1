-- ============================================================
-- MEC2 Inventory Management System — Validation Triggers
-- ============================================================
-- Run order: 04 (after functions)
-- Enforces business rules at the database level:
--   - Workflow state transitions
--   - Role-type validation
--   - Inventory auto-adjustment on ship/receive
--
-- All error messages are human-readable for frontend display.
-- ============================================================


-- --------------------------------------------------------
-- WORKFLOW STATE TRANSITIONS
-- --------------------------------------------------------

-- Manifests: can only be created for approved requests (or no request for returns/WH transfers)
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

CREATE TRIGGER manifests_validate_insert
  BEFORE INSERT ON manifests
  FOR EACH ROW EXECUTE FUNCTION validate_manifest_insert();


-- Transfers: can only be created for finalized manifests
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

CREATE TRIGGER transfers_validate_insert
  BEFORE INSERT ON transfers
  FOR EACH ROW EXECUTE FUNCTION validate_transfer_insert();


-- Transfers: enforce valid status transitions
-- ready_to_ship → in_transit → completed OR exception
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

CREATE TRIGGER transfers_validate_status_change
  BEFORE UPDATE ON transfers
  FOR EACH ROW EXECUTE FUNCTION validate_transfer_status_change();


-- Requests: enforce valid status transitions
-- pending_approval → approved OR rejected
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

CREATE TRIGGER requests_validate_status_change
  BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION validate_request_status_change();


-- --------------------------------------------------------
-- ROLE-TYPE VALIDATION
-- --------------------------------------------------------
-- Checks that the user's role matches the type of operation.
-- Uses the profile of the currently authenticated Supabase user.

-- Helper: get current user's role
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


-- Manifests: role must match manifest type
CREATE OR REPLACE FUNCTION validate_manifest_role()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := get_current_user_role();

  -- Admin can do everything
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

CREATE TRIGGER manifests_validate_role
  BEFORE INSERT ON manifests
  FOR EACH ROW EXECUTE FUNCTION validate_manifest_role();


-- Transfers: role must match transfer type for ship/receive actions
CREATE OR REPLACE FUNCTION validate_transfer_role()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status_value = NEW.status_value THEN
    RETURN NEW;
  END IF;

  v_role := get_current_user_role();

  -- Admin can do everything
  IF v_role = 'admin' THEN RETURN NEW; END IF;

  -- Shipping (status changing to in_transit)
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

  -- Receiving (status changing to completed or exception)
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

CREATE TRIGGER transfers_validate_role
  BEFORE INSERT OR UPDATE ON transfers
  FOR EACH ROW EXECUTE FUNCTION validate_transfer_role();


-- Inventory adjustments: role must match location type
CREATE OR REPLACE FUNCTION validate_adjustment_role()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_location_type TEXT;
BEGIN
  v_role := get_current_user_role();

  -- Admin can adjust anything
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

CREATE TRIGGER adjustments_validate_role
  BEFORE INSERT ON inventory_adjustments
  FOR EACH ROW EXECUTE FUNCTION validate_adjustment_role();


-- --------------------------------------------------------
-- INVENTORY AUTO-ADJUSTMENT ON SHIP/RECEIVE
-- --------------------------------------------------------
-- When a transfer status changes:
--   → in_transit (shipped): decrease source location quantities
--   → completed (received): increase destination location quantities
-- Adjustments are logged in inventory_adjustments automatically.

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
  v_dest_item_id INTEGER;
  v_src_row RECORD;
BEGIN
  IF OLD.status_value = NEW.status_value THEN
    RETURN NEW;
  END IF;

  -- SHIPPED: decrease source location quantities
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

  -- RECEIVED: increase destination location quantities.
  -- transfer_items.inventory_item_id points at the SOURCE row (the one we shipped from),
  -- so we must resolve the destination's own row for that SKU. If the destination has
  -- no row for this SKU yet (first-ever delivery), create one.
  IF NEW.status_value IN ('completed', 'exception') THEN
    v_dest_loc := NEW.destination_location_value;

    SELECT label INTO v_dest_loc_label FROM locations WHERE value = v_dest_loc;

    FOR v_item IN
      SELECT ti.inventory_item_id, ti.received_quantity
      FROM transfer_items ti
      WHERE ti.transfer_id = NEW.id
        AND ti.received_quantity IS NOT NULL
        AND ti.received_quantity > 0
    LOOP
      -- Copy metadata from the source row (sku, name, unit, category, unit_cost).
      SELECT name, sku, unit, category, unit_cost
      INTO v_src_row
      FROM inventory_items
      WHERE id = v_item.inventory_item_id;

      -- Find the destination's own row for this SKU (or null if it doesn't exist yet).
      SELECT id, quantity INTO v_dest_item_id, v_prev_qty
      FROM inventory_items
      WHERE sku = v_src_row.sku
        AND location_value = v_dest_loc
      LIMIT 1
      FOR UPDATE;

      v_change := v_item.received_quantity;

      IF v_dest_item_id IS NULL THEN
        -- First delivery of this SKU to this destination — create the row.
        v_prev_qty := 0;
        v_new_qty  := v_change;
        v_new_status := CASE
          WHEN v_new_qty <= 0  THEN 'Out of Stock'
          WHEN v_new_qty <= 10 THEN 'Low Stock'
          ELSE 'Available'
        END;

        INSERT INTO inventory_items (
          name, sku, quantity, unit, project,
          location_value, location_detail, status, category, unit_cost
        ) VALUES (
          v_src_row.name,
          v_src_row.sku,
          v_new_qty,
          v_src_row.unit,
          COALESCE(v_dest_loc_label, v_dest_loc),
          v_dest_loc,
          COALESCE(v_dest_loc_label, v_dest_loc),
          v_new_status,
          v_src_row.category,
          v_src_row.unit_cost
        )
        RETURNING id INTO v_dest_item_id;
      ELSE
        -- Destination already has a row for this SKU — increment it.
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

CREATE TRIGGER transfers_auto_adjust_inventory
  AFTER UPDATE ON transfers
  FOR EACH ROW EXECUTE FUNCTION auto_adjust_inventory_on_transfer();


-- --------------------------------------------------------
-- PURCHASE ORDERS / RECEIPTS
-- --------------------------------------------------------

-- Receipt items linked to a purchase order must belong to the same purchase order as the receipt
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

CREATE TRIGGER receipt_items_validate_po_link
  BEFORE INSERT ON receipt_items
  FOR EACH ROW EXECUTE FUNCTION validate_purchase_order_item_link();

-- Receipts: role must match receiving location type
CREATE OR REPLACE FUNCTION validate_receipt_role()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_location_type TEXT;
BEGIN
  v_role := get_current_user_role();

  IF v_role = 'admin' THEN RETURN NEW; END IF;

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

CREATE TRIGGER receipts_validate_role
  BEFORE INSERT ON receipts
  FOR EACH ROW EXECUTE FUNCTION validate_receipt_role();

-- Recalculate purchase order status based on cumulative receipt quantities
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
    SELECT 1 FROM purchase_order_items WHERE purchase_order_id = p_purchase_order_id
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
    SELECT 1 FROM receipts WHERE purchase_order_id = p_purchase_order_id
  ) INTO v_any_receipts;

  SELECT EXISTS (
    SELECT 1 FROM receipts
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
      LEFT JOIN receipt_items ri ON ri.purchase_order_item_id = poi.id
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

-- Keep receipt discrepancy flag and PO status in sync with receipt items
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

CREATE TRIGGER receipt_items_sync_receipt_and_po_status_insert
  AFTER INSERT ON receipt_items
  FOR EACH ROW EXECUTE FUNCTION sync_receipt_discrepancy_and_po_status();

CREATE TRIGGER receipt_items_sync_receipt_and_po_status_update
  AFTER UPDATE ON receipt_items
  FOR EACH ROW EXECUTE FUNCTION sync_receipt_discrepancy_and_po_status();

CREATE TRIGGER receipt_items_sync_receipt_and_po_status_delete
  AFTER DELETE ON receipt_items
  FOR EACH ROW EXECUTE FUNCTION sync_receipt_discrepancy_and_po_status();

-- Confirmed receipts increase physical inventory
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
  SELECT * INTO v_receipt
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

  SELECT * INTO v_existing_item
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
      name, sku, quantity, unit, project,
      location_value, location_detail, status, category, unit_cost
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
      COALESCE((SELECT unit_cost FROM purchase_order_items WHERE id = NEW.purchase_order_item_id), 0)
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

CREATE TRIGGER receipt_items_apply_to_inventory
  AFTER INSERT ON receipt_items
  FOR EACH ROW EXECUTE FUNCTION apply_confirmed_receipt_item_to_inventory();

-- Receipt attachments: validate allowed target scope by attachment type
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

CREATE TRIGGER receipt_attachments_validate_scope
  BEFORE INSERT OR UPDATE ON receipt_attachments
  FOR EACH ROW EXECUTE FUNCTION validate_receipt_attachment_scope();

-- Receipt attachments: ensure attachment targets belong to the same receipt
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

CREATE TRIGGER receipt_attachments_validate_receipt_consistency
  BEFORE INSERT OR UPDATE ON receipt_attachments
  FOR EACH ROW EXECUTE FUNCTION validate_receipt_attachment_receipt_consistency();

-- Receipt item serials: ensure serial entries inherit valid receipt / PO context
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

CREATE TRIGGER receipt_item_serials_validate_context
  BEFORE INSERT OR UPDATE ON receipt_item_serials
  FOR EACH ROW EXECUTE FUNCTION validate_receipt_item_serial_context();
