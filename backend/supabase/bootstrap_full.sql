-- SOURCE: 01_tables.sql

-- ============================================================
-- MEC2 Inventory Management System â€” Tables
-- ============================================================
-- Run order: 01 (first)
-- Creates all tables in dependency order.
-- ============================================================


-- Locations: warehouses and job sites
CREATE TABLE locations (
  value          TEXT PRIMARY KEY,                                    -- 'WH-A', 'SG', 'WT', etc.
  label          TEXT NOT NULL,                                       -- 'Warehouse A', 'South Garage'
  type           TEXT NOT NULL CHECK (type IN ('warehouse', 'site')), -- location type
  address_line_1 TEXT NOT NULL DEFAULT '',
  address_line_2 TEXT NOT NULL DEFAULT '',
  city           TEXT NOT NULL DEFAULT '',
  state          TEXT NOT NULL DEFAULT '',
  postal_code    TEXT NOT NULL DEFAULT '',
  poc_name       TEXT NOT NULL DEFAULT '',
  poc_phone      TEXT NOT NULL DEFAULT '',
  poc_email      TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projects: tied to a location
CREATE TABLE projects (
  value           TEXT PRIMARY KEY,                            -- 'SG-001', 'WH-A-001'
  label           TEXT NOT NULL,                               -- 'South Garage - Phase 1'
  location_value  TEXT NOT NULL REFERENCES locations(value),
  status_value    TEXT NOT NULL DEFAULT 'active' CHECK (status_value IN ('active', 'closed')),
  closed_at       TIMESTAMPTZ,
  closed_by       TEXT,
  close_notes     TEXT NOT NULL DEFAULT '',
  reopened_at     TIMESTAMPTZ,
  reopened_by     TEXT,
  reopen_reason   TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles: extends Supabase auth.users
-- Auto-created via trigger (see 03_triggers.sql)
CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT UNIQUE NOT NULL,                            -- 'admin', 'pm', 'wm', etc.
  first_name TEXT NOT NULL DEFAULT '',
  last_name  TEXT NOT NULL DEFAULT '',
  name       TEXT NOT NULL,                                   -- 'Admin User'
  email      TEXT,
  role       TEXT NOT NULL CHECK (role IN (
    'admin', 'projectManager', 'warehouseManager',
    'logisticsAssociate', 'logisticsForeman'
  )),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Project-user assignments: PM / foreman associations for alerts and ownership
CREATE TABLE project_user_assignments (
  id              SERIAL PRIMARY KEY,
  project_value   TEXT NOT NULL REFERENCES projects(value) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignment_role TEXT NOT NULL CHECK (assignment_role IN ('projectManager', 'logisticsForeman')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_value, user_id, assignment_role)
);

-- Inventory items
CREATE TABLE inventory_items (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  sku             TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0,
  unit            TEXT NOT NULL,                              -- 'ft', 'pcs', 'rolls'
  project         TEXT,                                       -- display name: 'Warehouse Stock', 'South Garage'
  project_value   TEXT REFERENCES projects(value),            -- FK to active project / warehouse stock bucket
  location_value  TEXT REFERENCES locations(value),           -- FK to location
  location_detail TEXT,                                       -- free text: 'Warehouse A / Rack 3'
  lifecycle_status TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active', 'closed_project')),
  closed_project_batch_id TEXT,
  project_closed_at TIMESTAMPTZ,
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

-- Project closeout batches: one record per close event
CREATE TABLE project_closeout_batches (
  id              TEXT PRIMARY KEY,
  project_value   TEXT NOT NULL REFERENCES projects(value),
  location_value  TEXT NOT NULL REFERENCES locations(value),
  closed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by       TEXT NOT NULL,
  close_notes     TEXT NOT NULL DEFAULT '',
  affected_inventory_count INTEGER NOT NULL DEFAULT 0,
  affected_total_quantity  INTEGER NOT NULL DEFAULT 0,
  affected_total_cost      NUMERIC(12,2) NOT NULL DEFAULT 0,
  reopened_at     TIMESTAMPTZ,
  reopened_by     TEXT,
  reopen_reason   TEXT NOT NULL DEFAULT ''
);

-- Purchase orders: planned inventory that has not physically arrived yet
CREATE TABLE purchase_orders (
  id                     TEXT PRIMARY KEY DEFAULT generate_purchase_order_id(),
  po_number              TEXT NOT NULL,                       -- business-facing PO number
  vendor                 TEXT NOT NULL,
  status_value           TEXT NOT NULL DEFAULT 'entered' CHECK (status_value IN (
    'entered', 'partially_received', 'received',
    'closed_with_discrepancies', 'cancelled'
  )),
  expected_delivery_date DATE,
  entered_by             TEXT NOT NULL,                       -- username
  entered_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  location_value         TEXT REFERENCES locations(value),
  project_value          TEXT REFERENCES projects(value),
  notes                  TEXT NOT NULL DEFAULT '',
  po_document_name       TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Purchase order items: line items on a purchase order
CREATE TABLE purchase_order_items (
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

-- Receipts: one record per receiving event / delivery
CREATE TABLE receipts (
  id                TEXT PRIMARY KEY DEFAULT generate_receipt_id(),
  purchase_order_id TEXT REFERENCES purchase_orders(id),      -- nullable for manual receiving
  vendor            TEXT NOT NULL,
  po_number         TEXT NOT NULL,
  delivery_date     DATE NOT NULL,
  received_by       TEXT NOT NULL,                            -- username
  location_value    TEXT REFERENCES locations(value),
  project_value     TEXT REFERENCES projects(value),
  status_value      TEXT NOT NULL DEFAULT 'confirmed' CHECK (status_value IN ('confirmed')),
  has_discrepancy   BOOLEAN NOT NULL DEFAULT false,
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receipt items: actual quantities received in a specific delivery
CREATE TABLE receipt_items (
  id                        SERIAL PRIMARY KEY,
  receipt_id                TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  purchase_order_item_id    INTEGER REFERENCES purchase_order_items(id), -- nullable for manual receiving
  material_name             TEXT NOT NULL,
  sku                       TEXT NOT NULL,
  category                  TEXT NOT NULL,
  ordered_quantity_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (ordered_quantity_snapshot >= 0),
  packing_slip_quantity     INTEGER NOT NULL DEFAULT 0 CHECK (packing_slip_quantity >= 0),
  received_quantity         INTEGER NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit                      TEXT NOT NULL,
  condition                 TEXT NOT NULL DEFAULT 'Good' CHECK (condition IN ('Good', 'Damaged', 'Partial')),
  variance_reason           TEXT NOT NULL DEFAULT '',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receipt attachments: shared table for delivery, item, and label photos
CREATE TABLE receipt_attachments (
  id                     SERIAL PRIMARY KEY,
  receipt_id             TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  receipt_item_id        INTEGER REFERENCES receipt_items(id) ON DELETE CASCADE,
  receipt_item_serial_id INTEGER,
  attachment_type        TEXT NOT NULL CHECK (attachment_type IN (
    'delivery_photo', 'item_photo', 'label_photo'
  )),
  file_name              TEXT NOT NULL,
  file_path              TEXT NOT NULL,
  content_type           TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receipt item serials: one row per serialized unit received
CREATE TABLE receipt_item_serials (
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


-- SOURCE: 02_views.sql

-- ============================================================
-- MEC2 Inventory Management System â€” Views
-- ============================================================
-- Run order: 02 (after tables)
-- Denormalized views that JOIN labels for the frontend.
-- Services query these views instead of the raw tables.
-- ============================================================


-- Inventory view: maps location_detail to frontend's 'location' field
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

-- Projects view: joins location labels and exposes lifecycle state
CREATE VIEW projects_view WITH (security_invoker = true) AS
SELECT
  p.value, p.label, p.location_value, p.status_value,
  p.closed_at, p.closed_by, p.close_notes,
  p.reopened_at, p.reopened_by, p.reopen_reason,
  p.created_at,
  loc.label AS location,
  loc.type AS location_type,
  CASE p.status_value
    WHEN 'active' THEN 'Active'
    WHEN 'closed' THEN 'Closed'
    ELSE p.status_value
  END AS status,
  (
    p.status_value = 'closed'
    AND p.closed_at IS NOT NULL
    AND p.closed_at >= (now() - interval '30 days')
  ) AS reopen_eligible
FROM projects p
LEFT JOIN locations loc ON p.location_value = loc.value;

-- Project user assignments view: joins profile identity fields for admin UIs
CREATE VIEW project_user_assignments_view WITH (security_invoker = true) AS
SELECT
  pua.id,
  pua.project_value,
  pua.user_id,
  pua.assignment_role,
  pua.created_at,
  prof.username,
  prof.first_name,
  prof.last_name,
  prof.name,
  prof.email,
  prof.role AS user_role,
  prof.is_active
FROM project_user_assignments pua
LEFT JOIN profiles prof ON pua.user_id = prof.id;

-- Requests view: joins location/project labels and formats display values
CREATE VIEW requests_view WITH (security_invoker = true) AS
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
CREATE VIEW manifests_view WITH (security_invoker = true) AS
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
CREATE VIEW transfers_view WITH (security_invoker = true) AS
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

-- Purchase orders view: joins labels and summarizes line-level receiving progress
CREATE VIEW purchase_orders_view WITH (security_invoker = true) AS
SELECT
  po.id, po.po_number, po.vendor, po.status_value,
  po.expected_delivery_date, po.entered_by, po.entered_at,
  po.location_value, po.project_value, po.notes, po.po_document_name,
  po.created_at, po.updated_at,
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
LEFT JOIN locations loc ON po.location_value = loc.value
LEFT JOIN projects proj ON po.project_value = proj.value
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
  ) receipt_totals ON receipt_totals.purchase_order_item_id = poi.id
  GROUP BY poi.purchase_order_id
) item_totals ON item_totals.purchase_order_id = po.id;

-- Purchase order items view: line items with derived receiving totals
CREATE VIEW purchase_order_items_view WITH (security_invoker = true) AS
SELECT
  poi.id, poi.purchase_order_id, poi.line_number,
  poi.material_name, poi.sku, poi.category, poi.ordered_quantity,
  poi.unit, poi.unit_cost, poi.created_at,
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
) receipt_totals ON receipt_totals.purchase_order_item_id = poi.id;

-- Receipts view: joins labels for frontend-friendly receipt reads
CREATE VIEW receipts_view WITH (security_invoker = true) AS
SELECT
  r.id, r.purchase_order_id, r.vendor, r.po_number,
  r.delivery_date, r.received_by, r.location_value, r.project_value,
  r.status_value, r.has_discrepancy, r.notes, r.created_at,
  loc.label AS location,
  proj.label AS project,
  CASE r.status_value
    WHEN 'confirmed' THEN 'Confirmed'
    ELSE r.status_value
  END AS status
FROM receipts r
LEFT JOIN locations loc ON r.location_value = loc.value
LEFT JOIN projects proj ON r.project_value = proj.value;


-- SOURCE: 03_functions.sql

-- ============================================================
-- MEC2 Inventory Management System â€” Functions
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
DECLARE
  v_name TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
BEGIN
  v_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), split_part(NEW.email, '@', 1));
  v_first_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'first_name', ''),
    split_part(v_name, ' ', 1),
    ''
  );
  v_last_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'last_name', ''),
    NULLIF(trim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), ''),
    ''
  );

  INSERT INTO profiles (id, username, first_name, last_name, name, email, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    v_first_name,
    v_last_name,
    v_name,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'logisticsAssociate'),
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_is_admin BOOLEAN := false;
BEGIN
  SELECT role = 'admin' AND is_active
  INTO v_is_admin
  FROM profiles
  WHERE id = auth.uid();

  RETURN COALESCE(v_is_admin, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;


CREATE OR REPLACE FUNCTION can_current_user_read_project_assignment_profiles()
RETURNS BOOLEAN AS $$
DECLARE
  v_can_read BOOLEAN := false;
BEGIN
  SELECT role IN ('admin', 'projectManager') AND is_active
  INTO v_can_read
  FROM profiles
  WHERE id = auth.uid();

  RETURN COALESCE(v_can_read, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;


-- --------------------------------------------------------
-- COMPUTED FIELDS (total_cost, updated_at)
-- --------------------------------------------------------

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

-- Auto-update updated_at and total_cost on inventory changes
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

-- Generate next purchase order ID (PO-1001, PO-1002, ...)
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

-- Generate next receipt ID (RC-1001, RC-1002, ...)
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

-- Generate next project closeout batch ID (PCB-1001, PCB-1002, ...)
CREATE OR REPLACE FUNCTION generate_project_closeout_batch_id()
RETURNS TEXT AS $$
DECLARE next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS INTEGER)), 1000) + 1
  INTO next_num
  FROM project_closeout_batches
  WHERE id LIKE 'PCB-%';
  RETURN 'PCB-' || next_num;
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
  v_reserved_qty INTEGER;
  v_new_qty    INTEGER;
  v_change     INTEGER;
  v_new_status TEXT;
  v_adj_id     TEXT;
BEGIN
  -- Get current quantity
  SELECT quantity, reserved_quantity INTO v_prev_qty, v_reserved_qty
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

  IF v_new_qty < v_reserved_qty THEN
    RAISE EXCEPTION 'Cannot reduce inventory item % below its reserved quantity of %.',
      p_inventory_item_id,
      v_reserved_qty;
  END IF;

  -- Determine new status based on available quantity
  v_new_status := compute_inventory_status(v_new_qty, v_reserved_qty);

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

-- Keep purchase order updated_at in sync
CREATE OR REPLACE FUNCTION update_purchase_order_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER purchase_orders_set_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_purchase_order_updated_at();


-- SOURCE: 04_validation.sql

-- ============================================================
-- MEC2 Inventory Management System â€” Validation Triggers
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
      RAISE EXCEPTION 'Cannot create manifest â€” request % is not approved (current status: %).', NEW.request_id, v_request_status;
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
      RAISE EXCEPTION 'Cannot create transfer â€” manifest % is not finalized (current status: %).', NEW.manifest_id, v_manifest_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER transfers_validate_insert
  BEFORE INSERT ON transfers
  FOR EACH ROW EXECUTE FUNCTION validate_transfer_insert();


-- Transfers: enforce valid status transitions
-- ready_to_ship â†’ in_transit â†’ completed OR exception
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
-- pending_approval â†’ approved OR rejected
-- approved â†’ manifested
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
      IF NEW.status_value NOT IN ('manifested') THEN
        RAISE EXCEPTION 'Approved requests can only move to "manifested", not "%".', NEW.status_value;
      END IF;
    WHEN 'rejected' THEN
      RAISE EXCEPTION 'This request has been rejected. Rejected requests cannot be changed.';
    WHEN 'manifested' THEN
      RAISE EXCEPTION 'This request has already been manifested. Manifested requests cannot be changed.';
    ELSE
      RAISE EXCEPTION 'Unknown request status: "%".', OLD.status_value;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER requests_validate_status_change
  BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION validate_request_status_change();


-- Outbound manifests: mark the linked approved request as manifested
CREATE OR REPLACE FUNCTION mark_request_manifested_on_manifest_create()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.request_id IS NOT NULL AND NEW.manifest_type_value = 'outbound' THEN
    UPDATE requests
    SET status_value = 'manifested'
    WHERE id = NEW.request_id
      AND status_value = 'approved';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER manifests_mark_request_manifested
  AFTER INSERT ON manifests
  FOR EACH ROW EXECUTE FUNCTION mark_request_manifested_on_manifest_create();


-- Manifest items reserve source inventory until the transfer ships.
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
--   â†’ in_transit (shipped): decrease source location quantities
--   â†’ completed (received): increase destination location quantities
-- Adjustments are logged in inventory_adjustments automatically.

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

  -- SHIPPED: decrease source location quantities
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

  -- RECEIVED: increase destination location quantities.
  -- transfer_items.inventory_item_id points at the SOURCE row (the one we shipped from),
  -- so we must resolve the destination's own row for that SKU. If the destination has
  -- no row for this SKU yet (first-ever delivery), create one.
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
      -- Copy metadata from the source row (sku, name, unit, category, unit_cost).
      SELECT name, sku, unit, category, unit_cost
      INTO v_src_row
      FROM inventory_items
      WHERE id = v_item.inventory_item_id;

      -- Find the destination's own row for this SKU (or null if it doesn't exist yet).
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
        -- First delivery of this SKU to this destination â€” create the row.
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
        -- Destination already has a row for this SKU â€” increment it.
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

-- Helper: get current user's username for audit logging
CREATE OR REPLACE FUNCTION get_current_username()
RETURNS TEXT AS $$
DECLARE
  v_username TEXT;
BEGIN
  SELECT username INTO v_username
  FROM profiles
  WHERE id = auth.uid();

  IF v_username IS NULL THEN
    RAISE EXCEPTION 'User profile not found. Please contact an administrator.';
  END IF;

  RETURN v_username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Helper: ensure a referenced project is still active
CREATE OR REPLACE FUNCTION assert_project_is_active(p_project_value TEXT, p_context TEXT)
RETURNS VOID AS $$
DECLARE
  v_status TEXT;
  v_label TEXT;
BEGIN
  IF p_project_value IS NULL OR btrim(p_project_value) = '' THEN
    RETURN;
  END IF;

  SELECT status_value, label
  INTO v_status, v_label
  FROM projects
  WHERE value = p_project_value;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Project % does not exist.', p_project_value;
  END IF;

  IF v_status != 'active' THEN
    RAISE EXCEPTION 'Project "%" is closed and cannot be used for %.', COALESCE(v_label, p_project_value), p_context;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Generic trigger: block inserts/retargeting to closed projects
CREATE OR REPLACE FUNCTION validate_active_project_reference()
RETURNS TRIGGER AS $$
DECLARE
  v_project_value TEXT;
BEGIN
  IF TG_OP = 'UPDATE'
     AND COALESCE(to_jsonb(NEW)->>TG_ARGV[0], '') = COALESCE(to_jsonb(OLD)->>TG_ARGV[0], '') THEN
    RETURN NEW;
  END IF;

  v_project_value := NULLIF(to_jsonb(NEW)->>TG_ARGV[0], '');
  PERFORM assert_project_is_active(v_project_value, TG_ARGV[1]);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER requests_validate_active_project
  BEFORE INSERT OR UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION validate_active_project_reference('project_value', 'requests');

CREATE TRIGGER manifests_validate_active_project
  BEFORE INSERT OR UPDATE ON manifests
  FOR EACH ROW EXECUTE FUNCTION validate_active_project_reference('project_value', 'manifests');

CREATE TRIGGER transfers_validate_active_project
  BEFORE INSERT OR UPDATE ON transfers
  FOR EACH ROW EXECUTE FUNCTION validate_active_project_reference('project_value', 'transfers');

CREATE TRIGGER purchase_orders_validate_active_project
  BEFORE INSERT OR UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION validate_active_project_reference('project_value', 'purchase orders');

CREATE TRIGGER receipts_validate_active_project
  BEFORE INSERT OR UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION validate_active_project_reference('project_value', 'receipts');

CREATE TRIGGER inventory_validate_active_project
  BEFORE INSERT OR UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION validate_active_project_reference('project_value', 'inventory');


-- --------------------------------------------------------
-- PROJECT CLOSE / REOPEN LIFECYCLE
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION close_project(p_project_value TEXT, p_close_notes TEXT DEFAULT '')
RETURNS JSON AS $$
DECLARE
  v_role TEXT;
  v_username TEXT;
  v_project_status TEXT;
  v_project_label TEXT;
  v_location_value TEXT;
  v_closeout_batch_id TEXT;
  v_affected_count INTEGER;
  v_total_quantity INTEGER;
  v_total_cost NUMERIC(12,2);
  v_open_request_count INTEGER;
  v_open_manifest_count INTEGER;
  v_open_transfer_count INTEGER;
BEGIN
  v_role := get_current_user_role();

  IF v_role NOT IN ('admin', 'projectManager') THEN
    RAISE EXCEPTION 'Only Admins and Project Managers can close projects.';
  END IF;

  SELECT status_value, label, location_value
  INTO v_project_status, v_project_label, v_location_value
  FROM projects
  WHERE value = p_project_value
  FOR UPDATE;

  IF v_project_status IS NULL THEN
    RAISE EXCEPTION 'Project % does not exist.', p_project_value;
  END IF;

  IF v_project_status = 'closed' THEN
    RAISE EXCEPTION 'Project "%" is already closed.', v_project_label;
  END IF;

  SELECT COUNT(*) INTO v_open_request_count
  FROM requests
  WHERE project_value = p_project_value
    AND status_value NOT IN ('rejected', 'manifested');

  IF v_open_request_count > 0 THEN
    RAISE EXCEPTION 'Project "%" still has open requests and cannot be closed.', v_project_label;
  END IF;

  SELECT COUNT(*) INTO v_open_manifest_count
  FROM manifests m
  WHERE (
      m.project_value = p_project_value
      OR EXISTS (
        SELECT 1
        FROM requests r
        WHERE r.id = m.request_id
          AND r.project_value = p_project_value
      )
      OR EXISTS (
        SELECT 1
        FROM manifest_items mi
        JOIN inventory_items ii ON ii.id = mi.inventory_item_id
        WHERE mi.manifest_id = m.id
          AND ii.project_value = p_project_value
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM transfers t
      WHERE t.manifest_id = m.id
    );

  IF v_open_manifest_count > 0 THEN
    RAISE EXCEPTION 'Project "%" still has manifested inventory awaiting transfer and cannot be closed.', v_project_label;
  END IF;

  SELECT COUNT(*) INTO v_open_transfer_count
  FROM transfers t
  WHERE (
      t.project_value = p_project_value
      OR EXISTS (
        SELECT 1
        FROM requests r
        WHERE r.id = t.request_id
          AND r.project_value = p_project_value
      )
      OR EXISTS (
        SELECT 1
        FROM manifests m
        WHERE m.id = t.manifest_id
          AND (
            m.project_value = p_project_value
            OR EXISTS (
              SELECT 1
              FROM requests r2
              WHERE r2.id = m.request_id
                AND r2.project_value = p_project_value
            )
          )
      )
      OR EXISTS (
        SELECT 1
        FROM transfer_items ti
        JOIN inventory_items ii ON ii.id = ti.inventory_item_id
        WHERE ti.transfer_id = t.id
          AND ii.project_value = p_project_value
      )
    )
    AND t.status_value NOT IN ('completed');

  IF v_open_transfer_count > 0 THEN
    RAISE EXCEPTION 'Project "%" still has in-flight transfers and cannot be closed.', v_project_label;
  END IF;

  v_username := get_current_username();
  v_closeout_batch_id := generate_project_closeout_batch_id();

  SELECT
    COUNT(*),
    COALESCE(SUM(quantity), 0),
    COALESCE(SUM(total_cost), 0)
  INTO
    v_affected_count,
    v_total_quantity,
    v_total_cost
  FROM inventory_items
  WHERE project_value = p_project_value
    AND lifecycle_status = 'active';

  INSERT INTO project_closeout_batches (
    id, project_value, location_value, closed_at, closed_by, close_notes,
    affected_inventory_count, affected_total_quantity, affected_total_cost
  ) VALUES (
    v_closeout_batch_id, p_project_value, v_location_value, now(), v_username, COALESCE(p_close_notes, ''),
    COALESCE(v_affected_count, 0), COALESCE(v_total_quantity, 0), COALESCE(v_total_cost, 0)
  );

  UPDATE inventory_items
  SET lifecycle_status = 'closed_project',
      closed_project_batch_id = v_closeout_batch_id,
      project_closed_at = now()
  WHERE project_value = p_project_value
    AND lifecycle_status = 'active';

  UPDATE projects
  SET status_value = 'closed',
      closed_at = now(),
      closed_by = v_username,
      close_notes = COALESCE(p_close_notes, ''),
      reopened_at = NULL,
      reopened_by = NULL,
      reopen_reason = ''
  WHERE value = p_project_value;

  RETURN json_build_object(
    'projectValue', p_project_value,
    'project', v_project_label,
    'closeoutBatchId', v_closeout_batch_id,
    'affectedInventoryCount', COALESCE(v_affected_count, 0),
    'affectedTotalQuantity', COALESCE(v_total_quantity, 0),
    'affectedTotalCost', COALESCE(v_total_cost, 0),
    'closedBy', v_username,
    'closedAt', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION reopen_project(p_project_value TEXT, p_reopen_reason TEXT)
RETURNS JSON AS $$
DECLARE
  v_role TEXT;
  v_username TEXT;
  v_project_status TEXT;
  v_project_label TEXT;
  v_closed_at TIMESTAMPTZ;
  v_closeout_batch_id TEXT;
  v_restored_count INTEGER;
BEGIN
  IF p_reopen_reason IS NULL OR btrim(p_reopen_reason) = '' THEN
    RAISE EXCEPTION 'A reopen reason is required.';
  END IF;

  v_role := get_current_user_role();

  IF v_role NOT IN ('admin', 'projectManager') THEN
    RAISE EXCEPTION 'Only Admins and Project Managers can reopen projects.';
  END IF;

  SELECT status_value, label, closed_at
  INTO v_project_status, v_project_label, v_closed_at
  FROM projects
  WHERE value = p_project_value
  FOR UPDATE;

  IF v_project_status IS NULL THEN
    RAISE EXCEPTION 'Project % does not exist.', p_project_value;
  END IF;

  IF v_project_status != 'closed' THEN
    RAISE EXCEPTION 'Only closed projects can be reopened.';
  END IF;

  IF v_closed_at IS NULL OR v_closed_at < (now() - interval '30 days') THEN
    RAISE EXCEPTION 'Project "%" is outside the 30-day reopen window.', v_project_label;
  END IF;

  SELECT id
  INTO v_closeout_batch_id
  FROM project_closeout_batches
  WHERE project_value = p_project_value
    AND reopened_at IS NULL
  ORDER BY closed_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_closeout_batch_id IS NULL THEN
    RAISE EXCEPTION 'No unreopened closeout batch was found for project "%".', v_project_label;
  END IF;

  v_username := get_current_username();

  UPDATE inventory_items
  SET lifecycle_status = 'active',
      closed_project_batch_id = NULL,
      project_closed_at = NULL
  WHERE closed_project_batch_id = v_closeout_batch_id
    AND lifecycle_status = 'closed_project';

  GET DIAGNOSTICS v_restored_count = ROW_COUNT;

  UPDATE project_closeout_batches
  SET reopened_at = now(),
      reopened_by = v_username,
      reopen_reason = btrim(p_reopen_reason)
  WHERE id = v_closeout_batch_id;

  UPDATE projects
  SET status_value = 'active',
      reopened_at = now(),
      reopened_by = v_username,
      reopen_reason = btrim(p_reopen_reason)
  WHERE value = p_project_value;

  RETURN json_build_object(
    'projectValue', p_project_value,
    'project', v_project_label,
    'closeoutBatchId', v_closeout_batch_id,
    'restoredInventoryCount', COALESCE(v_restored_count, 0),
    'reopenedBy', v_username,
    'reopenedAt', now()
  );
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


-- SOURCE: 05_rls.sql

-- ============================================================
-- MEC2 Inventory Management System â€” Row Level Security
-- ============================================================
-- Run order: 05 (after everything else)
-- RLS is a safety net â€” the frontend permissions.js is the
-- primary UI gate. RLS blocks unauthorized operations even if
-- someone bypasses the frontend.
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
ALTER TABLE purchase_orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_attachments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_item_serials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_closeout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_user_assignments ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------------------
-- LOCATIONS (admin-only writes)
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
-- PROJECTS (admin + project manager writes)
-- --------------------------------------------------------
CREATE POLICY "projects_select" ON projects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "projects_insert" ON projects
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

CREATE POLICY "projects_update" ON projects
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

CREATE POLICY "projects_delete" ON projects
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));


-- --------------------------------------------------------
-- PROJECT CLOSEOUTS (admin + project manager read)
-- --------------------------------------------------------
CREATE POLICY "project_closeout_batches_select" ON project_closeout_batches
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

CREATE POLICY "project_closeout_batches_insert" ON project_closeout_batches
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

CREATE POLICY "project_closeout_batches_update" ON project_closeout_batches
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));


-- --------------------------------------------------------
-- PROJECT USER ASSIGNMENTS (admin + project manager read/write)
-- --------------------------------------------------------
CREATE POLICY "project_user_assignments_select" ON project_user_assignments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

CREATE POLICY "project_user_assignments_insert" ON project_user_assignments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

CREATE POLICY "project_user_assignments_update" ON project_user_assignments
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

CREATE POLICY "project_user_assignments_delete" ON project_user_assignments
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));



-- --------------------------------------------------------
-- PROFILES (read all, update own, admin manages all)
-- --------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_delete" ON profiles;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR is_current_user_admin()
    OR can_current_user_read_project_assignment_profiles()
  );

CREATE POLICY "profiles_admin_update" ON profiles
  FOR UPDATE TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

CREATE POLICY "profiles_admin_insert" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (is_current_user_admin());

CREATE POLICY "profiles_admin_delete" ON profiles
  FOR DELETE TO authenticated
  USING (is_current_user_admin());


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

-- No UPDATE or DELETE policies â€” audit log is immutable

-- --------------------------------------------------------
-- PURCHASE ORDERS
-- --------------------------------------------------------
CREATE POLICY "purchase_orders_select" ON purchase_orders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "purchase_orders_insert" ON purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'projectManager')
  ));

CREATE POLICY "purchase_orders_update" ON purchase_orders
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'projectManager')
  ));


-- --------------------------------------------------------
-- PURCHASE ORDER ITEMS
-- --------------------------------------------------------
CREATE POLICY "purchase_order_items_select" ON purchase_order_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "purchase_order_items_insert" ON purchase_order_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'projectManager')
  ));

CREATE POLICY "purchase_order_items_update" ON purchase_order_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'projectManager')
  ));

CREATE POLICY "purchase_order_items_delete" ON purchase_order_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'projectManager')
  ));


-- --------------------------------------------------------
-- RECEIPTS
-- --------------------------------------------------------
CREATE POLICY "receipts_select" ON receipts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "receipts_insert" ON receipts
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));


-- --------------------------------------------------------
-- RECEIPT ITEMS
-- --------------------------------------------------------
CREATE POLICY "receipt_items_select" ON receipt_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "receipt_items_insert" ON receipt_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));


-- --------------------------------------------------------
-- RECEIPT ATTACHMENTS
-- --------------------------------------------------------
CREATE POLICY "receipt_attachments_select" ON receipt_attachments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "receipt_attachments_insert" ON receipt_attachments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "receipt_attachments_update" ON receipt_attachments
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));


-- --------------------------------------------------------
-- RECEIPT ITEM SERIALS
-- --------------------------------------------------------
CREATE POLICY "receipt_item_serials_select" ON receipt_item_serials
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "receipt_item_serials_insert" ON receipt_item_serials
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "receipt_item_serials_update" ON receipt_item_serials
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));


-- SOURCE: 06_security_fixes.sql

-- ============================================================
-- MEC2 Inventory Management System â€” Security Fixes
-- ============================================================
-- Fixes Supabase linter warnings:
--   1. Views: add security_invoker = true (so RLS applies to querying user)
--   2. Functions: add SET search_path = public (prevent search path injection)
-- ============================================================


-- --------------------------------------------------------
-- FIX 1: VIEWS â€” Enable security_invoker
-- --------------------------------------------------------
-- Without this, views bypass RLS and use the view creator's permissions.

ALTER VIEW inventory_view SET (security_invoker = true);
ALTER VIEW requests_view SET (security_invoker = true);
ALTER VIEW manifests_view SET (security_invoker = true);
ALTER VIEW transfers_view SET (security_invoker = true);


-- --------------------------------------------------------
-- FIX 2: FUNCTIONS â€” Set search_path = public
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
      RAISE EXCEPTION 'Cannot create manifest â€” request % is not approved (current status: %).', NEW.request_id, v_request_status;
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
      RAISE EXCEPTION 'Cannot create transfer â€” manifest % is not finalized (current status: %).', NEW.manifest_id, v_manifest_status;
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


-- SOURCE: 07_fix_profiles_rls.sql

-- Fix profiles RLS without relying on user-editable metadata.
-- The original hotfix switched to auth.jwt()->user_metadata.role, which
-- removes recursion but creates a privilege-escalation risk because
-- user_metadata is editable by end users.
--
-- Final approach:
-- - use a SECURITY DEFINER helper (is_current_user_admin)
-- - allow users to read only their own profile
-- - allow only admins to insert/update/delete profiles directly

DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_delete" ON profiles;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR is_current_user_admin()
    OR can_current_user_read_project_assignment_profiles()
  );

CREATE POLICY "profiles_admin_update" ON profiles
  FOR UPDATE TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

CREATE POLICY "profiles_admin_insert" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (is_current_user_admin());

CREATE POLICY "profiles_admin_delete" ON profiles
  FOR DELETE TO authenticated
  USING (is_current_user_admin());


-- SOURCE: seed.sql

-- ============================================================
-- MEC2 Inventory Management System â€” Seed Data
-- ============================================================
-- Run this AFTER schema.sql in the Supabase SQL Editor.
-- Populates the database with demo data matching the frontend
-- mock data files.
--
-- NOTE: Demo auth users must be created separately via the
-- Supabase dashboard or auth API (see bottom of this file).
-- ============================================================


-- ============================================================
-- 0. DISABLE ROLE VALIDATION TRIGGERS FOR SEEDING
-- ============================================================
-- The role validation triggers check auth.uid() which doesn't
-- exist when running SQL directly. Disable them for seeding,
-- re-enable at the end.

ALTER TABLE manifests DISABLE TRIGGER manifests_validate_role;
ALTER TABLE transfers DISABLE TRIGGER transfers_validate_role;
ALTER TABLE inventory_adjustments DISABLE TRIGGER adjustments_validate_role;


-- ============================================================
-- 1. LOCATIONS
-- ============================================================

INSERT INTO locations (
  value, label, type,
  address_line_1, address_line_2, city, state, postal_code,
  poc_name, poc_phone, poc_email
) VALUES
  ('WH-A', 'Warehouse A',    'warehouse', '101 Industrial Way', '',               'Dallas',     'TX', '75201', 'Morgan Lee',   '214-555-0101', 'morgan.lee@coolsys.com'),
  ('WH-B', 'Warehouse B',    'warehouse', '245 Service Road',  'Suite 4',        'Fort Worth', 'TX', '76102', 'Avery Carter', '817-555-0112', 'avery.carter@coolsys.com'),
  ('WH-C', 'Warehouse C',    'warehouse', '78 Logistics Ave',  '',               'Arlington',  'TX', '76010', 'Jordan Price', '682-555-0188', 'jordan.price@coolsys.com'),
  ('SG',   'South Garage',   'site',      '8900 South Loop',   'Trailer Office', 'Dallas',     'TX', '75215', 'Taylor Nguyen','214-555-0134', 'taylor.nguyen@coolsys.com'),
  ('WT',   'West Tower',     'site',      '500 Commerce St',   'Floor 3',        'Fort Worth', 'TX', '76104', 'Riley Brooks', '817-555-0146', 'riley.brooks@coolsys.com'),
  ('CO',   'Central Office', 'site',      '1200 Main Street',  '',               'Dallas',     'TX', '75202', 'Casey Morgan', '214-555-0157', 'casey.morgan@coolsys.com'),
  ('NA',   'North Annex',    'site',      '3100 North Avenue', 'Building B',     'Plano',      'TX', '75074', 'Jamie Flores', '972-555-0169', 'jamie.flores@coolsys.com');


-- ============================================================
-- 2. PROJECTS
-- ============================================================

INSERT INTO projects (value, label, location_value) VALUES
  ('WH-A-001', 'Warehouse A - Inventory',        'WH-A'),
  ('WH-B-001', 'Warehouse B - Inventory',        'WH-B'),
  ('WH-C-001', 'Warehouse C - Inventory',        'WH-C'),
  ('SG-001',   'South Garage - Phase 1',         'SG'),
  ('SG-002',   'South Garage - Rough-In',        'SG'),
  ('WT-001',   'West Tower - Core Buildout',     'WT'),
  ('WT-002',   'West Tower - HVAC Upgrade',      'WT'),
  ('CO-001',   'Central Office - Renovation',    'CO'),
  ('NA-001',   'North Annex - Expansion',        'NA');


-- ============================================================
-- 3. INVENTORY ITEMS
-- ============================================================
-- total_cost is auto-computed by trigger (quantity * unit_cost)

INSERT INTO inventory_items (id, name, sku, quantity, unit, project, project_value, location_value, location_detail, status, category, unit_cost) VALUES
  (1,  'Copper Pipe 3/4"',       'CP-075',  120, 'ft',    'Warehouse Stock',          'WH-A-001', 'WH-A', 'Warehouse A / Rack 3',               'Available',    'Plumbing',   1.21),
  (2,  'Steel Duct Connector',   'SDC-210',  16, 'pcs',   'Warehouse Stock',          'WH-B-001', 'WH-B', 'Warehouse B / Shelf 2',              'Available',    'HVAC',       8.50),
  (3,  'Electrical Conduit 1 in','EC-100',   48, 'pcs',   'Warehouse Stock',          'WH-A-001', 'WH-A', 'Warehouse A / Rack 1',               'Reserved',     'Electrical', 12.75),
  (4,  'Air Diffuser 24x24',     'AD-2424',  22, 'pcs',   'Warehouse Stock',          'WH-C-001', 'WH-C', 'Warehouse C / Bay 4',                'Available',    'HVAC',      42.00),
  (5,  'Ball Valve 2 in',        'BV-200',    7, 'pcs',   'Warehouse Stock',          'WH-A-001', 'WH-A', 'Warehouse A / Bin 8',                'Low Stock',    'Plumbing',  31.50),
  (6,  'Breaker Panel 200A',     'BP-200A',   9, 'pcs',   'Warehouse Stock',          'WH-C-001', 'WH-C', 'Warehouse C / Secure Cage',          'Available',    'Electrical',185.00),
  (7,  'Flexible Duct 8 in',     'FD-800',    0, 'rolls', 'Warehouse Stock',          'WH-B-001', 'WH-B', 'Warehouse B / Rack 6',               'Out of Stock', 'HVAC',      56.00),
  (8,  'Threaded Rod 1/2 in',    'TR-050',   85, 'pcs',   'Warehouse Stock',          'WH-A-001', 'WH-A', 'Warehouse A / Rack 5',               'Available',    'Hardware',    2.10),
  (9,  'Copper Elbow 3/4 in',    'CE-075',   12, 'pcs',   'South Garage - Phase 1',   'SG-001',   'SG',   'South Garage / Storage Container',   'Available',    'Plumbing',   4.25),
  (10, 'Lighting Control Panel', 'LCP-01',    1, 'pcs',   'West Tower - Core Buildout','WT-001',  'WT',   'West Tower / Electrical Room',       'Available',    'Electrical',950.00),
  (11, 'VAV Box',                'VAV-440',   2, 'pcs',   'Central Office - Renovation','CO-001',  'CO',   'In Transit',                         'In Transit',   'HVAC',     225.00);

-- Reset the auto-increment sequence to continue after our manual IDs
SELECT setval('inventory_items_id_seq', 11);


-- ============================================================
-- 4. REQUESTS
-- ============================================================

INSERT INTO requests (id, status_value, location_value, location_type, project_value, requested_by, created_at, needed_by_date, priority_value, source_warehouse_value, delivery_location_text, notes, approved_by, approved_at, rejected_by, rejected_at, approval_notes) VALUES
  ('RQ-1001', 'pending_approval', 'SG', 'site', 'SG-002', 'logistics_foreman', '2026-03-25T10:15:00', '2026-03-30', 'high',   'WH-A', 'Loading Area',    'Need material for next rough-in phase.', NULL, NULL, NULL, NULL, ''),
  ('RQ-1002', 'approved',         'WT', 'site', 'WT-002', 'logistics_foreman', '2026-03-26T14:30:00', '2026-04-02', 'normal', 'WH-C', 'Dock 2',          'Need before scheduled install window.',  'pm', '2026-03-26T16:05:00', NULL, NULL, 'Approved for scheduled install delivery.'),
  ('RQ-1003', 'rejected',         'CO', 'site', 'CO-001', 'logistics_foreman', '2026-03-27T09:45:00', '2026-04-05', 'urgent', 'WH-A', 'Staging Area 8',  'Send what is available now. Remaining require a new request later.', NULL, NULL, 'pm', '2026-03-27T11:10:00', 'Please split this into separate requests by delivery urgency.'),
  ('RQ-1004', 'approved',         'NA', 'site', 'NA-001', 'logistics_foreman', '2026-03-20T08:10:00', '2026-03-22', 'low',    'WH-B', 'Trailer 1',       '',                                       'pm', '2026-03-20T10:25:00', NULL, NULL, 'Approved for processing.'),
  ('RQ-2001', 'pending_approval', 'SG', 'site', 'SG-001', 'logistics_foreman', '2026-04-06T08:15:00', '2026-04-08', 'urgent', 'WH-A', 'Level 2 Staging', 'Critical materials for install today.',   NULL, NULL, NULL, NULL, ''),
  ('RQ-2002', 'pending_approval', 'WT', 'site', 'WT-001', 'logistics_foreman', '2026-04-05T11:40:00', '2026-04-09', 'high',   'WH-C', 'Dock 1',          'Prep for upcoming mechanical install.',  NULL, NULL, NULL, NULL, ''),
  ('RQ-2003', 'pending_approval', 'CO', 'site', 'CO-001', 'logistics_foreman', '2026-04-04T09:25:00', '2026-04-12', 'normal', 'WH-B', 'Storage Room B',  'General material replenishment.',        NULL, NULL, NULL, NULL, ''),
  ('RQ-2004', 'pending_approval', 'NA', 'site', 'NA-001', 'logistics_foreman', '2026-04-03T14:10:00', '2026-04-07', 'urgent', 'WH-A', 'Trailer 3',       'Install blocked until delivered.',        NULL, NULL, NULL, NULL, ''),
  ('RQ-2005', 'pending_approval', 'SG', 'site', 'SG-002', 'logistics_foreman', '2026-04-02T10:30:00', '2026-04-10', 'high',   'WH-A', 'Loading Area',    '',                                       NULL, NULL, NULL, NULL, ''),
  ('RQ-2006', 'pending_approval', 'WT', 'site', 'WT-002', 'logistics_foreman', '2026-04-01T15:20:00', '2026-04-15', 'low',    'WH-C', 'Mechanical Room',  'Non-urgent restock.',                    NULL, NULL, NULL, NULL, ''),
  ('RQ-2007', 'pending_approval', 'CO', 'site', 'CO-001', 'logistics_foreman', '2026-04-06T07:10:00', '2026-04-08', 'urgent', 'WH-B', 'Floor 3',          'Needed for inspection readiness.',       NULL, NULL, NULL, NULL, ''),
  ('RQ-2008', 'pending_approval', 'NA', 'site', 'NA-001', 'logistics_foreman', '2026-04-05T13:45:00', '2026-04-11', 'normal', 'WH-B', 'Staging Area',     '',                                      NULL, NULL, NULL, NULL, '');


-- ============================================================
-- 5. REQUEST ITEMS
-- ============================================================

-- RQ-1001
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-1001', 1, 80),
  ('RQ-1001', 5, 10),
  ('RQ-1001', 8, 25);

-- RQ-1002
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-1002', 7, 12),
  ('RQ-1002', 4, 6);

-- RQ-1003
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-1003', 6, 4),
  ('RQ-1003', 7, 5);

-- RQ-1004
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-1004', 1, 20);

-- RQ-2001
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2001', 1, 60),
  ('RQ-2001', 5, 12);

-- RQ-2002
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2002', 4, 8),
  ('RQ-2002', 6, 3);

-- RQ-2003
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2003', 7, 15);

-- RQ-2004
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2004', 9, 20);

-- RQ-2005
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2005', 3, 30);

-- RQ-2006
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2006', 8, 10);

-- RQ-2007
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2007', 10, 2);

-- RQ-2008
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2008', 6, 4);


-- ============================================================
-- 6. MANIFESTS
-- ============================================================

INSERT INTO manifests (id, manifest_type_value, status_value, request_id, requested_by, approved_by, approved_at, created_by, created_at, manifest_date, location_value, project_value, finalized_by, finalized_at, source_location_value, destination_location_value, destination_detail, notes) VALUES
  ('MO-1001', 'outbound',           'finalized', 'RQ-1002', 'logistics_foreman', 'pm', '2026-03-26T16:05:00', 'warehouse_mgr', '2026-03-30T07:50:00', '2026-03-31', 'WT',  'WT-002', 'warehouse_mgr', '2026-03-30T08:20:00', 'WH-C', 'WT',   'Dock 2', 'Approved request prepared for scheduled install delivery.'),
  ('MO-1002', 'outbound',           'finalized', 'RQ-1004', 'logistics_foreman', 'pm', '2026-03-20T10:25:00', 'warehouse_mgr', '2026-03-20T14:00:00', '2026-03-21', 'NA',  'NA-001', 'warehouse_mgr', '2026-03-20T14:30:00', 'WH-B', 'NA',   'Trailer 1', 'Outbound delivery for North Annex expansion.'),
  ('MW-1001', 'warehouse_transfer', 'finalized', NULL,       '',                  '',   NULL,                  'warehouse_mgr', '2026-03-29T10:05:00', '2026-03-30', NULL,  NULL,     'warehouse_mgr', '2026-03-29T10:30:00', 'WH-A', 'WH-B', '',       'Rebalancing inventory across warehouse locations.'),
  ('MR-1001', 'return',             'finalized', NULL,       '',                  '',   NULL,                  'pm',            '2026-03-28T13:10:00', '2026-03-29', 'SG',  'SG-001', 'warehouse_mgr', '2026-03-28T13:45:00', 'SG',   'WH-A', '',       'Return of unused materials after install phase.');


-- ============================================================
-- 7. MANIFEST ITEMS
-- ============================================================

-- MO-1001
INSERT INTO manifest_items (id, manifest_id, inventory_item_id, manifest_quantity) VALUES
  ('MO-1001-1', 'MO-1001', 7, 12),
  ('MO-1001-2', 'MO-1001', 4, 6);

-- MO-1002 (missing from frontend mock data, referenced by transfer TO-1003)
INSERT INTO manifest_items (id, manifest_id, inventory_item_id, manifest_quantity) VALUES
  ('MO-1002-1', 'MO-1002', 1, 20);

-- MW-1001
INSERT INTO manifest_items (id, manifest_id, inventory_item_id, manifest_quantity) VALUES
  ('MW-1001-1', 'MW-1001', 3, 24),
  ('MW-1001-2', 'MW-1001', 5, 4);

-- MR-1001
INSERT INTO manifest_items (id, manifest_id, inventory_item_id, manifest_quantity) VALUES
  ('MR-1001-1', 'MR-1001', 9, 12),
  ('MR-1001-2', 'MR-1001', 10, 1);


-- ============================================================
-- 8. TRANSFERS
-- ============================================================

INSERT INTO transfers (id, manifest_id, request_id, requested_by, approved_by, approved_at, transfer_type_value, status_value, created_by, created_at, manifest_date, shipped_date, shipped_at, shipped_by, received_date, received_at, received_by, location_value, project_value, source_location_value, destination_location_value, destination_detail, notes, exception_notes) VALUES
  ('TW-1001', 'MW-1001', NULL,      '',                  '',   NULL,                  'warehouse_transfer', 'in_transit', 'warehouse_mgr',  '2026-03-31T09:15:00', '2026-03-30', '2026-03-31', '2026-03-31T09:15:00', 'warehouse_mgr',  NULL,         NULL,                  NULL,  NULL,    NULL,    'WH-A', 'WH-B', '',          'Rebalance stock between warehouse locations.', ''),
  ('TR-1001', 'MR-1001', NULL,      '',                  '',   NULL,                  'return',             'completed',  'warehouse_mgr',  '2026-03-29T14:10:00', '2026-03-29', '2026-03-29', '2026-03-29T14:10:00', 'warehouse_mgr',  '2026-03-30', '2026-03-30T08:40:00', 'warehouse_mgr', 'SG', 'SG-001', 'SG',   'WH-A', '',          'Unused material returned from job site.', '1 fitting missing from expected return count.'),
  ('TO-1002', 'MO-1001', 'RQ-1002', 'logistics_foreman', 'pm', '2026-03-26T16:05:00', 'outbound',           'exception',  'logistics_assoc', '2026-04-01T07:55:00', '2026-04-01', '2026-04-01', '2026-04-01T07:55:00', 'logistics_assoc', '2026-04-01', '2026-04-01T12:20:00', 'logistics_assoc', 'WT', 'WT-002', 'WH-C', 'WT',   'Dock 2',    'Outbound delivery for scheduled install window.', 'Short delivery confirmed at site.'),
  ('TO-1003', 'MO-1002', 'RQ-1004', 'logistics_foreman', 'pm', '2026-03-20T10:25:00', 'outbound',           'completed',  'logistics_assoc', '2026-03-21T10:05:00', '2026-03-21', '2026-03-21', '2026-03-21T10:05:00', 'logistics_assoc', '2026-03-21', '2026-03-21T13:20:00', 'logistics_assoc', 'NA', 'NA-001', 'WH-B', 'NA',   'Trailer 1', 'Delivered and received in full.', '');


-- ============================================================
-- 9. TRANSFER ITEMS
-- ============================================================

-- TW-1001
INSERT INTO transfer_items (id, transfer_id, inventory_item_id, manifest_quantity, shipped_quantity, received_quantity, variance_reason) VALUES
  ('TW-1001-1', 'TW-1001', 3, 24, 24, NULL, ''),
  ('TW-1001-2', 'TW-1001', 5,  4,  4, NULL, '');

-- TR-1001
INSERT INTO transfer_items (id, transfer_id, inventory_item_id, manifest_quantity, shipped_quantity, received_quantity, variance_reason) VALUES
  ('TR-1001-1', 'TR-1001', 9,  12, 12, 11, '1 missing during site pullback.'),
  ('TR-1001-2', 'TR-1001', 10,  1,  1,  1, '');

-- TO-1002
INSERT INTO transfer_items (id, transfer_id, inventory_item_id, manifest_quantity, shipped_quantity, received_quantity, variance_reason) VALUES
  ('TO-1002-1', 'TO-1002', 4, 6, 6, 5, '1 unit missing at delivery.'),
  ('TO-1002-2', 'TO-1002', 6, 2, 2, 2, '');

-- TO-1003
INSERT INTO transfer_items (id, transfer_id, inventory_item_id, manifest_quantity, shipped_quantity, received_quantity, variance_reason) VALUES
  ('TO-1003-1', 'TO-1003', 1, 20, 20, 20, '');


-- ============================================================
-- 9B. RESERVATION RECALC
-- ============================================================
-- Seed inserts some manifests and transfers directly, so recalculate
-- current reservations after all workflow rows exist.

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


-- ============================================================
-- 10. DEMO USER SETUP
-- ============================================================
-- Auth users can't be created via SQL INSERT (Supabase manages
-- auth.users internally). Create these via the Supabase dashboard
-- or use the auth admin API.
--
-- After creating each user, the handle_new_user() trigger will
-- auto-create their profile row. Pass metadata when creating:
--
--   Email                    | Password | Metadata
--   -------------------------|----------|---------------------------
--   admin@coolsys.com        | admin    | username: admin, name: Admin User, role: admin
--   pm@coolsys.com           | pm       | username: pm, name: Project Manager, role: projectManager
--   wm@coolsys.com           | wm       | username: wm, name: Warehouse Manager, role: warehouseManager
--   la@coolsys.com           | la       | username: la, name: Logistics Associate, role: logisticsAssociate
--   lf@coolsys.com           | lf       | username: lf, name: Logistics Foreman, role: logisticsForeman
--
-- Example using Supabase JS admin client:
--
--   const { data } = await supabase.auth.admin.createUser({
--     email: 'admin@coolsys.com',
--     password: 'admin',
--     email_confirm: true,
--     user_metadata: {
--       username: 'admin',
--       name: 'Admin User',
--       role: 'admin'
--     }
--   })


-- ============================================================
-- 11. RE-ENABLE ROLE VALIDATION TRIGGERS
-- ============================================================

ALTER TABLE manifests ENABLE TRIGGER manifests_validate_role;
ALTER TABLE transfers ENABLE TRIGGER transfers_validate_role;
ALTER TABLE inventory_adjustments ENABLE TRIGGER adjustments_validate_role;


