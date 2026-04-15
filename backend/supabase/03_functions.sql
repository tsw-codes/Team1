-- ============================================================
-- MEC2 Inventory Management System — Functions
-- ============================================================
-- Run order: 03 (after tables and views)
-- ID generation, computed field triggers, profile auto-creation,
-- and atomic inventory adjustment RPC.
-- ============================================================


-- --------------------------------------------------------
-- PROFILE AUTO-CREATION
-- --------------------------------------------------------

-- Auto-create profile when a new auth user is created.
-- SET search_path = public ensures the function can find the
-- profiles table even when called from auth schema context.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), 'Unknown'),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'logisticsAssociate')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- --------------------------------------------------------
-- COMPUTED FIELDS (total_cost, updated_at)
-- --------------------------------------------------------

-- Auto-update updated_at and total_cost on inventory changes
CREATE OR REPLACE FUNCTION update_inventory_computed_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.total_cost = NEW.quantity * NEW.unit_cost;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER inventory_before_insert
  BEFORE INSERT ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_inventory_computed_fields();

CREATE TRIGGER inventory_before_update
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_inventory_computed_fields();


-- --------------------------------------------------------
-- ID GENERATION
-- --------------------------------------------------------

-- Generate next request ID (RQ-1001, RQ-1002, ...)
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

-- Generate next manifest ID with type prefix (MO-1001, MR-1001, MW-1001)
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

-- Generate next transfer ID with type prefix (TO-1001, TR-1001, TW-1001)
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

-- Generate next adjustment ID (ADJ-1001, ADJ-1002, ...)
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


-- --------------------------------------------------------
-- ATOMIC INVENTORY ADJUSTMENT (RPC)
-- --------------------------------------------------------

-- Adjusts inventory quantity and logs the change in one atomic operation.
-- Returns the adjustment record.
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
  v_new_qty    INTEGER;
  v_change     INTEGER;
  v_new_status TEXT;
  v_adj_id     TEXT;
BEGIN
  -- Get current quantity
  SELECT quantity INTO v_prev_qty
  FROM inventory_items
  WHERE id = p_inventory_item_id
  FOR UPDATE;  -- lock the row

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % not found', p_inventory_item_id;
  END IF;

  -- Calculate new quantity
  CASE p_adjustment_type
    WHEN 'increase' THEN
      v_new_qty := v_prev_qty + p_quantity_value;
      v_change  := p_quantity_value;
    WHEN 'decrease' THEN
      v_new_qty := GREATEST(v_prev_qty - p_quantity_value, 0);
      v_change  := v_prev_qty - v_new_qty;  -- actual change (may differ if clamped to 0)
    WHEN 'set' THEN
      v_new_qty := p_quantity_value;
      v_change  := p_quantity_value - v_prev_qty;
    WHEN 'returned' THEN
      v_new_qty := GREATEST(v_prev_qty - p_quantity_value, 0);
      v_change  := v_prev_qty - v_new_qty;
    ELSE
      RAISE EXCEPTION 'Invalid adjustment type: %', p_adjustment_type;
  END CASE;

  -- Determine new status based on quantity
  v_new_status := CASE
    WHEN v_new_qty <= 0  THEN 'Out of Stock'
    WHEN v_new_qty <= 10 THEN 'Low Stock'
    ELSE 'Available'
  END;

  -- Update inventory
  UPDATE inventory_items
  SET quantity = v_new_qty,
      status   = v_new_status
  WHERE id = p_inventory_item_id;

  -- Generate adjustment ID and log
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
