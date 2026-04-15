-- ============================================================
-- MEC2 Inventory Management System — Database Schema
-- ============================================================
-- Run this in the Supabase SQL Editor to create all tables,
-- views, functions, triggers, and RLS policies.
--
-- Order matters: tables are created in dependency order.
-- ============================================================


-- ============================================================
-- 1. TABLES
-- ============================================================

-- Locations: warehouses and job sites
CREATE TABLE locations (
  value  TEXT PRIMARY KEY,                                    -- 'WH-A', 'SG', 'WT', etc.
  label  TEXT NOT NULL,                                       -- 'Warehouse A', 'South Garage'
  type   TEXT NOT NULL CHECK (type IN ('warehouse', 'site')), -- location type
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projects: tied to a location
CREATE TABLE projects (
  value          TEXT PRIMARY KEY,                            -- 'SG-001', 'WH-A-001'
  label          TEXT NOT NULL,                               -- 'South Garage - Phase 1'
  location_value TEXT NOT NULL REFERENCES locations(value),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles: extends Supabase auth.users
-- Auto-created via trigger (see section 3)
CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT UNIQUE NOT NULL,                            -- 'admin', 'pm', 'wm', etc.
  name       TEXT NOT NULL,                                   -- 'Admin User'
  role       TEXT NOT NULL CHECK (role IN (
    'admin', 'projectManager', 'warehouseManager',
    'logisticsAssociate', 'logisticsForeman'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inventory items
CREATE TABLE inventory_items (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  sku             TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 0,
  unit            TEXT NOT NULL,                              -- 'ft', 'pcs', 'rolls'
  project         TEXT,                                       -- display name: 'Warehouse Stock', 'South Garage'
  location_value  TEXT REFERENCES locations(value),           -- FK to location
  location_detail TEXT,                                       -- free text: 'Warehouse A / Rack 3'
  status          TEXT NOT NULL DEFAULT 'Available',          -- 'Available', 'Low Stock', 'Out of Stock', 'Reserved', 'In Transit'
  category        TEXT NOT NULL,                              -- 'Plumbing', 'HVAC', 'Electrical', 'Hardware'
  unit_cost       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost      NUMERIC(12,2) NOT NULL DEFAULT 0,  -- auto-computed via trigger (qty * unit_cost)
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Requests: material requests from field crews
CREATE TABLE requests (
  id                       TEXT PRIMARY KEY,                  -- 'RQ-1001'
  status_value             TEXT NOT NULL DEFAULT 'pending_approval',
  location_value           TEXT REFERENCES locations(value),  -- destination site
  location_type            TEXT,                              -- 'site' or 'warehouse'
  project_value            TEXT REFERENCES projects(value),
  requested_by             TEXT NOT NULL,                     -- username
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  needed_by_date           DATE,
  order_date               DATE,                              -- PO fallback (stakeholder request)
  priority_value           TEXT DEFAULT 'normal',             -- 'low', 'normal', 'high', 'urgent'
  source_warehouse_value   TEXT REFERENCES locations(value),  -- which warehouse to pull from
  delivery_location_text   TEXT DEFAULT '',                   -- 'Loading Area', 'Dock 2', etc.
  notes                    TEXT DEFAULT '',
  approved_by              TEXT,                              -- username
  approved_at              TIMESTAMPTZ,
  rejected_by              TEXT,                              -- username
  rejected_at              TIMESTAMPTZ,
  approval_notes           TEXT DEFAULT ''
);

-- Request items: line items in a request
CREATE TABLE request_items (
  id                SERIAL PRIMARY KEY,
  request_id        TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  requested_quantity INTEGER NOT NULL
);

-- Manifests: shipment manifests for inventory movement
CREATE TABLE manifests (
  id                         TEXT PRIMARY KEY,                -- 'MO-1001', 'MR-1001', 'MW-1001'
  manifest_type_value        TEXT NOT NULL,                   -- 'outbound', 'return', 'warehouse_transfer'
  status_value               TEXT NOT NULL DEFAULT 'finalized',
  request_id                 TEXT REFERENCES requests(id),    -- linked request (if outbound)
  requested_by               TEXT DEFAULT '',
  approved_by                TEXT DEFAULT '',
  approved_at                TIMESTAMPTZ,
  created_by                 TEXT NOT NULL,                   -- username
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  manifest_date              DATE,
  location_value             TEXT REFERENCES locations(value),     -- destination
  project_value              TEXT REFERENCES projects(value),
  finalized_by               TEXT DEFAULT '',
  finalized_at               TIMESTAMPTZ,
  source_location_value      TEXT REFERENCES locations(value),
  destination_location_value TEXT REFERENCES locations(value),
  destination_detail         TEXT DEFAULT '',                 -- 'Dock 2', 'Staging Area'
  notes                      TEXT DEFAULT ''
);

-- Manifest items: line items in a manifest
CREATE TABLE manifest_items (
  id                TEXT PRIMARY KEY,                         -- 'MO-1001-1'
  manifest_id       TEXT NOT NULL REFERENCES manifests(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  manifest_quantity INTEGER NOT NULL
);

-- Transfers: actual shipment execution
CREATE TABLE transfers (
  id                         TEXT PRIMARY KEY,                -- 'TO-1001', 'TR-1001', 'TW-1001'
  manifest_id                TEXT REFERENCES manifests(id),
  request_id                 TEXT REFERENCES requests(id),
  requested_by               TEXT DEFAULT '',
  approved_by                TEXT DEFAULT '',
  approved_at                TIMESTAMPTZ,
  transfer_type_value        TEXT NOT NULL,                   -- 'outbound', 'return', 'warehouse_transfer'
  status_value               TEXT NOT NULL DEFAULT 'ready_to_ship',
  created_by                 TEXT NOT NULL,                   -- username
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  manifest_date              DATE,
  shipped_date               DATE,
  shipped_at                 TIMESTAMPTZ,
  shipped_by                 TEXT,
  received_date              DATE,
  received_at                TIMESTAMPTZ,
  received_by                TEXT,
  location_value             TEXT REFERENCES locations(value),
  project_value              TEXT REFERENCES projects(value),
  source_location_value      TEXT REFERENCES locations(value),
  destination_location_value TEXT REFERENCES locations(value),
  destination_detail         TEXT DEFAULT '',
  notes                      TEXT DEFAULT '',
  exception_notes            TEXT DEFAULT ''
);

-- Transfer items: per-item tracking with variance
CREATE TABLE transfer_items (
  id                TEXT PRIMARY KEY,                         -- 'TO-1001-1'
  transfer_id       TEXT NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  manifest_quantity INTEGER NOT NULL,
  shipped_quantity  INTEGER,
  received_quantity INTEGER,
  variance_reason   TEXT DEFAULT ''
);

-- Inventory adjustments: immutable audit log
CREATE TABLE inventory_adjustments (
  id                TEXT PRIMARY KEY,                         -- 'ADJ-1001'
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  adjustment_type   TEXT NOT NULL CHECK (adjustment_type IN (
    'increase', 'decrease', 'set', 'returned'
  )),
  quantity_change   INTEGER NOT NULL,
  previous_quantity INTEGER NOT NULL,
  new_quantity      INTEGER NOT NULL,
  reason            TEXT NOT NULL,
  adjusted_by       TEXT NOT NULL,                            -- username
  adjusted_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 2. VIEWS (denormalized shapes for frontend)
-- ============================================================

-- Inventory view: maps location_detail to frontend's 'location' field
CREATE VIEW inventory_view AS
SELECT
  id, name, sku, quantity, unit, project,
  location_value,
  location_detail AS location,
  status, category,
  unit_cost, total_cost, updated_at
FROM inventory_items;

-- Requests view: joins location/project labels and formats display values
CREATE VIEW requests_view AS
SELECT
  r.id, r.status_value, r.location_value, r.location_type,
  r.project_value, r.requested_by, r.created_at,
  r.needed_by_date, r.order_date, r.priority_value,
  r.source_warehouse_value, r.delivery_location_text,
  r.notes, r.approved_by, r.approved_at,
  r.rejected_by, r.rejected_at, r.approval_notes,
  -- Joined labels
  loc.label  AS location,
  proj.label AS project,
  sw.label   AS source_warehouse,
  -- Display values
  CASE r.status_value
    WHEN 'pending_approval' THEN 'Pending Approval'
    WHEN 'approved'         THEN 'Approved'
    WHEN 'rejected'         THEN 'Rejected'
    WHEN 'manifested'       THEN 'Manifested'
    ELSE r.status_value
  END AS status,
  INITCAP(r.priority_value) AS priority
FROM requests r
LEFT JOIN locations loc  ON r.location_value = loc.value
LEFT JOIN projects  proj ON r.project_value  = proj.value
LEFT JOIN locations sw   ON r.source_warehouse_value = sw.value;

-- Manifests view: joins source/destination location and project labels
CREATE VIEW manifests_view AS
SELECT
  m.id, m.manifest_type_value, m.status_value,
  m.request_id, m.requested_by, m.approved_by, m.approved_at,
  m.created_by, m.created_at, m.manifest_date,
  m.location_value, m.project_value,
  m.finalized_by, m.finalized_at,
  m.source_location_value, m.destination_location_value,
  m.destination_detail, m.notes,
  -- Joined labels
  loc.label    AS location,
  proj.label   AS project,
  src.label    AS source_location,
  dst.label    AS destination_location,
  -- Display values
  m.manifest_type_value AS manifest_type,
  CASE m.status_value
    WHEN 'draft'     THEN 'Draft'
    WHEN 'finalized' THEN 'Finalized'
    ELSE m.status_value
  END AS status
FROM manifests m
LEFT JOIN locations loc  ON m.location_value = loc.value
LEFT JOIN projects  proj ON m.project_value  = proj.value
LEFT JOIN locations src  ON m.source_location_value = src.value
LEFT JOIN locations dst  ON m.destination_location_value = dst.value;

-- Transfers view: joins all location/project labels
CREATE VIEW transfers_view AS
SELECT
  t.id, t.manifest_id, t.request_id,
  t.requested_by, t.approved_by, t.approved_at,
  t.transfer_type_value, t.status_value,
  t.created_by, t.created_at, t.manifest_date,
  t.shipped_date, t.shipped_at, t.shipped_by,
  t.received_date, t.received_at, t.received_by,
  t.location_value, t.project_value,
  t.source_location_value, t.destination_location_value,
  t.destination_detail, t.notes, t.exception_notes,
  -- Joined labels
  loc.label  AS location,
  proj.label AS project,
  src.label  AS source_location,
  dst.label  AS destination_location,
  -- Display values
  t.transfer_type_value AS transfer_type,
  CASE t.status_value
    WHEN 'ready_to_ship' THEN 'Ready to Ship'
    WHEN 'in_transit'     THEN 'In Transit'
    WHEN 'completed'      THEN 'Completed'
    WHEN 'exception'      THEN 'Exception'
    ELSE t.status_value
  END AS status
FROM transfers t
LEFT JOIN locations loc  ON t.location_value = loc.value
LEFT JOIN projects  proj ON t.project_value  = proj.value
LEFT JOIN locations src  ON t.source_location_value = src.value
LEFT JOIN locations dst  ON t.destination_location_value = dst.value;


-- ============================================================
-- 3. TRIGGERS
-- ============================================================

-- Auto-create profile when a new auth user is created
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'logisticsAssociate')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at and total_cost on inventory changes
CREATE OR REPLACE FUNCTION update_inventory_computed_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.total_cost = NEW.quantity * NEW.unit_cost;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_before_insert
  BEFORE INSERT ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_inventory_computed_fields();

CREATE TRIGGER inventory_before_update
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_inventory_computed_fields();


-- ============================================================
-- 4. ID GENERATION FUNCTIONS
-- ============================================================

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
$$ LANGUAGE plpgsql;

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
$$ LANGUAGE plpgsql;

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
$$ LANGUAGE plpgsql;

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
$$ LANGUAGE plpgsql;


-- ============================================================
-- 5. RPC: ATOMIC INVENTORY ADJUSTMENT
-- ============================================================

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
$$ LANGUAGE plpgsql;


-- ============================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE locations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects               ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests               ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE manifests              ENABLE ROW LEVEL SECURITY;
ALTER TABLE manifest_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments  ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- LOCATIONS
-- --------------------------------------------------------
CREATE POLICY "locations_select" ON locations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "locations_insert" ON locations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "locations_update" ON locations
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "locations_delete" ON locations
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- --------------------------------------------------------
-- PROJECTS
-- --------------------------------------------------------
CREATE POLICY "projects_select" ON projects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "projects_insert" ON projects
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "projects_update" ON projects
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "projects_delete" ON projects
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- --------------------------------------------------------
-- PROFILES
-- --------------------------------------------------------
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- --------------------------------------------------------
-- INVENTORY ITEMS
-- --------------------------------------------------------
CREATE POLICY "inventory_select" ON inventory_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "inventory_insert" ON inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "inventory_update" ON inventory_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "inventory_delete" ON inventory_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- --------------------------------------------------------
-- REQUESTS
-- --------------------------------------------------------
CREATE POLICY "requests_select" ON requests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "requests_insert" ON requests
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'logisticsForeman')
  ));

CREATE POLICY "requests_update" ON requests
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND (
      p.role IN ('admin', 'projectManager')
      OR (
        p.role = 'logisticsForeman'
        AND requests.requested_by = p.username
        AND requests.status_value = 'pending_approval'
      )
    )
  ));

CREATE POLICY "requests_delete" ON requests
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- --------------------------------------------------------
-- REQUEST ITEMS
-- --------------------------------------------------------
CREATE POLICY "request_items_select" ON request_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "request_items_insert" ON request_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'logisticsForeman')
  ));

CREATE POLICY "request_items_delete" ON request_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'logisticsForeman')
  ));

-- --------------------------------------------------------
-- MANIFESTS
-- --------------------------------------------------------
CREATE POLICY "manifests_select" ON manifests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "manifests_insert" ON manifests
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "manifests_update" ON manifests
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager')
  ));

CREATE POLICY "manifests_delete" ON manifests
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- --------------------------------------------------------
-- MANIFEST ITEMS
-- --------------------------------------------------------
CREATE POLICY "manifest_items_select" ON manifest_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "manifest_items_insert" ON manifest_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "manifest_items_delete" ON manifest_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- --------------------------------------------------------
-- TRANSFERS
-- --------------------------------------------------------
CREATE POLICY "transfers_select" ON transfers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "transfers_insert" ON transfers
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "transfers_update" ON transfers
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "transfers_delete" ON transfers
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- --------------------------------------------------------
-- TRANSFER ITEMS
-- --------------------------------------------------------
CREATE POLICY "transfer_items_select" ON transfer_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "transfer_items_insert" ON transfer_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "transfer_items_update" ON transfer_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "transfer_items_delete" ON transfer_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- --------------------------------------------------------
-- INVENTORY ADJUSTMENTS (immutable audit log)
-- --------------------------------------------------------
CREATE POLICY "adjustments_select" ON inventory_adjustments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "adjustments_insert" ON inventory_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

-- No UPDATE or DELETE policies — audit log is immutable
